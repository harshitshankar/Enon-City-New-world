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

const _tmpColor = new THREE.Color();

/**
 * Car — responsive arcade driving.
 *
 * Driving model: we read throttle + steering, then directly drive the rigid
 * body's linear & angular velocity (velocity-control). This gives crisp,
 * predictable GTA-style handling while Rapier still resolves collisions.
 *   - throttle: accelerate forward/back along the car's facing
 *   - steering: yaw the car, scaled by current speed
 *   - lateral grip: bleed sideways velocity for arcade traction
 */
export default function Car({ id, position = [0, 1, 0], color = "#c0392b", aiPath = null, police = false }) {
  const bodyRef = useRef();
  const groupRef = useRef();
  const wheelRefs = [useRef(), useRef(), useRef(), useRef()];
  const frontWheelRefs = [wheelRefs[0], wheelRefs[1]];
  const driverRef = useRef();
  const nosFxRef = useRef();
  const headlightRef = useRef();
  const nosParticleRef = useRef();
  const sirenRef = useRef();

  const activeVehicle = useGameStore((s) => s.activeVehicle);
  const isPlayerCar = activeVehicle === id;

  useEffect(() => {
    if (isPlayerCar) {
      startEngine();
      return () => stopEngine();
    }
  }, [isPlayerCar]);

  const occupiedNPC = useRef(true);
  const heading = useRef(0);
  const speed = useRef(0); // signed forward speed (m/s)
  const steerVisual = useRef(0);
  const wheelSpin = useRef(0);
  const nosTimerPool = useRef(0);
  const nosWasOn = useRef(false);
  const screechT = useRef(0);
  const health = useRef(100);
  const destroyed = useRef(false);
  const respawnT = useRef(0);
  const damageFlash = useRef(0);

  const tmp = useMemo(
    () => ({
      q: new THREE.Quaternion(),
      euler: new THREE.Euler(),
      dummy: new THREE.Object3D(),
    }),
    []
  );

  // World-space NoS particle pool (jet flames + smoke puffs behind exhausts).
  const NOS_PARTICLES = 36;
  const nosParticles = useRef(
    Array.from({ length: NOS_PARTICLES }, () => ({
      active: false,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      life: 0,
      max: 0.5,
      size: 1,
    }))
  );
  const nosSpawnAcc = useRef(0);
  const hiddenMat = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, -999, 0);
    o.scale.setScalar(0.0001);
    o.updateMatrix();
    return o.matrix.clone();
  }, []);

  const wheelOffsets = useMemo(
    () => [
      [-0.85, -0.3, 1.25],
      [0.85, -0.3, 1.25],
      [-0.85, -0.3, -1.25],
      [0.85, -0.3, -1.25],
    ],
    []
  );

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
      occupiedNPC.current = false;
      playSfx("hijack");
    };
    const explode = () => {
      if (destroyed.current) return;
      destroyed.current = true;
      const t = bodyRef.current?.translation();
      const pos = t ? [t.x, t.y + 0.6, t.z] : [0, 1, 0];
      requestExplosion({ pos, scale: 1.6 });
      occupiedNPC.current = false;
      respawnT.current = 0;
      const st = useGameStore.getState();
      st.addCarKill();
      // if it was the player's car, kick the player out
      if (useGameStore.getState().activeVehicle === id) {
        st.exitVehicle();
        st.damage(35);
      }
    };
    const onHit = (dmg) => {
      if (destroyed.current) return;
      health.current -= dmg;
      damageFlash.current = 0.12;
      playSfx("metal");
      if (health.current <= 0) explode();
    };
    const unreg = registerVehicle(id, {
      id,
      ref: bodyRef,
      getPos,
      get occupied() {
        // A car is "occupied" (not free to hijack) when the player is driving
        // it. This keeps the hijackable-prompt logic correct without ever
        // unmounting the actor from the world.
        return useGameStore.getState().activeVehicle === id;
      },
      destroyed: () => destroyed.current,
      onHit,
      onHijack,
    });
    return unreg;
  }, [id]);

  // Initialize heading from spawn rotation.
  useEffect(() => {
    heading.current = 0;
  }, []);

  useFrame((state, rawDelta) => {
    const ts = useGameStore.getState().timeScale;
    const delta = Math.min(rawDelta, 0.05) * ts;
    const body = bodyRef.current;
    if (!body) return;

    const t = body.translation();

    /* ================= DESTROYED STATE ================= */
    if (destroyed.current) {
      // sink/hide wreck, then respawn far away after a delay
      respawnT.current += delta;
      if (groupRef.current) {
        groupRef.current.position.set(t.x, t.y, t.z);
        groupRef.current.rotation.set(0, heading.current, 0);
        groupRef.current.visible = respawnT.current < 0.15; // pop out after blast
      }
      if (respawnT.current > 6) {
        // respawn
        destroyed.current = false;
        health.current = 100;
        occupiedNPC.current = !!aiPath || Math.random() < 0.5;
        if (groupRef.current) groupRef.current.visible = true;
        body.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        speed.current = 0;
      }
      return;
    }

    if (damageFlash.current > 0) damageFlash.current -= delta;

    /* ================= PLAYER DRIVING ================= */
    if (isPlayerCar) {
      // Input
      const gas = inputState.gas; // 0..1 forward
      const brake = inputState.brake; // 0..1 reverse/brake
      const steerInput = THREE.MathUtils.clamp(inputState.move.x, -1, 1);
      const handbrake = inputState.handbrake;
      const nosOn = inputState.nos && worldState.nosCharge > 0;

      // Longitudinal speed integration (arcade)
      const maxFwd = nosOn ? 32 : 22;
      const maxRev = -10;
      const accel = 26;
      const decel = 40;
      const drag = 8;

      if (nosOn) {
        // NoS auto-throttles: full forward acceleration WITHOUT needing gas.
        speed.current += (accel + 30) * delta;
      } else if (gas > 0.05) {
        speed.current += accel * gas * delta;
      } else if (brake > 0.05) {
        // brake then reverse
        if (speed.current > 0.2) speed.current -= decel * brake * delta;
        else speed.current -= accel * 0.7 * brake * delta;
      } else {
        // natural drag toward 0
        if (speed.current > 0) speed.current = Math.max(0, speed.current - drag * delta);
        else if (speed.current < 0) speed.current = Math.min(0, speed.current + drag * delta);
      }
      if (handbrake) {
        speed.current *= 1 - Math.min(1, 4 * delta);
      }
      speed.current = THREE.MathUtils.clamp(speed.current, maxRev, maxFwd);

      // tire screech when handbraking / hard-turning at speed
      const turning = Math.abs(steerInput) > 0.4 && Math.abs(speed.current) > 8;
      if ((handbrake && Math.abs(speed.current) > 5) || turning) {
        screechT.current -= delta;
        if (screechT.current <= 0) {
          playSfx("screech");
          screechT.current = 0.35;
        }
      }

      // Steering: rotate heading proportional to speed & input.
      const speedFactor = THREE.MathUtils.clamp(
        Math.abs(speed.current) / 8,
        0,
        1
      );
      const steerRate = (handbrake ? 2.8 : 2.0) * speedFactor;
      const dirSign = speed.current >= 0 ? 1 : -1;
      heading.current -= steerInput * steerRate * dirSign * delta;
      steerVisual.current = THREE.MathUtils.lerp(
        steerVisual.current,
        steerInput,
        Math.min(1, delta * 10)
      );

      // Apply velocity along the (new) heading.
      const sinH = Math.sin(heading.current);
      const cosH = Math.cos(heading.current);
      const cur = body.linvel();
      const vx = sinH * speed.current;
      const vz = cosH * speed.current;
      body.setLinvel({ x: vx, y: cur.y, z: vz }, true);

      // Apply rotation directly (kinematic-style yaw).
      tmp.q.setFromEuler(tmp.euler.set(0, heading.current, 0));
      body.setRotation(tmp.q, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);

      const speedKmh = Math.abs(speed.current) * 3.6;

      // Nitro
      if (nosOn && !nosWasOn.current) playSfx("nos");
      nosWasOn.current = nosOn;
      if (nosOn) {
        worldState.nosCharge = Math.max(0, worldState.nosCharge - delta * 0.4);
      } else {
        worldState.nosCharge = Math.min(1, worldState.nosCharge + delta * 0.16);
      }

      // NoS cone visuals
      if (nosFxRef.current) {
        nosFxRef.current.visible = nosOn;
        if (nosOn) {
          nosTimerPool.current += delta * 18;
          const s = 0.6 + Math.abs(Math.sin(nosTimerPool.current)) * 0.5;
          nosFxRef.current.scale.set(s, s, 1.6 + s);
        }
      }

      // NoS particle emitters (world-space jet flames + smoke)
      if (nosOn) {
        const sinH = Math.sin(heading.current);
        const cosH = Math.cos(heading.current);
        // exhaust point behind the car
        const ex = t.x - sinH * 2.5;
        const ez = t.z - cosH * 2.5;
        nosSpawnAcc.current += delta;
        const rate = 0.012;
        while (nosSpawnAcc.current >= rate) {
          nosSpawnAcc.current -= rate;
          const p = nosParticles.current.find((x) => !x.active);
          if (p) {
            p.active = true;
            const side = (Math.random() - 0.5) * 0.6;
            p.pos.set(ex + cosH * side, 0.4 + Math.random() * 0.2, ez - sinH * side);
            // shoot backward + small spread
            const back = 6 + Math.random() * 4;
            p.vel.set(
              -sinH * back + (Math.random() - 0.5) * 2,
              (Math.random() - 0.3) * 1.5,
              -cosH * back + (Math.random() - 0.5) * 2
            );
            p.life = 0;
            p.max = 0.35 + Math.random() * 0.35;
            p.size = 0.4 + Math.random() * 0.5;
          }
        }
      }

      // Telemetry
      worldState.vehiclePos.x = t.x;
      worldState.vehiclePos.y = t.y;
      worldState.vehiclePos.z = t.z;
      worldState.vehicleHeading = heading.current;
      worldState.speedKmh = speedKmh;

      setEngine(speedKmh, nosOn);
      wheelSpin.current += speed.current * delta * 2.2;
    } else if (police && occupiedNPC.current) {
      /* ================= POLICE CHASE ================= */
      drivePolice(body, delta, t);
    } else if (aiPath && occupiedNPC.current) {
      /* ================= AI TRAFFIC ================= */
      driveAI(body, delta, aiPath, t);
    } else {
      // parked / empty — keep heading synced from body
      const rot = body.rotation();
      tmp.q.set(rot.x, rot.y, rot.z, rot.w);
      tmp.euler.setFromQuaternion(tmp.q, "YXZ");
      heading.current = tmp.euler.y;
    }

    /* ================= VISUAL SYNC ================= */
    if (groupRef.current) {
      groupRef.current.position.set(t.x, t.y, t.z);
      groupRef.current.rotation.set(0, heading.current, 0);
    }

    // Police siren flash
    if (police && sirenRef.current) {
      const flash = Math.sin(sirenT.current) > 0;
      const a = sirenRef.current.children[0];
      const b = sirenRef.current.children[1];
      if (a) a.material.color.setHex(flash ? 0xff2222 : 0x330000);
      if (b) b.material.color.setHex(flash ? 0x000033 : 0x2222ff);
    }

    // Update world-space NoS particles (player car only).
    const pm = nosParticleRef.current;
    if (pm) {
      let pi = 0;
      for (const p of nosParticles.current) {
        if (!p.active) continue;
        p.life += delta;
        if (p.life >= p.max) {
          p.active = false;
          continue;
        }
        p.vel.multiplyScalar(1 - Math.min(1, delta * 3));
        p.vel.y += 2 * delta; // float up
        p.pos.addScaledVector(p.vel, delta);
        const k = p.life / p.max;
        tmp.dummy.position.copy(p.pos);
        tmp.dummy.quaternion.identity();
        const s = p.size * (0.5 + k * 1.6);
        tmp.dummy.scale.setScalar(s);
        tmp.dummy.updateMatrix();
        pm.setMatrixAt(pi, tmp.dummy.matrix);
        // NoS flame colour: blue (fresh/hot) -> red (cooling) gradient.
        const col = k < 0.45 ? 0x66ccff : k < 0.8 ? 0xff5a5a : 0xff8a3c;
        pm.setColorAt(pi, _tmpColor.setHex(col));
        pi++;
      }
      for (let j = pi; j < NOS_PARTICLES; j++) pm.setMatrixAt(j, hiddenMat);
      pm.count = NOS_PARTICLES;
      pm.instanceMatrix.needsUpdate = true;
      if (pm.instanceColor) pm.instanceColor.needsUpdate = true;
    }

    // wheel spin + front steer visual
    wheelRefs.forEach((wr) => {
      if (wr.current) wr.current.rotation.x = wheelSpin.current;
    });
    frontWheelRefs.forEach((wr) => {
      if (wr.current) wr.current.rotation.y = steerVisual.current * 0.5;
    });

    if (driverRef.current) {
      // Hide the player's own driver avatar so its head doesn't poke above
      // the cabin roof in chase-cam view. Keep NPC traffic drivers visible.
      driverRef.current.visible = occupiedNPC.current;
    }
  });

  /* ---- AI waypoint follow (arcade velocity control) ---- */
  const aiState = useRef({ i: Math.floor(Math.random() * 4) });
  function driveAI(body, delta, path, t) {
    const wp = path[aiState.current.i % path.length];
    const dx = wp[0] - t.x;
    const dz = wp[1] - t.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 5) aiState.current.i++;

    const desired = Math.atan2(dx, dz);
    let diff = desired - heading.current;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    heading.current += THREE.MathUtils.clamp(diff, -2 * delta, 2 * delta);

    const sp = 10;
    const sinH = Math.sin(heading.current);
    const cosH = Math.cos(heading.current);
    const cur = body.linvel();
    body.setLinvel({ x: sinH * sp, y: cur.y, z: cosH * sp }, true);
    tmp.q.setFromEuler(tmp.euler.set(0, heading.current, 0));
    body.setRotation(tmp.q, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    wheelSpin.current += sp * delta * 2.2;
  }

  /* ---- Police chase the player ---- */
  const sirenT = useRef(Math.random() * 6);
  function drivePolice(body, delta, t) {
    const px = worldState.playerPos.x;
    const pz = worldState.playerPos.z;
    const dx = px - t.x;
    const dz = pz - t.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(dx, dz);
    let diff = desired - heading.current;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    heading.current += THREE.MathUtils.clamp(diff, -2.6 * delta, 2.6 * delta);

    // keep a slight gap so they don't constantly ram
    const target = dist > 8 ? 17 : dist > 4 ? 8 : 2;
    speed.current += (target - speed.current) * Math.min(1, delta * 2.2);
    const sinH = Math.sin(heading.current);
    const cosH = Math.cos(heading.current);
    const cur = body.linvel();
    body.setLinvel({ x: sinH * speed.current, y: cur.y, z: cosH * speed.current }, true);
    tmp.q.setFromEuler(tmp.euler.set(0, heading.current, 0));
    body.setRotation(tmp.q, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    wheelSpin.current += speed.current * delta * 2.2;

    sirenT.current += delta * 8;
    // contact damage
    if (dist < 3.3) useGameStore.getState().damage(7 * delta * 6);

    worldState.blips.push({ x: t.x, z: t.z, type: "hostile" });
  }

  return (
    <>
      <RigidBody
        ref={bodyRef}
        colliders={false}
        position={position}
        mass={2}
        linearDamping={0.4}
        angularDamping={4}
        friction={0.5}
        canSleep={false}
        enabledRotations={[false, true, false]}
        ccd
      >
        <CuboidCollider args={[1.0, 0.55, 2.1]} position={[0, 0.2, 0]} />
      </RigidBody>

      {/* World-space NoS particles (only meaningful for the player car) */}
      {isPlayerCar && (
        <instancedMesh
          ref={nosParticleRef}
          args={[undefined, undefined, NOS_PARTICLES]}
          frustumCulled={false}
        >
          <sphereGeometry args={[0.32, 6, 6]} />
          <meshBasicMaterial
            color="#aee4ff"
            toneMapped={false}
            transparent
            opacity={0.85}
            depthWrite={false}
          />
        </instancedMesh>
      )}

      <group ref={groupRef}>
        <mesh position={[0, 0.15, 0]} castShadow>
          <boxGeometry args={[2, 0.7, 4.2]} />
          {/* Glossy car paint: higher metalness + lower roughness for a sheen */}
          <meshStandardMaterial color={police ? "#1a2740" : color} flatShading metalness={0.4} roughness={0.3} />
        </mesh>
        {police && (
          <>
            <mesh position={[0, 0.15, 0]}>
              <boxGeometry args={[2.02, 0.4, 1.6]} />
              <meshStandardMaterial color="#e8e8ee" flatShading metalness={0.3} roughness={0.4} />
            </mesh>
            <group ref={sirenRef} position={[0, 1.12, -0.2]}>
              <mesh position={[-0.35, 0, 0]}>
                <boxGeometry args={[0.5, 0.18, 0.4]} />
                <meshBasicMaterial color="#ff2222" toneMapped={false} />
              </mesh>
              <mesh position={[0.35, 0, 0]}>
                <boxGeometry args={[0.5, 0.18, 0.4]} />
                <meshBasicMaterial color="#2222ff" toneMapped={false} />
              </mesh>
            </group>
          </>
        )}
        <mesh position={[0, 0.72, -0.2]} castShadow>
          <boxGeometry args={[1.7, 0.6, 2]} />
          <meshStandardMaterial color="#10131a" flatShading />
        </mesh>
        <mesh position={[0, 0.74, 0.85]}>
          <boxGeometry args={[1.5, 0.5, 0.1]} />
          <meshStandardMaterial
            color="#9fd9ff"
            emissive="#4aa8ff"
            emissiveIntensity={0.3}
            transparent
            opacity={0.5}
          />
        </mesh>
        {/* headlights */}
        <mesh position={[-0.6, 0.15, 2.15]}>
          <boxGeometry args={[0.32, 0.22, 0.1]} />
          <meshBasicMaterial color="#fff6cc" toneMapped={false} />
        </mesh>
        <mesh position={[0.6, 0.15, 2.15]}>
          <boxGeometry args={[0.32, 0.22, 0.1]} />
          <meshBasicMaterial color="#fff6cc" toneMapped={false} />
        </mesh>
        {/* tail lights */}
        <mesh position={[-0.6, 0.15, -2.15]}>
          <boxGeometry args={[0.32, 0.22, 0.08]} />
          <meshBasicMaterial color="#ff3344" toneMapped={false} />
        </mesh>
        <mesh position={[0.6, 0.15, -2.15]}>
          <boxGeometry args={[0.32, 0.22, 0.08]} />
          <meshBasicMaterial color="#ff3344" toneMapped={false} />
        </mesh>

        {/* headlight cone + actual spotlight (player car only) */}
        <mesh position={[0, 0, 4.2]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[2.4, 8, 14, 1, true]} />
          <meshBasicMaterial
            color="#fff2c0"
            transparent
            opacity={0.07}
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        {isPlayerCar && (
          <spotLight
            ref={headlightRef}
            position={[0, 0.4, 2]}
            target-position={[0, -2, 12]}
            angle={0.5}
            penumbra={0.6}
            intensity={6}
            distance={26}
            color="#fff2c0"
            castShadow={false}
          />
        )}

        {wheelOffsets.map((o, i) => (
          <group key={i} position={o}>
            <mesh ref={wheelRefs[i]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.45, 0.45, 0.32, 12]} />
              <meshStandardMaterial color="#15151a" flatShading />
            </mesh>
          </group>
        ))}

        <group ref={driverRef} position={[-0.35, 0.05, 0.1]} scale={0.85}>
          <CharacterMesh
            skin={isPlayerCar ? "#e8b98f" : "#caa07a"}
            shirt={isPlayerCar ? "#f4f0e8" : "#445"}
            holding
          />
        </group>

        <group ref={nosFxRef} visible={false}>
          {/* NoS flames: blue core cones + red outer haze (bluish-red gradient) */}
          <mesh position={[-0.55, 0, -2.4]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.25, 1.4, 8]} />
            <meshBasicMaterial color="#4ab8ff" toneMapped={false} transparent opacity={0.9} />
          </mesh>
          <mesh position={[0.55, 0, -2.4]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.25, 1.4, 8]} />
            <meshBasicMaterial color="#4ab8ff" toneMapped={false} transparent opacity={0.9} />
          </mesh>
          <mesh position={[0, 0, -3]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.45, 1.8, 8]} />
            <meshBasicMaterial color="#ff4a4a" toneMapped={false} transparent opacity={0.5} />
          </mesh>
        </group>
      </group>
    </>
  );
}
