import { useEffect, useState } from "react";
import { useGameStore } from "./store/useGameStore";
import GameCanvas from "./components/GameCanvas";
import OrientationGuard from "./components/OrientationGuard";
import HUD from "./components/ui/HUD";
import StartScreen from "./components/ui/StartScreen";
import Lobby from "./components/ui/Lobby";
import PointerLock from "./components/player/PointerLock";

export default function App() {
  const started = useGameStore((s) => s.started);
  const landscapeOk = useGameStore((s) => s.landscapeOk);
  const isMobile = useGameStore((s) => s.isMobile);
  const multiplayer = useGameStore((s) => s.multiplayer);
  const lobbyPhase = useGameStore((s) => s.lobbyPhase);
  const roomId = useGameStore((s) => s.roomId);
  const [showLobby, setShowLobby] = useState(false);

  // Hide the OS cursor over the canvas on desktop once the game is running so
  // only the in-game crosshair is visible.
  useEffect(() => {
    document.body.classList.toggle(
      "is-playing-desktop",
      started && !isMobile
    );
  }, [started, isMobile]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black select-none">
      {/* 3D world */}
      <GameCanvas />

      {/* Desktop pointer lock (mouse-look / aim) */}
      <PointerLock />

      {/* In-game HUD (only after start & in landscape) */}
      {started && landscapeOk && <HUD />}

      {/* Start menu */}
      {!started && landscapeOk && !showLobby && (
        <StartScreen onMultiplayer={() => setShowLobby(true)} />
      )}

      {/* Multiplayer lobby */}
      {!started && landscapeOk && showLobby && (
        <Lobby onClose={() => setShowLobby(false)} />
      )}

      {/* In-game room badge (multiplayer only) */}
      {started && multiplayer && roomId && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 hud-panel rounded-full px-4 py-1 text-cyan-200 text-xs tracking-widest pointer-events-none"
          style={{ zIndex: 40, top: 56 }}
        >
          🌐 ROOM {roomId} · {lobbyPhase === "playing" ? "LIVE" : "..."}
        </div>
      )}

      {/* Portrait lock overlay (mobile) */}
      <OrientationGuard />
    </div>
  );
}
