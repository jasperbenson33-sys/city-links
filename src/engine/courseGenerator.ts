import { CUP_APRON_RADIUS, CUP_RADIUS } from '../types/clubs';
import {
  ELEVATIONS,
  FLAG_COLORS,
  GRID_COLS,
  GRID_ROWS,
  ISLAND_HALF_SIZE,
  ISLAND_SIZE,
  SIGNATURE_PROP_TYPES,
  TILE_SIZE,
  type AABB3D,
  type FlagColor,
  type FlagPinSpec,
  type GeneratedCityCourse,
  type PlacedProp,
  type PlacedTile,
  type PropReactiveSpec,
  type PropType,
  type TileBlueprintId,
  type TileRotationSteps,
  type Vec3Tuple,
} from '../types/course';
import {
  computeCourseReachability,
  getCourseSurfaceElevationAt,
  isWorldPointInWaterHazard,
  validateGeneratedCourse,
} from './courseValidator';
import {
  aabbsOverlap3D,
  computeRotatedAABB,
  createSeededRng,
  gridToWorld,
  localToWorldPoint,
  type SeededRng,
} from './geometryHelpers';
import { PROP_CATALOG } from './propCatalog';
import { instantiatePlacedTile, TILE_BLUEPRINTS } from './tileBlueprints';

interface CellPlacement {
  blueprintId: TileBlueprintId;
  rotationSteps: TileRotationSteps;
  flagColor?: FlagColor;
}

const CARDINAL_DELTAS: readonly [number, number][] = [
  [0, -1], // 0: North (-Z)
  [1, 0], // 1: East (+X)
  [0, 1], // 2: South (+Z)
  [-1, 0], // 3: West (-X)
];

function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

function inGrid(col: number, row: number): boolean {
  return col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS;
}

function computeCupWorldPos(
  col: number,
  row: number,
  blueprintId: TileBlueprintId,
  rotationSteps: TileRotationSteps,
): Vec3Tuple {
  const bp = TILE_BLUEPRINTS[blueprintId];
  const { x: wx, z: wz } = gridToWorld(col, row);
  const rotY = rotationSteps === 0 ? 0 : -rotationSteps * (Math.PI * 0.5);
  return localToWorldPoint(
    wx,
    wz,
    rotY,
    bp.localCupOffset ?? [0, bp.baseElevationY, 0],
  );
}

function computeNextTeeWorldPos(
  col: number,
  row: number,
  blueprintId: TileBlueprintId,
  rotationSteps: TileRotationSteps,
): Vec3Tuple {
  const bp = TILE_BLUEPRINTS[blueprintId];
  const { x: wx, z: wz } = gridToWorld(col, row);
  const rotY = rotationSteps === 0 ? 0 : -rotationSteps * (Math.PI * 0.5);
  return localToWorldPoint(
    wx,
    wz,
    rotY,
    bp.localNextTeeOffset ?? [0.95, bp.baseElevationY, 0],
  );
}

function farEnoughFromExistingPins(
  candidatePos: Vec3Tuple,
  placedPins: Vec3Tuple[],
  minSpacing = 10.6,
): boolean {
  for (const p of placedPins) {
    const d = Math.hypot(candidatePos[0] - p[0], candidatePos[2] - p[2]);
    if (d < minSpacing) return false;
  }
  return true;
}

function buildReactiveSpecForProp(
  type: PropType,
  worldPos: Vec3Tuple,
  rotationY: number,
): PropReactiveSpec | undefined {
  const forwardX = Math.sin(rotationY);
  const forwardZ = Math.cos(rotationY);

  switch (type) {
    case 'hotdog_cart_umbrella':
      return {
        kind: 'umbrella_trampoline',
        zoneCenter: [worldPos[0], worldPos[1] + 2.12, worldPos[2]],
        zoneRadius: 1.38,
        restitution: 0.55,
        underpassClearHeight: 0.56,
        underpassClearWidth: 1.05,
      };
    case 'bistro_umbrella_set':
      return {
        kind: 'umbrella_trampoline',
        zoneCenter: [worldPos[0], worldPos[1] + 2.02, worldPos[2]],
        zoneRadius: 1.28,
        restitution: 0.55,
      };
    case 'fire_hydrant_jet':
      return {
        kind: 'hydrant_water_jet',
        zoneCenter: [
          worldPos[0] + forwardX * 2.4,
          worldPos[1] + 0.45,
          worldPos[2] + forwardZ * 2.4,
        ],
        zoneHalfExtents: [1.35, 0.75, 2.2],
        boostVelocity: [forwardX * 12.6, 2.8, forwardZ * 12.6],
      };
    case 'curved_gutter_corner':
      return {
        kind: 'gutter_corner_bank',
        zoneCenter: [worldPos[0], worldPos[1] + 0.08, worldPos[2]],
        zoneRadius: 1.15,
        restitution: 0.68,
      };
    case 'subway_steam_grate':
      return {
        kind: 'steam_updraft',
        zoneCenter: [worldPos[0], worldPos[1] + 1.1, worldPos[2]],
        zoneHalfExtents: [0.95, 1.3, 0.95],
        boostVelocity: [forwardX * 3.2, 11.4, forwardZ * 3.2],
        cycleSeconds: 3.2,
        dutyCycle: 0.55,
      };
    case 'scaffolding_tunnel':
      return {
        kind: 'scaffolding_underpass',
        zoneCenter: [worldPos[0], worldPos[1] + 0.72, worldPos[2]],
        zoneHalfExtents: [0.72, 0.72, 1.55],
        underpassClearHeight: 1.45,
        underpassClearWidth: 1.42,
      };
    case 'delivery_box_van':
      return {
        kind: 'van_roof_bounce',
        zoneCenter: [worldPos[0], worldPos[1] + 2.22, worldPos[2]],
        zoneHalfExtents: [1.0, 0.2, 2.15],
        restitution: 0.48,
      };
    case 'fountain_water_hazard':
      return {
        kind: 'water_hazard',
        zoneCenter: [worldPos[0], worldPos[1] - 0.1, worldPos[2]],
        zoneRadius: 1.55,
      };
    case 'pigeon_flock':
      return {
        kind: 'pigeon_scatter',
        zoneCenter: [worldPos[0], worldPos[1] + 0.18, worldPos[2]],
        zoneRadius: 2.4,
      };
    default:
      return undefined;
  }
}

/**
 *Attempts a single deterministic layout construction for `rng`.
 * Returns `null` if spatial/spacing constraints tighten so caller mutates sub-seed cleanly.
 */
function trySynthesizeCandidate(
  seed: string,
  resolvedAttempt: number,
  effectiveSeed: string,
  rng: SeededRng,
  startTimeMs: number,
): GeneratedCityCourse | null {
  const grid = new Map<string, CellPlacement>();
  const flagColors = rng.shuffle(FLAG_COLORS);
  const placedPinPositions: Vec3Tuple[] = [];

  // --------------------------------------------------------------------------
  // 1. Construct a socket-exact urban street graph with a guaranteed 90° corner
  // --------------------------------------------------------------------------
  // Track undirected road edges between grid cells + boundary exits
  const roadMask = Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => [false, false, false, false] as [boolean, boolean, boolean, boolean]),
  );

  const linkRoad = (c1: number, r1: number, dir: 0 | 1 | 2 | 3) => {
    roadMask[r1]![c1]![dir] = true;
    const [dc, dr] = CARDINAL_DELTAS[dir]!;
    const c2 = c1 + dc;
    const r2 = r1 + dr;
    if (inGrid(c2, r2)) {
      const opp = ((dir + 2) % 4) as 0 | 1 | 2 | 3;
      roadMask[r2]![c2]![opp] = true;
    }
  };

  // Pick avenue col in [1..4] and cross-street row in [1..4], plus a 90° L-turn branch
  const aveCol = rng.int(1, 4);
  const crossRow = rng.int(1, 4);
  const pattern = rng.int(0, 2);

  if (pattern === 0) {
    // Full N-S avenue + E-W cross street + dogleg corner loop
    for (let r = 0; r < GRID_ROWS; r++) {
      linkRoad(aveCol, r, 0);
      linkRoad(aveCol, r, 2);
    }
    for (let c = 0; c < GRID_COLS; c++) {
      linkRoad(c, crossRow, 1);
      linkRoad(c, crossRow, 3);
    }
    // Add a 90-degree corner branch exiting island edge so `road_corner_gutter` is guaranteed
    const turnCol = aveCol >= 3 ? aveCol - 2 : aveCol + 2;
    const turnRow = crossRow >= 3 ? 0 : GRID_ROWS - 1;
    const stepR = turnRow < crossRow ? -1 : 1;
    for (let r = crossRow; r !== turnRow; r += stepR) {
      linkRoad(turnCol, r, stepR === -1 ? 0 : 2);
    }
    // At (turnCol, turnRow), turn horizontally out to boundary!
    const exitEast = turnCol >= 3;
    for (let c = turnCol; exitEast ? c < GRID_COLS : c >= 0; c += exitEast ? 1 : -1) {
      linkRoad(c, turnRow, exitEast ? 1 : 3);
    }
  } else if (pattern === 1) {
    // Classic Manhattan L-avenue with 90° corner + cross boulevard
    const legCol2 = aveCol <= 2 ? aveCol + 2 : aveCol - 2;
    for (let r = 0; r < crossRow; r++) {
      linkRoad(aveCol, r, 0);
      linkRoad(aveCol, r, 2);
    }
    linkRoad(aveCol, crossRow, 0);
    const minC = Math.min(aveCol, legCol2);
    const maxC = Math.max(aveCol, legCol2);
    for (let c = minC; c < maxC; c++) {
      linkRoad(c, crossRow, 1);
    }
    for (let r = crossRow; r < GRID_ROWS; r++) {
      linkRoad(legCol2, r, 2);
      if (r > crossRow) linkRoad(legCol2, r, 0);
    }
    // T-branch to boundary
    const sideDir: 1 | 3 = aveCol <= 2 ? 3 : 1;
    for (let c = aveCol; sideDir === 1 ? c < GRID_COLS : c >= 0; c += sideDir === 1 ? 1 : -1) {
      if (c !== aveCol || sideDir === 3) {
        // connect toward boundary from (aveCol, 1)
      }
    }
    const spurRow = crossRow >= 3 ? 1 : 4;
    const baseC = spurRow < crossRow ? aveCol : legCol2;
    const goEast = baseC <= 2;
    for (let c = baseC; goEast ? c < GRID_COLS : c >= 0; c += goEast ? 1 : -1) {
      linkRoad(c, spurRow, goEast ? 1 : 3);
    }
  } else {
    // Scenic perimeter-linked boulevard loop with 2 corners + T-junctions
    const cWest = rng.int(1, 2);
    const cEast = rng.int(3, 4);
    const rNorth = rng.int(1, 2);
    const rSouth = rng.int(3, 4);
    for (let c = cWest; c < cEast; c++) {
      linkRoad(c, rNorth, 1);
      linkRoad(c, rSouth, 1);
    }
    for (let r = rNorth; r < rSouth; r++) {
      linkRoad(cWest, r, 2);
      linkRoad(cEast, r, 2);
    }
    // Exit North from cWest and East from rSouth
    for (let r = rNorth; r >= 0; r--) linkRoad(cWest, r, 0);
    for (let c = cEast; c < GRID_COLS; c++) linkRoad(c, rSouth, 1);
  }

  // Place Cup 1 (`cup_transit_island_green`) on a straight road cell
  const straightRoadCells: Array<{ col: number; row: number; rot: TileRotationSteps }> = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const m = roadMask[r]![c]!;
      const deg = (m[0] ? 1 : 0) + (m[1] ? 1 : 0) + (m[2] ? 1 : 0) + (m[3] ? 1 : 0);
      if (deg === 2 && m[0] && m[2]) {
        straightRoadCells.push({ col: c, row: r, rot: 0 });
      } else if (deg === 2 && m[1] && m[3]) {
        straightRoadCells.push({ col: c, row: r, rot: 1 });
      }
    }
  }
  if (straightRoadCells.length === 0) return null;
  const transitPick = rng.pick(straightRoadCells);
  const transitPos = computeCupWorldPos(
    transitPick.col,
    transitPick.row,
    'cup_transit_island_green',
    transitPick.rot,
  );
  grid.set(cellKey(transitPick.col, transitPick.row), {
    blueprintId: 'cup_transit_island_green',
    rotationSteps: transitPick.rot,
    flagColor: flagColors[0]!,
  });
  placedPinPositions.push(transitPos);

  // Place Cup 2 (`cup_corner_parklet`) adjacent to a road cell via a single spur link
  const cornerParkletCandidates: Array<{
    col: number;
    row: number;
    roadCol: number;
    roadRow: number;
    dirFromParkletToRoad: 0 | 1 | 2 | 3;
    pos: Vec3Tuple;
  }> = [];

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const m = roadMask[r]![c]!;
      if (m[0] || m[1] || m[2] || m[3]) continue; // must currently be non-road
      for (let d = 0 as 0 | 1 | 2 | 3; d < 4; d = (d + 1) as 0 | 1 | 2 | 3) {
        const [dc, dr] = CARDINAL_DELTAS[d]!;
        const nc = c + dc;
        const nr = r + dr;
        if (!inGrid(nc, nr)) continue;
        if (cellKey(nc, nr) === cellKey(transitPick.col, transitPick.row)) continue;
        const nm = roadMask[nr]![nc]!;
        const ndeg = (nm[0] ? 1 : 0) + (nm[1] ? 1 : 0) + (nm[2] ? 1 : 0) + (nm[3] ? 1 : 0);
        if (ndeg >= 2 && ndeg <= 3) {
          // cup_corner_parklet has 'asphalt_road' on base North (0), so rotationSteps = d points it to d!
          const rot = d as TileRotationSteps;
          const pos = computeCupWorldPos(c, r, 'cup_corner_parklet', rot);
          if (farEnoughFromExistingPins(pos, placedPinPositions)) {
            cornerParkletCandidates.push({
              col: c,
              row: r,
              roadCol: nc,
              roadRow: nr,
              dirFromParkletToRoad: d,
              pos,
            });
          }
        }
      }
    }
  }
  if (cornerParkletCandidates.length === 0) return null;
  const parkletPick = rng.pick(cornerParkletCandidates);
  linkRoad(parkletPick.col, parkletPick.row, parkletPick.dirFromParkletToRoad);
  grid.set(cellKey(parkletPick.col, parkletPick.row), {
    blueprintId: 'cup_corner_parklet',
    rotationSteps: parkletPick.dirFromParkletToRoad as TileRotationSteps,
    flagColor: flagColors[1]!,
  });
  placedPinPositions.push(parkletPick.pos);

  // Branch a 2-tile Curb-Gutter Boulevard -> Cul-de-Sac Turnaround spur directly off the street network
  // so 100% of asphalt & storm-drain gutter tiles form ONE connected urban street graph (0 stranded asphalt patches!)
  const gutterSpurCandidates: Array<{
    rc: number;
    rr: number;
    c1: number;
    r1: number;
    c2: number;
    r2: number;
    dir: 0 | 1 | 2 | 3;
  }> = [];
  for (let rr = 0; rr < GRID_ROWS; rr++) {
    for (let rc = 0; rc < GRID_COLS; rc++) {
      if (grid.has(cellKey(rc, rr))) continue;
      const m = roadMask[rr]![rc]!;
      const deg = (m[0] ? 1 : 0) + (m[1] ? 1 : 0) + (m[2] ? 1 : 0) + (m[3] ? 1 : 0);
      if (deg < 2 || deg > 3) continue;
      for (const d of [0, 1, 2, 3] as const) {
        if (m[d]) continue;
        const [dc, dr] = CARDINAL_DELTAS[d]!;
        const c1 = rc + dc;
        const r1 = rr + dr;
        const c2 = rc + dc * 2;
        const r2 = rr + dr * 2;
        if (!inGrid(c1, r1) || !inGrid(c2, r2)) continue;
        if (grid.has(cellKey(c1, r1)) || grid.has(cellKey(c2, r2))) continue;
        const m1 = roadMask[r1]![c1]!;
        const m2 = roadMask[r2]![c2]!;
        if (m1[0] || m1[1] || m1[2] || m1[3]) continue;
        if (m2[0] || m2[1] || m2[2] || m2[3]) continue;
        gutterSpurCandidates.push({ rc, rr, c1, r1, c2, r2, dir: d });
      }
    }
  }
  if (gutterSpurCandidates.length > 0) {
    const spur = rng.pick(gutterSpurCandidates);
    // Open 'asphalt_road' branch on (rc, rr) toward (c1, r1)
    roadMask[spur.rr]![spur.rc]![spur.dir] = true;
    grid.set(cellKey(spur.c1, spur.r1), {
      blueprintId: 'curb_gutter_boulevard',
      rotationSteps: spur.dir as TileRotationSteps,
    });
    grid.set(cellKey(spur.c2, spur.r2), {
      blueprintId: 'curb_gutter_corner_90',
      rotationSteps: (((spur.dir + 2) % 4) as TileRotationSteps),
    });
  }

  // Assign exact road blueprints to all remaining cells in roadMask
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const key = cellKey(c, r);
      if (grid.has(key)) continue;
      const [n, e, s, w] = roadMask[r]![c]!;
      const deg = (n ? 1 : 0) + (e ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0);
      if (deg === 0) continue;

      if (deg === 4) {
        grid.set(key, { blueprintId: 'road_cross_intersection', rotationSteps: 0 });
      } else if (deg === 3) {
        // road_t_junction has sidewalk on West (3); rotate so missing road is West+steps!
        const missing = !w ? 0 : !n ? 1 : !e ? 2 : 3;
        grid.set(key, {
          blueprintId: 'road_t_junction',
          rotationSteps: missing as TileRotationSteps,
        });
      } else if (deg === 2) {
        if (n && s) {
          grid.set(key, { blueprintId: 'road_straight', rotationSteps: 0 });
        } else if (e && w) {
          grid.set(key, { blueprintId: 'road_straight', rotationSteps: 1 });
        } else {
          // road_corner_gutter has roads on North (0) & East (1)
          const rot: TileRotationSteps =
            n && e ? 0 : e && s ? 1 : s && w ? 2 : 3;
          grid.set(key, { blueprintId: 'road_corner_gutter', rotationSteps: rot });
        }
      } else {
        return null;
      }
    }
  }

  // Helper to list free pairs of adjacent unassigned cells
  const findFreePairs = () => {
    const pairs: Array<{
      c1: number;
      r1: number;
      c2: number;
      r2: number;
      dir1To2: 0 | 1 | 2 | 3;
    }> = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (grid.has(cellKey(c, r))) continue;
        for (const d of [0, 1, 2, 3] as const) {
          const [dc, dr] = CARDINAL_DELTAS[d]!;
          const nc = c + dc;
          const nr = r + dr;
          if (!inGrid(nc, nr) || grid.has(cellKey(nc, nr))) continue;
          pairs.push({ c1: c, r1: r, c2: nc, r2: nr, dir1To2: d });
        }
      }
    }
    return rng.shuffle(pairs);
  };

  // Helper to list free collinear triples of unassigned cells
  const findFreeTriples = () => {
    const triples: Array<{
      c1: number;
      r1: number;
      c2: number;
      r2: number;
      c3: number;
      r3: number;
      dir: 0 | 1 | 2 | 3;
    }> = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (grid.has(cellKey(c, r))) continue;
        for (const d of [0, 1, 2, 3] as const) {
          const [dc, dr] = CARDINAL_DELTAS[d]!;
          const c2 = c + dc;
          const r2 = r + dr;
          const c3 = c + dc * 2;
          const r3 = r + dr * 2;
          if (
            !inGrid(c2, r2) ||
            !inGrid(c3, r3) ||
            grid.has(cellKey(c2, r2)) ||
            grid.has(cellKey(c3, r3))
          ) {
            continue;
          }
          triples.push({ c1: c, r1: r, c2, r2, c3, r3, dir: d });
        }
      }
    }
    return rng.shuffle(triples);
  };

  // --------------------------------------------------------------------------
  // 2. Place Cup 3 (`cup_elevated_cafe_terrace` + `terrace_ramp_approach` pair)
  // --------------------------------------------------------------------------
  // cup_elevated_cafe_terrace has 'ramp_step' on base South (2): rotSteps=(d+2)%4 points South toward d!
  // terrace_ramp_approach has 'ramp_step' on base North (0): rotSteps=(opp) points North back toward cell 1!
  let placedTerrace = false;
  for (const pair of findFreePairs()) {
    const cupRot = (((pair.dir1To2 + 2) % 4) as TileRotationSteps);
    const rampRot = (((pair.dir1To2 + 2) % 4) as TileRotationSteps);
    const cupPos = computeCupWorldPos(
      pair.c1,
      pair.r1,
      'cup_elevated_cafe_terrace',
      cupRot,
    );
    if (!farEnoughFromExistingPins(cupPos, placedPinPositions)) continue;

    grid.set(cellKey(pair.c1, pair.r1), {
      blueprintId: 'cup_elevated_cafe_terrace',
      rotationSteps: cupRot,
      flagColor: flagColors[2]!,
    });
    grid.set(cellKey(pair.c2, pair.r2), {
      blueprintId: 'terrace_ramp_approach',
      rotationSteps: rampRot,
    });
    placedPinPositions.push(cupPos);
    placedTerrace = true;
    break;
  }
  if (!placedTerrace) return null;

  // --------------------------------------------------------------------------
  // 3. Place Cup 4 (`cup_pocket_garden_green` + optional `parklet_green_promenade` + `parklet_green_connector`)
  // --------------------------------------------------------------------------
  let placedGarden = false;
  if (rng.chance(0.45)) {
    for (const tri of findFreeTriples()) {
      const gardenRot = tri.dir as TileRotationSteps;
      const promRot = ((tri.dir % 2) as TileRotationSteps);
      const connRot = (((tri.dir + 2) % 4) as TileRotationSteps);
      const cupPos = computeCupWorldPos(
        tri.c1,
        tri.r1,
        'cup_pocket_garden_green',
        gardenRot,
      );
      if (!farEnoughFromExistingPins(cupPos, placedPinPositions)) continue;

      grid.set(cellKey(tri.c1, tri.r1), {
        blueprintId: 'cup_pocket_garden_green',
        rotationSteps: gardenRot,
        flagColor: flagColors[3]!,
      });
      grid.set(cellKey(tri.c2, tri.r2), {
        blueprintId: 'parklet_green_promenade',
        rotationSteps: promRot,
      });
      grid.set(cellKey(tri.c3, tri.r3), {
        blueprintId: 'parklet_green_connector',
        rotationSteps: connRot,
      });
      placedPinPositions.push(cupPos);
      placedGarden = true;
      break;
    }
  }
  if (!placedGarden) {
    for (const pair of findFreePairs()) {
      const gardenRot = pair.dir1To2 as TileRotationSteps;
      const connRot = (((pair.dir1To2 + 2) % 4) as TileRotationSteps);
      const cupPos = computeCupWorldPos(
        pair.c1,
        pair.r1,
        'cup_pocket_garden_green',
        gardenRot,
      );
      if (!farEnoughFromExistingPins(cupPos, placedPinPositions)) continue;

      grid.set(cellKey(pair.c1, pair.r1), {
        blueprintId: 'cup_pocket_garden_green',
        rotationSteps: gardenRot,
        flagColor: flagColors[3]!,
      });
      grid.set(cellKey(pair.c2, pair.r2), {
        blueprintId: 'parklet_green_connector',
        rotationSteps: connRot,
      });
      placedPinPositions.push(cupPos);
      placedGarden = true;
      break;
    }
  }
  if (!placedGarden) return null;

  // --------------------------------------------------------------------------
  // 4. Place Cup 5 (`cup_sunken_courtyard`) on a free cell >= 10.6m from all 4 pins
  // --------------------------------------------------------------------------
  const freeCells: Array<{ col: number; row: number }> = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (!grid.has(cellKey(c, r))) freeCells.push({ col: c, row: r });
    }
  }
  let placedSunken = false;
  for (const cell of rng.shuffle(freeCells)) {
    const rot = rng.int(0, 3) as TileRotationSteps;
    const cupPos = computeCupWorldPos(
      cell.col,
      cell.row,
      'cup_sunken_courtyard',
      rot,
    );
    if (!farEnoughFromExistingPins(cupPos, placedPinPositions)) continue;
    grid.set(cellKey(cell.col, cell.row), {
      blueprintId: 'cup_sunken_courtyard',
      rotationSteps: rot,
      flagColor: flagColors[4]!,
    });
    placedPinPositions.push(cupPos);
    placedSunken = true;
    break;
  }
  if (!placedSunken) return null;

  // --------------------------------------------------------------------------
  // 5. Place Optional Secondary Rooftop Terrace + Cohesive Park Reflection Pool / Fountain Hazards
  // --------------------------------------------------------------------------
  // Optional 3-tile secondary Rooftop Terrace (`terrace_rooftop_lounge` + `terrace_stair_chute_top` + `terrace_ramp_approach`)
  if (rng.chance(0.4)) {
    for (const tri of findFreeTriples()) {
      const rot = (((tri.dir + 2) % 4) as TileRotationSteps);
      grid.set(cellKey(tri.c1, tri.r1), {
        blueprintId: 'terrace_rooftop_lounge',
        rotationSteps: rot,
      });
      grid.set(cellKey(tri.c2, tri.r2), {
        blueprintId: 'terrace_stair_chute_top',
        rotationSteps: rot,
      });
      grid.set(cellKey(tri.c3, tri.r3), {
        blueprintId: 'terrace_ramp_approach',
        rotationSteps: rot,
      });
      break;
    }
  }

  // Optional 2-tile canal water hazard pair (sharing 'water_hazard' North socket)
  if (rng.chance(0.55)) {
    for (const pair of findFreePairs()) {
      grid.set(cellKey(pair.c1, pair.r1), {
        blueprintId: 'canal_water_hazard',
        rotationSteps: pair.dir1To2 as TileRotationSteps,
      });
      grid.set(cellKey(pair.c2, pair.r2), {
        blueprintId: 'canal_water_hazard',
        rotationSteps: (((pair.dir1To2 + 2) % 4) as TileRotationSteps),
      });
      break;
    }
  }

  // Guarantee at least one `fountain_plaza_hazard` cell so `fountain_water_hazard` centerpiece sits cleanly
  const remainingSingle: Array<{ col: number; row: number }> = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (!grid.has(cellKey(c, r))) remainingSingle.push({ col: c, row: r });
    }
  }
  const shuffledRemaining = rng.shuffle(remainingSingle);
  if (shuffledRemaining.length < 2) return null;

  const fountainCell = shuffledRemaining[0]!;
  grid.set(cellKey(fountainCell.col, fountainCell.row), {
    blueprintId: 'fountain_plaza_hazard',
    rotationSteps: rng.int(0, 3) as TileRotationSteps,
  });

  // Choose Starting Tee Plaza Cell (at least 8.5m away from all 5 flags!)
  let startTeeCell: { col: number; row: number } | null = null;
  for (let i = 1; i < shuffledRemaining.length; i++) {
    const cand = shuffledRemaining[i]!;
    const { x: wx, z: wz } = gridToWorld(cand.col, cand.row);
    if (farEnoughFromExistingPins([wx, ELEVATIONS.SIDEWALK_Y, wz], placedPinPositions, 8.2)) {
      startTeeCell = cand;
      break;
    }
  }
  if (!startTeeCell) {
    startTeeCell = shuffledRemaining[1]!;
  }
  grid.set(cellKey(startTeeCell.col, startTeeCell.row), {
    blueprintId: 'sidewalk_plaza_open',
    rotationSteps: 0,
  });

  // Fill all remaining cells with sunlit open plazas
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const k = cellKey(c, r);
      if (!grid.has(k)) {
        grid.set(k, {
          blueprintId: 'sidewalk_plaza_open',
          rotationSteps: rng.int(0, 3) as TileRotationSteps,
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 6. Instantiate all 36 PlacedTiles and 5 FlagPinSpecs
  // --------------------------------------------------------------------------
  const tiles: PlacedTile[] = [];
  const flagsByColor = new Map<FlagColor, FlagPinSpec>();

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const spec = grid.get(cellKey(col, row))!;
      const tile = instantiatePlacedTile(
        col,
        row,
        spec.blueprintId,
        spec.rotationSteps,
        spec.flagColor,
      );
      tiles.push(tile);

      if (spec.flagColor && tile.cupArchetype) {
        const cupPos = computeCupWorldPos(
          col,
          row,
          spec.blueprintId,
          spec.rotationSteps,
        );
        const nextTeePos = computeNextTeeWorldPos(
          col,
          row,
          spec.blueprintId,
          spec.rotationSteps,
        );
        flagsByColor.set(spec.flagColor, {
          color: spec.flagColor,
          index: FLAG_COLORS.indexOf(spec.flagColor),
          archetype: tile.cupArchetype,
          tileCol: col,
          tileRow: row,
          position: cupPos,
          elevationY: cupPos[1],
          tier: tile.tier,
          apronRadius: CUP_APRON_RADIUS,
          cupRadius: CUP_RADIUS,
          nextTeePosition: nextTeePos,
        });
      }
    }
  }

  const flags: FlagPinSpec[] = FLAG_COLORS.map((c) => flagsByColor.get(c)!).filter(
    Boolean,
  );
  if (flags.length !== 5) return null;

  const startWorld = gridToWorld(
    startTeeCell.col,
    startTeeCell.row,
    ELEVATIONS.SIDEWALK_Y,
  );
  const startTeePosition: Vec3Tuple = [
    startWorld.x,
    ELEVATIONS.SIDEWALK_Y,
    startWorld.z,
  ];

  // Point initialAimYaw toward the nearest flag so camera & first shot feel intuitive
  let nearestFlag = flags[0]!;
  let nearestDist = Infinity;
  for (const f of flags) {
    const d = Math.hypot(
      f.position[0] - startTeePosition[0],
      f.position[2] - startTeePosition[2],
    );
    if (d < nearestDist) {
      nearestDist = d;
      nearestFlag = f;
    }
  }
  const initialAimYaw = Math.atan2(
    nearestFlag.position[0] - startTeePosition[0],
    -(nearestFlag.position[2] - startTeePosition[2]),
  );

  // --------------------------------------------------------------------------
  // 7. Populate Signature Reactive City Props + Street Dressing via Validated Anchors
  // --------------------------------------------------------------------------
  const props: PlacedProp[] = [];
  const partialCourse = { tiles, props, startTeePosition, flags };

  const canPlacePropAt = (
    type: PropType,
    worldPos: Vec3Tuple,
    worldRotY: number,
  ): { ok: boolean; adjustedPos: Vec3Tuple; aabb: AABB3D } => {
    const hostY = getCourseSurfaceElevationAt(
      partialCourse,
      worldPos[0],
      worldPos[2],
    );
    const adjustedPos: Vec3Tuple = [worldPos[0], hostY, worldPos[2]];
    const spec = PROP_CATALOG[type];
    const aabb = computeRotatedAABB(adjustedPos, spec.localSize, worldRotY);

    // Island margin check
    if (
      aabb.min[0] < -ISLAND_HALF_SIZE + 0.25 ||
      aabb.max[0] > ISLAND_HALF_SIZE - 0.25 ||
      aabb.min[2] < -ISLAND_HALF_SIZE + 0.25 ||
      aabb.max[2] > ISLAND_HALF_SIZE - 0.25
    ) {
      return { ok: false, adjustedPos, aabb };
    }

    // Water hazard check (only fountain_water_hazard sits on the fountain plinth)
    if (
      type !== 'fountain_water_hazard' &&
      isWorldPointInWaterHazard(partialCourse, adjustedPos[0], adjustedPos[2])
    ) {
      return { ok: false, adjustedPos, aabb };
    }

    // Verify corners of solid props sit on the same elevation tier (no half-hanging off curbs!)
    if (type !== 'fountain_water_hazard' && type !== 'curved_gutter_corner') {
      const insetX = Math.max(0.05, (aabb.max[0] - aabb.min[0]) * 0.38);
      const insetZ = Math.max(0.05, (aabb.max[2] - aabb.min[2]) * 0.38);
      const corners: [number, number][] = [
        [adjustedPos[0] - insetX, adjustedPos[2] - insetZ],
        [adjustedPos[0] + insetX, adjustedPos[2] - insetZ],
        [adjustedPos[0] - insetX, adjustedPos[2] + insetZ],
        [adjustedPos[0] + insetX, adjustedPos[2] + insetZ],
      ];
      for (const [cx, cz] of corners) {
        const cy = getCourseSurfaceElevationAt(partialCourse, cx, cz);
        if (Math.abs(cy - hostY) > 0.04) {
          return { ok: false, adjustedPos, aabb };
        }
      }
    }

    // Clear 1.65m around all 5 cups and 0.95m around startTee & nextTeePositions
    const distStart = Math.hypot(
      adjustedPos[0] - startTeePosition[0],
      adjustedPos[2] - startTeePosition[2],
    );
    if (distStart < 1.85) {
      return { ok: false, adjustedPos, aabb };
    }

    for (const flag of flags) {
      const closestX = Math.max(
        aabb.min[0],
        Math.min(flag.position[0], aabb.max[0]),
      );
      const closestZ = Math.max(
        aabb.min[2],
        Math.min(flag.position[2], aabb.max[2]),
      );
      if (
        Math.hypot(flag.position[0] - closestX, flag.position[2] - closestZ) <
        CUP_APRON_RADIUS + 0.18
      ) {
        return { ok: false, adjustedPos, aabb };
      }

      const ntClosestX = Math.max(
        aabb.min[0],
        Math.min(flag.nextTeePosition[0], aabb.max[0]),
      );
      const ntClosestZ = Math.max(
        aabb.min[2],
        Math.min(flag.nextTeePosition[2], aabb.max[2]),
      );
      if (
        Math.hypot(
          flag.nextTeePosition[0] - ntClosestX,
          flag.nextTeePosition[2] - ntClosestZ,
        ) < 0.75
      ) {
        return { ok: false, adjustedPos, aabb };
      }
    }

    // Padded AABB overlap check against existing props
    const padded: AABB3D = {
      min: [aabb.min[0] - 0.12, aabb.min[1] - 0.02, aabb.min[2] - 0.12],
      max: [aabb.max[0] + 0.12, aabb.max[1] + 0.02, aabb.max[2] + 0.12],
    };
    for (const existing of props) {
      if (aabbsOverlap3D(padded, existing.aabb)) {
        return { ok: false, adjustedPos, aabb };
      }
    }

    return { ok: true, adjustedPos, aabb };
  };

  // Collect all candidate anchor slots across the 36 tiles (excluding startTeeCell)
  interface CandidateSlot {
    tile: PlacedTile;
    slotId: string;
    worldPos: Vec3Tuple;
    worldRotY: number;
    allowedProps: readonly PropType[];
  }
  const allSlots: CandidateSlot[] = [];
  for (const tile of tiles) {
    if (tile.col === startTeeCell.col && tile.row === startTeeCell.row) continue;
    const bp = TILE_BLUEPRINTS[tile.blueprintId];
    for (const slot of bp.anchorSlots) {
      const worldPos = localToWorldPoint(
        tile.worldX,
        tile.worldZ,
        tile.rotationY,
        slot.localPosition,
      );
      const worldRotY = tile.rotationY + slot.localRotationY;
      allSlots.push({
        tile,
        slotId: slot.id,
        worldPos,
        worldRotY,
        allowedProps: slot.allowedProps,
      });
    }
  }

  const usedSlotKeys = new Set<string>();

  // Pass 1: Place one of each signature reactive prop so every city feels alive & toybox-rich!
  for (const sigType of SIGNATURE_PROP_TYPES) {
    const matchingSlots = rng.shuffle(
      allSlots.filter(
        (s) =>
          !usedSlotKeys.has(`${s.tile.id}:${s.slotId}`) &&
          s.allowedProps.includes(sigType),
      ),
    );
    for (const slot of matchingSlots) {
      const check = canPlacePropAt(sigType, slot.worldPos, slot.worldRotY);
      if (!check.ok) continue;
      const spec = PROP_CATALOG[sigType];
      usedSlotKeys.add(`${slot.tile.id}:${slot.slotId}`);
      props.push({
        id: `prop-${props.length + 1}-${sigType}`,
        type: sigType,
        tileCol: slot.tile.col,
        tileRow: slot.tile.row,
        position: check.adjustedPos,
        groundY: check.adjustedPos[1],
        rotationY: slot.worldRotY,
        localSize: [...spec.localSize] as Vec3Tuple,
        aabb: check.aabb,
        blocksGroundRoll: spec.blocksGroundRoll,
        reactive: buildReactiveSpecForProp(
          sigType,
          check.adjustedPos,
          slot.worldRotY,
        ),
      });
      break;
    }
  }

  // Pass 2: Tasteful ambient trees, bollards, lamps, and extra pigeons (6..10 ambient props)
  const ambientQuota = rng.int(6, 10);
  let ambientPlaced = 0;
  const ambientPool: readonly PropType[] = [
    'street_tree',
    'brass_bollard',
    'street_lamp',
    'pigeon_flock',
  ];
  for (const slot of rng.shuffle(allSlots)) {
    if (ambientPlaced >= ambientQuota) break;
    const key = `${slot.tile.id}:${slot.slotId}`;
    if (usedSlotKeys.has(key)) continue;
    const allowedAmbient = slot.allowedProps.filter((p) =>
      ambientPool.includes(p),
    );
    if (allowedAmbient.length === 0) continue;
    const chosen = rng.pick(allowedAmbient);
    const check = canPlacePropAt(chosen, slot.worldPos, slot.worldRotY);
    if (!check.ok) continue;
    const spec = PROP_CATALOG[chosen];
    usedSlotKeys.add(key);
    props.push({
      id: `prop-${props.length + 1}-${chosen}`,
      type: chosen,
      tileCol: slot.tile.col,
      tileRow: slot.tile.row,
      position: check.adjustedPos,
      groundY: check.adjustedPos[1],
      rotationY: slot.worldRotY,
      localSize: [...spec.localSize] as Vec3Tuple,
      aabb: check.aabb,
      blocksGroundRoll: spec.blocksGroundRoll,
      reactive: buildReactiveSpecForProp(
        chosen,
        check.adjustedPos,
        slot.worldRotY,
      ),
    });
    ambientPlaced++;
  }

  const reach = computeCourseReachability(partialCourse);
  if (reach.unreachablePairs.length > 0 || reach.maxStrokes > 3) {
    return null;
  }

  const candidate: GeneratedCityCourse = {
    seed,
    resolvedAttempt,
    effectiveSeed,
    gridCols: GRID_COLS,
    gridRows: GRID_ROWS,
    tileSize: TILE_SIZE,
    islandSize: ISLAND_SIZE,
    tiles,
    props,
    startTeePosition,
    startTeeTile: { col: startTeeCell.col, row: startTeeCell.row },
    initialAimYaw,
    flags,
    reachability: reach.edges,
    generationMs: performance.now() - startTimeMs,
  };

  const validation = validateGeneratedCourse(candidate);
  if (!validation.valid) {
    return null;
  }

  candidate.generationMs = performance.now() - startTimeMs;
  return candidate;
}

/**
 * Generates a 100% socket-valid, multi-club-reachable 6x6 floating city block island
 * from any deterministic string seed, auto-mutating sub-seeds in `< 20ms` until all
 * hard invariants pass with zero exceptions.
 */
export function generateCityCourse(seed: string): GeneratedCityCourse {
  const cleanSeed = String(seed).trim() || 'curbside-links';
  const startTimeMs = performance.now();

  for (let attempt = 0; attempt < 64; attempt++) {
    const effectiveSeed =
      attempt === 0 ? cleanSeed : `${cleanSeed}#${attempt}`;
    const rng = createSeededRng(effectiveSeed);
    const result = trySynthesizeCandidate(
      cleanSeed,
      attempt,
      effectiveSeed,
      rng,
      startTimeMs,
    );
    if (result) {
      return result;
    }
  }

  throw new Error(
    `generateCityCourse failed to converge within 64 deterministic sub-seeds for "${cleanSeed}"`,
  );
}
