/**
 * Shared city-layout constants.
 *
 * These live in their own module (with NO imports) so that World.jsx and the
 * systems it imports (Plaza, StreetLightGlow, ...) can both pull from here
 * without forming a circular import. Previously Plaza/StreetLightGlow imported
 * HALF/BLOCK/... from World.jsx *while World.jsx imported them back*, and using
 * HALF at module top-level in Plaza (PLAZA_X = -HALF*0.5+6) triggered a
 * "Cannot access 'X' before initialization" TDZ crash after the single-file
 * production bundle reordered module evaluation.
 */
export const BLOCK = 28; // distance between road centres
export const GRID = 12; // GRID x GRID blocks
export const ROAD_W = 9; // road width
export const HALF = (GRID * BLOCK) / 2; // = 168

// Exported so other systems (NPCs/vehicles) can align with the road grid.
export const cityConfig = { BLOCK, GRID, ROAD_W, HALF };
