import { useState, useEffect } from "react";
import { useGameStore } from "../../store/useGameStore";
import {
  joinRoom,
  makeRoomCode,
  on,
  peers,
  leaveRoom,
  sendStart,
} from "../../lib/net";
import { initAudio, startMusic } from "../../lib/audio";

/**
 * Lobby — the multiplayer room screen.
 *
 * Flow: Create Room (host) or Join Room (enter a code). Once in a room the
 * screen shows the shareable code + live roster (real peers from the server,
 * filled out to 8 slots so it's clear how many can still join). The host (the
 * room creator) clicks START to drop everyone into the shared city.
 *
 * This is layered on top of the existing solo StartScreen flow: if multiplayer
 * isn't engaged, the normal single-player ENTER button still works.
 */
export default function Lobby({ onClose }) {
  const playerName = useGameStore((s) => s.playerName);
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const setRoomId = useGameStore((s) => s.setRoomId);
  const setRoster = useGameStore((s) => s.setRoster);
  const setMultiplayer = useGameStore((s) => s.setMultiplayer);
  const setLobbyPhase = useGameStore((s) => s.setLobbyPhase);
  const startGame = useGameStore((s) => s.startGame);

  const [mode, setMode] = useState("home"); // home | create | join | room
  const [code, setCode] = useState("");
  const [rosterView, setRosterView] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState("");
  const [myId, setMyId] = useState(null);

  // Wire up networking callbacks once.
  useEffect(() => {
    on("roster", (players, selfId, room) => {
      setMyId(selfId);
      setRoomId(room);
      setRosterView(players);
      setRoster(players);
      setMode("room");
    });
    on("join", (peer) => {
      setRosterView((r) => [...r, { id: peer.id, name: peer.name }]);
    });
    on("leave", (id) => {
      setRosterView((r) => r.filter((p) => p.id !== id));
    });
    on("error", (msg) => setError(msg));
    // When the host starts the game, the server tells EVERYONE to launch.
    // Non-host clients handle it here; the host launches in handleStart below.
    on("start", () => {
      initAudio();
      startMusic();
      setLobbyPhase("playing");
      startGame();
    });
  }, [setRoomId, setRoster, setLobbyPhase, startGame]);

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

  const handleStart = () => {
    // Host: tell the server to broadcast "start" to the whole room. The server
    // echoes it to everyone (including us), and the shared on("start") handler
    // above launches each client into the game. This guarantees ALL players —
    // not just the host — enter the city together.
    sendStart();
  };

  const handleLeave = () => {
    leaveRoom();
    setMultiplayer(false);
    setMode("home");
    setRosterView([]);
    onClose?.();
  };

  // Build an 8-slot view of the roster (filled with "Empty" slots).
  const slots = Array.from({ length: 8 }, (_, i) => {
    const p = rosterView[i];
    return p ? { ...p, status: "In" } : { status: "Empty" };
  });

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
        1–8 PLAYERS · SHARED CITY
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

          {/* Roster: 8 slots */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            {slots.map((s, i) => (
              <div
                key={i}
                className="hud-panel rounded-lg px-3 py-2 text-left flex items-center gap-2"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: s.status === "In" ? "#3be86a" : "#4a3a5a" }}
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

          {isHost ? (
            <button
              onClick={handleStart}
              className="mt-5 w-full px-6 py-4 rounded-xl font-extrabold text-white text-lg active:scale-95 transition-transform"
              style={{ background: "linear-gradient(90deg,#ff5ac8,#ff8a3c)", boxShadow: "0 0 30px rgba(255,90,200,0.6)" }}
            >
              ▶ START GAME
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
          Tip: the host creates a room, shares the code, and everyone enters it
          before pressing START. You all drop into the same shared city.
        </p>
      )}
    </div>
  );
}
