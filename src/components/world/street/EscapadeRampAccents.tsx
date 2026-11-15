'use client';

import React from 'react';
import * as THREE from 'three';
import type { WalkableRampSpec } from '@/types/course';
import { VENICE_MATERIALS } from '@/materials';

const BRASS_RAIL_MAT = new THREE.MeshStandardMaterial({
  color: '#DFB654',
  roughness: 0.3,
  metalness: 0.72,
  emissive: '#78350F',
  emissiveIntensity: 0.08,
});

const SUBWAY_TREAD_NOSING_MAT = new THREE.MeshStandardMaterial({
  color: '#1E5B45',
  roughness: 0.48,
  metalness: 0.08,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

const SUBWAY_STEP_SIDE_MAT = new THREE.MeshStandardMaterial({
  color: '#D7D2C6',
  roughness: 0.65,
  metalness: 0.04,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

const SCAFFOLD_TIMBER_RAIL_MAT = new THREE.MeshStandardMaterial({
  color: '#8C5E38',
  roughness: 0.84,
  metalness: 0.04,
});

const SCAFFOLD_STEEL_PIPE_MAT = new THREE.MeshStandardMaterial({
  color: '#5C6470',
  roughness: 0.45,
  metalness: 0.58,
});

export function rampBasis(ramp: WalkableRampSpec) {
  const { minX, maxX, minZ, maxZ } = ramp.boundsXZ;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const riseY = ramp.topY - ramp.bottomY;
  const alongX = ramp.climbDirection === 'east' || ramp.climbDirection === 'west';
  const alongSpan = alongX ? spanX : spanZ;
  const crossSpan = alongX ? spanZ : spanX;
  const slopeLen = Math.hypot(alongSpan, riseY);
  const angle = Math.atan2(riseY, alongSpan);
  // Rotate +PI/2 around Y so local +X points north (-Z) when ramp climbs north or south
  const yaw = alongX ? 0 : Math.PI * 0.5;
  const tiltZ = alongX
    ? ramp.climbDirection === 'east'
      ? angle
      : -angle
    : ramp.climbDirection === 'north'
      ? angle
      : -angle;

  return {
    cx: (minX + maxX) * 0.5,
    cy: (ramp.bottomY + ramp.topY) * 0.5,
    cz: (minZ + maxZ) * 0.5,
    alongX,
    alongSpan,
    crossSpan,
    riseY,
    slopeLen,
    yaw,
    tiltZ,
  };
}

/**
 * Architectural stair treads (outer edge strips + brass transit handrails) for Zone 6/7
 * Beaux-Arts steps & Sunken Subway Stairwells, plus timber/steel cleats for Zone 3 scaffolds.
 */
export const EscapadeRampAccents = React.memo(function EscapadeRampAccents({
  ramp,
}: {
  ramp: WalkableRampSpec;
}) {
  const b = rampBasis(ramp);
  const isStair =
    ramp.id.includes('stairwell') || ramp.id.includes('steps');
  const isScaffold =
    ramp.id.includes('scaffold') || ramp.id.includes('plank-bridge');

  if (!isStair && !isScaffold) return null;

  if (isScaffold) {
    const railSide = Math.max(0.4, b.crossSpan * 0.5 - 0.14);
    const cleatCount = Math.max(4, Math.floor(b.slopeLen / 1.35));
    const postCount = Math.max(3, Math.floor(b.slopeLen / 2.2));
    return (
      <group
        name={`ramp-scaffold-accents-${ramp.id}`}
        position={[b.cx, b.cy, b.cz]}
        rotation={[0, b.yaw, 0]}
      >
        <group rotation={[0, 0, b.tiltZ]}>
          {/* Flanking Timber Toe-Boards */}
          {[-1, 1].map((side) => (
            <group key={`toe-${side}`} position={[0, 0, side * railSide]}>
              <mesh
                position={[0, 0.08, 0]}
                material={SCAFFOLD_TIMBER_RAIL_MAT}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[b.slopeLen - 0.08, 0.14, 0.1]} />
              </mesh>
              <mesh
                position={[0, 0.86, 0]}
                material={SCAFFOLD_STEEL_PIPE_MAT}
                castShadow={false}
              >
                <boxGeometry args={[b.slopeLen - 0.08, 0.055, 0.055]} />
              </mesh>
              {Array.from({ length: postCount }, (_, pIdx) => {
                const lx =
                  ((pIdx + 0.5) / postCount - 0.5) * (b.slopeLen - 0.4);
                return (
                  <mesh
                    key={`post-${pIdx}`}
                    position={[lx, 0.45, 0]}
                    material={SCAFFOLD_STEEL_PIPE_MAT}
                    castShadow={false}
                  >
                    <cylinderGeometry args={[0.028, 0.028, 0.86, 8]} />
                  </mesh>
                );
              })}
            </group>
          ))}

          {/* Flush Non-Tripping Cross Plank Seam Accent Strips */}
          {Array.from({ length: cleatCount }, (_, idx) => {
            const lx = ((idx + 0.5) / cleatCount - 0.5) * (b.slopeLen - 0.4);
            return (
              <mesh
                key={`plank-seam-${idx}`}
                position={[lx, 0.008, 0]}
                material={SCAFFOLD_TIMBER_RAIL_MAT}
                receiveShadow
                castShadow={false}
              >
                <boxGeometry args={[0.06, 0.014, b.crossSpan - 0.36]} />
              </mesh>
            );
          })}
        </group>
      </group>
    );
  }

  // Beaux-Arts / Subway Stairwells: flanking brass handrails + side pedestrian step strips
  // keeping center fairway silky-smooth with flush terrazzo joint bands.
  const isSubwayStair = ramp.id.includes('subway');
  const railZ = Math.max(0.55, b.crossSpan * 0.5 - 0.16);
  const stripZ = Math.max(0.35, b.crossSpan * 0.5 - 0.44);
  const stepCount = Math.max(5, Math.floor(b.slopeLen / 0.85));
  const postCount = Math.max(3, Math.floor(b.slopeLen / 2.6));

  return (
    <group
      name={`ramp-stair-accents-${ramp.id}`}
      position={[b.cx, b.cy, b.cz]}
      rotation={[0, b.yaw, 0]}
    >
      <group rotation={[0, 0, b.tiltZ]}>
        {/* Brass Subway Handrails on Both Cheeks */}
        {[-1, 1].map((side) => (
          <group key={`brass-rail-${side}`} position={[0, 0, side * railZ]}>
            <mesh
              position={[0, 0.88, 0]}
              material={BRASS_RAIL_MAT}
              castShadow={false}
            >
              <boxGeometry args={[b.slopeLen - 0.14, 0.055, 0.055]} />
            </mesh>
            <mesh
              position={[0, 0.48, 0]}
              material={VENICE_MATERIALS.wroughtIron}
              castShadow={false}
            >
              <boxGeometry args={[b.slopeLen - 0.18, 0.032, 0.032]} />
            </mesh>
            {Array.from({ length: postCount }, (_, pIdx) => {
              const lx =
                ((pIdx + 0.5) / postCount - 0.5) * (b.slopeLen - 0.5);
              return (
                <mesh
                  key={`stanchion-${pIdx}`}
                  position={[lx, 0.45, 0]}
                  material={BRASS_RAIL_MAT}
                  castShadow={false}
                >
                  <cylinderGeometry args={[0.032, 0.04, 0.9, 10]} />
                </mesh>
              );
            })}
          </group>
        ))}

        {/* Flanking Stair-Tread Band Accents on Outer Side Strips + Emerald Safety Nosings */}
        {Array.from({ length: stepCount }, (_, idx) => {
          const lx = ((idx + 0.5) / stepCount - 0.5) * (b.slopeLen - 0.3);
          return (
            <group key={`tread-${idx}`} position={[lx, 0.008, 0]}>
              <mesh
                position={[0, 0, 0]}
                material={
                  isSubwayStair ? SUBWAY_TREAD_NOSING_MAT : SUBWAY_STEP_SIDE_MAT
                }
                receiveShadow
                castShadow={false}
              >
                <boxGeometry args={[0.075, 0.014, b.crossSpan - 0.5]} />
              </mesh>
              {[-1, 1].map((side) => (
                <mesh
                  key={`wing-step-${side}`}
                  position={[0, 0.012, side * stripZ]}
                  material={SUBWAY_STEP_SIDE_MAT}
                  receiveShadow
                  castShadow={false}
                >
                  <boxGeometry args={[0.38, 0.022, 0.46]} />
                </mesh>
              ))}
            </group>
          );
        })}
      </group>
    </group>
  );
});
