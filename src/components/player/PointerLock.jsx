import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../../store/useGameStore";

/**
 * PointerLock (desktop only)
 *
 * Gives the game proper FPS-style mouse control: while locked, the OS cursor
 * is hidden and centered, and every mouse movement is delivered to the camera
 * (via movementX/Y in useKeyboard). The in-game crosshair takes the place of
 * the cursor, so aiming + camera-look feel exactly like a native shooter.
 *
 * Behaviour:
 *  - Locked automatically when the game starts (the Start button also requests
 *    it via a user gesture).
 *  - If the user presses Esc, the browser releases the lock; we show a small
 *    "click to resume" hint and re-lock on the next canvas click.
 *  - The click that (re-)acquires the lock is swallowed so it never fires a
 *    stray shot. useKeyboard ignores the very first click after a lock change.
 */
export default function PointerLock() {
  const isMobile = useGameStore((s) => s.isMobile);
  const started = useGameStore((s) => s.started);
  const [locked, setLocked] = useState(false);
  const swallowRef = useRef(false);
  const wantLock = useRef(false);

  useEffect(() => {
    if (isMobile || !started) return;

    const canvas = document.querySelector("canvas");
    if (!canvas) return;

    const onChange = () => {
      const isLocked = document.pointerLockElement === canvas;
      setLocked(isLocked);
      // swallow the synthetic mousedown the browser fires alongside lock change
      swallowRef.current = true;
      setTimeout(() => (swallowRef.current = false), 120);
      if (!isLocked && wantLock.current) {
        // user pressed Esc; we must NOT auto re-lock (browser blocks it without
        // a fresh gesture). They'll click to resume.
      }
    };

    const onClick = (e) => {
      if (swallowRef.current) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (document.pointerLockElement !== canvas) {
        wantLock.current = true;
        canvas.requestPointerLock?.();
        // swallow this click so it doesn't also fire a shot
        swallowRef.current = true;
        setTimeout(() => (swallowRef.current = false), 120);
      }
    };

    // Expose swallow flag to the keyboard hook via a global so the first
    // mousedown after lock is ignored.
    window.__zcodeSwallowClick = () => {
      if (swallowRef.current) {
        swallowRef.current = false;
        return true;
      }
      return false;
    };

    document.addEventListener("pointerlockchange", onChange);
    canvas.addEventListener("click", onClick);

    // Request initial lock shortly after start (after the user gesture that
    // pressed ENTER). Wrapped in try/catch since it can throw if not allowed.
    wantLock.current = true;
    const t = setTimeout(() => {
      try {
        canvas.requestPointerLock?.();
      } catch (_) {
        /* user must click */
      }
    }, 250);

    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      canvas.removeEventListener("click", onClick);
      clearTimeout(t);
      delete window.__zcodeSwallowClick;
    };
  }, [isMobile, started]);

  // Don't render anything on mobile.
  if (isMobile || !started) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ zIndex: 60, opacity: locked ? 0 : 1, transition: "opacity 0.3s" }}
    >
      {!locked && (
        <div
          className="hud-panel rounded-xl px-6 py-4 text-center pointer-events-auto cursor-pointer"
          onClick={() => {
            const canvas = document.querySelector("canvas");
            wantLock.current = true;
            swallowRef.current = true;
            setTimeout(() => (swallowRef.current = false), 120);
            canvas?.requestPointerLock?.();
          }}
        >
          <div className="text-white font-extrabold text-lg neon-text">
            🖱️ Click to capture mouse
          </div>
          <div className="text-purple-200/80 text-xs mt-1">
            Mouse controls aim &amp; camera · press <b className="text-pink-300">Esc</b> to free the cursor
          </div>
        </div>
      )}
    </div>
  );
}
