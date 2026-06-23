import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { AdaptiveDpr, Preload, Stars } from "@react-three/drei";
import * as THREE from "three";

import { useGameStore } from "../store/useGameStore";
import World from "./world/World";
import DayNightCycle from "./world/DayNightCycle";
import WantedSystem from "./world/WantedSystem";
import Pickups from "./world/Pickups";
import Player from "./player/Player";
import VehicleManager from "./vehicles/VehicleManager";
import PoliceManager from "./vehicles/PoliceManager";
import ProjectileSystem from "./combat/ProjectileSystem";
import ExplosionSystem from "./combat/ExplosionSystem";
import NPCManager from "./npc/NPCManager";
import CameraRig from "./player/CameraRig";
import RemotePlayers from "./player/RemotePlayers";

/**
 * GameCanvas — main R3F Canvas + Rapier <Physics>.
 * Lighting & sky are now driven dynamically by <DayNightCycle/>.
 */
export default function GameCanvas() {
  const isMobile = useGameStore((s) => s.isMobile);
  const paused = useGameStore((s) => s.paused);

  return (
    <Canvas
      shadows
      dpr={isMobile ? [0.6, 1.0] : [1, 1.6]}
      gl={{
        antialias: !isMobile,
        powerPreference: "high-performance",
        stencil: false,
        depth: true,
      }}
      camera={{ fov: 62, near: 0.3, far: 420, position: [0, 8, 14] }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        // Fog color is re-driven every frame by DayNightCycle (horizon color).
        scene.fog = new THREE.Fog("#bcd9ff", 90, 320);
      }}
    >
      <Stars radius={280} depth={50} count={isMobile ? 400 : 800} factor={5} fade speed={0.4} />

      <DayNightCycle />

      <Suspense fallback={null}>
        {/* Fixed timestep + capped substeps prevents physics "giant leaps" on
            frame hitches, which was the #1 cause of glitching through buildings
            at speed. interpolate keeps motion smooth between steps. */}
        <Physics
          gravity={[0, -24, 0]}
          timeStep={1 / 60}
          maxSubsteps={5}
          paused={paused}
          interpolate
        >
          <World />
          <WantedSystem />
          <Pickups />
          <NPCManager />
          <VehicleManager />
          <PoliceManager />
          <Player />
          <RemotePlayers />
          <ProjectileSystem />
          <ExplosionSystem />
          <CameraRig />
        </Physics>
        <Preload all />
      </Suspense>

      <AdaptiveDpr pixelated />
    </Canvas>
  );
}
