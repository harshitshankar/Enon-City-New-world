import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { spawnQueue } from "../../lib/events";
import { useGameStore, markCrime } from "../../store/useGameStore";
import { npcRegistry, vehicleRegistry } from "../../lib/registry";
import { playSfx } from "../../lib/audio";

/**
 * ExplosionSystem
 * Pooled VFX: each explosion = N debris shards (geometry instances flung out
 * with gravity) + 1 expanding shockwave sphere + 1 expanding bright smoke ring.
 * Nearby NPCs are damaged & ragdolled.
 */
const MAX_EXPL = 12;
const SHARDS = 14;
const DEBRIS_POOL = MAX_EXPL * SHARDS;

export default function ExplosionSystem() {
  const debrisRef = useRef();
  const shockRef = useRef();
  const ringRef = useRef();
  const flashRef = useRef();

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const hidden = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, -999, 0);
    o.scale.setScalar(0.0001);
    o.updateMatrix();
    return o.matrix.clone();
  }, []);

  const explosions = useRef(
    Array.from({ length: MAX_EXPL }, () => ({
      active: false,
      t: 0,
      dur: 1.1,
      pos: new THREE.Vector3(),
      scale: 1,
      shards: Array.from({ length: SHARDS }, () => ({
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        rot: new THREE.Euler(),
        rv: new THREE.Vector3(),
      })),
    }))
  );

  const tmp = useMemo(() => new THREE.Vector3(), []);
  const pendingChain = useRef([]);

  useFrame((_, rawDelta) => {
    const ts = useGameStore.getState().timeScale;
    const delta = Math.min(rawDelta, 0.05) * ts;

    /* ---- apply queued chain damage to cars (from previous explosions) ---- */
    if (pendingChain.current.length) {
      const chains = pendingChain.current;
      pendingChain.current = [];
      for (const c of chains) {
        for (const v of vehicleRegistry.values()) {
          if (v.destroyed && v.destroyed()) continue;
          const vp = v.getPos(tmp);
          const dx = vp.x - c.x;
          const dz = vp.z - c.z;
          if (Math.hypot(dx, dz) < c.r) {
            // big damage so it chain-detonates
            v.onHit?.(120);
          }
        }
      }
    }

    /* ---- drain explosion requests ---- */
    while (spawnQueue.explosions.length) {
      const req = spawnQueue.explosions.shift();
      const e = explosions.current.find((x) => !x.active);
      if (!e) break;
      e.active = true;
      e.t = 0;
      e.dur = 1.1;
      e.scale = req.scale || 1;
      e.pos.set(req.pos[0], req.pos[1], req.pos[2]);
      playSfx("explosion");
      // init shards
      for (const s of e.shards) {
        s.p.copy(e.pos);
        const a = Math.random() * Math.PI * 2;
        const up = 4 + Math.random() * 7;
        const out = 3 + Math.random() * 6;
        s.v.set(Math.cos(a) * out, up, Math.sin(a) * out).multiplyScalar(e.scale);
        s.rot.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        s.rv.set(
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12
        );
      }
      // damage + ragdoll nearby NPCs
      const radius = 6 * e.scale;
      for (const npc of npcRegistry.values()) {
        if (!npc.alive) continue;
        const np = npc.getPos(tmp);
        const dx = np.x - e.pos.x;
        const dz = np.z - e.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < radius) {
          const force = (1 - d / radius) * 18;
          const nx = (dx / (d || 1)) * force;
          const nz = (dz / (d || 1)) * force;
          npc.onHit?.(100, [nx, 12, nz]);
          useGameStore.getState().addScore(50);
        }
      }
      // CHAIN REACTION: blast nearby cars too (defer one frame to avoid
      // recursing into the spawn queue mid-drain).
      const carRadius = 5 * e.scale;
      pendingChain.current.push({ x: e.pos.x, z: e.pos.z, r: carRadius });

      useGameStore.getState().addWanted(0.5);
      markCrime();
    }

    /* ---- update + write instances ---- */
    let di = 0;
    let si = 0;
    let rgi = 0;
    let fi = 0;
    const dm = debrisRef.current;
    const sm = shockRef.current;
    const rm = ringRef.current;
    const fm = flashRef.current;

    for (const e of explosions.current) {
      if (!e.active) continue;
      e.t += delta;
      const k = e.t / e.dur;
      if (k >= 1) {
        e.active = false;
        continue;
      }

      // shockwave sphere (expand + fade) — handled via scale, opacity is shared
      if (sm) {
        const sw = (0.4 + k * 5) * e.scale;
        dummy.position.copy(e.pos);
        dummy.quaternion.identity();
        dummy.scale.setScalar(sw);
        dummy.updateMatrix();
        sm.setMatrixAt(si++, dummy.matrix);
      }

      // smoke ring (flat, expanding wide)
      if (rm) {
        const rw = (0.6 + k * 7) * e.scale;
        dummy.position.set(e.pos.x, e.pos.y + 0.2, e.pos.z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(rw, rw, 1);
        dummy.updateMatrix();
        rm.setMatrixAt(rgi++, dummy.matrix);
        dummy.rotation.set(0, 0, 0);
      }

      // bright flash early
      if (fm && k < 0.3) {
        const fw = (1 + k * 4) * e.scale;
        dummy.position.copy(e.pos);
        dummy.quaternion.identity();
        dummy.scale.setScalar(fw);
        dummy.updateMatrix();
        fm.setMatrixAt(fi++, dummy.matrix);
      }

      // debris shards
      if (dm) {
        for (const s of e.shards) {
          s.v.y -= 22 * delta;
          s.p.addScaledVector(s.v, delta);
          if (s.p.y < 0.1) {
            s.p.y = 0.1;
            s.v.y *= -0.3;
            s.v.x *= 0.7;
            s.v.z *= 0.7;
          }
          s.rot.x += s.rv.x * delta;
          s.rot.y += s.rv.y * delta;
          s.rot.z += s.rv.z * delta;
          dummy.position.copy(s.p);
          dummy.rotation.copy(s.rot);
          const ds = (0.25 + 0.2 * (1 - k)) * e.scale;
          dummy.scale.setScalar(ds);
          dummy.updateMatrix();
          dm.setMatrixAt(di++, dummy.matrix);
        }
      }
    }

    // hide unused
    if (dm) {
      for (let i = di; i < DEBRIS_POOL; i++) dm.setMatrixAt(i, hidden);
      dm.count = DEBRIS_POOL;
      dm.instanceMatrix.needsUpdate = true;
    }
    if (sm) {
      for (let i = si; i < MAX_EXPL; i++) sm.setMatrixAt(i, hidden);
      sm.count = MAX_EXPL;
      sm.instanceMatrix.needsUpdate = true;
    }
    if (rm) {
      for (let i = rgi; i < MAX_EXPL; i++) rm.setMatrixAt(i, hidden);
      rm.count = MAX_EXPL;
      rm.instanceMatrix.needsUpdate = true;
    }
    if (fm) {
      for (let i = fi; i < MAX_EXPL; i++) fm.setMatrixAt(i, hidden);
      fm.count = MAX_EXPL;
      fm.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* debris shards */}
      <instancedMesh ref={debrisRef} args={[undefined, undefined, DEBRIS_POOL]} frustumCulled={false} castShadow>
        <tetrahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#2a2a2a" flatShading emissive="#ff5a1f" emissiveIntensity={0.25} />
      </instancedMesh>

      {/* shockwave sphere */}
      <instancedMesh ref={shockRef} args={[undefined, undefined, MAX_EXPL]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial color="#ff8a3c" transparent opacity={0.18} depthWrite={false} toneMapped={false} />
      </instancedMesh>

      {/* expanding smoke ring */}
      <instancedMesh ref={ringRef} args={[undefined, undefined, MAX_EXPL]} frustumCulled={false}>
        <ringGeometry args={[0.7, 1, 24]} />
        <meshBasicMaterial color="#ffb347" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </instancedMesh>

      {/* bright core flash */}
      <instancedMesh ref={flashRef} args={[undefined, undefined, MAX_EXPL]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial color="#fff1c0" transparent opacity={0.8} depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
