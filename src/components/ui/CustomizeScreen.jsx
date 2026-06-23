import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGameStore } from "../../store/useGameStore";
import CharacterMesh from "../player/CharacterMesh";

/**
 * CustomizeScreen — pick your character's look with color swatches.
 * A live 3D preview (rotating CharacterMesh) updates instantly. The choice
 * persists to localStorage and syncs to other players over the network.
 *
 * Reached from the StartScreen ("🎨 CUSTOMIZE") and the Lobby name area.
 */
const SKIN_TONES = ["#f5d0b0", "#e8b98f", "#caa07a", "#a8744a", "#7a4a2a", "#3a2010"];
const HAIR_COLORS = ["#1a1a22", "#3a2410", "#6b4423", "#c0a060", "#ff5ac8", "#7be0ff"];
const SHIRT_COLORS = ["#f4f0e8", "#ff5ac8", "#3ba8ff", "#7CFF6B", "#ffd24d", "#9b59ff", "#ff8a3c", "#e8483b"];
const PANTS_COLORS = ["#2b2b3a", "#1a3050", "#3a2a1a", "#4a4a4a", "#5a3a5a", "#1a1a1a"];

export default function CustomizeScreen({ onClose }) {
  const appearance = useGameStore((s) => s.playerAppearance);
  const setAppearance = useGameStore((s) => s.setAppearance);

  return (
    <div
      className="absolute inset-0 flex flex-col items-center text-center px-6 overflow-y-auto"
      style={{
        zIndex: 115,
        background:
          "radial-gradient(ellipse at 50% 25%, #2a1850 0%, #160826 55%, #07030f 100%)",
        paddingTop: "max(24px, 5vh)",
        paddingBottom: "max(24px, 5vh)",
        justifyContent: "safe center",
      }}
    >
      <button
        onClick={onClose}
        className="absolute top-4 left-4 text-purple-200/70 hover:text-white text-sm"
      >
        ← Back
      </button>

      <h2
        className="font-black tracking-tight neon-text"
        style={{
          fontSize: "clamp(26px, 5vw, 44px)",
          background: "linear-gradient(180deg,#ffd6f5,#ff5ac8 60%,#9b59ff)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        DESIGN YOUR CHARACTER
      </h2>
      <p className="text-cyan-200/60 text-xs tracking-[0.3em] mt-1">
        YOUR LOOK SYNC'S TO OTHER PLAYERS
      </p>

      <div className="mt-6 flex flex-col md:flex-row items-center gap-6 w-full max-w-3xl">
        {/* ---- Live 3D preview ---- */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            width: 260,
            height: 300,
            background: "radial-gradient(circle at 50% 60%, #3a2050, #0a0510)",
            border: "1px solid rgba(255,120,220,0.3)",
            boxShadow: "0 0 30px rgba(255,90,200,0.25)",
            flexShrink: 0,
          }}
        >
          <Canvas camera={{ fov: 35, position: [0, 1.2, 4.2] }}>
            <ambientLight intensity={0.7} />
            <directionalLight position={[3, 6, 4]} intensity={1.4} castShadow />
            <directionalLight position={[-4, 3, -2]} intensity={0.5} color="#9b59ff" />
            <RotatingPreview appearance={appearance} />
          </Canvas>
        </div>

        {/* ---- Swatch pickers ---- */}
        <div className="flex-1 w-full text-left">
          <SwatchRow
            label="SKIN"
            colors={SKIN_TONES}
            value={appearance.skin}
            onPick={(c) => setAppearance({ skin: c })}
          />
          <SwatchRow
            label="HAIR"
            colors={HAIR_COLORS}
            value={appearance.hair}
            onPick={(c) => setAppearance({ hair: c })}
          />
          <SwatchRow
            label="SHIRT"
            colors={SHIRT_COLORS}
            value={appearance.shirt}
            onPick={(c) => setAppearance({ shirt: c })}
          />
          <SwatchRow
            label="PANTS"
            colors={PANTS_COLORS}
            value={appearance.pants}
            onPick={(c) => setAppearance({ pants: c })}
          />

          <button
            onClick={onClose}
            className="mt-6 w-full px-6 py-3 rounded-full font-extrabold text-white active:scale-95 transition-transform"
            style={{
              background: "linear-gradient(90deg,#ff5ac8,#ff8a3c)",
              boxShadow: "0 0 24px rgba(255,90,200,0.5)",
            }}
          >
            ✓ SAVE &amp; CONTINUE
          </button>
          <button
            onClick={() =>
              setAppearance({
                skin: "#e8b98f",
                hair: "#1a1a22",
                shirt: "#f4f0e8",
                pants: "#2b2b3a",
              })
            }
            className="mt-2 w-full text-purple-200/60 text-xs"
          >
            reset to default
          </button>
        </div>
      </div>
    </div>
  );
}

function SwatchRow({ label, colors, value, onPick }) {
  return (
    <div className="mb-4">
      <div className="text-pink-200/80 text-[10px] tracking-[0.3em] mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => {
          const selected = c.toLowerCase() === (value || "").toLowerCase();
          return (
            <button
              key={c}
              onClick={() => onPick(c)}
              className="rounded-full transition-transform active:scale-90"
              style={{
                width: 34,
                height: 34,
                background: c,
                border: selected
                  ? "3px solid #fff"
                  : "2px solid rgba(255,255,255,0.25)",
                boxShadow: selected
                  ? `0 0 12px ${c}`
                  : "0 1px 3px rgba(0,0,0,0.4)",
              }}
              aria-label={c}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Slowly rotating character preview inside the design screen. */
function RotatingPreview({ appearance }) {
  const groupRef = useRef();
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.6;
    }
  });
  return (
    <group ref={groupRef} position={[0, -1.1, 0]}>
      <CharacterMesh {...appearance} holding />
      {/* simple shadow blob */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.6, 16]} />
        <meshBasicMaterial color="#000" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

