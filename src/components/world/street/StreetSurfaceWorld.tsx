'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
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
  buildNotchedWestSidewalkGeometry,
  buildRadialArcSlabGeometry,
  buildRadialWaterRibbonGeometry,
  buildRectSlabGeometry,
  buildSeRoadSpandrelGeometry,
  buildSolidRampGeometry,
} from './streetGeometry';

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
  showWireframe?: boolean;
}

const SLAB_FOUNDATION_BOTTOM_Y = -0.35;

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
  const seStartRad = seCornerGutter?.startAngleRad ?? Math.PI;
  const seEndRad = seCornerGutter?.endAngleRad ?? Math.PI * 1.5;

  const cupCutout = useMemo(
    () => ({
      x: cup.position[0],
      z: cup.position[2],
      radius: Math.max(0.28, cup.cupRadius - 0.006),
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
        map.set(
          z.id,
          buildRectSlabGeometry(
            z.boundsXZ,
            z.topY - 0.015,
            z.topY + 0.008,
            1.6,
            cupCutout,
          ),
        );
      } else if (z.surfaceTag === 'green_fringe_collar') {
        map.set(
          z.id,
          buildRectSlabGeometry(
            z.boundsXZ,
            z.topY - 0.012,
            z.topY + 0.005,
            1.6,
            cupCutout,
          ),
        );
      } else if (z.surfaceTag === 'patio_rough') {
        map.set(
          z.id,
          buildRectSlabGeometry(
            z.boundsXZ,
            z.topY - 0.01,
            z.topY + 0.004,
            1.8,
            null,
          ),
        );
      } else if (z.surfaceTag === 'courtyard_paver') {
        map.set(
          z.id,
          buildRectSlabGeometry(
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

  const seRoadSpandrelGeo = useMemo(
    () =>
      buildSeRoadSpandrelGeometry(
        sePivotX,
        sePivotZ,
        seOuterR,
        3.55,
        -18.45,
        SLAB_FOUNDATION_BOTTOM_Y,
        0.0,
        3.6,
      ),
    [sePivotX, sePivotZ, seOuterR],
  );

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
        24,
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

  const curvedWaterRibbonGeo = useMemo(
    () =>
      buildRadialWaterRibbonGeometry(
        sePivotX,
        sePivotZ,
        seInnerR + 0.08,
        seOuterR - 0.08,
        seStartRad,
        seEndRad,
        (seCornerGutter?.channelY ?? -0.02) + 0.005,
        24,
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

  const curvedCornerCurbGeo = useMemo(
    () =>
      buildRadialArcSlabGeometry(
        sePivotX,
        sePivotZ,
        seInnerR - 0.25,
        seInnerR,
        seStartRad,
        seEndRad,
        -0.02,
        0.15,
        1.5,
        22,
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
        0.15,
        0.162,
        1.5,
        22,
      ),
    [sePivotX, sePivotZ, seInnerR, seStartRad, seEndRad],
  );

  useEffect(() => {
    return () => {
      for (const geo of zoneGeometries.values()) geo.dispose();
      for (const geo of rampGeometries.values()) geo.dispose();
      seRoadSpandrelGeo.dispose();
      curvedGutterGeo.dispose();
      curvedWaterRibbonGeo.dispose();
      curvedCornerCurbGeo.dispose();
      curvedCornerCurbCapGeo.dispose();
    };
  }, [
    zoneGeometries,
    rampGeometries,
    seRoadSpandrelGeo,
    curvedGutterGeo,
    curvedWaterRibbonGeo,
    curvedCornerCurbGeo,
    curvedCornerCurbCapGeo,
  ]);

  const waterStreamGroupRef = useRef<THREE.Group>(null);
  const pulseAccumRef = useRef(0);

  useFrame((_, delta) => {
    pulseAccumRef.current += delta;
    if (waterStreamGroupRef.current) {
      const shimmer = 0.0015 * Math.sin(pulseAccumRef.current * 4.5);
      waterStreamGroupRef.current.position.y = shimmer;
    }
  });

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

  const cupSurfaceY = (puttingGreenZone?.topY ?? cup.elevationY) + 0.008;

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
            mat = VENICE_MATERIALS.patioRoughStone;
          }

          return (
            <mesh
              key={z.id}
              name={`zone-${z.id}`}
              geometry={geo}
              material={mat}
              receiveShadow
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
        <PuttingGreenBorderAndTeeMarker bounds={fringeZone.boundsXZ} />
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
              />
            );
          }

          const sx = g.start?.[0] ?? 0;
          const sz = g.start?.[2] ?? 0;
          const ex = g.end?.[0] ?? 0;
          const ez = g.end?.[2] ?? 0;
          const dx = ex - sx;
          const dz = ez - sz;
          const len = Math.hypot(dx, dz);
          const cx = (sx + ex) * 0.5;
          const cz = (sz + ez) * 0.5;
          const alongX = Math.abs(dx) >= Math.abs(dz);
          const slabH = g.channelY - SLAB_FOUNDATION_BOTTOM_Y;

          return (
            <mesh
              key={g.id}
              name={`gutter-${g.id}`}
              position={[cx, SLAB_FOUNDATION_BOTTOM_Y + slabH * 0.5, cz]}
              material={VENICE_MATERIALS.gutterConcreteChannel}
              receiveShadow
            >
              <boxGeometry
                args={
                  alongX ? [len, slabH, g.width] : [g.width, slabH, len]
                }
              />
            </mesh>
          );
        })}

        {/* Glistening wet water sheen tracing Hydrant -> SE Corner Boost -> Mercer Approach */}
        <group ref={waterStreamGroupRef} name="hydrant-gutter-water-flow">
          <mesh
            position={[3.775, -0.014, -14.1]}
            material={VENICE_MATERIALS.gutterWetWaterSheen}
          >
            <boxGeometry args={[0.28, 0.008, 3.4]} />
          </mesh>
          <mesh
            geometry={curvedWaterRibbonGeo}
            material={VENICE_MATERIALS.gutterWetWaterSheen}
          />
          <mesh
            position={[10.35, -0.014, -18.225]}
            material={VENICE_MATERIALS.gutterWetWaterSheen}
          >
            <boxGeometry args={[8.3, 0.008, 0.28]} />
          </mesh>
        </group>

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
                  material={VENICE_MATERIALS.graniteCurbBevelTop}
                  castShadow
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

      {/* 7. Recessed Hole 1 Cup & Flag Assembly */}
      <CupFlagAssembly
        position={[cup.position[0], cupSurfaceY, cup.position[2]]}
        color={cup.flagColor}
        isSunk={isHoleSunk}
        cupRadius={cup.cupRadius}
        cupDepth={cup.cupDepth}
        poleHeight={cup.pinHeight}
      />

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

  return (
    <group
      name={`ramp-courses-${ramp.id}`}
      position={[cx, cy, cz]}
      rotation={[0, 0, tiltZ]}
    >
      {/* Granite Side Coping Stringers */}
      <mesh
        position={[0, 0.002, -(spanZ * 0.5 - 0.14)]}
        material={VENICE_MATERIALS.graniteCurbBevelTop}
        receiveShadow
      >
        <boxGeometry args={[slopeLen - 0.04, 0.004, 0.24]} />
      </mesh>
      <mesh
        position={[0, 0.002, spanZ * 0.5 - 0.14]}
        material={VENICE_MATERIALS.graniteCurbBevelTop}
        receiveShadow
      >
        <boxGeometry args={[slopeLen - 0.04, 0.004, 0.24]} />
      </mesh>

      {/* Flush Transverse Stone Step-Course Header Strips */}
      {Array.from({ length: courseCount }, (_, idx) => {
        const t = idx / (courseCount - 1) - 0.5;
        const lx = t * (slopeLen - 0.24);
        return (
          <mesh
            key={`course-${idx}`}
            position={[lx, 0.0018, 0]}
            material={
              idx === 0 || idx === courseCount - 1
                ? VENICE_MATERIALS.graniteCurbBevelTop
                : VENICE_MATERIALS.courtyardRampCourseAccent
            }
            receiveShadow
          >
            <boxGeometry
              args={[
                idx === 0 || idx === courseCount - 1 ? 0.16 : 0.075,
                0.004,
                spanZ - 0.52,
              ]}
            />
          </mesh>
        );
      })}

      {/* Central Stone Joint Runner Bands */}
      {[-spanZ * 0.24, 0, spanZ * 0.24].map((lz, jIdx) => (
        <mesh
          key={`runner-${jIdx}`}
          position={[0, 0.0015, lz]}
          material={VENICE_MATERIALS.courtyardRampCourseAccent}
          receiveShadow
        >
          <boxGeometry args={[slopeLen - 0.22, 0.003, 0.055]} />
        </mesh>
      ))}
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

  return (
    <group name="street-road-markings">
      {/* 5th Ave Dashed Centerline (interrupted cleanly across Crosswalk) */}
      {[-12.0, -7.0, -2.0, 3.0, 8.0, 13.0, 18.0, 23.0].map((zPos, i) => (
        <mesh
          key={`dash-5th-${i}`}
          position={[0, 0.004, zPos]}
          material={VENICE_MATERIALS.laneLineCream}
          receiveShadow
        >
          <boxGeometry args={[0.14, 0.005, 2.3]} />
        </mesh>
      ))}

      {/* Mercer St Dashed Centerline */}
      {[5.5, 9.8].map((xPos, i) => (
        <mesh
          key={`dash-mercer-${i}`}
          position={[xPos, 0.004, -22.0]}
          material={VENICE_MATERIALS.laneLineCream}
          receiveShadow
        >
          <boxGeometry args={[2.2, 0.005, 0.14]} />
        </mesh>
      ))}

      {/* Stop Bar before South Crosswalk */}
      <mesh
        position={[1.7, 0.004, cwMaxZ + 0.75]}
        material={VENICE_MATERIALS.crosswalkWhite}
        receiveShadow
      >
        <boxGeometry args={[2.9, 0.005, 0.34]} />
      </mesh>

      {/* Crosswalk A-Position 7 Crisp Zebra Bars */}
      {Array.from({ length: stripeCount }, (_, idx) => {
        const t = (idx + 0.5) / stripeCount;
        const x = cwMinX + 0.25 + t * (cwSpanX - 0.5);
        return (
          <mesh
            key={`crosswalk-bar-${idx}`}
            position={[x, 0.005, cwCenterZ]}
            material={VENICE_MATERIALS.crosswalkWhite}
            receiveShadow
          >
            <boxGeometry args={[0.52, 0.006, cwDepthZ - 0.25]} />
          </mesh>
        );
      })}

      {/* Van Loading Zone Amber Perimeter Frame & Diagonal Stripes */}
      <group name="van-loading-zone-markings">
        {/* West, North & South Amber Perimeter Line */}
        <mesh
          position={[lzMinX, 0.004, lzCZ]}
          material={VENICE_MATERIALS.loadingZoneAmber}
        >
          <boxGeometry args={[0.1, 0.005, lzL]} />
        </mesh>
        <mesh
          position={[lzCX, 0.004, lzMinZ]}
          material={VENICE_MATERIALS.loadingZoneAmber}
        >
          <boxGeometry args={[lzW, 0.005, 0.1]} />
        </mesh>
        <mesh
          position={[lzCX, 0.004, lzMaxZ]}
          material={VENICE_MATERIALS.loadingZoneAmber}
        >
          <boxGeometry args={[lzW, 0.005, 0.1]} />
        </mesh>

        {/* Diagonal 38-deg Amber Loading Stripes */}
        {Array.from({ length: 7 }, (_, idx) => {
          const z = lzMinZ + 0.85 + (idx / 6) * (lzL - 1.7);
          return (
            <mesh
              key={`lz-stripe-${idx}`}
              position={[lzCX, 0.004, z]}
              rotation={[0, -stripeAngleRad, 0]}
              material={VENICE_MATERIALS.loadingZoneAmber}
            >
              <boxGeometry args={[lzW * 0.96, 0.005, 0.16]} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function PuttingGreenBorderAndTeeMarker({
  bounds,
}: {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}) {
  const { minX, maxX, minZ, maxZ } = bounds;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const borderW = 0.22;

  return (
    <group name="putting-green-limestone-border">
      <mesh
        position={[cx, 0.606, minZ - borderW * 0.5]}
        material={VENICE_MATERIALS.puttingGreenStoneBorder}
        receiveShadow
      >
        <boxGeometry args={[w + borderW * 2, 0.012, borderW]} />
      </mesh>
      <mesh
        position={[cx, 0.606, maxZ + borderW * 0.5]}
        material={VENICE_MATERIALS.puttingGreenStoneBorder}
        receiveShadow
      >
        <boxGeometry args={[w + borderW * 2, 0.012, borderW]} />
      </mesh>
      <mesh
        position={[minX - borderW * 0.5, 0.606, cz]}
        material={VENICE_MATERIALS.puttingGreenStoneBorder}
        receiveShadow
      >
        <boxGeometry args={[borderW, 0.012, d]} />
      </mesh>
      <mesh
        position={[maxX + borderW * 0.5, 0.606, cz]}
        material={VENICE_MATERIALS.puttingGreenStoneBorder}
        receiveShadow
      >
        <boxGeometry args={[borderW, 0.012, d]} />
      </mesh>
    </group>
  );
}

function StraightGraniteCurb({ curb }: { curb: StoneCurbSegmentSpec }) {
  const [sx, _, sz] = curb.size;
  const h = curb.height;
  const alongX = sx >= sz;
  const length = alongX ? sx : sz;
  const width = alongX ? sz : sx;
  const jointCount = Math.floor(length / 2.2);

  return (
    <group
      name={`curb-${curb.id}`}
      position={[curb.center[0], 0, curb.center[2]]}
      rotation={[0, curb.rotationY, 0]}
    >
      {/* Main Granite Curb Body extending cleanly below road/gutter so zero gaps show */}
      <mesh
        position={[0, (curb.topY - 0.04) * 0.5, 0]}
        material={VENICE_MATERIALS.graniteCurbStone}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[
            alongX ? length : width,
            curb.topY + 0.04,
            alongX ? width : length,
          ]}
        />
      </mesh>

      {/* Beveled Top Granite Cap */}
      <mesh
        position={[0, curb.topY - 0.008, 0]}
        material={VENICE_MATERIALS.graniteCurbBevelTop}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[
            alongX ? length - 0.01 : width - 0.04,
            0.022,
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
              alongX
                ? [offset, curb.topY - 0.006, 0]
                : [0, curb.topY - 0.006, offset]
            }
            material={VENICE_MATERIALS.graniteCurbJoint}
          >
            <boxGeometry
              args={
                alongX ? [0.02, 0.03, width - 0.02] : [width - 0.02, 0.03, 0.02]
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
  const barCount = 5;

  return (
    <group
      name={`grate-${grate.id}`}
      position={grate.position}
      rotation={[0, grate.rotationY, 0]}
    >
      {/* Recessed Iron Frame */}
      <mesh material={VENICE_MATERIALS.wroughtIron} receiveShadow>
        <boxGeometry args={[w, 0.016, l]} />
      </mesh>

      {/* Dark Drain Basin Underneath */}
      <mesh position={[0, -0.004, 0]} material={VENICE_MATERIALS.asphaltRoadEdgeBase}>
        <boxGeometry args={[w * 0.82, 0.014, l * 0.86]} />
      </mesh>

      {/* Longitudinal Cast-Iron Grate Slats */}
      {Array.from({ length: barCount }, (_, idx) => {
        const t = -0.35 + (idx / (barCount - 1)) * 0.7;
        return (
          <mesh
            key={`bar-${idx}`}
            position={alongZ ? [t * w, 0.006, 0] : [0, 0.006, t * l]}
            material={VENICE_MATERIALS.gutterConcreteLip}
          >
            <boxGeometry
              args={
                alongZ ? [w * 0.08, 0.01, l * 0.88] : [w * 0.88, 0.01, l * 0.08]
              }
            />
          </mesh>
        );
      })}
    </group>
  );
}
