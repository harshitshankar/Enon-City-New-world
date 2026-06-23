import { useMemo, useRef } from "react";
import { useLayoutEffect } from "react";
import * as THREE from "three";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import { HALF, BLOCK } from "./constants";

/**
 * Plaza — a dedicated flat helicopter plaza off the roads, distinct from the
 * street grid. Holds 6 ground-level helipads (big H-marked circles) arranged
 * in two rows, with a concrete ground tint and a low perimeter kerb.
 *
 * This is where several helicopters spawn (see VehicleManager) so multiple
 * players can grab a heli at once, instead of the lone rooftop + pad helis.
 *
 * Centred at PLAZA_X / PLAZA_Z (park/downtown edge), exported so VehicleManager
 * can place helicopters precisely on the pad centres.
 */
export const PLAZA_X = -HALF * 0.5 + 6; // west edge, open suburbs band
export const PLAZA_Z = HALF * 0.5 - 6; // north

// 3x2 grid of helipads. Exported so VehicleManager can drop helicopters on them.
export const HELIPADS = (() => {
  const pads = [];
  const cols = 3;
  const rows = 2;
  const gap = 16; // distance between pad centres
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pads.push({
        x: PLAZA_X + (c - (cols - 1) / 2) * gap,
        z: PLAZA_Z + (r - (rows - 1) / 2) * gap,
      });
    }
  }
  return pads; // 6 pads
})();

const PLAZA_W = 58; // concrete slab width/depth
const PAD_R = 5.2; // helipad circle radius

export default function Plaza() {
  return (
    <group>
      {/* Concrete slab (a touch above the base ground so it reads as a pad) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[PLAZA_X, 0.05, PLAZA_Z]} receiveShadow>
        <planeGeometry args={[PLAZA_W, PLAZA_W]} />
        <meshStandardMaterial color="#3a3a44" roughness={0.9} />
      </mesh>
      {/* subtle inner tint */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[PLAZA_X, 0.06, PLAZA_Z]} receiveShadow>
        <planeGeometry args={[PLAZA_W - 4, PLAZA_W - 4]} />
        <meshStandardMaterial color="#44434e" roughness={0.85} />
      </mesh>

      <Perimeter />
      {HELIPADS.map((p, i) => (
        <Helipad key={i} x={p.x} z={p.z} label={String(i + 1)} />
      ))}
    </group>
  );
}

/** A single helipad: a yellow ring + crosshair + big "H" on the ground. */
function Helipad({ x, z, label }) {
  return (
    <group position={[x, 0.08, z]}>
      {/* outer yellow ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[PAD_R - 0.5, PAD_R, 40]} />
        <meshBasicMaterial color="#ffd24d" transparent opacity={0.85} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {/* inner dark disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[PAD_R - 0.5, 36]} />
        <meshStandardMaterial color="#2a2a32" roughness={0.95} />
      </mesh>
      {/* crosshair lines */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[0.35, 0.04, PAD_R * 1.4]} />
        <meshBasicMaterial color="#ffd24d" transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[PAD_R * 1.4, 0.04, 0.35]} />
        <meshBasicMaterial color="#ffd24d" transparent opacity={0.5} toneMapped={false} />
      </mesh>
      {/* big "H" marker — two verticals + a crossbar, standing slightly proud */}
      <group position={[0, 0.05, 0]}>
        <mesh position={[-1.3, 0.03, 0]}>
          <boxGeometry args={[0.7, 0.06, 3.2]} />
          <meshBasicMaterial color="#ffe98a" toneMapped={false} />
        </mesh>
        <mesh position={[1.3, 0.03, 0]}>
          <boxGeometry args={[0.7, 0.06, 3.2]} />
          <meshBasicMaterial color="#ffe98a" toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.03, 0]}>
          <boxGeometry args={[3.3, 0.06, 0.7]} />
          <meshBasicMaterial color="#ffe98a" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** Low perimeter kerb around the whole plaza. */
function Perimeter() {
  const half = PLAZA_W / 2;
  const kerbH = 0.4;
  const kerbT = 1.0;
  return (
    <RigidBody type="fixed" colliders={false}>
      {/* visual kerbs */}
      <mesh position={[PLAZA_X, kerbH / 2, PLAZA_Z - half]}>
        <boxGeometry args={[PLAZA_W, kerbH, kerbT]} />
        <meshStandardMaterial color="#54525e" roughness={0.9} />
      </mesh>
      <mesh position={[PLAZA_X, kerbH / 2, PLAZA_Z + half]}>
        <boxGeometry args={[PLAZA_W, kerbH, kerbT]} />
        <meshStandardMaterial color="#54525e" roughness={0.9} />
      </mesh>
      <mesh position={[PLAZA_X - half, kerbH / 2, PLAZA_Z]}>
        <boxGeometry args={[kerbT, kerbH, PLAZA_W]} />
        <meshStandardMaterial color="#54525e" roughness={0.9} />
      </mesh>
      <mesh position={[PLAZA_X + half, kerbH / 2, PLAZA_Z]}>
        <boxGeometry args={[kerbT, kerbH, PLAZA_W]} />
        <meshStandardMaterial color="#54525e" roughness={0.9} />
      </mesh>
      {/* sensor colliders so cars nudge against the kerb (low, drivable over) */}
      <CuboidCollider args={[PLAZA_W / 2, kerbH, kerbT / 2]} position={[PLAZA_X, kerbH, PLAZA_Z - half]} sensor />
      <CuboidCollider args={[PLAZA_W / 2, kerbH, kerbT / 2]} position={[PLAZA_X, kerbH, PLAZA_Z + half]} sensor />
      <CuboidCollider args={[kerbT / 2, kerbH, PLAZA_W / 2]} position={[PLAZA_X - half, kerbH, PLAZA_Z]} sensor />
      <CuboidCollider args={[kerbT / 2, kerbH, PLAZA_W / 2]} position={[PLAZA_X + half, kerbH, PLAZA_Z]} sensor />
    </RigidBody>
  );
}
