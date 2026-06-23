# 🌆 NEON CITY — 3D WebGL Open-World Driving Game

A neon-soaked, sandbox driving/shooting game built with **React Three Fiber**, **Rapier
physics**, and **WebGL**. Steal cars, hijack police cruisers, fly helicopters, survive
escalating wanted levels, and explore a **3-district city** with a full day → sunset → night
cycle — solo or with up to 8 players online.

> Single-file production build — the entire game client compiles to one `index.html`.

---

## 🆕 v2 — Helicopters, bigger map, multiplayer

- **🚁 Helicopters** — flyable rotorcraft you can hijack. Land on **downtown rooftops**,
  fly over the lake, and boost across the city. Auto-hover makes them forgiving.
- **🗺️ 3x bigger map with 3 districts** — **Downtown** (tall skyscrapers, landable roofs),
  **Suburbs** (low houses), and a **Park/Lake** district (trees, grass, water you can fly
  over but not drive into).
- **🌐 Multiplayer** — Create/Join a room by 6-char code, **1–8 players** share the same
  city in real time via a lightweight WebSocket relay server. Falls back to solo if the
  server is down.
- **🐛 Bug fixes** — no more glitching through buildings (fixed-timestep physics + CCD);
  bullets now reliably kill NPCs (swept segment-vs-sphere hit detection); NPCs respawn
  near the action so the city never empties.

---

## ✨ Features

- **Open-world city** — procedural grid of roads, sidewalks, instanced skyscrapers with
  baked neon windows, street lights and dashed road markings.
- **Arcade driving** — velocity-controlled cars with crisp GTA-style handling, nitro boost,
  tire screech, handbrake, and a spotlight/headlight cone for the player car.
- **🚁 Helicopters** — 6DOF flight, auto-hover, rooftop landing, destructible.
- **Hijack anything** — parked cars, AI traffic, police cruisers, and helicopters.
  Every car is destructible (health → explosion → respawn) and hijackable.
- **Combat** — pistol, rifle, rocket launcher and bow. Camera-relative aiming with a real
  crosshair, projectiles, explosions and contact damage.
- **Wanted system (1–5★)** — crimes escalate your wanted level; police cruisers spawn,
  chase and ram. Avoid crimes for ~8 s and the stars decay back to zero.
- **Respawn on death** — at 0 HP you explode and respawn on the **far side of the map**
  with full health and a clean wanted level.
- **Persistent hijacked vehicles** — a car you've stolen (especially a police car) is kept
  mounted for the whole session and **never vanishes** when your wanted level clears.
  (This rule is designed to extend to any human-driven car in the planned multiplayer.)
- **Dynamic day/night cycle** — gradient sky dome (blue zenith, warm horizon), moving sun
  & moon, shadows that follow the player, and color-graded fog from morning blue to
  golden hour to pink sunset to starlit night.
- **Living world** — wandering/panicking pedestrians, traffic loops, health & ammo pickups.
- **Cross-platform UI** — on-screen joystick + buttons on mobile/touch, pointer-lock
  mouse-aim on desktop, circular minimap, weapon wheel, speedometer, NoS & health bars.
- **Procedural audio** — synthesized SFX + a looping synthwave soundtrack (no asset files).

---

## 🎮 Controls

### Desktop (mouse + keyboard)

| Action | Key |
| --- | --- |
| Move / Drive | `W A S D` (or arrows) |
| Aim & camera | **Mouse** (pointer-locked to the crosshair) |
| Shoot | **Left-Click** |
| Toggle aim | **Right-Click** |
| Enter / Hijack / Exit vehicle | `F` |
| Nitro (in car) | `Shift` |
| Jump (on foot) / Handbrake (in car) | `Space` |
| **🚁 Helicopter** ascend / descend / boost | `Space` / `Ctrl` (or `C`) / `Shift` |
| **🚁 Helicopter** pitch/strafe/yaw | `W A S D` / mouse |
| Weapon wheel | `Q` |
| Select weapon | `1` Pistol · `2` Rifle · `3` Rocket · `4` Bow |
| Reload | `R` |
| Cycle weapon | Mouse wheel |
| Free / recapture mouse | `Esc` → click the canvas |

### Mobile / touch (landscape)

- 🕹️ **Left joystick** — move / steer (bottom-left)
- 👆 **Right side** — swipe anywhere to look / aim
- 🔫 **FIRE** · 🎯 **AIM** · ⤴ **JUMP** · ◎ **Weapon wheel**
- 🅵 **ENTER / EXIT** vehicle
- In a car: **GAS** · **BRAKE** · 🔥 **NITRO**
- Minimap sits top-left; the score/wanted panel sits top-center so nothing overlaps the stick.

> Mobile requires **landscape** orientation — a rotate prompt appears in portrait.

---

## 🕹️ Gameplay loop

1. Spawn on foot in the city. Grab a parked car or hijack traffic.
2. Cause chaos → **wanted stars** rise → **police cruisers** spawn and chase you.
3. Fight back (or flee), pick up ❤️ health & 🧰 ammo.
4. If you die, you **respawn** across the map with wanted cleared.
5. Chase the high score — every kill / car destroyed adds to it.

---

## 🛠️ Tech stack

- **React 19** + **Vite 7** (TypeScript config, JSX components)
- **@react-three/fiber** + **@react-three/drei** — declarative Three.js
- **@react-three/rapier** — WASM physics
- **Zustand** — game store (high-frequency data kept in plain mutable refs to avoid
  re-renders during the frame loop)
- **Tailwind CSS v4** — HUD styling
- **vite-plugin-singlefile** — inlines everything into one `index.html`

### Project structure

```
src/
  App.jsx                     # root: canvas + HUD + start screen + pointer lock
  components/
    GameCanvas.jsx            # R3F <Canvas> + <Physics> world composition
    player/
      Player.jsx              # on-foot controller, shooting, vehicle enter/exit, respawn
      CameraRig.jsx           # damped third-person camera (foot / aim / drive)
      PointerLock.jsx         # desktop mouse capture for aim + camera
      CharacterMesh.jsx
    vehicles/
      Car.jsx                 # one car actor: driving, AI, police chase, destruction
      VehicleManager.jsx      # parked + AI traffic cars
      PoliceManager.jsx       # spawns/persists police cruisers by wanted level
    world/
      World.jsx               # ground, roads, sidewalks, buildings, street lights, bounds
      DayNightCycle.jsx       # sky dome, sun/moon, ambient, fog, time-of-day palette
      WantedSystem.jsx        # game clock + wanted decay
      Pickups.jsx             # health & ammo pickups
    npc/NPCManager.jsx        # instanced pedestrians (wander/panic/ragdoll/dead)
    combat/                   # projectiles + explosions
    ui/                       # HUD, MiniMap, Joystick, TouchButton, MobileControls, WeaponWheel, StartScreen
    OrientationGuard.jsx      # landscape enforcement (mobile)
  store/useGameStore.js       # Zustand store + transient input/world state
  hooks/useKeyboard.js        # keyboard + mouse input
  lib/                        # registry, events, procedural audio
```

---

## 🚀 Run locally

Requires **Node.js 18+**.

```bash
# 1. Install dependencies
npm install

# 2. Development mode (hot-reload, great for testing)
npm run dev
# → opens at http://localhost:5173

# 3. Production build (single index.html)
npm run build
# → outputs dist/index.html (≈3.5 MB, ≈1.2 MB gzip)

# 4. Preview the production build locally
npm run preview
# → opens at http://localhost:4173
```

### Quick test checklist

| What to verify | How |
| --- | --- |
| Game loads, start screen visible | Open `http://localhost:5173` |
| WASD + mouse look | Click **ENTER THE CITY**, cursor locks to crosshair |
| Shoot / aim | Left-click fires, right-click toggles aim |
| Enter a car / helicopter | Walk/fly up, press **F** |
| Fly a helicopter | `Space`/`Ctrl` ascend/descend, `WASD`+mouse to steer, `Shift` boost |
| Land on a rooftop | Fly low + slow over a flat downtown roof — it auto-settles |
| Police chase | Cause chaos until ★ appears |
| Death → respawn | Let police kill you; you reappear on the other side |
| Mobile layout | Open Chrome DevTools → toggle device toolbar → pick a phone |

---

## 🌐 Multiplayer

Up to **8 players** can share one city in real time. The host creates a room, shares the
6-char code, everyone joins, and the host presses START. Each player's avatar (with a
distinct colour + minimap blip) is replicated to all others.

### Architecture

- **Relay server** (`server/index.js`) — a tiny stateless Node + `ws` WebSocket server that
  holds rooms in memory and fans messages out. No database. Deployed as a **separate
  Render Web Service**.
- **Client** (`src/lib/net.js`) — connects, joins a room, broadcasts pose ~15 Hz, and keeps
  a non-reactive `peers` map. **Solo fallback:** if the server is unreachable the game keeps
  running and shows a "playing solo" notice.
- **Rendering** (`src/components/player/RemotePlayers.jsx`) — up to 7 interpolated ghost
  avatars + minimap blips.

### Protocol

```
client -> server:  { t:"join", room, name } | { t:"state", pos,rot,vel,vehicle,wanted,health } | { t:"hit", id } | { t:"leave" }
server -> client:  { t:"roster", players, self, room } | { t:"join", id, name } | { t:"state", id, ... } | { t:"hit", id, by } | { t:"leave", id } | { t:"full" }
```

### Run the relay server locally

```bash
cd server
npm install
npm start          # listens on http://localhost:8080
```

The dev client auto-connects to `ws://localhost:8080` (wired through the Vite `/ws` proxy).
Open the game in two browser tabs: **Multiplayer → Create Room** in one, copy the code,
**Join Room** in the other, then the host hits START.

### Production wiring

Set the client env var `VITE_WS_URL` to your deployed WebSocket URL before building:

```bash
# example
VITE_WS_URL=wss://neon-city-ws.onrender.com npm run build
```

If unset, it defaults to `ws://localhost:8080`.

> Room codes are 6-char (e.g. `KR7Q2X`). Rooms cap at 8 players and auto-delete when empty.

---

## ☁️ Deploy on Render (two services)

NEON CITY ships as **two services**: a static site for the game client, and a web service
for the multiplayer relay. (If you only want single-player, skip the relay.)

### Service 1 — Game client (Static Site)

- A [GitHub](https://github.com) account with this project pushed to a repo.
- A [Render](https://render.com) account (free tier works).

### Option A — Static Site (recommended, free tier)

This is the simplest approach — Render serves your `dist/index.html` over HTTPS.

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin https://github.com/YOUR_USER/neon-city.git
   git push -u origin main
   ```

2. **Create a new Static Site on Render**
   - Go to [render.com](https://render.com) → **New +** → **Static Site**.
   - Click **Connect** and select your GitHub repo.
   - Set these fields:

   | Field | Value |
   | --- | --- |
   | **Build Command** | `npm install && npm run build` |
   | **Publish Directory** | `dist` |

3. **Click "Create Static Site"**.
   - Render clones your repo, runs the build, and deploys `dist/`.
   - Your game goes live at `https://your-app-name.onrender.com`.
   - Every push to `main` auto-redeploys.

4. **(Optional) Custom domain**
   - In the Render dashboard → Settings → Custom Domain → add your domain.

### Option B — Web Service (if you need a custom Node server)

1. **New +** → **Web Service** → connect the repo.
2. **Runtime:** Node.
3. **Build Command:** `npm install && npm run build`
4. **Start Command:** `npx vite preview --host 0.0.0.0 --port $PORT`
5. Render assigns `$PORT` automatically; the app is live on the service URL.

### Notes

- The game client is **fully client-side** — the Static Site is all you need for solo play.
- WebGL + WASM (Rapier) run in all modern browsers; no special server config needed.
- Because the build inlines all JS/CSS into one HTML file, cold loads are a single request.

### Service 2 — Multiplayer relay (Web Service)

1. **New +** → **Web Service** → connect the same repo.
2. **Root Directory:** `server`
3. **Runtime:** Node
4. **Build Command:** `npm install`
5. **Start Command:** `node index.js`
6. Render assigns `$PORT` automatically; the server reads `process.env.PORT`.
7. Once live at e.g. `https://neon-city-ws.onrender.com`, set the **client's** env var:
   - On the Static Site → Environment → `VITE_WS_URL = wss://neon-city-ws.onrender.com`
   - (or build locally with that env var and commit `dist/`)

> The relay holds rooms in RAM only — it restarts cleanly and costs near-zero. Free tier is
> plenty for casual rooms.

---

## 🌆 The three districts

The 12×12 grid (~336×336 units) is split into regions you can visit, drive, and fly over:

| District | Where | Style |
| --- | --- | --- |
| **Downtown** | Central band | Tall neon skyscrapers (22–60m) with **wide flat rooftops** — land your helicopter here. |
| **Suburbs** | Outer ring | Low houses (4–12m), green lots, lighter palette. |
| **Park / Lake** | +x,+z corner | Grass, instanced trees, and a translucent **lake** ringed by invisible walls (cars can't enter, helicopters fly over). |

Minimap, NPCs, pickups, AI traffic, and police all scale with the new map size.

---

## 🤖 Convert to Android APK (Android Studio)

The `android/` folder in this repo is a **ready-to-open Android Studio project** that
wraps the game in a full-screen WebView. No native code changes needed — just build and run.

### How it works

The game compiles to a **single `dist/index.html`** file. The Android project loads that
file from `assets/` using `file:///android_asset/index.html`. This means:

- No server needed — the game works **offline** once installed.
- WebGL performance is excellent on modern Android devices.
- You can also point the WebView at a remote URL (Render, etc.) instead.

### Step-by-step

1. **Build the web game and copy into Android assets**
   ```bash
   # Windows:
   build-android.bat

   # Mac/Linux:
   chmod +x build-android.sh
   ./build-android.sh
   ```
   This runs `npm run build` and copies `dist/index.html` → `android/app/src/main/assets/index.html`.

2. **Open in Android Studio**
   - Launch Android Studio.
   - **File → Open** → select the `android/` folder inside this project.
   - Wait for Gradle sync to finish (may take 1–2 minutes the first time).

3. **Connect a device or start the emulator**
   - **Real device:** enable Developer Options → USB Debugging → plug in via USB.
   - **Emulator:** Android Studio → Tools → Device Manager → Create Virtual Device → pick
     a device with API 24+ (Android 7.0+).

4. **Run**
   - Click the green **▶ Run** button (or `Shift + F10`).
   - The game installs and launches fullscreen in landscape.

5. **Build a signed APK for distribution**
   - **Build → Generate Signed Bundle / APK**.
   - Select **APK**, create a keystore, set release build variant.
   - The signed `.apk` file is saved to `android/app/release/`.

### Android project structure

```
android/
  build.gradle              # Root Gradle config
  settings.gradle           # Module includes
  gradle.properties         # JVM args
  gradle/wrapper/            # Gradle 8.5 wrapper
  app/
    build.gradle            # App module: minSdk 24, targetSdk 34
    proguard-rules.pro
    src/main/
      AndroidManifest.xml   # INTERNET perm, landscape, fullscreen
      assets/
        index.html          # ← your built game goes here
      java/com/neoncity/game/
        MainActivity.java   # Full-screen WebView shell
      res/
        values/
          strings.xml       # App name: "NEON CITY"
          colors.xml
          styles.xml        # Fullscreen theme, no action bar
```

### Switch between bundled vs. hosted URL

In `MainActivity.java`, find this line:

```java
webView.loadUrl("file:///android_asset/index.html");
```

To load from your Render deployment instead:

```java
webView.loadUrl("https://your-app-name.onrender.com");
```

The bundled version works offline; the hosted version always gets the latest build.

### Performance tips

- **Target API 24+** — WebGL2 and hardware-accelerated WebView are stable.
- **Test on a real device** — emulators often have poor GPU simulation.
- **Debug with `chrome://inspect`** — `setWebContentsDebuggingEnabled(true)` is on in
  debug builds. Open `chrome://inspect` on your computer, find your device, and inspect
  the WebView's console/network/WebGL just like a desktop tab.

---

## ⚙️ How key systems work

- **Performance model:** per-frame data (positions, joystick vectors, aim dir, speed) lives
  in plain mutable objects (`inputState`, `worldState`) read/written inside `useFrame`, so
  updates never trigger React re-renders. Only UI-facing state (weapon, wanted, ammo,
  camera mode, vehicle flag) goes through the reactive Zustand store.
- **Vehicles** register a live rigidbody ref + position getter in a shared registry so the
  player can find the nearest hijackable car cheaply. A car reports `occupied` based on the
  store's `activeVehicle`, and police cars are remembered once hijacked so they persist.
- **Death/respawn:** when HP hits 0 the player is kicked out of any vehicle, teleported to
  the diagonally-opposite side of the map, restored to full HP, and wanted is reset.
- **Day/night:** a gradient sky-dome shader blends zenith/horizon/ground colors and a sun
  halo across a palette of keyframes; fog and lights follow the same timeline.

---

## 🗺️ Roadmap (planned)

- **Multiplayer** — netcode so multiple human players share the city. The "any human-driven
  vehicle is always present" rule is already written with this in mind.

---

## 📄 License

Personal/educational project. Replace third-party assets with your own before any
commercial use.
