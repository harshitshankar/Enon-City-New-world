import { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  useGameStore,
  inputState,
  worldState,
} from "../../store/useGameStore";

/**
 * Smooth, damped third-person camera.
 *  - Look input accumulates into TARGET yaw/pitch; the actual camera yaw/pitch
 *    eases toward the target each frame -> no jitter, lower perceived
 *    sensitivity, and it feels weighty rather than clunky.
 *  - foot / aim / drive modes.
 */
export default function CameraRig() {
  const { camera } = useThree();

  // Target (input) and smoothed (actual) orientation.
  const yawT = useRef(Math.PI);
  const pitchT = useRef(0.22);
  const yaw = useRef(Math.PI);
  const pitch = useRef(0.22);

  const target = useMemo(() => new THREE.Vector3(), []);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const st = useGameStore.getState();
    const mode = st.cameraMode;
    const mobile = st.isMobile;

    /* --------- accumulate look input into TARGET --------- */
    // Sensitivity: tuned down for phones; per-pixel on both.
    const sens = mobile ? 0.0042 : 0.0022;
    yawT.current -= inputState.look.x * sens;
    pitchT.current += inputState.look.y * sens;
    inputState.look.x = 0;
    inputState.look.y = 0;
    pitchT.current = THREE.MathUtils.clamp(pitchT.current, -0.3, 0.95);

    // Ease actual toward target (smooth, removes clunkiness).
    const ease = 1 - Math.pow(0.0008, delta); // ~frame-rate independent
    yaw.current += (yawT.current - yaw.current) * ease;
    pitch.current += (pitchT.current - pitch.current) * ease;

    const driving = mode === "drive";
    const aiming = mode === "aim" || inputState.aim;

    /* ---------------- DRIVE CAM ---------------- */
    if (driving) {
      const vh = worldState.vehicleHeading;
      const vp = worldState.vehiclePos;
      const flying = worldState.vehicleType === "heli";
      target.set(vp.x, vp.y + (flying ? 1.6 : 1.5), vp.z);

      // Helicopter gets a higher, further, more downward chase cam so you can
      // see the ground / rooftops to land. Cars keep the classic low chase.
      const back = flying ? 13 : 9.5;
      const up = flying ? 7.5 : 4.4;
      desired.set(
        vp.x - Math.sin(vh) * back,
        vp.y + up,
        vp.z - Math.cos(vh) * back
      );
      // smooth follow
      camera.position.lerp(desired, Math.min(1, delta * (flying ? 3 : 4)));
      // look a little ahead + down for helis to aid landing
      if (flying) {
        lookAt.set(vp.x + Math.sin(vh) * 6, vp.y - 4, vp.z + Math.cos(vh) * 6);
        camera.lookAt(lookAt);
      } else {
        camera.lookAt(target);
      }

      const targetFov = inputState.nos ? 78 : flying ? 70 : 64;
      camera.fov += (targetFov - camera.fov) * Math.min(1, delta * 5);
      camera.updateProjectionMatrix();
      return;
    }

    /* ---------------- FOOT / AIM CAM ---------------- */
    const pp = worldState.playerPos;
    const dist = aiming ? 3.0 : 5.4;
    const height = aiming ? 1.75 : 2.3;
    // Always keep an over-the-shoulder offset so the crosshair sits to the
    // RIGHT of the player's head (never on top of it).
    const shoulder = aiming ? 0.95 : 0.7;

    target.set(pp.x, pp.y + (aiming ? 1.55 : 1.5), pp.z);

    const cy = Math.cos(yaw.current);
    const sy = Math.sin(yaw.current);
    const cp = Math.cos(pitch.current);
    const sp = Math.sin(pitch.current);

    desired.set(
      pp.x + sy * dist * cp + cy * shoulder,
      pp.y + height + sp * dist,
      pp.z + cy * dist * cp - sy * shoulder
    );

    camera.position.lerp(desired, Math.min(1, delta * 12));

    // Aim the camera at a point further ahead so the crosshair points at the
    // world ahead of the player rather than the player's head.
    lookAt.copy(target);
    lookAt.x += cy * shoulder * 1.6 - sy * 6;
    lookAt.z -= sy * shoulder * 1.6 + cy * 6;
    lookAt.y += 0.2;
    camera.lookAt(lookAt);

    const targetFov = aiming ? 48 : 62;
    camera.fov += (targetFov - camera.fov) * Math.min(1, delta * 6);
    camera.updateProjectionMatrix();
  });

  return null;
}
