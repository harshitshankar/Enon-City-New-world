import { useMemo, useRef } from "react";
import Car from "./Car";
import { useGameStore } from "../../store/useGameStore";
import { HALF } from "../world/World";

/**
 * PoliceManager
 * Renders real <Car police> cruisers that are fully destructible AND
 * hijackable (they go through the same Car system). They spawn only when the
 * player has a wanted level >= the cruiser's index, and chase the player.
 *
 * IMPORTANT — PERSISTENCE RULE (the hijack bug fix):
 * Once ANY police car has been entered/hijacked by the player (or, in the
 * planned multiplayer, any human driver), it is remembered in a `hijacked`
 * Set for the whole session. A hijacked cruiser is NEVER unmounted — even
 * after the wanted level decays to 0, after you exit it, or after you swap
 * cars. This guarantees a player-driven police car can never vanish under you
 * (and, by extension, any vehicle a human is driving is always present).
 *
 * Non-hijacked cruisers still fade out naturally when the wanted level clears,
 * which is the intended "you lost the cops" feedback.
 */
const MAX = 5;

export default function PoliceManager() {
  // Use ceil so a fractional wanted level (e.g. 0.6 while decaying) still keeps
  // the chasing cruiser on screen instead of popping it out mid-pursuit.
  const wanted = useGameStore((s) => Math.ceil(s.wanted));
  const activeVehicle = useGameStore((s) => s.activeVehicle);
  // In multiplayer, cops are off by default (pure PvP). The host can toggle
  // them on from the lobby; until then we don't spawn any chasers. Solo play
  // is unaffected. (A cruiser the player hijacked is still kept mounted.)
  const multiplayer = useGameStore((s) => s.multiplayer);
  const copsOn = useGameStore((s) => (s.matchConfig ? s.matchConfig.cops : true));
  const copsActive = multiplayer ? !!copsOn : true;

  // Police cars the player has entered at least once live here forever.
  const hijacked = useRef(new Set());

  const spawns = useMemo(() => {
    const arr = [];
    for (let i = 0; i < MAX; i++) {
      const ang = (i / MAX) * Math.PI * 2;
      arr.push([
        Math.cos(ang) * (HALF - 6),
        1.2,
        Math.sin(ang) * (HALF - 6),
      ]);
    }
    return arr;
  }, []);

  // Record any police car that becomes the active vehicle so it persists.
  if (activeVehicle && activeVehicle.startsWith("police-")) {
    hijacked.current.add(activeVehicle);
  }

  return (
    <group>
      {spawns.map((pos, i) => {
        const id = `police-${i}`;
        // Keep mounted if the player is driving it OR it was hijacked once
        // this session (persistence rule). Otherwise only spawn when cops are
        // active and within the wanted level.
        const driven = activeVehicle === id || hijacked.current.has(id);
        const show = driven || (copsActive && i < wanted);
        return show ? (
          <Car key={id} id={id} position={pos} police />
        ) : null;
      })}
    </group>
  );
}
