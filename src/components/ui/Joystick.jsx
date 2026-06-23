import { useRef, useState, useCallback } from "react";
import { inputState, useGameStore } from "../../store/useGameStore";

/**
 * Virtual joystick (left side). Always-visible base anchored bottom-left so it
 * never gets cut off, plus a draggable knob. Writes normalized x/z into
 * inputState.move and sets gas/brake for driving.
 */
export default function Joystick() {
  const baseRef = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const touchId = useRef(null);
  const center = useRef({ x: 0, y: 0 });
  const RADIUS = 55;

  const computeCenter = () => {
    const el = baseRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    center.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const apply = (clientX, clientY) => {
    let dx = clientX - center.current.x;
    let dy = clientY - center.current.y;
    const dist = Math.hypot(dx, dy);
    if (dist > RADIUS) {
      dx = (dx / dist) * RADIUS;
      dy = (dy / dist) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    const nx = dx / RADIUS;
    const nz = dy / RADIUS;
    inputState.move.x = nx;
    inputState.move.z = nz;
    inputState.moveActive = Math.hypot(nx, nz) > 0.12;
    // While driving, the joystick ONLY steers (move.x). Throttle is handled by
    // the dedicated GAS / BRAKE buttons so they don't fight each other.
    const driving = !!useGameStore.getState().activeVehicle;
    if (!driving) {
      inputState.gas = nz < -0.12 ? Math.min(1, -nz) : 0;
      inputState.brake = nz > 0.12 ? Math.min(1, nz) : 0;
    }
  };

  const start = useCallback((e) => {
    e.preventDefault();
    computeCenter();
    const t = e.changedTouches[0];
    touchId.current = t.identifier;
    apply(t.clientX, t.clientY);
  }, []);

  const move = useCallback((e) => {
    if (touchId.current === null) return;
    for (const ct of e.changedTouches) {
      if (ct.identifier === touchId.current) {
        apply(ct.clientX, ct.clientY);
      }
    }
  }, []);

  const end = useCallback((e) => {
    for (const ct of e.changedTouches) {
      if (ct.identifier === touchId.current) {
        touchId.current = null;
        setKnob({ x: 0, y: 0 });
        inputState.move.x = 0;
        inputState.move.z = 0;
        inputState.moveActive = false;
        const driving = !!useGameStore.getState().activeVehicle;
        if (!driving) {
          inputState.gas = 0;
          inputState.brake = 0;
        }
      }
    }
  }, []);

  return (
    <div
      ref={baseRef}
      className="absolute touch-none rounded-full pointer-events-auto"
      style={{
        left: 24,
        bottom: 22,
        width: RADIUS * 2,
        height: RADIUS * 2,
        zIndex: 46,
        background: "rgba(255,120,220,0.10)",
        border: "2px solid rgba(255,120,220,0.45)",
        boxShadow: "0 0 18px rgba(255,90,200,0.3)",
      }}
      onTouchStart={start}
      onTouchMove={move}
      onTouchEnd={end}
      onTouchCancel={end}
    >
      {/* directional hint cross */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ color: "rgba(255,180,235,0.35)", fontSize: 11, letterSpacing: 2 }}
      >
        MOVE
      </div>
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          left: "50%",
          top: "50%",
          width: 50,
          height: 50,
          transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
          background: "radial-gradient(circle at 35% 30%, #ff9ad5, #ff5ac8)",
          border: "1px solid rgba(255,255,255,0.7)",
          boxShadow: "0 0 16px rgba(255,90,200,0.7)",
        }}
      />
    </div>
  );
}
