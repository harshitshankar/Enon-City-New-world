import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { worldState } from "../../store/useGameStore";
import { HALF, BLOCK, GRID, ROAD_W } from "./World";

/**
 * StreetLightGlow — cheap soft radial light decals on the ground under each
 * street light, so at night the road glows in warm pools beneath the lamps.
 *
 * Implemented as a single instanced plane (radial-gradient texture) laid flat,
 * one instance per lamp. Each frame we set the shared material opacity from
 * worldState.darkness (0 by day, up to ~0.5 at deep night) so the effect only
 * shows after dark and is never over-lit. The plane is additive so it blends
 * as light, not paint.
 *
 * The lamp positions mirror World.jsx's StreetLights exactly.
 */

// Tiny radial gradient drawn to a canvas — warm core fading to transparent.
function makeGlowTexture() {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,210,140,0.95)");
  g.addColorStop(0.4, "rgba(255,180,90,0.45)");
  g.addColorStop(1, "rgba(255,170,80,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export default function StreetLightGlow() {
  const meshRef = useRef();
  const tex = useMemo(makeGlowTexture, []);

  // Same lamp layout as World.StreetLights.
  const lights = useMemo(() => {
    const l = [];
    for (let i = 0; i <= GRID; i++) {
      for (let gx = 0; gx < GRID; gx++) {
        const c = -HALF + i * BLOCK;
        const x = -HALF + gx * BLOCK + BLOCK / 2;
        l.push({ x, z: c + ROAD_W / 2 + 1 });
        l.push({ x: c + ROAD_W / 2 + 1, z: x });
      }
    }
    return l;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Position all decals once.
  useMemo(() => {
    // no-op placeholder kept for clarity; positioning happens in first frame
  }, [lights]);

  useFrame(() => {
    const m = meshRef.current;
    if (!m) return;
    // Lay each decal flat under its lamp on first run, then just drive opacity
    // by the current darkness (cheap per-frame — one material uniform).
    if (!m.userData.laid) {
      lights.forEach((p, i) => {
        dummy.position.set(p.x, 0.1, p.z);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(9, 9, 1); // ~9u radius pool — tight, not over-lit
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      });
      m.count = lights.length;
      m.instanceMatrix.needsUpdate = true;
      m.userData.laid = true;
    }
    // Only visible after dusk; opacity scales with darkness.
    const d = worldState.darkness;
    m.visible = d > 0.04;
    if (m.material) m.material.opacity = Math.min(0.5, d * 0.6);
  });

  if (!tex) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, lights.length]}
      frustumCulled={false}
      visible={false}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={tex}
        transparent
        opacity={0}
        depthWrite={false}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}
