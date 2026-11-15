'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  A_POSITION_CROSSWALK,
  GROUND_ZONES,
  HOLE_1_CUP,
  STONE_CURBS,
  STORM_DRAIN_GRATES,
  STORM_GUTTERS,
  VAN_LOADING_ZONE,
  WALKABLE_RAMPS,
} from '@/config/courseMasterPlan';
import type {
  CrosswalkLandingPadSpec,
  GroundSurfaceZoneSpec,
  HoleCupSpec,
  StoneCurbSegmentSpec,
  StormDrainGrateSpec,
  StormGutterTrackSpec,
  VanLoadingZoneSpec,
  WalkableRampSpec,
} from '@/types/course';
import { VENICE_MATERIALS } from '@/materials';
import { CupFlagAssembly } from '../tiles/CupFlagAssembly';
import {
  buildClippedSeApronGeometry,
  buildContinuousHydrantWaterSheetGeometry,
  buildNotchedWestSidewalkGeometry,
  buildRadialArcSlabGeometry,
  buildRectSlabGeometry,
  buildRectSlabWithPolygonHolesGeometry,
  buildRectSlabWithRectHoleGeometry,
  buildSeRoadSpandrelGeometry,
  buildSolidRampGeometry,
} from './streetGeometry';

/**
 * Anti-shimmer layering contract (visual-only; physics heights in config are untouched):
 *  - every decal-like layer sits >= 0.015m above its base (tier 1 = +0.015, tier 2 = +0.030)
 *  - decal materials are LOCAL clones carrying polygonOffset (tier 1: -1/-1, tier 2: -2/-2),
 *    so the shared '@/materials' set is never mutated.
 */
const DECAL_LIFT = 0.015;

function traceRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  if (typeof ctx.quadraticCurveTo === 'function') {
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    return;
  }
  ctx.rect(x, y, w, h);
}

const decalMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

function decalMat(
  src: THREE.MeshStandardMaterial,
  tier: 1 | 2 = 1,
  tint?: string,
): THREE.MeshStandardMaterial {
  const key = `${src.uuid}|${tier}|${tint ?? ''}`;
  let m = decalMaterialCache.get(key);
  if (!m) {
    m = src.clone();
    m.polygonOffset = true;
    m.polygonOffsetFactor = -tier;
    m.polygonOffsetUnits = -tier;
    if (tint) m.color.set(tint);
    decalMaterialCache.set(key, m);
  }
  return m;
}

/** Lazily-built local decal material set (module-level cache; built on first render). */
function getDecalMaterials() {
  const V = VENICE_MATERIALS;
  return {
    laneLine: decalMat(V.laneLineCream, 1),
    crosswalk: decalMat(V.crosswalkWhite, 1),
    amber: decalMat(V.loadingZoneAmber, 1),
    amberT2: decalMat(V.loadingZoneAmber, 2),
    rampCourseStone: decalMat(V.graniteCurbBevelTop, 1),
    rampCourseAccent: decalMat(V.courtyardRampCourseAccent, 1),
    curbCap: decalMat(V.graniteCurbBevelTop, 1),
    curbJoint: decalMat(V.graniteCurbJoint, 2),
    waterSheen: decalMat(V.gutterWetWaterSheen, 1),
    // Warm-palette grate set (replaces razor dark iron / slate contrast)
    grateFrame: decalMat(V.wroughtIron, 1, '#4A4247'),
    grateBasin: decalMat(V.asphaltRoadEdgeBase, 1, '#2F2B31'),
    grateBar: decalMat(V.gutterConcreteLip, 2, '#8C8479'),
  };
}

let decalMaterialSet: ReturnType<typeof getDecalMaterials> | null = null;
function decals() {
  if (!decalMaterialSet) decalMaterialSet = getDecalMaterials();
  return decalMaterialSet;
}

let patioCobbleMaterialCache: THREE.MeshStandardMaterial | null = null;
function getPatioRoughCobbleMaterial(): THREE.MeshStandardMaterial {
  if (VENICE_MATERIALS.patioRoughStone.map) {
    return VENICE_MATERIALS.patioRoughStone;
  }
  if (patioCobbleMaterialCache) return patioCobbleMaterialCache;

  const mat = VENICE_MATERIALS.patioRoughStone.clone();
  mat.flatShading = false;
  mat.roughness = 0.88;
  mat.color.set('#FFFFFF');

  if (typeof document !== 'undefined') {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Soft mossy earth mortar background
      ctx.fillStyle = '#6A764E';
      ctx.fillRect(0, 0, size, size);

      const rows = 4;
      const cols = 4;
      const cellW = size / cols;
      const cellH = size / rows;
      const stoneShades = ['#9C8C75', '#8E7F68', '#A5957E', '#83745E', '#95856E'];

      for (let r = 0; r < rows; r++) {
        const stagger = (r % 2) * (cellW * 0.5);
        for (let c = -1; c <= cols; c++) {
          const x = c * cellW + stagger + 3;
          const y = r * cellH + 3;
          const w = cellW - 6;
          const h = cellH - 6;
          const shade = stoneShades[((r * 7 + c + 12) % stoneShades.length)];

          // Outer feathered bevel halo
          ctx.fillStyle = '#7A725A';
          traceRoundRect(ctx, x - 1.5, y - 1.5, w + 3, h + 3, 6);
          ctx.fill();

          // Warm cobblestone face
          ctx.fillStyle = shade;
          traceRoundRect(ctx, x, y, w, h, 5);
          ctx.fill();

          // Subtle top-left warm highlight
          ctx.fillStyle = 'rgba(245, 232, 208, 0.14)';
          traceRoundRect(ctx, x + 2, y + 2, w - 6, h * 0.35, 3);
          ctx.fill();
        }
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 16;
      tex.needsUpdate = true;
      mat.map = tex;
      mat.needsUpdate = true;
    }
  }

  patioCobbleMaterialCache = mat;
  return mat;
}

export interface StreetSurfaceWorldProps {
  zones?: GroundSurfaceZoneSpec[];
  gutters?: StormGutterTrackSpec[];
  drainGrates?: StormDrainGrateSpec[];
  curbs?: StoneCurbSegmentSpec[];
  ramps?: WalkableRampSpec[];
  crosswalk?: CrosswalkLandingPadSpec;
  vanLoadingZone?: VanLoadingZoneSpec;
  cup?: HoleCupSpec;
  isHoleSunk?: boolean;
  /** When false, caller renders CupFlagAssembly separately so isHoleSunk never re-reconciles static street slabs. */
  includeCupAssembly?: boolean;
  showWireframe?: boolean;
}

const SLAB_FOUNDATION_BOTTOM_Y = -0.35;
/**
 * Courtyard turf layers (green / fringe / patio / limestone coping) stay FLUSH with the physics
 * surface (zone topY, coping +2mm). Instead of lifting them, the terrace slab underneath is
 * carved open under their footprints so no two horizontal faces ever overlap in plan.
 */
const COPING_RISE = 0.002;
const BORDER_W = 0.22;
/** South coping bar is 2cm narrower so it butts the south patio slab (which starts at fringe.maxZ + 0.2). */
const BORDER_SOUTH_W = 0.2;

type XZ = readonly [number, number];
type RectXZ = { minX: number; maxX: number; minZ: number; maxZ: number };

function rectPoly(r: RectXZ): XZ[] {
  return [
    [r.minX, r.minZ],
    [r.maxX, r.minZ],
    [r.maxX, r.maxZ],
    [r.minX, r.maxZ],
  ];
}

/** Hole polygons (world x,z) to carve out of the courtyard terrace slab. */
function computeTerraceHoles(
  zones: GroundSurfaceZoneSpec[],
  terrace: RectXZ,
): XZ[][] {
  const inside = (r: RectXZ) =>
    r.minX > terrace.minX &&
    r.maxX < terrace.maxX &&
    r.minZ > terrace.minZ &&
    r.maxZ < terrace.maxZ;
  const fringe = zones.find((z) => z.surfaceTag === 'green_fringe_collar');
  const patios = zones
    .filter((z) => z.surfaceTag === 'patio_rough')
    .map((z) => z.boundsXZ)
    .filter(inside);
  const holes: XZ[][] = [];

  if (fringe) {
    const f = fringe.boundsXZ;
    const A: RectXZ = {
      minX: f.minX - BORDER_W,
      maxX: f.maxX + BORDER_W,
      minZ: f.minZ - BORDER_W,
      maxZ: f.maxZ + BORDER_SOUTH_W,
    };
    if (inside(A)) {
      // A patio abutting the coping's south edge merges with it into one L-shaped window.
      const idx = patios.findIndex(
        (P) =>
          Math.abs(P.minZ - A.maxZ) < 1e-4 &&
          P.minX >= A.minX &&
          P.maxX >= A.maxX &&
          P.minX < A.maxX,
      );
      if (idx >= 0) {
        const P = patios.splice(idx, 1)[0];
        holes.push([
          [A.minX, A.minZ],
          [A.maxX, A.minZ],
          [A.maxX, A.maxZ],
          [P.maxX, A.maxZ],
          [P.maxX, P.maxZ],
          [P.minX, P.maxZ],
          [P.minX, A.maxZ],
          [A.minX, A.maxZ],
        ]);
      } else {
        holes.push(rectPoly(A));
      }
    }
  }
  for (const P of patios) holes.push(rectPoly(P));
  return holes;
}
/**
 * Curbs sit ON the sidewalk slabs (same 0.15 top, same outer wall plane). To kill the coplanar
 * top/side faces the granite body is widened 1.2cm per side and lifted 1.5cm (visual only,
 * <= 0.02m); the bevel cap rides +0.4cm above that.
 */
const CURB_TOP_Y = 0.15;
const CURB_FACE_INSET = 0.012;
const CURB_BODY_LIFT = DECAL_LIFT;
const CURB_CAP_RISE = 0.004;
/**
 * Renders the 5th Ave & Mercer Street road corridor, painted crosswalk & loading stripes,
 * continuous beveled granite curbs (including the 45°/90° SE corner billiard bank curb),
 * recessed -0.02m storm gutters + glistening hydrant water flow sheen, walkable ramps
 * with finished cheek walls, sunlit elevated courtyard terrace, two-tone mowed AstroTurf
 * putting green + fringe collar, and the recessed Hole 1 cup assembly.
 */
export const StreetSurfaceWorld = React.memo(function StreetSurfaceWorld({
  zones = GROUND_ZONES,
  gutters = STORM_GUTTERS,
  drainGrates = STORM_DRAIN_GRATES,
  curbs = STONE_CURBS,
  ramps = WALKABLE_RAMPS,
  crosswalk = A_POSITION_CROSSWALK,
  vanLoadingZone = VAN_LOADING_ZONE,
  cup = HOLE_1_CUP,
  isHoleSunk = false,
  includeCupAssembly = true,
  showWireframe = false,
}: StreetSurfaceWorldProps) {
  const seCornerGutter = useMemo(
    () => gutters.find((g) => g.kind === 'corner_90') ?? null,
    [gutters],
  );

  const westSidewalkCutouts = useMemo(
    () =>
      ramps
        .filter((r) => r.climbDirection === 'west')
        .map((r) => r.boundsXZ),
    [ramps],
  );

  const sePivotX = seCornerGutter?.arcPivot?.[0] ?? 6.2;
  const sePivotZ = seCornerGutter?.arcPivot?.[2] ?? -15.8;
  const seCenterR = seCornerGutter?.arcRadius ?? 2.425;
  const seHalfW = (seCornerGutter?.width ?? 0.45) * 0.5;
  const seInnerR = seCenterR - seHalfW; // 2.20
  const seOuterR = seCenterR + seHalfW; // 2.65
  const gutterChannelY = seCornerGutter?.channelY ?? -0.02;
  const seStartRad = seCornerGutter?.startAngleRad ?? Math.PI;
  const seEndRad = seCornerGutter?.endAngleRad ?? Math.PI * 1.5;

  const cupCutout = useMemo(
    () => ({
      x: cup.position[0],
      z: cup.position[2],
      // Wider than the 0.38m white liner (including 20-gon chord sagitta) so turf never hides the liner,
      // while staying well inside the Lip Flange outer radius (cupRadius + 0.062).
      radius: Math.max(0.28, cup.cupRadius + 0.018),
    }),
    [cup.position, cup.cupRadius],
  );

  // Build watertight procedural geometries with world-space UVs
  const zoneGeometries = useMemo(() => {
    const map = new Map<string, THREE.BufferGeometry>();

    for (const z of zones) {
      if (
        (z.surfaceTag === 'crosswalk_landing' ||
          z.surfaceTag === 'loading_zone_asphalt') &&
        !z.arcClip
      ) {
        // Markings are rendered cleanly via dedicated flush decal strips above asphalt
        continue;
      }

      if (z.id === 'zone-west-5th-sidewalk' && westSidewalkCutouts.length > 0) {
        map.set(
          z.id,
          buildNotchedWestSidewalkGeometry(
            z.boundsXZ,
            westSidewalkCutouts,
            SLAB_FOUNDATION_BOTTOM_Y,
            z.topY,
            2.2,
          ),
        );
      } else if (z.arcClip?.keepSide === 'inside') {
        map.set(
          z.id,
          buildClippedSeApronGeometry(
            z.boundsXZ,
            z.arcClip.pivotXZ[0],
            z.arcClip.pivotXZ[1],
            z.arcClip.radius,
            SLAB_FOUNDATION_BOTTOM_Y,
            z.topY,
            2.2,
          ),
        );
      } else if (z.arcClip?.keepSide === 'outside') {
        map.set(
          z.id,
          buildSeRoadSpandrelGeometry(
            z.arcClip.pivotXZ[0],
            z.arcClip.pivotXZ[1],
            z.arcClip.radius,
            z.boundsXZ.minX,
            z.boundsXZ.minZ,
            SLAB_FOUNDATION_BOTTOM_Y,
            z.topY,
            3.6,
          ),
        );
      } else if (z.surfaceTag === 'putting_green_turf') {
        // Flush with physics top; full-depth so the cup bore reads the same as before.
        map.set(
          z.id,
          buildRectSlabGeometry(
            z.boundsXZ,
            SLAB_FOUNDATION_BOTTOM_Y,
            z.topY,
            1.6,
            cupCutout,
          ),
        );
      } else if (z.surfaceTag === 'green_fringe_collar') {
        // Fringe is a frame around the putting-green window.
        const greenBounds = zones.find(
          (o) => o.surfaceTag === 'putting_green_turf',
        )?.boundsXZ;
        map.set(
          z.id,
          greenBounds
            ? buildRectSlabWithRectHoleGeometry(
                z.boundsXZ,
                greenBounds,
                SLAB_FOUNDATION_BOTTOM_Y,
                z.topY,
                1.6,
              )
            : buildRectSlabGeometry(
                z.boundsXZ,
                SLAB_FOUNDATION_BOTTOM_Y,
                z.topY,
                1.6,
                cupCutout,
              ),
        );
      } else if (z.surfaceTag === 'patio_rough') {
        map.set(
          z.id,
          buildRectSlabGeometry(
            z.boundsXZ,
            SLAB_FOUNDATION_BOTTOM_Y,
            z.topY,
            1.8,
            null,
          ),
        );
      } else if (z.surfaceTag === 'courtyard_paver') {
        // Terrace is carved open under fringe + coping + patios (they fill the windows flush).
        const holes = computeTerraceHoles(zones, z.boundsXZ);
        map.set(
          z.id,
          holes.length > 0
            ? buildRectSlabWithPolygonHolesGeometry(
                z.boundsXZ,
                holes,
                SLAB_FOUNDATION_BOTTOM_Y,
                z.topY,
                2.2,
              )
            : buildRectSlabGeometry(
                z.boundsXZ,
                SLAB_FOUNDATION_BOTTOM_Y,
                z.topY,
                2.2,
                cupCutout,
              ),
        );
      } else if (z.surfaceTag === 'road_asphalt') {
        map.set(
          z.id,
          buildRectSlabGeometry(
            z.boundsXZ,
            SLAB_FOUNDATION_BOTTOM_Y,
            z.topY,
            3.6,
            null,
          ),
        );
      } else {
        map.set(
          z.id,
          buildRectSlabGeometry(
            z.boundsXZ,
            SLAB_FOUNDATION_BOTTOM_Y,
            z.topY,
            2.2,
            null,
          ),
        );
      }
    }

    return map;
  }, [zones, westSidewalkCutouts, sePivotX, sePivotZ, seInnerR, cupCutout]);

  const seRoadSpandrelGeo = useMemo(() => {
    const roadWestX = seCornerGutter?.aabb.min[0] ?? 3.55;
    const roadNorthZ = seCornerGutter?.aabb.min[2] ?? -18.45;
    return buildSeRoadSpandrelGeometry(
      sePivotX,
      sePivotZ,
      seOuterR,
      roadWestX,
      roadNorthZ,
      SLAB_FOUNDATION_BOTTOM_Y,
      0.0,
      3.6,
    );
  }, [sePivotX, sePivotZ, seOuterR, seCornerGutter]);

  const rampGeometries = useMemo(() => {
    const map = new Map<string, THREE.BufferGeometry>();
    for (const ramp of ramps) {
      map.set(
        ramp.id,
        buildSolidRampGeometry(
          ramp.boundsXZ,
          ramp.bottomY,
          ramp.topY,
          ramp.climbDirection,
          SLAB_FOUNDATION_BOTTOM_Y,
          2.0,
        ),
      );
    }
    return map;
  }, [ramps]);

  const curvedGutterGeo = useMemo(
    () =>
      buildRadialArcSlabGeometry(
        sePivotX,
        sePivotZ,
        seInnerR,
        seOuterR,
        seStartRad,
        seEndRad,
        SLAB_FOUNDATION_BOTTOM_Y,
        seCornerGutter?.channelY ?? -0.02,
        1.4,
        48,
      ),
    [
      sePivotX,
      sePivotZ,
      seInnerR,
      seOuterR,
      seStartRad,
      seEndRad,
      seCornerGutter?.channelY,
    ],
  );

  const hydrantWaterSheetGeo = useMemo(() => {
    const hydrantGrate = drainGrates.find(
      (g) => g.id === 'storm-grate-corner-hydrant',
    );
    const mainRamp = ramps.find((r) => r.id === 'ramp-courtyard-main');
    const southStartZ = hydrantGrate
      ? Math.min(-15.66, hydrantGrate.position[2] - hydrantGrate.size[2] * 0.5 - 0.05)
      : -15.66;
    const eastEndX = mainRamp
      ? Math.min(14.15, mainRamp.boundsXZ.minX - 0.35)
      : 14.15;
    return buildContinuousHydrantWaterSheetGeometry({
      pivotX: sePivotX,
      pivotZ: sePivotZ,
      centerRadius: seCenterR,
      ribbonWidth: 0.28,
      startRad: seStartRad,
      endRad: seEndRad,
      southStartZ,
      eastEndX,
      yElevation: gutterChannelY + DECAL_LIFT,
      arcSegments: 48,
    });
  }, [
    sePivotX,
    sePivotZ,
    seCenterR,
    seStartRad,
    seEndRad,
    gutterChannelY,
    drainGrates,
    ramps,
  ]);

  const curvedCornerCurbGeo = useMemo(
    () =>
      buildRadialArcSlabGeometry(
        sePivotX,
        sePivotZ,
        seInnerR - 0.25 - CURB_FACE_INSET,
        seInnerR + CURB_FACE_INSET,
        seStartRad,
        seEndRad,
        -0.02,
        CURB_TOP_Y + CURB_BODY_LIFT,
        1.5,
        48,
      ),
    [sePivotX, sePivotZ, seInnerR, seStartRad, seEndRad],
  );

  const curvedCornerCurbCapGeo = useMemo(
    () =>
      buildRadialArcSlabGeometry(
        sePivotX,
        sePivotZ,
        seInnerR - 0.23,
        seInnerR - 0.02,
        seStartRad,
        seEndRad,
        CURB_TOP_Y + CURB_BODY_LIFT - 0.005,
        CURB_TOP_Y + CURB_BODY_LIFT + CURB_CAP_RISE,
        1.5,
        48,
      ),
    [sePivotX, sePivotZ, seInnerR, seStartRad, seEndRad],
  );

  useEffect(() => {
    return () => {
      for (const geo of zoneGeometries.values()) geo.dispose();
      for (const geo of rampGeometries.values()) geo.dispose();
      seRoadSpandrelGeo.dispose();
      curvedGutterGeo.dispose();
      hydrantWaterSheetGeo.dispose();
      curvedCornerCurbGeo.dispose();
      curvedCornerCurbCapGeo.dispose();
    };
  }, [
    zoneGeometries,
    rampGeometries,
    seRoadSpandrelGeo,
    curvedGutterGeo,
    hydrantWaterSheetGeo,
    curvedCornerCurbGeo,
    curvedCornerCurbCapGeo,
  ]);

  // Straight gutters are tiled with zero overlap: where an along-X gutter meets an along-Z
  // gutter end-to-end (centerlines share an end point) the X gutter extends by half a width
  // to own the corner square and the Z gutter is trimmed by the same amount.
  const straightGutterRects = useMemo(() => {
    const straight = gutters.filter(
      (g) => g.kind !== 'corner_90' && g.start && g.end,
    );
    const near = (a: number[], b: number[]) =>
      Math.hypot(a[0] - b[0], a[2] - b[2]) < 0.02;
    return straight.map((g) => {
      const s = g.start as number[];
      const e = g.end as number[];
      const alongX = Math.abs(e[0] - s[0]) >= Math.abs(e[2] - s[2]);
      const half = g.width * 0.5;
      const meets = (pt: number[]) =>
        straight.some((o) => {
          if (o === g) return false;
          const os = o.start as number[];
          const oe = o.end as number[];
          const oAlongX = Math.abs(oe[0] - os[0]) >= Math.abs(oe[2] - os[2]);
          return oAlongX !== alongX && (near(pt, os) || near(pt, oe));
        });
      // along-axis coordinate range (with end adjustments)
      const a0 = alongX ? Math.min(s[0], e[0]) : Math.min(s[2], e[2]);
      const a1 = alongX ? Math.max(s[0], e[0]) : Math.max(s[2], e[2]);
      const loPt = alongX
        ? s[0] <= e[0]
          ? s
          : e
        : s[2] <= e[2]
          ? s
          : e;
      const hiPt = loPt === s ? e : s;
      const sign = alongX ? 1 : -1; // X gutters extend, Z gutters trim
      const lo = a0 - (meets(loPt) ? sign * half : 0);
      const hi = a1 + (meets(hiPt) ? sign * half : 0);
      const cross = alongX ? s[2] : s[0];
      return {
        id: g.id,
        channelY: g.channelY,
        alongX,
        lo,
        hi,
        cross,
        width: g.width,
      };
    });
  }, [gutters]);

  const puttingGreenZone = useMemo(
    () => zones.find((z) => z.surfaceTag === 'putting_green_turf') ?? null,
    [zones],
  );
  const fringeZone = useMemo(
    () => zones.find((z) => z.surfaceTag === 'green_fringe_collar') ?? null,
    [zones],
  );

  const hasExplicitSpandrelZone = useMemo(
    () => zones.some((z) => z.arcClip?.keepSide === 'outside'),
    [zones],
  );

  const cupSurfaceY = puttingGreenZone?.topY ?? cup.elevationY;

  return (
    <group name="street-surface-world">
      {/* 1. Primary Playfield Zones (Asphalt, Sidewalks, Courtyard Terrace, Fringe, Putting Green) */}
      <group name="ground-zones">
        {zones.map((z) => {
          const geo = zoneGeometries.get(z.id);
          if (!geo) return null;

          let mat = VENICE_MATERIALS.sidewalkLimestone;
          if (
            z.surfaceTag === 'road_asphalt' ||
            z.arcClip?.keepSide === 'outside'
          ) {
            mat = VENICE_MATERIALS.asphaltRoadSlate;
          } else if (z.surfaceTag === 'subway_brick_plaza') {
            mat = VENICE_MATERIALS.subwayBrickPlaza;
          } else if (z.surfaceTag === 'courtyard_paver') {
            mat = VENICE_MATERIALS.courtyardPaver;
          } else if (z.surfaceTag === 'putting_green_turf') {
            mat = VENICE_MATERIALS.puttingGreenTurf;
          } else if (z.surfaceTag === 'green_fringe_collar') {
            mat = VENICE_MATERIALS.puttingGreenFringe;
          } else if (z.surfaceTag === 'patio_rough') {
            mat = getPatioRoughCobbleMaterial();
          }

          return (
            <mesh
              key={z.id}
              name={`zone-${z.id}`}
              geometry={geo}
              material={mat}
              receiveShadow
              castShadow={false}
            />
          );
        })}

        {/* Fallback SE Intersection Roadway Spandrel if master plan omits an arcClip outside zone */}
        {!hasExplicitSpandrelZone && (
          <mesh
            name="zone-se-road-spandrel"
            geometry={seRoadSpandrelGeo}
            material={VENICE_MATERIALS.asphaltRoadSlate}
            receiveShadow
          />
        )}
      </group>

      {/* 2. Subtle Road Centerline Markings, Crosswalk A-Position & Delivery Loading Stripes */}
      <StreetMarkingsOverlay
        crosswalk={crosswalk}
        vanLoadingZone={vanLoadingZone}
      />

      {/* 3. Decorative Limestone Coping Border around Putting Green Fringe & Courtyard Terrace Edge */}
      {fringeZone && (
        <PuttingGreenBorderAndTeeMarker
          bounds={fringeZone.boundsXZ}
          copingBaseY={fringeZone.topY}
        />
      )}

      {/* 4. Recessed Storm Gutters (-0.02m), Hydrant Water Flow Sheen & Drain Grates */}
      <group name="storm-gutters-and-grates">
        {gutters.map((g) => {
          if (g.kind === 'corner_90') {
            return (
              <mesh
                key={g.id}
                name={`gutter-${g.id}`}
                geometry={curvedGutterGeo}
                material={VENICE_MATERIALS.gutterConcreteChannel}
                receiveShadow
                castShadow={false}
              />
            );
          }

          const rect = straightGutterRects.find((r) => r.id === g.id);
          if (!rect) return null;
          const len = rect.hi - rect.lo;
          const mid = (rect.hi + rect.lo) * 0.5;
          const slabH = rect.channelY - SLAB_FOUNDATION_BOTTOM_Y;

          return (
            <mesh
              key={g.id}
              name={`gutter-${g.id}`}
              position={
                rect.alongX
                  ? [mid, SLAB_FOUNDATION_BOTTOM_Y + slabH * 0.5, rect.cross]
                  : [rect.cross, SLAB_FOUNDATION_BOTTOM_Y + slabH * 0.5, mid]
              }
              material={VENICE_MATERIALS.gutterConcreteChannel}
              receiveShadow
              castShadow={false}
            >
              <boxGeometry
                args={
                  rect.alongX
                    ? [len, slabH, rect.width]
                    : [rect.width, slabH, len]
                }
              />
            </mesh>
          );
        })}

        {/* Continuous single-sheet water sheen (Hydrant splash -> 90-deg corner -> Mercer gutter, stops before Courtyard Ramp) */}
        <mesh
          name="hydrant-gutter-water-flow"
          geometry={hydrantWaterSheetGeo}
          material={decals().waterSheen}
          castShadow={false}
          receiveShadow={false}
        />

        {/* Slotted Cast-Iron Storm Drain Grates */}
        {drainGrates.map((grate) => (
          <DrainGrateMesh key={grate.id} grate={grate} />
        ))}
      </group>

      {/* 5. Continuous Beveled 15cm Granite Curbs */}
      <group name="stone-curbs">
        {curbs.map((curb) => {
          if (
            (curb.kind === 'beveled_45' || curb.kind === 'curved_90') &&
            curb.arcPivotXZ
          ) {
            return (
              <group key={curb.id} name={`curb-${curb.id}`}>
                <mesh
                  geometry={curvedCornerCurbGeo}
                  material={VENICE_MATERIALS.graniteCurbStone}
                  castShadow
                  receiveShadow
                />
                <mesh
                  geometry={curvedCornerCurbCapGeo}
                  material={decals().curbCap}
                  castShadow={false}
                  receiveShadow
                />
              </group>
            );
          }

          return <StraightGraniteCurb key={curb.id} curb={curb} />;
        })}
      </group>

      {/* 6. Walkable Stone Ramps (step cheek retaining walls are rendered via ARCHITECTURAL_WALLS) */}
      <group name="walkable-ramps">
        {ramps.map((ramp) => {
          const geo = rampGeometries.get(ramp.id);
          if (!geo) return null;
          const isCourtyardRamp = ramp.surfaceTag === 'courtyard_ramp';
          return (
            <group key={ramp.id} name={`ramp-group-${ramp.id}`}>
              <mesh
                name={`ramp-${ramp.id}`}
                geometry={geo}
                material={
                  isCourtyardRamp
                    ? VENICE_MATERIALS.courtyardRampStone
                    : VENICE_MATERIALS.sidewalkLimestone
                }
                receiveShadow
              />
              {isCourtyardRamp && <CourtyardRampStoneCourses ramp={ramp} />}
            </group>
          );
        })}
      </group>

      {/* 7. Recessed Hole 1 Cup & Flag Assembly (optional when hosted outside static backdrop) */}
      {includeCupAssembly && (
        <CupFlagAssembly
          position={[cup.position[0], cupSurfaceY, cup.position[2]]}
          color={cup.flagColor}
          isSunk={isHoleSunk}
          cupRadius={cup.cupRadius}
          cupDepth={cup.cupDepth}
          poleHeight={cup.pinHeight}
        />
      )}

      {/* Optional Wireframe Helper */}
      {showWireframe && (
        <group name="street-debug-wireframes">
          {ramps.map((r) => (
            <mesh
              key={`wf-${r.id}`}
              position={[
                (r.boundsXZ.minX + r.boundsXZ.maxX) * 0.5,
                (r.bottomY + r.topY) * 0.5,
                (r.boundsXZ.minZ + r.boundsXZ.maxZ) * 0.5,
              ]}
            >
              <boxGeometry
                args={[
                  r.boundsXZ.maxX - r.boundsXZ.minX,
                  Math.max(0.08, r.topY - r.bottomY),
                  r.boundsXZ.maxZ - r.boundsXZ.minZ,
                ]}
              />
              <meshBasicMaterial color="#10B981" wireframe />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
});

function CourtyardRampStoneCourses({ ramp }: { ramp: WalkableRampSpec }) {
  const { minX, maxX, minZ, maxZ } = ramp.boundsXZ;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const riseY = ramp.topY - ramp.bottomY;
  const slopeLen = Math.hypot(spanX, riseY);
  const tiltZ =
    ramp.climbDirection === 'east'
      ? Math.atan2(riseY, spanX)
      : -Math.atan2(riseY, spanX);
  const cx = (minX + maxX) * 0.5;
  const cy = (ramp.bottomY + ramp.topY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const courseCount = 6;
  const d = decals();

  // All course pieces are mutually non-overlapping in plan (stringers | headers | runner
  // segments abut edge-to-edge), so they all live on tier 1: top = ramp surface + 0.015.
  // Box spans local y in [-0.005, +DECAL_LIFT] (centre 0.005, height 0.02).
  const layerH = DECAL_LIFT + 0.005;
  const layerY = (DECAL_LIFT - 0.005) * 0.5;

  const courses = Array.from({ length: courseCount }, (_, idx) => {
    const t = idx / (courseCount - 1) - 0.5;
    const isEnd = idx === 0 || idx === courseCount - 1;
    return { idx, lx: t * (slopeLen - 0.24), w: isEnd ? 0.16 : 0.075, isEnd };
  });

  // Runner bands only occupy the gaps BETWEEN transverse courses (no crossings).
  const runnerSegments = courses.slice(0, -1).map((c, i) => {
    const n = courses[i + 1];
    const from = c.lx + c.w * 0.5;
    const to = n.lx - n.w * 0.5;
    return { key: i, mid: (from + to) * 0.5, len: Math.max(0.05, to - from) };
  });

  return (
    <group
      name={`ramp-courses-${ramp.id}`}
      position={[cx, cy, cz]}
      rotation={[0, 0, tiltZ]}
    >
      {/* Granite Side Coping Stringers */}
      {[-1, 1].map((side) => (
        <mesh
          key={`stringer-${side}`}
          position={[0, layerY, side * (spanZ * 0.5 - 0.14)]}
          material={d.rampCourseStone}
          receiveShadow
          castShadow={false}
        >
          <boxGeometry args={[slopeLen - 0.04, layerH, 0.24]} />
        </mesh>
      ))}

      {/* Flush Transverse Stone Step-Course Header Strips */}
      {courses.map((c) => (
        <mesh
          key={`course-${c.idx}`}
          position={[c.lx, layerY, 0]}
          material={c.isEnd ? d.rampCourseStone : d.rampCourseAccent}
          receiveShadow
          castShadow={false}
        >
          <boxGeometry args={[c.w, layerH, spanZ - 0.52]} />
        </mesh>
      ))}

      {/* Central Stone Joint Runner Bands (segmented between courses) */}
      {[-spanZ * 0.24, 0, spanZ * 0.24].map((lz, jIdx) =>
        runnerSegments.map((seg) => (
          <mesh
            key={`runner-${jIdx}-${seg.key}`}
            position={[seg.mid, layerY, lz]}
            material={d.rampCourseAccent}
            receiveShadow
            castShadow={false}
          >
            <boxGeometry args={[seg.len, layerH, 0.06]} />
          </mesh>
        )),
      )}
    </group>
  );
}

function StreetMarkingsOverlay({
  crosswalk,
  vanLoadingZone,
}: {
  crosswalk: CrosswalkLandingPadSpec;
  vanLoadingZone: VanLoadingZoneSpec;
}) {
  const cwMinX = crosswalk.boundsXZ.minX;
  const cwMaxX = crosswalk.boundsXZ.maxX;
  const cwMinZ = crosswalk.boundsXZ.minZ;
  const cwMaxZ = crosswalk.boundsXZ.maxZ;
  const cwCenterZ = (cwMinZ + cwMaxZ) * 0.5;
  const cwSpanX = cwMaxX - cwMinX;
  const cwDepthZ = cwMaxZ - cwMinZ;
  const stripeCount = Math.max(5, crosswalk.stripeCount);

  const lzMinX = vanLoadingZone.boundsXZ.minX;
  const lzMaxX = vanLoadingZone.boundsXZ.maxX;
  const lzMinZ = vanLoadingZone.boundsXZ.minZ;
  const lzMaxZ = vanLoadingZone.boundsXZ.maxZ;
  const lzW = lzMaxX - lzMinX;
  const lzL = lzMaxZ - lzMinZ;
  const lzCX = (lzMinX + lzMaxX) * 0.5;
  const lzCZ = (lzMinZ + lzMaxZ) * 0.5;
  const stripeAngleRad = (vanLoadingZone.stripeAngleDeg * Math.PI) / 180;
  const d = decals();

  // Flush top-only decal planes over the road (y = 0) with polygonOffset tiers 1 & 2,
  // eliminating dark vertical extruded box walls from paint stripes.
  const t1Y = 0.004;
  const t2Y = 0.008;

  const perimW = 0.1;

  return (
    <group name="street-road-markings">
      {/* 5th Ave Dashed Centerline (interrupted cleanly across Crosswalk) */}
      {[-12.0, -7.0, -2.0, 3.0, 8.0, 13.0, 18.0, 23.0].map((zPos, i) => (
        <mesh
          key={`dash-5th-${i}`}
          position={[0, t1Y, zPos]}
          rotation={[-Math.PI * 0.5, 0, 0]}
          material={d.laneLine}
          receiveShadow
          castShadow={false}
        >
          <planeGeometry args={[0.14, 2.3]} />
        </mesh>
      ))}

      {/* Mercer St Dashed Centerline */}
      {[5.5, 9.8].map((xPos, i) => (
        <mesh
          key={`dash-mercer-${i}`}
          position={[xPos, t1Y, -22.0]}
          rotation={[-Math.PI * 0.5, 0, 0]}
          material={d.laneLine}
          receiveShadow
          castShadow={false}
        >
          <planeGeometry args={[2.2, 0.14]} />
        </mesh>
      ))}

      {/* Stop Bar before South Crosswalk */}
      <mesh
        position={[1.7, t1Y, cwMaxZ + 0.75]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        material={d.crosswalk}
        receiveShadow
        castShadow={false}
      >
        <planeGeometry args={[2.9, 0.34]} />
      </mesh>

      {/* Crosswalk A-Position 7 Crisp Zebra Bars */}
      {Array.from({ length: stripeCount }, (_, idx) => {
        const t = (idx + 0.5) / stripeCount;
        const x = cwMinX + 0.25 + t * (cwSpanX - 0.5);
        return (
          <mesh
            key={`crosswalk-bar-${idx}`}
            position={[x, t1Y, cwCenterZ]}
            rotation={[-Math.PI * 0.5, 0, 0]}
            material={d.crosswalk}
            receiveShadow
            castShadow={false}
          >
            <planeGeometry args={[0.52, cwDepthZ - 0.25]} />
          </mesh>
        );
      })}

      {/* Van Loading Zone Amber Perimeter Frame & Diagonal Stripes */}
      <group name="van-loading-zone-markings">
        {/* West line owns both corner squares; North & South lines start after it
            so the three perimeter decal strips never overlap. */}
        <mesh
          position={[lzMinX, t1Y, lzCZ]}
          rotation={[-Math.PI * 0.5, 0, 0]}
          material={d.amber}
          receiveShadow
          castShadow={false}
        >
          <planeGeometry args={[perimW, lzL + perimW]} />
        </mesh>
        <mesh
          position={[lzCX + perimW * 0.25, t1Y, lzMinZ]}
          rotation={[-Math.PI * 0.5, 0, 0]}
          material={d.amber}
          receiveShadow
          castShadow={false}
        >
          <planeGeometry args={[lzW - perimW * 0.5, perimW]} />
        </mesh>
        <mesh
          position={[lzCX + perimW * 0.25, t1Y, lzMaxZ]}
          rotation={[-Math.PI * 0.5, 0, 0]}
          material={d.amber}
          receiveShadow
          castShadow={false}
        >
          <planeGeometry args={[lzW - perimW * 0.5, perimW]} />
        </mesh>

        {/* Diagonal 38-deg Amber Loading Stripes: tier 2 over perimeter */}
        {Array.from({ length: 7 }, (_, idx) => {
          const z = lzMinZ + 0.85 + (idx / 6) * (lzL - 1.7);
          return (
            <group
              key={`lz-stripe-${idx}`}
              position={[lzCX, t2Y, z]}
              rotation={[0, -stripeAngleRad, 0]}
            >
              <mesh
                rotation={[-Math.PI * 0.5, 0, 0]}
                material={d.amberT2}
                receiveShadow
                castShadow={false}
              >
                <planeGeometry args={[lzW * 0.96, 0.16]} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

function PuttingGreenBorderAndTeeMarker({
  bounds,
  copingBaseY,
}: {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  copingBaseY: number;
}) {
  const { minX, maxX, minZ, maxZ } = bounds;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const borderW = BORDER_W;
  // South bar is trimmed so it butts the south patio slab instead of overlapping it.
  const southW = BORDER_SOUTH_W;
  // Coping top = terrace + 2mm. The terrace is carved open under this frame, so nothing
  // shares its plan area. Box runs down into the foundation (solid).
  const terraceY = copingBaseY;
  const topY = terraceY + COPING_RISE;
  const botY = SLAB_FOUNDATION_BOTTOM_Y;
  const h = topY - botY;
  const y = (topY + botY) * 0.5;
  const mat = VENICE_MATERIALS.puttingGreenStoneBorder;

  return (
    <group name="putting-green-limestone-border">
      <mesh
        position={[cx, y, minZ - borderW * 0.5]}
        material={mat}
        receiveShadow
        castShadow={false}
      >
        <boxGeometry args={[w + borderW * 2, h, borderW]} />
      </mesh>
      <mesh
        position={[cx, y, maxZ + southW * 0.5]}
        material={mat}
        receiveShadow
        castShadow={false}
      >
        <boxGeometry args={[w + borderW * 2, h, southW]} />
      </mesh>
      <mesh
        position={[minX - borderW * 0.5, y, cz]}
        material={mat}
        receiveShadow
        castShadow={false}
      >
        <boxGeometry args={[borderW, h, d]} />
      </mesh>
      <mesh
        position={[maxX + borderW * 0.5, y, cz]}
        material={mat}
        receiveShadow
        castShadow={false}
      >
        <boxGeometry args={[borderW, h, d]} />
      </mesh>
    </group>
  );
}

function StraightGraniteCurb({ curb }: { curb: StoneCurbSegmentSpec }) {
  const [sx, _, sz] = curb.size;
  const alongX = sx >= sz;
  const length = alongX ? sx : sz;
  const width = alongX ? sz : sx;
  const jointCount = Math.floor(length / 2.2);
  const d = decals();

  // Body: widened by CURB_FACE_INSET each side (no coplanar wall/top with the sidewalk slab it
  // sits on) and lifted CURB_BODY_LIFT; spans y in [-0.04, topY + lift].
  const bodyW = width + CURB_FACE_INSET * 2;
  const bodyTop = curb.topY + CURB_BODY_LIFT;
  const bodyH = bodyTop + 0.04;
  const bodyY = (bodyTop - 0.04) * 0.5;

  const capTop = bodyTop + CURB_CAP_RISE;
  const capH = 0.022;
  const capY = capTop - capH * 0.5;

  // Expansion joint scoring ribs: >= 1.5cm over the cap, >= 4cm wide.
  const jointTop = capTop + DECAL_LIFT;
  const jointBot = capTop - 0.02;
  const jointH = jointTop - jointBot;
  const jointY = (jointTop + jointBot) * 0.5;
  const jointT = 0.04;

  return (
    <group
      name={`curb-${curb.id}`}
      position={[curb.center[0], 0, curb.center[2]]}
      rotation={[0, curb.rotationY, 0]}
    >
      {/* Main Granite Curb Body extending cleanly below road/gutter so zero gaps show */}
      <mesh
        position={[0, bodyY, 0]}
        material={VENICE_MATERIALS.graniteCurbStone}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[
            alongX ? length : bodyW,
            bodyH,
            alongX ? bodyW : length,
          ]}
        />
      </mesh>

      {/* Beveled Top Granite Cap (flat 2cm plate: receives shadow, does not cast) */}
      <mesh
        position={[0, capY, 0]}
        material={d.curbCap}
        castShadow={false}
        receiveShadow
      >
        <boxGeometry
          args={[
            alongX ? length - 0.01 : width - 0.04,
            capH,
            alongX ? width - 0.04 : length - 0.01,
          ]}
        />
      </mesh>

      {/* Expansion Joint Scoring Lines */}
      {Array.from({ length: jointCount }, (_, idx) => {
        const offset = -length * 0.5 + (idx + 1) * (length / (jointCount + 1));
        return (
          <mesh
            key={`joint-${idx}`}
            position={
              alongX ? [offset, jointY, 0] : [0, jointY, offset]
            }
            material={d.curbJoint}
            castShadow={false}
            receiveShadow
          >
            <boxGeometry
              args={
                alongX
                  ? [jointT, jointH, width - 0.02]
                  : [width - 0.02, jointH, jointT]
              }
            />
          </mesh>
        );
      })}
    </group>
  );
}

function DrainGrateMesh({ grate }: { grate: StormDrainGrateSpec }) {
  const [w, _, l] = grate.size;
  const alongZ = l >= w;
  const barCount = 4;
  const d = decals();

  // All heights are local to the grate origin = gutter floor (-0.02), so
  //   rim ring top   = +0.017  (>= 0.015 over gutter slab)
  //   basin top      = +0.015  (>= 0.015 over gutter slab; plan-disjoint from the ring)
  //   bar tops       = +0.032  (>= 0.015 over BOTH ring and basin)
  const rimT = 0.05; // rim thickness (>= 3.5cm)
  const rimTop = 0.017;
  const rimBot = -0.005;
  const basinTop = 0.015;
  const basinBot = -0.005;
  const barTop = 0.032;
  const barBot = 0.0;
  const barW = 0.04; // thickened from 3.2cm
  const openW = w - rimT * 2;
  const openL = l - rimT * 2;
  const barSpan = (alongZ ? openW : openL) - 0.06;
  const barPitch = barSpan / (barCount - 1);
  const barLen = (alongZ ? l : w) * 0.88;

  return (
    <group
      name={`grate-${grate.id}`}
      position={grate.position}
      rotation={[0, grate.rotationY, 0]}
    >
      {/* Iron Frame: four rim bars (no centre slab, so it never overlaps the basin) */}
      {[
        { p: [-(w - rimT) * 0.5, 0, 0], a: [rimT, l] },
        { p: [(w - rimT) * 0.5, 0, 0], a: [rimT, l] },
        { p: [0, 0, -(l - rimT) * 0.5], a: [openW, rimT] },
        { p: [0, 0, (l - rimT) * 0.5], a: [openW, rimT] },
      ].map((r, i) => (
        <mesh
          key={`rim-${i}`}
          position={[r.p[0], (rimTop + rimBot) * 0.5, r.p[2]]}
          material={d.grateFrame}
          receiveShadow
          castShadow={false}
        >
          <boxGeometry args={[r.a[0], rimTop - rimBot, r.a[1]]} />
        </mesh>
      ))}

      {/* Dark Drain Basin filling the frame opening */}
      <mesh
        position={[0, (basinTop + basinBot) * 0.5, 0]}
        material={d.grateBasin}
        receiveShadow
        castShadow={false}
      >
        <boxGeometry args={[openW, basinTop - basinBot, openL]} />
      </mesh>

      {/* Longitudinal Cast-Iron Grate Slats (4cm wide) */}
      {Array.from({ length: barCount }, (_, idx) => {
        const off = (idx - (barCount - 1) * 0.5) * barPitch;
        return (
          <mesh
            key={`bar-${idx}`}
            position={
              alongZ
                ? [off, (barTop + barBot) * 0.5, 0]
                : [0, (barTop + barBot) * 0.5, off]
            }
            material={d.grateBar}
            receiveShadow
            castShadow={false}
          >
            <boxGeometry
              args={
                alongZ
                  ? [barW, barTop - barBot, barLen]
                  : [barLen, barTop - barBot, barW]
              }
            />
          </mesh>
        );
      })}
    </group>
  );
}
