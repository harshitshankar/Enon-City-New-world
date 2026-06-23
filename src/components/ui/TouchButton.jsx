import { useCallback, useRef } from "react";

/**
 * Reusable touch button.
 * - Momentary (hold): pass onDown / onUp.
 * - Single tap (toggle/trigger): pass onTap (fires once on press).
 * touch-action:none blocks browser zoom/scroll.
 */
export default function TouchButton({
  label,
  sub,
  color = "#ff5ac8",
  size = 64,
  onDown,
  onUp,
  onTap,
  style,
}) {
  const active = useRef(false);

  const down = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      active.current = true;
      onTap?.();
      onDown?.();
    },
    [onDown, onTap]
  );
  const up = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (active.current) {
        active.current = false;
        onUp?.();
      }
    },
    [onUp]
  );

  return (
    <button
      className="touch-none rounded-full flex flex-col items-center justify-center font-bold select-none active:scale-90 transition-transform"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 30%, ${color}dd, ${color}66)`,
        border: `2px solid ${color}`,
        color: "#fff",
        boxShadow: `0 0 16px ${color}99`,
        fontSize: size > 64 ? 24 : 18,
        textShadow: "0 1px 2px rgba(0,0,0,0.6)",
        ...style,
      }}
      onTouchStart={down}
      onTouchEnd={up}
      onTouchCancel={up}
    >
      <span>{label}</span>
      {sub && <span style={{ fontSize: 9, opacity: 0.9, fontWeight: 700 }}>{sub}</span>}
    </button>
  );
}
