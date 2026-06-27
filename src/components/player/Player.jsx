import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody, CapsuleCollider } from "@react-three/rapier";
import * as THREE from "three";

import {
  useGameStore,
  inputState,
  worldState,
  consumeInteract,
  markCrime,
  WEAPON_META,
} from "../../store/useGameStore";
import useKeyboard from "../../hooks/useKeyboard";
import { nearestVehicle } from "../../lib/registry";
import { requestProjectile } from "../../lib/events";
import { playSfx } from "../../lib/audio";
import { showInterstitial } from "../../lib/ads";
import { HALF } from "../world/World";
import CharacterMesh from "./CharacterMesh";

const SPEED = 6.5;
const RUN_SPEED = 9;

export default function Player() {
  useKeyboard();

  const bodyRef = useRef();
  const visualRef = useRef();
  const charRef = useRef();
  const muzzleRef = useRef();
  const muzzleLightRef = useRef();

  const activeVehicle = useGameStore((s) => s.activeVehicle);
  const cameraMode = useGameStore((s) => s.cameraMode);
  const appearance = useGameStore((s) => s.playerAppearance);

  const walkPhase = useRef(0);
  const fireCooldown = useRef(0);
  const muzzleTimer = useRef(0); // counts down the muzzle-flash visibility
  const yaw = useRef(0); // facing heading
  const stepTimer = useRef(0);
  const airborne = useRef(false);

  // Reusable temp vectors (no GC).
  const tmp = useMemo(
    () => ({
      camDir: new THREE.Vector3(),
      shootDir: new THREE.Vector3(),
      muzzle: new THREE.Vector3(),
      lin: new THREE.Vector3(),
    }),
    []
  );

  const driving = !!activeVehicle;

  useEffect(() => {
    if (!driving && bodyRef.current) {
      bodyRef.current.wakeUp();
    }
  }, [driving]);

  /* ---- DEATH / RESPAWN -------------------------------------------------
   * When health hits 0:
   *   - SOLO: kick out of any vehicle, drop diagonally opposite on the map
   *     after one frame, reset health + wanted (instant respawn, like before).
   *   - MULTIPLAYER: start a 3s respawn timer (store.respawnAt) so the HUD can
   *     show a countdown overlay, then respawn at a team-appropriate spawn
   *     point that is far from enemies. Score/kills are kept.
   * `spawnId` bumps so other systems can react if needed.
   * ------------------------------------------------------------------- */
  const health = useGameStore((s) => s.health);
  const dead = useRef(false);

  // Pick a respawn point. In a team match, bias toward the team's home corner
  // and away from where enemies currently are; otherwise (solo / no team) drop
  // diagonally opposite the death location.
  const pickSpawn = (st) => {
    const px = worldState.playerPos.x;
    const pz = worldState.playerPos.z;
    const lim = HALF - 8;
    if (st.multiplayer && st.team) {
      // Team A home = -x,-z corner; Team B home = +x,+z corner.
      const hx = st.team === "A" ? -lim : lim;
      const hz = st.team === "A" ? -lim : lim;
      const jitter = () => (Math.random() - 0.5) * 26;
      return { x: THREE.MathUtils.clamp(hx + jitter(), -lim, lim), z: THREE.MathUtils.clamp(hz + jitter(), -lim, lim) };
    }
    return {
      x: THREE.MathUtils.clamp(-px + (Math.random() - 0.5) * 12, -lim, lim),
      z: THREE.MathUtils.clamp(-pz + (Math.random() - 0.5) * 12, -lim, lim),
    };
  };

  useEffect(() => {
    const st = useGameStore.getState();
    if (health <= 0 && !dead.current) {
      dead.current = true;
      // If they died inside a car, the Car explodes on its own and calls
      // exitVehicle(); make sure we're on foot before relocating.
      if (st.activeVehicle) st.exitVehicle();

      // Monetisation: request an interstitial on death (rate-limited + no-op on web).
      showInterstitial();

      // SOLO: instant respawn (keep the original snappy feel).
      // MULTIPLAYER: 3s respawn delay so there's a beat before you drop back in.
      const RESPAWN_MS = st.multiplayer ? 3000 : 0;
      const respawnAt = RESPAWN_MS ? Date.now() + RESPAWN_MS : null;
      if (RESPAWN_MS) useGameStore.setState({ respawnAt });

      const doRespawn = () => {
        const cur = useGameStore.getState();
        const { x: nx, z: nz } = pickSpawn(cur);
        // give the body a beat to settle before teleport (Rapier needs the body
        // to exist + be on foot). Wait one frame.
        requestAnimationFrame(() => {
          const body = bodyRef.current;
          if (body) {
            body.setTranslation({ x: nx, y: 2.5, z: nz }, true);
            body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          }
          playSfx("explosion");
          useGameStore.getState().respawn();
          dead.current = false;
        });
      };

      if (RESPAWN_MS) {
        const t = setTimeout(doRespawn, RESPAWN_MS);
        return () => clearTimeout(t);
      }
      doRespawn();
    }
  }, [health]);

  useFrame((state, rawDelta) => {
    const ts = useGameStore.getState().timeScale;
    const delta = Math.min(rawDelta, 0.05) * ts;
    const body = bodyRef.current;
    if (!body) return;

    /* ------------------------------------------------------------------ */
    /*  DRIVING                                                            */
    /* ------------------------------------------------------------------ */
    if (driving) {
      if (visualRef.current) visualRef.current.visible = false;
      body.setTranslation({ x: 0, y: -50, z: 0 }, false);
      body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      worldState.playerPos.x = worldState.vehiclePos.x;
      worldState.playerPos.z = worldState.vehiclePos.z;
      worldState.playerRot = worldState.vehicleHeading;
      handleInteract(true);
      return;
    }
    if (visualRef.current) visualRef.current.visible = true;

    /* ------------------------------------------------------------------ */
    /*  ON-FOOT MOVEMENT — camera-relative, accurate                       */
    /* ------------------------------------------------------------------ */
    const cam = state.camera;
    // Camera forward direction projected onto the ground plane.
    cam.getWorldDirection(tmp.camDir);
    tmp.camDir.y = 0;
    tmp.camDir.normalize();

    // Build a clean basis from the camera:
    //   forward = where the camera looks (ground projected)
    //   right   = 90° clockwise of forward
    const fwdX = tmp.camDir.x;
    const fwdZ = tmp.camDir.z;
    const rightX = -fwdZ; // perpendicular
    const rightZ = fwdX;

    // Joystick / WASD:  move.z = -1 (up/forward), move.x = +1 (right)
    const ix = inputState.move.x; // left(-)/right(+)
    const iz = inputState.move.z; // forward(-)/back(+)
    const moving = inputState.moveActive && (ix !== 0 || iz !== 0);

    const cur = body.linvel();
    const aiming = inputState.aim || cameraMode === "aim";
    const speed = aiming ? SPEED * 0.75 : RUN_SPEED;

    if (moving) {
      // World move dir = forward*(-iz) + right*(ix)
      let mx = fwdX * -iz + rightX * ix;
      let mz = fwdZ * -iz + rightZ * ix;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len;
      mz /= len;
      tmp.lin.set(mx * speed, cur.y, mz * speed);
      // Face movement direction unless aiming (then face camera).
      if (!aiming) yaw.current = Math.atan2(mx, mz);
      walkPhase.current += delta * 14;
      // footstep cadence
      stepTimer.current -= rawDelta;
      if (stepTimer.current <= 0) {
        playSfx("footstep");
        stepTimer.current = aiming ? 0.42 : 0.32;
      }
    } else {
      tmp.lin.set(0, cur.y, 0);
      stepTimer.current = 0;
    }

    // When aiming, the character faces the same way the camera looks.
    if (aiming) yaw.current = Math.atan2(fwdX, fwdZ);

    body.setLinvel(tmp.lin, true);

    // jump
    if (inputState.jump) {
      if (Math.abs(cur.y) < 0.8) {
        body.setLinvel({ x: tmp.lin.x, y: 8.5, z: tmp.lin.z }, true);
        playSfx("jump");
        airborne.current = true;
      }
      inputState.jump = false;
    }
    // landing detection
    if (airborne.current && cur.y <= 0.1 && Math.abs(cur.y) < 0.5) {
      airborne.current = false;
      playSfx("land");
    } else if (cur.y > 1) {
      airborne.current = true;
    }

    // Smoothly rotate visual mesh toward yaw.
    if (visualRef.current) {
      const cury = visualRef.current.rotation.y;
      let diff = yaw.current - cury;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      visualRef.current.rotation.y = cury + diff * Math.min(1, delta * 16);
    }

    // Telemetry.
    const pos = body.translation();
    worldState.playerPos.x = pos.x;
    worldState.playerPos.y = pos.y;
    worldState.playerPos.z = pos.z;
    worldState.playerRot = yaw.current;

    // Muzzle flash: place it at the muzzle point (front of the player, chest
    // height, along the aim direction) and show it while muzzleTimer > 0.
    if (muzzleTimer.current > 0) {
      muzzleTimer.current -= rawDelta;
      if (muzzleRef.current) {
        muzzleRef.current.visible = true;
        const mx = pos.x + tmp.camDir.x * 0.5;
        const mz = pos.z + tmp.camDir.z * 0.5;
        muzzleRef.current.position.set(mx, pos.y + 1.25, mz);
        const flick = 0.7 + Math.random() * 0.5;
        muzzleRef.current.scale.setScalar(flick);
      }
      if (muzzleLightRef.current) {
        muzzleLightRef.current.visible = true;
        muzzleLightRef.current.position.set(pos.x + tmp.camDir.x * 0.5, pos.y + 1.25, pos.z + tmp.camDir.z * 0.5);
      }
    } else if (muzzleRef.current) {
      muzzleRef.current.visible = false;
      if (muzzleLightRef.current) muzzleLightRef.current.visible = false;
    }

    /* ------------------------------------------------------------------ */
    /*  SHOOTING                                                           */
    /* ------------------------------------------------------------------ */
    fireCooldown.current -= rawDelta; // real time for fire rate
    if (inputState.shoot && fireCooldown.current <= 0) {
      tryShoot(state);
    }

    handleInteract(false);
  });

  function tryShoot(state) {
    const st = useGameStore.getState();
    const w = st.currentWeapon;
    const meta = WEAPON_META[w];

    if (!st.consumeAmmo()) {
      // Clip empty -> auto-reload from reserve, then keep firing.
      const a = st.ammo[w];
      if (a && a.reserve > 0) {
        st.reloadCurrent();
        playSfx("reload");
        fireCooldown.current = 0.6; // short reload pause
      } else {
        playSfx("empty");
        fireCooldown.current = 0.4;
      }
      return;
    }
    fireCooldown.current = meta.fireRate;

    // Shoot straight along the camera forward direction (screen center).
    const cam = state.camera;
    cam.getWorldDirection(tmp.shootDir);
    tmp.shootDir.normalize();

    // Muzzle point: ray-march FORWARD from the camera position along the aim
    // direction until we're just past the player's chest, then place the
    // projectile there. Because the projectile starts on the camera->target
    // ray and keeps travelling along it, the tracer always passes through the
    // crosshair (screen centre) — in BOTH foot and aim modes.
    //
    // The old code spawned at playerPos.y+1.2 along camDir, but in non-aim mode
    // the camera sits back+up with a shoulder offset and tilts downward, so
    // that spawn missed the crosshair and ploughed into the ground at close
    // range. This fixes "I can only hit things while aiming".
    const pp = worldState.playerPos;
    const chestY = pp.y + 1.2;
    let d = 0.8;
    const dx0 = cam.position.x, dy0 = cam.position.y, dz0 = cam.position.z;
    for (let i = 0; i < 48; i++) {
      const hx = dx0 + tmp.shootDir.x * d - pp.x;
      const hz = dz0 + tmp.shootDir.z * d - pp.z;
      const hy = dy0 + tmp.shootDir.y * d;
      // stop once we're at/just past the player's chest along the aim line
      if (hx * hx + hz * hz < 1.2 && hy > chestY - 1.6) break;
      d += 0.35;
    }
    const muzzleDist = Math.max(d, 1.2);
    tmp.muzzle.set(
      dx0 + tmp.shootDir.x * muzzleDist,
      Math.max(0.5, dy0 + tmp.shootDir.y * muzzleDist),
      dz0 + tmp.shootDir.z * muzzleDist
    );

    worldState.aimDir.x = tmp.shootDir.x;
    worldState.aimDir.y = tmp.shootDir.y;
    worldState.aimDir.z = tmp.shootDir.z;

    requestProjectile({
      type: w,
      pos: [tmp.muzzle.x, tmp.muzzle.y, tmp.muzzle.z],
      dir: [tmp.shootDir.x, tmp.shootDir.y, tmp.shootDir.z],
      owner: "player",
    });

    // Trigger the muzzle flash (positioned + shown next frame in useFrame).
    muzzleTimer.current = 0.06;

    playSfx(w === "rocket" ? "rocket" : w === "bow" ? "bow" : "shot");
    st.addWanted(0.04);
    markCrime();
  }

  function handleInteract(isDriving) {
    const st = useGameStore.getState();
    if (isDriving) {
      if (consumeInteract()) {
        st.exitVehicle();
        playSfx("door");
        const vx = worldState.vehiclePos.x;
        const vz = worldState.vehiclePos.z;
        // Exit beside the vehicle. For a helicopter keep the player at the
        // heli's current altitude (clamped) so they don't teleport to the
        // ground mid-flight; for a car, drop to ground level.
        const flying = worldState.vehicleType === "heli";
        const ey = flying ? Math.max(1.4, worldState.vehiclePos.y - 0.5) : 1.4;
        bodyRef.current.setTranslation({ x: vx + 2.8, y: ey, z: vz }, true);
        bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      return;
    }
    const pos = bodyRef.current.translation();
    const near = nearestVehicle(pos.x, pos.z, 5, pos.y);
    const curNear = st.nearVehicle;
    if (near && curNear !== near.id) st.setNearVehicle(near.id);
    else if (!near && curNear) st.setNearVehicle(null);

    if (near && consumeInteract()) {
      near.onHijack?.();
      st.enterVehicle(near.id);
      playSfx("door");
    }
  }

  const aiming = inputState.aim || cameraMode === "aim";

  return (
    <RigidBody
      ref={bodyRef}
      colliders={false}
      mass={1}
      position={[6, 2, 6]}
      enabledRotations={[false, false, false]}
      linearDamping={0.25}
      friction={0.2}
      canSleep={false}
      ccd
    >
      <CapsuleCollider args={[0.5, 0.4]} position={[0, 1, 0]} />
      <group ref={visualRef}>
        <CharacterMesh
          ref={charRef}
          walkPhase={walkPhase.current}
          holding={aiming}
          skin={appearance.skin}
          hair={appearance.hair}
          shirt={appearance.shirt}
          pants={appearance.pants}
        />
      </group>
      {/* Muzzle flash (world-positioned each shot, hidden otherwise) */}
      <mesh ref={muzzleRef} visible={false}>
        <sphereGeometry args={[0.18, 8, 8]} />
        <meshBasicMaterial color="#ffe98a" toneMapped={false} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <pointLight
        ref={muzzleLightRef}
        visible={false}
        intensity={6}
        distance={10}
        decay={2}
        color="#ffd27a"
      />
    </RigidBody>
  );
}
