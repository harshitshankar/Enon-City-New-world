import { useMemo } from "react";
import Car from "./Car";
import Helicopter from "./Helicopter";
import { HALF, BLOCK, GRID } from "../world/World";
import { HELIPADS } from "../world/Plaza";

/**
 * Spawns parked/hijackable cars on the road grid plus a few AI traffic cars
 * that loop along waypoint tracks, and a couple of helicopters at helipads.
 */
export default function VehicleManager() {
  const cars = useMemo(() => {
    const arr = [];
    const colors = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#e67e22", "#16a085"];

    // Parked cars near the player spawn + scattered.
    const parked = [
      [9, 1.2, 6],
      [-12, 1.2, 4],
      [4, 1.2, -18],
      [-20, 1.2, -8],
      [22, 1.2, 14],
    ];
    parked.forEach((p, i) =>
      arr.push({
        id: `car-park-${i}`,
        position: p,
        color: colors[i % colors.length],
        aiPath: null,
      })
    );

    // AI traffic loops around the outer ring road.
    const r = HALF - 2;
    const ring = [
      [r, r],
      [r, -r],
      [-r, -r],
      [-r, r],
    ];
    for (let i = 0; i < 4; i++) {
      const start = ring[i];
      arr.push({
        id: `car-ai-${i}`,
        position: [start[0], 1.2, start[1]],
        color: colors[(i + 2) % colors.length],
        aiPath: ring,
      });
    }
    return arr;
  }, []);

  // Helicopters: one on a downtown rooftop (high up) + one spread across the
  // dedicated helipad plaza (see Plaza.jsx) so several players can grab a heli
  // at once. We use 5 of the 6 plaza pads, leaving one open as a landing spot.
  const helis = useMemo(() => {
    const arr = [{ id: "heli-roof", position: [6, 24, -6] }];
    HELIPADS.slice(0, 5).forEach((p, i) => {
      arr.push({ id: `heli-pad-${i}`, position: [p.x, 6, p.z] });
    });
    return arr;
  }, []);

  return (
    <group>
      {cars.map((c) => (
        <Car key={c.id} {...c} />
      ))}
      {helis.map((h) => (
        <Helicopter key={h.id} id={h.id} position={h.position} />
      ))}
    </group>
  );
}
