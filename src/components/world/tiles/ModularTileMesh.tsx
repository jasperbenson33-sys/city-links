'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  FlagColor,
  PlacedTile,
  TileBlueprintId,
  TileBoxSurface,
  TileRampSpec,
  WaterZoneSpec,
} from '@/types';
import { ELEVATIONS } from '@/types';
import { TILE_BLUEPRINTS } from '@/engine';
import { TOYBOX_MATERIALS } from '@/materials';
import { CupFlagAssembly } from './CupFlagAssembly';
import {
  createArcBandExtrusion,
  createCornerSquareOutsideArcExtrusion,
  createGreenPadWithCupCutout,
} from './tileGeometry';

const PLINTH_BASE_Y = -0.34;
const CUP_CUTOUT_RADIUS = 0.24;

// Cache compiled tile ExtrudeGeometry buffers by stable key so 36-tile boards & QA sweeps share VBOs.
const GEOMETRY_CACHE = new Map<string, THREE.BufferGeometry>();

function cachedGeo(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = GEOMETRY_CACHE.get(key);
  if (!geo) {
    geo = factory();
    GEOMETRY_CACHE.set(key, geo);
  }
  return geo;
}

function materialForSurface(kind: TileBoxSurface['kind']): THREE.Material {
  switch (kind) {
    case 'asphalt':
      return TOYBOX_MATERIALS.asphaltBlacktop;
    case 'sidewalk':
      return TOYBOX_MATERIALS.limestoneSidewalk;
    case 'turf_green':
      return TOYBOX_MATERIALS.turfEmerald;
    case 'terrace_deck':
      return TOYBOX_MATERIALS.terracottaTerrace;
    case 'gutter_trough':
      return TOYBOX_MATERIALS.asphaltDarkGutter;
    case 'water_basin':
      return TOYBOX_MATERIALS.turquoiseWaterDeep;
    case 'stone_rim':
    case 'curb_wall':
      return TOYBOX_MATERIALS.limestoneCurb;
    default:
      return TOYBOX_MATERIALS.limestoneSidewalk;
  }
}

interface RampWedgeProps {
  ramp: TileRampSpec;
  surfaceKind: 'terrace' | 'sidewalk' | 'asphalt';
  showWireframe?: boolean;
}

function RampAssembly({ ramp, surfaceKind, showWireframe = false }: RampWedgeProps) {
  const mat =
    surfaceKind === 'terrace'
      ? TOYBOX_MATERIALS.terracottaTerrace
      : surfaceKind === 'asphalt'
        ? TOYBOX_MATERIALS.asphaltBlacktop
        : TOYBOX_MATERIALS.limestoneTrim;

  const spanX = ramp.localBoundsXZ.maxX - ramp.localBoundsXZ.minX;
  const midX = (ramp.localBoundsXZ.minX + ramp.localBoundsXZ.maxX) * 0.5;
  const { minZ, maxZ } = ramp.localBoundsXZ;

  // Extruded right-trapezoid wedge matching exact ramp incline underneath without poking above it
  const wedgeGeo = useMemo(() => {
    const cacheKey = `ramp-wedge-v2-${ramp.id}-${spanX.toFixed(3)}-${minZ.toFixed(3)}-${maxZ.toFixed(3)}-${ramp.bottomY.toFixed(3)}-${ramp.topY.toFixed(3)}-${ramp.climbDirection}`;
    return cachedGeo(cacheKey, () => {
      const yAtMinZ = ramp.climbDirection === 'north' ? ramp.topY : ramp.bottomY;
      const yAtMaxZ = ramp.climbDirection === 'north' ? ramp.bottomY : ramp.topY;
      const insetZ = 0.018;
      const zStart = minZ + insetZ;
      const zEnd = maxZ - insetZ;
      const wedgeBaseY = ramp.bottomY > 0.14 ? 0.13 : PLINTH_BASE_Y + 0.01;
      // Inset XZ inside the parent riding slab so no triangle edges poke above or z-fight
      const shape = new THREE.Shape();
      shape.moveTo(-zEnd, wedgeBaseY);
      shape.lineTo(-zStart, wedgeBaseY);
      shape.lineTo(-zStart, yAtMinZ - 0.024);
      shape.lineTo(-zEnd, yAtMaxZ - 0.024);
      shape.closePath();

      const depthX = Math.max(0.08, spanX - 0.06);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: depthX,
        bevelEnabled: false,
      });
      geo.rotateY(Math.PI * 0.5);
      geo.translate(midX - depthX * 0.5, 0, 0);
      geo.computeVertexNormals();
      return geo;
    });
  }, [ramp.id, ramp.bottomY, ramp.topY, ramp.climbDirection, spanX, midX, minZ, maxZ]);

  return (
    <group name={`ramp-${ramp.id}`}>
      {/* True Sloped Terracotta/Stone Under-Ramp Wedge Foundation */}
      <mesh
        receiveShadow
        geometry={wedgeGeo}
        material={
          surfaceKind === 'terrace'
            ? TOYBOX_MATERIALS.terracottaBrick
            : TOYBOX_MATERIALS.limestoneCurb
        }
      />
      {/* Top inclined riding slab matching exact physics orientation */}
      <mesh
        castShadow
        receiveShadow
        position={ramp.center}
        rotation={ramp.rotation}
        material={mat}
      >
        <boxGeometry args={ramp.size} />
      </mesh>
      {/* Subtle amber warning cleats at foot of ramp */}
      <mesh
        position={[
          midX,
          ramp.bottomY + 0.006,
          ramp.climbDirection === 'north' ? maxZ - 0.14 : minZ + 0.14,
        ]}
        material={TOYBOX_MATERIALS.tactileAdaPad}
      >
        <boxGeometry args={[spanX - 0.25, 0.012, 0.14]} />
      </mesh>
      {showWireframe && (
        <mesh
          position={ramp.center}
          rotation={ramp.rotation}
          material={TOYBOX_MATERIALS.qaSensorWireframe}
        >
          <boxGeometry args={ramp.size} />
        </mesh>
      )}
    </group>
  );
}

function WaterZoneSurface({
  zone,
  showWireframe = false,
}: {
  zone: WaterZoneSpec;
  showWireframe?: boolean;
}) {
  const sheenRef = useRef<THREE.Mesh>(null);
  const boxSheenRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const s = 1 + Math.sin(t * 2.1 + zone.center[0]) * 0.018;
    if (sheenRef.current) {
      sheenRef.current.scale.set(s, 1, s);
    }
    if (boxSheenRef.current) {
      boxSheenRef.current.scale.set(s, 1, s);
    }
  });

  if (zone.shape === 'cylinder') {
    const r = zone.radius ?? 1.5;
    return (
      <group position={[zone.center[0], zone.surfaceY, zone.center[2]]}>
        <mesh material={TOYBOX_MATERIALS.turquoiseWater}>
          <cylinderGeometry args={[r, r, 0.02, 28]} />
        </mesh>
        {/* Stepped submerged limestone rim ledge */}
        <mesh
          position={[0, -0.042, 0]}
          rotation={[-Math.PI * 0.5, 0, 0]}
          material={TOYBOX_MATERIALS.poolWallLimestone}
        >
          <ringGeometry args={[r * 0.86, r * 0.99, 28]} />
        </mesh>
        <mesh
          ref={sheenRef}
          position={[0, 0.012, 0]}
          rotation={[-Math.PI * 0.5, 0, 0]}
          material={TOYBOX_MATERIALS.waterFoamWhite}
        >
          <ringGeometry args={[r * 0.62, r * 0.72, 28]} />
        </mesh>
        <mesh
          position={[0, 0.013, 0]}
          rotation={[-Math.PI * 0.5, 0, 0]}
          material={TOYBOX_MATERIALS.waterFoamWhite}
        >
          <ringGeometry args={[r * 0.87, r * 0.92, 28]} />
        </mesh>
        {/* Subtle lily pads flanking the fountain plinth */}
        <group position={[r * 0.54, 0.014, r * 0.52]}>
          <mesh material={TOYBOX_MATERIALS.lilyPadGreen}>
            <cylinderGeometry args={[0.2, 0.21, 0.011, 14]} />
          </mesh>
          <mesh position={[0.02, 0.03, -0.01]} material={TOYBOX_MATERIALS.lilyBlossomPink}>
            <dodecahedronGeometry args={[0.055, 0]} />
          </mesh>
        </group>
        <mesh position={[-r * 0.58, 0.014, -r * 0.48]} material={TOYBOX_MATERIALS.lilyPadDeep}>
          <cylinderGeometry args={[0.16, 0.17, 0.01, 12]} />
        </mesh>
        {showWireframe && (
          <mesh material={TOYBOX_MATERIALS.qaSensorWireframe}>
            <cylinderGeometry args={[r, r, zone.height, 18]} />
          </mesh>
        )}
      </group>
    );
  }

  const [sx, , sz] = zone.size ?? [1.5, 0.2, 4.0];
  const shelfW = Math.min(0.16, sx * 0.12);
  const shelfD = Math.min(0.16, sz * 0.12);
  const showLilyPads = sx >= 1.25 && sz >= 1.75;
  const isOpenNorthCanal = zone.id === 'canal-reflection-pool';
  const waterLengthZ = isOpenNorthCanal ? sz + 0.025 : sz;
  const waterOffsetZ = isOpenNorthCanal ? -0.0125 : 0;

  return (
    <group position={[zone.center[0], zone.surfaceY, zone.center[2]]}>
      <mesh position={[0, 0, waterOffsetZ]} material={TOYBOX_MATERIALS.turquoiseWater}>
        <boxGeometry args={[sx, 0.024, waterLengthZ]} />
      </mesh>

      {/* Stepped submerged limestone pool shelf visible beneath translucent turquoise water */}
      {[-(sx * 0.5 - shelfW * 0.5), sx * 0.5 - shelfW * 0.5].map((lx, i) => (
        <mesh key={`shelf-x-${i}`} position={[lx, -0.042, waterOffsetZ]} material={TOYBOX_MATERIALS.poolWallLimestone}>
          <boxGeometry args={[shelfW, 0.06, Math.max(0.1, waterLengthZ - 0.02)]} />
        </mesh>
      ))}
      {(isOpenNorthCanal
        ? [sz * 0.5 - shelfD * 0.5]
        : [-(sz * 0.5 - shelfD * 0.5), sz * 0.5 - shelfD * 0.5]
      ).map((lz, i) => (
        <mesh key={`shelf-z-${i}`} position={[0, -0.042, lz]} material={TOYBOX_MATERIALS.poolWallLimestone}>
          <boxGeometry args={[Math.max(0.1, sx - 0.02), 0.06, shelfD]} />
        </mesh>
      ))}

      {/* Crisp shoreline water ripple frame (North open when canal-reflection-pool pairs across tiles) */}
      <group ref={boxSheenRef} position={[0, 0.015, 0]}>
        {[-(sx * 0.5 - 0.12), sx * 0.5 - 0.12].map((rx, i) => (
          <mesh key={`rim-x-${i}`} position={[rx, 0, 0]} material={TOYBOX_MATERIALS.waterFoamWhite}>
            <boxGeometry args={[0.055, 0.004, Math.max(0.2, sz - 0.14)]} />
          </mesh>
        ))}
        {(zone.id === 'canal-reflection-pool'
          ? [sz * 0.5 - 0.12]
          : [-(sz * 0.5 - 0.12), sz * 0.5 - 0.12]
        ).map((rz, i) => (
          <mesh key={`rim-z-${i}`} position={[0, 0, rz]} material={TOYBOX_MATERIALS.waterFoamWhite}>
            <boxGeometry args={[Math.max(0.2, sx - 0.2), 0.004, 0.055]} />
          </mesh>
        ))}
      </group>

      {/* Subtle toybox lily pads & coral lotus bud inside park reflection pools */}
      {showLilyPads && (
        <group position={[0, 0.015, 0]}>
          <group position={[-sx * 0.26, 0, sz * 0.26]}>
            <mesh material={TOYBOX_MATERIALS.lilyPadGreen}>
              <cylinderGeometry args={[0.23, 0.24, 0.012, 14]} />
            </mesh>
            <mesh position={[0.02, 0.032, -0.02]} material={TOYBOX_MATERIALS.lilyBlossomPink}>
              <dodecahedronGeometry args={[0.065, 0]} />
            </mesh>
          </group>
          <mesh position={[-sx * 0.15, 0, sz * 0.34]} material={TOYBOX_MATERIALS.lilyPadDeep}>
            <cylinderGeometry args={[0.15, 0.16, 0.01, 12]} />
          </mesh>
          <group position={[sx * 0.25, 0, -sz * 0.24]}>
            <mesh material={TOYBOX_MATERIALS.lilyPadGreen}>
              <cylinderGeometry args={[0.2, 0.21, 0.012, 14]} />
            </mesh>
            <mesh position={[-0.01, 0.028, 0.01]} material={TOYBOX_MATERIALS.lilyBlossomPink}>
              <dodecahedronGeometry args={[0.055, 0]} />
            </mesh>
          </group>
        </group>
      )}

      {showWireframe && (
        <mesh material={TOYBOX_MATERIALS.qaSensorWireframe}>
          <boxGeometry args={[sx, zone.height, sz]} />
        </mesh>
      )}
    </group>
  );
}

/** Flush 2m-grid architectural limestone flagstone seams & alternating warm pavers for any sidewalk slab. */
function SidewalkSlabPaving({ slab }: { slab: TileBoxSurface }) {
  const w = slab.size[0];
  const d = slab.size[2];
  if (w < 0.75 || d < 0.75) return null;

  const minX = slab.center[0] - w * 0.5;
  const maxX = slab.center[0] + w * 0.5;
  const minZ = slab.center[2] - d * 0.5;
  const maxZ = slab.center[2] + d * 0.5;
  const topY = slab.topY;

  // Clip 2.0m modular grid seams strictly inside the sidewalk slab
  const xLines = [-2, 0, 2].filter((x) => x > minX + 0.14 && x < maxX - 0.14);
  const zLines = [-2, 0, 2].filter((z) => z > minZ + 0.14 && z < maxZ - 0.14);

  const checkerCells: Array<{ cx: number; cz: number; cw: number; cd: number }> = [];
  if (w >= 1.5 && d >= 1.5) {
    for (let ix = 0; ix < 4; ix++) {
      const cMinX = Math.max(minX + 0.05, -4 + ix * 2 + 0.05);
      const cMaxX = Math.min(maxX - 0.05, -4 + (ix + 1) * 2 - 0.05);
      if (cMaxX - cMinX < 0.55) continue;
      for (let iz = 0; iz < 4; iz++) {
        if ((ix + iz) % 2 !== 0) continue;
        const cMinZ = Math.max(minZ + 0.05, -4 + iz * 2 + 0.05);
        const cMaxZ = Math.min(maxZ - 0.05, -4 + (iz + 1) * 2 - 0.05);
        if (cMaxZ - cMinZ < 0.55) continue;
        checkerCells.push({
          cx: (cMinX + cMaxX) * 0.5,
          cz: (cMinZ + cMaxZ) * 0.5,
          cw: cMaxX - cMinX,
          cd: cMaxZ - cMinZ,
        });
      }
    }
  }

  return (
    <group name={`paving-${slab.id}`}>
      {checkerCells.map((cell, i) => (
        <mesh
          key={`chk-${i}`}
          receiveShadow
          position={[cell.cx, topY + 0.0014, cell.cz]}
          material={TOYBOX_MATERIALS.plazaPaverWarm}
        >
          <boxGeometry args={[cell.cw, 0.0028, cell.cd]} />
        </mesh>
      ))}
      {xLines.map((lx) => (
        <mesh
          key={`gx-${lx}`}
          position={[lx, topY + 0.0019, slab.center[2]]}
          material={TOYBOX_MATERIALS.plazaGrout}
        >
          <boxGeometry args={[0.042, 0.0036, Math.max(0.1, d - 0.08)]} />
        </mesh>
      ))}
      {zLines.map((lz) => (
        <mesh
          key={`gz-${lz}`}
          position={[slab.center[0], topY + 0.0019, lz]}
          material={TOYBOX_MATERIALS.plazaGrout}
        >
          <boxGeometry args={[Math.max(0.1, w - 0.08), 0.0036, 0.042]} />
        </mesh>
      ))}
    </group>
  );
}

/** Decorative metallic storm-drain grates inside recessed -0.06m straight gutter troughs. */
function StraightGutterGrates({
  x,
  zStart,
  zEnd,
  width,
  troughY,
}: {
  x: number;
  zStart: number;
  zEnd: number;
  width: number;
  troughY: number;
}) {
  const span = Math.abs(zEnd - zStart);
  const zMid = (zStart + zEnd) * 0.5;
  const gratePositions =
    span > 5.5 ? [zMid - 2.65, zMid, zMid + 2.65] : span > 3.2 ? [zMid - 1.35, zMid + 1.35] : [zMid];
  return (
    <group>
      {/* Continuous rainwater glint strip inside recessed gutter */}
      <mesh
        position={[x, troughY + 0.003, zMid]}
        material={TOYBOX_MATERIALS.gutterWaterTrickle}
      >
        <boxGeometry args={[width * 0.44, 0.004, span - 0.14]} />
      </mesh>
      {gratePositions.map((gz, idx) => (
        <group key={idx} position={[x, troughY + 0.008, gz]}>
          {/* Steel grate bed & crisp metallic rim */}
          <mesh material={TOYBOX_MATERIALS.stormDrainSteel}>
            <boxGeometry args={[width * 0.82, 0.011, 0.62]} />
          </mesh>
          <mesh position={[0, 0.004, 0]} material={TOYBOX_MATERIALS.chromeSilver}>
            <boxGeometry args={[width * 0.84, 0.005, 0.64]} />
          </mesh>
          <mesh position={[0, 0.0055, 0]} material={TOYBOX_MATERIALS.asphaltDarkGutter}>
            <boxGeometry args={[width * 0.72, 0.006, 0.52]} />
          </mesh>
          {[-0.2, -0.1, 0.0, 0.1, 0.2].map((barZ, bIdx) => (
            <mesh key={bIdx} position={[0, 0.009, barZ]} material={TOYBOX_MATERIALS.darkIron}>
              <boxGeometry args={[width * 0.74, 0.009, 0.036]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Tile-specific sculptural surfaces, curved 90-degree storm-drain tracks, road markings, and cup details. */
function TileSculptedDetails({
  blueprintId,
  flagColor,
  isSunk,
}: {
  blueprintId: TileBlueprintId;
  flagColor?: FlagColor;
  isSunk: boolean;
}) {
  const bp = TILE_BLUEPRINTS[blueprintId];

  const customCornerGeos = useMemo(() => {
    if (blueprintId === 'road_corner_gutter') {
      return {
        outerSidewalk: cachedGeo('rcg-outer-sw', () =>
          createCornerSquareOutsideArcExtrusion({
            pivotX: 4,
            pivotZ: -4,
            innerR: 6.4,
            startTheta: Math.PI * 0.5,
            endTheta: Math.PI,
            bottomY: PLINTH_BASE_Y,
            topY: ELEVATIONS.SIDEWALK_Y,
            segments: 28,
          })
        ),
        outerCurbRim: cachedGeo('rcg-outer-curb', () =>
          createArcBandExtrusion({
            pivotX: 4,
            pivotZ: -4,
            innerR: 6.38,
            outerR: 6.5,
            startTheta: Math.PI * 0.5,
            endTheta: Math.PI,
            bottomY: ELEVATIONS.GUTTER_TROUGH_Y,
            topY: ELEVATIONS.SIDEWALK_Y + 0.003,
            segments: 28,
          })
        ),
        outerGutterTrough: cachedGeo('rcg-outer-gutter', () =>
          createArcBandExtrusion({
            pivotX: 4,
            pivotZ: -4,
            innerR: 5.88,
            outerR: 6.4,
            startTheta: Math.PI * 0.5,
            endTheta: Math.PI,
            bottomY: PLINTH_BASE_Y,
            topY: ELEVATIONS.GUTTER_TROUGH_Y,
            segments: 28,
          })
        ),
        asphaltSweep: cachedGeo('rcg-asphalt', () =>
          createArcBandExtrusion({
            pivotX: 4,
            pivotZ: -4,
            innerR: 2.12,
            outerR: 5.88,
            startTheta: Math.PI * 0.5,
            endTheta: Math.PI,
            bottomY: PLINTH_BASE_Y,
            topY: ELEVATIONS.STREET_Y,
            segments: 28,
          })
        ),
        innerGutterTrough: cachedGeo('rcg-inner-gutter', () =>
          createArcBandExtrusion({
            pivotX: 4,
            pivotZ: -4,
            innerR: 1.6,
            outerR: 2.12,
            startTheta: Math.PI * 0.5,
            endTheta: Math.PI,
            bottomY: PLINTH_BASE_Y,
            topY: ELEVATIONS.GUTTER_TROUGH_Y,
            segments: 20,
          })
        ),
        innerCurbRim: cachedGeo('rcg-inner-curb', () =>
          createArcBandExtrusion({
            pivotX: 4,
            pivotZ: -4,
            innerR: 1.5,
            outerR: 1.62,
            startTheta: Math.PI * 0.5,
            endTheta: Math.PI,
            bottomY: ELEVATIONS.GUTTER_TROUGH_Y,
            topY: ELEVATIONS.SIDEWALK_Y + 0.003,
            segments: 20,
          })
        ),
        innerSidewalk: cachedGeo('rcg-inner-sw', () =>
          createArcBandExtrusion({
            pivotX: 4,
            pivotZ: -4,
            innerR: 0,
            outerR: 1.6,
            startTheta: Math.PI * 0.5,
            endTheta: Math.PI,
            bottomY: PLINTH_BASE_Y,
            topY: ELEVATIONS.SIDEWALK_Y,
            segments: 20,
          })
        ),
        rainSheenOuter: cachedGeo('rcg-sheen-outer', () =>
          createArcBandExtrusion({
            pivotX: 4,
            pivotZ: -4,
            innerR: 6.03,
            outerR: 6.25,
            startTheta: Math.PI * 0.51,
            endTheta: Math.PI * 0.99,
            bottomY: ELEVATIONS.GUTTER_TROUGH_Y,
            topY: ELEVATIONS.GUTTER_TROUGH_Y + 0.004,
            segments: 24,
          })
        ),
        rainSheenInner: cachedGeo('rcg-sheen-inner', () =>
          createArcBandExtrusion({
            pivotX: 4,
            pivotZ: -4,
            innerR: 1.76,
            outerR: 1.96,
            startTheta: Math.PI * 0.52,
            endTheta: Math.PI * 0.98,
            bottomY: ELEVATIONS.GUTTER_TROUGH_Y,
            topY: ELEVATIONS.GUTTER_TROUGH_Y + 0.004,
            segments: 20,
          })
        ),
        outerCurbChamfer: cachedGeo('rcg-outer-curb-chamfer', () =>
          createArcBandExtrusion({
            pivotX: 4,
            pivotZ: -4,
            innerR: 6.4,
            outerR: 6.48,
            startTheta: Math.PI * 0.5,
            endTheta: Math.PI,
            bottomY: ELEVATIONS.SIDEWALK_Y + 0.002,
            topY: ELEVATIONS.SIDEWALK_Y + 0.009,
            segments: 28,
          })
        ),
        innerCurbChamfer: cachedGeo('rcg-inner-curb-chamfer', () =>
          createArcBandExtrusion({
            pivotX: 4,
            pivotZ: -4,
            innerR: 1.52,
            outerR: 1.6,
            startTheta: Math.PI * 0.5,
            endTheta: Math.PI,
            bottomY: ELEVATIONS.SIDEWALK_Y + 0.002,
            topY: ELEVATIONS.SIDEWALK_Y + 0.009,
            segments: 20,
          })
        ),
      };
    }
    if (blueprintId === 'curb_gutter_corner_90') {
      return {
        turnoutDrainBed: cachedGeo('cgc-drain-v2', () =>
          createArcBandExtrusion({
            pivotX: -0.26,
            pivotZ: -2.2,
            innerR: 1.66,
            outerR: 2.08,
            startTheta: Math.PI * 0.5,
            endTheta: Math.PI,
            bottomY: ELEVATIONS.STREET_Y,
            topY: ELEVATIONS.STREET_Y + 0.005,
            segments: 20,
          })
        ),
        turnoutCurb: cachedGeo('cgc-curb-v2', () =>
          createArcBandExtrusion({
            pivotX: -0.26,
            pivotZ: -2.2,
            innerR: 2.08,
            outerR: 2.2,
            startTheta: Math.PI * 0.5,
            endTheta: Math.PI,
            bottomY: ELEVATIONS.STREET_Y,
            topY: ELEVATIONS.STREET_Y + 0.012,
            segments: 20,
          })
        ),
      };
    }
    return null;
  }, [blueprintId]);

  // Road centerline dashes helper
  const zebraX = [-1.42, -0.85, -0.28, 0.28, 0.85, 1.42];
  const zebraZ = [-1.42, -0.85, -0.28, 0.28, 0.85, 1.42];

  return (
    <group name={`tile-details-${blueprintId}`}>
      {/* Sculpted curved 90-degree corner road + dual recessed -0.06m U-gutters */}
      {blueprintId === 'road_corner_gutter' && customCornerGeos && 'outerSidewalk' in customCornerGeos && (
        <group>
          <mesh receiveShadow geometry={customCornerGeos.outerSidewalk} material={TOYBOX_MATERIALS.limestoneSidewalk} />
          <mesh receiveShadow geometry={customCornerGeos.outerCurbRim} material={TOYBOX_MATERIALS.limestoneCurb} />
          <mesh receiveShadow geometry={customCornerGeos.outerCurbChamfer} material={TOYBOX_MATERIALS.limestoneTrim} />
          <mesh receiveShadow geometry={customCornerGeos.outerGutterTrough} material={TOYBOX_MATERIALS.asphaltDarkGutter} />
          <mesh geometry={customCornerGeos.rainSheenOuter} material={TOYBOX_MATERIALS.gutterWaterTrickle} />
          <mesh receiveShadow geometry={customCornerGeos.asphaltSweep} material={TOYBOX_MATERIALS.asphaltBlacktop} />
          <mesh receiveShadow geometry={customCornerGeos.innerGutterTrough} material={TOYBOX_MATERIALS.asphaltDarkGutter} />
          <mesh geometry={customCornerGeos.rainSheenInner} material={TOYBOX_MATERIALS.gutterWaterTrickle} />
          <mesh receiveShadow geometry={customCornerGeos.innerCurbRim} material={TOYBOX_MATERIALS.limestoneCurb} />
          <mesh receiveShadow geometry={customCornerGeos.innerCurbChamfer} material={TOYBOX_MATERIALS.limestoneTrim} />
          <mesh receiveShadow geometry={customCornerGeos.innerSidewalk} material={TOYBOX_MATERIALS.limestoneSidewalk} />
          {/* Curved metallic storm-drain grates inside outer & inner -0.06m curved gutters */}
          {[
            { r: 6.14, frac: 0.58 },
            { r: 6.14, frac: 0.75 },
            { r: 6.14, frac: 0.92 },
            { r: 1.86, frac: 0.75 },
          ].map((g, gIdx) => {
            const th = Math.PI * g.frac;
            const gx = 4 + Math.cos(th) * g.r;
            const gz = -4 + Math.sin(th) * g.r;
            return (
              <group
                key={`rcg-grate-${gIdx}`}
                position={[gx, ELEVATIONS.GUTTER_TROUGH_Y + 0.008, gz]}
                rotation={[0, -th, 0]}
              >
                <mesh material={TOYBOX_MATERIALS.stormDrainSteel}>
                  <boxGeometry args={[0.42, 0.01, 0.58]} />
                </mesh>
                <mesh position={[0, 0.004, 0]} material={TOYBOX_MATERIALS.chromeSilver}>
                  <boxGeometry args={[0.44, 0.005, 0.6]} />
                </mesh>
                <mesh position={[0, 0.0055, 0]} material={TOYBOX_MATERIALS.asphaltDarkGutter}>
                  <boxGeometry args={[0.35, 0.006, 0.5]} />
                </mesh>
                {[-0.18, -0.09, 0.0, 0.09, 0.18].map((barZ, bIdx) => (
                  <mesh key={bIdx} position={[0, 0.0085, barZ]} material={TOYBOX_MATERIALS.darkIron}>
                    <boxGeometry args={[0.37, 0.008, 0.034]} />
                  </mesh>
                ))}
              </group>
            );
          })}
          {/* Curved dashed amber centerline */}
          {[0.58, 0.69, 0.8, 0.91].map((frac, idx) => {
            const th = Math.PI * frac;
            const r = 4.0;
            const dx = 4 + Math.cos(th) * r;
            const dz = -4 + Math.sin(th) * r;
            return (
              <mesh
                key={idx}
                position={[dx, ELEVATIONS.STREET_Y + 0.004, dz]}
                rotation={[0, -th, 0]}
                material={TOYBOX_MATERIALS.crosswalkAmber}
              >
                <boxGeometry args={[0.14, 0.005, 0.72]} />
              </mesh>
            );
          })}
        </group>
      )}

      {/* Cul-de-sac gutter pocket grates, curved skimmer rail apron & ramp cheek bevels */}
      {blueprintId === 'curb_gutter_corner_90' && customCornerGeos && 'turnoutDrainBed' in customCornerGeos && (
        <group>
          <StraightGutterGrates x={-2.14} zStart={-4} zEnd={-0.45} width={0.52} troughY={ELEVATIONS.GUTTER_TROUGH_Y} />
          <StraightGutterGrates x={2.14} zStart={-4} zEnd={-0.45} width={0.52} troughY={ELEVATIONS.GUTTER_TROUGH_Y} />
          <mesh receiveShadow geometry={customCornerGeos.turnoutDrainBed} material={TOYBOX_MATERIALS.stormDrainSteel} />
          <mesh receiveShadow geometry={customCornerGeos.turnoutCurb} material={TOYBOX_MATERIALS.limestoneTrim} />
          {[0.6, 0.75, 0.9].map((frac, gIdx) => {
            const th = Math.PI * frac;
            const r = 1.87;
            const gx = -0.26 + Math.cos(th) * r;
            const gz = -2.2 + Math.sin(th) * r;
            return (
              <group
                key={`cgc-bar-${gIdx}`}
                position={[gx, ELEVATIONS.STREET_Y + 0.008, gz]}
                rotation={[0, -th, 0]}
              >
                <mesh material={TOYBOX_MATERIALS.chromeSilver}>
                  <boxGeometry args={[0.36, 0.006, 0.44]} />
                </mesh>
                {[-0.14, -0.05, 0.05, 0.14].map((bz, bi) => (
                  <mesh key={bi} position={[0, 0.005, bz]} material={TOYBOX_MATERIALS.darkIron}>
                    <boxGeometry args={[0.3, 0.006, 0.032]} />
                  </mesh>
                ))}
              </group>
            );
          })}
          {[-3.1, -1.75].map((zOff, i) => (
            <mesh key={`cgc-dash-${i}`} position={[0, ELEVATIONS.STREET_Y + 0.004, zOff]} material={TOYBOX_MATERIALS.crosswalkAmber}>
              <boxGeometry args={[0.13, 0.005, 0.85]} />
            </mesh>
          ))}
          {[-2.44, 2.44].map((cx, i) => (
            <mesh key={`cgc-curb-lip-${i}`} position={[cx, ELEVATIONS.SIDEWALK_Y + 0.005, -2.2]} material={TOYBOX_MATERIALS.limestoneTrim}>
              <boxGeometry args={[0.1, 0.01, 3.6]} />
            </mesh>
          ))}
          {[-1.45, 1.45].map((rx, i) => (
            <mesh key={`cgc-ramp-lip-${i}`} position={[rx, ELEVATIONS.SIDEWALK_Y + 0.005, 0.4]} material={TOYBOX_MATERIALS.limestoneTrim}>
              <boxGeometry args={[0.1, 0.01, 1.6]} />
            </mesh>
          ))}
        </group>
      )}

      {/* Road straight markings & crosswalks */}
      {blueprintId === 'road_straight' && (
        <group>
          {[-2.8, -0.95, 0.95, 2.8].map((zOff, i) => (
            <mesh
              key={`dash-${i}`}
              position={[0, ELEVATIONS.STREET_Y + 0.004, zOff]}
              material={TOYBOX_MATERIALS.crosswalkAmber}
            >
              <boxGeometry args={[0.13, 0.005, 1.05]} />
            </mesh>
          ))}
          {zebraX.map((zx, i) => (
            <mesh
              key={`cw-s-${i}`}
              position={[zx, ELEVATIONS.STREET_Y + 0.004, 3.25]}
              material={TOYBOX_MATERIALS.roadMarkingWhite}
            >
              <boxGeometry args={[0.3, 0.005, 0.95]} />
            </mesh>
          ))}
          <StraightGutterGrates x={-2.14} zStart={-4} zEnd={4} width={0.52} troughY={ELEVATIONS.GUTTER_TROUGH_Y} />
          <StraightGutterGrates x={2.14} zStart={-4} zEnd={4} width={0.52} troughY={ELEVATIONS.GUTTER_TROUGH_Y} />
        </group>
      )}

      {/* Road T-Junction crosswalks & gutter grates */}
      {blueprintId === 'road_t_junction' && (
        <group>
          {zebraX.map((zx, i) => (
            <React.Fragment key={`t-cw-${i}`}>
              <mesh position={[zx, ELEVATIONS.STREET_Y + 0.004, -3.15]} material={TOYBOX_MATERIALS.roadMarkingWhite}>
                <boxGeometry args={[0.3, 0.005, 0.9]} />
              </mesh>
              <mesh position={[zx, ELEVATIONS.STREET_Y + 0.004, 3.15]} material={TOYBOX_MATERIALS.roadMarkingWhite}>
                <boxGeometry args={[0.3, 0.005, 0.9]} />
              </mesh>
            </React.Fragment>
          ))}
          {zebraZ.map((zz, i) => (
            <mesh key={`t-cw-e-${i}`} position={[3.15, ELEVATIONS.STREET_Y + 0.004, zz]} material={TOYBOX_MATERIALS.roadMarkingWhite}>
              <boxGeometry args={[0.9, 0.005, 0.3]} />
            </mesh>
          ))}
          <StraightGutterGrates x={-2.14} zStart={-4} zEnd={4} width={0.52} troughY={ELEVATIONS.GUTTER_TROUGH_Y} />
        </group>
      )}

      {/* 4-Way Cross Intersection Crisp Crosswalks & Center Stop Box */}
      {blueprintId === 'road_cross_intersection' && (
        <group>
          {zebraX.map((zx, i) => (
            <React.Fragment key={`x-cw-ns-${i}`}>
              <mesh position={[zx, ELEVATIONS.STREET_Y + 0.004, -3.18]} material={TOYBOX_MATERIALS.roadMarkingWhite}>
                <boxGeometry args={[0.3, 0.005, 0.92]} />
              </mesh>
              <mesh position={[zx, ELEVATIONS.STREET_Y + 0.004, 3.18]} material={TOYBOX_MATERIALS.roadMarkingWhite}>
                <boxGeometry args={[0.3, 0.005, 0.92]} />
              </mesh>
            </React.Fragment>
          ))}
          {zebraZ.map((zz, i) => (
            <React.Fragment key={`x-cw-ew-${i}`}>
              <mesh position={[-3.18, ELEVATIONS.STREET_Y + 0.004, zz]} material={TOYBOX_MATERIALS.roadMarkingWhite}>
                <boxGeometry args={[0.92, 0.005, 0.3]} />
              </mesh>
              <mesh position={[3.18, ELEVATIONS.STREET_Y + 0.004, zz]} material={TOYBOX_MATERIALS.roadMarkingWhite}>
                <boxGeometry args={[0.92, 0.005, 0.3]} />
              </mesh>
            </React.Fragment>
          ))}
          {/* Subtle yellow crosswalk box outline */}
          <mesh position={[0, ELEVATIONS.STREET_Y + 0.003, 0]} material={TOYBOX_MATERIALS.crosswalkAmber}>
            <boxGeometry args={[0.62, 0.004, 0.62]} />
          </mesh>
        </group>
      )}

      {/* Boulevard twin gutter grates & amber road dashes aligned to canonical ±2.4m street */}
      {blueprintId === 'curb_gutter_boulevard' && (
        <group>
          <StraightGutterGrates x={-2.14} zStart={-4} zEnd={4} width={0.52} troughY={ELEVATIONS.GUTTER_TROUGH_Y} />
          <StraightGutterGrates x={2.14} zStart={-4} zEnd={4} width={0.52} troughY={ELEVATIONS.GUTTER_TROUGH_Y} />
          {[-2.8, -0.95, 0.95, 2.8].map((zOff, i) => (
            <mesh
              key={`blvd-dash-${i}`}
              position={[0, ELEVATIONS.STREET_Y + 0.004, zOff]}
              material={TOYBOX_MATERIALS.crosswalkAmber}
            >
              <boxGeometry args={[0.13, 0.005, 1.05]} />
            </mesh>
          ))}
        </group>
      )}

      {/* Sidewalk Plaza calm sandstone courtyard framing (pairs cleanly with 2m flagstone grid) */}
      {blueprintId === 'sidewalk_plaza_open' && (
        <group position={[0, ELEVATIONS.SIDEWALK_Y + 0.0028, 0]}>
          {[-3.12, 3.12].map((p, i) => (
            <React.Fragment key={`plaza-frame-${i}`}>
              <mesh position={[p, 0, 0]} material={TOYBOX_MATERIALS.limestoneCurb}>
                <boxGeometry args={[0.09, 0.0036, 6.33]} />
              </mesh>
              <mesh position={[0, 0, p]} material={TOYBOX_MATERIALS.limestoneCurb}>
                <boxGeometry args={[6.33, 0.0036, 0.09]} />
              </mesh>
            </React.Fragment>
          ))}
          {[-3.12, 3.12].map((cx, ix) =>
            [-3.12, 3.12].map((cz, iz) => (
              <mesh
                key={`plaza-corner-${ix}-${iz}`}
                position={[cx, 0.0005, cz]}
                material={TOYBOX_MATERIALS.terracottaTerrace}
              >
                <boxGeometry args={[0.2, 0.004, 0.2]} />
              </mesh>
            ))
          )}
        </group>
      )}

      {/* Tier-2 Terrace Rooftop Lounge stone coping trim & inlaid courtyard pavers (strictly inside [-3.1..3.1, -3.1..4.0]) */}
      {blueprintId === 'terrace_rooftop_lounge' && (
        <group position={[0, ELEVATIONS.TERRACE_Y + 0.003, 0]}>
          {[-2.96, 2.96].map((px, i) => (
            <mesh key={`terrace-cope-ew-${i}`} position={[px, 0, 0.45]} material={TOYBOX_MATERIALS.limestoneTrim}>
              <boxGeometry args={[0.24, 0.005, 7.05]} />
            </mesh>
          ))}
          <mesh position={[0, 0, -2.96]} material={TOYBOX_MATERIALS.limestoneTrim}>
            <boxGeometry args={[6.16, 0.005, 0.24]} />
          </mesh>
          {[-1.5, 0, 1.5].map((gx) => (
            <mesh key={`terrace-gx-${gx}`} position={[gx, 0, 0.55]} material={TOYBOX_MATERIALS.terracottaDeep}>
              <boxGeometry args={[0.04, 0.004, 6.7]} />
            </mesh>
          ))}
          {[-1.5, 0.5, 2.5].map((gz) => (
            <mesh key={`terrace-gz-${gz}`} position={[0, 0, gz]} material={TOYBOX_MATERIALS.terracottaDeep}>
              <boxGeometry args={[5.68, 0.004, 0.04]} />
            </mesh>
          ))}
          <mesh position={[0, 0.001, 0.45]} material={TOYBOX_MATERIALS.plazaPaverWarm}>
            <boxGeometry args={[3.0, 0.003, 3.2]} />
          </mesh>
        </group>
      )}

      {/* Parklet promenade & connector crisp brick lawn trim matching exact turf polygons */}
      {blueprintId === 'parklet_green_promenade' && (
        <group position={[0, ELEVATIONS.PARKLET_GREEN_Y + 0.003, 0]}>
          <mesh position={[-2.6, 0, 0]} material={TOYBOX_MATERIALS.terracottaBrick}>
            <boxGeometry args={[0.12, 0.012, 8.0]} />
          </mesh>
          <mesh position={[2.6, 0, 0]} material={TOYBOX_MATERIALS.terracottaBrick}>
            <boxGeometry args={[0.12, 0.012, 8.0]} />
          </mesh>
        </group>
      )}
      {blueprintId === 'parklet_green_connector' && (
        <group position={[0, ELEVATIONS.PARKLET_GREEN_Y + 0.003, 0]}>
          <mesh position={[-2.6, 0, -1.4]} material={TOYBOX_MATERIALS.terracottaBrick}>
            <boxGeometry args={[0.12, 0.012, 5.2]} />
          </mesh>
          <mesh position={[2.6, 0, -1.4]} material={TOYBOX_MATERIALS.terracottaBrick}>
            <boxGeometry args={[0.12, 0.012, 5.2]} />
          </mesh>
          <mesh position={[0, 0, 1.2]} material={TOYBOX_MATERIALS.terracottaBrick}>
            <boxGeometry args={[5.32, 0.012, 0.12]} />
          </mesh>
        </group>
      )}

      {/* Park Reflection Pool / Canal stone coping rim, terracotta corner keystones & promenade border */}
      {blueprintId === 'canal_water_hazard' && (
        <group>
          {/* Raised travertine coping stones framing E/W quays & South headwall (North stays open to pair!) */}
          {[-2.98, 2.98].map((qx, i) => (
            <mesh
              key={`canal-cope-ew-${i}`}
              castShadow
              receiveShadow
              position={[qx, ELEVATIONS.SIDEWALK_Y + 0.011, -0.86]}
              material={TOYBOX_MATERIALS.poolCopingStone}
            >
              <boxGeometry args={[0.26, 0.022, 6.28]} />
            </mesh>
          ))}
          <mesh
            castShadow
            receiveShadow
            position={[0, ELEVATIONS.SIDEWALK_Y + 0.011, 2.18]}
            material={TOYBOX_MATERIALS.poolCopingStone}
          >
            <boxGeometry args={[6.22, 0.022, 0.26]} />
          </mesh>
          {/* Corner terracotta keystones & ashlar coping joint seams */}
          {[-2.98, 2.98].map((kx, i) => (
            <mesh
              key={`canal-keystone-${i}`}
              castShadow
              position={[kx, ELEVATIONS.SIDEWALK_Y + 0.013, 2.18]}
              material={TOYBOX_MATERIALS.plazaTerracottaInlay}
            >
              <boxGeometry args={[0.3, 0.026, 0.3]} />
            </mesh>
          ))}
          {[-3.0, -1.5, 0.0, 1.35].map((jz, ji) =>
            [-2.98, 2.98].map((jx, xi) => (
              <mesh
                key={`canal-joint-ew-${ji}-${xi}`}
                position={[jx, ELEVATIONS.SIDEWALK_Y + 0.023, jz]}
                material={TOYBOX_MATERIALS.plazaGrout}
              >
                <boxGeometry args={[0.26, 0.003, 0.035]} />
              </mesh>
            ))
          )}
          {[-2.0, -1.0, 0.0, 1.0, 2.0].map((jx, ji) => (
            <mesh
              key={`canal-joint-s-${ji}`}
              position={[jx, ELEVATIONS.SIDEWALK_Y + 0.023, 2.18]}
              material={TOYBOX_MATERIALS.plazaGrout}
            >
              <boxGeometry args={[0.035, 0.003, 0.26]} />
            </mesh>
          ))}
          {/* South promenade terracotta trim strip */}
          <mesh position={[0, ELEVATIONS.SIDEWALK_Y + 0.004, 2.92]} material={TOYBOX_MATERIALS.plazaTerracottaInlay}>
            <boxGeometry args={[6.2, 0.005, 0.12]} />
          </mesh>
        </group>
      )}

      {/* Fountain Plaza stone coping rim, terracotta corner keystones & outer plaza trim */}
      {blueprintId === 'fountain_plaza_hazard' && (
        <group>
          {[-2.18, 2.18].map((p, i) => (
            <React.Fragment key={`fp-cope-${i}`}>
              <mesh
                castShadow
                receiveShadow
                position={[p, ELEVATIONS.SIDEWALK_Y + 0.011, 0]}
                material={TOYBOX_MATERIALS.poolCopingStone}
              >
                <boxGeometry args={[0.26, 0.022, 4.62]} />
              </mesh>
              <mesh
                castShadow
                receiveShadow
                position={[0, ELEVATIONS.SIDEWALK_Y + 0.011, p]}
                material={TOYBOX_MATERIALS.poolCopingStone}
              >
                <boxGeometry args={[4.62, 0.022, 0.26]} />
              </mesh>
            </React.Fragment>
          ))}
          {[-2.18, 2.18].map((kx, ix) =>
            [-2.18, 2.18].map((kz, iz) => (
              <mesh
                key={`fp-keystone-${ix}-${iz}`}
                castShadow
                position={[kx, ELEVATIONS.SIDEWALK_Y + 0.013, kz]}
                material={TOYBOX_MATERIALS.terracottaTerrace}
              >
                <boxGeometry args={[0.3, 0.026, 0.3]} />
              </mesh>
            ))
          )}
        </group>
      )}

      {/* Elevated Terrace Flank Stair Cheek Walls & Coping Caps */}
      {blueprintId === 'terrace_stair_chute_top' && (
        <group>
          {[-2.05, 2.05].map((cx, i) => (
            <React.Fragment key={`cheek-${i}`}>
              <mesh
                castShadow
                receiveShadow
                position={[cx, 0.7, 2.3]}
                material={TOYBOX_MATERIALS.terracottaBrick}
              >
                <boxGeometry args={[0.28, 1.28, 3.35]} />
              </mesh>
              <mesh
                receiveShadow
                position={[cx, 1.35, 2.3]}
                material={TOYBOX_MATERIALS.limestoneTrim}
              >
                <boxGeometry args={[0.32, 0.06, 3.38]} />
              </mesh>
            </React.Fragment>
          ))}
        </group>
      )}

      {/* Ramp approach stone cheek curbs */}
      {blueprintId === 'terrace_ramp_approach' && (
        <group>
          {[-2.0, 2.0].map((cx, i) => (
            <mesh
              key={`rcheek-${i}`}
              castShadow
              receiveShadow
              position={[cx, 0.35, -0.9]}
              material={TOYBOX_MATERIALS.limestoneCurb}
            >
              <boxGeometry args={[0.2, 0.7, 6.2]} />
            </mesh>
          ))}
        </group>
      )}

      {/* Transit Island Cup curbs & crosswalk necks */}
      {blueprintId === 'cup_transit_island_green' && (
        <group>
          {[-2.05, 2.05].map((cx, i) => (
            <mesh key={`ti-curb-${i}`} receiveShadow position={[cx, ELEVATIONS.SIDEWALK_Y + 0.008, 0]} material={TOYBOX_MATERIALS.tactileAdaPad}>
              <boxGeometry args={[0.1, 0.02, 4.06]} />
            </mesh>
          ))}
          {[-1.5, -0.75, 0, 0.75, 1.5].map((zx, i) => (
            <React.Fragment key={`ti-cw-${i}`}>
              <mesh position={[zx, ELEVATIONS.STREET_Y + 0.004, -3.55]} material={TOYBOX_MATERIALS.roadMarkingWhite}>
                <boxGeometry args={[0.28, 0.005, 0.7]} />
              </mesh>
              <mesh position={[zx, ELEVATIONS.STREET_Y + 0.004, 3.55]} material={TOYBOX_MATERIALS.roadMarkingWhite}>
                <boxGeometry args={[0.28, 0.005, 0.7]} />
              </mesh>
            </React.Fragment>
          ))}
          <StraightGutterGrates x={-3.0} zStart={-3.15} zEnd={3.15} width={0.5} troughY={ELEVATIONS.GUTTER_TROUGH_Y} />
          <StraightGutterGrates x={3.0} zStart={-3.15} zEnd={3.15} width={0.5} troughY={ELEVATIONS.GUTTER_TROUGH_Y} />
        </group>
      )}

      {/* Corner Parklet & Pocket Garden Trim */}
      {blueprintId === 'cup_corner_parklet' && (
        <group>
          <StraightGutterGrates x={-2.14} zStart={-4} zEnd={-2.05} width={0.5} troughY={ELEVATIONS.GUTTER_TROUGH_Y} />
          <mesh position={[0, ELEVATIONS.PARKLET_GREEN_Y + 0.006, 3.2]} material={TOYBOX_MATERIALS.terracottaBrick}>
            <boxGeometry args={[6.2, 0.016, 0.14]} />
          </mesh>
        </group>
      )}

      {blueprintId === 'cup_pocket_garden_green' && (
        <group>
          {[-2.85, 2.85].map((gx, i) => (
            <mesh key={`pg-edge-${i}`} position={[gx, ELEVATIONS.PARKLET_GREEN_Y + 0.014, -0.5]} material={TOYBOX_MATERIALS.terracottaBrick}>
              <boxGeometry args={[0.14, 0.032, 6.9]} />
            </mesh>
          ))}
        </group>
      )}

      {/* Cup & Color-Coded Flag Assembly on Cup Tiles */}
      {bp.localCupOffset && (
        <group>
          <CupFlagAssembly
            position={bp.localCupOffset}
            color={flagColor ?? 'red'}
            isSunk={isSunk}
            cupRadius={CUP_CUTOUT_RADIUS}
            poleHeight={5.1}
          />
          {/* Subtle Next-Tee stone inlay marker beside cup */}
          {bp.localNextTeeOffset && (
            <mesh
              position={[
                bp.localNextTeeOffset[0],
                bp.localNextTeeOffset[1] + 0.004,
                bp.localNextTeeOffset[2],
              ]}
              material={TOYBOX_MATERIALS.limestoneTrim}
            >
              <cylinderGeometry args={[0.24, 0.24, 0.008, 16]} />
            </mesh>
          )}
        </group>
      )}
    </group>
  );
}

export interface ModularTileMeshProps {
  /** Blueprint ID to render (works both standalone in QA and inside PlacedTile courses). */
  blueprintId: TileBlueprintId;
  /** World [x, y, z] position (default [0, 0, 0] for isolated QA). */
  position?: [number, number, number];
  /** Tile Y rotation in radians (default 0). */
  rotationY?: number;
  /** Flag color when rendering a cup tile. */
  flagColor?: FlagColor;
  /** Whether this cup tile's flag has already been sunk. */
  isSunk?: boolean;
  /** QA toggle to overlay collider/ramp/water wireframes. */
  showWireframe?: boolean;
}

/**
 * Renders any one of Curbside Links' 19 modular 8m x 8m tile archetypes with exact
 * elevations, recessed -0.06m U-shaped gutters, curved curbs, water basins, and cups.
 */
export function ModularTileMesh({
  blueprintId,
  position = [0, 0, 0],
  rotationY = 0,
  flagColor,
  isSunk = false,
  showWireframe = false,
}: ModularTileMeshProps) {
  const bp = TILE_BLUEPRINTS[blueprintId];

  // For road_corner_gutter, custom curved geometry replaces boxy asphalt/sidewalk/gutter slabs seamlessly
  const isCurvedCorner = blueprintId === 'road_corner_gutter';

  const cupTurfGeometry = useMemo(() => {
    if (!bp.localCupOffset) return null;
    const turfSlab = bp.surfaces.find((s) => s.kind === 'turf_green');
    if (!turfSlab) return null;
    const cx = turfSlab.center[0];
    const cz = turfSlab.center[2];
    const w = turfSlab.size[0];
    const d = turfSlab.size[2];
    const cupX = bp.localCupOffset[0];
    const cupZ = bp.localCupOffset[2];
    const isElevated = turfSlab.topY > ELEVATIONS.SIDEWALK_Y + 0.2;
    const turfBottomY = isElevated ? turfSlab.topY - 0.26 : PLINTH_BASE_Y;

    return cachedGeo(`cup-turf-${blueprintId}`, () =>
      createGreenPadWithCupCutout({
        width: w,
        depth: d,
        cornerRadius: 0.22,
        centerX: cx,
        centerZ: cz,
        cupLocalX: cupX,
        cupLocalZ: cupZ,
        cupRadius: CUP_CUTOUT_RADIUS,
        bottomY: turfBottomY,
        topY: turfSlab.topY,
      })
    );
  }, [blueprintId, bp]);

  const rampSurfaceKind: 'terrace' | 'sidewalk' | 'asphalt' =
    bp.category === 'terrace' || bp.category === 'ramp' || bp.cupArchetype === 'elevated_cafe_terrace'
      ? 'terrace'
      : 'sidewalk';

  return (
    <group
      name={`tile-${blueprintId}`}
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* Render Tile Slabs down to PLINTH_BASE_Y */}
      {bp.surfaces.map((slab) => {
        if (isCurvedCorner) {
          // Curved corner custom geometry covers every slab cleanly without boxy seams
          return null;
        }
        // Skip duplicate cutout turf slab (rendered via cupTurfGeometry below)
        if (slab.kind === 'turf_green' && cupTurfGeometry) {
          const isElevatedCup = slab.topY > ELEVATIONS.SIDEWALK_Y + 0.2;
          const wCup = slab.size[0];
          const dCup = slab.size[2];
          const cxCup = slab.center[0];
          const czCup = slab.center[2];
          const podiumTopY = slab.topY - 0.26;
          const podiumH = Math.max(0.1, podiumTopY - PLINTH_BASE_Y);
          return (
            <React.Fragment key={slab.id}>
              {isElevatedCup && (
                <>
                  <mesh
                    castShadow
                    receiveShadow
                    position={[cxCup, PLINTH_BASE_Y + podiumH * 0.5, czCup]}
                    material={TOYBOX_MATERIALS.terracottaBrick}
                  >
                    <boxGeometry args={[wCup - 0.04, podiumH, dCup - 0.04]} />
                  </mesh>
                  <mesh
                    receiveShadow
                    position={[cxCup, podiumTopY - 0.04, czCup]}
                    material={TOYBOX_MATERIALS.limestoneTrim}
                  >
                    <boxGeometry args={[wCup + 0.02, 0.09, dCup + 0.02]} />
                  </mesh>
                </>
              )}
              <mesh
                receiveShadow
                geometry={cupTurfGeometry}
                material={TOYBOX_MATERIALS.turfEmerald}
              />
              {showWireframe && (
                <mesh
                  position={[cxCup, slab.topY - 0.04, czCup]}
                  material={TOYBOX_MATERIALS.qaColliderWireframe}
                >
                  <boxGeometry args={[wCup, 0.08, dCup]} />
                </mesh>
              )}
            </React.Fragment>
          );
        }

        const w = slab.size[0];
        const d = slab.size[2];
        const cx = slab.center[0];
        const cz = slab.center[2];
        const isElevatedTerrace =
          slab.kind === 'terrace_deck' || slab.topY > ELEVATIONS.SIDEWALK_Y + 0.2;
        const bottom = slab.kind === 'curb_wall' ? ELEVATIONS.GUTTER_TROUGH_Y : PLINTH_BASE_Y;
        const capThick = isElevatedTerrace && slab.kind !== 'turf_green' ? 0.09 : 0;
        // Stop lower brick volume strictly below the top terrace cap so top planes never z-fight!
        const h = Math.max(0.05, slab.topY - capThick - bottom);
        const cy = bottom + h * 0.5;
        // Raise curb_wall coping by +0.002m to avoid co-planar z-fighting with adjacent sidewalk slabs
        const yAdjust = slab.kind === 'curb_wall' ? 0.002 : 0;

        return (
          <React.Fragment key={slab.id}>
            <mesh
              castShadow={isElevatedTerrace}
              receiveShadow
              position={[cx, cy + yAdjust, cz]}
              material={
                isElevatedTerrace && slab.kind !== 'turf_green'
                  ? TOYBOX_MATERIALS.terracottaBrick
                  : materialForSurface(slab.kind)
              }
            >
              <boxGeometry args={[w, h, d]} />
            </mesh>
            {/* Top crisp travertine chamfer bevel on curb walls */}
            {slab.kind === 'curb_wall' && (
              <mesh
                receiveShadow
                position={[cx, slab.topY + 0.005, cz]}
                material={TOYBOX_MATERIALS.limestoneTrim}
              >
                <boxGeometry args={[Math.max(0.04, w - 0.03), 0.008, Math.max(0.04, d - 0.03)]} />
              </mesh>
            )}
            {/* Crisp travertine coping stone cap on stepped pool stone_rim ledges */}
            {slab.kind === 'stone_rim' && !slab.id.includes('center-plinth') && (
              <mesh
                receiveShadow
                position={[cx, slab.topY - 0.007, cz]}
                material={TOYBOX_MATERIALS.poolCopingStone}
              >
                <boxGeometry args={[Math.max(0.06, w + 0.02), 0.018, Math.max(0.06, d + 0.02)]} />
              </mesh>
            )}
            {/* Top warm limestone/terracotta cap on Tier-2 terrace decks */}
            {isElevatedTerrace && slab.kind !== 'turf_green' && (
              <mesh
                castShadow
                receiveShadow
                position={[cx, slab.topY - capThick * 0.5, cz]}
                material={TOYBOX_MATERIALS.terracottaTerrace}
              >
                <boxGeometry args={[w + 0.02, capThick, d + 0.02]} />
              </mesh>
            )}
            {/* Flush 2m architectural limestone flagstone seams & alternating warm pavers */}
            {slab.kind === 'sidewalk' && slab.topY <= ELEVATIONS.SIDEWALK_Y + 0.02 && (
              <SidewalkSlabPaving slab={slab} />
            )}
            {showWireframe && (
              <mesh
                position={[cx, cy + yAdjust, cz]}
                material={TOYBOX_MATERIALS.qaColliderWireframe}
              >
                <boxGeometry args={[w, h, d]} />
              </mesh>
            )}
          </React.Fragment>
        );
      })}

      {/* Render Physics Ramps */}
      {bp.ramps.map((ramp) => (
        <RampAssembly
          key={ramp.id}
          ramp={ramp}
          surfaceKind={rampSurfaceKind}
          showWireframe={showWireframe}
        />
      ))}

      {/* Render Recessed Water Zones */}
      {bp.waterZones.map((zone) => (
        <WaterZoneSurface key={zone.id} zone={zone} showWireframe={showWireframe} />
      ))}

      {/* Tile Details, Curved Gutters, Markings & Cups */}
      <TileSculptedDetails
        blueprintId={blueprintId}
        flagColor={flagColor}
        isSunk={isSunk}
      />
    </group>
  );
}

/** Convenience wrapper rendering a PlacedTile directly from GeneratedCityCourse. */
export function PlacedTileRenderer({
  tile,
  isSunk = false,
  showWireframe = false,
}: {
  tile: PlacedTile;
  isSunk?: boolean;
  showWireframe?: boolean;
}) {
  return (
    <ModularTileMesh
      blueprintId={tile.blueprintId}
      position={[tile.worldX, 0, tile.worldZ]}
      rotationY={tile.rotationY}
      flagColor={tile.flagColor}
      isSunk={isSunk}
      showWireframe={showWireframe}
    />
  );
}
