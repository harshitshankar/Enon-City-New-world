/**
 * net.js — minimal multiplayer client for NEON CITY.
 *
 * Connects to the WebSocket relay server, joins a room by code, and keeps a
 * mutable (non-reactive) `peers` map in sync with every other player's latest
 * reported pose. State is stored outside React to avoid re-renders during the
 * frame loop — UI that needs it reads on an interval.
 *
 * Graceful fallback: if the server is unreachable, calls onError and the game
 * continues solo (no crash). `connected` is always checked before sending.
 *
 * Server URL comes from VITE_WS_URL (set at build/deploy time), defaulting to
 * ws://localhost:8080 for local dev.
 */

export const WS_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_WS_URL) ||
  "ws://localhost:8080";

/** Live peer pose table: peerId -> { id, name, pos, rot, vel, vehicle, wanted, health, t } */
export const peers = {};

/** Generate a 6-char room code (matches server format). */
export function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

let ws = null;
let selfId = null;
let roomCode = null;
let playerName = "Player";
let connected = false;
let sendInterval = null;

const handlers = {
  roster: null, // (roster, selfId, room) => void
  join: null, // (peer) => void
  leave: null, // (peerId) => void
  state: null, // (peerId, state) => void
  hit: null, // (peerId, byId) => void
  start: null, // (room) => void  — host started the game; everyone launches
  error: null, // (msg) => void
  open: null, // () => void
};

export function on(event, cb) {
  if (event in handlers) handlers[event] = cb;
}

export function isConnected() {
  return connected;
}
export function getSelfId() {
  return selfId;
}
export function getRoomCode() {
  return roomCode;
}

/**
 * Connect to the server and join a room.
 * @param {string} code room code
 * @param {string} name player name
 */
export function joinRoom(code, name) {
  roomCode = code;
  playerName = name || "Player";
  // clear stale peer state
  for (const k of Object.keys(peers)) delete peers[k];

  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    handlers.error?.("Could not connect to game server.");
    return;
  }

  ws.onopen = () => {
    connected = true;
    handlers.open?.();
    ws.send(JSON.stringify({ t: "join", room: roomCode, name: playerName }));
    // start broadcasting our own pose ~15 Hz
    if (sendInterval) clearInterval(sendInterval);
    sendInterval = setInterval(broadcastSelf, 1000 / 15);
  };

  ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    switch (msg.t) {
      case "roster":
        selfId = msg.self;
        roomCode = msg.room;
        // seed peer table from roster (minus self)
        for (const p of msg.players) {
          if (p.id !== selfId) {
            peers[p.id] = {
              id: p.id,
              name: p.name,
              pos: [0, 0, 0],
              rot: 0,
              vel: [0, 0, 0],
              vehicle: null,
              wanted: 0,
              health: 100,
              t: 0,
            };
          }
        }
        handlers.roster?.(msg.players, selfId, roomCode);
        break;
      case "join":
        if (msg.id !== selfId) {
          peers[msg.id] = {
            id: msg.id,
            name: msg.name,
            pos: [0, 0, 0],
            rot: 0,
            vel: [0, 0, 0],
            vehicle: null,
            wanted: 0,
            health: 100,
            t: 0,
          };
          handlers.join?.(peers[msg.id]);
        }
        break;
      case "state":
        if (msg.id !== selfId && peers[msg.id]) {
          const p = peers[msg.id];
          if (msg.pos) p.pos = msg.pos;
          if (typeof msg.rot === "number") p.rot = msg.rot;
          if (msg.vel) p.vel = msg.vel;
          if (msg.vehicle !== undefined) p.vehicle = msg.vehicle;
          if (typeof msg.wanted === "number") p.wanted = msg.wanted;
          if (typeof msg.health === "number") p.health = msg.health;
          p.t = performance.now();
        }
        break;
      case "hit":
        handlers.hit?.(msg.id, msg.by);
        break;
      case "start":
        // Host launched the shared game — every client (including the host
        // echo) flips into playing mode.
        handlers.start?.(msg.room);
        break;
      case "leave":
        delete peers[msg.id];
        handlers.leave?.(msg.id);
        break;
      case "full":
        handlers.error?.("That room is full (8/8).");
        break;
      default:
        break;
    }
  };

  ws.onclose = () => {
    connected = false;
    if (sendInterval) {
      clearInterval(sendInterval);
      sendInterval = null;
    }
  };

  ws.onerror = () => {
    handlers.error?.("Lost connection to game server. Playing solo.");
    connected = false;
  };
}

/**
 * Broadcast our own pose. Reads the local world state so callers don't have to
 * push every frame.
 */
export function broadcastSelf() {
  if (!connected || !ws || ws.readyState !== ws.OPEN) return;
  // Lazy import to avoid a hard cycle with the store.
  import("../store/useGameStore.js").then(({ worldState, useGameStore }) => {
    const st = useGameStore.getState();
    ws.send(
      JSON.stringify({
        t: "state",
        pos: [
          +worldState.playerPos.x.toFixed(2),
          +worldState.playerPos.y.toFixed(2),
          +worldState.playerPos.z.toFixed(2),
        ],
        rot: +worldState.playerRot.toFixed(3),
        vel: [0, 0, 0],
        vehicle: st.activeVehicle || null,
        wanted: st.wanted,
        health: st.health,
      })
    );
  });
}

export function sendHit(targetPeerId) {
  if (!connected || !ws || ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify({ t: "hit", id: targetPeerId }));
}

/**
 * Host-only: tell the server to broadcast a "start" to everyone in the room so
 * all clients launch into the shared city together.
 */
export function sendStart() {
  if (!connected || !ws || ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify({ t: "start" }));
}

/** Disconnect + clear all peer state. */
export function leaveRoom() {
  if (sendInterval) {
    clearInterval(sendInterval);
    sendInterval = null;
  }
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ t: "leave" }));
    ws.close();
  }
  ws = null;
  connected = false;
  for (const k of Object.keys(peers)) delete peers[k];
}
