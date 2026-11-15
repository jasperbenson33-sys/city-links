'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  ARCHITECTURAL_WALLS,
  COURTYARD_PERGOLA,
  OUTER_CITY_GROUND_SKIRT,
  SKYLINE_BACKDROPS,
  STRING_LIGHT_SPANS,
} from '@/config/courseMasterPlan';
import type {
  ArchitecturalWallSpec,
  CourtyardPergolaSpec,
  PerimeterBuildingSpec,
  StringLightSpanSpec,
  SubwayVaultEnclosureSpec,
} from '@/types/course';
import { VENICE_MATERIALS } from '@/materials';
import {
  buildRectSlabWithPolygonHolesGeometry,
  type RectBoundsXZ,
} from '../street/streetGeometry';

// ---------------------------------------------------------------------------
// Anti-shimmer helpers: local (memoized) material variants. Shared '@/materials'
// instances are NEVER mutated; decal/thin-edge variants are cloned once at module scope.
// ---------------------------------------------------------------------------

/** Layered surfaces sit >= this far (m) above their base plane. */
const DECAL_LIFT = 0.015;

const layeredMaterialCache = new WeakMap<THREE.Material, Map<string, THREE.Material>>();

/**
 * Memoized clone of `base` with polygonOffset. tier 1 => -1/-1 (first layer over base),
 * tier 2 => -2/-2 (second layer). Negative tiers push the surface toward the camera;
 * `pushBack` (positive offset) is used for huge base planes like the horizon apron.
 */
function layeredMaterial<T extends THREE.Material>(base: T, tier: 1 | 2 | -1): T {
  let perBase = layeredMaterialCache.get(base);
  if (!perBase) {
    perBase = new Map();
    layeredMaterialCache.set(base, perBase);
  }
  const key = String(tier);
  let variant = perBase.get(key);
  if (!variant) {
    variant = base.clone();
    variant.polygonOffset = true;
    const f = tier === -1 ? 1 : -tier;
    variant.polygonOffsetFactor = f;
    variant.polygonOffsetUnits = f;
    perBase.set(key, variant);
  }
  return variant as T;
}

/** Softened warm-charcoal variants of razor-dark thin-element materials (rails, pickets, cords). */
function softenedThinMaterial(
  base: THREE.MeshStandardMaterial,
  color: string,
  metalness: number,
  roughness: number,
): THREE.MeshStandardMaterial {
  const m = base.clone();
  m.color.set(color);
  m.metalness = metalness;
  m.roughness = roughness;
  return m;
}

const THIN_IRON_MAT = softenedThinMaterial(VENICE_MATERIALS.wroughtIron, '#403A3C', 0.28, 0.62);
const THIN_CORD_MAT = softenedThinMaterial(VENICE_MATERIALS.stringLightCord, '#56473E', 0.05, 0.78);
const BAY_PANEL_DECAL_MAT = layeredMaterial(VENICE_MATERIALS.stuccoTerracottaDeep, 1);
const WINDOW_LIT_DECAL_MAT = layeredMaterial(VENICE_MATERIALS.windowWarmLit, 1);
const WINDOW_DARK_DECAL_MAT = layeredMaterial(VENICE_MATERIALS.windowDarkGlass, 1);
const SKYLINE_MULLION_MAT = layeredMaterial(VENICE_MATERIALS.storefrontTimber, 2);
const HORIZON_APRON_MAT = layeredMaterial(VENICE_MATERIALS.horizonEarthApron, -1);
const SUBWAY_CERAMIC_CREAM_MAT = new THREE.MeshStandardMaterial({
  color: '#F1ECE0',
  roughness: 0.34,
  metalness: 0.05,
});
const SUBWAY_CERAMIC_EMERALD_MAT = new THREE.MeshStandardMaterial({
  color: '#1E6B52',
  roughness: 0.3,
  metalness: 0.08,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});
const SUBWAY_COPING_DARK_MAT = new THREE.MeshStandardMaterial({
  color: '#2A433C',
  roughness: 0.5,
  metalness: 0.14,
});
const OCULUS_DAYLIGHT_PANE_MAT = new THREE.MeshStandardMaterial({
  color: '#FFF6DE',
  emissive: '#FFE8B0',
  emissiveIntensity: 1.45,
  roughness: 0.25,
  metalness: 0.05,
  side: THREE.DoubleSide,
});
const OCULUS_REVEAL_MAT = new THREE.MeshStandardMaterial({
  color: '#D8CFBC',
  emissive: '#6E5A38',
  emissiveIntensity: 0.28,
  roughness: 0.65,
  metalness: 0.08,
});
const VIADUCT_BALUSTRADE_MAT = new THREE.MeshStandardMaterial({
  color: '#DFD2BA',
  roughness: 0.8,
  metalness: 0.03,
});
const PATINATED_CANOPY_MAT = new THREE.MeshStandardMaterial({
  color: '#3D7868',
  roughness: 0.42,
  metalness: 0.34,
});

interface WallAbut {
  negX: number;
  posX: number;
  negZ: number;
  posZ: number;
  /** Height drop (m) applied to the later wall of an abutting pair so coping tops never share a plane. */
  drop: number;
}

/**
 * Detects gap=0 abutting walls (axis-aligned) and returns per-wall end-cap overlap extensions
 * (tucks the end-cap 1.5cm inside the neighbour) plus a top drop for the later wall.
 */
function computeWallAbuts(walls: ArchitecturalWallSpec[]): Map<string, WallAbut> {
  const out = new Map<string, WallAbut>();
  const TOUCH = 0.011;
  const boxes = walls.map((w) => {
    const axisAligned = Math.abs(Math.sin(w.rotationY)) < 1e-6;
    const swapped = Math.abs(Math.cos(w.rotationY)) < 1e-6;
    const sx = swapped ? w.size[2] : w.size[0];
    const sz = swapped ? w.size[0] : w.size[2];
    return {
      ok: axisAligned || swapped,
      min: [w.center[0] - sx / 2, w.center[1] - w.size[1] / 2, w.center[2] - sz / 2],
      max: [w.center[0] + sx / 2, w.center[1] + w.size[1] / 2, w.center[2] + sz / 2],
      spanAxis: sz > sx ? 2 : 0,
    };
  });
  walls.forEach((w, i) => {
    const a = boxes[i]!;
    const abut: WallAbut = { negX: 0, posX: 0, negZ: 0, posZ: 0, drop: 0 };
    let touched = false;
    if (a.ok) {
      boxes.forEach((b, j) => {
        if (i === j || !b.ok) return;
        for (const axis of [0, 2] as const) {
          const gapPos = b.min[axis]! - a.max[axis]!;
          const gapNeg = a.min[axis]! - b.max[axis]!;
          const other = axis === 0 ? 2 : 0;
          const overlapOther =
            Math.min(a.max[other]!, b.max[other]!) - Math.max(a.min[other]!, b.min[other]!);
          const overlapY = Math.min(a.max[1]!, b.max[1]!) - Math.max(a.min[1]!, b.min[1]!);
          if (overlapOther <= 0.005 || overlapY <= 0.005) continue;
          const touchPos = Math.abs(gapPos) <= TOUCH;
          const touchNeg = Math.abs(gapNeg) <= TOUCH;
          if (!touchPos && !touchNeg) continue;
          touched = true;
          if (j < i) abut.drop = DECAL_LIFT;
          // Only tuck the end-cap when the touching face is this wall's own end-cap (span axis).
          if (axis !== a.spanAxis) continue;
          if (axis === 0) {
            if (touchPos) abut.posX = DECAL_LIFT;
            if (touchNeg) abut.negX = DECAL_LIFT;
          } else {
            if (touchPos) abut.posZ = DECAL_LIFT;
            if (touchNeg) abut.negZ = DECAL_LIFT;
          }
        }
      });
    }
    if (touched) out.set(w.id, abut);
  });
  return out;
}

/** Deterministic tiny per-tower height nudge so adjacent skyline slabs never share a top plane. */
function towerHeightNudge(id: string): number {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return (sum % 7) * DECAL_LIFT;
}

function getSkylineMaterial(
  palette: PerimeterBuildingSpec['palette'],
): THREE.MeshStandardMaterial {
  switch (palette) {
    case 'terracotta':
      return VENICE_MATERIALS.skylineTerracotta;
    case 'ochre':
      return VENICE_MATERIALS.skylineOchre;
    case 'warm_brick':
      return VENICE_MATERIALS.skylineBrick;
    case 'cream_limestone':
    case 'sage_trim':
    default:
      return VENICE_MATERIALS.skylineLimestone;
  }
}

function getSkylineRoofMaterial(
  roofStyle: PerimeterBuildingSpec['roofStyle'],
): THREE.MeshStandardMaterial {
  if (roofStyle === 'mansard_slate') return VENICE_MATERIALS.roofMansardSlate;
  if (roofStyle === 'cornice_parapet') return VENICE_MATERIALS.roofTarFlat;
  return VENICE_MATERIALS.roofTerracottaTile;
}

/**
 * Renders courtyard and subway plaza architectural walls directly from CAD specs.
 */
export function ArchitecturalWallsGroup({
  walls = ARCHITECTURAL_WALLS,
  subwayStationVault,
  showWireframe = false,
}: {
  walls?: ArchitecturalWallSpec[];
  subwayStationVault?: SubwayVaultEnclosureSpec;
  showWireframe?: boolean;
}) {
  const abuts = useMemo(() => computeWallAbuts(walls), [walls]);
  return (
    <group name="architectural-walls-group">
      {walls.map((wall) => (
        <ArchitecturalWallMesh
          key={wall.id}
          wall={wall}
          abut={abuts.get(wall.id)}
          subwayStationVault={subwayStationVault}
          showWireframe={showWireframe}
        />
      ))}
    </group>
  );
}

function ArchitecturalWallMesh({
  wall,
  abut,
  subwayStationVault,
  showWireframe,
}: {
  wall: ArchitecturalWallSpec;
  abut?: WallAbut;
  subwayStationVault?: SubwayVaultEnclosureSpec;
  showWireframe: boolean;
}) {
  // Abutting end-caps are tucked 1.5cm into the neighbour (hidden) and the later wall's top is
  // dropped 1.5cm so coping/pilaster tops never share an identical coplanar plane.
  const extNegX = abut?.negX ?? 0;
  const extPosX = abut?.posX ?? 0;
  const extNegZ = abut?.negZ ?? 0;
  const extPosZ = abut?.posZ ?? 0;
  const width = wall.size[0] + extNegX + extPosX;
  const depth = wall.size[2] + extNegZ + extPosZ;
  const centerX = wall.center[0] + (extPosX - extNegX) * 0.5;
  const centerZ = wall.center[2] + (extPosZ - extNegZ) * 0.5;
  const baseY = Math.min(wall.groundY, wall.center[1] - wall.size[1] * 0.5);
  const topY = wall.topY - (abut?.drop ?? 0);
  const totalHeight = Math.max(0.25, topY - baseY);

  if (wall.kind === 'wrought_iron_planter_wall') {
    // Ground masonry base cleanly from wall.groundY up through courtyard level (0.60m)
    // and place coping + wrought-iron rail + low greenery strictly <= wall.topY.
    const visibleTerraceY = Math.max(baseY, 0.6);
    const masonryTopY = Math.min(topY - 0.16, Math.max(baseY + 0.24, visibleTerraceY + 0.14));
    const masonryH = Math.max(0.14, masonryTopY - baseY);
    const copingH = 0.055;
    const copingTopY = Math.min(topY - 0.08, masonryTopY + copingH);
    const railH = Math.max(0.06, topY - copingTopY);
    const postCount = Math.max(3, Math.round(width / 1.1) + 1);
    const picketCount = Math.max(12, Math.round(width / 0.16));

    return (
      <group
        name={`wall-${wall.id}`}
        position={[centerX, 0, centerZ]}
        rotation={[0, wall.rotationY, 0]}
      >
        {/* Limestone planter wall base */}
        <mesh
          position={[0, baseY + masonryH * 0.5, 0]}
          material={VENICE_MATERIALS.stuccoCreamDeep}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[width, masonryH, depth]} />
        </mesh>

        {/* Molded stone coping ledge */}
        <mesh
          position={[0, masonryTopY + copingH * 0.5, 0]}
          material={VENICE_MATERIALS.graniteCurbBevelTop}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[width + 0.05, copingH, depth + 0.06]} />
        </mesh>

        {/* Low terracotta planter soil & clipped courtyard boxwood strip (strictly <= topY) */}
        <mesh
          position={[0, copingTopY + railH * 0.34, 0.05]}
          material={VENICE_MATERIALS.pergolaVineLeaf}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[width - 0.34, Math.max(0.06, railH * 0.58), depth * 0.45]} />
        </mesh>

        {/* Blossom clusters nestled into planter hedge */}
        {Array.from({ length: Math.max(4, Math.floor(width / 0.75)) }, (_, idx) => {
          const px = -width * 0.42 + (idx / Math.max(1, Math.floor(width / 0.75) - 1)) * width * 0.84;
          return (
            <mesh
              key={`blossom-${idx}`}
              position={[px, copingTopY + railH * 0.66, 0.05]}
              material={
                idx % 2 === 0
                  ? VENICE_MATERIALS.flowerBoxBlossomCoral
                  : VENICE_MATERIALS.flowerBoxBlossomGold
              }
              castShadow={false}
            >
              <dodecahedronGeometry args={[0.048, 0]} />
            </mesh>
          );
        })}

        {/* Wrought-iron top handrail (top at wall.topY - 0.001; posts/pickets end inside it) */}
        <mesh
          position={[0, topY - 0.022, -depth * 0.18]}
          material={THIN_IRON_MAT}
          castShadow={false}
        >
          <boxGeometry args={[width, 0.042, 0.07]} />
        </mesh>

        {/* Lower horizontal iron bar (distinct half-thickness vs pickets 0.018 / posts 0.03) */}
        <mesh
          position={[0, copingTopY + 0.045, -depth * 0.18]}
          material={THIN_IRON_MAT}
          castShadow={false}
        >
          <boxGeometry args={[width - 0.04, 0.036, 0.045]} />
        </mesh>

        {/* Wrought-iron stanchion posts */}
        {Array.from({ length: postCount }, (_, idx) => {
          const t = postCount === 1 ? 0.5 : idx / (postCount - 1);
          const x = -width * 0.48 + t * width * 0.96;
          return (
            <group key={`post-${idx}`} position={[x, 0, -depth * 0.18]}>
              <mesh
                position={[0, copingTopY + (railH - 0.022) * 0.5, 0]}
                material={THIN_IRON_MAT}
                castShadow={false}
              >
                <boxGeometry args={[0.06, railH - 0.022, 0.06]} />
              </mesh>
              <mesh
                position={[0, baseY + masonryH * 0.5 + 0.02, depth * 0.18]}
                material={VENICE_MATERIALS.stuccoCreamLimestone}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[0.22, masonryH + 0.04, depth + 0.02]} />
              </mesh>
            </group>
          );
        })}

        {/* Vertical iron pickets */}
        {Array.from({ length: picketCount }, (_, idx) => {
          const t = (idx + 0.5) / picketCount;
          const x = -width * 0.47 + t * width * 0.94;
          return (
            <mesh
              key={`picket-${idx}`}
              position={[x, copingTopY + railH * 0.48, -depth * 0.18]}
              material={THIN_IRON_MAT}
              castShadow={false}
            >
              <boxGeometry args={[0.036, Math.max(0.04, railH - 0.04), 0.036]} />
            </mesh>
          );
        })}

        {showWireframe && (
          <mesh position={[0, baseY + totalHeight * 0.5, 0]}>
            <boxGeometry args={[width, totalHeight, depth]} />
            <meshBasicMaterial color="#F59E0B" wireframe />
          </mesh>
        )}
      </group>
    );
  }

  // Axis-aligned ramp cheek walls & courtyard retaining steps (always oriented along dominant span)
  const alongZ = depth > width;
  const spanLen = alongZ ? depth : width;
  const wallThick = alongZ ? width : depth;

  if (wall.kind === 'subway_vault_ceiling_slab') {
    const isMainSubwayCeiling =
      wall.id === 'wall-z7-vault-ceiling-slab' && Boolean(subwayStationVault);
    const slabH = Math.max(0.22, totalHeight);
    return (
      <SubwayCeilingSlabMesh
        wall={wall}
        width={width}
        depth={depth}
        centerX={centerX}
        centerZ={centerZ}
        baseY={baseY}
        topY={topY}
        slabH={slabH}
        lightShafts={
          isMainSubwayCeiling ? subwayStationVault?.lightShafts : undefined
        }
        showWireframe={showWireframe}
      />
    );
  }

  if (wall.kind === 'subway_ceramic_vault_wall') {
    const bodyH = Math.max(0.3, totalHeight - 0.14);
    const dadoY = Math.min(topY - 0.35, baseY + Math.min(bodyH * 0.42, 1.45));
    const pilasterCount = Math.max(2, Math.min(8, Math.round(spanLen / 5.5) + 1));
    return (
      <group
        name={`wall-${wall.id}`}
        position={[centerX, 0, centerZ]}
        rotation={[0, wall.rotationY, 0]}
      >
        <mesh
          position={[0, baseY + bodyH * 0.5, 0]}
          material={SUBWAY_CERAMIC_CREAM_MAT}
          receiveShadow
        >
          <boxGeometry args={[width, bodyH, depth]} />
        </mesh>
        {/* Emerald ceramic dado wainscoting band (proud 1.8cm + polygonOffset) */}
        <mesh
          position={[0, dadoY, 0]}
          material={SUBWAY_CERAMIC_EMERALD_MAT}
          receiveShadow
        >
          <boxGeometry
            args={[
              alongZ ? width + 0.036 : width - 0.02,
              0.28,
              alongZ ? depth - 0.02 : depth + 0.036,
            ]}
          />
        </mesh>
        {/* Molded dark green base plinth + upper cornice band */}
        <mesh
          position={[0, baseY + 0.11, 0]}
          material={SUBWAY_COPING_DARK_MAT}
          receiveShadow
        >
          <boxGeometry args={[width + 0.05, 0.22, depth + 0.05]} />
        </mesh>
        <mesh
          position={[0, topY - 0.07, 0]}
          material={SUBWAY_COPING_DARK_MAT}
          receiveShadow
        >
          <boxGeometry args={[width + 0.06, 0.14, depth + 0.06]} />
        </mesh>
        {Array.from({ length: pilasterCount }, (_, idx) => {
          const t = pilasterCount === 1 ? 0.5 : idx / (pilasterCount - 1);
          const off = -spanLen * 0.46 + t * spanLen * 0.92;
          return (
            <mesh
              key={`sub-pil-${idx}`}
              position={
                alongZ ? [0, baseY + bodyH * 0.5, off] : [off, baseY + bodyH * 0.5, 0]
              }
              material={SUBWAY_CERAMIC_CREAM_MAT}
              receiveShadow
            >
              <boxGeometry
                args={alongZ ? [wallThick + 0.08, bodyH, 0.42] : [0.42, bodyH, wallThick + 0.08]}
              />
            </mesh>
          );
        })}
        {showWireframe && (
          <mesh position={[0, baseY + totalHeight * 0.5, 0]}>
            <boxGeometry args={[width, totalHeight, depth]} />
            <meshBasicMaterial color="#10B981" wireframe />
          </mesh>
        )}
      </group>
    );
  }

  if (wall.kind === 'subway_stair_parapet') {
    const bodyH = Math.max(0.24, totalHeight - 0.08);
    return (
      <group
        name={`wall-${wall.id}`}
        position={[centerX, 0, centerZ]}
        rotation={[0, wall.rotationY, 0]}
      >
        <mesh
          position={[0, baseY + bodyH * 0.5, 0]}
          material={SUBWAY_CERAMIC_CREAM_MAT}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[width, bodyH, depth]} />
        </mesh>
        <mesh
          position={[0, topY - 0.18, 0]}
          material={SUBWAY_CERAMIC_EMERALD_MAT}
          receiveShadow
        >
          <boxGeometry args={[width + 0.032, 0.14, depth + 0.032]} />
        </mesh>
        <mesh
          position={[0, topY - 0.04, 0]}
          material={VENICE_MATERIALS.graniteCurbBevelTop}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[width + 0.07, 0.08, depth + 0.07]} />
        </mesh>
        {showWireframe && (
          <mesh position={[0, baseY + totalHeight * 0.5, 0]}>
            <boxGeometry args={[width, totalHeight, depth]} />
            <meshBasicMaterial color="#10B981" wireframe />
          </mesh>
        )}
      </group>
    );
  }

  if (wall.kind === 'viaduct_limestone_balustrade') {
    const plinthH = Math.min(0.24, totalHeight * 0.25);
    const copingH = 0.11;
    const balH = Math.max(0.18, totalHeight - plinthH - copingH);
    const pierCount = Math.max(2, Math.min(6, Math.round(spanLen / 4.2) + 1));
    const balusterCount = Math.max(4, Math.min(18, Math.round(spanLen / 0.8)));
    return (
      <group
        name={`wall-${wall.id}`}
        position={[centerX, 0, centerZ]}
        rotation={[0, wall.rotationY, 0]}
      >
        <mesh
          position={[0, baseY + plinthH * 0.5, 0]}
          material={VIADUCT_BALUSTRADE_MAT}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[width, plinthH, depth]} />
        </mesh>
        {Array.from({ length: balusterCount }, (_, idx) => {
          const off =
            -spanLen * 0.45 + ((idx + 0.5) / balusterCount) * spanLen * 0.9;
          return (
            <mesh
              key={`baluster-${idx}`}
              position={
                alongZ
                  ? [0, baseY + plinthH + balH * 0.5, off]
                  : [off, baseY + plinthH + balH * 0.5, 0]
              }
              material={VIADUCT_BALUSTRADE_MAT}
              castShadow
              receiveShadow
            >
              <cylinderGeometry args={[0.07, 0.09, balH, 8]} />
            </mesh>
          );
        })}
        {Array.from({ length: pierCount }, (_, idx) => {
          const off =
            pierCount === 1 ? 0 : (-0.48 + (idx / (pierCount - 1)) * 0.96) * spanLen;
          return (
            <mesh
              key={`vpier-${idx}`}
              position={
                alongZ
                  ? [0, baseY + totalHeight * 0.5, off]
                  : [off, baseY + totalHeight * 0.5, 0]
              }
              material={VENICE_MATERIALS.stuccoCreamLimestone}
              castShadow
              receiveShadow
            >
              <boxGeometry
                args={
                  alongZ
                    ? [wallThick + 0.08, totalHeight - 0.04, 0.28]
                    : [0.28, totalHeight - 0.04, wallThick + 0.08]
                }
              />
            </mesh>
          );
        })}
        <mesh
          position={[0, topY - copingH * 0.5, 0]}
          material={VENICE_MATERIALS.graniteCurbBevelTop}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[width + 0.08, copingH, depth + 0.08]} />
        </mesh>
        {showWireframe && (
          <mesh position={[0, baseY + totalHeight * 0.5, 0]}>
            <boxGeometry args={[width, totalHeight, depth]} />
            <meshBasicMaterial color="#F59E0B" wireframe />
          </mesh>
        )}
      </group>
    );
  }

  if (wall.kind === 'rooftop_brick_parapet') {
    const bodyH = Math.max(0.18, totalHeight - 0.075);
    const copingH = 0.075;
    const pilCount = Math.max(2, Math.min(6, Math.round(spanLen / 3.4) + 1));
    return (
      <group
        name={`wall-${wall.id}`}
        position={[centerX, 0, centerZ]}
        rotation={[0, wall.rotationY, 0]}
      >
        <mesh
          position={[0, baseY + bodyH * 0.5, 0]}
          material={VENICE_MATERIALS.brickBrownstone}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[width, bodyH, depth]} />
        </mesh>
        <mesh
          position={[0, topY - copingH * 0.5, 0]}
          material={VENICE_MATERIALS.graniteCurbBevelTop}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[width + 0.07, copingH, depth + 0.07]} />
        </mesh>
        {Array.from({ length: pilCount }, (_, idx) => {
          const off =
            pilCount === 1 ? 0 : (-0.46 + (idx / (pilCount - 1)) * 0.92) * spanLen;
          return (
            <mesh
              key={`roof-pil-${idx}`}
              position={
                alongZ
                  ? [0, baseY + bodyH * 0.5, off]
                  : [off, baseY + bodyH * 0.5, 0]
              }
              material={VENICE_MATERIALS.brickBrownstone}
              castShadow
            >
              <boxGeometry
                args={
                  alongZ
                    ? [wallThick + 0.08, bodyH, 0.28]
                    : [0.28, bodyH, wallThick + 0.08]
                }
              />
            </mesh>
          );
        })}
        {showWireframe && (
          <mesh position={[0, baseY + totalHeight * 0.5, 0]}>
            <boxGeometry args={[width, totalHeight, depth]} />
            <meshBasicMaterial color="#F59E0B" wireframe />
          </mesh>
        )}
      </group>
    );
  }

  const isRampOrStepWall =
    wall.kind === 'courtyard_boundary_wall' ||
    wall.id.startsWith('wall-ramp-') ||
    wall.id.includes('step');

  if (isRampOrStepWall) {
    const bodyH = Math.max(0.18, totalHeight - 0.06);
    const copingH = 0.06;
    const pilasterCount = Math.max(2, Math.round(spanLen / 2.2) + 1);

    return (
      <group
        name={`wall-${wall.id}`}
        position={[centerX, 0, centerZ]}
        rotation={[0, wall.rotationY, 0]}
      >
        {/* Limestone / Ramp Cheek Masonry Body */}
        <mesh
          position={[0, baseY + bodyH * 0.5, 0]}
          material={VENICE_MATERIALS.courtyardTerraceSideStone}
          castShadow
          receiveShadow
        >
          <boxGeometry
            args={alongZ ? [wallThick, bodyH, spanLen] : [spanLen, bodyH, wallThick]}
          />
        </mesh>

        {/* Beveled Granite Coping Cap flush at topY */}
        <mesh
          position={[0, baseY + bodyH + copingH * 0.5, 0]}
          material={VENICE_MATERIALS.graniteCurbBevelTop}
          castShadow
          receiveShadow
        >
          <boxGeometry
            args={
              alongZ
                ? [wallThick + 0.03, copingH, spanLen + 0.02]
                : [spanLen + 0.02, copingH, wallThick + 0.03]
            }
          />
        </mesh>

        {/* Subtle Cheek Wall Stone Pilaster Buttresses */}
        {Array.from({ length: pilasterCount }, (_, idx) => {
          const t = pilasterCount === 1 ? 0.5 : idx / (pilasterCount - 1);
          const offset = -spanLen * 0.46 + t * spanLen * 0.92;
          return (
            <mesh
              key={`cheek-pil-${idx}`}
              position={
                alongZ
                  ? [0, baseY + (totalHeight - 0.03) * 0.5, offset]
                  : [offset, baseY + (totalHeight - 0.03) * 0.5, 0]
              }
              material={VENICE_MATERIALS.stuccoCreamDeep}
              castShadow
              receiveShadow
            >
              {/* Top sits 3cm inside the coping (never coplanar with coping top); sides 2cm proud of coping */}
              <boxGeometry
                args={
                  alongZ
                    ? [wallThick + 0.07, totalHeight - 0.03, 0.24]
                    : [0.24, totalHeight - 0.03, wallThick + 0.07]
                }
              />
            </mesh>
          );
        })}

        {showWireframe && (
          <mesh position={[0, baseY + totalHeight * 0.5, 0]}>
            <boxGeometry args={[width, totalHeight, depth]} />
            <meshBasicMaterial color="#F59E0B" wireframe />
          </mesh>
        )}
      </group>
    );
  }

  // Default: Subway Plaza / Masonry Retaining Wall with pilasters, recessed blind arches, coping & crest balustrade
  const bodyH = Math.max(0.4, totalHeight - 0.16);
  const copingH = 0.095;
  const pilasterCount = Math.max(3, Math.round(spanLen / 2.6) + 1);
  const bayCount = pilasterCount - 1;
  const baySpan = spanLen / Math.max(1, bayCount);

  return (
    <group
      name={`wall-${wall.id}`}
      position={[centerX, 0, centerZ]}
      rotation={[0, wall.rotationY, 0]}
    >
      {/* Granite plinth base */}
      <mesh
        position={[0, baseY + 0.11, 0]}
        material={VENICE_MATERIALS.graniteCurbStone}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={
            alongZ
              ? [wallThick + 0.1, 0.22, spanLen + 0.08]
              : [spanLen + 0.08, 0.22, wallThick + 0.1]
          }
        />
      </mesh>

      {/* Main masonry retaining wall */}
      <mesh
        position={[0, baseY + bodyH * 0.5, 0]}
        material={VENICE_MATERIALS.brickBrownstone}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[width, bodyH, depth]} />
      </mesh>

      {/* Recessed Venetian blind-arch limestone bays along both main faces (X or Z axis) */}
      {Array.from({ length: bayCount }, (_, bIdx) => {
        const offset = -spanLen * 0.5 + (bIdx + 0.5) * baySpan;
        const archW = Math.max(0.85, baySpan * 0.62);
        const archH = Math.max(0.32, bodyH - 0.34);
        return (
          <group
            key={`ret-bay-${bIdx}`}
            position={alongZ ? [0, baseY + 0.24, offset] : [offset, baseY + 0.24, 0]}
            rotation={[0, alongZ ? Math.PI * 0.5 : 0, 0]}
          >
            {/* Terracotta/limestone recessed panel inlay: flat decal layer, >= 1.5cm proud + polygonOffset */}
            <mesh
              position={[0, archH * 0.5, 0]}
              material={BAY_PANEL_DECAL_MAT}
              castShadow={false}
              receiveShadow
            >
              <boxGeometry args={[archW, archH, wallThick + 2 * DECAL_LIFT]} />
            </mesh>
            {/* Limestone architrave lintel + keystone (faces >= 1.5cm apart from panel / each other) */}
            <mesh
              position={[0, archH + 0.05, 0]}
              material={VENICE_MATERIALS.stuccoCreamLimestone}
              castShadow
            >
              <boxGeometry args={[archW + 0.14, 0.09, wallThick + 0.07]} />
            </mesh>
            <mesh
              position={[0, archH + 0.055, 0]}
              material={VENICE_MATERIALS.graniteCurbBevelTop}
            >
              <boxGeometry args={[0.16, 0.14, wallThick + 0.1]} />
            </mesh>
          </group>
        );
      })}

      {/* Chamfered limestone coping cap */}
      <mesh
        position={[0, baseY + bodyH + copingH * 0.5, 0]}
        material={VENICE_MATERIALS.graniteCurbBevelTop}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[width + 0.14, copingH, depth + 0.14]} />
      </mesh>

      {/* Wrought-iron top rail & vertical balusters crowning the retaining wall strictly <= topY */}
      <mesh
        position={[0, topY - 0.018, 0]}
        material={THIN_IRON_MAT}
        castShadow={false}
      >
        <boxGeometry
          args={
            alongZ
              ? [0.044, 0.036, spanLen - 0.16]
              : [spanLen - 0.16, 0.036, 0.044]
          }
        />
      </mesh>
      {Array.from({ length: Math.max(8, Math.round(spanLen / 0.45)) }, (_, k) => {
        const count = Math.max(8, Math.round(spanLen / 0.45));
        const offset = -spanLen * 0.48 + (k / (count - 1)) * spanLen * 0.96;
        // Balusters end at the rail's centreline (inside the rail) so tops never coincide with rail top.
        const balH = Math.max(0.04, topY - 0.018 - (baseY + bodyH + copingH));
        return (
          <mesh
            key={`bal-${k}`}
            position={
              alongZ
                ? [0, baseY + bodyH + copingH + balH * 0.5, offset]
                : [offset, baseY + bodyH + copingH + balH * 0.5, 0]
            }
            material={THIN_IRON_MAT}
            castShadow={false}
          >
            <boxGeometry args={[0.036, balH, 0.036]} />
          </mesh>
        );
      })}

      {/* Stone pilasters + finials */}
      {Array.from({ length: pilasterCount }, (_, idx) => {
        const t = pilasterCount === 1 ? 0.5 : idx / (pilasterCount - 1);
        const offset = -spanLen * 0.48 + t * spanLen * 0.96;
        return (
          <group
            key={`pilaster-${idx}`}
            position={alongZ ? [0, 0, offset] : [offset, 0, 0]}
          >
            <mesh
              position={[0, baseY + (bodyH + 0.08) * 0.5, 0]}
              material={VENICE_MATERIALS.stuccoCreamDeep}
              castShadow
              receiveShadow
            >
              <boxGeometry
                args={
                  alongZ
                    ? [wallThick + 0.2, bodyH + 0.08, 0.38]
                    : [0.38, bodyH + 0.08, wallThick + 0.2]
                }
              />
            </mesh>
            <mesh
              position={[0, topY - 0.055, 0]}
              material={VENICE_MATERIALS.graniteCurbBevelTop}
              castShadow
            >
              {/* Cap top sits 1.5cm below the rail top (rail passes through it) */}
              <boxGeometry
                args={
                  alongZ
                    ? [wallThick + 0.18, 0.08, 0.44]
                    : [0.44, 0.08, wallThick + 0.18]
                }
              />
            </mesh>
          </group>
        );
      })}

      {showWireframe && (
        <mesh position={[0, baseY + totalHeight * 0.5, 0]}>
          <boxGeometry args={[width, totalHeight, depth]} />
          <meshBasicMaterial color="#F59E0B" wireframe />
        </mesh>
      )}
    </group>
  );
}

/**
 * Renders the sunlit Venetian cedar & stone pergola over the north courtyard terrace.
 */
export function CourtyardPergolaMesh({
  pergola = COURTYARD_PERGOLA,
}: {
  pergola?: CourtyardPergolaSpec;
}) {
  const { minX, maxX, minZ, maxZ } = pergola.boundsXZ;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const groundY = pergola.groundY;
  const beamY = groundY + pergola.beamClearHeight;
  const plinthH = 0.52;
  const timberPostH = pergola.beamClearHeight - plinthH;
  const rafterCount = Math.max(5, pergola.rafterCount);

  return (
    <group name={`pergola-${pergola.id}`}>
      {/* 6 Limestone Column Plinths + Cedar Timber Posts + Knee Braces */}
      {pergola.postPositions.map((pos, idx) => {
        const isNorthRow = pos[2] < centerZ;
        const braceSignZ = isNorthRow ? 1 : -1;
        return (
          <group
            key={`pergola-post-${idx}`}
            position={[pos[0], groundY, pos[2]]}
            userData={{ occludableProp: true }}
          >
            {/* Molded limestone plinth */}
            <mesh
              position={[0, plinthH * 0.5, 0]}
              material={VENICE_MATERIALS.stuccoCreamDeep}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.44, plinthH, 0.44]} />
            </mesh>
            <mesh
              position={[0, plinthH + 0.035, 0]}
              material={VENICE_MATERIALS.graniteCurbBevelTop}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.5, 0.07, 0.5]} />
            </mesh>

            {/* Cedar column shaft */}
            <mesh
              position={[0, plinthH + timberPostH * 0.5, 0]}
              material={VENICE_MATERIALS.pergolaCedar}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.24, timberPostH, 0.24]} />
            </mesh>

            {/* Wrought-iron base shoe + capital collar */}
            <mesh
              position={[0, plinthH + 0.09, 0]}
              material={VENICE_MATERIALS.wroughtIron}
              castShadow
            >
              <boxGeometry args={[0.28, 0.06, 0.28]} />
            </mesh>
            <mesh
              position={[0, pergola.beamClearHeight - 0.14, 0]}
              material={VENICE_MATERIALS.wroughtIron}
              castShadow
            >
              <boxGeometry args={[0.29, 0.07, 0.29]} />
            </mesh>

            {/* Diagonal cedar knee brace along X */}
            <mesh
              position={[pos[0] > centerX ? -0.34 : 0.34, pergola.beamClearHeight - 0.28, 0]}
              rotation={[0, 0, pos[0] > centerX ? Math.PI * 0.25 : -Math.PI * 0.25]}
              material={VENICE_MATERIALS.pergolaCedar}
              castShadow
            >
              <boxGeometry args={[0.1, 0.65, 0.12]} />
            </mesh>

            {/* Transverse wrought-iron scroll brace */}
            <mesh
              position={[0, pergola.beamClearHeight - 0.26, braceSignZ * 0.28]}
              rotation={[braceSignZ * Math.PI * 0.25, 0, 0]}
              material={VENICE_MATERIALS.wroughtIron}
              castShadow
            >
              <boxGeometry args={[0.08, 0.58, 0.08]} />
            </mesh>
          </group>
        );
      })}

      <group
        name={`pergola-${pergola.id}-overhead`}
        userData={{ occludableProp: true }}
      >
        {/* Longitudinal Cedar Header Double Beams (South & North rows) */}
        {[minZ + 0.1, maxZ - 0.1].map((beamZ, rowIdx) => (
          <group key={`header-beam-${rowIdx}`} position={[centerX, beamY, beamZ]}>
            <mesh
              position={[0, 0.12, -0.09]}
              material={VENICE_MATERIALS.pergolaCedar}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[spanX + 0.75, 0.24, 0.12]} />
            </mesh>
            <mesh
              position={[0, 0.12, 0.09]}
              material={VENICE_MATERIALS.pergolaCedar}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[spanX + 0.75, 0.24, 0.12]} />
            </mesh>
          </group>
        ))}

        {/* 9 Notched Transverse Rafters with overhanging Venetian tails */}
        {Array.from({ length: rafterCount }, (_, idx) => {
          const t = rafterCount === 1 ? 0.5 : idx / (rafterCount - 1);
          const rx = minX + 0.25 + t * (spanX - 0.5);
          return (
            <mesh
              key={`rafter-${idx}`}
              position={[rx, beamY + 0.27, centerZ]}
              material={VENICE_MATERIALS.pergolaCedar}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.12, 0.18, spanZ + 0.85]} />
            </mesh>
          );
        })}

        {/* Longitudinal Roof Purlins + Draped Pergola Greenery & Blossoms */}
        {[-spanZ * 0.3, 0, spanZ * 0.3].map((dz, pIdx) => (
          <mesh
            key={`purlin-${pIdx}`}
            position={[centerX, beamY + 0.39, centerZ + dz]}
            material={VENICE_MATERIALS.pergolaCedar}
            castShadow
          >
            <boxGeometry args={[spanX + 0.4, 0.07, 0.07]} />
          </mesh>
        ))}

        {/* Clustered low-poly climbing vine foliage over rafters */}
        {Array.from({ length: 10 }, (_, idx) => {
          const vx = minX + 0.75 + (idx / 9) * (spanX - 1.5);
          const vz = centerZ + ((idx % 3) - 1) * (spanZ * 0.28);
          return (
            <group key={`vine-${idx}`} position={[vx, beamY + 0.44, vz]}>
              <mesh material={VENICE_MATERIALS.pergolaVineLeaf} castShadow>
                <dodecahedronGeometry args={[0.42 + (idx % 2) * 0.1, 0]} />
              </mesh>
              {idx % 2 === 0 && (
                <mesh
                  position={[0.16, -0.14, 0.24]}
                  material={VENICE_MATERIALS.flowerBoxBlossomCoral}
                  castShadow
                >
                  <dodecahedronGeometry args={[0.16, 0]} />
                </mesh>
              )}
            </group>
          );
        })}
      </group>
    </group>
  );
}

/**
 * Renders catenary overhead warm glowing café string lights spanning 5th Ave, Mercer St, and Courtyard.
 */
export function StringLightSpansGroup({
  spans = STRING_LIGHT_SPANS,
}: {
  spans?: StringLightSpanSpec[];
}) {
  return (
    <group name="string-light-spans-group">
      {spans.map((span) => (
        <SingleStringLightSpan key={span.id} span={span} />
      ))}
    </group>
  );
}

function SingleStringLightSpan({ span }: { span: StringLightSpanSpec }) {
  const { tubeGeo, bulbPositions } = useMemo(() => {
    const start = new THREE.Vector3(...span.startAnchor);
    const end = new THREE.Vector3(...span.endAnchor);
    const curvePts: THREE.Vector3[] = [];
    const segs = 22;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = new THREE.Vector3().lerpVectors(start, end, t);
      p.y -= 4 * t * (1 - t) * span.sagMeters;
      curvePts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(curvePts);
    // Chunky festive cable: 5.6cm diameter so upper skyline slow pans glide without sub-pixel stair-stepping.
    const tube = new THREE.TubeGeometry(curve, 24, 0.028, 8, false);

    const bulbs: [number, number, number][] = [];
    const count = Math.max(2, span.bulbCount);
    for (let b = 0; b < count; b++) {
      const t = (b + 0.6) / (count + 0.2);
      const p = curve.getPointAt(Math.min(0.96, Math.max(0.04, t)));
      bulbs.push([p.x, p.y - 0.065, p.z]);
    }
    return { tubeGeo: tube, bulbPositions: bulbs };
  }, [span.startAnchor, span.endAnchor, span.sagMeters, span.bulbCount]);

  useEffect(() => {
    return () => {
      tubeGeo.dispose();
    };
  }, [tubeGeo]);

  return (
    <group name={`string-span-${span.id}`}>
      {/* Catenary cord */}
      <mesh geometry={tubeGeo} material={THIN_CORD_MAT} castShadow={false} receiveShadow={false} />

      {/* Wall anchor iron rosettes */}
      {[span.startAnchor, span.endAnchor].map((pt, idx) => (
        <mesh
          key={`anchor-${idx}`}
          position={pt}
          material={THIN_IRON_MAT}
          castShadow={false}
        >
          <boxGeometry args={[0.12, 0.12, 0.12]} />
        </mesh>
      ))}

      {/* Warm glowing café bulbs + sockets */}
      {bulbPositions.map((pos, bIdx) => (
        <group key={`bulb-${bIdx}`} position={pos}>
          <mesh
            position={[0, 0.045, 0]}
            material={THIN_CORD_MAT}
            castShadow={false}
          >
            <cylinderGeometry args={[0.024, 0.032, 0.045, 8]} />
          </mesh>
          <mesh material={VENICE_MATERIALS.stringLightBulbGlow} castShadow={false}>
            <sphereGeometry args={[0.056, 8, 6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function SubwayCeilingSlabMesh({
  wall,
  width,
  depth,
  centerX,
  centerZ,
  baseY,
  topY,
  slabH,
  lightShafts,
  showWireframe,
}: {
  wall: ArchitecturalWallSpec;
  width: number;
  depth: number;
  centerX: number;
  centerZ: number;
  baseY: number;
  topY: number;
  slabH: number;
  lightShafts?: SubwayVaultEnclosureSpec['lightShafts'];
  showWireframe: boolean;
}) {
  const carvedGeo = useMemo(() => {
    if (!lightShafts || lightShafts.length === 0) return null;
    const minX = centerX - width * 0.5;
    const maxX = centerX + width * 0.5;
    const minZ = centerZ - depth * 0.5;
    const maxZ = centerZ + depth * 0.5;
    const holes: Array<Array<readonly [number, number]>> = [];
    for (const s of lightShafts) {
      const sx = s.ceilingCenter[0];
      const sz = s.ceilingCenter[2];
      const hw = s.grateSizeXZ[0] * 0.5;
      const hd = s.grateSizeXZ[1] * 0.5;
      if (
        sx - hw > minX + 0.05 &&
        sx + hw < maxX - 0.05 &&
        sz - hd > minZ + 0.05 &&
        sz + hd < maxZ - 0.05
      ) {
        holes.push([
          [sx - hw, sz - hd],
          [sx + hw, sz - hd],
          [sx + hw, sz + hd],
          [sx - hw, sz + hd],
        ]);
      }
    }
    if (holes.length === 0) return null;
    return buildRectSlabWithPolygonHolesGeometry(
      { minX, maxX, minZ, maxZ },
      holes,
      baseY,
      topY,
      3.0,
    );
  }, [lightShafts, centerX, centerZ, width, depth, baseY, topY]);

  useEffect(() => {
    return () => {
      carvedGeo?.dispose();
    };
  }, [carvedGeo]);

  if (carvedGeo && lightShafts) {
    return (
      <group name={`wall-${wall.id}`}>
        <mesh
          geometry={carvedGeo}
          material={VENICE_MATERIALS.sidewalkLimestone}
          receiveShadow
          castShadow
        />
        {/* Cast-iron Sidewalk Skylight Grates & Sunlit Frosted Daylight Wells Framing Each Oculus */}
        {lightShafts.map((shaft) => {
          const [sx, , sz] = shaft.ceilingCenter;
          const [gw, gd] = shaft.grateSizeXZ;
          const gy = (baseY + topY) * 0.5;
          const rimT = 0.1;
          return (
            <group key={shaft.id} name={`oculus-grate-${shaft.id}`} position={[sx, gy, sz]}>
              {[
                [0, 0, -(gd - rimT) * 0.5, gw, rimT],
                [0, 0, (gd - rimT) * 0.5, gw, rimT],
                [-(gw - rimT) * 0.5, 0, 0, rimT, Math.max(0.1, gd - rimT * 2)],
                [(gw - rimT) * 0.5, 0, 0, rimT, Math.max(0.1, gd - rimT * 2)],
              ].map(([fx, fy, fz, fw, fd], fIdx) => (
                <mesh
                  key={`frame-${fIdx}`}
                  position={[fx, fy, fz]}
                  material={OCULUS_REVEAL_MAT}
                  castShadow={false}
                >
                  <boxGeometry args={[fw, slabH + 0.04, fd]} />
                </mesh>
              ))}
              {/* Glowing backlit sunlit frosted glass-block diffuser sealing the upper skylight well */}
              <mesh
                position={[0, topY - gy - 0.015, 0]}
                material={OCULUS_DAYLIGHT_PANE_MAT}
                castShadow={false}
                receiveShadow={false}
              >
                <boxGeometry args={[gw - rimT * 1.4, 0.025, gd - rimT * 1.4]} />
              </mesh>
              {[-0.28, 0, 0.28].map((t, sIdx) => (
                <mesh
                  key={`bar-${sIdx}`}
                  position={[0, topY - gy - 0.065, t * (gd - 0.28)]}
                  material={THIN_IRON_MAT}
                  castShadow={false}
                >
                  <boxGeometry args={[gw - 0.16, 0.06, 0.06]} />
                </mesh>
              ))}
            </group>
          );
        })}
        {showWireframe && (
          <mesh position={[centerX, baseY + slabH * 0.5, centerZ]}>
            <boxGeometry args={[width, slabH, depth]} />
            <meshBasicMaterial color="#06B6D4" wireframe />
          </mesh>
        )}
      </group>
    );
  }

  // Headhouse canopy / solid slab (e.g. wall-z6-headhouse-canopy-roof)
  const isCanopy = wall.id.includes('canopy');
  return (
    <group
      name={`wall-${wall.id}`}
      position={[centerX, 0, centerZ]}
      rotation={[0, wall.rotationY, 0]}
    >
      <mesh
        position={[0, baseY + slabH * 0.5, 0]}
        material={isCanopy ? PATINATED_CANOPY_MAT : SUBWAY_CERAMIC_CREAM_MAT}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[width, slabH, depth]} />
      </mesh>
      {isCanopy && (
        <mesh
          position={[0, topY + 0.04, 0]}
          material={SUBWAY_COPING_DARK_MAT}
          castShadow
        >
          <boxGeometry args={[width + 0.18, 0.08, depth + 0.18]} />
        </mesh>
      )}
      {showWireframe && (
        <mesh position={[0, baseY + slabH * 0.5, 0]}>
          <boxGeometry args={[width, slabH, depth]} />
          <meshBasicMaterial color="#06B6D4" wireframe />
        </mesh>
      )}
    </group>
  );
}

/**
 * Renders the 7 layered Venetian skyline towers (including the San Mercer Campanile)
 * PLUS outer horizon ground skirt and perimeter city silhouette ring so orbiting 360°
 * at any camera pitch never reveals a sky void or exposed map edge.
 */
export function SkylineAndHorizonSkirt({
  backdrops = SKYLINE_BACKDROPS,
  outerGroundSkirt = OUTER_CITY_GROUND_SKIRT,
  isGrandEscapade = false,
}: {
  backdrops?: PerimeterBuildingSpec[];
  outerGroundSkirt?: { boundsXZ: RectBoundsXZ; topY: number };
  isGrandEscapade?: boolean;
}) {
  const { minX, maxX, minZ, maxZ } = outerGroundSkirt.boundsXZ;
  const skirtW = maxX - minX;
  const skirtD = maxZ - minZ;
  const skirtCX = (minX + maxX) * 0.5;
  const skirtCZ = (minZ + maxZ) * 0.5;

  return (
    <group name="skyline-and-horizon-skirt">
      {/* Continuous ground skirt apron beneath all street, viaduct & subterranean elevations */}
      <mesh
        name="outer-city-ground-skirt"
        position={[skirtCX, outerGroundSkirt.topY, skirtCZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={HORIZON_APRON_MAT}
        receiveShadow
      >
        <planeGeometry args={[skirtW, skirtD]} />
      </mesh>

      {/* All layered CAD skyline towers (zero overlap, 360-degree horizon closure) */}
      {backdrops.map((b) => (
        <SkylineTowerMesh key={b.id} tower={b} />
      ))}

      {/* Far-horizon distant city rooftop silhouettes sealing N/S/E/W + diagonal corners */}
      {!isGrandEscapade ? (
        <group name="outer-horizon-infill-silhouettes">
          {[
            { x: 10, z: -64, w: 96, h: 17.5, d: 14, mat: VENICE_MATERIALS.skylineOchre },
            { x: -34, z: 0, w: 14, h: 19.0, d: 104, mat: VENICE_MATERIALS.skylineTerracotta },
            { x: 60, z: -4, w: 14, h: 19.5, d: 104, mat: VENICE_MATERIALS.skylineLimestone },
            { x: 10, z: 64, w: 96, h: 17.0, d: 14, mat: VENICE_MATERIALS.skylineBrick },
            // NW / NE / SW / SE corner skyline anchors closing diagonal horizon sightlines
            { x: -34, z: -59, w: 18, h: 18.5, d: 22, mat: VENICE_MATERIALS.skylineBrick },
            { x: 60, z: -59, w: 18, h: 20.0, d: 22, mat: VENICE_MATERIALS.skylineOchre },
            { x: -34, z: 59, w: 18, h: 18.0, d: 22, mat: VENICE_MATERIALS.skylineLimestone },
            { x: 60, z: 57, w: 18, h: 18.5, d: 24, mat: VENICE_MATERIALS.skylineTerracotta },
          ].map((blk, idx) => (
            <group key={`outer-blk-${idx}`} position={[blk.x, -0.05, blk.z]}>
              <mesh position={[0, blk.h * 0.5, 0]} material={blk.mat}>
                <boxGeometry args={[blk.w, blk.h, blk.d]} />
              </mesh>
            </group>
          ))}
        </group>
      ) : (
        <group name="escapade-far-horizon-ring">
          {[
            { x: 20, z: -185, w: 390, h: 32, d: 18, mat: VENICE_MATERIALS.skylineOchre },
            { x: 20, z: 225, w: 390, h: 32, d: 18, mat: VENICE_MATERIALS.skylineBrick },
            { x: -175, z: 20, w: 18, h: 34, d: 410, mat: VENICE_MATERIALS.skylineTerracotta },
            { x: 215, z: 20, w: 18, h: 34, d: 410, mat: VENICE_MATERIALS.skylineLimestone },
          ].map((blk, idx) => (
            <mesh
              key={`esc-ring-${idx}`}
              position={[blk.x, outerGroundSkirt.topY + blk.h * 0.5, blk.z]}
              material={blk.mat}
            >
              <boxGeometry args={[blk.w, blk.h, blk.d]} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/**
 * Builds a clean watertight 4-slope faceted Venetian hipped roof BufferGeometry
 * strictly fitted to `[widthX, depthZ]` with ZERO giant cone overhangs.
 */
function buildFittedHippedRoofGeometry(
  widthX: number,
  depthZ: number,
  rise: number,
): THREE.BufferGeometry {
  const hw = widthX * 0.5;
  const hd = depthZ * 0.5;
  const p0: [number, number, number] = [-hw, 0, hd];
  const p1: [number, number, number] = [hw, 0, hd];
  const p2: [number, number, number] = [hw, 0, -hd];
  const p3: [number, number, number] = [-hw, 0, -hd];

  let rA: [number, number, number];
  let rB: [number, number, number];

  if (widthX >= depthZ) {
    const rHalf = Math.max(0.08, (widthX - depthZ) * 0.42);
    rA = [-rHalf, rise, 0];
    rB = [rHalf, rise, 0];
  } else {
    const rHalf = Math.max(0.08, (depthZ - widthX) * 0.42);
    rA = [0, rise, rHalf];
    rB = [0, rise, -rHalf];
  }

  const tris: number[] = [];
  const pushTri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
  ) => {
    tris.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };

  if (widthX >= depthZ) {
    pushTri(p0, p1, rB);
    pushTri(p0, rB, rA);
    pushTri(p2, p3, rA);
    pushTri(p2, rA, rB);
    pushTri(p1, p2, rB);
    pushTri(p3, p0, rA);
  } else {
    pushTri(p0, p1, rA);
    pushTri(p2, p3, rB);
    pushTri(p1, p2, rB);
    pushTri(p1, rB, rA);
    pushTri(p3, p0, rA);
    pushTri(p3, rA, rB);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  geo.computeVertexNormals();
  return geo;
}

function FittedHippedRoof({
  position,
  widthX,
  depthZ,
  rise,
  material,
}: {
  position: [number, number, number];
  widthX: number;
  depthZ: number;
  rise: number;
  material: THREE.Material;
}) {
  const geo = useMemo(
    () => buildFittedHippedRoofGeometry(widthX, depthZ, rise),
    [widthX, depthZ, rise],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh position={position} geometry={geo} material={material} />;
}

const SKYLINE_BAY_WALL_MATS = [
  VENICE_MATERIALS.skylineOchre,
  VENICE_MATERIALS.skylineTerracotta,
  VENICE_MATERIALS.skylineLimestone,
  VENICE_MATERIALS.skylineBrick,
];

const SKYLINE_SHUTTER_MATS = [
  layeredMaterial(VENICE_MATERIALS.shutterSageDefault, 1),
  layeredMaterial(VENICE_MATERIALS.shutterEspresso, 1),
  layeredMaterial(VENICE_MATERIALS.stuccoTerracottaDeep, 1),
];

interface MergedBoxSpec {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
}

function mergeSkylineBoxSpecs(specs: MergedBoxSpec[]): THREE.BufferGeometry | null {
  if (specs.length === 0) return null;
  const pos: number[] = [];
  const norm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const baseBox = new THREE.BoxGeometry(1, 1, 1);
  const bPos = baseBox.getAttribute('position');
  const bNorm = baseBox.getAttribute('normal');
  const bUv = baseBox.getAttribute('uv');
  const bIdx = baseBox.getIndex()!;
  let vertOffset = 0;
  for (const s of specs) {
    const cosY = Math.cos(s.rotY);
    const sinY = Math.sin(s.rotY);
    for (let i = 0; i < bPos.count; i++) {
      const lx = bPos.getX(i) * s.w;
      const ly = bPos.getY(i) * s.h;
      const lz = bPos.getZ(i) * s.d;
      pos.push(lx * cosY + lz * sinY + s.x, ly + s.y, -lx * sinY + lz * cosY + s.z);
      const nx = bNorm.getX(i);
      const ny = bNorm.getY(i);
      const nz = bNorm.getZ(i);
      norm.push(nx * cosY + nz * sinY, ny, -nx * sinY + nz * cosY);
      uv.push(bUv.getX(i), bUv.getY(i));
    }
    for (let i = 0; i < bIdx.count; i++) {
      idx.push(vertOffset + bIdx.getX(i));
    }
    vertOffset += bPos.count;
  }
  baseBox.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

function EscapadeSkylineTowerMesh({
  tower,
  cx,
  cz,
  width,
  depth,
  baseY,
  roofMat,
}: {
  tower: PerimeterBuildingSpec;
  cx: number;
  cz: number;
  width: number;
  depth: number;
  baseY: number;
  roofMat: THREE.Material;
}) {
  const frontIsNS = tower.frontFace === 'north' || tower.frontFace === 'south';
  const faceSign = tower.frontFace === 'south' || tower.frontFace === 'east' ? 1 : -1;
  const faceRotY = frontIsNS
    ? faceSign > 0
      ? 0
      : Math.PI
    : faceSign > 0
      ? Math.PI * 0.5
      : -Math.PI * 0.5;
  const majorSpan = frontIsNS ? width : depth;
  const minorDepth = frontIsNS ? depth : width;
  const bayCount = Math.min(4, Math.max(2, Math.round(majorSpan / 18)));
  const baySpan = majorSpan / bayCount;
  const baseWallMat = getSkylineMaterial(tower.palette);
  const cosFace = Math.cos(faceRotY);
  const sinFace = Math.sin(faceRotY);

  const baySpecs = useMemo(() => {
    const centerIdx = Math.floor(bayCount * 0.5);
    return Array.from({ length: bayCount }, (_, bIdx) => {
      const bayOffset = -majorSpan * 0.5 + (bIdx + 0.5) * baySpan;
      const isCampanileCenter =
        tower.roofStyle === 'campanile_spire' && bIdx === centerIdx;
      const hasRoofCap =
        tower.roofStyle === 'mansard_slate' ||
        tower.roofStyle === 'hipped_terracotta_tile' ||
        (tower.roofStyle === 'campanile_spire' && !isCampanileCenter) ||
        (tower.roofStyle === 'cornice_parapet' && bIdx % 2 === 0);
      const roofAllowance = isCampanileCenter ? 7.8 : hasRoofCap ? 2.4 : 0;
      const stepDelta = isCampanileCenter ? 0 : ((bIdx % 3) - 1) * 1.4;
      const bayH =
        Math.max(20, tower.height - roofAllowance + stepDelta) +
        towerHeightNudge(tower.id);
      const bayW = (frontIsNS ? baySpan : minorDepth) - 0.08;
      const bayD = (frontIsNS ? minorDepth : baySpan) - 0.08;
      const bayMat =
        bIdx === 0
          ? baseWallMat
          : SKYLINE_BAY_WALL_MATS[
              (bIdx + tower.id.length) % SKYLINE_BAY_WALL_MATS.length
            ]!;
      return {
        bIdx,
        bayOffset,
        bayH,
        bayW,
        bayD,
        bayMat,
        isCampanileCenter,
        hasRoofCap,
      };
    });
  }, [bayCount, majorSpan, baySpan, tower.height, tower.roofStyle, tower.id, frontIsNS, minorDepth, baseWallMat]);

  // Batch all repeating architectural trim & Venetian window grids into 6 clean GPU draw calls
  const mergedGeos = useMemo(() => {
    const limestoneSpecs: MergedBoxSpec[] = [];
    const sillGraniteSpecs: MergedBoxSpec[] = [];
    const litGlassSpecs: MergedBoxSpec[] = [];
    const darkGlassSpecs: MergedBoxSpec[] = [];
    const mullionSpecs: MergedBoxSpec[] = [];
    const shutterBuckets: MergedBoxSpec[][] = [[], [], []];

    const pushLocalToFace = (
      bucket: MergedBoxSpec[],
      bayX: number,
      bayZ: number,
      wallFrontDist: number,
      u: number,
      y: number,
      localZ: number,
      w: number,
      h: number,
      d: number,
    ) => {
      const dist = wallFrontDist + localZ;
      const worldX = bayX + dist * sinFace + u * cosFace;
      const worldZ = bayZ + dist * cosFace - u * sinFace;
      bucket.push({ w, h, d, x: worldX, y, z: worldZ, rotY: faceRotY });
    };

    for (const bay of baySpecs) {
      const bayX = frontIsNS ? bay.bayOffset : 0;
      const bayZ = frontIsNS ? 0 : bay.bayOffset;
      const topY = baseY + bay.bayH;
      const wallFrontDist = (frontIsNS ? bay.bayD : bay.bayW) * 0.5;

      // Crown cornice & upper stone belt course framed cleanly between top two window rows
      limestoneSpecs.push(
        {
          w: bay.bayW + 0.34,
          h: 0.36,
          d: bay.bayD + 0.34,
          x: bayX,
          y: topY + 0.18,
          z: bayZ,
          rotY: 0,
        },
        {
          w: bay.bayW + 0.24,
          h: 0.22,
          d: bay.bayD + 0.24,
          x: bayX,
          y: topY - 3.62,
          z: bayZ,
          rotY: 0,
        },
      );

      // Eave corbel dentils along front face
      const dentilCount = Math.max(5, Math.floor(baySpan / 1.65));
      for (let di = 0; di < dentilCount; di++) {
        const du =
          -baySpan * 0.44 +
          (di / Math.max(1, dentilCount - 1)) * (baySpan * 0.88);
        pushLocalToFace(limestoneSpecs, bayX, bayZ, wallFrontDist, du, topY - 0.16, 0.08, 0.24, 0.26, 0.22);
      }

      // Shuttered Venetian Window Grids anchored downward from topY so upper facades never show blank foreheads
      const winCols = Math.max(3, Math.min(4, Math.floor(baySpan / 3.4)));
      const bucketIdx = (bay.bIdx + tower.id.length) % shutterBuckets.length;
      const shutterBucket = shutterBuckets[bucketIdx]!;
      for (let k = 0; k < 7; k++) {
        const wy = topY - 1.95 - k * 3.35;
        if (wy < 7.6) break;
        for (let cIdx = 0; cIdx < winCols; cIdx++) {
          const u = (-0.5 + (cIdx + 0.5) / winCols) * (baySpan * 0.74);
          // Limestone architrave backing + granite sill + shutters + recessed glass + muntins (zero coplanarity)
          pushLocalToFace(limestoneSpecs, bayX, bayZ, wallFrontDist, u, wy, 0.02, 1.32, 1.94, 0.08);
          pushLocalToFace(sillGraniteSpecs, bayX, bayZ, wallFrontDist, u, wy - 1.02, 0.08, 1.5, 0.14, 0.2);
          pushLocalToFace(shutterBucket, bayX, bayZ, wallFrontDist, u - 0.86, wy, 0.03, 0.4, 1.72, 0.06);
          pushLocalToFace(shutterBucket, bayX, bayZ, wallFrontDist, u + 0.86, wy, 0.03, 0.4, 1.72, 0.06);
          const glassBucket = (bay.bIdx + k + cIdx) % 3 === 0 ? litGlassSpecs : darkGlassSpecs;
          pushLocalToFace(glassBucket, bayX, bayZ, wallFrontDist, u, wy, 0.085, 0.96, 1.56, 0.04);
          pushLocalToFace(mullionSpecs, bayX, bayZ, wallFrontDist, u, wy, 0.115, 0.06, 1.56, 0.02);
          pushLocalToFace(mullionSpecs, bayX, bayZ, wallFrontDist, u, wy + 0.18, 0.135, 0.96, 0.06, 0.02);
        }
      }
    }

    return {
      limestone: mergeSkylineBoxSpecs(limestoneSpecs),
      sillGranite: mergeSkylineBoxSpecs(sillGraniteSpecs),
      litGlass: mergeSkylineBoxSpecs(litGlassSpecs),
      darkGlass: mergeSkylineBoxSpecs(darkGlassSpecs),
      mullion: mergeSkylineBoxSpecs(mullionSpecs),
      shutters: shutterBuckets.map((b) => mergeSkylineBoxSpecs(b)),
    };
  }, [baySpecs, baseY, baySpan, frontIsNS, cosFace, sinFace, faceRotY, tower.id]);

  useEffect(() => {
    return () => {
      mergedGeos.limestone?.dispose();
      mergedGeos.sillGranite?.dispose();
      mergedGeos.litGlass?.dispose();
      mergedGeos.darkGlass?.dispose();
      mergedGeos.mullion?.dispose();
      mergedGeos.shutters.forEach((g) => g?.dispose());
    };
  }, [mergedGeos]);

  const centerBay = baySpecs[Math.floor(baySpecs.length * 0.5)]!;
  const centerX = frontIsNS ? centerBay.bayOffset : 0;
  const centerZ = frontIsNS ? 0 : centerBay.bayOffset;
  const centerTopY = baseY + centerBay.bayH;

  return (
    <group name={`skyline-${tower.id}`} position={[cx, 0, cz]}>
      {baySpecs.map((bay) => {
        const bx = frontIsNS ? bay.bayOffset : 0;
        const bz = frontIsNS ? 0 : bay.bayOffset;
        const topY = baseY + bay.bayH;
        const { hasRoofCap } = bay;
        const capMat =
          tower.roofStyle === 'hipped_terracotta_tile'
            ? roofMat
            : tower.roofStyle === 'cornice_parapet'
              ? VENICE_MATERIALS.roofTerracottaTile
              : VENICE_MATERIALS.roofMansardSlate;

        return (
          <group key={`esc-bay-${bay.bIdx}`} position={[bx, 0, bz]}>
            <mesh position={[0, baseY + bay.bayH * 0.5, 0]} material={bay.bayMat}>
              <boxGeometry args={[bay.bayW, bay.bayH, bay.bayD]} />
            </mesh>
            {hasRoofCap ? (
              <FittedHippedRoof
                position={[0, topY + 0.36, 0]}
                widthX={bay.bayW + 0.28}
                depthZ={bay.bayD + 0.28}
                rise={tower.roofStyle === 'mansard_slate' ? 3.2 : 2.6}
                material={capMat}
              />
            ) : (
              <mesh
                position={[0, topY + 0.54, 0]}
                material={VENICE_MATERIALS.stuccoCreamDeep}
              >
                <boxGeometry args={[bay.bayW - 0.2, 0.38, bay.bayD - 0.2]} />
              </mesh>
            )}
            {bay.bIdx % 2 === 0 && (
              <group
                position={[
                  frontIsNS ? bay.bayW * 0.22 : 0,
                  topY + (hasRoofCap ? 1.85 : 1.15),
                  frontIsNS ? 0 : bay.bayD * 0.22,
                ]}
              >
                <mesh material={VENICE_MATERIALS.brickBrownstone}>
                  <boxGeometry args={[0.78, 1.65, 0.78]} />
                </mesh>
                <mesh
                  position={[0, 0.92, 0]}
                  material={VENICE_MATERIALS.stuccoCreamLimestone}
                >
                  <boxGeometry args={[0.96, 0.2, 0.96]} />
                </mesh>
              </group>
            )}
          </group>
        );
      })}

      {/* Open-Arched Venetian Campanile Turret & Copper Spire crowning Campanile Skyline Blocks */}
      {tower.roofStyle === 'campanile_spire' && (
        <group position={[centerX, centerTopY + 0.36, centerZ]}>
          <mesh position={[0, 1.2, 0]} material={VENICE_MATERIALS.stuccoTerracotta}>
            <boxGeometry args={[6.6, 2.4, 6.6]} />
          </mesh>
          <mesh position={[0, 2.52, 0]} material={VENICE_MATERIALS.stuccoCreamLimestone}>
            <boxGeometry args={[7.2, 0.28, 7.2]} />
          </mesh>
          {[
            [-2.4, -2.4],
            [2.4, -2.4],
            [-2.4, 2.4],
            [2.4, 2.4],
          ].map(([px, pz], idx) => (
            <mesh
              key={`esc-belfry-pier-${idx}`}
              position={[px, 3.86, pz]}
              material={VENICE_MATERIALS.stuccoCreamLimestone}
            >
              <boxGeometry args={[0.88, 2.4, 0.88]} />
            </mesh>
          ))}
          <mesh position={[0, 3.8, 0]} material={VENICE_MATERIALS.storefrontWarmInterior}>
            <boxGeometry args={[3.2, 1.8, 3.2]} />
          </mesh>
          <mesh position={[0, 5.2, 0]} material={VENICE_MATERIALS.stuccoCreamLimestone}>
            <boxGeometry args={[7.0, 0.3, 7.0]} />
          </mesh>
          <FittedHippedRoof
            position={[0, 5.35, 0]}
            widthX={6.8}
            depthZ={6.8}
            rise={3.8}
            material={VENICE_MATERIALS.campanileSpireCopper}
          />
          <mesh position={[0, 9.28, 0]} material={VENICE_MATERIALS.flowerBoxBlossomGold}>
            <sphereGeometry args={[0.3, 10, 8]} />
          </mesh>
        </group>
      )}

      {/* Merged Batched Window & Trim Geometry */}
      {mergedGeos.limestone && (
        <mesh geometry={mergedGeos.limestone} material={VENICE_MATERIALS.stuccoCreamLimestone} />
      )}
      {mergedGeos.sillGranite && (
        <mesh geometry={mergedGeos.sillGranite} material={VENICE_MATERIALS.graniteCurbBevelTop} />
      )}
      {mergedGeos.litGlass && (
        <mesh geometry={mergedGeos.litGlass} material={WINDOW_LIT_DECAL_MAT} />
      )}
      {mergedGeos.darkGlass && (
        <mesh geometry={mergedGeos.darkGlass} material={WINDOW_DARK_DECAL_MAT} />
      )}
      {mergedGeos.mullion && (
        <mesh geometry={mergedGeos.mullion} material={SKYLINE_MULLION_MAT} />
      )}
      {mergedGeos.shutters.map(
        (geo, idx) =>
          geo && <mesh key={`esc-shutters-${idx}`} geometry={geo} material={SKYLINE_SHUTTER_MATS[idx]!} />,
      )}
    </group>
  );
}

function SkylineTowerMesh({ tower }: { tower: PerimeterBuildingSpec }) {
  const { minX, maxX, minZ, maxZ } = tower.boundsXZ;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const roofMat = getSkylineRoofMaterial(tower.roofStyle);
  const baseY = tower.groundY ?? -0.05;
  const isEscapadeSkyline = tower.id.startsWith('esc-');

  if (isEscapadeSkyline) {
    return (
      <EscapadeSkylineTowerMesh
        tower={tower}
        cx={cx}
        cz={cz}
        width={width}
        depth={depth}
        baseY={baseY}
        roofMat={roofMat}
      />
    );
  }

  if (tower.roofStyle === 'campanile_spire') {
    const shaftH = Math.max(12, tower.height - 7.8);
    const belfryH = 3.2;
    const spireH = 4.6;
    const shaftTopY = baseY + shaftH;
    const belfryTopY = shaftTopY + belfryH;

    return (
      <group name={`skyline-${tower.id}`} position={[cx, 0, cz]}>
        {/* Terracotta brick campanile shaft */}
        <mesh
          position={[0, baseY + shaftH * 0.5, 0]}
          material={VENICE_MATERIALS.stuccoTerracotta}
          castShadow
        >
          <boxGeometry args={[width, shaftH, depth]} />
        </mesh>

        {/* Cream limestone corner pilasters */}
        {[
          [-width * 0.48, -depth * 0.48],
          [width * 0.48, -depth * 0.48],
          [-width * 0.48, depth * 0.48],
          [width * 0.48, depth * 0.48],
        ].map(([px, pz], idx) => (
          <mesh
            key={`camp-pil-${idx}`}
            position={[px, baseY + shaftH * 0.5, pz]}
            material={VENICE_MATERIALS.stuccoCreamLimestone}
          >
            <boxGeometry args={[0.42, shaftH, 0.42]} />
          </mesh>
        ))}

        {/* Limestone gallery ledge below belfry */}
        <mesh
          position={[0, shaftTopY + 0.14, 0]}
          material={VENICE_MATERIALS.stuccoCreamLimestone}
        >
          <boxGeometry args={[width + 0.6, 0.28, depth + 0.6]} />
        </mesh>

        {/* Open-arched belfry corner piers */}
        {[
          [-width * 0.38, -depth * 0.38],
          [width * 0.38, -depth * 0.38],
          [-width * 0.38, depth * 0.38],
          [width * 0.38, depth * 0.38],
        ].map(([px, pz], idx) => (
          <mesh
            key={`belfry-pier-${idx}`}
            position={[px, shaftTopY + 0.28 + belfryH * 0.5, pz]}
            material={VENICE_MATERIALS.stuccoCreamLimestone}
          >
            <boxGeometry args={[0.72, belfryH, 0.72]} />
          </mesh>
        ))}

        {/* Warm lit bell chamber interior core */}
        <mesh
          position={[0, shaftTopY + 0.28 + belfryH * 0.46, 0]}
          material={VENICE_MATERIALS.storefrontWarmInterior}
        >
          <boxGeometry args={[width * 0.45, belfryH * 0.68, depth * 0.45]} />
        </mesh>

        {/* Upper belfry cornice */}
        <mesh
          position={[0, belfryTopY + 0.36, 0]}
          material={VENICE_MATERIALS.stuccoCreamLimestone}
        >
          <boxGeometry args={[width + 0.45, 0.36, depth + 0.45]} />
        </mesh>

        {/* Flush fitted patinated copper Venetian pyramid spire (zero overhang) */}
        <FittedHippedRoof
          position={[0, belfryTopY + 0.54, 0]}
          widthX={width + 0.2}
          depthZ={depth + 0.2}
          rise={spireH}
          material={VENICE_MATERIALS.campanileSpireCopper}
        />

        {/* Golden finial orb */}
        <mesh
          position={[0, belfryTopY + 0.62 + spireH, 0]}
          material={VENICE_MATERIALS.flowerBoxBlossomGold}
        >
          <sphereGeometry args={[0.28, 10, 8]} />
        </mesh>
      </group>
    );
  }

  // Subdivide wide backdrop slabs into picturesque stepped Walkabout: Venice palazzo bays
  const frontIsNS = tower.frontFace === 'north' || tower.frontFace === 'south';
  const faceSign =
    tower.frontFace === 'south' || tower.frontFace === 'east' ? 1 : -1;
  const majorSpan = frontIsNS ? width : depth;
  const minorDepth = frontIsNS ? depth : width;
  const bayCount = Math.max(1, Math.round(majorSpan / 7.5));
  const baySpan = majorSpan / bayCount;
  const baseWallMat = getSkylineMaterial(tower.palette);

  return (
    <group name={`skyline-${tower.id}`} position={[cx, 0, cz]}>
      {Array.from({ length: bayCount }, (_, bIdx) => {
        const bayOffset = -majorSpan * 0.5 + (bIdx + 0.5) * baySpan;
        const heightVar =
          bayCount === 1
            ? 0
            : bIdx % 3 === 1
              ? 1.8
              : bIdx % 3 === 2
                ? -0.95
                : 0.45;
        const bayH = Math.max(14.0, tower.height + heightVar) + towerHeightNudge(tower.id);
        const bayW = frontIsNS ? baySpan : minorDepth;
        const bayD = frontIsNS ? minorDepth : baySpan;
        const bayMat =
          bIdx === 0
            ? baseWallMat
            : SKYLINE_BAY_WALL_MATS[
                (bIdx + tower.id.length) % SKYLINE_BAY_WALL_MATS.length
              ]!;
        const shutterMat =
          SKYLINE_SHUTTER_MATS[bIdx % SKYLINE_SHUTTER_MATS.length]!;
        const winCols = Math.max(2, Math.min(3, Math.floor(baySpan / 2.6)));
        const storiesAbove = Math.max(2, tower.stories - 1);
        const hasTerracottaRoof =
          tower.roofStyle === 'hipped_terracotta_tile' ||
          (bayCount > 1 && bIdx % 2 === 0);

        return (
          <group
            key={`palazzo-bay-${bIdx}`}
            position={frontIsNS ? [bayOffset, 0, 0] : [0, 0, bayOffset]}
          >
            {/* Stepped Palazzo Wall Volume */}
            <mesh position={[0, baseY + bayH * 0.5, 0]} material={bayMat}>
              <boxGeometry args={[bayW - 0.04, bayH, bayD - 0.04]} />
            </mesh>

            {/* Cream Limestone Corner Pilasters & Belt Courses */}
            <mesh
              position={[0, baseY + bayH - 3.6, 0]}
              material={VENICE_MATERIALS.skylineLimestone}
            >
              <boxGeometry args={[bayW + 0.26, 0.24, bayD + 0.26]} />
            </mesh>
            <mesh
              position={[0, baseY + bayH + 0.14, 0]}
              material={VENICE_MATERIALS.stuccoCreamLimestone}
            >
              <boxGeometry args={[bayW + 0.3, 0.28, bayD + 0.3]} />
            </mesh>
            {/* Carved Eave Corbel Dentils Directly Beneath Palazzo Cornice */}
            {Array.from(
              { length: Math.max(4, Math.floor(baySpan / 0.95)) },
              (_, di) => {
                const dentilCount = Math.max(4, Math.floor(baySpan / 0.95));
                const du =
                  -baySpan * 0.44 +
                  (di / Math.max(1, dentilCount - 1)) * (baySpan * 0.88);
                const dentilPos: [number, number, number] = frontIsNS
                  ? [du, baseY + bayH - 0.1, faceSign * (bayD * 0.5 + 0.04)]
                  : [faceSign * (bayW * 0.5 + 0.04), baseY + bayH - 0.1, du];
                return (
                  <mesh
                    key={`pcorbel-${di}`}
                    position={dentilPos}
                    material={VENICE_MATERIALS.stuccoCreamLimestone}
                  >
                    <boxGeometry
                      args={frontIsNS ? [0.18, 0.2, 0.16] : [0.16, 0.2, 0.18]}
                    />
                  </mesh>
                );
              },
            )}

            {/* Framed Venetian Shuttered Windows across upper stories */}
            {Array.from({ length: storiesAbove }, (_, sIdx) => {
              const wy = baseY + 11.2 + sIdx * 3.1;
              if (wy > baseY + bayH - 1.35) return null;
              return Array.from({ length: winCols }, (_, cIdx) => {
                const uOff = (-0.5 + (cIdx + 0.5) / winCols) * (baySpan * 0.72);
                const winPos: [number, number, number] = frontIsNS
                  ? [uOff, wy, faceSign * (bayD * 0.5 + 0.005)]
                  : [faceSign * (bayW * 0.5 + 0.005), wy, uOff];
                const isLit = (bIdx + sIdx + cIdx) % 3 === 0;
                return (
                  <group
                    key={`pwin-${sIdx}-${cIdx}`}
                    position={winPos}
                    rotation={[0, frontIsNS ? (faceSign > 0 ? 0 : Math.PI) : faceSign > 0 ? Math.PI * 0.5 : -Math.PI * 0.5, 0]}
                  >
                    {/* Limestone architrave surround (seated cleanly into wall face at -0.025) */}
                    <mesh
                      position={[0, 0, -0.015]}
                      material={VENICE_MATERIALS.stuccoCreamLimestone}
                    >
                      <boxGeometry args={[1.18, 1.82, 0.08]} />
                    </mesh>
                    {/* Projecting stone window sill */}
                    <mesh
                      position={[0, -0.94, 0.06]}
                      material={VENICE_MATERIALS.graniteCurbBevelTop}
                    >
                      <boxGeometry args={[1.34, 0.12, 0.2]} />
                    </mesh>
                    {/* Warm sunset-lit or dark reflected glass pane + Cross Muntin Sash Bars */}
                    <mesh
                      position={[0, 0, 0.025]}
                      material={
                        isLit
                          ? WINDOW_LIT_DECAL_MAT
                          : WINDOW_DARK_DECAL_MAT
                      }
                    >
                      <boxGeometry args={[0.92, 1.54, 0.05]} />
                    </mesh>
                    <mesh
                      position={[0, 0, 0.045]}
                      material={SKYLINE_MULLION_MAT}
                    >
                      <boxGeometry args={[0.05, 1.54, 0.03]} />
                    </mesh>
                    <mesh
                      position={[0, 0.18, 0.048]}
                      material={SKYLINE_MULLION_MAT}
                    >
                      <boxGeometry args={[0.92, 0.05, 0.03]} />
                    </mesh>
                    {/* Paired Venetian Shutters seated flush against facade */}
                    <mesh position={[-0.72, 0, 0.005]} material={shutterMat}>
                      <boxGeometry args={[0.38, 1.56, 0.06]} />
                    </mesh>
                    <mesh position={[0.72, 0, 0.005]} material={shutterMat}>
                      <boxGeometry args={[0.38, 1.56, 0.06]} />
                    </mesh>
                  </group>
                );
              });
            })}

            {/* Flush Fitted Hipped Terracotta Roof OR Stepped Parapet + Venetian Chimney */}
            {hasTerracottaRoof ? (
              <FittedHippedRoof
                position={[0, baseY + bayH + 0.28, 0]}
                widthX={bayW + 0.36}
                depthZ={bayD + 0.36}
                rise={1.55}
                material={
                  tower.roofStyle === 'mansard_slate'
                    ? VENICE_MATERIALS.roofMansardSlate
                    : roofMat
                }
              />
            ) : (
              <mesh
                position={[0, baseY + bayH + 0.45, 0]}
                material={VENICE_MATERIALS.stuccoCreamDeep}
              >
                <boxGeometry args={[bayW - 0.12, 0.36, bayD - 0.12]} />
              </mesh>
            )}

            {/* Brick Venetian Chimney Stack & Flared Pot */}
            {bIdx % 2 === 0 && (
              <group
                position={[
                  frontIsNS ? bayW * 0.24 : 0,
                  baseY + bayH + (hasTerracottaRoof ? 1.45 : 0.9),
                  frontIsNS ? 0 : bayD * 0.24,
                ]}
              >
                <mesh material={VENICE_MATERIALS.brickBrownstone}>
                  <boxGeometry args={[0.56, 1.25, 0.56]} />
                </mesh>
                <mesh
                  position={[0, 0.7, 0]}
                  material={VENICE_MATERIALS.stuccoCreamLimestone}
                >
                  <boxGeometry args={[0.7, 0.16, 0.7]} />
                </mesh>
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}
