'use client';

import { useMemo } from 'react';
import {
  CuboidCollider,
  CylinderCollider,
  RigidBody,
} from '@react-three/rapier';
import {
  ELEVATIONS,
  ISLAND_HALF_SIZE,
  type ClubId,
  type GeneratedCityCourse,
  type PlacedProp,
  type PlacedTile,
} from '@/types';
import {
  buildArcWallSegments,
  computeRampColliderTransform,
} from '@/physics';

type TileSurfaceKind = PlacedTile['surfaces'][number]['kind'];

interface PhysicsWorldProps {
  course: GeneratedCityCourse;
  courseVersion: number;
  clubId: ClubId;
  onWaterSensorHit?: (sourcePropId?: string) => void;
  onDeflectorHit?: (prop: PlacedProp) => void;
}

function getSurfaceMaterialProps(
  kind: TileSurfaceKind,
  clubId: ClubId,
): { friction: number; restitution: number } {
  switch (kind) {
    case 'turf_green':
      // Wedge checks sharply on AstroTurf greens; Putter rolls smoothly without hops
      return {
        friction: clubId === 'putter' ? 0.28 : 0.85,
        restitution: clubId === 'putter' ? 0.04 : 0.12,
      };
    case 'curb_wall':
    case 'stone_rim':
      // Energetic 15cm bankable curbs for Skimmer trick shots
      return {
        friction: 0.12,
        restitution: 0.72,
      };
    case 'gutter_trough':
      return {
        friction: 0.14,
        restitution: 0.22,
      };
    case 'water_basin':
      return {
        friction: 0.6,
        restitution: 0.05,
      };
    case 'sidewalk':
    case 'terrace_deck':
    case 'asphalt':
    default:
      return {
        friction: clubId === 'putter' ? 0.22 : 0.34,
        restitution: clubId === 'putter' ? 0.04 : 0.42,
      };
  }
}

export function PhysicsWorld({
  course,
  courseVersion,
  clubId,
  onWaterSensorHit,
  onDeflectorHit,
}: PhysicsWorldProps) {
  const arcWallsByPropId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildArcWallSegments>>();
    for (const prop of course.props) {
      if (prop.type === 'curved_gutter_corner') {
        map.set(
          prop.id,
          buildArcWallSegments({
            pivotX: 0.65,
            pivotZ: -0.65,
            radius: 1.095,
            startAngleRad: Math.PI * 0.5,
            endAngleRad: Math.PI,
            bottomY: 0,
            topY: 0.24,
            wallThickness: 0.29,
            segments: 10,
          }),
        );
      } else if (prop.type === 'fountain_water_hazard') {
        map.set(
          prop.id,
          buildArcWallSegments({
            pivotX: 0,
            pivotZ: 0,
            radius: 1.42,
            startAngleRad: 0,
            endAngleRad: Math.PI * 2,
            bottomY: 0,
            topY: 0.34,
            wallThickness: 0.24,
            segments: 12,
          }),
        );
      }
    }
    return map;
  }, [course.props]);

  const rampsByTileId = useMemo(() => {
    const map = new Map<
      string,
      Array<{
        id: string;
        transform: ReturnType<typeof computeRampColliderTransform>;
      }>
    >();
    for (const tile of course.tiles) {
      if (tile.ramps.length === 0) continue;
      map.set(
        tile.id,
        tile.ramps.map((ramp) => ({
          id: ramp.id,
          transform: computeRampColliderTransform(ramp, 0.18),
        })),
      );
    }
    return map;
  }, [course.tiles]);

  return (
    <RigidBody
      key={`world-colliders-${course.seed}-${courseVersion}`}
      type="fixed"
      colliders={false}
    >
      {/* Off-island Tier-0 Canal Catch Sensor */}
      <CuboidCollider
        args={[ISLAND_HALF_SIZE + 28, 0.4, ISLAND_HALF_SIZE + 28]}
        position={[0, ELEVATIONS.WATER_BASIN_Y - 0.55, 0]}
        sensor
        onIntersectionEnter={() => onWaterSensorHit?.()}
      />

      {/* All 36 modular 8m x 8m tiles */}
      {course.tiles.map((tile) => {
        const ramps = rampsByTileId.get(tile.id) ?? [];
        return (
          <group
            key={tile.id}
            position={[tile.worldX, 0, tile.worldZ]}
            rotation={[0, tile.rotationY, 0]}
          >
            {tile.surfaces.map((surf) => {
              const mat = getSurfaceMaterialProps(surf.kind, clubId);
              return (
                <CuboidCollider
                  key={surf.id}
                  args={[
                    Math.max(0.02, surf.size[0] * 0.5),
                    Math.max(0.02, surf.size[1] * 0.5),
                    Math.max(0.02, surf.size[2] * 0.5),
                  ]}
                  position={surf.center}
                  friction={mat.friction}
                  restitution={mat.restitution}
                />
              );
            })}

            {ramps.map(({ id, transform }) => (
              <CuboidCollider
                key={id}
                args={transform.halfExtents}
                position={transform.midPosition}
                quaternion={transform.quaternion}
                friction={clubId === 'putter' ? 0.18 : 0.3}
                restitution={clubId === 'putter' ? 0.02 : 0.16}
              />
            ))}

            {tile.waterZones.map((wz) => {
              if (wz.shape === 'cylinder') {
                const rad = Math.max(0.1, wz.radius ?? 1.4);
                const halfH = Math.max(0.12, (wz.height ?? 0.25) * 0.5);
                return (
                  <CylinderCollider
                    key={wz.id}
                    args={[halfH, rad]}
                    position={[wz.center[0], wz.surfaceY - halfH * 0.4, wz.center[2]]}
                    sensor
                    onIntersectionEnter={() => onWaterSensorHit?.()}
                  />
                );
              }
              const [sx, sy, sz] = wz.size ?? [1.5, 0.25, 4.0];
              return (
                <CuboidCollider
                  key={wz.id}
                  args={[
                    Math.max(0.1, sx * 0.5),
                    Math.max(0.12, sy * 0.5),
                    Math.max(0.1, sz * 0.5),
                  ]}
                  position={[wz.center[0], wz.surfaceY - sy * 0.2, wz.center[2]]}
                  sensor
                  onIntersectionEnter={() => onWaterSensorHit?.()}
                />
              );
            })}
          </group>
        );
      })}

      {/* All placed diorama props */}
      {course.props.map((prop) => {
        if (prop.type === 'hotdog_cart_umbrella') {
          return (
            <group
              key={prop.id}
              position={prop.position}
              rotation={[0, prop.rotationY, 0]}
            >
              {/* Left & right wheel rails leave center 1.36m wide x 0.60m tall tunnel clear */}
              <CuboidCollider
                args={[0.08, 0.3, 0.92]}
                position={[-0.76, 0.3, 0]}
                friction={0.25}
                restitution={0.48}
              />
              <CuboidCollider
                args={[0.08, 0.3, 0.92]}
                position={[0.76, 0.3, 0]}
                friction={0.25}
                restitution={0.48}
              />
              {/* Main stainless steel cart body above underpass */}
              <CuboidCollider
                args={[0.66, 0.29, 0.99]}
                position={[0, 0.89, 0]}
                friction={0.25}
                restitution={0.55}
              />
              {/* Umbrella mast pole */}
              <CylinderCollider
                args={[0.45, 0.06]}
                position={[0, 1.62, 0]}
                friction={0.2}
                restitution={0.5}
              />
            </group>
          );
        }

        if (prop.type === 'bistro_umbrella_set') {
          return (
            <group
              key={prop.id}
              position={prop.position}
              rotation={[0, prop.rotationY, 0]}
            >
              <CylinderCollider
                args={[0.42, 0.48]}
                position={[0, 0.42, 0]}
                friction={0.3}
                restitution={0.46}
              />
              <CylinderCollider
                args={[0.58, 0.06]}
                position={[0, 1.42, 0]}
                friction={0.2}
                restitution={0.5}
              />
            </group>
          );
        }

        if (prop.type === 'scaffolding_tunnel') {
          return (
            <group
              key={prop.id}
              position={prop.position}
              rotation={[0, prop.rotationY, 0]}
            >
              {/* Side scaffold rails leave 1.54m wide x 1.46m high clear tunnel */}
              <CuboidCollider
                args={[0.11, 1.175, 1.55]}
                position={[-0.88, 1.175, 0]}
                friction={0.2}
                restitution={0.55}
              />
              <CuboidCollider
                args={[0.11, 1.175, 1.55]}
                position={[0.88, 1.175, 0]}
                friction={0.2}
                restitution={0.55}
              />
              {/* Overhead timber plank deck */}
              <CuboidCollider
                args={[0.975, 0.1, 1.55]}
                position={[0, 1.56, 0]}
                friction={0.55}
                restitution={0.34}
              />
            </group>
          );
        }

        if (prop.type === 'delivery_box_van') {
          return (
            <group
              key={prop.id}
              position={prop.position}
              rotation={[0, prop.rotationY, 0]}
            >
              {/* Van body / cab */}
              <CuboidCollider
                args={[0.99, 1.0, 2.125]}
                position={[0, 1.0, 0]}
                friction={0.28}
                restitution={0.42}
              />
              {/* Bouncy corrugated roof deck */}
              <CuboidCollider
                args={[0.975, 0.12, 2.1]}
                position={[0, 2.12, 0]}
                friction={0.24}
                restitution={0.58}
                onCollisionEnter={() => onDeflectorHit?.(prop)}
              />
            </group>
          );
        }

        if (prop.type === 'fire_hydrant_jet') {
          return (
            <group
              key={prop.id}
              position={prop.position}
              rotation={[0, prop.rotationY, 0]}
            >
              <CylinderCollider
                args={[0.42, 0.3]}
                position={[0, 0.42, 0]}
                friction={0.2}
                restitution={0.62}
              />
            </group>
          );
        }

        if (prop.type === 'curved_gutter_corner') {
          const segments = arcWallsByPropId.get(prop.id) ?? [];
          return (
            <group
              key={prop.id}
              position={prop.position}
              rotation={[0, prop.rotationY, 0]}
            >
              {segments.map((seg, idx) => (
                <CuboidCollider
                  key={`${prop.id}-arc-${idx}`}
                  args={seg.halfExtents}
                  position={seg.center}
                  rotation={[0, seg.rotationY, 0]}
                  friction={0.08}
                  restitution={0.74}
                  onCollisionEnter={() => onDeflectorHit?.(prop)}
                />
              ))}
            </group>
          );
        }

        if (prop.type === 'fountain_water_hazard') {
          const rimSegments = arcWallsByPropId.get(prop.id) ?? [];
          return (
            <group
              key={prop.id}
              position={prop.position}
              rotation={[0, prop.rotationY, 0]}
            >
              {rimSegments.map((seg, idx) => (
                <CuboidCollider
                  key={`${prop.id}-rim-${idx}`}
                  args={seg.halfExtents}
                  position={seg.center}
                  rotation={[0, seg.rotationY, 0]}
                  friction={0.3}
                  restitution={0.52}
                />
              ))}
              {/* Center fountain pedestal */}
              <CylinderCollider
                args={[0.56, 0.42]}
                position={[0, 0.56, 0]}
                friction={0.3}
                restitution={0.48}
              />
              {/* Inner water hazard sensor */}
              <CylinderCollider
                args={[0.25, 1.24]}
                position={[0, 0.1, 0]}
                sensor
                onIntersectionEnter={() => onWaterSensorHit?.(prop.id)}
              />
            </group>
          );
        }

        // Flush / non-blocking props (`subway_steam_grate`, `pigeon_flock`, `golf_bag_tee`)
        if (!prop.blocksGroundRoll) {
          return null;
        }

        if (
          prop.type === 'brass_bollard' ||
          prop.type === 'street_lamp'
        ) {
          const radius = Math.max(
            0.12,
            Math.min(prop.localSize[0], prop.localSize[2]) * 0.44,
          );
          const halfH = Math.max(0.25, prop.localSize[1] * 0.5);
          return (
            <group
              key={prop.id}
              position={prop.position}
              rotation={[0, prop.rotationY, 0]}
            >
              <CylinderCollider
                args={[halfH, radius]}
                position={[0, halfH, 0]}
                friction={0.22}
                restitution={0.58}
              />
            </group>
          );
        }

        // Remaining solid street props (`street_tree`)
        const hx = Math.max(0.15, prop.localSize[0] * 0.5);
        const hy = Math.max(0.2, prop.localSize[1] * 0.5);
        const hz = Math.max(0.15, prop.localSize[2] * 0.5);
        return (
          <group
            key={prop.id}
            position={prop.position}
            rotation={[0, prop.rotationY, 0]}
          >
            <CuboidCollider
              args={[hx, hy, hz]}
              position={[0, hy, 0]}
              friction={0.32}
              restitution={0.46}
            />
          </group>
        );
      })}
    </RigidBody>
  );
}
