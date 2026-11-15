'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildCoaxialWaterTowerSpec } from '@/lib/geometryHelpers';
import { VENICE_MATERIALS } from '@/materials';
import { isQaFreezeActive, resolveAnimTime } from '../qaFreeze';

const CEDAR_STAVE_MAT = new THREE.MeshStandardMaterial({
  color: '#9A633C',
  roughness: 0.78,
  metalness: 0.04,
});
const CEDAR_ROOF_SHINGLE_MAT = new THREE.MeshStandardMaterial({
  color: '#6C4730',
  roughness: 0.84,
  metalness: 0.05,
});
const STEEL_TRESTLE_MAT = new THREE.MeshStandardMaterial({
  color: '#464E59',
  roughness: 0.52,
  metalness: 0.55,
});
const SKYLIGHT_GLASS_MAT = new THREE.MeshStandardMaterial({
  color: '#7DD3FC',
  emissive: '#0EA5E9',
  emissiveIntensity: 0.14,
  roughness: 0.16,
  metalness: 0.14,
  transparent: true,
  opacity: 0.72,
});
const SKYLIGHT_BRONZE_MAT = new THREE.MeshStandardMaterial({
  color: '#5C4D42',
  roughness: 0.48,
  metalness: 0.42,
});
const HVAC_ALUMINUM_MAT = new THREE.MeshStandardMaterial({
  color: '#9CA3AF',
  roughness: 0.38,
  metalness: 0.62,
});
const HVAC_FAN_BLADE_MAT = new THREE.MeshStandardMaterial({
  color: '#CBD5E1',
  roughness: 0.34,
  metalness: 0.55,
});
const HVAC_WELL_MAT = new THREE.MeshStandardMaterial({
  color: '#2B313B',
  roughness: 0.82,
  metalness: 0.18,
});
const HVAC_AIR_RIBBON_MAT = new THREE.MeshBasicMaterial({
  color: '#E0F2FE',
  transparent: true,
  opacity: 0.36,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const GREENHOUSE_IRON_MAT = new THREE.MeshStandardMaterial({
  color: '#2D5245',
  roughness: 0.5,
  metalness: 0.38,
});

export interface Stage2PropCommonProps {
  propId?: string;
  isStandaloneQA?: boolean;
  forceAction?: boolean;
}

/**
 * Zone 3 Iconic NYC Cedar-Stave Rooftop Water Tower mounted cleanly on coaxial
 * riveted steel trestle legs (strictly bounded within [-1.35..1.35] x [0..5.7] x [-1.35..1.35]).
 */
export const RooftopWaterTowerProp = React.memo(function RooftopWaterTowerProp({
  propId,
}: Stage2PropCommonProps) {
  const spec = useMemo(() => buildCoaxialWaterTowerSpec(), []);
  const girtHalf = Math.abs(spec.trestleLegs[0]?.position[0] ?? 0.9);
  const girtSpan = girtHalf * 2.02;

  return (
    <group
      name="rooftop-water-tower"
      userData={{ occludableProp: true, propId }}
    >
      {/* 4 Anchored Steel Trestle Columns + Foot Pads (local y = 0..deck) */}
      {spec.trestleLegs.map((leg) => (
        <group key={`leg-${leg.index}`}>
          <mesh
            position={[leg.position[0], 0.04, leg.position[2]]}
            material={STEEL_TRESTLE_MAT}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.24, 0.08, 0.24]} />
          </mesh>
          <mesh
            position={leg.position}
            material={STEEL_TRESTLE_MAT}
            castShadow
            receiveShadow
          >
            <boxGeometry args={leg.size} />
          </mesh>
        </group>
      ))}

      {/* Horizontal Cross-Girt Bracing Tier */}
      <group position={[0, spec.crossGirtY, 0]}>
        {[-1, 1].map((s) => (
          <React.Fragment key={`bar-${s}`}>
            <mesh
              position={[0, 0, s * girtHalf]}
              material={STEEL_TRESTLE_MAT}
              castShadow={false}
            >
              <boxGeometry args={[girtSpan, 0.07, 0.07]} />
            </mesh>
            <mesh
              position={[s * girtHalf, 0, 0]}
              material={STEEL_TRESTLE_MAT}
              castShadow={false}
            >
              <boxGeometry args={[0.07, 0.07, girtSpan]} />
            </mesh>
          </React.Fragment>
        ))}
      </group>

      {/* Coaxial Timber Platform Deck */}
      <mesh
        position={spec.deck.center}
        material={CEDAR_ROOF_SHINGLE_MAT}
        castShadow
        receiveShadow
      >
        <cylinderGeometry
          args={[spec.deck.radius, spec.deck.radius, spec.deck.thickness, 18]}
        />
      </mesh>

      {/* Main Coaxial Cedar-Stave Tank Barrel */}
      <mesh
        position={spec.barrel.center}
        material={CEDAR_STAVE_MAT}
        castShadow
        receiveShadow
      >
        <cylinderGeometry
          args={[spec.barrel.radius, spec.barrel.radius * 1.01, spec.barrel.height, 18]}
        />
      </mesh>

      {/* Galvanized Steel Tension Hoops Around Barrel */}
      {spec.steelHoops.map((hoop) => (
        <mesh
          key={`hoop-${hoop.index}`}
          position={hoop.center}
          material={STEEL_TRESTLE_MAT}
          castShadow={false}
        >
          <cylinderGeometry
            args={[
              hoop.radius,
              hoop.radius,
              hoop.tubeRadius * 2.2,
              18,
              1,
              true,
            ]}
          />
        </mesh>
      ))}

      {/* Conical Shingled Timber Roof Cap */}
      <mesh
        position={spec.conicalRoof.center}
        material={CEDAR_ROOF_SHINGLE_MAT}
        castShadow
        receiveShadow
      >
        <coneGeometry args={[spec.conicalRoof.radius, spec.conicalRoof.height, 18]} />
      </mesh>

      {/* Coaxial Roof Finial Spire */}
      <mesh
        position={spec.finial.center}
        material={STEEL_TRESTLE_MAT}
        castShadow={false}
      >
        <cylinderGeometry args={[spec.finial.radius * 0.5, spec.finial.radius, spec.finial.height, 8]} />
      </mesh>
    </group>
  );
});

/**
 * Zone 3 Angled Glass Skylight Bank Board (~28-32 deg glazed bank wall inside [-1.6..1.6] x [0..1.45] x [-0.95..0.95]).
 */
export const AngledSkylightBankProp = React.memo(
  function AngledSkylightBankProp({ propId }: Stage2PropCommonProps) {
    const gableCheekGeom = useMemo(() => {
      const shape = new THREE.Shape();
      // Right-rotated (+Math.PI / 2 around Y): shape X maps to -Z, shape Y maps to +Y.
      // Traces seamlessly from plinth top (0.22m) up into the 0.52 rad pitched sash frame.
      shape.moveTo(-0.64, 0.22);
      shape.lineTo(0.66, 0.22);
      shape.lineTo(0.66, 1.08);
      shape.lineTo(-0.64, 0.34);
      shape.closePath();
      const geom = new THREE.ExtrudeGeometry(shape, {
        depth: 0.09,
        bevelEnabled: false,
      });
      geom.translate(0, 0, -0.045);
      geom.computeVertexNormals();
      return geom;
    }, []);

    useEffect(() => {
      return () => {
        gableCheekGeom.dispose();
      };
    }, [gableCheekGeom]);

    return (
      <group
        name="angled-skylight-bank"
        userData={{ occludableProp: true, propId, tightBallRayOnly: true }}
      >
        {/* Flashing Curb Plinth (grounded flush at y = 0) */}
        <mesh
          position={[0, 0.12, 0]}
          material={SKYLIGHT_BRONZE_MAT}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[3.12, 0.24, 1.82]} />
        </mesh>

        {/* Front Bronze Drip Flashing Apron sealing lower lip under glass bank */}
        <mesh
          position={[0, 0.29, 0.62]}
          material={SKYLIGHT_BRONZE_MAT}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[3.02, 0.14, 0.16]} />
        </mesh>

        {/* Left & Right Extruded Bronze Gable Cheek Plates (seal both side triangles airtightly) */}
        {[-1.445, 1.445].map((cx, idx) => (
          <mesh
            key={`gable-cheek-${idx}`}
            position={[cx, 0, 0]}
            rotation={[0, Math.PI * 0.5, 0]}
            geometry={gableCheekGeom}
            material={SKYLIGHT_BRONZE_MAT}
            castShadow
            receiveShadow
          />
        ))}

        {/* Pitched Skylight Sash Frame & Wired-Glass Bank Deck */}
        <group position={[0, 0.72, 0]} rotation={[0.52, 0, 0]}>
          <mesh
            position={[0, 0, 0]}
            material={SKYLIGHT_BRONZE_MAT}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[3.04, 0.14, 1.48]} />
          </mesh>
          <mesh
            position={[0, 0.06, 0]}
            material={SKYLIGHT_GLASS_MAT}
            receiveShadow
          >
            <boxGeometry args={[2.86, 0.06, 1.32]} />
          </mesh>
          {/* Cross Bronze Glazing Mullions */}
          {[-0.95, 0, 0.95].map((mx, idx) => (
            <mesh
              key={`mullion-${idx}`}
              position={[mx, 0.09, 0]}
              material={SKYLIGHT_BRONZE_MAT}
              castShadow={false}
            >
              <boxGeometry args={[0.075, 0.06, 1.42]} />
            </mesh>
          ))}
        </group>

        {/* Rear Bronze Louver Backplate & Support Spine */}
        <mesh
          position={[0, 0.65, -0.58]}
          material={SKYLIGHT_BRONZE_MAT}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[2.98, 0.9, 0.24]} />
        </mesh>
      </group>
    );
  },
);

/**
 * Zone 3 Rooftop Botanical Café Greenhouse Pergola (open-ended along Z so ball rolls straight through).
 */
export const GreenhousePergolaProp = React.memo(function GreenhousePergolaProp({
  propId,
}: Stage2PropCommonProps) {
  const halfW = 1.66;
  const halfL = 2.48;
  const postH = 2.62;

  return (
    <group
      name="greenhouse-pergola"
      userData={{ occludableProp: true, propId }}
    >
      {/* Stone Corner Planter Plinths & Iron Columns along Left/Right Walls (|Z| clear ends!) */}
      {[-1, 1].map((sideX) =>
        [-halfL, 0, halfL].map((pz, pIdx) => (
          <group key={`gh-col-${sideX}-${pIdx}`} position={[sideX * halfW, 0, pz]}>
            <mesh
              position={[0, 0.18, 0]}
              material={VENICE_MATERIALS.stuccoCreamLimestone}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.26, 0.36, 0.26]} />
            </mesh>
            <mesh
              position={[0, 0.36 + (postH - 0.36) * 0.5, 0]}
              material={GREENHOUSE_IRON_MAT}
              castShadow
            >
              <boxGeometry args={[0.12, postH - 0.36, 0.12]} />
            </mesh>
          </group>
        )),
      )}

      {/* Side Planter Troughs + Conservatory Top Rails */}
      {[-1, 1].map((sideX) => (
        <group key={`gh-side-${sideX}`} position={[sideX * halfW, 0, 0]}>
          <mesh
            position={[0, postH + 0.07, 0]}
            material={GREENHOUSE_IRON_MAT}
            castShadow
          >
            <boxGeometry args={[0.16, 0.14, halfL * 2 + 0.24]} />
          </mesh>
        </group>
      ))}

      {/* Overhead Timber/Iron Rafters + Translucent Greenhouse Glass Canopy */}
      {[-halfL, -halfL * 0.5, 0, halfL * 0.5, halfL].map((rz, rIdx) => (
        <mesh
          key={`gh-rafter-${rIdx}`}
          position={[0, postH + 0.2, rz]}
          material={GREENHOUSE_IRON_MAT}
          castShadow
        >
          <boxGeometry args={[halfW * 2 + 0.26, 0.12, 0.1]} />
        </mesh>
      ))}
      <mesh
        position={[0, postH + 0.3, 0]}
        material={SKYLIGHT_GLASS_MAT}
        castShadow={false}
      >
        <boxGeometry args={[halfW * 1.92, 0.05, halfL * 2.04]} />
      </mesh>

      {/* Lush Climbing Botanical Clusters & Coral Blossoms on Pergola Roof */}
      {[-1.7, -0.5, 0.8, 1.9].map((vz, vIdx) => (
        <group
          key={`gh-vine-${vIdx}`}
          position={[vIdx % 2 === 0 ? -1.15 : 1.15, postH + 0.34, vz]}
        >
          <mesh material={VENICE_MATERIALS.pergolaVineLeaf} castShadow={false}>
            <dodecahedronGeometry args={[0.38, 0]} />
          </mesh>
          <mesh
            position={[0.15, 0.1, 0.15]}
            material={VENICE_MATERIALS.flowerBoxBlossomGold}
            castShadow={false}
          >
            <dodecahedronGeometry args={[0.13, 0]} />
          </mesh>
        </group>
      ))}
    </group>
  );
});

/**
 * Zone 3 HVAC Rooftop Updraft Fan: flush rooftop exhaust cowling (`<= 0.34m`) with spinning
 * 6-blade aluminum turbine + swirling updraft airflow rings strictly gated by `isQaFreezeActive()`.
 */
export const HvacUpdraftFanProp = React.memo(function HvacUpdraftFanProp({
  isStandaloneQA = false,
  forceAction = false,
}: Stage2PropCommonProps) {
  const rotorRef = useRef<THREE.Group>(null);
  const vortexRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);

  useFrame((_, delta) => {
    const frozen = isQaFreezeActive();
    if (!frozen) elapsedRef.current += Math.min(delta, 0.05);
    const t = resolveAnimTime(elapsedRef.current);

    if (rotorRef.current) {
      rotorRef.current.rotation.y = frozen ? 0.45 : t * 8.5;
    }

    if (vortexRef.current) {
      const showRibbons = (!isStandaloneQA || forceAction) && !frozen;
      vortexRef.current.visible = showRibbons;
      if (showRibbons) {
        const children = vortexRef.current.children;
        for (let i = 0; i < children.length; i++) {
          const ring = children[i];
          if (!ring) continue;
          const phase = (t * 0.9 + i * 0.33) % 1;
          ring.position.y = 0.32 + phase * 1.95;
          ring.rotation.y = t * 2.8 + i * 1.1;
          const scale = 0.72 + phase * 0.55;
          ring.scale.set(scale, 1, scale);
        }
      }
    }
  });

  return (
    <group name="hvac-updraft-fan">
      {/* Outer Galvanized Steel Cylindrical Exhaust Shroud (local y = 0..0.33) */}
      <mesh
        position={[0, 0.15, 0]}
        material={HVAC_ALUMINUM_MAT}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.98, 1.02, 0.3, 24]} />
      </mesh>
      {/* Top Protective Rim Collar */}
      <mesh
        position={[0, 0.305, 0]}
        rotation={[Math.PI * 0.5, 0, 0]}
        material={STEEL_TRESTLE_MAT}
        castShadow={false}
      >
        <torusGeometry args={[0.92, 0.04, 8, 24]} />
      </mesh>
      {/* Recessed Dark Exhaust Well */}
      <mesh position={[0, 0.24, 0]} material={HVAC_WELL_MAT} receiveShadow>
        <cylinderGeometry args={[0.85, 0.85, 0.14, 22]} />
      </mesh>

      {/* Spinning 6-Blade Aluminum Impeller */}
      <group ref={rotorRef} position={[0, 0.27, 0]}>
        <mesh material={STEEL_TRESTLE_MAT} castShadow={false}>
          <cylinderGeometry args={[0.16, 0.18, 0.08, 12]} />
        </mesh>
        {Array.from({ length: 6 }, (_, i) => {
          const ang = (i / 6) * Math.PI * 2;
          return (
            <group key={`blade-${i}`} rotation={[0, ang, 0]}>
              <mesh
                position={[0.46, 0, 0]}
                rotation={[0.38, 0, 0]}
                material={HVAC_FAN_BLADE_MAT}
                castShadow={false}
              >
                <boxGeometry args={[0.66, 0.025, 0.18]} />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* Translucent Updraft Airflow Vortex Rings (hidden in frozen QA / idle gallery so bounds stay <= 0.35m) */}
      <group ref={vortexRef} visible={false}>
        {[0, 1, 2].map((i) => (
          <mesh
            key={`air-ring-${i}`}
            position={[0, 0.4 + i * 0.6, 0]}
            rotation={[Math.PI * 0.5, 0, 0]}
            material={HVAC_AIR_RIBBON_MAT}
            castShadow={false}
          >
            <torusGeometry args={[0.68, 0.032, 6, 20]} />
          </mesh>
        ))}
      </group>
    </group>
  );
});
