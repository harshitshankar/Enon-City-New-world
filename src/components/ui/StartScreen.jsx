import { useGameStore } from "../../store/useGameStore";
import { initAudio, startMusic } from "../../lib/audio";

/**
 * StartScreen — the landing / main-menu page shown before the game runs.
 * Explains what NEON CITY is, the controls, and the core gameplay loop, then
 * launches the game (and, on desktop, captures the mouse for FPS-style aim).
 */
export default function StartScreen({ onMultiplayer, onCustomize }) {
  const startGame = useGameStore((s) => s.startGame);
  const isMobile = useGameStore((s) => s.isMobile);

  const requestPointer = () => {
    // Audio must be unlocked by a user gesture.
    initAudio();
    startMusic();
    if (!isMobile) {
      // request pointer lock for mouse-look on desktop
      const el = document.querySelector("canvas");
      el?.requestPointerLock?.();
    }
    startGame();
  };

  return (
    <div
      className="absolute inset-0 flex flex-col items-center text-center px-6 overflow-y-auto"
      style={{
        zIndex: 100,
        background:
          "radial-gradient(ellipse at 50% 25%, #2a1850 0%, #160826 55%, #07030f 100%)",
        paddingTop: "max(20px, 5vh)",
        paddingBottom: "max(20px, 5vh)",
        justifyContent: "safe center",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <p className="text-purple-200/70 tracking-[0.45em] text-[11px] mb-1">
        OPEN WORLD · HEIST · DRIVING
      </p>
      <h1
        className="font-black tracking-tight neon-text"
        style={{
          fontSize: "clamp(38px, 8vw, 86px)",
          background: "linear-gradient(180deg,#ffd6f5,#ff5ac8 60%,#9b59ff)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          lineHeight: 1,
        }}
      >
        NEON CITY
      </h1>
      <p className="text-cyan-200/80 mt-2 text-sm max-w-xl leading-relaxed">
        A neon-soaked sandbox. Drive, hijack, shoot and survive the cops across a
        living grid city with a full day&nbsp;→&nbsp;night&nbsp;→&nbsp;sunset
        cycle. Rack up a high score, lose your wanted level, and respawn when you
        go down.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={requestPointer}
          className="px-10 py-4 rounded-full font-extrabold text-lg text-white active:scale-95 transition-transform"
          style={{
            background: "linear-gradient(90deg,#ff5ac8,#ff8a3c)",
            boxShadow: "0 0 30px rgba(255,90,200,0.6)",
          }}
        >
          ▶ ENTER THE CITY
        </button>
        <button
          onClick={onMultiplayer}
          className="px-8 py-4 rounded-full font-extrabold text-base text-white active:scale-95 transition-transform"
          style={{
            background: "linear-gradient(90deg,#3ba8ff,#9b59ff)",
            boxShadow: "0 0 24px rgba(59,168,255,0.5)",
          }}
        >
          🌐 MULTIPLAYER
        </button>
        <button
          onClick={onCustomize}
          className="px-8 py-4 rounded-full font-extrabold text-base text-white active:scale-95 transition-transform"
          style={{
            background: "linear-gradient(90deg,#7CFF6B,#3ba8ff)",
            boxShadow: "0 0 24px rgba(124,255,107,0.5)",
          }}
        >
          🎨 CUSTOMIZE
        </button>
      </div>

      {/* ---------- What to do ---------- */}
      <div className="mt-8 grid grid-cols-2 gap-3 w-full max-w-2xl">
        <Feature icon="🚗" title="Drive & Hijack"
          text="Steal parked cars, AI traffic, or pursuing police cruisers. Nitro boost (Shift / 🔥)." />
        <Feature icon="🔫" title="Combat"
          text="Pistol, rifle, rocket & bow. Camera-aim with the crosshair, blow up cars & NPCs." />
        <Feature icon="⭐" title="Wanted System"
          text="Crimes raise 1–5 stars. Police chase & ram. Lose them for ~8s to clear it." />
        <Feature icon="🌆" title="Living World"
          text="Pedestrians, traffic, day/night cycle, neon skyline, pickups & explosions." />
      </div>

      {/* ---------- Controls ---------- */}
      <div className="mt-7 max-w-2xl w-full text-left hud-panel rounded-xl p-4 text-purple-100/90 text-xs leading-relaxed">
        <div className="text-pink-300 font-bold mb-2 tracking-widest">CONTROLS</div>
        {isMobile ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span>🕹️ Left joystick — move / steer</span>
            <span>👆 Right pad — swipe to look / aim</span>
            <span>🔫 Fire · 🎯 Aim toggle</span>
            <span>⤴ Jump · ◎ Weapon wheel</span>
            <span>🅵 Enter / Exit vehicle</span>
            <span>🔥 Nitro · ✋ Brake (in car)</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span><b className="text-pink-300">WASD</b> move / drive</span>
            <span><b className="text-pink-300">Mouse</b> aim &amp; camera (locked)</span>
            <span><b className="text-pink-300">Left-Click</b> shoot</span>
            <span><b className="text-pink-300">Right-Click</b> toggle aim</span>
            <span><b className="text-pink-300">F</b> enter / hijack / exit</span>
            <span><b className="text-pink-300">Shift</b> nitro</span>
            <span><b className="text-pink-300">Space</b> jump / handbrake</span>
            <span><b className="text-pink-300">Q</b> weapon wheel</span>
            <span><b className="text-pink-300">1 2 3 4</b> weapons</span>
            <span><b className="text-pink-300">R</b> reload · <b className="text-pink-300">Esc</b> free mouse</span>
          </div>
        )}
      </div>

      {/* ---------- Tips ---------- */}
      <div className="mt-4 max-w-2xl w-full text-left hud-panel rounded-xl p-4 text-purple-100/80 text-xs leading-relaxed">
        <div className="text-cyan-300 font-bold mb-2 tracking-widest">TIPS</div>
        <ul className="space-y-1 list-disc list-inside">
          <li>Die and you respawn on the far side of the map with wanted cleared.</li>
          <li>A hijacked police car stays with you forever — even after the heat dies down.</li>
          <li>Grab ❤️ health and 🧰 ammo pickups to stay in the fight.</li>
          <li>Esc frees your mouse; click the canvas to recapture it.</li>
        </ul>
      </div>

      <p className="mt-6 text-purple-300/40 text-[10px] tracking-widest">
        WebGL · React Three Fiber · Rapier Physics
      </p>
    </div>
  );
}

function Feature({ icon, title, text }) {
  return (
    <div className="hud-panel rounded-xl p-3 text-left">
      <div className="text-pink-200 text-xs font-bold tracking-wider">
        <span className="mr-1">{icon}</span>
        {title.toUpperCase()}
      </div>
      <div className="text-purple-100/75 text-[11px] mt-1 leading-snug">{text}</div>
    </div>
  );
}
