'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildCoaxialStreetlampSpec } from '@/lib/geometryHelpers';
import { TOYBOX_MATERIALS } from '@/materials';

export interface StreetBollardPropProps {
  position?: [number, number, number];
  rotationY?: number;
  showWireframe?: boolean;
}

/**
 * Cast-iron & brass NYC/Venetian sidewalk bollard seated flush at y = 0.
 */
export function StreetBollardProp({
  position = [0, 0, 0],
  rotationY = 0,
  showWireframe = false,
}: StreetBollardPropProps) {
  return (
    <group
      name="street-bollard-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.04, 0]}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry args={[0.14, 0.17, 0.08, 10]} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.42, 0]}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry args={[0.095, 0.115, 0.68, 10]} />
      </mesh>
      <mesh position={[0, 0.64, 0]} material={TOYBOX_MATERIALS.taxiAmber}>
        <cylinderGeometry args={[0.104, 0.104, 0.08, 10]} />
      </mesh>
      <mesh
        castShadow
        position={[0, 0.8, 0]}
        material={TOYBOX_MATERIALS.brassAccent}
      >
        <sphereGeometry args={[0.098, 10, 8]} />
      </mesh>

      {showWireframe && (
        <mesh
          position={[0, 0.44, 0]}
          material={TOYBOX_MATERIALS.qaColliderWireframe}
        >
          <cylinderGeometry args={[0.17, 0.17, 0.88, 10]} />
        </mesh>
      )}
    </group>
  );
}

export interface StreetTreePropProps {
  position?: [number, number, number];
  scale?: number;
  variant?: 'emerald' | 'sunny' | 'peach';
  phase?: number;
  showWireframe?: boolean;
}

/**
 * Shared cast-iron & granite circular tree-pit ring seated flush at y = 0.00m.
 */
function CircularTreePitRing({ outerRadius = 0.58 }: { outerRadius?: number }) {
  return (
    <group name="tree-pit-ring">
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.03, 0]}
        material={TOYBOX_MATERIALS.limestoneCurb}
      >
        <cylinderGeometry args={[outerRadius, outerRadius + 0.02, 0.06, 12]} />
      </mesh>
      <mesh
        receiveShadow
        position={[0, 0.048, 0]}
        material={TOYBOX_MATERIALS.cedarDark}
      >
        <cylinderGeometry
          args={[outerRadius - 0.08, outerRadius - 0.08, 0.02, 12]}
        />
      </mesh>
      {[-0.24, -0.1, 0.1, 0.24].map((off, idx) => (
        <mesh
          key={`grate-x-${idx}`}
          receiveShadow
          position={[off, 0.06, 0]}
          material={TOYBOX_MATERIALS.bistroCastIron}
        >
          <boxGeometry args={[0.035, 0.014, outerRadius * 1.6]} />
        </mesh>
      ))}
      <mesh
        receiveShadow
        position={[0, 0.064, 0]}
        material={TOYBOX_MATERIALS.bistroCastIron}
      >
        <cylinderGeometry args={[0.24, 0.24, 0.016, 12]} />
      </mesh>
    </group>
  );
}

/**
 * Walkabout: Venice-style sculpted Mediterranean street tree in a circular
 * granite & cast-iron tree-pit ring seated flush at y = 0 (~2.85m tall).
 */
export function StreetTreeProp({
  position = [0, 0, 0],
  scale = 1,
  variant = 'emerald',
  phase = 0,
  showWireframe = false,
}: StreetTreePropProps) {
  const canopyRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);

  const primaryFoliage =
    variant === 'sunny'
      ? TOYBOX_MATERIALS.foliageSunny
      : variant === 'peach'
        ? TOYBOX_MATERIALS.foliagePeach
        : TOYBOX_MATERIALS.foliageEmerald;
  const secondaryFoliage =
    variant === 'emerald'
      ? TOYBOX_MATERIALS.foliageSunny
      : TOYBOX_MATERIALS.foliageEmerald;

  useFrame((_, delta) => {
    elapsedRef.current += Math.min(delta, 0.05);
    const t = elapsedRef.current;
    if (!canopyRef.current) return;
    canopyRef.current.rotation.z = Math.sin(t * 1.4 + phase) * 0.026;
    canopyRef.current.rotation.x = Math.cos(t * 1.1 + phase) * 0.02;
  });

  return (
    <group name="street-tree-prop" position={position} scale={scale}>
      <CircularTreePitRing outerRadius={0.58} />

      <mesh
        castShadow
        receiveShadow
        position={[0, 0.14, 0]}
        material={TOYBOX_MATERIALS.treeTrunk}
      >
        <cylinderGeometry args={[0.12, 0.18, 0.18, 7]} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.92, 0]}
        material={TOYBOX_MATERIALS.treeTrunk}
      >
        <cylinderGeometry args={[0.088, 0.125, 1.48, 7]} />
      </mesh>
      <mesh
        castShadow
        position={[-0.14, 1.56, 0.08]}
        rotation={[0.2, 0, 0.36]}
        material={TOYBOX_MATERIALS.treeTrunk}
      >
        <cylinderGeometry args={[0.048, 0.072, 0.56, 6]} />
      </mesh>
      <mesh
        castShadow
        position={[0.16, 1.6, -0.06]}
        rotation={[-0.18, 0, -0.34]}
        material={TOYBOX_MATERIALS.treeTrunk}
      >
        <cylinderGeometry args={[0.045, 0.068, 0.54, 6]} />
      </mesh>

      <group ref={canopyRef} position={[0, 2.08, 0]}>
        <mesh
          castShadow
          receiveShadow
          position={[0, 0.08, 0]}
          material={primaryFoliage}
        >
          <dodecahedronGeometry args={[0.68, 0]} />
        </mesh>
        <mesh
          castShadow
          receiveShadow
          position={[-0.38, -0.1, 0.24]}
          material={secondaryFoliage}
        >
          <dodecahedronGeometry args={[0.46, 0]} />
        </mesh>
        <mesh
          castShadow
          receiveShadow
          position={[0.4, -0.06, -0.22]}
          material={primaryFoliage}
        >
          <icosahedronGeometry args={[0.48, 0]} />
        </mesh>
        <mesh
          castShadow
          receiveShadow
          position={[0.05, 0.42, 0.08]}
          material={secondaryFoliage}
        >
          <icosahedronGeometry args={[0.4, 0]} />
        </mesh>
        <mesh
          castShadow
          receiveShadow
          position={[0.28, -0.14, 0.32]}
          material={primaryFoliage}
        >
          <dodecahedronGeometry args={[0.36, 0]} />
        </mesh>
      </group>

      {showWireframe && (
        <mesh
          position={[0, 1.425, 0]}
          material={TOYBOX_MATERIALS.qaBoundsWireframe}
        >
          <boxGeometry args={[1.2, 2.85, 1.2]} />
        </mesh>
      )}
    </group>
  );
}

export interface OverhangingStreetTreePropProps {
  position?: [number, number, number];
  rotationY?: number;
  phase?: number;
  showWireframe?: boolean;
}

function computeBranchSegment(
  start: [number, number, number],
  end: [number, number, number],
  bottomR: number,
  topR: number
) {
  const s = new THREE.Vector3(...start);
  const e = new THREE.Vector3(...end);
  const dir = new THREE.Vector3().subVectors(e, s);
  const length = dir.length();
  const mid = new THREE.Vector3().addVectors(s, e).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  const euler = new THREE.Euler().setFromQuaternion(quat);
  return {
    position: [mid.x, mid.y, mid.z] as [number, number, number],
    rotation: [euler.x, euler.y, euler.z] as [number, number, number],
    length,
    bottomR,
    topR,
  };
}

/**
 * Overhanging East Curb Street Tree (tree-overhang-east in COURSE_MASTER_PLAN).
 * - Tree pit & root base planted flush at local [0, 0, 0].
 * - Every bough seamlessly connects from the upper trunk junction directly into
 *   canopy lobe interiors (zero mid-air dangling stubs from any viewing angle).
 * - Multi-lobe faceted canopy strictly spans local x: [-4.40..+1.45], y: [2.50..5.45], z: [-1.45..+2.60].
 */
export function OverhangingStreetTreeProp({
  position = [0, 0, 0],
  rotationY = 0,
  phase = 0.7,
  showWireframe = false,
}: OverhangingStreetTreePropProps) {
  const canopyRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);

  useFrame((_, delta) => {
    elapsedRef.current += Math.min(delta, 0.05);
    const t = elapsedRef.current;
    if (!canopyRef.current) return;
    canopyRef.current.rotation.z = Math.sin(t * 1.15 + phase) * 0.015;
    canopyRef.current.rotation.x = Math.cos(t * 0.95 + phase) * 0.012;
  });

  // 7 sculpted faceted canopy lobes staying strictly inside local x: [-4.40..+1.45], y: [2.50..5.45], z: [-1.45..+2.60]
  const lobes: Array<{
    pos: [number, number, number];
    radius: number;
    scale: [number, number, number];
    sunny?: boolean;
  }> = [
    { pos: [-1.45, 3.88, 0.55], radius: 1.28, scale: [1.32, 0.9, 1.12] },
    { pos: [-3.12, 3.55, 0.05], radius: 1.06, scale: [1.14, 0.85, 1.02], sunny: true },
    { pos: [-2.75, 3.68, 1.38], radius: 1.02, scale: [1.1, 0.86, 1.08] },
    { pos: [-0.25, 4.18, 0.82], radius: 1.14, scale: [1.15, 0.95, 1.08], sunny: true },
    { pos: [-0.65, 3.72, -0.45], radius: 0.92, scale: [1.12, 0.86, 0.96] },
    { pos: [-1.75, 4.68, 0.45], radius: 0.94, scale: [1.2, 0.76, 1.02], sunny: true },
    { pos: [0.35, 3.45, 0.25], radius: 0.92, scale: [1.06, 0.82, 1.04] },
  ];

  // Main trunk rises from [0, 0.15, 0] to fork node [-0.58, 2.58, 0.18],
  // then every limb runs upward directly into a foliage lobe interior (zero dangling stubs!)
  const branches = useMemo(() => {
    const forkNode: [number, number, number] = [-0.58, 2.52, 0.18];
    return [
      computeBranchSegment([0, 0.12, 0], forkNode, 0.23, 0.16),
      computeBranchSegment(forkNode, [-1.45, 3.65, 0.5], 0.145, 0.085),
      computeBranchSegment([-1.15, 3.25, 0.35], [-2.85, 3.55, 0.12], 0.1, 0.058),
      computeBranchSegment([-1.05, 3.15, 0.45], [-2.55, 3.65, 1.25], 0.095, 0.055),
      computeBranchSegment(forkNode, [-0.28, 3.85, 0.72], 0.11, 0.06),
      computeBranchSegment(forkNode, [-0.62, 3.58, -0.36], 0.1, 0.055),
      computeBranchSegment([-0.32, 2.15, 0.14], [0.3, 3.38, 0.24], 0.095, 0.052),
    ];
  }, []);

  return (
    <group
      name="overhanging-street-tree-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      <CircularTreePitRing outerRadius={0.6} />

      {/* Root Flare & Connected Trunk / Boughs */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.16, 0]}
        material={TOYBOX_MATERIALS.treeTrunk}
      >
        <cylinderGeometry args={[0.2, 0.28, 0.24, 8]} />
      </mesh>
      {branches.map((b, idx) => (
        <mesh
          key={`branch-${idx}`}
          castShadow
          receiveShadow
          position={b.position}
          rotation={b.rotation}
          material={TOYBOX_MATERIALS.treeTrunk}
        >
          <cylinderGeometry args={[b.topR, b.bottomR, b.length, 7]} />
        </mesh>
      ))}

      {/* Sculpted Low-Poly Canopy Volumes (Local y: 2.50..5.45) */}
      <group ref={canopyRef}>
        {lobes.map((lobe, idx) => (
          <mesh
            key={`lobe-${idx}`}
            castShadow
            receiveShadow
            position={lobe.pos}
            scale={lobe.scale}
            material={
              lobe.sunny
                ? TOYBOX_MATERIALS.foliageSunny
                : TOYBOX_MATERIALS.foliageEmerald
            }
          >
            {idx % 2 === 0 ? (
              <dodecahedronGeometry args={[lobe.radius, 0]} />
            ) : (
              <icosahedronGeometry args={[lobe.radius, 0]} />
            )}
          </mesh>
        ))}
      </group>

      {showWireframe && (
        <group>
          <mesh
            position={[0, 1.32, 0]}
            material={TOYBOX_MATERIALS.qaBoundsWireframe}
          >
            <boxGeometry args={[1.2, 2.64, 1.2]} />
          </mesh>
          <mesh
            position={[-1.475, 3.975, 0.575]}
            material={TOYBOX_MATERIALS.qaColliderWireframe}
          >
            <boxGeometry args={[5.85, 2.95, 4.05]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

export interface StreetLampPropProps {
  position?: [number, number, number];
  rotationY?: number;
  showWireframe?: boolean;
}

/**
 * Venetian Wrought-Iron Streetlamp built coaxially from buildCoaxialStreetlampSpec.
 */
export function StreetLampProp({
  position = [0, 0, 0],
  rotationY = 0,
  showWireframe = false,
}: StreetLampPropProps) {
  const spec = useMemo(
    () =>
      buildCoaxialStreetlampSpec({
        postHeight: 3.15,
        basePlinthHeight: 0.42,
        basePlinthRadius: 0.19,
        armReachZ: 0.48,
        globeRadius: 0.155,
      }),
    []
  );

  return (
    <group
      name="street-lamp-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      <mesh
        castShadow
        receiveShadow
        position={spec.basePlinth.position}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry
          args={[
            spec.basePlinth.topRadius,
            spec.basePlinth.bottomRadius,
            spec.basePlinth.height,
            8,
          ]}
        />
      </mesh>

      <mesh
        castShadow
        receiveShadow
        position={spec.post.position}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry
          args={[
            spec.post.topRadius,
            spec.post.bottomRadius,
            spec.post.height,
            10,
          ]}
        />
      </mesh>

      {spec.collarRings.map((ring, idx) => (
        <mesh
          key={`collar-${idx}`}
          castShadow
          position={ring.position}
          material={TOYBOX_MATERIALS.brassAccent}
        >
          <cylinderGeometry args={[ring.radius, ring.radius, ring.height, 10]} />
        </mesh>
      ))}

      <mesh
        castShadow
        position={spec.bracketArm.position}
        rotation={spec.bracketArm.rotation}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry
          args={[
            spec.bracketArm.radius,
            spec.bracketArm.radius,
            spec.bracketArm.length,
            8,
          ]}
        />
      </mesh>
      <mesh
        castShadow
        position={[
          0,
          spec.bracketArm.position[1] - 0.15,
          spec.bracketArm.position[2] * 0.56,
        ]}
        rotation={[-0.78, 0, 0]}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry
          args={[0.018, 0.018, spec.bracketArm.length * 0.72, 6]}
        />
      </mesh>

      <mesh
        castShadow
        position={spec.lanternAssembly.collarPosition}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry args={[0.068, 0.048, 0.075, 6]} />
      </mesh>
      <mesh
        position={spec.lanternAssembly.globePosition}
        material={TOYBOX_MATERIALS.bulbWarmGlow}
      >
        <cylinderGeometry
          args={[
            spec.lanternAssembly.globeRadius * 0.92,
            spec.lanternAssembly.globeRadius * 0.68,
            spec.lanternAssembly.globeRadius * 1.48,
            6,
          ]}
        />
      </mesh>
      {Array.from({ length: 6 }, (_, idx) => {
        const a = (idx / 6) * Math.PI * 2;
        const r = spec.lanternAssembly.globeRadius * 0.92;
        return (
          <mesh
            key={`cage-bar-${idx}`}
            position={[
              spec.lanternAssembly.globePosition[0] + Math.cos(a) * r,
              spec.lanternAssembly.globePosition[1],
              spec.lanternAssembly.globePosition[2] + Math.sin(a) * r,
            ]}
            material={TOYBOX_MATERIALS.darkIron}
          >
            <cylinderGeometry
              args={[0.008, 0.008, spec.lanternAssembly.globeRadius * 1.5, 4]}
            />
          </mesh>
        );
      })}
      <mesh
        castShadow
        position={spec.lanternAssembly.capPosition}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <coneGeometry
          args={[
            spec.lanternAssembly.capRadius,
            spec.lanternAssembly.capHeight,
            6,
          ]}
        />
      </mesh>
      <mesh
        castShadow
        position={spec.lanternAssembly.finialPosition}
        material={TOYBOX_MATERIALS.brassAccent}
      >
        <sphereGeometry args={[0.036, 8, 6]} />
      </mesh>

      {showWireframe && (
        <mesh
          position={[0, spec.totalHeight * 0.5, 0]}
          material={TOYBOX_MATERIALS.qaBoundsWireframe}
        >
          <boxGeometry args={[0.45, spec.totalHeight, 0.72]} />
        </mesh>
      )}
    </group>
  );
}

export interface CornerBuildingAccentPropProps {
  position?: [number, number, number];
  rotationY?: number;
  width?: number;
  wallColor?: 'terracotta' | 'peach' | 'cream' | 'sage';
  awningColor?: 'coral' | 'mint' | 'navy';
  showWireframe?: boolean;
}

/**
 * Modular Grounded Facade Vignette Accent for corner storefronts & QA diorama bays.
 */
export function CornerBuildingAccentProp({
  position = [0, 0, 0],
  rotationY = 0,
  width = 4.2,
  wallColor = 'terracotta',
  awningColor = 'mint',
  showWireframe = false,
}: CornerBuildingAccentPropProps) {
  const wallMat =
    wallColor === 'peach'
      ? TOYBOX_MATERIALS.pastelPeach
      : wallColor === 'cream'
        ? TOYBOX_MATERIALS.pastelCream
        : wallColor === 'sage'
          ? TOYBOX_MATERIALS.pastelSage
          : TOYBOX_MATERIALS.terracottaBrick;

  const awningMat =
    awningColor === 'coral'
      ? TOYBOX_MATERIALS.awningCoral
      : awningColor === 'navy'
        ? TOYBOX_MATERIALS.awningNavy
        : TOYBOX_MATERIALS.awningMint;

  const wallHeight = 5.4;

  return (
    <group
      name="corner-building-accent-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      <mesh
        receiveShadow
        position={[0, 0.22, 0]}
        material={TOYBOX_MATERIALS.limestoneTrim}
      >
        <boxGeometry args={[width + 0.08, 0.44, 0.56]} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.44 + (wallHeight - 0.44) * 0.5, 0]}
        material={wallMat}
      >
        <boxGeometry args={[width, wallHeight - 0.44, 0.48]} />
      </mesh>
      <mesh
        castShadow
        position={[0, wallHeight + 0.08, 0.04]}
        material={TOYBOX_MATERIALS.limestoneTrim}
      >
        <boxGeometry args={[width + 0.2, 0.16, 0.62]} />
      </mesh>
      <mesh
        position={[0, 1.42, 0.25]}
        material={TOYBOX_MATERIALS.windowWarmGlow}
      >
        <boxGeometry args={[width * 0.62, 1.32, 0.06]} />
      </mesh>
      <mesh
        castShadow
        position={[0, 2.28, 0.48]}
        rotation={[0.35, 0, 0]}
        material={awningMat}
      >
        <boxGeometry args={[width * 0.72, 0.08, 0.66]} />
      </mesh>

      {[-width * 0.28, width * 0.28].map((wx, idx) => (
        <group key={`win-${idx}`} position={[wx, 3.85, 0.25]}>
          <mesh material={TOYBOX_MATERIALS.limestoneTrim}>
            <boxGeometry args={[0.74, 1.12, 0.08]} />
          </mesh>
          <mesh
            position={[0, 0, 0.025]}
            material={TOYBOX_MATERIALS.windowSkyGlass}
          >
            <boxGeometry args={[0.56, 0.94, 0.04]} />
          </mesh>
          <mesh
            castShadow
            position={[0, -0.58, 0.08]}
            material={TOYBOX_MATERIALS.terracottaDeep}
          >
            <boxGeometry args={[0.66, 0.14, 0.16]} />
          </mesh>
          <mesh
            position={[0, -0.49, 0.08]}
            material={TOYBOX_MATERIALS.flowerCoral}
          >
            <boxGeometry args={[0.54, 0.1, 0.1]} />
          </mesh>
        </group>
      ))}

      {showWireframe && (
        <mesh
          position={[0, wallHeight * 0.5, 0]}
          material={TOYBOX_MATERIALS.qaBoundsWireframe}
        >
          <boxGeometry args={[width + 0.2, wallHeight + 0.2, 0.72]} />
        </mesh>
      )}
    </group>
  );
}
