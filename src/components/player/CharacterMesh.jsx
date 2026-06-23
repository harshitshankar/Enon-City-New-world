import { forwardRef } from "react";

/**
 * Low-poly blocky character (Minecraft-ish), matching the reference art.
 * Pure mesh group — no physics. Positioned/animated by parent.
 */
const CharacterMesh = forwardRef(function CharacterMesh(
  { skin = "#e8b98f", shirt = "#f4f0e8", pants = "#2b2b3a", hair = "#1a1a22", walkPhase = 0, holding = false },
  ref
) {
  const swing = Math.sin(walkPhase) * 0.6;
  return (
    <group ref={ref}>
      {/* head */}
      <mesh position={[0, 1.62, 0]} castShadow>
        <boxGeometry args={[0.45, 0.45, 0.45]} />
        <meshStandardMaterial color={skin} flatShading />
      </mesh>
      {/* hair */}
      <mesh position={[0, 1.78, -0.02]} castShadow>
        <boxGeometry args={[0.5, 0.22, 0.52]} />
        <meshStandardMaterial color={hair} flatShading />
      </mesh>
      {/* torso */}
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[0.55, 0.7, 0.32]} />
        <meshStandardMaterial color={shirt} flatShading />
      </mesh>
      {/* arms */}
      <mesh
        position={[-0.4, 1.1, 0]}
        rotation={[holding ? -1.2 : swing, 0, 0.05]}
        castShadow
      >
        <boxGeometry args={[0.18, 0.62, 0.18]} />
        <meshStandardMaterial color={skin} flatShading />
      </mesh>
      <mesh
        position={[0.4, 1.1, holding ? 0.15 : 0]}
        rotation={[holding ? -1.4 : -swing, 0, -0.05]}
        castShadow
      >
        <boxGeometry args={[0.18, 0.62, 0.18]} />
        <meshStandardMaterial color={skin} flatShading />
      </mesh>
      {/* legs */}
      <mesh position={[-0.16, 0.45, 0]} rotation={[-swing, 0, 0]} castShadow>
        <boxGeometry args={[0.22, 0.7, 0.22]} />
        <meshStandardMaterial color={pants} flatShading />
      </mesh>
      <mesh position={[0.16, 0.45, 0]} rotation={[swing, 0, 0]} castShadow>
        <boxGeometry args={[0.22, 0.7, 0.22]} />
        <meshStandardMaterial color={pants} flatShading />
      </mesh>
    </group>
  );
});

export default CharacterMesh;
