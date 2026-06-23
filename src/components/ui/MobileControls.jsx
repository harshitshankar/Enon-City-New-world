import { useRef, useCallback } from "react";
import Joystick from "./Joystick";
import TouchButton from "./TouchButton";
import { inputState, worldState, useGameStore } from "../../store/useGameStore";

/**
 * Mobile control layout:
 *  - Left: dedicated movement joystick (Joystick.jsx)
 *  - Right: a FULL-HEIGHT look layer (low z) that captures any swipe in the
 *    right half of the screen, including over HUD panels. Action buttons sit
 *    ABOVE it (higher z) and stopPropagation so they always work.
 *
 * The look layer tracks its OWN touch by identifier, so it never gets "stuck"
 * and works anywhere on the right side, including the top-right corner.
 */
export default function MobileControls() {
  const driving = !!useGameStore((s) => s.activeVehicle);
  const aiming = useGameStore((s) => s.cameraMode) === "aim";
  const wheelOpen = useGameStore((s) => s.wheelOpen);
  // true only when the player is actually flying a helicopter (vs a car)
  const flying = driving && worldState.vehicleType === "heli";

  const lookId = useRef(null);
  const last = useRef({ x: 0, y: 0 });

  const lookStart = useCallback((e) => {
    if (lookId.current !== null) return;
    const t = e.changedTouches[0];
    lookId.current = t.identifier;
    last.current = { x: t.clientX, y: t.clientY };
  }, []);

  const lookMove = useCallback((e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === lookId.current) {
        inputState.look.x += t.clientX - last.current.x;
        inputState.look.y += t.clientY - last.current.y;
        last.current = { x: t.clientX, y: t.clientY };
      }
    }
  }, []);

  const lookEnd = useCallback((e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === lookId.current) {
        lookId.current = null;
      }
    }
  }, []);

  const toggleAim = () => {
    const st = useGameStore.getState();
    if (st.cameraMode === "aim") {
      inputState.aim = false;
      st.setCameraMode("foot");
    } else {
      inputState.aim = true;
      st.setCameraMode("aim");
    }
  };

  const toggleWheel = () => {
    const st = useGameStore.getState();
    if (st.wheelOpen) st.closeWheel();
    else st.openWheel();
  };

  return (
    <>
      {/* ---- Full-height RIGHT look layer (low z, behind buttons) ---- */}
      <div
        className="absolute top-0 right-0 bottom-0 touch-none"
        style={{ width: "55%", zIndex: 38, pointerEvents: "auto" }}
        onTouchStart={lookStart}
        onTouchMove={lookMove}
        onTouchEnd={lookEnd}
        onTouchCancel={lookEnd}
      />

      {/* ---- Left joystick (its own touch zone) ---- */}
      <Joystick />

      {/* ---- Action buttons (high z, above look layer) ---- */}
      <div
        className="absolute"
        style={{
          right: 16,
          bottom: 16,
          width: 250,
          height: 180,
          zIndex: 50,
          pointerEvents: "none",
        }}
      >
        {driving ? (
          <>
            {/* Primary (bottom-right): GAS for cars, ASCEND for helicopters */}
            <div style={{ position: "absolute", right: 14, bottom: 14, pointerEvents: "auto" }}>
              {flying ? (
                <TouchButton
                  label="▲"
                  sub="UP"
                  color="#2ecc71"
                  size={88}
                  onDown={() => (inputState.up = true)}
                  onUp={() => (inputState.up = false)}
                />
              ) : (
                <TouchButton
                  label="GAS"
                  color="#2ecc71"
                  size={88}
                  onDown={() => (inputState.gas = 1)}
                  onUp={() => (inputState.gas = 0)}
                />
              )}
            </div>
            {/* Secondary (left of primary): BRAKE for cars, DESCEND for helis */}
            <div style={{ position: "absolute", right: 112, bottom: 14, pointerEvents: "auto" }}>
              {flying ? (
                <TouchButton
                  label="▼"
                  sub="DOWN"
                  color="#ffd24d"
                  size={58}
                  onDown={() => (inputState.down = true)}
                  onUp={() => (inputState.down = false)}
                />
              ) : (
                <TouchButton
                  label="✋"
                  sub="BRAKE"
                  color="#ffd24d"
                  size={58}
                  onDown={() => {
                    inputState.brake = 1;
                    inputState.handbrake = true;
                  }}
                  onUp={() => {
                    inputState.brake = 0;
                    inputState.handbrake = false;
                  }}
                />
              )}
            </div>
            {/* Tertiary (above secondary): BOOST for helis, NOS for cars */}
            <div style={{ position: "absolute", right: 112, bottom: 80, pointerEvents: "auto" }}>
              <TouchButton
                label="🔥"
                sub={flying ? "BOOST" : "NOS"}
                color="#3ba8ff"
                size={58}
                onDown={() => {
                  inputState.nos = true;
                  inputState.boost = true;
                }}
                onUp={() => {
                  inputState.nos = false;
                  inputState.boost = false;
                }}
              />
            </div>
            {/* F / EXIT (far left of cluster, low) */}
            <div style={{ position: "absolute", right: 182, bottom: 14, pointerEvents: "auto" }}>
              <TouchButton
                label="F"
                sub="EXIT"
                color="#ff5ac8"
                size={54}
                onTap={() => (inputState.interact = true)}
              />
            </div>
          </>
        ) : (
          <>
            {/* FIRE (primary, big, bottom-right) */}
            <div style={{ position: "absolute", right: 14, bottom: 14, pointerEvents: "auto" }}>
              <TouchButton
                label="🔫"
                sub="FIRE"
                color="#ff4d4d"
                size={88}
                onDown={() => (inputState.shoot = true)}
                onUp={() => (inputState.shoot = false)}
              />
            </div>
            {/* AIM (above fire) */}
            <div style={{ position: "absolute", right: 18, bottom: 110, pointerEvents: "auto" }}>
              <TouchButton
                label="🎯"
                sub={aiming ? "AIMING" : "AIM"}
                color={aiming ? "#ff7a3c" : "#ffa64d"}
                size={58}
                onTap={toggleAim}
              />
            </div>
            {/* JUMP (left of fire) */}
            <div style={{ position: "absolute", right: 112, bottom: 14, pointerEvents: "auto" }}>
              <TouchButton
                label="⤴"
                sub="JUMP"
                color="#9b59ff"
                size={58}
                onTap={() => (inputState.jump = true)}
              />
            </div>
            {/* WEP (above jump) */}
            <div style={{ position: "absolute", right: 112, bottom: 80, pointerEvents: "auto" }}>
              <TouchButton
                label="◎"
                sub="WEP"
                color={wheelOpen ? "#aef0ff" : "#7be0ff"}
                size={54}
                onTap={toggleWheel}
              />
            </div>
            {/* F / ENTER (far left of cluster, low) */}
            <div style={{ position: "absolute", right: 182, bottom: 14, pointerEvents: "auto" }}>
              <TouchButton
                label="F"
                sub="ENTER"
                color="#ff5ac8"
                size={54}
                onTap={() => (inputState.interact = true)}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}
