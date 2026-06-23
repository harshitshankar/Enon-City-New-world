import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore, worldState } from "../../store/useGameStore";
import { HALF, BLOCK, GRID, ROAD_W } from "../world/World";
import { playSfx } from "../../lib/audio";

/**
 * Pickups scattered on the roads:
 *  - health: red cross, restores 35 HP
 *  - ammo: glowing crate, grants 500 pistol + 200 rifle + 100 rocket + 100 bow
 * They float & spin, respawn on a timer after collection, and show on the
 * minimap (worldState.blips) so the player can find them.
 */

function roadSpawn(i) {
  // place along a road centre line
  const onX = i % 2 === 0;
  const lane = Math.floor(Math.random() * (GRID + 1));
  const c = -HALF + lane * BLOCK;
  const along = (Math.random() - 0.5) * GRID * BLOCK;
  return onX ? [along, c] : [c, along];
}

export default function Pickups() {
  const healthRef = useRef();
  const ammoRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const items = useRef(
    Array.from({ length: 28 }, (_, i) => {
      const sp = roadSpawn(i);
      return {
        type: i % 2 === 0 ? "health" : "ammo",
        pos: new THREE.Vector3(sp[0], 0.8, sp[1]),
        active: true,
        respawn: 0,
        spin: Math.random() * 6,
      };
    })
  );

  // keep blips fresh each frame (added after NPC/police clear the array)
  useFrame((_, rawDelta) => {
    const ts = useGameStore.getState().timeScale;
    const dt = Math.min(rawDelta, 0.05) * ts;
    const st = useGameStore.getState();

    const px = worldState.playerPos.x;
    const pz = worldState.playerPos.z;

    let hi = 0;
    let ai = 0;
    const hm = healthRef.current;
    const am = ammoRef.current;

    items.current.forEach((it) => {
      if (!it.active) {
        it.respawn -= dt;
        if (it.respawn <= 0) it.active = true;
      }
      if (it.active) {
        it.spin += dt * 2;
        // collection check
        const d = Math.hypot(it.pos.x - px, it.pos.z - pz);
        if (d < 2.2) {
          if (it.type === "health") {
            if (st.health < st.maxHealth) {
              st.heal(35);
              collect(it);
            }
          } else {
            st.addAmmo("pistol", 500);
            st.addAmmo("rifle", 200);
            st.addAmmo("rocket", 100);
            st.addAmmo("bow", 100);
            collect(it);
          }
        }
        // minimap blip
        worldState.blips.push({
          x: it.pos.x,
          z: it.pos.z,
          type: it.type === "health" ? "health" : "ammo",
        });
      }

      // write instance
      const y = 0.8 + Math.sin(it.spin * 1.5) * 0.18;
      if (it.type === "health" && hm) {
        if (it.active) {
          dummy.position.set(it.pos.x, y, it.pos.z);
          dummy.rotation.set(0, it.spin, 0);
          dummy.scale.setScalar(1);
        } else {
          dummy.position.set(0, -999, 0);
          dummy.scale.setScalar(0.001);
        }
        dummy.updateMatrix();
        hm.setMatrixAt(hi++, dummy.matrix);
      } else if (it.type === "ammo" && am) {
        if (it.active) {
          dummy.position.set(it.pos.x, y, it.pos.z);
          dummy.rotation.set(0, it.spin, 0);
          dummy.scale.setScalar(1);
        } else {
          dummy.position.set(0, -999, 0);
          dummy.scale.setScalar(0.001);
        }
        dummy.updateMatrix();
        am.setMatrixAt(ai++, dummy.matrix);
      }
    });

    if (hm) {
      hm.count = hi;
      hm.instanceMatrix.needsUpdate = true;
    }
    if (am) {
      am.count = ai;
      am.instanceMatrix.needsUpdate = true;
    }
  });

  function collect(it) {
    it.active = false;
    it.respawn = 12;
    playSfx("pickup");
    const sp = roadSpawn(Math.floor(Math.random() * 14));
    it.pos.set(sp[0], 0.8, sp[1]);
  }

  const healthCount = items.current.filter((i) => i.type === "health").length;
  const ammoCount = items.current.filter((i) => i.type === "ammo").length;

  return (
    <group>
      {/* Health pickups — red glowing box with white cross feel */}
      <instancedMesh ref={healthRef} args={[undefined, undefined, healthCount]} frustumCulled={false}>
        <boxGeometry args={[0.9, 0.9, 0.9]} />
        <meshStandardMaterial
          color="#ff3355"
          emissive="#ff3355"
          emissiveIntensity={0.7}
          toneMapped={false}
        />
      </instancedMesh>
      {/* Ammo pickups — gold glowing crate */}
      <instancedMesh ref={ammoRef} args={[undefined, undefined, ammoCount]} frustumCulled={false}>
        <boxGeometry args={[0.95, 0.7, 0.7]} />
        <meshStandardMaterial
          color="#ffcc33"
          emissive="#ffaa00"
          emissiveIntensity={0.7}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}
