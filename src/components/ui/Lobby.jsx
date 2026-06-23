import { useState, useEffect } from "react";
import { useGameStore } from "../../store/useGameStore";
import {
  joinRoom,
  makeRoomCode,
  on,
  peers,
  leaveRoom,
  sendStart,
  sendConfig,
} from "../../lib/net";
import { initAudio, startMusic } from "../../lib/audio";

/**
 * Lobby — the multiplayer room screen.
 *
 * Flow: Create Room (host) or Join Room (enter a code). Once in a room the
 * screen shows the shareable code + live roster (real peers from the server,
 * filled out to 8 slots so it's clear how many can still join). The host (the
 * room creator) picks the match settings (Team DM 2v2 / 4v4, duration, cops)
 * and clicks START to drop everyone into the shared city together.
 *
 * This is layered on top of the existing solo StartScreen flow: if multiplayer
 * isn't engaged, the normal single-player ENTER button still works.
 *
 * Teams are assigned by the server by join-order parity and arrive in the
 * roster; we look up our own entry to know which team we're on.
 */
const TEAM_COLOR = { A: "#ff5a6a", B: "#3ba8ff" };
const DURATIONS = [5, 10];
const MODES = [
  { id: "tdm2", label: "TEAM DM · 2v2", short: "2v2" },
  { id: "tdm4", label: "TEAM DM · 4v4", short: "4v4" },
];

export default function Lobby({ onClose, onCustomize }) {
  const playerName = useGameStore((s) => s.playerName);
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const setRoomId = useGameStore((s) => s.setRoomId);
  const setRoster = useGameStore((s) => s.setRoster);
  const setMultiplayer = useGameStore((s) => s.setMultiplayer);
  const setLobbyPhase = useGameStore((s) => s.setLobbyPhase);
  const startGame = useGameStore((s) => s.startGame);
  const setTeam = useGameStore((s) => s.setTeam);
  const setMatchConfig = useGameStore((s) => s.setMatchConfig);
  const beginMatch = useGameStore((s) => s.beginMatch);

  const [mode, setMode] = useState("home"); // home | create | join | room
  const [code, setCode] = useState("");
  const [rosterView, setRosterView] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState("");
  const [myId, setMyId] = useState(null);
  // Match config mirrored locally; host edits + broadcasts via sendConfig.
  const [cfg, setCfg] = useState({ mode: "tdm4", duration: 10, cops: false });

  // Wire up networking callbacks once.
  useEffect(() => {
    on("roster", (players, selfId, room, config) => {
      setMyId(selfId);
      setRoomId(room);
      setRosterView(players);
      setRoster(players);
      if (config) {
        setCfg(config);
        setMatchConfig(config);
      }
      setMode("room");
    });
    on("join", (peer) => {
      setRosterView((r) => [...r, { id: peer.id, name: peer.name, team: peer.team }]);
    });
    on("leave", (id) => {
      setRosterView((r) => r.filter((p) => p.id !== id));
    });
    on("error", (msg) => setError(msg));
    // Host changed match settings — apply read-only for everyone.
    on("config", (config) => {
      setCfg(config);
      setMatchConfig(config);
    });
    // When the host starts the game, the server tells EVERYONE to launch.
    // We resolve our own team from the roster here (it's authoritative), set
    // the match clock + config, then enter the city.
    on("start", (_room, roster, config) => {
      if (Array.isArray(roster)) {
        const me = roster.find((p) => p.id === myId);
        if (me) setTeam(me.team);
      }
      if (config) setMatchConfig(config);
      beginMatch();
      initAudio();
      startMusic();
      setLobbyPhase("playing");
      startGame();
    });
  }, [setRoomId, setRoster, setLobbyPhase, startGame, setMatchConfig, setTeam, beginMatch, myId]);

  const handleCreate = () => {
    setError("");
    const c = makeRoomCode();
    setIsHost(true);
    setCode(c);
    setMultiplayer(true);
    joinRoom(c, playerName || "Player");
  };

  const handleJoin = () => {
    setError("");
    if (code.length < 4) {
      setError("Enter a valid room code.");
      return;
    }
    setIsHost(false);
    setMultiplayer(true);
    joinRoom(code.toUpperCase(), playerName || "Player");
  };

  // Host edits a setting -> update local + push to the server for the room.
  const updateCfg = (partial) => {
    const next = { ...cfg, ...partial };
    setCfg(next);
    setMatchConfig(next);
    sendConfig(next);
  };

  const handleStart = () => {
    // Host: tell the server to broadcast "start" to the whole room. The server
    // echoes it to everyone (including us), and the shared on("start") handler
    // above launches each client into the game with the agreed config + teams.
    // Push the latest config right before start so stragglers are in sync.
    sendConfig(cfg);
    sendStart();
  };

  const handleLeave = () => {
    leaveRoom();
    setMultiplayer(false);
    setTeam(null);
    setMode("home");
    setRosterView([]);
    onClose?.();
  };

  // Build an 8-slot view of the roster (filled with "Empty" slots).
  const slots = Array.from({ length: 8 }, (_, i) => {
    const p = rosterView[i];
    return p ? { ...p, status: "In" } : { status: "Empty" };
  });

  const selectedMode = MODES.find((m) => m.id === cfg.mode) || MODES[1];

  return (
    <div
      className="absolute inset-0 flex flex-col items-center text-center px-6 overflow-y-auto"
      style={{
        zIndex: 110,
        background:
          "radial-gradient(ellipse at 50% 25%, #2a1850 0%, #160826 55%, #07030f 100%)",
        paddingTop: "max(24px, 6vh)",
        paddingBottom: "max(24px, 6vh)",
        justifyContent: "safe center",
      }}
    >
      <button
        onClick={handleLeave}
        className="absolute top-4 left-4 text-purple-200/70 hover:text-white text-sm"
      >
        ← Back
      </button>

      <h2
        className="font-black tracking-tight neon-text"
        style={{
          fontSize: "clamp(28px, 6vw, 52px)",
          background: "linear-gradient(180deg,#ffd6f5,#ff5ac8 60%,#9b59ff)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        MULTIPLAYER
      </h2>
      <p className="text-cyan-200/70 text-xs tracking-[0.3em] mt-1">
        1–8 PLAYERS · TEAM DEATHMATCH
      </p>

      {error && (
        <div className="mt-4 hud-panel rounded-lg px-4 py-2 text-red-300 text-sm max-w-sm">
          {error} <span className="text-purple-200/60">— playing solo is fine.</span>
        </div>
      )}

      {/* Name field (always available) */}
      <div className="mt-7 w-full max-w-sm">
        <label className="block text-pink-200/80 text-[10px] tracking-widest mb-1 text-left">
          YOUR NAME
        </label>
        <input
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value.slice(0, 16))}
          placeholder="Player"
          className="w-full hud-panel rounded-lg px-4 py-3 text-white text-base outline-none"
          style={{ background: "rgba(20,10,35,0.6)" }}
        />
        <button
          onClick={onCustomize}
          className="mt-2 text-cyan-200/80 hover:text-white text-xs tracking-widest"
        >
          🎨 CUSTOMIZE YOUR CHARACTER
        </button>
      </div>

      {mode === "home" && (
        <div className="mt-6 flex flex-col gap-3 w-full max-w-sm">
          <button
            onClick={handleCreate}
            className="px-6 py-4 rounded-xl font-extrabold text-white active:scale-95 transition-transform"
            style={{ background: "linear-gradient(90deg,#ff5ac8,#ff8a3c)", boxShadow: "0 0 24px rgba(255,90,200,0.5)" }}
          >
            ➕ CREATE ROOM
          </button>
          <button
            onClick={() => setMode("join")}
            className="px-6 py-4 rounded-xl font-extrabold text-white active:scale-95 transition-transform"
            style={{ background: "linear-gradient(90deg,#3ba8ff,#9b59ff)", boxShadow: "0 0 24px rgba(59,168,255,0.5)" }}
          >
            🔑 JOIN ROOM
          </button>
        </div>
      )}

      {mode === "join" && (
        <div className="mt-6 w-full max-w-sm">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="ABC123"
            className="w-full text-center hud-panel rounded-lg px-4 py-3 text-white text-2xl tracking-[0.5em] font-mono outline-none"
            style={{ background: "rgba(20,10,35,0.6)" }}
          />
          <button
            onClick={handleJoin}
            className="mt-3 w-full px-6 py-4 rounded-xl font-extrabold text-white active:scale-95 transition-transform"
            style={{ background: "linear-gradient(90deg,#3ba8ff,#9b59ff)" }}
          >
            JOIN
          </button>
          <button
            onClick={() => setMode("home")}
            className="mt-2 text-purple-200/70 text-sm"
          >
            ← back
          </button>
        </div>
      )}

      {mode === "room" && (
        <div className="mt-6 w-full max-w-md">
          {/* Room code — big, shareable */}
          <div className="hud-panel rounded-xl p-5">
            <div className="text-pink-200/70 text-[10px] tracking-[0.3em]">
              ROOM CODE — SHARE WITH FRIENDS
            </div>
            <div
              className="text-white font-mono font-black mt-1 select-all"
              style={{ fontSize: 40, letterSpacing: 8 }}
            >
              {useGameStore.getState().roomId || code}
            </div>
            <div className="text-purple-200/50 text-[10px] mt-1">
              {isHost ? "You are the host." : "Waiting for host to start..."}
            </div>
          </div>

          {/* Roster: 8 slots, with team colour dots */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            {slots.map((s, i) => (
              <div
                key={i}
                className="hud-panel rounded-lg px-3 py-2 text-left flex items-center gap-2"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    background:
                      s.status === "In" ? (TEAM_COLOR[s.team] || "#3be86a") : "#4a3a5a",
                    boxShadow: s.status === "In" ? `0 0 6px ${TEAM_COLOR[s.team] || "#3be86a"}` : "none",
                  }}
                />
                <span className={s.status === "In" ? "text-white text-sm" : "text-purple-200/40 text-sm"}>
                  {s.status === "In" ? s.name : "Empty slot"}
                </span>
              </div>
            ))}
          </div>
          <div className="text-purple-200/60 text-xs mt-3">
            {rosterView.length}/8 players · {Object.keys(peers).length} other
            live {Object.keys(peers).length === 1 ? "player" : "players"}
          </div>

          {/* Match settings: host edits, others read-only */}
          <div className="mt-4 hud-panel rounded-xl p-4 text-left">
            <div className="text-pink-200/80 text-[10px] tracking-widest mb-2">MATCH SETTINGS</div>

            <div className="text-purple-200/60 text-[10px] tracking-widest mb-1">MODE</div>
            <div className="flex gap-2 mb-3">
              {MODES.map((m) => {
                const active = cfg.mode === m.id;
                return (
                  <button
                    key={m.id}
                    disabled={!isHost}
                    onClick={() => updateCfg({ mode: m.id })}
                    className="flex-1 px-2 py-2 rounded-lg text-[11px] font-bold tracking-wide transition-transform active:scale-95 disabled:opacity-70"
                    style={{
                      background: active ? "linear-gradient(90deg,#ff5ac8,#ff8a3c)" : "rgba(40,20,55,0.7)",
                      color: "#fff",
                      boxShadow: active ? "0 0 14px rgba(255,90,200,0.5)" : "none",
                      cursor: isHost ? "pointer" : "default",
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            <div className="text-purple-200/60 text-[10px] tracking-widest mb-1">DURATION</div>
            <div className="flex gap-2 mb-3">
              {DURATIONS.map((d) => {
                const active = cfg.duration === d;
                return (
                  <button
                    key={d}
                    disabled={!isHost}
                    onClick={() => updateCfg({ duration: d })}
                    className="flex-1 px-2 py-2 rounded-lg text-xs font-bold transition-transform active:scale-95 disabled:opacity-70"
                    style={{
                      background: active ? "linear-gradient(90deg,#3ba8ff,#9b59ff)" : "rgba(40,20,55,0.7)",
                      color: "#fff",
                      boxShadow: active ? "0 0 14px rgba(59,168,255,0.5)" : "none",
                      cursor: isHost ? "pointer" : "default",
                    }}
                  >
                    {d} MIN
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-purple-200/60 text-[10px] tracking-widest">COPS</span>
              <button
                disabled={!isHost}
                onClick={() => updateCfg({ cops: !cfg.cops })}
                className="px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-transform active:scale-95 disabled:opacity-70"
                style={{
                  background: cfg.cops ? "linear-gradient(90deg,#ffd24d,#ff8a3c)" : "rgba(40,20,55,0.7)",
                  color: "#fff",
                  cursor: isHost ? "pointer" : "default",
                }}
              >
                {cfg.cops ? "ON" : "OFF"}
              </button>
            </div>
            {!isHost && (
              <div className="text-purple-200/40 text-[10px] mt-2">
                Host controls match settings.
              </div>
            )}
          </div>

          {isHost ? (
            <button
              onClick={handleStart}
              className="mt-5 w-full px-6 py-4 rounded-xl font-extrabold text-white text-lg active:scale-95 transition-transform"
              style={{ background: "linear-gradient(90deg,#ff5ac8,#ff8a3c)", boxShadow: "0 0 30px rgba(255,90,200,0.6)" }}
            >
              ▶ START {selectedMode.short}
            </button>
          ) : (
            <div className="mt-5 text-purple-200/70 text-sm">
              The host will start the game...
            </div>
          )}
        </div>
      )}

      {mode === "home" && (
        <p className="mt-8 text-purple-300/40 text-[10px] tracking-widest max-w-sm">
          Tip: the host creates a room, shares the code, picks the mode, and
          everyone enters before pressing START. Teams are auto-balanced.
        </p>
      )}
    </div>
  );
}
