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
  setLobbyPhase: (p) => set({ lobbyPhase: p }),
  setMultiplayer: (m) => set({ multiplayer: m }),
  setRoomId: (id) => set({ roomId: id }),
  setPlayerName: (n) => set({ playerName: n }),
  setRoster: (r) => set({ roster: r }),

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
  damage: (amt) =>
    set((s) => ({ health: Math.max(0, s.health - amt) })),
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
  // Wanted becomes active after 5 kills OR 5 destroyed cars; each further
  // crime escalates stars. Decays via WantedSystem when you escape.
  addKill: () =>
    set((s) => {
      const kills = s.kills + 1;
      let wanted = s.wanted;
      if (kills + s.carKills >= 5) wanted = Math.min(5, Math.max(wanted, 1 + Math.floor((kills + s.carKills - 5) / 3)));
      return { kills, score: s.score + 100, wanted };
    }),
  addCarKill: () =>
    set((s) => {
      const carKills = s.carKills + 1;
      let wanted = s.wanted;
      if (s.kills + carKills >= 5) wanted = Math.min(5, Math.max(wanted, 1 + Math.floor((s.kills + carKills - 5) / 3)));
      return { carKills, score: s.score + 250, wanted };
    }),
}));
