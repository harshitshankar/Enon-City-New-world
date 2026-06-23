import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGameStore, worldState } from "../../store/useGameStore";

/**
 * WantedSystem
 * - Advances the global game clock (worldState.clock).
 * - Decays the wanted level toward 0 once the player has avoided committing
 *   crimes for COOLDOWN seconds ("losing the cops"). Higher star levels take
 *   a little longer to fully clear.
 */
const COOLDOWN = 8; // seconds with no crime before stars start dropping
const DECAY = 0.18; // stars per second once decaying

export default function WantedSystem() {
  const acc = useRef(0);

  useFrame((_, rawDelta) => {
    const ts = useGameStore.getState().timeScale;
    const dt = Math.min(rawDelta, 0.05) * ts;
    worldState.clock += dt;

    const st = useGameStore.getState();
    if (st.wanted <= 0) return;

    const sinceCrime = worldState.clock - worldState.lastCrime;
    if (sinceCrime > COOLDOWN) {
      acc.current += dt;
      // throttle store writes to ~10/sec
      if (acc.current >= 0.1) {
        const drop = DECAY * acc.current;
        acc.current = 0;
        const next = Math.max(0, st.wanted - drop);
        st.setWanted(next);
      }
    } else {
      acc.current = 0;
    }
  });

  return null;
}
