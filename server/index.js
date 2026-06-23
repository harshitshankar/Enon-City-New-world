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
 *     { t: "join",  room, name }            join/create a room
 *     { t: "state", pos, rot, vel, vehicle, wanted, health }  periodic pose
 *     { t: "hit",   id }                     "I shot player id"
 *     { t: "leave" }                         graceful leave
 *   server -> client:
 *     { t: "roster", players: [{id,name}]... , self }   room membership + your id
 *     { t: "join",   id, name }              a player joined
 *     { t: "state",  id, pos, rot, ... }     a player's pose
 *     { t: "hit",    id, by }                someone was hit
 *     { t: "leave",  id }                    a player left
 *     { t: "full" }                          room is full (8/8)
 *
 * Rooms live in memory and are removed when empty. No persistence.
 *
 * Deploy: render.com Web Service, Start Command `node index.js`.
 */

import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 8080;
const MAX_PLAYERS = 8;

const wss = new WebSocketServer({ port: PORT, path: "/" });

/** @type {Map<string, { id:number, name:string, ws:WebSocket }[]>} room code -> members */
const rooms = new Map();
let nextId = 1;

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

function rosterFor(roomCode) {
  const members = rooms.get(roomCode) || [];
  return members.map((m) => ({ id: m.id, name: m.name }));
}

function broadcast(roomCode, msg, exceptId = null) {
  const members = rooms.get(roomCode);
  if (!members) return;
  for (const m of members) {
    if (m.id === exceptId) continue;
    send(m.ws, msg);
  }
}

function removeMember(roomCode, id) {
  const members = rooms.get(roomCode);
  if (!members) return;
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
        let members = rooms.get(room);
        if (!members) {
          members = [];
          rooms.set(room, members);
        }
        if (members.length >= MAX_PLAYERS) {
          send(ws, { t: "full" });
          return;
        }
        self.room = room;
        self.name = (msg.name || "Player").slice(0, 16);
        members.push(self);
        // tell the joiner its id + the full roster
        send(ws, { t: "roster", players: rosterFor(room), self: self.id, room });
        // tell everyone else a new player joined
        broadcast(room, { t: "join", id: self.id, name: self.name }, self.id);
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
        // relay the hit (target id + attacker id) to the whole room
        broadcast(self.room, { t: "hit", id: msg.id, by: self.id });
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
  for (const [code, members] of rooms) {
    for (let i = members.length - 1; i >= 0; i--) {
      if (members[i].ws.readyState !== members[i].ws.OPEN) {
        members.splice(i, 1);
        broadcast(code, { t: "leave", id: members[i]?.id });
      }
    }
    if (members.length === 0) rooms.delete(code);
  }
}, 20000);

console.log(`NEON CITY relay server listening on :${PORT}`);
