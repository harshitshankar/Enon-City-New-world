import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { peers, on, getSelfId } from "../../lib/net";
import { worldState, useGameStore } from "../../store/useGameStore";
import CharacterMesh from "./CharacterMesh";

/**
 * RemotePlayers — renders up to 7 other human players in the shared city.
 *
 * Each peer's pose + appearance arrives over the network (~15 Hz) into the
 * mutable `peers` map in net.js. We render a REAL CharacterMesh per peer
 * (using their synced skin/hair/shirt/pants colours) and interpolate toward
 * their reported position each frame.
 *
 * Cache is id-keyed (Map<peerId, slot>) so a peer's appearance/colour sticks
 * with them even as the peers map reorders — the old index-based cache would
 * shuffle colours when players joined/left.
 *
 * No local rigidbodies — remote players are pure ghosts (visual only). Shooting
 * them is detected in ProjectileSystem against their reported position and the
 * 'hit' message applies damage on the victim's client (wired up here).
 *
 * Team play: each peer gets a coloured ground ring + head marker so allies
 * (your team colour) and enemies (the other team colour) are obvious at a
 * glance, regardless of their chosen shirt colour.
 */
const MAX = 7;

// Team colours used for rings / markers / minimap.
export const TEAM_COLOR = { A: "#ff5a6a", B: "#3ba8ff" };
const teamColor = (t) => TEAM_COLOR[t] || "#7CFF6B";

// Order of parts inside CharacterMesh: [head, hair, torso, armL, armR, legL, legR]
// Colour mapping for imperative tinting each frame.
const PART_COLORS = (a) => [
  a.skin,  // head
  a.hair,  // hair
  a.shirt, // torso
  a.skin,  // armL
  a.skin,  // armR
  a.pants, // legL
  a.pants, // legR
];

export default function RemotePlayers() {
  const rootRef = useRef();

  // Id-keyed cache: peerId -> { pos:Vector3, rot, applied, lastKills }
  const cache = useRef(new Map());

  /* ---- PvP damage wiring ------------------------------------------------
   * When another player's bullet hits us, the server relays a "hit" message
   * naming the victim (us) and the attacker. We apply the weapon's damage to
   * our own health here. Health is broadcast in our own state, so everyone
   * sees it drop in sync. */
  useEffect(() => {
    on("hit", (victimId, byId, dmg) => {
      if (victimId === getSelfId()) {
        const st = useGameStore.getState();
        // Friendly fire off in team mode: ignore hits from a teammate.
        const me = st.team;
        const attackerPeer = byId != null ? peers[byId] : null;
        if (me && attackerPeer && attackerPeer.team === me) return;
        st.damage(dmg ?? 15, byId);
      }
    });
  }, []);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const root = rootRef.current;
    if (!root) return;

    const myTeam = useGameStore.getState().team;

    // Reconcile: which peer ids are live right now.
    const liveIds = new Set(Object.keys(peers));

    // Render order: stable list of peer ids (capped at MAX) so each maps to a
    // fixed child slot this frame.
    const orderedIds = Object.keys(peers).slice(0, MAX);

    for (let i = 0; i < MAX; i++) {
      const child = root.children[i];
      if (!child) continue;
      const id = orderedIds[i];

      if (!id) {
        child.visible = false;
        continue;
      }

      const peer = peers[id];
      // get-or-create slot
      let slot = cache.current.get(id);
      if (!slot) {
        slot = { pos: new THREE.Vector3(), rot: 0, applied: "", lastKills: -1 };
        // initialise at the peer's exact pos to avoid a long slide-in
        slot.pos.set(peer.pos[0] || 0, peer.pos[1] || 0, peer.pos[2] || 0);
        cache.current.set(id, slot);
      }

      child.visible = true;

      // interpolate toward reported pose (tightened for responsive blips)
      const tx = peer.pos[0] || 0;
      const ty = peer.pos[1] || 0; // CharacterMesh is foot-origin'd; no raise
      const tz = peer.pos[2] || 0;
      const k = Math.min(1, delta * 14);
      slot.pos.x += (tx - slot.pos.x) * k;
      slot.pos.y += (ty - slot.pos.y) * k;
      slot.pos.z += (tz - slot.pos.z) * k;
      let diff = (peer.rot || 0) - slot.rot;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      slot.rot += diff * k;

      child.position.copy(slot.pos);
      child.rotation.y = slot.rot;

      // Downed peers sink + fade so it reads as "dead" until they respawn.
      const dead = peer.health <= 0;
      child.scale.y = dead ? 0.2 : 1;

      // Apply appearance colours imperatively (only when they change) by
      // walking the CharacterMesh's part meshes (lazily captured into
      // userData.parts on first use).
      if (!child.userData.parts) {
        // CharacterMesh group is child.children[0]; its children are the parts.
        const charGroup = child.children[0];
        if (charGroup && charGroup.children) {
          child.userData.parts = charGroup.children.filter((c) => c.isMesh);
        }
      }
      const sig = `${peer.skin}|${peer.hair}|${peer.shirt}|${peer.pants}|${dead}`;
      if (sig !== slot.applied && child.userData.parts) {
        const cols = PART_COLORS(peer);
        child.userData.parts.forEach((mesh, idx) => {
          if (mesh && mesh.material && cols[idx]) {
            mesh.material.color.set(cols[idx]);
            mesh.material.opacity = dead ? 0.35 : 1;
            mesh.material.transparent = dead;
          }
        });
        slot.applied = sig;
      }

      // Team ring + head marker colour follows the peer's team.
      const tc = teamColor(peer.team);
      if (child.userData.ring) {
        child.userData.ring.visible = !dead;
        child.userData.ring.material.color.set(tc);
      }
      if (child.userData.marker) {
        // allies glow the same as us; enemies flash their team colour.
        child.userData.marker.material.color.set(tc);
      }

      // Scoreboard echo: forward a peer's rising kill count to its team tally.
      const pk = peer.kills || 0;
      if (pk !== slot.lastKills) {
        if (pk > slot.lastKills && slot.lastKills >= 0 && peer.team) {
          useGameStore.getState().setTeamKills(peer.team, pk);
        }
        slot.lastKills = pk;
      }

      // minimap blip with the peer's direction (peer.rot) so friends' headings
      // are visible on the radar. Ally vs enemy colouring uses team affiliation.
      const ally = myTeam && peer.team === myTeam;
      worldState.blips.push({
        x: slot.pos.x,
        z: slot.pos.z,
        type: "peer",
        color: peer.team ? (ally ? "#7CFF6B" : "#ff4444") : "#7CFF6B",
        rot: slot.rot,
      });
    }

    // GC slots for peers that have left.
    for (const id of cache.current.keys()) {
      if (!liveIds.has(id)) cache.current.delete(id);
    }
  });

  return (
    <group ref={rootRef}>
      {Array.from({ length: MAX }, (_, i) => (
        <PeerSlot key={i} />
      ))}
    </group>
  );
}

/** One remote-player render slot. The CharacterMesh's part meshes are captured
 *  lazily into the parent group's userData.parts on the first frame so the
 *  loop can tint each part imperatively without re-rendering React.
 *  The ground ring + head marker refs are stashed in userData so the frame loop
 *  can recolour them per team without React. */
function PeerSlot() {
  const ringRef = useRef();
  const markerRef = useRef();
  return (
    <group
      visible={false}
      ref={(g) => {
        if (g) {
          g.userData.ring = ringRef.current;
          g.userData.marker = markerRef.current;
        }
      }}
    >
      <CharacterMesh holding />
      {/* floating team marker above the head */}
      <mesh ref={markerRef} position={[0, 2.35, 0]}>
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshBasicMaterial color="#7be0ff" toneMapped={false} />
      </mesh>
      {/* team-coloured ground ring (enemy vs ally indicator) */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[0.7, 0.92, 20]} />
        <meshBasicMaterial color="#7be0ff" transparent opacity={0.7} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  );
}
