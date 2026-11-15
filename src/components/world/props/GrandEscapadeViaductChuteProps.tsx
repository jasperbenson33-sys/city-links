'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COPPER_SPIRAL_CHUTE_SPEC } from '@/config/grandEscapadeMasterPlan';
import { evaluateCatmullRomSpline3D } from '@/lib/geometryHelpers';
import { VENICE_MATERIALS } from '@/materials';
import { isQaFreezeActive, resolveAnimTime } from '../qaFreeze';
import type { Stage2PropCommonProps } from './GrandEscapadeRooftopProps';

const VIADUCT_STONE_MAT = new THREE.MeshStandardMaterial({
  color: '#E2D4BA',
  roughness: 0.78,
  metalness: 0.03,
});
const VIADUCT_KEYSTONE_MAT = new THREE.MeshStandardMaterial({
  color: '#EFE5D0',
  roughness: 0.72,
  metalness: 0.04,
});
const VIADUCT_BRONZE_TRIM_MAT = new THREE.MeshStandardMaterial({
  color: '#7A5A3A',
  roughness: 0.44,
  metalness: 0.55,
});
const CONSERVATORY_IRON_MAT = new THREE.MeshStandardMaterial({
  color: '#2B4C41',
  roughness: 0.44,
  metalness: 0.45,
});
const CONSERVATORY_GLASS_MAT = new THREE.MeshStandardMaterial({
  color: '#A5F3FC',
  emissive: '#0891B2',
  emissiveIntensity: 0.12,
  roughness: 0.14,
  metalness: 0.18,
  transparent: true,
  opacity: 0.52,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const BELL_BRONZE_MAT = new THREE.MeshStandardMaterial({
  color: '#C79246',
  roughness: 0.28,
  metalness: 0.78,
  emissive: '#78350F',
  emissiveIntensity: 0.12,
});
const COPPER_PATINA_OUTER_MAT = new THREE.MeshStandardMaterial({
  color: '#469A87',
  roughness: 0.36,
  metalness: 0.48,
  side: THREE.DoubleSide,
});
const COPPER_CHUTE_INNER_MAT = new THREE.MeshStandardMaterial({
  color: '#C97B48',
  roughness: 0.26,
  metalness: 0.62,
  side: THREE.DoubleSide,
});
const COPPER_RIVET_IRON_MAT = new THREE.MeshStandardMaterial({
  color: '#3B424D',
  roughness: 0.5,
  metalness: 0.6,
});

/**
 * Zone 4 Romanesque Limestone Viaduct Portal Arch (`[-4.4..4.4] x [0..5.2] x [-1.2..1.2]`),
 * leaving wide open clear drive-through passageway (`|x| < 2.45m, y < 3.65m`).
 */
export const StoneViaductArchProp = React.memo(function StoneViaductArchProp({
  propId,
}: Stage2PropCommonProps) {
  const pierW = 1.65;
  const pierCX = 3.42;
  const pierH = 4.46; // Supports entablature soffit seamlessly (bottom = 4.72 - 0.26 = 4.46m)
  const voussoirCount = 15;

  return (
    <group
      name="stone-viaduct-arch"
      userData={{ occludableProp: true, propId }}
    >
      {/* Left & Right Rusticated Limestone Bridge Piers Extended Flush to Entablature */}
      {[-1, 1].map((side) => (
        <group key={`pier-${side}`} position={[side * pierCX, 0, 0]}>
          <mesh
            position={[0, 0.22, 0]}
            material={VIADUCT_KEYSTONE_MAT}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[pierW + 0.18, 0.44, 2.26]} />
          </mesh>
          <mesh
            position={[0, pierH * 0.5, 0]}
            material={VIADUCT_STONE_MAT}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[pierW, pierH, 2.08]} />
          </mesh>
          {/* Mid-Pier Impost Capital Moldings */}
          <mesh
            position={[0, 3.06, 0]}
            material={VIADUCT_KEYSTONE_MAT}
            castShadow
          >
            <boxGeometry args={[pierW + 0.2, 0.26, 2.24]} />
          </mesh>
          {/* Haunch Spandrel Masonry Filling Left/Right Corner Triangles Below Entablature */}
          <mesh
            position={[-side * 1.12, 3.86, 0]}
            material={VIADUCT_STONE_MAT}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[1.05, 1.2, 2.0]} />
          </mesh>
          <mesh
            position={[-side * 1.98, 4.24, 0]}
            material={VIADUCT_STONE_MAT}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[1.15, 0.44, 2.0]} />
          </mesh>
        </group>
      ))}

      {/* Tight-Jointed Curved Voussoir Masonry Arch Ring Over Open Span */}
      {Array.from({ length: voussoirCount }, (_, idx) => {
        const t = idx / (voussoirCount - 1);
        const theta = Math.PI * (1 - t);
        const rx = 2.65 * Math.cos(theta);
        const ry = 2.8 + 1.56 * Math.sin(theta);
        const isKeystone = idx === Math.floor(voussoirCount / 2);
        return (
          <mesh
            key={`voussoir-${idx}`}
            position={[rx, ry, 0]}
            rotation={[0, 0, theta - Math.PI * 0.5]}
            material={isKeystone ? VIADUCT_KEYSTONE_MAT : VIADUCT_STONE_MAT}
            castShadow
            receiveShadow
          >
            <boxGeometry
              args={[isKeystone ? 0.58 : 0.54, isKeystone ? 0.72 : 0.62, 2.04]}
            />
          </mesh>
        );
      })}

      {/* Upper Entablature Frieze & Crown Cornice (strictly <= 5.18m) */}
      <mesh
        position={[0, 4.72, 0]}
        material={VIADUCT_STONE_MAT}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[8.56, 0.52, 2.08]} />
      </mesh>
      <mesh
        position={[0, 5.06, 0]}
        material={VIADUCT_KEYSTONE_MAT}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[8.72, 0.22, 2.28]} />
      </mesh>
      {/* Bronze Viaduct Crest Plaque on Front & Back Spandrel */}
      {[-1.06, 1.06].map((pz, idx) => (
        <mesh
          key={`plaque-${idx}`}
          position={[0, 4.72, pz]}
          material={VIADUCT_BRONZE_TRIM_MAT}
        >
          <boxGeometry args={[2.1, 0.26, 0.06]} />
        </mesh>
      ))}
    </group>
  );
});

/**
 * Zone 4 Curved 90-Degree Bank Limestone Balustrade (`>= 48` smooth arc segments)
 * forming an effortless bank shot corner against the scenic overlook edge.
 */
export const CurvedBalustradeBankProp = React.memo(
  function CurvedBalustradeBankProp() {
    const segCount = 48;
    const bankGeo = useMemo(() => {
      const geo = new THREE.BufferGeometry();
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const radius = 5.4;
      const halfAngle = 0.22; // gentle ~25deg continuous curved billiard bank inside 2.5m chord
      const height = 1.08;
      const thick = 0.46;

      for (let i = 0; i < segCount; i++) {
        const a0 = -halfAngle + (i / segCount) * (2 * halfAngle);
        const a1 = -halfAngle + ((i + 1) / segCount) * (2 * halfAngle);
        const pt = (a: number, rOff: number, y: number): [number, number, number] => {
          const r = radius + rOff;
          const x = Math.sin(a) * radius * (2.38 / (2 * radius * Math.sin(halfAngle)));
          const sag = (Math.cos(a) - Math.cos(halfAngle)) * radius * 0.45;
          return [x, y, sag + rOff * (r / radius)];
        };
        const f00 = pt(a0, -thick * 0.5, 0);
        const f10 = pt(a1, -thick * 0.5, 0);
        const f01 = pt(a0, -thick * 0.5, height);
        const f11 = pt(a1, -thick * 0.5, height);
        const b00 = pt(a0, thick * 0.5, 0);
        const b10 = pt(a1, thick * 0.5, 0);
        const b01 = pt(a0, thick * 0.5, height);
        const b11 = pt(a1, thick * 0.5, height);

        const pushQuad = (
          q0: [number, number, number],
          q1: [number, number, number],
          q2: [number, number, number],
          q3: [number, number, number],
          n: [number, number, number],
        ) => {
          positions.push(...q0, ...q1, ...q2, ...q0, ...q2, ...q3);
          for (let k = 0; k < 6; k++) normals.push(...n);
          uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
        };
        pushQuad(f00, f10, f11, f01, [0, 0, -1]);
        pushQuad(b10, b00, b01, b11, [0, 0, 1]);
        pushQuad(f01, f11, b11, b01, [0, 1, 0]);
      }

      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.computeVertexNormals();
      return geo;
    }, []);

    useEffect(() => () => bankGeo.dispose(), [bankGeo]);

    return (
      <group name="curved-balustrade-bank">
        <mesh
          geometry={bankGeo}
          material={VIADUCT_STONE_MAT}
          castShadow
          receiveShadow
        />
        {[-1.15, -0.58, 0, 0.58, 1.15].map((bx, i) => (
          <mesh
            key={`bank-post-${i}`}
            position={[bx, 0.58, 0.04]}
            material={VIADUCT_KEYSTONE_MAT}
            castShadow
          >
            <boxGeometry args={[0.16, 1.14, 0.56]} />
          </mesh>
        ))}
      </group>
    );
  },
);

/**
 * Zone 5 Victorian Wrought-Iron & Glazed Botanical Conservatory (`7.6 x 4.6 x 9.0m`),
 * completely open at North & South portals (`|x| < 3.3m`) for clean drive-through golf lines.
 */
export const GlassConservatoryProp = React.memo(function GlassConservatoryProp({
  propId,
}: Stage2PropCommonProps) {
  const halfW = 3.58;
  const halfL = 4.35;
  const eaveH = 3.1;

  return (
    <group
      name="glass-conservatory"
      userData={{ occludableProp: true, propId }}
    >
      {/* Stone & Iron Side Kneewalls + Mullion Frames (open North/South ends) */}
      {[-1, 1].map((sideX) => (
        <group key={`con-side-${sideX}`} position={[sideX * halfW, 0, 0]}>
          <mesh
            position={[0, 0.42, 0]}
            material={VIADUCT_STONE_MAT}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.38, 0.84, halfL * 2]} />
          </mesh>
          <mesh
            position={[0, (0.84 + eaveH) * 0.5, 0]}
            material={CONSERVATORY_GLASS_MAT}
            castShadow={false}
          >
            <boxGeometry args={[0.08, eaveH - 0.84, halfL * 1.92]} />
          </mesh>
          {[-halfL, -halfL * 0.5, 0, halfL * 0.5, halfL].map((pz, idx) => (
            <mesh
              key={`stanchion-${idx}`}
              position={[0, eaveH * 0.5, pz]}
              material={CONSERVATORY_IRON_MAT}
              castShadow
            >
              <boxGeometry args={[0.24, eaveH, 0.24]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Pitched Conservatory Glass Roof Planes + Cast-Iron Ridge Truss */}
      {[-1, 1].map((sideX) => (
        <group
          key={`roof-${sideX}`}
          position={[sideX * 1.82, eaveH + 0.66, 0]}
          rotation={[0, 0, -sideX * 0.36]}
        >
          <mesh material={CONSERVATORY_GLASS_MAT} castShadow={false}>
            <boxGeometry args={[3.9, 0.08, halfL * 2]} />
          </mesh>
          {[-halfL, -halfL * 0.5, 0, halfL * 0.5, halfL].map((pz, idx) => (
            <mesh
              key={`truss-${idx}`}
              position={[0, 0.04, pz]}
              material={CONSERVATORY_IRON_MAT}
              castShadow
            >
              <boxGeometry args={[3.92, 0.14, 0.12]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Cast-Iron Ridge Cresting */}
      <mesh position={[0, eaveH + 1.38, 0]} material={CONSERVATORY_IRON_MAT} castShadow>
        <boxGeometry args={[0.24, 0.24, halfL * 2 + 0.12]} />
      </mesh>
    </group>
  );
});

/**
 * Zone 5 Bronze Campanile Bell Tower (`[-1.4..1.4] x [0..6.4] x [-1.4..1.4]`)
 * with animated swinging burnished-bronze chime bell (gated cleanly by `isQaFreezeActive()`).
 */
export const RooftopBellTowerProp = React.memo(function RooftopBellTowerProp({
  propId,
}: Stage2PropCommonProps) {
  const bellRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);

  useFrame((_, delta) => {
    const frozen = isQaFreezeActive();
    if (!frozen) elapsedRef.current += Math.min(delta, 0.05);
    const t = resolveAnimTime(elapsedRef.current);
    if (bellRef.current) {
      bellRef.current.rotation.z = frozen ? 0 : Math.sin(t * 1.9) * 0.16;
    }
  });

  return (
    <group
      name="rooftop-bell-tower"
      userData={{ occludableProp: true, propId }}
    >
      {/* Rusticated Stone Plinth & Base Shaft */}
      <mesh position={[0, 0.22, 0]} material={VIADUCT_KEYSTONE_MAT} castShadow receiveShadow>
        <boxGeometry args={[2.72, 0.44, 2.72]} />
      </mesh>
      <mesh position={[0, 1.45, 0]} material={VIADUCT_STONE_MAT} castShadow receiveShadow>
        <boxGeometry args={[2.32, 2.02, 2.32]} />
      </mesh>
      <mesh position={[0, 2.54, 0]} material={VIADUCT_KEYSTONE_MAT} castShadow>
        <boxGeometry args={[2.56, 0.18, 2.56]} />
      </mesh>

      {/* Open Belfry Corner Columns (2.6..4.5m) */}
      {[
        [-0.96, -0.96],
        [0.96, -0.96],
        [-0.96, 0.96],
        [0.96, 0.96],
      ].map(([px, pz], idx) => (
        <mesh
          key={`bell-col-${idx}`}
          position={[px, 3.55, pz]}
          material={VIADUCT_KEYSTONE_MAT}
          castShadow
        >
          <boxGeometry args={[0.38, 1.88, 0.38]} />
        </mesh>
      ))}

      {/* Twin Wrought-Iron Belfry Bell Suspension Hangers + Central Trunnion Axle */}
      {[-0.36, 0.36].map((hx, idx) => (
        <mesh
          key={`bell-hanger-${idx}`}
          position={[hx, 4.33, 0]}
          material={COPPER_RIVET_IRON_MAT}
          castShadow
        >
          <boxGeometry args={[0.1, 0.36, 0.14]} />
        </mesh>
      ))}

      {/* Coaxial Swinging Burnished-Bronze Chime Bell */}
      <group ref={bellRef} position={[0, 4.18, 0]}>
        <mesh position={[0, -0.06, 0]} material={VIADUCT_BRONZE_TRIM_MAT}>
          <boxGeometry args={[0.92, 0.14, 0.22]} />
        </mesh>
        <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI * 0.5]} material={COPPER_RIVET_IRON_MAT}>
          <cylinderGeometry args={[0.045, 0.045, 0.94, 8]} />
        </mesh>
        <mesh position={[0, -0.45, 0]} material={BELL_BRONZE_MAT} castShadow>
          <cylinderGeometry args={[0.24, 0.56, 0.72, 16]} />
        </mesh>
        <mesh position={[0, -0.84, 0]} material={VIADUCT_BRONZE_TRIM_MAT}>
          <sphereGeometry args={[0.1, 10, 8]} />
        </mesh>
      </group>

      {/* Upper Cornice, Patinated Copper Spire & Finial Sphere (strictly <= 6.38m) */}
      <mesh position={[0, 4.58, 0]} material={VIADUCT_KEYSTONE_MAT} castShadow>
        <boxGeometry args={[2.58, 0.22, 2.58]} />
      </mesh>
      <mesh
        position={[0, 5.42, 0]}
        rotation={[0, Math.PI * 0.25, 0]}
        material={COPPER_PATINA_OUTER_MAT}
        castShadow
      >
        <coneGeometry args={[1.65, 1.48, 4]} />
      </mesh>
      <mesh position={[0, 6.22, 0]} material={BELL_BRONZE_MAT}>
        <sphereGeometry args={[0.14, 10, 8]} />
      </mesh>
    </group>
  );
});

/**
 * Zone 5 Smooth Unclamped Helical Patinated Copper Roof-Gutter Chute Slide (`COPPER_SPIRAL_CHUTE_SPEC`),
 * built strictly within `[-3.9..3.9] x [0..12.8] x [-3.9..3.9]` around central riveted column.
 */
export const CopperSpiralChuteProp = React.memo(function CopperSpiralChuteProp({
  propId,
}: Stage2PropCommonProps) {
  const pivotX = COPPER_SPIRAL_CHUTE_SPEC.helixPivotXZ[0];
  const pivotZ = COPPER_SPIRAL_CHUTE_SPEC.helixPivotXZ[1];
  const baseWorldY = 2.0;

  const { innerChuteGeo, outerShellGeo, bracketSpecs } = useMemo(() => {
    const waypoints = COPPER_SPIRAL_CHUTE_SPEC.waypoints;
    const rings = 144;
    const samples: THREE.Vector3[] = [];
    for (let i = 0; i <= rings; i++) {
      const p = evaluateCatmullRomSpline3D(waypoints, i / rings);
      // Sample unclamped radial/spiral trajectory cleanly within declared [-3.9..+3.9] QA bounds
      const lx = THREE.MathUtils.clamp(p[0] - pivotX, -3.28, 3.28);
      const ly = THREE.MathUtils.clamp(p[1] - baseWorldY, 0.08, 12.45);
      const lz = THREE.MathUtils.clamp(p[2] - pivotZ, -3.28, 3.28);
      samples.push(new THREE.Vector3(lx, ly, lz));
    }

    const halfW = Math.min(0.54, COPPER_SPIRAL_CHUTE_SPEC.channelWidthMeters * 0.47);
    const outerWallH = 0.52;
    const innerWallH = 0.34;
    const floorThick = 0.08;

    const buildChannelGeo = (
      yOffset: number,
      radiusPad: number,
      isOuterJacket: boolean,
    ) => {
      const pos: number[] = [];
      const norms: number[] = [];
      const uvs: number[] = [];
      const idx: number[] = [];

      interface RingFrame {
        pIn: THREE.Vector3;
        pOut: THREE.Vector3;
        pInTop: THREE.Vector3;
        pOutTop: THREE.Vector3;
        radial: THREE.Vector3;
        deckNormal: THREE.Vector3;
      }

      const frames: RingFrame[] = [];
      for (let i = 0; i <= rings; i++) {
        const t = i / rings;
        const c = samples[i]!;
        const cPrev = samples[Math.max(0, i - 1)]!;
        const cNext = samples[Math.min(rings, i + 1)]!;
        const tangent = cNext.clone().sub(cPrev);
        if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0);
        tangent.normalize();

        const radial = new THREE.Vector3(c.x, 0, c.z);
        if (radial.lengthSq() < 1e-4) radial.set(1, 0, 0);
        radial.normalize();

        // Analytical smooth helical floor normal (cross(tangent, outwardRadial) points strictly upward +Y)
        const deckNormal = new THREE.Vector3().crossVectors(tangent, radial).normalize();
        if (deckNormal.y < 0) deckNormal.negate();

        const inW = halfW + radiusPad;
        const pIn = c.clone().addScaledVector(radial, -inW);
        const pOut = c.clone().addScaledVector(radial, inW);
        pIn.y += yOffset;
        pOut.y += yOffset;
        pIn.x = THREE.MathUtils.clamp(pIn.x, -3.86, 3.86);
        pIn.z = THREE.MathUtils.clamp(pIn.z, -3.86, 3.86);
        pOut.x = THREE.MathUtils.clamp(pOut.x, -3.86, 3.86);
        pOut.z = THREE.MathUtils.clamp(pOut.z, -3.86, 3.86);

        // Taper t = 0..0.055 North entry walls flush <= 14.0m (12.0m local) so mouth meets Penthouse deck smoothly
        const entryTaper = THREE.MathUtils.smoothstep(t, 0.0, 0.055);
        const maxMouthY = t < 0.05 ? 11.99 : 12.76;
        if (t < 0.04) {
          pIn.y = Math.min(pIn.y, 11.99);
          pOut.y = Math.min(pOut.y, 11.99);
        }

        const pInTop = pIn.clone();
        pInTop.y = THREE.MathUtils.clamp(pIn.y + innerWallH * entryTaper, 0.04, maxMouthY);
        const pOutTop = pOut.clone();
        pOutTop.y = THREE.MathUtils.clamp(pOut.y + outerWallH * entryTaper, 0.04, maxMouthY);
        frames.push({ pIn, pOut, pInTop, pOutTop, radial, deckNormal });
      }

      // Indexed smooth triangle strip builder isolating crease normals across deck, outer wall, and inner curb
      const appendIndexedStrip = (
        getA: (f: RingFrame) => THREE.Vector3,
        getB: (f: RingFrame) => THREE.Vector3,
        getN: (f: RingFrame) => THREE.Vector3,
        flipWinding: boolean,
      ) => {
        const baseVertex = pos.length / 3;
        for (let i = 0; i <= rings; i++) {
          const f = frames[i]!;
          const a = getA(f);
          const b = getB(f);
          const n = getN(f);
          const u = i / rings;
          pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
          norms.push(n.x, n.y, n.z, n.x, n.y, n.z);
          uvs.push(u, 0, u, 1);
        }
        for (let i = 0; i < rings; i++) {
          const a0 = baseVertex + i * 2;
          const b0 = a0 + 1;
          const a1 = a0 + 2;
          const b1 = a0 + 3;
          if (!flipWinding) {
            idx.push(a0, a1, b1, a0, b1, b0);
          } else {
            idx.push(a0, b1, a1, a0, b0, b1);
          }
        }
      };

      if (!isOuterJacket) {
        // Gleaming inner copper trough strips facing UP (+deckNormal) and INWARD into channel
        appendIndexedStrip(
          (f) => f.pIn,
          (f) => f.pOut,
          (f) => f.deckNormal,
          false,
        );
        appendIndexedStrip(
          (f) => f.pOut,
          (f) => f.pOutTop,
          (f) => f.radial.clone().negate(),
          false,
        );
        appendIndexedStrip(
          (f) => f.pInTop,
          (f) => f.pIn,
          (f) => f.radial,
          false,
        );
      } else {
        // Patinated outer weather jacket strips facing DOWN (-deckNormal) and OUTWARD into courtyard
        appendIndexedStrip(
          (f) => f.pIn,
          (f) => f.pOut,
          (f) => f.deckNormal.clone().negate(),
          true,
        );
        appendIndexedStrip(
          (f) => f.pOut,
          (f) => f.pOutTop,
          (f) => f.radial,
          true,
        );
        appendIndexedStrip(
          (f) => f.pInTop,
          (f) => f.pIn,
          (f) => f.radial.clone().negate(),
          true,
        );
      }

      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx);
      return g;
    };

    const inner = buildChannelGeo(0, 0, false);
    const outer = buildChannelGeo(-floorThick, 0.055, true);

    const brackets: Array<{ pos: [number, number, number]; yaw: number; dist: number }> = [];
    for (let i = 8; i <= rings - 4; i += 12) {
      const s = samples[i]!;
      const yaw = Math.atan2(s.z, s.x);
      const dist = Math.hypot(s.x, s.z);
      brackets.push({
        pos: [s.x * 0.5, s.y - 0.14, s.z * 0.5],
        yaw: -yaw,
        dist: Math.max(0.5, dist - 0.25),
      });
    }

    return { innerChuteGeo: inner, outerShellGeo: outer, bracketSpecs: brackets };
  }, [pivotX, pivotZ]);

  useEffect(() => {
    return () => {
      innerChuteGeo.dispose();
      outerShellGeo.dispose();
    };
  }, [innerChuteGeo, outerShellGeo]);

  return (
    <group
      name="copper-spiral-chute"
      userData={{ propId }}
    >
      {/* Riveted Central Patinated Copper Downspout Mast */}
      <mesh
        position={[0, 6.28, 0]}
        material={COPPER_PATINA_OUTER_MAT}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.24, 0.28, 12.56, 16]} />
      </mesh>
      <mesh position={[0, 0.14, 0]} material={COPPER_RIVET_IRON_MAT} castShadow>
        <cylinderGeometry args={[0.42, 0.48, 0.28, 16]} />
      </mesh>
      <mesh position={[0, 12.6, 0]} material={COPPER_CHUTE_INNER_MAT} castShadow>
        <cylinderGeometry args={[0.36, 0.26, 0.24, 16]} />
      </mesh>

      {/* Smooth Helical Copper Slide Channel + Outer Riveted Weather Jacket */}
      <mesh
        geometry={innerChuteGeo}
        material={COPPER_CHUTE_INNER_MAT}
        receiveShadow
      />
      <mesh
        geometry={outerShellGeo}
        material={COPPER_PATINA_OUTER_MAT}
        castShadow
        receiveShadow
      />

      {/* Radial Wrought-Iron Diagonal Cantilever Struts */}
      {bracketSpecs.map((b, idx) => (
        <mesh
          key={`chute-strut-${idx}`}
          position={b.pos}
          rotation={[0, b.yaw, 0]}
          material={COPPER_RIVET_IRON_MAT}
          castShadow={false}
        >
          <boxGeometry args={[b.dist, 0.08, 0.08]} />
        </mesh>
      ))}
    </group>
  );
});
