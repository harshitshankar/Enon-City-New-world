import { useEffect, useRef, useState } from "react";
import {
  useGameStore,
  worldState,
  WEAPON_META,
} from "../../store/useGameStore";
import MiniMap from "./MiniMap";
import WeaponWheel from "./WeaponWheel";
import MobileControls from "./MobileControls";

/**
 * 2D HUD overlay drawn on top of the canvas. Absolute positioned, no overlap.
 */
export default function HUD() {
  const isMobile = useGameStore((s) => s.isMobile);
  const weapon = useGameStore((s) => s.currentWeapon);
  const ammo = useGameStore((s) => s.ammo)[weapon];
  const health = useGameStore((s) => s.health);
  const maxHealth = useGameStore((s) => s.maxHealth);
  const wanted = useGameStore((s) => s.wanted);
  const score = useGameStore((s) => s.score);
  const driving = !!useGameStore((s) => s.activeVehicle);
  const nearVehicle = useGameStore((s) => s.nearVehicle);
  const aiming = useGameStore((s) => s.cameraMode) === "aim";

  const meta = WEAPON_META[weapon];

  // Frame-polled telemetry (NoS / speed) without re-rendering React tree.
  const nosBarRef = useRef();
  const speedRef = useRef();
  const hitMarkerRef = useRef();
  const lastHitFlash = useRef(0);
  useEffect(() => {
    let raf;
    const tick = () => {
      if (nosBarRef.current) {
        nosBarRef.current.style.width = `${Math.round(worldState.nosCharge * 100)}%`;
      }
      if (speedRef.current) {
        speedRef.current.textContent = `${Math.round(worldState.speedKmh)}`;
      }
      // Hit marker: flash a red "X" on the crosshair whenever registerHit()
      // bumps hitFlash (i.e. a shot connected with a player/NPC). Fades over
      // ~250ms so rapid hits keep it lit. This is the visual confirmation the
      // shooter needs to KNOW their bullets are landing.
      if (hitMarkerRef.current) {
        const hf = useGameStore.getState().hitFlash;
        if (hf !== lastHitFlash.current) {
          lastHitFlash.current = hf;
          hitMarkerRef.current.style.transition = "none";
          hitMarkerRef.current.style.opacity = "1";
          // force reflow then fade
          void hitMarkerRef.current.offsetWidth;
          hitMarkerRef.current.style.transition = "opacity 0.25s ease-out";
          hitMarkerRef.current.style.opacity = "0";
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }}>
      {/* ---------- Crosshair ---------- */}
      {!driving && (
        <div
          className="absolute left-1/2 top-1/2"
          style={{ transform: "translate(-50%,-50%)" }}
        >
          <div
            className="relative"
            style={{ width: aiming ? 26 : 18, height: aiming ? 26 : 18 }}
          >
            <span
              className="absolute bg-pink-300"
              style={{ left: "50%", top: 0, width: 2, height: "40%", transform: "translateX(-50%)", boxShadow: "0 0 6px #ff5ac8" }}
            />
            <span
              className="absolute bg-pink-300"
              style={{ left: "50%", bottom: 0, width: 2, height: "40%", transform: "translateX(-50%)", boxShadow: "0 0 6px #ff5ac8" }}
            />
            <span
              className="absolute bg-pink-300"
              style={{ top: "50%", left: 0, height: 2, width: "40%", transform: "translateY(-50%)", boxShadow: "0 0 6px #ff5ac8" }}
            />
            <span
              className="absolute bg-pink-300"
              style={{ top: "50%", right: 0, height: 2, width: "40%", transform: "translateY(-50%)", boxShadow: "0 0 6px #ff5ac8" }}
            />
          </div>
          {/* Hit marker: a red X that flashes when a shot connects with a
              player or NPC. Driven by the hitFlash store counter in the rAF
              loop above. The opacity starts at 1 and fades to 0. */}
          <div
            ref={hitMarkerRef}
            className="absolute"
            style={{
              left: "50%",
              top: "50%",
              width: 30,
              height: 30,
              transform: "translate(-50%,-50%)",
              opacity: 0,
              pointerEvents: "none",
            }}
          >
            <span
              className="absolute"
              style={{
                left: "50%", top: "50%", width: 22, height: 3,
                background: "#ff2a3a",
                transform: "translate(-50%,-50%) rotate(45deg)",
                boxShadow: "0 0 8px #ff2a3a",
              }}
            />
            <span
              className="absolute"
              style={{
                left: "50%", top: "50%", width: 22, height: 3,
                background: "#ff2a3a",
                transform: "translate(-50%,-50%) rotate(-45deg)",
                boxShadow: "0 0 8px #ff2a3a",
              }}
            />
          </div>
        </div>
      )}

      {/* ---------- Top-left: score + wanted ----------
          On mobile the minimap owns the top-left corner, so the score panel is
          moved to top-center to avoid overlapping it (and the joystick). */}
      <div
        className="absolute hud-panel rounded-xl px-4 py-2"
        style={isMobile ? { left: "50%", top: 12, transform: "translateX(-50%)" } : { left: 16, top: 16 }}
      >
        <div className="text-pink-200 text-xs tracking-widest">SCORE</div>
        <div className="text-white text-xl font-extrabold neon-text">
          {score.toLocaleString()}
        </div>
        <div className="flex gap-1 mt-1 justify-center">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              style={{
                color: i < Math.round(wanted) ? "#ffd24d" : "#4a3a5a",
                textShadow: i < Math.round(wanted) ? "0 0 8px #ffd24d" : "none",
                fontSize: 14,
              }}
            >
              ★
            </span>
          ))}
        </div>
      </div>

      {/* ---------- Top-right: weapon + ammo ---------- */}
      <div className="absolute right-4 top-4 hud-panel rounded-xl px-4 py-2 flex items-center gap-3">
        <span style={{ fontSize: 26 }}>{meta.icon}</span>
        <div className="text-right">
          <div className="text-pink-200 text-[10px] tracking-widest">
            {meta.label.toUpperCase()}
          </div>
          <div className="text-white font-extrabold text-lg leading-none">
            {ammo.clip}
            <span className="text-purple-300 text-sm"> / {ammo.reserve}</span>
          </div>
        </div>
      </div>

      {/* ---------- Health bar (bottom center-left) ---------- */}
      <div className="absolute" style={{ left: 175, bottom: 28 }}>
        <div className="text-pink-200 text-[10px] tracking-widest mb-1">HEALTH</div>
        <div
          className="rounded-full overflow-hidden"
          style={{ width: 180, height: 12, background: "rgba(40,20,55,0.7)", border: "1px solid rgba(255,120,220,0.4)" }}
        >
          <div
            style={{
              width: `${(health / maxHealth) * 100}%`,
              height: "100%",
              background: "linear-gradient(90deg,#ff5ac8,#ff8a3c)",
              transition: "width 0.2s",
            }}
          />
        </div>
      </div>

      {/* ---------- Driving: NoS bar + speedo ---------- */}
      {driving && (
        <>
          <div className="absolute" style={{ left: 175, bottom: 60 }}>
            <div className="text-blue-200 text-[10px] tracking-widest mb-1">NITRO</div>
            <div
              className="rounded-full overflow-hidden"
              style={{ width: 180, height: 10, background: "rgba(20,30,55,0.7)", border: "1px solid rgba(80,180,255,0.5)" }}
            >
              <div
                ref={nosBarRef}
                style={{ width: "100%", height: "100%", background: "linear-gradient(90deg,#4ab8ff,#ff4a4a)" }}
              />
            </div>
          </div>
          <div
            className="absolute text-center"
            style={{ left: "50%", bottom: 14, transform: "translateX(-50%)" }}
          >
            <span
              ref={speedRef}
              className="text-white font-extrabold neon-text"
              style={{ fontSize: 40, lineHeight: 1 }}
            >
              0
            </span>
            <span className="text-pink-200 text-sm ml-1">KM/H</span>
          </div>
        </>
      )}

      {/* ---------- Helicopter flight control hint (desktop, non-mobile) ---------- */}
      {driving && !isMobile && worldState.vehicleType === "heli" && (
        <div
          className="absolute hud-panel rounded-lg px-3 py-2 text-[11px] leading-relaxed pointer-events-none"
          style={{ right: 16, bottom: 96, maxWidth: 230 }}
        >
          <div className="text-cyan-200 font-extrabold tracking-widest mb-1">✈ HELI CONTROLS</div>
          <div className="text-white/85">
            <b className="text-green-300">Space / X</b> Ascend &nbsp;·&nbsp; <b className="text-yellow-300">Ctrl / Z</b> Descend
          </div>
          <div className="text-white/85">
            <b className="text-white">WASD</b> Pitch/Strafe &nbsp;·&nbsp; <b className="text-blue-300">Shift</b> Boost
          </div>
          <div className="text-white/65">Mouse: yaw &nbsp;·&nbsp; Wheel: up/down</div>
        </div>
      )}

      {/* ---------- Interaction prompt ---------- */}
      {nearVehicle && !driving && (
        <div
          className="absolute left-1/2 hud-panel rounded-lg px-4 py-2 text-center"
          style={{ bottom: "30%", transform: "translateX(-50%)" }}
        >
          <span className="text-white font-bold">
            <span className="text-pink-300">[F]</span> Hijack Vehicle
          </span>
        </div>
      )}

      <MiniMap />
      <WeaponWheel />
      {isMobile && <MobileControls />}
    </div>
  );
}
