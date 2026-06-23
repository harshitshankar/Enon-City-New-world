import { useEffect, useState } from "react";
import { useGameStore } from "./store/useGameStore";
import GameCanvas from "./components/GameCanvas";
import OrientationGuard from "./components/OrientationGuard";
import HUD from "./components/ui/HUD";
import StartScreen from "./components/ui/StartScreen";
import Lobby from "./components/ui/Lobby";
import CustomizeScreen from "./components/ui/CustomizeScreen";
import MultiplayerHUD from "./components/ui/MultiplayerHUD";
import PointerLock from "./components/player/PointerLock";

export default function App() {
  const started = useGameStore((s) => s.started);
  const landscapeOk = useGameStore((s) => s.landscapeOk);
  const isMobile = useGameStore((s) => s.isMobile);
  const multiplayer = useGameStore((s) => s.multiplayer);
  const lobbyPhase = useGameStore((s) => s.lobbyPhase);
  const roomId = useGameStore((s) => s.roomId);
  const setAppearance = useGameStore((s) => s.setAppearance);
  const [showLobby, setShowLobby] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);

  // Load persisted character appearance from localStorage on first mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("neonAppearance");
      if (saved) setAppearance(JSON.parse(saved));
    } catch (e) {
      /* ignore */
    }
  }, [setAppearance]);

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

      {/* Multiplayer overlays: kill counter, respawn timer, match scoreboard */}
      {started && landscapeOk && multiplayer && <MultiplayerHUD />}

      {/* Start menu */}
      {!started && landscapeOk && !showLobby && !showCustomize && (
        <StartScreen
          onMultiplayer={() => setShowLobby(true)}
          onCustomize={() => setShowCustomize(true)}
        />
      )}

      {/* Multiplayer lobby */}
      {!started && landscapeOk && showLobby && !showCustomize && (
        <Lobby
          onClose={() => setShowLobby(false)}
          onCustomize={() => setShowCustomize(true)}
        />
      )}

      {/* Character customization */}
      {!started && landscapeOk && showCustomize && (
        <CustomizeScreen onClose={() => setShowCustomize(false)} />
      )}

      {/* In-game room badge (multiplayer only) — small, bottom-right so it
          doesn't clash with the kill counter / scoreboard at top-center. */}
      {started && multiplayer && roomId && (
        <div
          className="absolute hud-panel rounded-full px-3 py-1 text-cyan-200 text-[10px] tracking-widest pointer-events-none"
          style={{ zIndex: 40, bottom: 16, right: 16 }}
        >
          🌐 ROOM {roomId} · {lobbyPhase === "playing" ? "LIVE" : "..."}
        </div>
      )}

      {/* Portrait lock overlay (mobile) */}
      <OrientationGuard />
    </div>
  );
}

