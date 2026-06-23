import { useEffect } from "react";
import { useGameStore } from "../store/useGameStore";

/**
 * OrientationGuard
 * - Detects portrait orientation on mobile/tablet devices.
 * - Renders a full-screen black overlay prompting the user to rotate to
 *   landscape. Automatically hides when rotated to landscape or on desktop.
 * - Also keeps the store's `isMobile` flag in sync with viewport heuristics.
 */
export default function OrientationGuard() {
  const isMobile = useGameStore((s) => s.isMobile);
  const landscapeOk = useGameStore((s) => s.landscapeOk);
  const setLandscape = useGameStore((s) => s.setLandscape);
  const setMobile = useGameStore((s) => s.setMobile);

  useEffect(() => {
    const evaluate = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Heuristic mobile detection: coarse pointer OR UA OR small touch screen.
      const coarse =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(pointer: coarse)").matches;
      const ua = /android|iphone|ipad|ipod|mobile|tablet/i.test(
        navigator.userAgent
      );
      const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const mobile = (coarse && touch) || ua;
      setMobile(mobile);

      if (!mobile) {
        setLandscape(true);
        return;
      }
      // Portrait => block.
      setLandscape(w >= h);
    };

    evaluate();
    window.addEventListener("resize", evaluate);
    window.addEventListener("orientationchange", evaluate);
    return () => {
      window.removeEventListener("resize", evaluate);
      window.removeEventListener("orientationchange", evaluate);
    };
  }, [setLandscape, setMobile]);

  if (!isMobile || landscapeOk) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center text-center px-8"
      style={{
        background:
          "radial-gradient(ellipse at center, #1a0b2e 0%, #07030f 100%)",
      }}
    >
      <div className="rotate-hint mb-8 text-6xl select-none">📱</div>
      <h1 className="neon-text text-2xl font-extrabold tracking-widest text-pink-300 mb-3">
        ROTATE YOUR DEVICE
      </h1>
      <p className="text-purple-200/80 text-base max-w-xs leading-relaxed">
        Please rotate your device to{" "}
        <span className="text-pink-300 font-bold">Landscape Mode</span> to play
        NEON CITY.
      </p>
      <div className="mt-10 flex gap-2 opacity-70">
        <span className="w-2 h-2 rounded-full bg-pink-400 pulse-glow" />
        <span
          className="w-2 h-2 rounded-full bg-purple-400 pulse-glow"
          style={{ animationDelay: "0.3s" }}
        />
        <span
          className="w-2 h-2 rounded-full bg-indigo-400 pulse-glow"
          style={{ animationDelay: "0.6s" }}
        />
      </div>
    </div>
  );
}
