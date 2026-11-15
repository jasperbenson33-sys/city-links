'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import type {
  CourseMasterPlan,
  CoursePropSpec,
  GrandEscapadeMasterPlan,
  GrandEscapadeZoneNumber,
  GrandEscapadeZoneSpec,
  Vec3Tuple,
} from '@/types/course';
import { VENICE_MATERIALS } from '@/materials';
import { PlacedPropRenderer } from '../props';
import { ZoneSpatialChunk } from './ZoneSpatialChunk';
import { Zone7SubwayFinale } from './Zone7SubwayFinale';

const SCAFFOLD_PIPE_MAT = new THREE.MeshStandardMaterial({
  color: '#525B66',
  roughness: 0.45,
  metalness: 0.56,
});
const VIADUCT_ARCH_PIER_MAT = new THREE.MeshStandardMaterial({
  color: '#D5C6AB',
  roughness: 0.8,
  metalness: 0.03,
});
const BRASS_VIEWFINDER_MAT = new THREE.MeshStandardMaterial({
  color: '#DFB654',
  roughness: 0.28,
  metalness: 0.72,
});
const GLOBE_LAMP_MAT = new THREE.MeshStandardMaterial({
  color: '#FEF3C7',
  emissive: '#FBBF24',
  emissiveIntensity: 0.8,
  roughness: 0.24,
});

export interface GrandEscapadeZonesLayerProps {
  plan: CourseMasterPlan;
  ballPosition?: Vec3Tuple;
  ballWorldPositionRef?: React.RefObject<THREE.Vector3 | null>;
  propHitTimestamps?: Record<string, number>;
  showWireframe?: boolean;
  forceAction?: boolean;
}

function isZoneDynamicProp(prop: CoursePropSpec): boolean {
  return (
    prop.type === 'hotdog_cart_umbrella' ||
    prop.type === 'bistro_umbrella_set' ||
    prop.type === 'fire_hydrant_jet' ||
    prop.type === 'fountain_water_hazard' ||
    prop.type === 'delivery_box_van' ||
    prop.type === 'pigeon_flock' ||
    prop.type === 'subway_steam_grate' ||
    prop.escapadePropType === 'hvac_updraft_fan' ||
    prop.escapadePropType === 'rooftop_bell_tower'
  );
}

/**
 * Coordinates Zones 1..7 spatially (`<group name="Zone1">`..`<group name="Zone7">`),
 * rendering all zone props (always mounted for CameraRig occlusion indexing & shadows) plus
 * distance-culled micro-ornaments (`> 110m` hidden smoothly via `.visible` in `useFrame`)
 * and Zone 7's Guastavino vaulted IRT station finale.
 */
export const GrandEscapadeZonesLayer = React.memo(function GrandEscapadeZonesLayer({
  plan,
  ballPosition,
  ballWorldPositionRef,
  propHitTimestamps,
  showWireframe = false,
  forceAction = false,
}: GrandEscapadeZonesLayerProps) {
  const escapadePlan =
    plan.courseId === 'grand-escapade' && 'zones' in plan
      ? (plan as GrandEscapadeMasterPlan)
      : null;
  const zones = escapadePlan?.zones ?? [];

  const propsByZone = useMemo(() => {
    const grouped = new Map<GrandEscapadeZoneNumber, CoursePropSpec[]>();
    for (let z = 1; z <= 7; z++) {
      grouped.set(z as GrandEscapadeZoneNumber, []);
    }
    for (const p of plan.props) {
      const zn = (p.zoneNumber ?? 1) as GrandEscapadeZoneNumber;
      grouped.get(zn)?.push(p);
    }
    return grouped;
  }, [plan.props]);

  const renderZoneProps = (props: CoursePropSpec[]) =>
    props.map((prop) => {
      const dynamic = isZoneDynamicProp(prop);
      const hitTs =
        propHitTimestamps?.[prop.id] ?? propHitTimestamps?.[prop.type] ?? -10;
      const umbTs =
        prop.type === 'hotdog_cart_umbrella' || prop.type === 'bistro_umbrella_set'
          ? hitTs
          : -10;
      const hydTs = prop.type === 'fire_hydrant_jet' ? hitTs : -10;
      const fntTs = prop.type === 'fountain_water_hazard' ? hitTs : -10;
      const vanTs = prop.type === 'delivery_box_van' ? hitTs : -10;

      return (
        <PlacedPropRenderer
          key={prop.id}
          prop={prop}
          ballPosition={prop.type === 'pigeon_flock' ? ballPosition : undefined}
          lastUmbrellaHitAt={dynamic ? umbTs : -10}
          lastHydrantSurfAt={dynamic ? hydTs : -10}
          lastFountainSplashAt={dynamic ? fntTs : -10}
          lastVanRoofHitAt={dynamic ? vanTs : -10}
          showWireframe={showWireframe}
          forceAction={forceAction}
          isStandaloneQA={false}
        />
      );
    });

  const renderZoneMicroDetail = (zone: GrandEscapadeZoneSpec) => {
    switch (zone.zoneNumber) {
      case 1:
        return (
          <group name="z1-bodega-micro-accents">
            {[
              [-9.8, 0.42, 16.0],
              [-9.8, 0.42, -2.0],
              [9.8, 0.42, 4.0],
            ].map(([x, y, z], i) => (
              <mesh
                key={`z1-bol-${i}`}
                position={[x, y, z]}
                material={BRASS_VIEWFINDER_MAT}
                castShadow={false}
              >
                <cylinderGeometry args={[0.1, 0.13, 0.84, 10]} />
              </mesh>
            ))}
          </group>
        );
      case 2:
        return (
          <group name="z2-brownstone-stoop-accents">
            {/* Hillside terraced wrought-iron stoop posts & warm globes along landings */}
            {[
              [-7.2, 3.1, -46.0],
              [7.2, 3.1, -46.0],
              [-7.2, 6.3, -64.0],
              [7.2, 6.3, -64.0],
              [-7.2, 9.5, -80.0],
            ].map(([x, y, z], i) => (
              <group key={`z2-lamp-${i}`} position={[x, y, z]}>
                <mesh position={[0, 0.55, 0]} material={VENICE_MATERIALS.wroughtIron} castShadow={false}>
                  <cylinderGeometry args={[0.06, 0.09, 1.1, 8]} />
                </mesh>
                <mesh position={[0, 1.18, 0]} material={GLOBE_LAMP_MAT} castShadow={false}>
                  <sphereGeometry args={[0.16, 10, 8]} />
                </mesh>
              </group>
            ))}
          </group>
        );
      case 3:
        return (
          <group name="z3-rooftop-scaffold-bents">
            {/* Steel tubular scaffold support bents centered under ramp-z3-rooftop-scaffold (z=-84) */}
            {[9.0, 11.5, 14.0].map((sx, idx) => {
              const t = (sx - 6.0) / (15.0 - 6.0);
              const deckBotY = 9.5 + t * 1.5 - 0.35;
              const bentH = Math.max(0.5, deckBotY - 8.2);
              return (
                <group key={`z3-bent-${idx}`} position={[sx, deckBotY - bentH * 0.5, -84.0]}>
                  {[-3.1, 3.1].map((sz, j) => (
                    <mesh key={`leg-${j}`} position={[0, 0, sz]} material={SCAFFOLD_PIPE_MAT} castShadow={false}>
                      <cylinderGeometry args={[0.06, 0.07, bentH, 8]} />
                    </mesh>
                  ))}
                  <mesh position={[0, bentH * 0.25, 0]} material={SCAFFOLD_PIPE_MAT} castShadow={false}>
                    <boxGeometry args={[0.07, 0.07, 6.2]} />
                  </mesh>
                </group>
              );
            })}
          </group>
        );
      case 4:
        return (
          <group name="z4-viaduct-overlook-details">
            {/* Romanesque viaduct support piers centered underneath zone-z4-viaduct-belvedere (x=55, z=-58) */}
            {[-59.5, -56.5].map((vz, idx) => (
              <mesh
                key={`z4-pier-${idx}`}
                position={[55.0, 5.8, vz]}
                material={VIADUCT_ARCH_PIER_MAT}
                receiveShadow
              >
                <boxGeometry args={[2.4, 11.6, 1.5]} />
              </mesh>
            ))}
            {/* Scenic Brass Coin-Operated Overlook Binoculars Facing West Across Zones 1-3 */}
            <group position={[50.4, 16.5, -35.5]}>
              <mesh position={[0, 0.64, 0]} material={BRASS_VIEWFINDER_MAT} castShadow={false}>
                <cylinderGeometry args={[0.055, 0.085, 1.28, 10]} />
              </mesh>
              <mesh
                position={[-0.08, 1.32, 0]}
                rotation={[0, 0, 1.35]}
                material={BRASS_VIEWFINDER_MAT}
                castShadow={false}
              >
                <cylinderGeometry args={[0.07, 0.095, 0.42, 10]} />
              </mesh>
            </group>
          </group>
        );
      case 5:
        return (
          <group name="z5-conservatory-lanterns">
            {[-25.5, -16.5].map((cz, i) => (
              <group key={`z5-urn-${i}`} position={[51.2, 16.5, cz]}>
                <mesh position={[0, 0.28, 0]} material={VIADUCT_ARCH_PIER_MAT} castShadow={false}>
                  <cylinderGeometry args={[0.26, 0.2, 0.56, 10]} />
                </mesh>
                <mesh position={[0, 0.68, 0]} material={VENICE_MATERIALS.pergolaVineLeaf} castShadow={false}>
                  <dodecahedronGeometry args={[0.3, 0]} />
                </mesh>
              </group>
            ))}
          </group>
        );
      case 6:
        return (
          <group name="z6-transit-headhouse-beacons">
            {/* Beaux-Arts Emerald & Opal Subway Globe Pedestal Lamps Flanking Headhouse Entry */}
            {[29.6, 38.4].map((lx, i) => (
              <group key={`z6-beacon-${i}`} position={[lx, 0.0, 52.0]}>
                <mesh position={[0, 1.25, 0]} material={VENICE_MATERIALS.wroughtIron} castShadow={false}>
                  <cylinderGeometry args={[0.09, 0.14, 2.5, 10]} />
                </mesh>
                <mesh position={[0, 2.66, 0]} material={GLOBE_LAMP_MAT} castShadow={false}>
                  <sphereGeometry args={[0.26, 12, 10]} />
                </mesh>
              </group>
            ))}
          </group>
        );
      case 7:
        return null;
      default:
        return null;
    }
  };

  return (
    <group name="grand-escapade-spatial-zones">
      {zones.map((zone) => {
        const zoneProps = propsByZone.get(zone.zoneNumber) ?? [];
        return (
          <ZoneSpatialChunk
            key={zone.id}
            zone={zone}
            ballPosition={ballPosition}
            ballWorldPositionRef={ballWorldPositionRef}
            microDetail={renderZoneMicroDetail(zone)}
          >
            {zone.zoneNumber === 7 && escapadePlan?.subwayStationVault ? (
              <Zone7SubwayFinale vault={escapadePlan.subwayStationVault} />
            ) : null}
            {renderZoneProps(zoneProps)}
          </ZoneSpatialChunk>
        );
      })}
    </group>
  );
});
