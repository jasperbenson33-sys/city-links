import {
  BALL_RADIUS,
  CLUB_ORDER,
  CLUB_SPECS,
  CUP_APRON_RADIUS,
  type ClubId,
} from '../types/clubs';
import {
  ELEVATIONS,
  GRID_COLS,
  GRID_ROWS,
  ISLAND_HALF_SIZE,
  type AABB3D,
  type CourseReachabilityEdge,
  type CourseValidationResult,
  type FlagColor,
  type GeneratedCityCourse,
  type PlacedTile,
  type Vec3Tuple,
} from '../types/course';
import {
  aabbsOverlap3D,
  worldToGrid,
  worldToLocalPoint,
} from './geometryHelpers';
import { computeDeterministicTrajectory } from './trajectory';

/**
 * Evaluates the exact walkable/playable surface elevation `y` at world `(wx, wz)`
 * across slabs and sloped ramps on the 6x6 modular tile grid.
 */
export function getCourseSurfaceElevationAt(
  course: Pick<GeneratedCityCourse, 'tiles'>,
  wx: number,
  wz: number,
): number {
  const lookup = worldToGrid(wx, wz);
  if (!lookup.inBounds) {
    return ELEVATIONS.WATER_BASIN_Y;
  }
  const tile = course.tiles[lookup.row * GRID_COLS + lookup.col];
  if (!tile) {
    return ELEVATIONS.STREET_Y;
  }
  return getTileSurfaceElevationAtWorld(tile, wx, wz);
}

export function getTileSurfaceElevationAtWorld(
  tile: PlacedTile,
  wx: number,
  wz: number,
): number {
  const [lx, , lz] = worldToLocalPoint(
    tile.worldX,
    tile.worldZ,
    tile.rotationY,
    wx,
    0,
    wz,
  );

  // 1. Check sloped ramps first (continuous elevation transitions)
  for (const ramp of tile.ramps) {
    const b = ramp.localBoundsXZ;
    if (
      lx >= b.minX - 1e-4 &&
      lx <= b.maxX + 1e-4 &&
      lz >= b.minZ - 1e-4 &&
      lz <= b.maxZ + 1e-4
    ) {
      let t = 0.5;
      if (ramp.climbDirection === 'north') {
        t = (b.maxZ - lz) / Math.max(1e-5, b.maxZ - b.minZ);
      } else if (ramp.climbDirection === 'south') {
        t = (lz - b.minZ) / Math.max(1e-5, b.maxZ - b.minZ);
      } else if (ramp.climbDirection === 'east') {
        t = (lx - b.minX) / Math.max(1e-5, b.maxX - b.minX);
      } else {
        t = (b.maxX - lx) / Math.max(1e-5, b.maxX - b.minX);
      }
      const clampedT = Math.max(0, Math.min(1, t));
      return ramp.bottomY + (ramp.topY - ramp.bottomY) * clampedT;
    }
  }

  // 2. Check walkable horizontal slabs (excluding pure thin curb walls)
  let bestY: number | null = null;
  for (const surf of tile.surfaces) {
    if (surf.isWall || surf.kind === 'curb_wall' || surf.kind === 'terrace_wall') {
      continue;
    }
    const hx = surf.size[0] * 0.5;
    const hz = surf.size[2] * 0.5;
    if (
      lx >= surf.center[0] - hx - 1e-4 &&
      lx <= surf.center[0] + hx + 1e-4 &&
      lz >= surf.center[2] - hz - 1e-4 &&
      lz <= surf.center[2] + hz + 1e-4
    ) {
      if (bestY === null || surf.topY > bestY) {
        bestY = surf.topY;
      }
    }
  }

  return bestY ?? tile.baseElevationY;
}

/**
 * Checks whether world point `(wx, wz)` falls inside an open water hazard zone
 * (unless covered by an elevated footbridge or center plinth above water level).
 */
export function isWorldPointInWaterHazard(
  course: Pick<GeneratedCityCourse, 'tiles'>,
  wx: number,
  wz: number,
): boolean {
  const lookup = worldToGrid(wx, wz);
  if (!lookup.inBounds) return true;
  const tile = course.tiles[lookup.row * GRID_COLS + lookup.col];
  if (!tile || tile.waterZones.length === 0) return false;

  const surfaceY = getTileSurfaceElevationAtWorld(tile, wx, wz);
  if (surfaceY >= ELEVATIONS.WATER_RIM_Y - 0.02) {
    return false;
  }

  const [lx, , lz] = worldToLocalPoint(
    tile.worldX,
    tile.worldZ,
    tile.rotationY,
    wx,
    0,
    wz,
  );
  for (const wzSpec of tile.waterZones) {
    if (wzSpec.shape === 'cylinder' && wzSpec.radius !== undefined) {
      const d = Math.hypot(lx - wzSpec.center[0], lz - wzSpec.center[2]);
      if (d <= wzSpec.radius) return true;
    } else if (wzSpec.shape === 'box' && wzSpec.size) {
      const hx = wzSpec.size[0] * 0.5;
      const hz = wzSpec.size[2] * 0.5;
      if (
        Math.abs(lx - wzSpec.center[0]) <= hx &&
        Math.abs(lz - wzSpec.center[2]) <= hz
      ) {
        return true;
      }
    }
  }
  return false;
}

function pointInPropHorizontalAABB(
  px: number,
  pz: number,
  aabb: AABB3D,
  margin = 0.14,
): boolean {
  return (
    px >= aabb.min[0] - margin &&
    px <= aabb.max[0] + margin &&
    pz >= aabb.min[2] - margin &&
    pz <= aabb.max[2] + margin
  );
}

/**
 * Tests whether a single deterministic club shot from `fromPos` can cleanly reach `toPos`
 * without hitting solid props, cliffs, or water hazards.
 */
export function canReachInSingleClubShot(
  course: Pick<GeneratedCityCourse, 'tiles' | 'props'>,
  fromPos: Vec3Tuple,
  toPos: Vec3Tuple,
  targetTolerance = 1.35,
): ClubId | null {
  const dx = toPos[0] - fromPos[0];
  const dz = toPos[2] - fromPos[2];
  const horizDist = Math.hypot(dx, dz);
  const dy = toPos[1] - fromPos[1];

  if (horizDist < 0.25 && Math.abs(dy) < 0.1) {
    return 'putter';
  }
  if (horizDist > 31.5) {
    return null;
  }

  const aimDir: [number, number] = [dx / horizDist, dz / horizDist];
  const origin: Vec3Tuple = [fromPos[0], fromPos[1] + BALL_RADIUS, fromPos[2]];

  // Order clubs naturally based on elevation change and distance
  const candidateClubs: ClubId[] =
    dy > 0.35
      ? ['wedge', 'driver', 'skimmer']
      : horizDist <= 9.5 && Math.abs(dy) <= 0.18
        ? ['putter', 'skimmer', 'wedge', 'driver']
        : ['driver', 'wedge', 'skimmer', 'putter'];

  const sampleGroundY = (x: number, z: number) =>
    getCourseSurfaceElevationAt(course, x, z);

  for (const clubId of candidateClubs) {
    const spec = CLUB_SPECS[clubId];
    if (clubId === 'putter' && (horizDist > 12.6 || Math.abs(dy) > 0.22)) {
      continue;
    }
    if (clubId === 'skimmer' && dy > 0.55) {
      continue;
    }

    // Coarse power sweep (7 deterministic samples) around expected fraction
    const maxNominal = Math.max(
      4,
      spec.nominalCarryMeters + spec.nominalRollMeters,
    );
    const estPower = Math.max(0.08, Math.min(1, horizDist / maxNominal));
    const powerCandidates = [
      estPower,
      Math.min(1, estPower * 1.15),
      Math.max(0.06, estPower * 0.85),
      Math.min(1, estPower * 1.32),
      Math.max(0.05, estPower * 0.7),
      0.98,
      0.5,
    ];

    for (const pwr of powerCandidates) {
      const traj = computeDeterministicTrajectory({
        origin,
        clubId,
        power: pwr,
        aimDirection: aimDir,
        sampleGroundY,
      });

      const stop = traj.estimatedStopPoint;
      const land = traj.landingPoint;

      // Check proximity of either landing (with soft check) or estimated stop to target
      const distStop = Math.hypot(stop[0] - toPos[0], stop[2] - toPos[2]);
      const distLand = Math.hypot(land[0] - toPos[0], land[2] - toPos[2]);
      const bestDist =
        clubId === 'wedge' ? Math.min(distStop, distLand * 1.05) : distStop;

      if (bestDist > targetTolerance) {
        continue;
      }

      const endCheckX = distStop <= distLand ? stop[0] : land[0];
      const endCheckZ = distStop <= distLand ? stop[2] : land[2];

      if (
        Math.abs(endCheckX) > ISLAND_HALF_SIZE - 0.5 ||
        Math.abs(endCheckZ) > ISLAND_HALF_SIZE - 0.5
      ) {
        continue;
      }
      if (isWorldPointInWaterHazard(course, land[0], land[2])) continue;
      if (isWorldPointInWaterHazard(course, stop[0], stop[2])) continue;

      const endSurfaceY = getCourseSurfaceElevationAt(
        course,
        endCheckX,
        endCheckZ,
      );
      if (Math.abs(endSurfaceY - toPos[1]) > 0.25) {
        continue;
      }

      // Verify path clearance against intermediate cliffs and prop AABBs
      let blocked = false;
      const pts = traj.arcPoints;
      for (let i = 1; i < pts.length; i++) {
        const [px, py, pz] = pts[i]!;
        const terrainY = getCourseSurfaceElevationAt(course, px, pz);

        // For ground clubs (putter / skimmer low phase), block if hitting an un-ramped cliff > 0.24m
        if (clubId === 'putter') {
          const prevPt = pts[i - 1]!;
          const prevTerrainY = getCourseSurfaceElevationAt(
            course,
            prevPt[0],
            prevPt[2],
          );
          if (terrainY - prevTerrainY > 0.18) {
            blocked = true;
            break;
          }
        } else if (i < pts.length - 2 && py - BALL_RADIUS < terrainY - 0.08) {
          blocked = true;
          break;
        }

        // Check prop collisions along flight/roll path
        for (const prop of course.props) {
          if (!pointInPropHorizontalAABB(px, pz, prop.aabb, BALL_RADIUS * 0.8)) {
            continue;
          }
          // Underpass check (hotdog cart wheel gap, scaffolding tunnel)
          const underpassH = prop.reactive?.underpassClearHeight ?? 0;
          if (
            spec.canThreadUnderpass &&
            underpassH > 0 &&
            py + BALL_RADIUS <= prop.groundY + underpassH
          ) {
            continue;
          }
          if (!prop.blocksGroundRoll && py - BALL_RADIUS <= prop.aabb.max[1] + 0.08) {
            continue;
          }
          if (
            py + BALL_RADIUS >= prop.aabb.min[1] &&
            py - BALL_RADIUS <= prop.aabb.max[1]
          ) {
            blocked = true;
            break;
          }
        }
        if (blocked) break;
      }

      if (!blocked) {
        return clubId;
      }
    }
  }

  return null;
}

interface SolverRelayNode {
  id: string;
  pos: Vec3Tuple;
}

/**
 * Computes multi-club reachability across `startTeePosition` -> all 5 flags AND all 5x4 ordered flag pairs.
 */
export function computeCourseReachability(
  course: Pick<
    GeneratedCityCourse,
    'tiles' | 'props' | 'startTeePosition' | 'flags'
  >,
): {
  edges: CourseReachabilityEdge[];
  maxStrokes: number;
  unreachablePairs: string[];
} {
  // Build clean layup relay nodes across tiles (avoiding props and water hazards)
  const relays: SolverRelayNode[] = [];
  for (const tile of course.tiles) {
    const candidateOffsets: [number, number][] = [
      [0, 0],
      [-2.8, 0],
      [2.8, 0],
      [0, -2.8],
      [0, 2.8],
    ];
    for (const [ox, oz] of candidateOffsets) {
      const wx = tile.worldX + ox;
      const wz = tile.worldZ + oz;
      if (isWorldPointInWaterHazard(course, wx, wz)) continue;
      const wy = getCourseSurfaceElevationAt(course, wx, wz);
      if (wy < ELEVATIONS.STREET_Y - 0.02) continue;

      let insideProp = false;
      for (const prop of course.props) {
        if (
          prop.blocksGroundRoll &&
          pointInPropHorizontalAABB(wx, wz, prop.aabb, 0.35)
        ) {
          insideProp = true;
          break;
        }
      }
      if (!insideProp) {
        relays.push({ id: `r-${tile.col}-${tile.row}-${ox}-${oz}`, pos: [wx, wy, wz] });
        break; // 1 clean relay per tile keeps graph compact (<= 36 relays) and ultra-fast
      }
    }
  }

  const sources: Array<{ id: 'start' | FlagColor; pos: Vec3Tuple }> = [
    { id: 'start', pos: course.startTeePosition },
    ...course.flags.map((f) => ({ id: f.color, pos: f.nextTeePosition })),
  ];

  // Precompute relay -> relay 1-stroke adjacency lazily only if needed
  let relayAdj: Map<number, Array<{ idx: number; club: ClubId }>> | null = null;
  const getRelayAdj = () => {
    if (relayAdj) return relayAdj;
    relayAdj = new Map();
    for (let i = 0; i < relays.length; i++) {
      const list: Array<{ idx: number; club: ClubId }> = [];
      for (let j = 0; j < relays.length; j++) {
        if (i === j) continue;
        const club = canReachInSingleClubShot(
          course,
          relays[i]!.pos,
          relays[j]!.pos,
          1.55,
        );
        if (club) list.push({ idx: j, club });
      }
      relayAdj.set(i, list);
    }
    return relayAdj;
  };

  const edges: CourseReachabilityEdge[] = [];
  const unreachablePairs: string[] = [];
  let maxStrokes = 0;

  for (const src of sources) {
    for (const targetFlag of course.flags) {
      if (src.id === targetFlag.color) continue;

      // 1-stroke check
      const directClub = canReachInSingleClubShot(
        course,
        src.pos,
        targetFlag.position,
        1.35,
      );
      if (directClub) {
        edges.push({
          fromId: src.id,
          toFlag: targetFlag.color,
          strokes: 1,
          recommendedClubs: [directClub],
        });
        maxStrokes = Math.max(maxStrokes, 1);
        continue;
      }

      // 2-stroke check via single layup relay
      const reachableRelaysFromSrc: Array<{ idx: number; club: ClubId }> = [];
      let found2: CourseReachabilityEdge | null = null;
      for (let rIdx = 0; rIdx < relays.length; rIdx++) {
        const c1 = canReachInSingleClubShot(
          course,
          src.pos,
          relays[rIdx]!.pos,
          1.55,
        );
        if (!c1) continue;
        reachableRelaysFromSrc.push({ idx: rIdx, club: c1 });
        const c2 = canReachInSingleClubShot(
          course,
          relays[rIdx]!.pos,
          targetFlag.position,
          1.35,
        );
        if (c2) {
          found2 = {
            fromId: src.id,
            toFlag: targetFlag.color,
            strokes: 2,
            recommendedClubs: [c1, c2],
          };
          break;
        }
      }

      if (found2) {
        edges.push(found2);
        maxStrokes = Math.max(maxStrokes, 2);
        continue;
      }

      // 3-stroke check via two layup relays
      const adj = getRelayAdj();
      let found3: CourseReachabilityEdge | null = null;
      for (const first of reachableRelaysFromSrc) {
        const neighbors = adj.get(first.idx) ?? [];
        for (const second of neighbors) {
          const c3 = canReachInSingleClubShot(
            course,
            relays[second.idx]!.pos,
            targetFlag.position,
            1.35,
          );
          if (c3) {
            found3 = {
              fromId: src.id,
              toFlag: targetFlag.color,
              strokes: 3,
              recommendedClubs: [first.club, second.club, c3],
            };
            break;
          }
        }
        if (found3) break;
      }

      if (found3) {
        edges.push(found3);
        maxStrokes = Math.max(maxStrokes, 3);
      } else {
        unreachablePairs.push(`${src.id}->${targetFlag.color}`);
        maxStrokes = 99;
      }
    }
  }

  // Ensure all 4 club constants are referenced for completeness
  void CLUB_ORDER;

  return { edges, maxStrokes, unreachablePairs };
}

/**
 * Runs all 8 Hard Exit Gate 1 validation assertions on a generated city course.
 */
export function validateGeneratedCourse(
  course: GeneratedCityCourse,
): CourseValidationResult {
  const errors: string[] = [];

  if (course.tiles.length !== GRID_COLS * GRID_ROWS) {
    errors.push(
      `Expected ${GRID_COLS * GRID_ROWS} tiles, got ${course.tiles.length}`,
    );
  }

  // 1. Edge socket mismatches across all interior tile joints
  let socketMismatches = 0;
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const tile = course.tiles[row * GRID_COLS + col];
      if (!tile) continue;

      if (col + 1 < GRID_COLS) {
        const east = course.tiles[row * GRID_COLS + (col + 1)]!;
        if (tile.sockets[1] !== east.sockets[3]) {
          socketMismatches++;
          errors.push(
            `Socket mismatch East-West between (${col},${row}) [${tile.sockets[1]}] and (${col + 1},${row}) [${east.sockets[3]}]`,
          );
        }
      }
      if (row + 1 < GRID_ROWS) {
        const south = course.tiles[(row + 1) * GRID_COLS + col]!;
        if (tile.sockets[2] !== south.sockets[0]) {
          socketMismatches++;
          errors.push(
            `Socket mismatch North-South between (${col},${row}) [${tile.sockets[2]}] and (${col},${row + 1}) [${south.sockets[0]}]`,
          );
        }
      }
    }
  }

  // 2. Continuous bankable curb / storm-drain channels along road-to-sidewalk borders
  let curbChannelDiscontinuities = 0;
  let totalRoadGutterTiles = 0;
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const tile = course.tiles[row * GRID_COLS + col];
      if (!tile) continue;
      const hasRoadOrGutterSocket = tile.sockets.some(
        (s) => s === 'asphalt_road' || s === 'curb_gutter',
      );
      if (hasRoadOrGutterSocket) {
        totalRoadGutterTiles++;
        if (tile.gutters.length === 0) {
          curbChannelDiscontinuities++;
          errors.push(
            `Tile (${col},${row}) [${tile.blueprintId}] has street/gutter socket without storm-drain gutter channel`,
          );
        }
        for (const g of tile.gutters) {
          if (
            Math.abs(g.troughY - ELEVATIONS.GUTTER_TROUGH_Y) > 1e-4 ||
            Math.abs(g.curbHeight - ELEVATIONS.CURB_HEIGHT) > 1e-4
          ) {
            curbChannelDiscontinuities++;
            errors.push(
              `Tile (${col},${row}) gutter ${g.id} violates troughY=-0.06m / curbHeight=0.15m`,
            );
          }
        }
      }
    }
  }
  if (totalRoadGutterTiles < 4) {
    curbChannelDiscontinuities++;
    errors.push(`Insufficient street/curb-gutter network (${totalRoadGutterTiles} tiles)`);
  }

  // 2b. Verify 100% of asphalt / street / curb-gutter tiles form ONE single connected road component (0 stranded asphalt patches!)
  const roadBearingTiles = course.tiles.filter(
    (t) =>
      t.category === 'road' ||
      t.category === 'gutter' ||
      t.sockets.some((s) => s === 'asphalt_road' || s === 'curb_gutter') ||
      t.surfaces.some((s) => s.kind === 'asphalt'),
  );
  if (roadBearingTiles.length > 0) {
    const roadKeySet = new Set(roadBearingTiles.map((t) => `${t.col},${t.row}`));
    const visitedRoad = new Set<string>();
    const queue: PlacedTile[] = [roadBearingTiles[0]!];
    visitedRoad.add(`${roadBearingTiles[0]!.col},${roadBearingTiles[0]!.row}`);

    const dirs: Array<[number, number, 0 | 1 | 2 | 3, 0 | 1 | 2 | 3]> = [
      [0, -1, 0, 2],
      [1, 0, 1, 3],
      [0, 1, 2, 0],
      [-1, 0, 3, 1],
    ];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const [dc, dr, sIdx, oppIdx] of dirs) {
        const nc = cur.col + dc;
        const nr = cur.row + dr;
        const nKey = `${nc},${nr}`;
        if (!roadKeySet.has(nKey) || visitedRoad.has(nKey)) continue;
        const nb = course.tiles[nr * GRID_COLS + nc]!;
        const sock = cur.sockets[sIdx];
        if (
          (sock === 'asphalt_road' || sock === 'curb_gutter') &&
          nb.sockets[oppIdx] === sock
        ) {
          visitedRoad.add(nKey);
          queue.push(nb);
        }
      }
    }

    if (visitedRoad.size !== roadBearingTiles.length) {
      curbChannelDiscontinuities++;
      errors.push(
        `Disconnected/orphaned asphalt tiles: only ${visitedRoad.size}/${roadBearingTiles.length} connected to main street network`,
      );
    }
  }

  // 2c. Verify water hazard zones form cohesive wide reflection pools/fountains (no thin <3m slits)
  for (const tile of course.tiles) {
    for (const wz of tile.waterZones) {
      if (wz.shape === 'cylinder' && (wz.radius ?? 0) < 1.5) {
        errors.push(`Water zone ${wz.id} on (${tile.col},${tile.row}) radius too narrow`);
      }
      if (wz.shape === 'box' && wz.size) {
        if (Math.min(wz.size[0], wz.size[2]) < 4.5) {
          errors.push(
            `Water zone ${wz.id} on (${tile.col},${tile.row}) is a narrow slit (${wz.size[0]}x${wz.size[2]})`,
          );
        }
      }
    }
  }

  // 3. Tier-2 greens always have either a `ramp_step` connection OR verified Wedge/Driver carry clearance
  let unreachableTier2Greens = 0;
  for (const flag of course.flags) {
    if (flag.tier === 2 || flag.elevationY >= ELEVATIONS.TERRACE_Y - 0.1) {
      const tile = course.tiles[flag.tileRow * GRID_COLS + flag.tileCol];
      let hasRampConnection = false;
      if (tile) {
        const dirs: Array<[number, number, 0 | 1 | 2 | 3, 0 | 1 | 2 | 3]> = [
          [0, -1, 0, 2],
          [1, 0, 1, 3],
          [0, 1, 2, 0],
          [-1, 0, 3, 1],
        ];
        for (const [dc, dr, sIdx, oppIdx] of dirs) {
          const nc = flag.tileCol + dc;
          const nr = flag.tileRow + dr;
          if (nc < 0 || nc >= GRID_COLS || nr < 0 || nr >= GRID_ROWS) continue;
          const nb = course.tiles[nr * GRID_COLS + nc]!;
          if (tile.sockets[sIdx] === 'ramp_step' && nb.sockets[oppIdx] === 'ramp_step') {
            hasRampConnection = true;
          }
        }
      }

      let hasAirborneCarry = false;
      for (const candidateTile of course.tiles) {
        if (candidateTile.tier === 2) continue;
        const originPos: Vec3Tuple = [
          candidateTile.worldX,
          getTileSurfaceElevationAtWorld(
            candidateTile,
            candidateTile.worldX,
            candidateTile.worldZ,
          ),
          candidateTile.worldZ,
        ];
        const club = canReachInSingleClubShot(
          course,
          originPos,
          flag.position,
          1.4,
        );
        if (club === 'wedge' || club === 'driver') {
          hasAirborneCarry = true;
          break;
        }
      }

      if (!hasRampConnection && !hasAirborneCarry) {
        unreachableTier2Greens++;
        errors.push(
          `Tier-2 flag ${flag.color} at (${flag.tileCol},${flag.tileRow}) lacks both ramp_step and Wedge/Driver carry`,
        );
      }
    }
  }

  // 4. 0 AABB overlaps across props, cups, tees, and walls
  let aabbOverlaps = 0;
  for (let i = 0; i < course.props.length; i++) {
    const pa = course.props[i]!;
    if (
      pa.aabb.min[0] < -ISLAND_HALF_SIZE + 0.1 ||
      pa.aabb.max[0] > ISLAND_HALF_SIZE - 0.1 ||
      pa.aabb.min[2] < -ISLAND_HALF_SIZE + 0.1 ||
      pa.aabb.max[2] > ISLAND_HALF_SIZE - 0.1
    ) {
      aabbOverlaps++;
      errors.push(`Prop ${pa.id} extends outside island boundary`);
    }

    for (let j = i + 1; j < course.props.length; j++) {
      const pb = course.props[j]!;
      if (aabbsOverlap3D(pa.aabb, pb.aabb)) {
        aabbOverlaps++;
        errors.push(`AABB overlap between prop ${pa.id} and ${pb.id}`);
      }
    }

    // Check against start tee AABB
    const startTeeBox: AABB3D = {
      min: [
        course.startTeePosition[0] - 0.55,
        course.startTeePosition[1] - 0.05,
        course.startTeePosition[2] - 0.55,
      ],
      max: [
        course.startTeePosition[0] + 0.55,
        course.startTeePosition[1] + 1.2,
        course.startTeePosition[2] + 0.55,
      ],
    };
    if (aabbsOverlap3D(pa.aabb, startTeeBox)) {
      aabbOverlaps++;
      errors.push(`Prop ${pa.id} overlaps startTeePosition`);
    }

    // Check against all 5 cups and nextTeePositions
    for (const flag of course.flags) {
      const cupBox: AABB3D = {
        min: [
          flag.position[0] - flag.cupRadius,
          flag.position[1] - 0.2,
          flag.position[2] - flag.cupRadius,
        ],
        max: [
          flag.position[0] + flag.cupRadius,
          flag.position[1] + 2.4,
          flag.position[2] + flag.cupRadius,
        ],
      };
      const nextTeeBox: AABB3D = {
        min: [
          flag.nextTeePosition[0] - 0.5,
          flag.nextTeePosition[1] - 0.05,
          flag.nextTeePosition[2] - 0.5,
        ],
        max: [
          flag.nextTeePosition[0] + 0.5,
          flag.nextTeePosition[1] + 1.2,
          flag.nextTeePosition[2] + 0.5,
        ],
      };
      if (aabbsOverlap3D(pa.aabb, cupBox)) {
        aabbOverlaps++;
        errors.push(`Prop ${pa.id} overlaps cup ${flag.color}`);
      }
      if (aabbsOverlap3D(pa.aabb, nextTeeBox)) {
        aabbOverlaps++;
        errors.push(`Prop ${pa.id} overlaps nextTeePosition of ${flag.color}`);
      }
    }
  }

  // 5. 0 floating meshes (`prop.position[1]` matches host surface elevation within `1e-4`)
  let floatingProps = 0;
  for (const prop of course.props) {
    const hostY = getCourseSurfaceElevationAt(
      course,
      prop.position[0],
      prop.position[2],
    );
    if (
      Math.abs(prop.position[1] - hostY) > 1e-4 ||
      Math.abs(prop.groundY - hostY) > 1e-4 ||
      Math.abs(prop.aabb.min[1] - hostY) > 1e-4
    ) {
      floatingProps++;
      errors.push(
        `Floating/sunken prop ${prop.id} (${prop.type}): posY=${prop.position[1]}, hostY=${hostY}`,
      );
    }
  }

  // 6. >= 10m Euclidean spacing between all 5 flags (and exact 5 flags / 5 distinct archetypes)
  if (course.flags.length !== 5) {
    errors.push(`Expected 5 flags, got ${course.flags.length}`);
  }
  const archetypes = new Set(course.flags.map((f) => f.archetype));
  if (archetypes.size !== 5) {
    errors.push(`Expected 5 distinct cup archetypes, got ${archetypes.size}`);
  }

  let minFlagSpacingMeters = Infinity;
  for (let i = 0; i < course.flags.length; i++) {
    for (let j = i + 1; j < course.flags.length; j++) {
      const a = course.flags[i]!;
      const b = course.flags[j]!;
      const distXZ = Math.hypot(
        a.position[0] - b.position[0],
        a.position[2] - b.position[2],
      );
      if (distXZ < minFlagSpacingMeters) {
        minFlagSpacingMeters = distXZ;
      }
      if (distXZ < 10.0) {
        errors.push(
          `Flag spacing violation between ${a.color} and ${b.color}: ${distXZ.toFixed(2)}m < 10.0m`,
        );
      }
    }
  }

  // 7. Clear 1.5m obstacle-free cup aprons around all 5 pins
  let apronViolations = 0;
  for (const flag of course.flags) {
    if (flag.apronRadius < CUP_APRON_RADIUS) {
      apronViolations++;
      errors.push(`Flag ${flag.color} apronRadius ${flag.apronRadius} < 1.5m`);
    }

    // Verify flat apron surface around 1.5m radius
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      const sx = flag.position[0] + Math.cos(ang) * 1.48;
      const sz = flag.position[2] + Math.sin(ang) * 1.48;
      const sy = getCourseSurfaceElevationAt(course, sx, sz);
      if (Math.abs(sy - flag.elevationY) > 0.03 || isWorldPointInWaterHazard(course, sx, sz)) {
        apronViolations++;
        errors.push(
          `Flag ${flag.color} apron uneven or wet at angle ${k} (y=${sy} vs ${flag.elevationY})`,
        );
        break;
      }
    }

    // Verify nextTeePosition lies flat on the apron
    const ntDist = Math.hypot(
      flag.nextTeePosition[0] - flag.position[0],
      flag.nextTeePosition[2] - flag.position[2],
    );
    const ntSurfaceY = getCourseSurfaceElevationAt(
      course,
      flag.nextTeePosition[0],
      flag.nextTeePosition[2],
    );
    if (
      ntDist < 0.5 ||
      ntDist > CUP_APRON_RADIUS ||
      Math.abs(ntSurfaceY - flag.elevationY) > 1e-3 ||
      Math.abs(flag.nextTeePosition[1] - flag.elevationY) > 1e-4
    ) {
      apronViolations++;
      errors.push(`Flag ${flag.color} nextTeePosition invalid`);
    }

    // Verify 0 props intrude into the 1.5m circle around the cup
    for (const prop of course.props) {
      const closestX = Math.max(
        prop.aabb.min[0],
        Math.min(flag.position[0], prop.aabb.max[0]),
      );
      const closestZ = Math.max(
        prop.aabb.min[2],
        Math.min(flag.position[2], prop.aabb.max[2]),
      );
      const distToProp = Math.hypot(
        flag.position[0] - closestX,
        flag.position[2] - closestZ,
      );
      if (distToProp < CUP_APRON_RADIUS) {
        apronViolations++;
        errors.push(
          `Prop ${prop.id} intrudes into 1.5m apron of ${flag.color} (${distToProp.toFixed(2)}m)`,
        );
      }
    }
  }

  // 8. Multi-club reachability (<= 3 strokes between start tee and all 5 flag pairs)
  const reach = computeCourseReachability(course);
  if (reach.unreachablePairs.length > 0 || reach.maxStrokes > 3) {
    errors.push(
      `Reachability failure (>3 strokes): ${reach.unreachablePairs.join(', ')}`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    socketMismatches,
    curbChannelDiscontinuities,
    unreachableTier2Greens,
    aabbOverlaps,
    floatingProps,
    minFlagSpacingMeters: Number.isFinite(minFlagSpacingMeters)
      ? minFlagSpacingMeters
      : 0,
    apronViolations,
    maxPairwiseStrokes: reach.maxStrokes,
  };
}
