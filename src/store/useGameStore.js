import { create } from "zustand";

/**
 * Central game store.
 *
 * IMPORTANT PERFORMANCE NOTE:
 * High-frequency data that changes every frame (player position, mobile joystick
 * vectors, aim direction, vehicle speed) is stored in PLAIN MUTABLE OBJECTS that
 * live OUTSIDE of React's reactive subscription system. We read/write these
 * directly inside useFrame() so that updating them does NOT cause React
 * re-renders (which would tank FPS).
 *
 * Reactive Zustand state is reserved ONLY for things that should trigger UI
 * updates: current weapon, camera mode, vehicle entered flag, paused flags,
 * ammo counts, wanted level, etc.
 */

/* -------------------------------------------------------------------------- */
/*  TRANSIENT (non-reactive) shared mutable refs                              */
/* -------------------------------------------------------------------------- */

// Mobile / keyboard movement input. x/z in range [-1, 1].
export const inputState = {
  // Left stick / WASD -> movement & steering
  move: { x: 0, z: 0 },
  moveActive: false,
  // Right stick / mouse -> aim / camera look (delta or absolute)
  look: { x: 0, y: 0 },
  // Discrete action flags (set by keyboard handlers & touch buttons)
  shoot: false,
  aim: false,
  jump: false,
  handbrake: false,
  nos: false,
  interact: false, // 'F' pressed this frame (consumed by interaction system)
  interactHeld: false,
  weaponWheel: false,
  // Throttle for driving (gas) separate from move on mobile
  gas: 0, // 0..1
  brake: 0, // 0..1
  // Helicopter collective / boost (set when flying a heli)
  up: false, // ascend (Space)
  down: false, // descend (Ctrl / C)
  boost: false, // heli boost (Shift)
};

// Live world telemetry written by physics/frame systems, read by HUD/minimap.
export const worldState = {
  playerPos: { x: 0, y: 1, z: 0 },
  playerRot: 0, // heading in radians
  vehiclePos: { x: 0, y: 0, z: 0 },
  vehicleHeading: 0,
  // "car" | "heli" — tells the camera & HUD which flight/drive model is active
  vehicleType: "car",
  speedKmh: 0,
  nosCharge: 1, // 0..1
  aimDir: { x: 0, y: 0, z: -1 },
  // hostiles & nearby cars for minimap (array of {x,z,type})
  blips: [],
  // wanted decay: timestamp (seconds) of the last crime committed
  lastCrime: -999,
  clock: 0, // running game clock in seconds (advanced by WantedSystem)
  // Day/night darkness factor 0..1 (0 = bright day, 1 = deep night). Driven by
  // DayNightCycle from the sun's height; read by light-decal systems.
  darkness: 0,
};

// Mark that a crime just happened (resets the wanted decay timer).
export function markCrime() {
  worldState.lastCrime = worldState.clock;
}

// Consume-once helper for the 'interact' edge trigger.
export function consumeInteract() {
  if (inputState.interact) {
    inputState.interact = false;
    return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/*  REACTIVE store                                                            */
/* -------------------------------------------------------------------------- */

export const WEAPONS = ["pistol", "rifle", "rocket", "bow"];

export const WEAPON_META = {
  pistol: { label: "Pistol", icon: "🔫", clip: 12, fireRate: 0.18, color: "#ffe14d", dmg: 10 },
  rifle: { label: "Rifle", icon: "🔫", clip: 30, fireRate: 0.075, color: "#9fe8ff", dmg: 9, auto: true },
  rocket: { label: "Rocket", icon: "🚀", clip: 4, fireRate: 1.0, color: "#ff7a3c", dmg: 100 },
  bow: { label: "Bow", icon: "🏹", clip: 6, fireRate: 0.6, color: "#7CFF6B", dmg: 60 },
};

export const useGameStore = create((set, get) => ({
  /* ---- meta / flow ---- */
  started: false,
  paused: false,
  isMobile:
    typeof navigator !== "undefined" &&
    /android|iphone|ipad|ipod|mobile|tablet/i.test(navigator.userAgent),
  landscapeOk: true,

  startGame: () => set({ started: true, paused: false }),
  setPaused: (p) => set({ paused: p }),
  setLandscape: (ok) => set({ landscapeOk: ok }),
  setMobile: (m) => set({ isMobile: m }),

  /* ---- multiplayer / lobby ---- */
  // lobby phase: "menu" (start screen) | "lobby" (room open, waiting) | "playing"
  lobbyPhase: "menu",
  multiplayer: false, // are we in an online room at all?
  roomId: null, // 6-char room code
  playerName: "Player",
  // roster for the lobby UI: [{id,name,isHost,ready}]
  roster: [],
  // Character appearance (synced to peers, persisted to localStorage).
  // Defaults read back on load via setAppearance() in App.
  playerAppearance: {
    skin: "#e8b98f",
    hair: "#1a1a22",
    shirt: "#f4f0e8",
    pants: "#2b2b3a",
  },
  setLobbyPhase: (p) => set({ lobbyPhase: p }),
  setMultiplayer: (m) => set({ multiplayer: m }),
  setRoomId: (id) => set({ roomId: id }),
  setPlayerName: (n) => set({ playerName: n }),
  setRoster: (r) => set({ roster: r }),
  // Merge a partial appearance update + persist to localStorage.
  setAppearance: (partial) =>
    set((s) => {
      const playerAppearance = { ...s.playerAppearance, ...partial };
      try {
        localStorage.setItem("neonAppearance", JSON.stringify(playerAppearance));
      } catch (e) {
        /* ignore */
      }
      return { playerAppearance };
    }),

  /* ---- camera ---- */
  // 'foot' | 'aim' | 'drive'
  cameraMode: "foot",
  setCameraMode: (m) => set({ cameraMode: m }),

  /* ---- player ---- */
  health: 100,
  maxHealth: 100,
  // increments every time the player is (re)spawned — systems can read it to
  // re-seed spawn-side effects. Purely reactive so anything can subscribe.
  spawnId: 0,
  // PvP: id of the player who last damaged us (for kill attribution). Cleared
  // on respawn. Also bumped via registerHit on every landed shot for HUD flash.
  lastHitBy: null,
  hitFlash: 0, // counter bumped each time we land a shot (crosshair feedback)
  registerHit: () => set((s) => ({ hitFlash: s.hitFlash + 1 })),
  // Multiplayer respawn: when health hits 0 we set respawnAt = now + 3000ms so
  // the HUD can show a countdown. Solo play keeps the instant respawn.
  respawnAt: null, // ms epoch when the pending respawn fires, or null
  damage: (amt, byId) =>
    set((s) => ({
      health: Math.max(0, s.health - amt),
      lastHitBy: byId != null ? byId : s.lastHitBy,
    })),
  heal: (amt) =>
    set((s) => ({ health: Math.min(s.maxHealth, s.health + amt) })),
  // Full respawn: full health, wanted wiped, score/kills kept.
  respawn: () =>
    set((s) => ({
      health: s.maxHealth,
      wanted: 0,
      activeVehicle: null,
      nearVehicle: null,
      cameraMode: "foot",
      spawnId: s.spawnId + 1,
      lastHitBy: null,
      respawnAt: null,
    })),

  wanted: 0, // 0..5 stars
  setWanted: (w) => set({ wanted: Math.max(0, Math.min(5, w)) }),
  addWanted: (n) =>
    set((s) => ({ wanted: Math.max(0, Math.min(5, s.wanted + n)) })),

  /* ---- weapons ---- */
  currentWeapon: "pistol",
  ammo: {
    pistol: { clip: 12, reserve: 96 },
    rifle: { clip: 30, reserve: 120 },
    rocket: { clip: 4, reserve: 12 },
    bow: { clip: 6, reserve: 18 },
  },
  // Add reserve ammo (from pickups), capped sensibly.
  addAmmo: (type, amount) =>
    set((s) => {
      const a = s.ammo[type];
      if (!a) return {};
      return { ammo: { ...s.ammo, [type]: { ...a, reserve: a.reserve + amount } } };
    }),
  setWeapon: (w) => set({ currentWeapon: w }),
  cycleWeapon: (dir = 1) =>
    set((s) => {
      const i = WEAPONS.indexOf(s.currentWeapon);
      const next = WEAPONS[(i + dir + WEAPONS.length) % WEAPONS.length];
      return { currentWeapon: next };
    }),
  consumeAmmo: () => {
    const s = get();
    const a = s.ammo[s.currentWeapon];
    if (!a || a.clip <= 0) return false;
    set({
      ammo: { ...s.ammo, [s.currentWeapon]: { ...a, clip: a.clip - 1 } },
    });
    return true;
  },
  reloadCurrent: () => {
    const s = get();
    const w = s.currentWeapon;
    const a = s.ammo[w];
    const max = WEAPON_META[w].clip;
    const need = max - a.clip;
    if (need <= 0 || a.reserve <= 0) return;
    const take = Math.min(need, a.reserve);
    set({
      ammo: {
        ...s.ammo,
        [w]: { clip: a.clip + take, reserve: a.reserve - take },
      },
    });
  },

  /* ---- weapon wheel & time scale ---- */
  wheelOpen: false,
  timeScale: 1,
  openWheel: () => set({ wheelOpen: true, timeScale: 0.25 }),
  closeWheel: () => set({ wheelOpen: false, timeScale: 1 }),

  /* ---- vehicle interaction ---- */
  // null when on foot, otherwise the id of the vehicle being driven
  activeVehicle: null,
  nearVehicle: null, // id of vehicle in interact range (for prompt)
  setNearVehicle: (id) => set({ nearVehicle: id }),
  enterVehicle: (id) =>
    set({ activeVehicle: id, cameraMode: "drive", nearVehicle: null }),
  exitVehicle: () => set({ activeVehicle: null, cameraMode: "foot" }),

  /* ---- score ---- */
  score: 0,
  addScore: (n) => set((s) => ({ score: s.score + n })),
  kills: 0,
  carKills: 0,
  // Team deathmatch: this client's own team ("A" | "B" | null) and how many
  // kills its team has racked up (bumped locally on every lethal hit, since the
  // shooter always knows they made the kill — no dispute possible).
  team: null,
  teamKills: { A: 0, B: 0 },
  addTeamKill: () =>
    set((s) =>
      s.team
        ? { teamKills: { ...s.teamKills, [s.team]: s.teamKills[s.team] + 1 } }
        : {}
    ),
  // Apply a remote team-kill tally (echoed from peers' state) so the scoreboard
  // converges across clients even if you didn't witness the kill.
  setTeamKills: (team, n) =>
    set((s) => ({ teamKills: { ...s.teamKills, [team]: Math.max(s.teamKills[team] || 0, n) } })),
  setTeam: (team) => set({ team }),
  // Wanted becomes active after 5 kills OR 5 destroyed cars; each further
  // crime escalates stars. Decays via WantedSystem when you escape. In a team
  // deathmatch cops are disabled, so the wanted escalation is a no-op visually.
  addKill: () =>
    set((s) => {
      const kills = s.kills + 1;
      const next = { kills, score: s.score + 100 };
      // Only escalate wanted in solo play; matches disable cops.
      if (!s.multiplayer) {
        let wanted = s.wanted;
        if (kills + s.carKills >= 5) wanted = Math.min(5, Math.max(wanted, 1 + Math.floor((kills + s.carKills - 5) / 3)));
        next.wanted = wanted;
      }
      return next;
    }),
  addCarKill: () =>
    set((s) => {
      const carKills = s.carKills + 1;
      const next = { carKills, score: s.score + 250 };
      if (!s.multiplayer) {
        let wanted = s.wanted;
        if (s.kills + carKills >= 5) wanted = Math.min(5, Math.max(wanted, 1 + Math.floor((s.kills + carKills - 5) / 3)));
        next.wanted = wanted;
      }
      return next;
    }),

  /* ---- match / team deathmatch config ----
   * Host-only editable; broadcast through the server as a "config" message.
   * matchStartTime is set (locally, on start) so the MatchHUD can count down
   * in sync across all clients (they all received the same "start" message).
   * matchOver flips the HUD to the end screen. */
  matchConfig: { mode: "tdm4", duration: 10, cops: false },
  matchStartTime: null, // ms epoch when the match began
  matchOver: false,
  setMatchConfig: (partial) =>
    set((s) => ({ matchConfig: { ...s.matchConfig, ...partial } })),
  beginMatch: () =>
    set({ matchStartTime: Date.now(), matchOver: false }),
  endMatch: () => set({ matchOver: true }),
  resetMatch: () => set({ matchOver: false, matchStartTime: null, teamKills: { A: 0, B: 0 }, kills: 0, carKills: 0, score: 0 }),
}));
