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
  roster: null, // (roster, selfId, room, config) => void
  join: null, // (peer) => void
  leave: null, // (peerId) => void
  state: null, // (peerId, state) => void
  hit: null, // (peerId, byId, dmg) => void
  start: null, // (room, roster, config) => void  — host started the game
  config: null, // (config) => void  — host changed match settings
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

  // Connection timeout: if the server is unreachable (e.g. the multiplayer
  // relay isn't deployed, or VITE_WS_URL points at localhost in production),
  // surface a clear error instead of hanging forever.
  const joinTimeout = setTimeout(() => {
    if (!connected) {
      try {
        ws.close();
      } catch (e) {
        /* noop */
      }
      handlers.error?.(
        "Could not reach the multiplayer server. Make sure the relay (Web Service) is deployed and VITE_WS_URL is set."
      );
    }
  }, 6000);

  ws.onopen = () => {
    clearTimeout(joinTimeout);
    connected = true;
    handlers.open?.();
    ws.send(
      JSON.stringify({ t: "join", room: roomCode, name: playerName, ...getAppearance() })
    );
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
              // appearance + team (may be undefined for older peers)
              skin: p.skin,
              hair: p.hair,
              shirt: p.shirt,
              pants: p.pants,
              team: p.team,
              kills: p.kills || 0,
            };
          }
        }
        handlers.roster?.(msg.players, selfId, roomCode, msg.config);
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
            skin: msg.skin,
            hair: msg.hair,
            shirt: msg.shirt,
            pants: msg.pants,
            team: msg.team,
            kills: 0,
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
          if (typeof msg.kills === "number") p.kills = msg.kills;
          // appearance (synced cheaply — only present when it changed)
          if (msg.skin) p.skin = msg.skin;
          if (msg.hair) p.hair = msg.hair;
          if (msg.shirt) p.shirt = msg.shirt;
          if (msg.pants) p.pants = msg.pants;
          p.t = performance.now();
        }
        break;
      case "hit":
        handlers.hit?.(msg.id, msg.by, msg.dmg);
        break;
      case "start":
        // Host launched the shared game — every client (including the host
        // echo) flips into playing mode. Carries the final roster (with teams)
        // and the agreed match config so everyone starts identically.
        // Re-seed team affiliation for existing peers from the roster.
        if (Array.isArray(msg.roster)) {
          for (const p of msg.roster) {
            if (peers[p.id]) peers[p.id].team = p.team;
          }
        }
        handlers.start?.(msg.room, msg.roster, msg.config);
        break;
      case "config":
        // Host changed match settings in the lobby — forward to the caller.
        handlers.config?.({
          mode: msg.mode,
          duration: msg.duration,
          cops: msg.cops,
        });
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
 * Read the local player's appearance from the store.
 *
 * The store reference is resolved with a dynamic import (fired once on module
 * load) instead of a static `import` statement. A static import created a
 * module-init cycle (net.js -> store -> ... -> net.js) that, after the
 * single-file production bundle reordered evaluation, threw
 * "Cannot access 'X' before initialization" (TDZ) and blank-screened the page.
 * The dynamic import breaks the cycle; by the time any user actually joins a
 * room (always after a UI gesture) the cache is populated, and the appearance
 * is re-broadcast at 15 Hz regardless.
 */
let _store = null;
import("../store/useGameStore.js").then((m) => {
  _store = m.useGameStore;
});

function getAppearance() {
  try {
    if (!_store) return {};
    const a = _store.getState().playerAppearance || {};
    return { skin: a.skin, hair: a.hair, shirt: a.shirt, pants: a.pants };
  } catch (e) {
    return {};
  }
}

/**
 * Broadcast our own pose. Reads the local world state so callers don't have to
 * push every frame. Appearance is included so peers see customisation; it's
 * tiny (4 short strings) so the cost is negligible at 15 Hz.
 */
export function broadcastSelf() {
  if (!connected || !ws) return;
  const sock = ws; // capture — ws may be nulled by leaveRoom() before the
                  // async import resolves. Re-check inside the callback.
  if (sock.readyState !== sock.OPEN) return;
  // Lazy import to avoid a hard cycle with the store.
  import("../store/useGameStore.js").then(({ worldState, useGameStore }) => {
    // Guard again: the socket may have closed (leave/error) during the await.
    if (!ws || ws !== sock || ws.readyState !== ws.OPEN) return;
    const st = useGameStore.getState();
    const a = st.playerAppearance || {};
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
        kills: st.kills || 0,
        skin: a.skin,
        hair: a.hair,
        shirt: a.shirt,
        pants: a.pants,
      })
    );
  });
}

export function sendHit(targetPeerId, dmg) {
  if (!connected || !ws || ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify({ t: "hit", id: targetPeerId, dmg: dmg ?? 15 }));
}

/**
 * Host-only: tell the server to broadcast a "start" to everyone in the room so
 * all clients launch into the shared city together.
 */
export function sendStart() {
  if (!connected || !ws || ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify({ t: "start" }));
}

/**
 * Host-only: update the room's match settings (mode / duration / cops). The
 * server stores them and broadcasts a "config" to every member so non-hosts see
 * the chosen settings read-only in the lobby.
 */
export function sendConfig(config) {
  if (!connected || !ws || ws.readyState !== ws.OPEN) return;
  ws.send(
    JSON.stringify({
      t: "config",
      mode: config.mode,
      duration: config.duration,
      cops: config.cops,
    })
  );
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
