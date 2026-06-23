import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { peers } from "../../lib/net";
import { worldState } from "../../store/useGameStore";

/**
 * RemotePlayers — renders up to 7 other human players in the shared city.
 *
 * Each peer's pose arrives over the network (~15 Hz) into the mutable `peers`
 * map in net.js. We interpolate each avatar toward its latest reported position
 * each frame for smoothness, render a simple body + name tag, and push a
 * distinct blip onto the minimap so other players show up on radar.
 *
 * Rendered inside the physics scene but with NO local rigidbodies — remote
 * players are pure ghosts (visual only); their cars/helis would be driven on
 * their own client. Shooting them is handled via the server 'hit' message.
 */
const MAX = 7;

// Distinct blip colors per remote player so they're identifiable on the map.
const BLIP_COLORS = ["#7be0ff", "#7CFF6B", "#ffd24d", "#ff8a3c", "#c08bff", "#ff6ec7", "#3be86a"];

export default function RemotePlayers() {
  const rootRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Per-remote-player smoothed pose cache (interpolation targets).
  const cache = useMemo(
    () =>
      Array.from({ length: MAX }, () => ({
        active: false,
        pos: new THREE.Vector3(),
        rot: 0,
        name: "",
        color: "#7be0ff",
      })),
    []
  );

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const root = rootRef.current;
    if (!root) return;

    // Map live peer entries onto our cache slots.
    const peerList = Object.values(peers);
    for (let i = 0; i < MAX; i++) {
      const slot = cache[i];
      const peer = peerList[i];
      if (peer) {
        slot.active = true;
        slot.name = peer.name;
        slot.color = BLIP_COLORS[i % BLIP_COLORS.length];
        // interpolate toward the reported pose
        const tx = peer.pos[0];
        const ty = (peer.pos[1] || 0) + 0.9; // raise to stand on ground
        const tz = peer.pos[2];
        slot.pos.x += (tx - slot.pos.x) * Math.min(1, delta * 8);
        slot.pos.y += (ty - slot.pos.y) * Math.min(1, delta * 8);
        slot.pos.z += (tz - slot.pos.z) * Math.min(1, delta * 8);
        // smooth rotation
        let diff = peer.rot - slot.rot;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        slot.rot += diff * Math.min(1, delta * 8);

        // add a minimap blip (pushed fresh each frame by NPCManager.clear)
        worldState.blips.push({ x: slot.pos.x, z: slot.pos.z, type: "peer", color: slot.color });
      } else {
        slot.active = false;
      }

      // update the corresponding child group (body) in the root
      const child = root.children[i];
      if (!child) continue;
      child.visible = slot.active;
      if (slot.active) {
        child.position.copy(slot.pos);
        child.rotation.y = slot.rot;
        // tint the body material
        const body = child.children[0];
        if (body && body.material && body.material.color) {
          body.material.color.set(slot.color);
        }
        // name tag faces the camera is handled by sprite billboard; here we
        // just keep the tag visible.
      }
    }
  });

  return (
    <group ref={rootRef}>
      {Array.from({ length: MAX }, (_, i) => (
        <group key={i} visible={false}>
          {/* body */}
          <mesh position={[0, 0, 0]} castShadow>
            <boxGeometry args={[0.5, 1.4, 0.4]} />
            <meshStandardMaterial color="#7be0ff" emissive="#3ba8ff" emissiveIntensity={0.25} flatShading />
          </mesh>
          {/* head */}
          <mesh position={[0, 1.0, 0]}>
            <boxGeometry args={[0.38, 0.38, 0.38]} />
            <meshStandardMaterial color="#e8b98f" flatShading />
          </mesh>
          {/* name tag (billboard sprite) */}
          <NameTag />
        </group>
      ))}
    </group>
  );
}

/** A simple always-facing-camera name tag using a Sprite. */
function NameTag() {
  // We don't know the name until the frame loop fills the cache; render a
  // neutral marker. Names are overlaid in the HUD layer instead for clarity.
  return (
    <mesh position={[0, 1.7, 0]}>
      <sphereGeometry args={[0.12, 6, 6]} />
      <meshBasicMaterial color="#7be0ff" toneMapped={false} />
    </mesh>
  );
}
