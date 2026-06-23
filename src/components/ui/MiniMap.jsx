import { useRef, useEffect } from "react";
import { worldState, useGameStore } from "../../store/useGameStore";
import { HALF, BLOCK, GRID, ROAD_W } from "../world/World";

/**
 * Circular minimap (bottom-left). Draws the road grid relative to the player,
 * the player arrow, and hostile/ped blips. Rendered to a 2D canvas on a rAF
 * loop so it never causes React re-renders.
 */
export default function MiniMap() {
  const canvasRef = useRef();
  const isMobile = useGameStore((s) => s.isMobile);
  const DIM = isMobile ? 108 : 150;

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const SIZE = 150;
    cv.width = SIZE;
    cv.height = SIZE;
    const SCALE = 1.6; // world units -> px
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    let raf;

    const draw = () => {
      const px = worldState.playerPos.x;
      const pz = worldState.playerPos.z;
      const rot = worldState.playerRot;

      ctx.clearRect(0, 0, SIZE, SIZE);

      // clip to circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.clip();

      // background
      ctx.fillStyle = "#120a1e";
      ctx.fillRect(0, 0, SIZE, SIZE);

      // rotate world so player heading points up
      ctx.translate(cx, cy);
      ctx.rotate(-rot);

      const toScreen = (wx, wz) => [(wx - px) * SCALE, (wz - pz) * SCALE];

      // road grid lines
      ctx.strokeStyle = "rgba(255,120,220,0.25)";
      ctx.lineWidth = ROAD_W * SCALE * 0.5;
      for (let i = 0; i <= GRID; i++) {
        const c = -HALF + i * BLOCK;
        // horizontal
        let [x1, y1] = toScreen(-HALF, c);
        let [x2, y2] = toScreen(HALF, c);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        // vertical
        [x1, y1] = toScreen(c, -HALF);
        [x2, y2] = toScreen(c, HALF);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // blips
      for (const b of worldState.blips) {
        const [bx, by] = toScreen(b.x, b.z);
        if (Math.hypot(bx, by) > SIZE / 2) continue;
        let col = "#7be0ff";
        let r = 2;
        if (b.type === "hostile") {
          col = "#ff4444";
          r = 3;
        } else if (b.type === "health") {
          col = "#ff3366";
          r = 3.5;
        } else if (b.type === "ammo") {
          col = "#ffcc33";
          r = 3.5;
        } else if (b.type === "peer") {
          // other human players — use their colour, slightly bigger, with a ring
          col = b.color || "#7CFF6B";
          r = 3.5;
        }
        ctx.fillStyle = col;
        if (b.type === "health" || b.type === "ammo") {
          // draw as a small square so pickups stand out
          ctx.fillRect(bx - r, by - r, r * 2, r * 2);
        } else if (b.type === "peer") {
          // ring so players are clearly distinct from peds/hostiles
          ctx.beginPath();
          ctx.arc(bx, by, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(bx, by, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();

      // player arrow (always center, pointing up)
      ctx.fillStyle = "#ff5ac8";
      ctx.beginPath();
      ctx.moveTo(cx, cy - 6);
      ctx.lineTo(cx - 4, cy + 5);
      ctx.lineTo(cx + 4, cy + 5);
      ctx.closePath();
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="absolute"
      style={
        isMobile
          ? { left: 12, top: 12, zIndex: 35, width: DIM, height: DIM }
          : { left: 16, bottom: 16, zIndex: 35, width: DIM, height: DIM }
      }
    >
      <canvas
        ref={canvasRef}
        className="rounded-full"
        style={{
          width: DIM,
          height: DIM,
          border: "3px solid rgba(255,120,220,0.6)",
          boxShadow: "0 0 18px rgba(255,90,200,0.4)",
        }}
      />
    </div>
  );
}
