import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../../store/useGameStore";
import { leaveRoom } from "../../lib/net";

/**
 * MultiplayerHUD — overlays shown only when playing online:
 *   • Kill counter (top-center) — your personal kills this match.
 *   • 3s respawn countdown overlay when you're down.
 *   • Team deathmatch scoreboard + countdown timer + end screen.
 *
 * It reads reactive store state for the numbers and a rAF loop only for the
 * respawn + match timers (cheap; avoids re-rendering the whole HUD every frame).
 */
export default function MultiplayerHUD() {
  const multiplayer = useGameStore((s) => s.multiplayer);
  const respawnAt = useGameStore((s) => s.respawnAt);
  const kills = useGameStore((s) => s.kills);
  const team = useGameStore((s) => s.team);
  const teamKills = useGameStore((s) => s.teamKills);
  const matchConfig = useGameStore((s) => s.matchConfig);
  const matchStartTime = useGameStore((s) => s.matchStartTime);
  const matchOver = useGameStore((s) => s.matchOver);
  const beginMatch = useGameStore((s) => s.beginMatch);
  const endMatch = useGameStore((s) => s.endMatch);
  const resetMatch = useGameStore((s) => s.resetMatch);
  const setLobbyPhase = useGameStore((s) => s.setLobbyPhase);
  const setMultiplayer = useGameStore((s) => s.setMultiplayer);

  // Begin the match clock once, when we first see a start time is expected but
  // missing (host triggers beginMatch via Lobby/Match flow). For safety, if the
  // match is running with a config but no start time, stamp it now.
  useEffect(() => {
    if (multiplayer && !matchStartTime && matchConfig) {
      beginMatch();
    }
  }, [multiplayer, matchStartTime, matchConfig, beginMatch]);

  // Live ticking values (respawn countdown + match timer) via rAF.
  const [respawnLeft, setRespawnLeft] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  useEffect(() => {
    let raf;
    const tick = () => {
      const now = Date.now();
      const st = useGameStore.getState();
      if (st.respawnAt) {
        setRespawnLeft(Math.max(0, Math.ceil((st.respawnAt - now) / 1000)));
      } else if (respawnLeft !== 0) {
        setRespawnLeft(0);
      }
      // Match countdown.
      if (st.matchStartTime && !st.matchOver) {
        const total = (st.matchConfig?.duration || 10) * 60 * 1000;
        const remain = Math.max(0, total - (now - st.matchStartTime));
        setTimeLeft(remain);
        if (remain <= 0 && !st.matchOver) st.endMatch();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!multiplayer) return null;

  const mm = Math.floor(timeLeft / 60000);
  const ss = Math.floor((timeLeft % 60000) / 1000);
  const timerStr = `${mm}:${ss.toString().padStart(2, "0")}`;

  const handlePlayAgain = () => {
    leaveRoom();
    resetMatch();
    setMultiplayer(false);
    setLobbyPhase("menu");
    // Bounce back to the start menu (the parent App flips screens off `started`).
    useGameStore.setState({ started: false });
  };

  return (
    <>
      {/* ---- Kill counter (top-center) ---- */}
      <div
        className="absolute hud-panel rounded-full px-4 py-1 flex items-center gap-2 pointer-events-none"
        style={{ zIndex: 41, top: 30, left: "50%", transform: "translateX(-50%)" }}
      >
        <span style={{ fontSize: 16 }}>💀</span>
        <span className="text-white font-extrabold text-lg leading-none">{kills}</span>
        <span className="text-purple-200/70 text-[10px] tracking-widest">KILLS</span>
      </div>

      {/* ---- Match scoreboard + timer (under the kill counter) ---- */}
      {matchStartTime && (
        <div
          className="absolute pointer-events-none"
          style={{ zIndex: 41, top: 64, left: "50%", transform: "translateX(-50%)" }}
        >
          <div className="hud-panel rounded-full px-4 py-1 flex items-center gap-3">
            <TeamTag team="A" kills={teamKills.A} mine={team === "A"} />
            <span
              className="text-white font-mono font-extrabold neon-text"
              style={{ fontSize: 18, minWidth: 56, textAlign: "center" }}
            >
              {timerStr}
            </span>
            <TeamTag team="B" kills={teamKills.B} mine={team === "B"} />
          </div>
        </div>
      )}

      {/* ---- Respawn countdown overlay ---- */}
      {respawnLeft > 0 && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
          style={{ zIndex: 60, background: "rgba(10,4,20,0.55)" }}
        >
          <div className="text-red-300 tracking-[0.4em] text-sm mb-2">YOU DIED</div>
          <div
            className="text-white font-black neon-text"
            style={{ fontSize: 90, lineHeight: 1 }}
          >
            {respawnLeft}
          </div>
          <div className="text-cyan-200/70 tracking-widest text-xs mt-2">
            RESPAWNING...
          </div>
        </div>
      )}

      {/* ---- Match end screen ---- */}
      {matchOver && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ zIndex: 80, background: "rgba(8,3,16,0.82)" }}
        >
          <div className="text-purple-200/70 tracking-[0.4em] text-xs mb-1">MATCH OVER</div>
          <h2
            className="font-black neon-text"
            style={{
              fontSize: 52,
              background:
                teamKills.A === teamKills.B
                  ? "linear-gradient(180deg,#fff,#aaa)"
                  : teamKills[(team === "A" ? "B" : "A") || "A"] < teamKills[team || "A"]
                    ? "linear-gradient(180deg,#bfffc0,#3be86a)"
                    : "linear-gradient(180deg,#ffc0c0,#ff5a5a)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {teamKills.A === teamKills.B
              ? "DRAW"
              : teamKills.A > teamKills.B
                ? "TEAM A WINS"
                : "TEAM B WINS"}
          </h2>
          <div className="mt-4 flex items-center gap-6">
            <TeamTag team="A" kills={teamKills.A} mine={team === "A"} big />
            <span className="text-purple-200/50 text-2xl">vs</span>
            <TeamTag team="B" kills={teamKills.B} mine={team === "B"} big />
          </div>
          <button
            onClick={handlePlayAgain}
            className="mt-8 px-8 py-3 rounded-full font-extrabold text-white active:scale-95 transition-transform"
            style={{ background: "linear-gradient(90deg,#ff5ac8,#ff8a3c)", boxShadow: "0 0 24px rgba(255,90,200,0.5)" }}
          >
            ⟲ PLAY AGAIN
          </button>
        </div>
      )}
    </>
  );
}

function TeamTag({ team, kills, mine, big }) {
  const color = team === "A" ? "#ff5a6a" : "#3ba8ff";
  return (
    <div className="flex items-center gap-1.5" style={{ opacity: mine ? 1 : 0.85 }}>
      <span
        className="rounded-full"
        style={{
          width: big ? 12 : 8,
          height: big ? 12 : 8,
          background: color,
          boxShadow: mine ? `0 0 8px ${color}` : "none",
        }}
      />
      <span className="text-white font-extrabold" style={{ fontSize: big ? 26 : 14 }}>
        {kills}
      </span>
      {mine && (
        <span className="text-[9px] tracking-widest" style={{ color }}>
          YOU
        </span>
      )}
    </div>
  );
}
