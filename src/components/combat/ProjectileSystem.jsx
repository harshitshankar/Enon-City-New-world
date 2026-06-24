import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { spawnQueue, requestExplosion } from "../../lib/events";
import { useGameStore, worldState } from "../../store/useGameStore";
import { npcRegistry, vehicleRegistry } from "../../lib/registry";
import { peers, sendHit } from "../../lib/net";

/**
 * ProjectileSystem
 * A fixed pool of projectiles updated manually each frame (no per-projectile
 * React components -> zero GC churn). Bullets fly straight & fast, rockets fly
 * straight w/ smoke trail, arrows arc with gravity. Collisions with the ground,
 * NPCs, vehicles, or distance budget trigger explosions / hit logic.
 */
const POOL = 96;
const TRAIL = 80; // smoke puff pool

const SPEEDS = { pistol: 95, rifle: 120, rocket: 40, bow: 50 };
const GRAVITY = { pistol: 0, rifle: 0, rocket: 0, bow: -16 };
const LIFE = { pistol: 1.4, rifle: 1.4, rocket: 3.2, bow: 3.5 };
const EXPLOSIVE = { pistol: false, rifle: false, rocket: true, bow: true };
// per-hit damage to NPCs / vehicles. Bumped so small arms can actually wreck a
// 100-HP car in a reasonable number of hits (pistol ~5, rifle ~6) instead of
// needing a full clip + reload. Rockets/arrows were already lethal.
const DMG = { pistol: 22, rifle: 16, rocket: 120, bow: 70 };
// per-hit damage to other human players (PvP) — tuned for a snappy TTK at 100 HP.
// Pistol ~5 hits, rifle ~7 hits — easy to secure a kill even with 15 Hz net lag.
const PLAYER_DMG = { pistol: 20, rifle: 15, rocket: 110, bow: 60 };
// render category: pistol & rifle render as tracers
const RENDER = { pistol: "bullet", rifle: "bullet", rocket: "rocket", bow: "arrow" };

/**
 * Segment-vs-sphere intersection.
 * Returns the parameter t in [0,1] of the closest hit along segment A->B against
 * a sphere at (cx,cy,cz), or -1 if no hit. R2 is the squared radius.
 * Robust against fast-moving projectiles (no tunneling).
 */
function segSphereT(a, b, cx, cy, cz, R2) {
  // ray origin A, direction d = B - A
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 === 0) {
    // degenerate point segment — just test A
    const ex = a.x - cx, ey = a.y - cy, ez = a.z - cz;
    return ex * ex + ey * ey + ez * ez <= R2 ? 0 : -1;
  }
  // vector from A to sphere centre
  const ex = cx - a.x, ey = cy - a.y, ez = cz - a.z;
  // project onto ray (unclamped)
  let t = (ex * dx + ey * dy + ez * dz) / len2;
  // closest point on the *line*; clamp to the segment
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const px = a.x + dx * t - cx;
  const py = a.y + dy * t - cy;
  const pz = a.z + dz * t - cz;
  const dist2 = px * px + py * py + pz * pz;
  if (dist2 > R2) return -1;
  // We have a hit. If the closest point is inside the sphere we still want the
  // entry t: solve quadratic for actual intersection to report the FIRST contact.
  // back-project: distance from centre to line = sqrt(dist2); half-chord:
  const thc = Math.sqrt(Math.max(0, R2 - dist2) / len2);
  let tHit = t - thc;
  if (tHit < 0) tHit = t; // origin already inside the sphere
  return tHit >= 0 && tHit <= 1 ? tHit : -1;
}

export default function ProjectileSystem() {
  const bulletRef = useRef();
  const bulletGlowRef = useRef();
  const rocketRef = useRef();
  const arrowRef = useRef();
  const trailRef = useRef();

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const hidden = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, -999, 0);
    o.scale.set(0.001, 0.001, 0.001);
    o.updateMatrix();
    return o.matrix.clone();
  }, []);

  // Pool arrays
  const pool = useRef(
    Array.from({ length: POOL }, () => ({
      active: false,
      type: "pistol",
      pos: new THREE.Vector3(),
      prevPos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      life: 0,
      idx: { pistol: -1, rocket: -1, arrow: -1 },
    }))
  );
  const trails = useRef(
    Array.from({ length: TRAIL }, () => ({
      active: false,
      pos: new THREE.Vector3(),
      life: 0,
      max: 0.6,
    }))
  );

  const q = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const tmpDir = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, rawDelta) => {
    const ts = useGameStore.getState().timeScale;
    const delta = Math.min(rawDelta, 0.05) * ts;

    /* ---- drain spawn queue ---- */
    while (spawnQueue.projectiles.length) {
      const req = spawnQueue.projectiles.shift();
      const slot = pool.current.find((p) => !p.active);
      if (!slot) break;
      slot.active = true;
      slot.type = req.type;
      slot.pos.set(req.pos[0], req.pos[1], req.pos[2]);
      slot.prevPos.copy(slot.pos); // start with no movement to avoid self-hit
      const sp = SPEEDS[req.type];
      slot.vel.set(req.dir[0], req.dir[1], req.dir[2]).normalize().multiplyScalar(sp);
      slot.life = LIFE[req.type];
    }

    /* ---- counters for instanced meshes ---- */
    let bi = 0;
    let ri = 0;
    let ai = 0;

    const bm = bulletRef.current;
    const bgm = bulletGlowRef.current;
    const rm = rocketRef.current;
    const am = arrowRef.current;
    const tm = trailRef.current;

    for (const p of pool.current) {
      if (!p.active) continue;
      // integrate: remember previous position FIRST so we can do a swept test
      // (segment prevPos -> pos) against targets. This is what lets fast bullets
      // reliably hit NPCs instead of tunnelling through them between frames.
      p.prevPos.copy(p.pos);
      p.vel.y += GRAVITY[p.type] * delta;
      p.pos.addScaledVector(p.vel, delta);
      p.life -= delta;

      let hit = false;
      let hitPos = null;

      // ground / world bottom
      if (p.pos.y <= 0.15) {
        hit = true;
        hitPos = p.pos.clone();
        hitPos.y = 0.2;
      }

      const dmg = DMG[p.type] || 10;

      // NPC proximity collision — SWEPT segment-vs-sphere test.
      // The segment is the bullet's travel this frame; the sphere is centred at
      // the NPC torso (foot y + 1). This catches fast bullets regardless of FPS.
      // A cheap squared-distance broad-phase skips NPCs nowhere near the bullet's
      // path (the big win: 90 peds -> usually <6 tested per bullet per frame).
      if (!hit) {
        // bullet's midpoint this frame — the centre of its travel segment
        const mx = (p.prevPos.x + p.pos.x) * 0.5;
        const mz = (p.prevPos.z + p.pos.z) * 0.5;
        // max reach from the midpoint = half segment + hit radius (+ slack)
        const reach = 0.5 * Math.hypot(p.pos.x - p.prevPos.x, p.pos.z - p.prevPos.z) + 4;
        const reach2 = reach * reach;
        for (const npc of npcRegistry.values()) {
          if (!npc.alive) continue;
          const np = npc.getPos(tmpDir);
          // broad phase: skip if clearly outside the segment's reach
          const ddx = np.x - mx, ddz = np.z - mz;
          if (ddx * ddx + ddz * ddz > reach2) continue;
          // sphere centre = torso, radius generous so hits feel fair (~1.5u)
          const cx = np.x, cy = np.y + 1, cz = np.z;
          const R = 1.5;
          const t = segSphereT(p.prevPos, p.pos, cx, cy, cz, R * R);
          if (t >= 0 && t <= 1) {
            hit = true;
            // hit point = lerp(prev, cur, t) for accurate explosion placement
            hitPos = new THREE.Vector3().lerpVectors(p.prevPos, p.pos, t);
            npc.onHit?.(dmg, [p.vel.x, p.vel.y, p.vel.z]);
            useGameStore.getState().addScore(25);
            break;
          }
        }
      }
      // PEER (human player) collision — same swept segSphereT test as NPCs,
      // centred on the peer's torso (foot y + 1). This is the PvP hit detection:
      // your bullets now hit other players instead of passing through them. The
      // hit is reported to the victim over the net (sendHit), and the shooter
      // counts the kill locally when this bullet is the lethal one.
      //
      // Network lag compensation: the hit sphere is generous (R=2.2) because
      // peer.pos is only updated at ~15 Hz (~66ms lag). At running speed (9 m/s)
      // the real position can be up to ~0.6 m ahead of where the server last
      // reported. A large radius ensures shots that LOOK like hits on screen
      // actually register as hits.
      if (!hit) {
        const pdmg = PLAYER_DMG[p.type] || 15;
        const R_PEER = 2.6; // generous hit radius for network-synced positions
        for (const id in peers) {
          const peer = peers[id];
          if (!peer || peer.health <= 0) continue;
          const cx = peer.pos[0] || 0;
          const cy = (peer.pos[1] || 0) + 1; // torso height
          const cz = peer.pos[2] || 0;
          const R = R_PEER;
          const t = segSphereT(p.prevPos, p.pos, cx, cy, cz, R * R);
          if (t >= 0 && t <= 1) {
            const st = useGameStore.getState();
            // Friendly fire off in team mode: skip allies. Guard against
            // undefined team (e.g. peer hasn't received the start roster yet)
            // by only blocking when BOTH sides have a valid, matching team.
            const me = st.team;
            const them = peer.team;
            const ally = me && them && me === them;
            if (ally) continue; // pass through teammates — don't stop the bullet
            hit = true;
            hitPos = new THREE.Vector3().lerpVectors(p.prevPos, p.pos, t);
            // Report the hit to the victim over the net so their health drops.
            sendHit(peer.id, pdmg);
            // Optimistically decrement the victim's health LOCALLY so subsequent
            // hits can detect a lethal blow. The shooter's `peers[].health` was
            // never updated before (only the victim's own store moved), so the
            // lethal check below always saw the stale 100-HP value and kills
            // almost never credited. Clamp at 0; the next real `state` packet
            // from the victim reconciles this.
            peer.health = Math.max(0, (peer.health || 100) - pdmg);
            st.addScore(25);
            // Always bump the hit flash so the crosshair gives feedback — this
            // is the ONLY visual cue the shooter gets that their shot landed.
            st.registerHit();
            // Lethal hit: the shooter credits the kill immediately.
            if (peer.health <= 0) {
              st.addKill();
              st.addTeamKill();
            }
            break;
          }
        }
      }

      // Vehicle collision — SWEPT segment-vs-cylinder (horizontal radius + Y window).
      if (!hit) {
        const mx = (p.prevPos.x + p.pos.x) * 0.5;
        const mz = (p.prevPos.z + p.pos.z) * 0.5;
        const reach = 0.5 * Math.hypot(p.pos.x - p.prevPos.x, p.pos.z - p.prevPos.z) + 6;
        const reach2 = reach * reach;
        for (const v of vehicleRegistry.values()) {
          if (v.destroyed && v.destroyed()) continue;
          const vp = v.getPos(tmpDir);
          // broad phase: skip vehicles nowhere near the segment
          const ddx = vp.x - mx, ddz = vp.z - mz;
          if (ddx * ddx + ddz * ddz > reach2) continue;
          // sample points along the segment against the car's hit volume.
          // Generous radius (3.2 = 10.24 sq) so bullets reliably connect with
          // the 2x4.2 car body. The Y window covers wheels to roof.
          const stepCount = 4;
          for (let s = 0; s <= stepCount; s++) {
            const tt = s / stepCount;
            const sx = p.prevPos.x + (p.pos.x - p.prevPos.x) * tt;
            const sy = p.prevPos.y + (p.pos.y - p.prevPos.y) * tt;
            const sz = p.prevPos.z + (p.pos.z - p.prevPos.z) * tt;
            const d = (vp.x - sx) ** 2 + (vp.z - sz) ** 2;
            const dy = vp.y + 0.6 - sy;
            if (d < 10.5 && dy > -1.6 && dy < 2.0) {
              hit = true;
              hitPos = new THREE.Vector3(sx, sy, sz);
              // Always bump hit feedback so the shooter sees the shot connect.
              useGameStore.getState().registerHit();
              v.onHit?.(dmg);
              break;
            }
          }
          if (hit) break;
        }
      }

      if (p.life <= 0 && !hit) {
        hit = true;
        hitPos = p.pos.clone();
      }

      if (hit) {
        p.active = false;
        if (EXPLOSIVE[p.type] && hitPos) {
          requestExplosion({
            pos: [hitPos.x, hitPos.y, hitPos.z],
            scale: p.type === "rocket" ? 1.4 : 1.0,
          });
        }
        continue;
      }

      // rocket smoke trail (spawn puffs)
      if (p.type === "rocket") {
        const t = trails.current.find((x) => !x.active);
        if (t) {
          t.active = true;
          t.pos.copy(p.pos);
          t.life = 0;
          t.max = 0.6;
        }
      }

      // write instance matrix
      tmpDir.copy(p.vel).normalize();
      q.setFromUnitVectors(up, tmpDir);
      const cat = RENDER[p.type];

      if (cat === "bullet" && bm) {
        dummy.position.copy(p.pos);
        dummy.quaternion.copy(q);
        // rifle tracers a touch longer
        dummy.scale.set(1, p.type === "rifle" ? 1.6 : 1, 1);
        dummy.updateMatrix();
        bm.setMatrixAt(bi, dummy.matrix);
        // additive glow halo shares the same transform (slightly larger geo).
        if (bgm) bgm.setMatrixAt(bi, dummy.matrix);
        bi++;
      } else if (cat === "rocket" && rm) {
        dummy.position.copy(p.pos);
        dummy.quaternion.copy(q);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        rm.setMatrixAt(ri++, dummy.matrix);
      } else if (cat === "arrow" && am) {
        dummy.position.copy(p.pos);
        dummy.quaternion.copy(q);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        am.setMatrixAt(ai++, dummy.matrix);
      }
    }

    // hide unused bullet/rocket/arrow instances
    if (bm) {
      for (let i = bi; i < POOL; i++) bm.setMatrixAt(i, hidden);
      bm.count = POOL;
      bm.instanceMatrix.needsUpdate = true;
    }
    if (bgm) {
      for (let i = bi; i < POOL; i++) bgm.setMatrixAt(i, hidden);
      bgm.count = POOL;
      bgm.instanceMatrix.needsUpdate = true;
    }
    if (rm) {
      for (let i = ri; i < POOL; i++) rm.setMatrixAt(i, hidden);
      rm.count = POOL;
      rm.instanceMatrix.needsUpdate = true;
    }
    if (am) {
      for (let i = ai; i < POOL; i++) am.setMatrixAt(i, hidden);
      am.count = POOL;
      am.instanceMatrix.needsUpdate = true;
    }

    /* ---- update smoke trail puffs ---- */
    let ti = 0;
    if (tm) {
      for (const t of trails.current) {
        if (!t.active) continue;
        t.life += delta;
        if (t.life >= t.max) {
          t.active = false;
          continue;
        }
        const k = t.life / t.max;
        dummy.position.copy(t.pos);
        dummy.position.y += k * 0.6;
        dummy.quaternion.identity();
        const s = 0.3 + k * 1.1;
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        tm.setMatrixAt(ti++, dummy.matrix);
      }
      for (let i = ti; i < TRAIL; i++) tm.setMatrixAt(i, hidden);
      tm.count = TRAIL;
      tm.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* bullets: bright glowing tracers */}
      <instancedMesh ref={bulletRef} args={[undefined, undefined, POOL]} frustumCulled={false}>
        <capsuleGeometry args={[0.13, 1.3, 4, 8]} />
        <meshBasicMaterial color="#fff6a8" toneMapped={false} transparent opacity={0.95} />
      </instancedMesh>
      {/* additive tracer glow halo (slightly larger, transparent) */}
      <instancedMesh ref={bulletGlowRef} args={[undefined, undefined, POOL]} frustumCulled={false}>
        <capsuleGeometry args={[0.24, 1.6, 4, 8]} />
        <meshBasicMaterial color="#ffcc4a" toneMapped={false} transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} />
      </instancedMesh>

      {/* rockets: low-poly cones */}
      <instancedMesh ref={rocketRef} args={[undefined, undefined, POOL]} frustumCulled={false}>
        <coneGeometry args={[0.18, 0.7, 7]} />
        <meshStandardMaterial color="#d24a2a" emissive="#ff7a3c" emissiveIntensity={0.6} flatShading />
      </instancedMesh>

      {/* arrows: pointed cylinders */}
      <instancedMesh ref={arrowRef} args={[undefined, undefined, POOL]} frustumCulled={false}>
        <cylinderGeometry args={[0.04, 0.04, 0.9, 6]} />
        <meshStandardMaterial color="#6fae4f" emissive="#7CFF6B" emissiveIntensity={0.4} flatShading />
      </instancedMesh>

      {/* smoke trail puffs */}
      <instancedMesh ref={trailRef} args={[undefined, undefined, TRAIL]} frustumCulled={false}>
        <sphereGeometry args={[0.5, 6, 6]} />
        <meshBasicMaterial color="#8a8a8a" transparent opacity={0.35} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}
