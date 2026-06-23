/**
 * NEON CITY — multiplayer relay server
 * ------------------------------------------------------------------
 * A tiny stateless WebSocket relay that hosts "rooms" identified by 6-char
 * codes. Up to 8 clients can join a room; each client broadcasts its own
 * player state (~15 Hz) and the server fans every message out to the other
 * members of the same room.
 *
 * Message protocol (JSON):
 *   client -> server:
 *     { t: "join",  room, name, skin, hair, shirt, pants }  join/create a room
 *     { t: "state", pos, rot, vel, vehicle, wanted, health, kills, skin.. }  pose
 *     { t: "hit",   id, dmg }                "I shot player id for dmg"
 *     { t: "config", mode, duration, cops }  host-only match settings
 *     { t: "leave" }                         graceful leave
 *   server -> client:
 *     { t: "roster", players: [{id,name,team}]... , self, room, config }  membership
 *     { t: "join",   id, name, team }        a player joined
 *     { t: "state",  id, pos, rot, ... }     a player's pose
 *     { t: "hit",    id, by, dmg }           someone was hit
 *     { t: "config", mode, duration, cops }  host changed settings (broadcast)
 *     { t: "leave",  id }                    a player left
 *     { t: "full" }                          room is full (8/8)
 *
 * Teams: assigned deterministically by join order — index 0,2,4,6 -> Team A,
 * index 1,3,5,7 -> Team B. This keeps 2v2 balanced from the first 4 players and
 * 4v4 balanced across all 8, with no negotiation between clients.
 *
 * Rooms live in memory and are removed when empty. No persistence.
 *
 * Deploy: render.com Web Service, Start Command `node index.js`.
 */

import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 8080;
const MAX_PLAYERS = 8;

const wss = new WebSocketServer({ port: PORT, path: "/" });

/**
 * @type {Map<string, { members: object[], config: object }>} room code -> room
 * Each member: { id, name, ws }. Team is derived from the member's index in the
 * array (parity), so it is recomputed fresh on every roster request — players
 * keep a stable team as long as nobody ahead of them leaves.
 */
const rooms = new Map();
let nextId = 1;

// Default match config the host can override from the lobby.
const DEFAULT_CONFIG = { mode: "tdm4", duration: 10, cops: false };

function makeCode() {
  // 6-char A-Z0-9 (no ambiguous chars)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

/** Team by join-order parity: even index -> A, odd -> B. */
function teamForIndex(i) {
  return i % 2 === 0 ? "A" : "B";
}

function rosterFor(roomCode) {
  const room = rooms.get(roomCode);
  const members = room ? room.members : [];
  return members.map((m, i) => ({ id: m.id, name: m.name, team: teamForIndex(i) }));
}

function configFor(roomCode) {
  const room = rooms.get(roomCode);
  return room ? room.config : { ...DEFAULT_CONFIG };
}

function broadcast(roomCode, msg, exceptId = null) {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const m of room.members) {
    if (m.id === exceptId) continue;
    send(m.ws, msg);
  }
}

function removeMember(roomCode, id) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const members = room.members;
  const idx = members.findIndex((m) => m.id === id);
  if (idx === -1) return;
  members.splice(idx, 1);
  broadcast(roomCode, { t: "leave", id });
  if (members.length === 0) rooms.delete(roomCode);
}

wss.on("connection", (ws) => {
  const self = { id: nextId++, name: "Player", room: null, ws };

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return; // ignore malformed
    }

    switch (msg.t) {
      case "join": {
        // leave any previous room first
        if (self.room) removeMember(self.room, self.id);
        const room = (msg.room || "").toUpperCase().slice(0, 6) || makeCode();
        let roomObj = rooms.get(room);
        if (!roomObj) {
          roomObj = { members: [], config: { ...DEFAULT_CONFIG } };
          rooms.set(room, roomObj);
        }
        const members = roomObj.members;
        if (members.length >= MAX_PLAYERS) {
          send(ws, { t: "full" });
          return;
        }
        self.room = room;
        self.name = (msg.name || "Player").slice(0, 16);
        members.push(self);
        // tell the joiner its id + the full roster (teams + current config)
        send(ws, {
          t: "roster",
          players: rosterFor(room),
          self: self.id,
          room,
          config: configFor(room),
        });
        // tell everyone else a new player joined (with their team)
        broadcast(
          room,
          { t: "join", id: self.id, name: self.name, team: teamForIndex(members.length - 1) },
          self.id
        );
        break;
      }
      case "state": {
        if (!self.room) return;
        // fan the pose out to the rest of the room with our id attached
        broadcast(self.room, { t: "state", id: self.id, ...msg }, self.id);
        break;
      }
      case "hit": {
        if (!self.room) return;
        // relay the hit (target id + attacker id + damage) to the whole room
        broadcast(self.room, { t: "hit", id: msg.id, by: self.id, dmg: msg.dmg });
        break;
      }
      case "config": {
        // Host-only: update the room's match settings and broadcast to all.
        if (!self.room) return;
        const roomObj = rooms.get(self.room);
        if (!roomObj) return;
        roomObj.config = {
          mode: msg.mode || DEFAULT_CONFIG.mode,
          duration: Number(msg.duration) || DEFAULT_CONFIG.duration,
          cops: !!msg.cops,
        };
        broadcast(self.room, { t: "config", ...roomObj.config });
        break;
      }
      case "start": {
        // Host started the game — tell EVERY member (including the host echo)
        // to launch into the shared city, carrying the final roster (teams) and
        // the agreed match config so everyone starts with identical settings.
        if (!self.room) return;
        broadcast(self.room, {
          t: "start",
          room: self.room,
          roster: rosterFor(self.room),
          config: configFor(self.room),
        });
        break;
      }
      case "leave": {
        if (self.room) removeMember(self.room, self.id);
        self.room = null;
        break;
      }
      default:
        break;
    }
  });

  ws.on("close", () => {
    if (self.room) removeMember(self.room, self.id);
  });

  ws.on("error", () => {
    if (self.room) removeMember(self.room, self.id);
  });
});

// Heartbeat: prune dead connections every 20s.
setInterval(() => {
  for (const [code, room] of rooms) {
    const members = room.members;
    for (let i = members.length - 1; i >= 0; i--) {
      if (members[i].ws.readyState !== members[i].ws.OPEN) {
        const deadId = members[i].id; // capture BEFORE splice
        members.splice(i, 1);
        broadcast(code, { t: "leave", id: deadId });
      }
    }
    if (members.length === 0) rooms.delete(code);
  }
}, 20000);

console.log(`NEON CITY relay server listening on :${PORT}`);
