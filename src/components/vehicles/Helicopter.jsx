import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import * as THREE from "three";

import {
  useGameStore,
  inputState,
  worldState,
} from "../../store/useGameStore";
import { registerVehicle } from "../../lib/registry";
import { requestExplosion } from "../../lib/events";
import { startEngine, setEngine, stopEngine, playSfx } from "../../lib/audio";
import CharacterMesh from "../player/CharacterMesh";

/**
 * Helicopter — a flyable rotorcraft the player can hijack and pilot.
 *
 * Controls (desktop): WASD pitch/strafe, Space ascend, Ctrl descend, Shift
 * boost, mouse yaw. Mobile: joystick = pitch/strafe, swipe = yaw, ▲/▼ buttons
 * ascend/descend.
 *
 * Flight model: arcade 6DOF. A counter-gravity "auto-hover" keeps the heli
 * airborne with no input, so it's forgiving. Landing: when slow + low over a
 * flat rooftop or the ground, it settles and snaps upright.
 *
 * Mirrors Car.jsx: registers as a hijackable vehicle, reports its pose to
 * worldState.vehiclePos/vehicleHeading, and explodes + respawns like a car.
 */
export default function Helicopter({ id, position = [0, 6, 0] }) {
  const bodyRef = useRef();
  const groupRef = useRef();
  const mainRotorRef = useRef();
  const tailRotorRef = useRef();
  const driverRef = useRef();

  const activeVehicle = useGameStore((s) => s.activeVehicle);
  const isPlayerHeli = activeVehicle === id;

  useEffect(() => {
    if (isPlayerHeli) {
      worldState.vehicleType = "heli";
      startEngine();
      return () => {
        stopEngine();
        worldState.vehicleType = "car";
      };
    }
  }, [isPlayerHeli]);

  // Flight state
  const heading = useRef(0); // yaw
  const pitch = useRef(0); // forward tilt
  const roll = useRef(0); // sideways tilt
  const vy = useRef(0); // vertical velocity
  const vx = useRef(0); // horizontal velocity (world)
  const vz = useRef(0);
  const rotorSpin = useRef(0);
  const health = useRef(100);
  const destroyed = useRef(false);
  const respawnT = useRef(0);
  const landed = useRef(true);

  const tmp = useMemo(
    () => ({
      q: new THREE.Quaternion(),
      euler: new THREE.Euler(),
      cur: new THREE.Vector3(),
    }),
    []
  );

  // Building top-Y lookup for precise landing (populated by World in Phase 3;
  // gracefully empty here so landing still works on the ground).
  const buildingTops = useRef(null);

  useEffect(() => {
    const getPos = (out) => {
      const t = bodyRef.current?.translation();
      if (t) {
        out.x = t.x;
        out.y = t.y;
        out.z = t.z;
      }
      return out;
    };
    const onHijack = () => {
      playSfx("hijack");
      worldState.vehicleType = "heli";
    };
    const explode = () => {
      if (destroyed.current) return;
      destroyed.current = true;
      const t = bodyRef.current?.translation();
      const pos = t ? [t.x, t.y + 0.6, t.z] : position;
      requestExplosion({ pos, scale: 2.2 });
      respawnT.current = 0;
      const st = useGameStore.getState();
      st.addCarKill();
      if (useGameStore.getState().activeVehicle === id) {
        st.exitVehicle();
        st.damage(40);
      }
    };
    const onHit = (dmg) => {
      if (destroyed.current) return;
      health.current -= dmg;
      playSfx("metal");
      if (health.current <= 0) explode();
    };
    // pull the shared building-top table if World has published it
    buildingTops.current = (typeof window !== "undefined" && window.__buildingTops) || null;
    const unreg = registerVehicle(id, {
      id,
      ref: bodyRef,
      getPos,
      get occupied() {
        return useGameStore.getState().activeVehicle === id;
      },
      destroyed: () => destroyed.current,
      onHit,
      onHijack,
    });
    return unreg;
  }, [id, position]);

  useFrame((state, rawDelta) => {
    const ts = useGameStore.getState().timeScale;
    const delta = Math.min(rawDelta, 0.05) * ts;
    const body = bodyRef.current;
    if (!body) return;

    const t = body.translation();

    /* ================= DESTROYED STATE ================= */
    if (destroyed.current) {
      respawnT.current += delta;
      if (groupRef.current) {
        groupRef.current.visible = respawnT.current < 0.15;
      }
      if (respawnT.current > 7) {
        destroyed.current = false;
        health.current = 100;
        landed.current = true;
        vy.current = 0;
        vx.current = 0;
        vz.current = 0;
        if (groupRef.current) groupRef.current.visible = true;
        body.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      return;
    }

    /* ================= PLAYER FLYING ================= */
    if (isPlayerHeli) {
      // --- input ---
      const pitchIn = THREE.MathUtils.clamp(inputState.move.z, -1, 1); // W/S -> forward/back
      const strafeIn = THREE.MathUtils.clamp(inputState.move.x, -1, 1); // A/D -> strafe
      const yawIn = -inputState.look.x; // mouse swipe -> yaw
      inputState.look.x = 0;
      inputState.look.y = 0;
      const ascend = inputState.up ? 1 : 0; // Space
      const descend = inputState.down ? 1 : 0; // Ctrl
      const boosting = inputState.boost; // Shift

      // --- yaw ---
      heading.current += yawIn * 1.4 * delta;

      // --- auto-hover: counter gravity so the heli floats when idle ---
      const gravity = 24;
      const hoverThrust = gravity; // neutralises gravity
      const collective = (ascend - descend) * (boosting ? 36 : 24);
      vy.current += (-gravity + hoverThrust + collective) * delta;
      // clamp vertical speed
      vy.current = THREE.MathUtils.clamp(vy.current, -22, 24);

      // --- pitch/roll tilt toward input (visual + thrust coupling) ---
      const targetPitch = pitchIn * 0.35;
      const targetRoll = -strafeIn * 0.3;
      pitch.current += (targetPitch - pitch.current) * Math.min(1, delta * 4);
      roll.current += (targetRoll - roll.current) * Math.min(1, delta * 4);

      // --- horizontal thrust from tilt + strafe (relative to heading) ---
      const sinH = Math.sin(heading.current);
      const cosH = Math.cos(heading.current);
      const speed = boosting ? 30 : 20;
      // forward thrust from pitch: pitching forward moves you along -heading z
      const fwdThrust = -pitchIn * speed;
      const sideThrust = strafeIn * speed * 0.7;
      // world-space desired horizontal velocity
      const desVX = sinH * fwdThrust + cosH * sideThrust;
      const desVZ = cosH * fwdThrust - sinH * sideThrust;
      // ease toward desired (gives weighty, drifting feel)
      const lerpK = Math.min(1, delta * 2.5);
      vx.current += (desVX - vx.current) * lerpK;
      vz.current += (desVZ - vz.current) * lerpK;

      // --- integrate position manually (smooth, deterministic) ---
      let ny = t.y + vy.current * delta;
      let nx = t.x + vx.current * delta;
      let nz = t.z + vz.current * delta;

      // --- landing detection: find ground or rooftop top-Y under us ---
      const groundY = 1.0; // skid height above ground
      let surfaceY = groundY;
      // check building rooftops
      if (buildingTops.current) {
        for (const b of buildingTops.current) {
          if (
            nx > b.minX && nx < b.maxX &&
            nz > b.minZ && nz < b.maxZ
          ) {
            if (b.topY + 1.0 > surfaceY) surfaceY = b.topY + 1.0;
          }
        }
      }
      // clamp to surface (don't sink through ground/rooftop)
      if (ny < surfaceY) {
        ny = surfaceY;
        if (vy.current < -3) playSfx("land");
        vy.current = 0;
      }

      const slow =
        Math.hypot(vx.current, vz.current) < 1.5 && Math.abs(vy.current) < 1.5;
      landed.current = ny <= surfaceY + 0.1 && slow;

      body.setTranslation({ x: nx, y: ny, z: nz }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      // orientation from yaw + pitch + roll
      tmp.euler.set(pitch.current, heading.current, roll.current, "YXZ");
      tmp.q.setFromEuler(tmp.euler);
      body.setRotation(tmp.q, true);

      // --- telemetry ---
      worldState.vehiclePos.x = nx;
      worldState.vehiclePos.y = ny;
      worldState.vehiclePos.z = nz;
      worldState.vehicleHeading = heading.current;
      worldState.speedKmh = Math.hypot(vx.current, vz.current) * 3.6;
      worldState.vehicleType = "heli";

      const pitchNorm = Math.hypot(pitchIn, strafeIn);
      setEngine(worldState.speedKmh + pitchNorm * 30, boosting);
    } else {
      // parked / idle — keep upright and on the ground/pad, rotors slow
      const t2 = body.translation();
      if (groupRef.current) {
        groupRef.current.position.set(t2.x, t2.y, t2.z);
        groupRef.current.rotation.set(0, heading.current, 0);
      }
    }

    /* ================= VISUAL SYNC ================= */
    if (groupRef.current && isPlayerHeli) {
      groupRef.current.position.set(t.x, t.y, t.z);
      groupRef.current.rotation.set(pitch.current, heading.current, roll.current);
    }

    // rotor spin: fast when occupied/throttled, slow idle otherwise
    const spinSpeed = isPlayerHeli ? 38 : 6;
    rotorSpin.current += spinSpeed * delta;
    if (mainRotorRef.current) mainRotorRef.current.rotation.y = rotorSpin.current;
    if (tailRotorRef.current) tailRotorRef.current.rotation.x = rotorSpin.current * 1.6;

    if (driverRef.current) {
      driverRef.current.visible = isPlayerHeli;
    }
  });

  return (
    <>
      <RigidBody
        ref={bodyRef}
        colliders={false}
        position={position}
        mass={3}
        linearDamping={0.6}
        angularDamping={5}
        friction={0.5}
        canSleep={false}
        enabledRotations={[true, true, true]}
        ccd
      >
        {/* light body collider so it doesn't grind against buildings */}
        <CuboidCollider args={[1.2, 0.8, 2.4]} position={[0, 0.6, 0]} />
      </RigidBody>

      <group ref={groupRef}>
        {/* main body */}
        <mesh position={[0, 0.7, 0]} castShadow>
          <boxGeometry args={[1.8, 1.0, 2.6]} />
          <meshStandardMaterial color="#1f6f5c" flatShading metalness={0.3} roughness={0.4} />
        </mesh>
        {/* cockpit glass */}
        <mesh position={[0, 1.05, 1.2]}>
          <boxGeometry args={[1.3, 0.7, 0.7]} />
          <meshStandardMaterial
            color="#9fd9ff"
            emissive="#4aa8ff"
            emissiveIntensity={0.3}
            transparent
            opacity={0.55}
            flatShading
          />
        </mesh>
        {/* tail boom */}
        <mesh position={[0, 0.9, -2.3]} castShadow>
          <boxGeometry args={[0.45, 0.45, 2.6]} />
          <meshStandardMaterial color="#1a5d4d" flatShading metalness={0.3} roughness={0.4} />
        </mesh>
        {/* tail fin */}
        <mesh position={[0, 1.4, -3.4]}>
          <boxGeometry args={[0.1, 0.8, 0.6]} />
          <meshStandardMaterial color="#155042" flatShading />
        </mesh>
        {/* skids */}
        <mesh position={[-0.7, 0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.1, 0.1, 3.0, 8]} />
          <meshStandardMaterial color="#0d0d12" flatShading />
        </mesh>
        <mesh position={[0.7, 0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.1, 0.1, 3.0, 8]} />
          <meshStandardMaterial color="#0d0d12" flatShading />
        </mesh>

        {/* main rotor (4 blades) */}
        <group ref={mainRotorRef} position={[0, 1.7, 0]}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} rotation={[0, (i * Math.PI) / 2, 0]} position={[0, 0, 0]}>
              <boxGeometry args={[7.0, 0.06, 0.4]} />
              <meshStandardMaterial color="#222228" flatShading />
            </mesh>
          ))}
          {/* hub */}
          <mesh>
            <cylinderGeometry args={[0.18, 0.18, 0.4, 8]} />
            <meshStandardMaterial color="#444" flatShading />
          </mesh>
        </group>

        {/* tail rotor */}
        <group ref={tailRotorRef} position={[0.25, 1.4, -3.5]}>
          {[0, 1].map((i) => (
            <mesh key={i} rotation={[(i * Math.PI) / 2, 0, 0]}>
              <boxGeometry args={[0.06, 1.4, 0.25]} />
              <meshStandardMaterial color="#222228" flatShading />
            </mesh>
          ))}
        </group>

        {/* nav lights */}
        <mesh position={[0.9, 0.9, 1.0]}>
          <boxGeometry args={[0.12, 0.12, 0.12]} />
          <meshBasicMaterial color="#ff3344" toneMapped={false} />
        </mesh>
        <mesh position={[-0.9, 0.9, 1.0]}>
          <boxGeometry args={[0.12, 0.12, 0.12]} />
          <meshBasicMaterial color="#33ff66" toneMapped={false} />
        </mesh>

        {/* pilot (visible only when occupied) */}
        <group ref={driverRef} position={[0, 1.05, 0.4]} scale={0.85}>
          <CharacterMesh skin="#e8b98f" shirt="#1f6f5c" holding />
        </group>
      </group>
    </>
  );
}
