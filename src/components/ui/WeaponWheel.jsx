import { useEffect, useState } from "react";
import { useGameStore, WEAPONS, WEAPON_META } from "../../store/useGameStore";
import { playSfx } from "../../lib/audio";

/**
 * Circular weapon selection overlay. Visible while wheelOpen (slows time).
 * Sized responsively so it NEVER overflows the viewport on small landscape
 * phone screens (the radius scales with the smaller screen dimension).
 */
export default function WeaponWheel() {
  const open = useGameStore((s) => s.wheelOpen);
  const current = useGameStore((s) => s.currentWeapon);
  const setWeapon = useGameStore((s) => s.setWeapon);
  const closeWheel = useGameStore((s) => s.closeWheel);
  const ammo = useGameStore((s) => s.ammo);

  const [vh, setVh] = useState(
    typeof window !== "undefined" ? window.innerHeight : 600
  );
  useEffect(() => {
    const onR = () => setVh(window.innerHeight);
    window.addEventListener("resize", onR);
    window.addEventListener("orientationchange", onR);
    return () => {
      window.removeEventListener("resize", onR);
      window.removeEventListener("orientationchange", onR);
    };
  }, []);

  if (!open) return null;

  // Slot + radius scale with available height so everything stays on-screen.
  const slot = Math.max(64, Math.min(96, Math.round(vh * 0.18)));
  const R = Math.max(80, Math.min(130, Math.round(vh * 0.26)));
  const pad = slot / 2 + 14;
  const size = R * 2 + slot + 28;

  const select = (w) => {
    setWeapon(w);
    playSfx("switch");
    closeWheel();
  };

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-auto"
      style={{ zIndex: 80, background: "rgba(5,2,12,0.55)" }}
      onClick={closeWheel}
    >
      <div
        className="relative"
        style={{ width: size, height: size }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="absolute rounded-full border border-pink-300/30"
          style={{
            left: pad - 14,
            top: pad - 14,
            width: R * 2 + 28,
            height: R * 2 + 28,
            background: "rgba(20,10,35,0.55)",
            backdropFilter: "blur(6px)",
          }}
        />
        <div
          className="absolute inset-0 flex items-center justify-center text-pink-200 text-xs neon-text pointer-events-none"
        >
          SELECT
        </div>
        {WEAPONS.map((w, i) => {
          const angle = (i / WEAPONS.length) * Math.PI * 2 - Math.PI / 2;
          const cx = size / 2 + Math.cos(angle) * R - slot / 2;
          const cy = size / 2 + Math.sin(angle) * R - slot / 2;
          const meta = WEAPON_META[w];
          const sel = current === w;
          return (
            <button
              key={w}
              className="absolute touch-none rounded-2xl flex flex-col items-center justify-center active:scale-90 transition-all"
              style={{
                left: cx,
                top: cy,
                width: slot,
                height: slot,
                background: sel
                  ? `radial-gradient(circle, ${meta.color}cc, ${meta.color}44)`
                  : "rgba(30,16,48,0.9)",
                border: `2px solid ${sel ? meta.color : "#6a4a8a"}`,
                boxShadow: sel ? `0 0 26px ${meta.color}` : "none",
                color: "#fff",
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                select(w);
              }}
            >
              <span style={{ fontSize: slot * 0.34 }}>{meta.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700 }}>{meta.label}</span>
              <span style={{ fontSize: 10, opacity: 0.85 }}>
                {ammo[w].clip}/{ammo[w].reserve}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
