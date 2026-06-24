import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { registerNPC } from "../../lib/registry";
import { useGameStore, worldState } from "../../store/useGameStore";
import { HALF, BLOCK, GRID } from "../world/World";

/**
 * NPCManager — lightweight pedestrians on a single set of InstancedMeshes
 * (body + head + 2 legs). State machine: wander -> panic -> ragdoll -> dead.
 * Peds spawn & wander near sidewalk lines so the city feels alive but ordered.
 */
const COUNT = 90;
const STATE = { WANDER: 0, PANIC: 1, RAGDOLL: 2, DEAD: 3 };

// Pleasant clothing palette
const PALETTE = [
  "#e23b5a", "#3b9ae2", "#2ec27a", "#e2a13b", "#9b59ff",
  "#ff6ec7", "#27c2c2", "#f5f0e8", "#5a6acf", "#ff8a3c",
];

function sidewalkSpawn() {
  // pick a random block edge (sidewalk band) to spawn on
  const gx = Math.floor(Math.random() * GRID);
  const gz = Math.floor(Math.random() * GRID);
  const cx = -HALF + gx * BLOCK + BLOCK / 2;
  const cz = -HALF + gz * BLOCK + BLOCK / 2;
  const band = (BLOCK - 9) / 2;
  // place on one of four edges
  const edge = Math.floor(Math.random() * 4);
  if (edge === 0) return [cx + (Math.random() - 0.5) * band * 1.6, cz + band];
  if (edge === 1) return [cx + (Math.random() - 0.5) * band * 1.6, cz - band];
  if (edge === 2) return [cx + band, cz + (Math.random() - 0.5) * band * 1.6];
  return [cx - band, cz + (Math.random() - 0.5) * band * 1.6];
}

/**
 * Spawn a pedestrian on a sidewalk near the player (within ~2-3 blocks) so that
 * kills are quickly replaced by fresh peds where the action is. Falls back to a
 * fully random sidewalk spawn if the player is out of the grid.
 */
function sidewalkSpawnNear(px, pz) {
  // snap player to nearest block, then pick an adjacent random block
  const gxBase = Math.round((px + HALF) / BLOCK);
  const gzBase = Math.round((pz + HALF) / BLOCK);
  const gx = THREE.MathUtils.clamp(gxBase + Math.floor((Math.random() - 0.5) * 4), 0, GRID - 1);
  const gz = THREE.MathUtils.clamp(gzBase + Math.floor((Math.random() - 0.5) * 4), 0, GRID - 1);
  const cx = -HALF + gx * BLOCK + BLOCK / 2;
  const cz = -HALF + gz * BLOCK + BLOCK / 2;
  const band = (BLOCK - 9) / 2;
  const edge = Math.floor(Math.random() * 4);
  if (edge === 0) return [cx + (Math.random() - 0.5) * band * 1.6, cz + band];
  if (edge === 1) return [cx + (Math.random() - 0.5) * band * 1.6, cz - band];
  if (edge === 2) return [cx + band, cz + (Math.random() - 0.5) * band * 1.6];
  return [cx - band, cz + (Math.random() - 0.5) * band * 1.6];
}

export default function NPCManager() {
  const bodyRef = useRef();
  const headRef = useRef();
  const legLRef = useRef();
  const legRRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  const peds = useRef(
    Array.from({ length: COUNT }, (_, i) => {
      const sp = sidewalkSpawn();
      return {
        id: `ped-${i}`,
        pos: new THREE.Vector3(sp[0], 0, sp[1]),
        vel: new THREE.Vector3(),
        heading: Math.random() * Math.PI * 2,
        state: Math.random() < 0.25 ? STATE.WANDER : STATE.WANDER,
        timer: Math.random() * 3,
        phase: Math.random() * 6,
        hp: 30,
        ragdollT: 0,
        idle: Math.random() < 0.3,
        color: new THREE.Color(PALETTE[i % PALETTE.length]),
        skin: new THREE.Color().setHSL(0.07, 0.4, 0.55 + Math.random() * 0.2),
        respawnT: 0,
      };
    })
  );

  useEffect(() => {
    const unregs = peds.current.map((p) =>
      registerNPC(p.id, {
        id: p.id,
        type: "ped",
        getPos: (out) => {
          out.x = p.pos.x;
          out.y = p.pos.y;
          out.z = p.pos.z;
          return out;
        },
        get alive() {
          return p.state !== STATE.DEAD;
        },
        onHit: (dmg, impulse) => {
          if (p.state === STATE.DEAD) return;
          p.hp -= dmg;
          if (p.hp <= 0 || dmg >= 100) {
            // Killed: ragdoll with the kill impulse, credit the kill. The body
            // stays visible (lying down) through RAGDOLL then DEAD so the player
            // sees the result of the shot — it does NOT vanish.
            p.state = STATE.RAGDOLL;
            p.ragdollT = 0;
            p.vel.set(impulse[0] * 0.4, impulse[1] * 0.4, impulse[2] * 0.4);
            useGameStore.getState().addKill?.();
          } else {
            // Wounded but alive: flee from the shooter. Even with no wanted
            // level, a ped who gets shot panics — this is the fix for "I shoot
            // them and they keep walking as if nothing happened".
            p.state = STATE.PANIC;
            p.timer = 6;
            p.vel.set(impulse[0] * 0.15, 0, impulse[2] * 0.15);
          }
        },
      })
    );
    return () => unregs.forEach((u) => u());
  }, []);

  useFrame((_, rawDelta) => {
    const ts = useGameStore.getState().timeScale;
    const delta = Math.min(rawDelta, 0.05) * ts;

    const bm = bodyRef.current;
    const hm = headRef.current;
    const lm = legLRef.current;
    const rm = legRRef.current;
    if (!bm || !hm || !lm || !rm) return;

    const px = worldState.playerPos.x;
    const pz = worldState.playerPos.z;
    const wanted = useGameStore.getState().wanted;
    // Sense nearby gunfire: if the player fired very recently (lastCrime within
    // ~1.5s) and is close, peds flee even with no wanted level — gunfire is
    // scary regardless of whether the cops care yet.
    const sinceCrime = worldState.clock - worldState.lastCrime;
    const gunfireNearby = sinceCrime < 1.5;

    const blips = worldState.blips;
    // NOTE: do NOT clear blips here. The MiniMap owns the blip buffer and clears
    // it once AFTER it draws each radar frame. If multiple systems clear it, the
    // one that runs later wipes the others' blips — that was making peers/team
    // blips disappear (they're pushed by RemotePlayers which runs after us).
    // Each system only PUSHES; MiniMap drains.

    peds.current.forEach((p, i) => {
      switch (p.state) {
        case STATE.WANDER: {
          p.timer -= delta;
          if (p.timer <= 0) {
            p.idle = Math.random() < 0.25;
            p.heading += (Math.random() - 0.5) * 1.8;
            p.timer = 1.5 + Math.random() * 3.5;
          }
          const sp = p.idle ? 0 : 1.3;
          p.vel.set(Math.sin(p.heading) * sp, 0, Math.cos(p.heading) * sp);
          const d = Math.hypot(p.pos.x - px, p.pos.z - pz);
          // Flee if the player is wanted, OR if gunfire just happened nearby.
          if (d < 9 && (wanted > 0 || gunfireNearby)) {
            p.state = STATE.PANIC;
            p.timer = 4;
          }
          p.phase += delta * (p.idle ? 0 : 8);
          break;
        }
        case STATE.PANIC: {
          p.timer -= delta;
          const dx = p.pos.x - px;
          const dz = p.pos.z - pz;
          const d = Math.hypot(dx, dz) || 1;
          const sp = 4.8;
          p.vel.set((dx / d) * sp, 0, (dz / d) * sp);
          p.heading = Math.atan2(p.vel.x, p.vel.z);
          p.phase += delta * 16;
          if (p.timer <= 0) p.state = STATE.WANDER;
          break;
        }
        case STATE.RAGDOLL: {
          p.ragdollT += delta;
          p.vel.y -= 22 * delta;
          if (p.pos.y + p.vel.y * delta < 0) {
            p.pos.y = 0;
            p.vel.set(0, 0, 0);
          }
          // Keep the ragdoll visible for a beat so the kill registers visually,
          // then settle into the flat DEAD pose (a visible corpse) before the
          // respawn relocate.
          if (p.ragdollT > 2) {
            p.state = STATE.DEAD;
            p.respawnT = 0;
          }
          break;
        }
        case STATE.DEAD: {
          p.respawnT += delta;
          // The corpse lies flat and visible for a while (was 3s) so kills feel
          // real — then the ped respawns NEAR the player so the city stays
          // populated where the action is. 8s gives a satisfying corpse duration
          // without depopulating the streets for too long.
          if (p.respawnT > 8) {
            const sp = sidewalkSpawnNear(px, pz);
            p.pos.set(sp[0], 0, sp[1]);
            p.hp = 30;
            p.state = STATE.WANDER;
            p.vel.set(0, 0, 0);
            p.idle = false;
          }
          break;
        }
        default:
          break;
      }

      p.pos.addScaledVector(p.vel, delta);
      p.pos.x = THREE.MathUtils.clamp(p.pos.x, -HALF - 4, HALF + 4);
      p.pos.z = THREE.MathUtils.clamp(p.pos.z, -HALF - 4, HALF + 4);

      const ragdoll = p.state === STATE.RAGDOLL;
      const dead = p.state === STATE.DEAD;
      const swing = ragdoll || dead ? 0 : Math.sin(p.phase) * 0.5;

      // body — when downed, the body lies flat on the ground (rotated 90° on X)
      // so it reads as a corpse instead of disappearing. Use a small settle
      // offset so the box rests on the ground plane, not floating.
      if (ragdoll || dead) {
        // lying flat: body box is 0.7 tall, so its half-height is 0.35; rotate
        // onto its back and drop it to ground level.
        dummy.position.set(p.pos.x, p.pos.y + 0.18, p.pos.z);
        dummy.rotation.set(Math.PI / 2, p.heading, p.ragdollT);
        dummy.scale.set(1, 1, 1);
      } else {
        const bob = Math.sin(p.phase * 2) * 0.03;
        dummy.position.set(p.pos.x, p.pos.y + 0.9 + bob, p.pos.z);
        dummy.rotation.set(0, p.heading, 0);
        dummy.scale.set(1, 1, 1);
      }
      dummy.updateMatrix();
      bm.setMatrixAt(i, dummy.matrix);
      bm.setColorAt(i, p.color);

      // head — when downed, the head rests beside the body on the ground.
      if (ragdoll || dead) {
        dummy.position.set(p.pos.x, p.pos.y + 0.2, p.pos.z);
        dummy.rotation.set(Math.PI / 2, p.heading, p.ragdollT);
        dummy.scale.set(1, 1, 1);
      } else {
        const bob2 = Math.sin(p.phase * 2) * 0.03;
        dummy.position.set(p.pos.x, p.pos.y + 1.55 + bob2, p.pos.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
      }
      dummy.updateMatrix();
      hm.setMatrixAt(i, dummy.matrix);
      hm.setColorAt(i, p.skin);

      // legs (offset forward/back, swing on X)
      if (!ragdoll && !dead) {
        const sinH = Math.sin(p.heading);
        const cosH = Math.cos(p.heading);
        const lx = cosH * 0.13;
        const lz = -sinH * 0.13;
        // left leg
        dummy.position.set(p.pos.x - lx, p.pos.y + 0.35, p.pos.z - lz);
        dummy.rotation.set(swing, p.heading, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        lm.setMatrixAt(i, dummy.matrix);
        lm.setColorAt(i, p.color);
        // right leg
        dummy.position.set(p.pos.x + lx, p.pos.y + 0.35, p.pos.z + lz);
        dummy.rotation.set(-swing, p.heading, 0);
        dummy.updateMatrix();
        rm.setMatrixAt(i, dummy.matrix);
        rm.setColorAt(i, p.color);
      } else {
        // hide legs by scaling to 0
        dummy.position.set(p.pos.x, -50, p.pos.z);
        dummy.scale.setScalar(0.001);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        lm.setMatrixAt(i, dummy.matrix);
        rm.setMatrixAt(i, dummy.matrix);
      }

      if (!dead) {
        blips.push({
          x: p.pos.x,
          z: p.pos.z,
          type: p.state === STATE.PANIC ? "hostile" : "ped",
        });
      }
    });

    bm.instanceMatrix.needsUpdate = true;
    if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
    hm.instanceMatrix.needsUpdate = true;
    if (hm.instanceColor) hm.instanceColor.needsUpdate = true;
    lm.instanceMatrix.needsUpdate = true;
    if (lm.instanceColor) lm.instanceColor.needsUpdate = true;
    rm.instanceMatrix.needsUpdate = true;
    if (rm.instanceColor) rm.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, COUNT]} castShadow>
        <boxGeometry args={[0.5, 0.7, 0.3]} />
        <meshStandardMaterial flatShading />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[undefined, undefined, COUNT]}>
        <boxGeometry args={[0.38, 0.38, 0.38]} />
        <meshStandardMaterial flatShading />
      </instancedMesh>
      {/* legs don't cast shadows (cheaper) */}
      <instancedMesh ref={legLRef} args={[undefined, undefined, COUNT]}>
        <boxGeometry args={[0.18, 0.62, 0.18]} />
        <meshStandardMaterial color="#2b2b3a" flatShading />
      </instancedMesh>
      <instancedMesh ref={legRRef} args={[undefined, undefined, COUNT]}>
        <boxGeometry args={[0.18, 0.62, 0.18]} />
        <meshStandardMaterial color="#2b2b3a" flatShading />
      </instancedMesh>
    </group>
  );
}
