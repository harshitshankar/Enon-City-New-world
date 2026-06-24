import { useRef, useEffect } from "react";
import { worldState, useGameStore } from "../../store/useGameStore";
import { HALF, BLOCK, GRID, ROAD_W } from "../world/World";
import { vehicleRegistry } from "../../lib/registry";

/**
 * Circular minimap (bottom-left). Draws the road grid relative to the player,
 * the player arrow, vehicles (incl. helicopters), and hostile/ped/peer blips.
 *
 * Rotation convention:
 *   The game's heading is h = atan2(x, z) where forward-world = (sin h, cos h).
 *   We map world deltas (dx, dz) to minimap screen coords so the player's
 *   forward points UP (canvas -y) and the player's right points RIGHT (canvas
 *   +x). Solving that linear map gives:
 *       sx = -cos h * dx + sin h * dz
 *       sy = -sin h * dx - cos h * dz
 *   (The old code used ctx.rotate(-rot) on raw world->screen, which put forward
 *   pointing DOWN/sideways — so the player arrow and peer chevrons were off.)
 *
 * Rendered to a 2D canvas on a rAF loop; never causes React re-renders.
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
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      // world delta -> minimap screen (forward up, right = +x)
      const toScreen = (wx, wz) => {
        const dx = wx - px;
        const dz = wz - pz;
        return [-cr * dx + sr * dz, -sr * dx - cr * dz];
      };

      ctx.clearRect(0, 0, SIZE, SIZE);

      // clip to circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.clip();

      // background
      ctx.fillStyle = "#120a1e";
      ctx.fillRect(0, 0, SIZE, SIZE);

      // Translate to the radar centre. toScreen returns offsets from centre
      // already, so we just add cx/cy when drawing.
      const R = SIZE / 2 - 2;

      // road grid lines
      ctx.strokeStyle = "rgba(255,120,220,0.25)";
      ctx.lineWidth = ROAD_W * SCALE * 0.5;
      for (let i = 0; i <= GRID; i++) {
        const c = -HALF + i * BLOCK;
        // horizontal road (world z = c)
        {
          const [x1, y1] = toScreen(-HALF, c);
          const [x2, y2] = toScreen(HALF, c);
          ctx.beginPath();
          ctx.moveTo(cx + x1, cy + y1);
          ctx.lineTo(cx + x2, cy + y2);
          ctx.stroke();
        }
        // vertical road (world x = c)
        {
          const [x1, y1] = toScreen(c, -HALF);
          const [x2, y2] = toScreen(c, HALF);
          ctx.beginPath();
          ctx.moveTo(cx + x1, cy + y1);
          ctx.lineTo(cx + x2, cy + y2);
          ctx.stroke();
        }
      }

      // ---- VEHICLE blips (cars + helicopters) ----
      // Show every live vehicle so you can spot a heli to grab. Helis get a
      // distinct rotor glyph; the car you're driving is skipped (that's "you").
      const drivingId = useGameStore.getState().activeVehicle;
      ctx.lineWidth = 1.4;
      for (const v of vehicleRegistry.values()) {
        if (v.destroyed && v.destroyed()) continue;
        if (v.id === drivingId) continue; // don't draw our own ride
        const vp = v.getPos(_vTmp);
        // helicopters are only useful if airborne or on a pad; still show all.
        const isHeli = typeof v.id === "string" && v.id.startsWith("heli");
        const [bx, by] = toScreen(vp.x, vp.z);
        if (Math.hypot(bx, by) > R) continue;
        if (isHeli) {
          // small cyan "H" rotor glyph
          ctx.strokeStyle = "#7be0ff";
          ctx.fillStyle = "#7be0ff";
          ctx.beginPath();
          ctx.arc(cx + bx, cy + by, 3.4, 0, Math.PI * 2);
          ctx.stroke();
          // rotor cross
          ctx.beginPath();
          ctx.moveTo(cx + bx - 5, cy + by);
          ctx.lineTo(cx + bx + 5, cy + by);
          ctx.moveTo(cx + bx, cy + by - 5);
          ctx.lineTo(cx + bx, cy + by + 5);
          ctx.stroke();
        } else {
          // car: small amber triangle
          ctx.fillStyle = "#ffcc55";
          ctx.beginPath();
          ctx.moveTo(cx + bx, cy + by - 3.2);
          ctx.lineTo(cx + bx - 2.8, cy + by + 2.6);
          ctx.lineTo(cx + bx + 2.8, cy + by + 2.6);
          ctx.closePath();
          ctx.fill();
        }
      }

      // ---- other blips (peds / hostiles / pickups / peers) ----
      for (const b of worldState.blips) {
        const [bx, by] = toScreen(b.x, b.z);
        if (Math.hypot(bx, by) > R) continue;
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
          ctx.fillRect(cx + bx - r, cy + by - r, r * 2, r * 2);
        } else if (b.type === "peer") {
          // ring so players are clearly distinct from peds/hostiles
          ctx.beginPath();
          ctx.arc(cx + bx, cy + by, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1;
          ctx.stroke();
          // direction chevron: peer.rot uses atan2(x,z) like our heading, so the
          // SAME toScreen mapping applies to its forward vector. We draw the
          // chevron from the ring outward along that forward.
          if (typeof b.rot === "number") {
            const pcr = Math.cos(b.rot);
            const psr = Math.sin(b.rot);
            // peer forward world = (sin rot, cos rot); pass it through toScreen
            // to get its facing direction on the (player-relative) minimap, then
            // draw a chevron from the ring outward along it.
            const [fdx, fdy] = toScreen(b.x + psr, b.z + pcr);
            const dirx = fdx - bx;
            const diry = fdy - by;
            const dl = Math.hypot(dirx, diry) || 1;
            const nx = dirx / dl;
            const ny = diry / dl;
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(cx + bx + nx * (r + 1), cy + by + ny * (r + 1));
            ctx.lineTo(cx + bx + nx * (r + 5), cy + by + ny * (r + 5));
            ctx.stroke();
          }
        } else {
          ctx.beginPath();
          ctx.arc(cx + bx, cy + by, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();

      // player arrow (always centre, pointing up = our facing)
      ctx.fillStyle = "#ff5ac8";
      ctx.beginPath();
      ctx.moveTo(cx, cy - 6);
      ctx.lineTo(cx - 4, cy + 5);
      ctx.lineTo(cx + 4, cy + 5);
      ctx.closePath();
      ctx.fill();

      // OWN the blip buffer: clear AFTER drawing so this batch is consumed.
      // MiniMap is the SOLE owner of the clear (see NPCManager) — if two systems
      // clear, the later one wipes the others' blips and peers/team vanish.
      worldState.blips.length = 0;

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

// scratch vector reused by the vehicle loop (no GC)
const _vTmp = { x: 0, y: 0, z: 0 };
