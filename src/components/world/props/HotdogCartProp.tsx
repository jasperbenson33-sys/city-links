'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  buildCoaxialWheelSpec,
  buildPitchedAwningSpec,
  type CoaxialWheelSpec,
} from '@/lib/geometryHelpers';
import { CONFETTI_TOYBOX_MATERIALS, TOYBOX_MATERIALS } from '@/materials';
import { isQaFreezeActive, resolveAnimTime } from '../qaFreeze';
import { computeSteamCameraFade } from './propMaterials';

/**
 * Local cached polygon-offset clones (shared TOYBOX materials are never mutated).
 * tier 1 => factor/units -1, tier 2 => -2, tier 3 => -3.
 */
const LAYERED_CACHE = new WeakMap<THREE.Material, Map<number, THREE.Material>>();
function layered<T extends THREE.Material>(base: T, tier: 1 | 2 | 3): T {
  let byTier = LAYERED_CACHE.get(base);
  if (!byTier) {
    byTier = new Map();
    LAYERED_CACHE.set(base, byTier);
  }
  let m = byTier.get(tier);
  if (!m) {
    m = base.clone();
    m.polygonOffset = true;
    m.polygonOffsetFactor = -tier;
    m.polygonOffsetUnits = -tier;
    byTier.set(tier, m);
  }
  return m as T;
}

/** Minimum rendered radius for thin rods (>= 0.035m diameter, stylized). */
const MIN_THIN_RADIUS = 0.0175;

export interface HotdogCartPropProps {
  position?: [number, number, number];
  rotationY?: number;
  /** Timestamp (performance.now() * 0.001) of most recent awning hit. */
  lastHitAt?: number;
  /** Pitched awning slope in degrees matching COURSE_MASTER_PLAN (28 deg). */
  pitchDeg?: number;
  /** Restitution coefficient for QA display & wireframe metadata. */
  restitution?: number;
  showWireframe?: boolean;
}

const STEAM_COUNT = 7;
const CONFETTI_COUNT = 16;
const LUG_COUNT = 6;

/**
 * Shared sub-component rendering a coaxial spoked wheel directly from CoaxialWheelSpec.
 * Every tire, rim, hub, hubcap, lug-bolt ring, spoke, and axle shares the exact same
 * wheel rotation plane & center along spec.axleDirection.
 */
export function CoaxialWheelMeshGroup({
  spec,
  position,
  tireMaterial = TOYBOX_MATERIALS.tireRubber,
  rimMaterial = TOYBOX_MATERIALS.chromeSilver,
  hubMaterial = TOYBOX_MATERIALS.brassAccent,
  showLugRing = true,
}: {
  spec: CoaxialWheelSpec;
  position: [number, number, number];
  tireMaterial?: THREE.Material;
  rimMaterial?: THREE.Material;
  hubMaterial?: THREE.Material;
  showLugRing?: boolean;
}) {
  const lugPositions = useMemo(() => {
    if (!showLugRing) return [] as Array<[number, number, number]>;
    const [cx, cy, cz] = spec.wheelCenter;
    const [ox, , oz] = spec.hubcap.outboardPosition;
    const lugOrbitR = Math.min(
      spec.rim.innerRadius * 0.62,
      Math.max(spec.hub.radius * 0.68, spec.hubcap.radius * 0.58)
    );

    const isX = spec.axleAxis === 'x';
    const u: [number, number, number] = isX ? [0, 1, 0] : [1, 0, 0];
    const v: [number, number, number] = isX ? [0, 0, 1] : [0, 1, 0];

    const baseAx = isX ? ox : oz;
    const axisDir = isX ? 0 : 2;
    const centerArr: [number, number, number] = [cx, cy, cz];
    centerArr[axisDir] = baseAx;

    return Array.from({ length: LUG_COUNT }, (_, idx) => {
      const a = (idx / LUG_COUNT) * Math.PI * 2;
      const ca = Math.cos(a) * lugOrbitR;
      const sa = Math.sin(a) * lugOrbitR;
      return [
        centerArr[0] + u[0] * ca + v[0] * sa,
        centerArr[1] + u[1] * ca + v[1] * sa,
        centerArr[2] + u[2] * ca + v[2] * sa,
      ] as [number, number, number];
    });
  }, [spec, showLugRing]);

  return (
    <group position={position}>
      <mesh
        castShadow
        receiveShadow
        position={spec.tire.position}
        rotation={spec.tire.rotation}
        material={tireMaterial}
      >
        <torusGeometry
          args={[
            spec.tire.majorRadius,
            spec.tire.tubeRadius,
            spec.tire.radialSegments,
            spec.tire.tubularSegments,
          ]}
        />
      </mesh>

      <mesh
        position={spec.rim.position}
        rotation={spec.rim.rotation}
        material={rimMaterial}
      >
        <cylinderGeometry
          args={[
            spec.rim.outerRadius,
            spec.rim.outerRadius,
            spec.rim.width,
            spec.rim.radialSegments,
            1,
            true,
          ]}
        />
      </mesh>

      <mesh
        castShadow
        position={spec.hub.position}
        rotation={spec.hub.rotation}
        material={hubMaterial}
      >
        <cylinderGeometry
          args={[
            spec.hub.radius,
            spec.hub.radius,
            spec.hub.width,
            spec.hub.radialSegments,
          ]}
        />
      </mesh>

      <mesh
        position={spec.hubcap.outboardPosition}
        rotation={spec.hubcap.rotation}
        material={layered(hubMaterial, 1)}
      >
        <cylinderGeometry
          args={[
            spec.hubcap.radius,
            spec.hubcap.radius,
            spec.hubcap.thickness,
            12,
          ]}
        />
      </mesh>
      <mesh
        position={spec.hubcap.inboardPosition}
        rotation={spec.hubcap.rotation}
        material={layered(TOYBOX_MATERIALS.darkIron, 1)}
      >
        <cylinderGeometry
          args={[
            spec.hubcap.radius * 0.9,
            spec.hubcap.radius * 0.9,
            spec.hubcap.thickness,
            12,
          ]}
        />
      </mesh>

      {lugPositions.map((lugPos, idx) => (
        <mesh
          key={`lug-${idx}`}
          position={lugPos}
          rotation={spec.hub.rotation}
          material={TOYBOX_MATERIALS.darkIron}
        >
          <cylinderGeometry args={[MIN_THIN_RADIUS, MIN_THIN_RADIUS, 0.035, 6]} />
        </mesh>
      ))}

      <mesh
        position={spec.axle.position}
        rotation={spec.axle.rotation}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry
          args={[
            spec.axle.radius,
            spec.axle.radius,
            spec.axle.length,
            spec.axle.radialSegments,
          ]}
        />
      </mesh>

      {spec.spokes.map((spoke) => (
        <mesh
          key={spoke.index}
          position={spoke.position}
          rotation={spoke.rotation}
          material={rimMaterial}
        >
          <cylinderGeometry
            args={[
              Math.max(spoke.radius, MIN_THIN_RADIUS),
              Math.max(spoke.radius, MIN_THIN_RADIUS),
              spoke.length,
              6,
            ]}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Curbside Hotdog Vendor Cart & 28-Degree Pitched Striped Awning.
 * - Twin coaxial spoked wheels flush at y = 0 + rear/front stabilizer kickstands at y = 0.
 * - Stainless & painted cream/coral cart with glowing glass warmer/condiment bay and steaming hotdogs.
 * - Red-and-white striped canvas awning built via buildPitchedAwningSpec(pitchDeg: 28, restitution: 0.28)
 *   supported cleanly from below by 4 corner counter stanchions + underside purlins/rafters
 *   trimmed strictly to the underside plane so zero poles pierce through the top canvas.
 */
export function HotdogCartProp({
  position = [0, 0, 0],
  rotationY = 0,
  lastHitAt = -10,
  pitchDeg = 28,
  restitution = 0.28,
  showWireframe = false,
}: HotdogCartPropProps) {
  const awningBounceRef = useRef<THREE.Group>(null);
  const bellRef = useRef<THREE.Group>(null);
  const steamGroupRef = useRef<THREE.Group>(null);
  const confettiGroupRef = useRef<THREE.Group>(null);
  const puffWorldPos = useMemo(() => new THREE.Vector3(), []);

  // Per-puff clones preserve createSoftSteamMaterial Fresnel + <1.65m camera discard hooks.
  const puffMaterials = useMemo(
    () =>
      Array.from({ length: STEAM_COUNT }, () =>
        TOYBOX_MATERIALS.steamColumnWhite.clone()
      ),
    []
  );

  useEffect(() => {
    return () => {
      for (const m of puffMaterials) m.dispose();
    };
  }, [puffMaterials]);

  const wheelSpec = useMemo(
    () =>
      buildCoaxialWheelSpec({
        outerRadius: 0.34,
        tireTubeRadius: 0.068,
        axleAxis: 'x',
        spokeCount: 8,
        rimWidth: 0.085,
        hubRadius: 0.062,
        hubWidth: 0.12,
        axleRadius: 0.022,
        axleLength: 0.22,
      }),
    []
  );

  const awningSpec = useMemo(
    () =>
      buildPitchedAwningSpec({
        width: 1.88,
        slopedDepth: 1.65,
        centerY: 2.15,
        pitchDeg,
        stripeCount: 7,
        mountBottomY: 1.18,
        restitution,
        rotationY,
      }),
    [pitchDeg, restitution, rotationY]
  );

  const confettiSpecs = useMemo(() => {
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => {
      const ang = (i / CONFETTI_COUNT) * Math.PI * 2;
      const spd = 1.6 + (i % 4) * 0.55;
      return {
        vx: Math.cos(ang) * spd,
        vy: 2.4 + (i % 5) * 0.45,
        vz: Math.sin(ang) * spd,
        rotSpeed: 6 + (i % 4) * 2,
      };
    });
  }, []);

  // 4 corner counter stanchions trimmed cleanly to the exact underside plane of the 28-deg awning
  const cornerStanchions = useMemo(() => {
    const cartDeckY = 1.18;
    const pitchRad = (pitchDeg * Math.PI) / 180;
    const centerY = awningSpec.center[1];
    // Canvas panel bottom surface vertical projection: -halfThickness / cos(pitchRad) (~0.034m) + snug seat
    const undersideOffset = 0.045;
    const zFront = 0.58;
    const zRear = -0.58;
    const xs = [-0.64, 0.64];
    const zs = [zFront, zRear];

    const posts: Array<{
      x: number;
      z: number;
      topY: number;
      height: number;
      midY: number;
    }> = [];
    for (const x of xs) {
      for (const z of zs) {
        const topY = centerY - z * Math.tan(pitchRad) - undersideOffset;
        const height = Math.max(0.2, topY - cartDeckY);
        posts.push({
          x,
          z,
          topY,
          height,
          midY: cartDeckY + height * 0.5,
        });
      }
    }

    const frontTopY = centerY - zFront * Math.tan(pitchRad) - undersideOffset;
    const rearTopY = centerY - zRear * Math.tan(pitchRad) - undersideOffset;
    const rafterDx = zFront - zRear;
    const rafterDy = rearTopY - frontTopY;
    const rafterLength = Math.hypot(rafterDx, rafterDy) + 0.16;

    return {
      posts,
      frontPurlin: { y: frontTopY, z: zFront },
      rearPurlin: { y: rearTopY, z: zRear },
      rafter: {
        y: (frontTopY + rearTopY) * 0.5 - 0.015,
        z: (zFront + zRear) * 0.5,
        length: rafterLength,
        pitchRad,
      },
    };
  }, [awningSpec.center, pitchDeg]);

  useFrame((state) => {
    // Absolute clock (no frame-rate dependent accumulation); pinned when ?qaFreezeParticles=1.
    const t = resolveAnimTime(state.clock.elapsedTime);
    const now = typeof performance !== 'undefined' ? performance.now() * 0.001 : t;
    // Hit reactions are wall-clock driven; suppress them entirely under the QA freeze.
    const dt = isQaFreezeActive() ? -1 : now - lastHitAt;

    if (awningBounceRef.current) {
      if (dt >= 0 && dt < 0.72) {
        const decay = Math.exp(-5.4 * dt);
        const wave = Math.sin(dt * 24.0);
        const sx = 1 + 0.12 * decay * wave;
        const sy = 1 - 0.16 * decay * wave;
        awningBounceRef.current.scale.set(sx, sy, sx);
      } else {
        const breath = 1 + Math.sin(t * 2.1) * 0.006;
        awningBounceRef.current.scale.set(breath, 1, breath);
      }
    }

    if (bellRef.current) {
      bellRef.current.rotation.z =
        dt >= 0 && dt < 0.9
          ? Math.sin(dt * 26.0) * 0.42 * Math.exp(-3.4 * dt)
          : Math.sin(t * 1.9) * 0.04;
    }

    if (steamGroupRef.current) {
      steamGroupRef.current.updateWorldMatrix(true, false);
      const groupWorldMatrix = steamGroupRef.current.matrixWorld;
      const children = steamGroupRef.current.children;
      for (let i = 0; i < children.length; i++) {
        const puff = children[i];
        const mat = puffMaterials[i];
        const phase = (t * 0.65 + i / STEAM_COUNT) % 1.0;
        const rise = phase * 0.42;
        puff.position.set(
          Math.sin(t * 2.2 + i * 1.3) * 0.12,
          1.5 + rise,
          Math.cos(t * 1.8 + i) * 0.08
        );
        const s = Math.sin(phase * Math.PI) * 0.105;
        puffWorldPos.copy(puff.position).applyMatrix4(groupWorldMatrix);
        const camDist = state.camera.position.distanceTo(puffWorldPos);
        const camFade = computeSteamCameraFade(camDist, 1.65, 3.2);
        const finalOpacity = 0.32 * Math.sin(phase * Math.PI) * camFade;

        if (camDist < 1.65 || s <= 0.008 || finalOpacity <= 0.004) {
          puff.visible = false;
          puff.scale.setScalar(0);
          if (mat) mat.opacity = 0;
        } else {
          puff.visible = true;
          puff.scale.setScalar(s);
          if (mat) mat.opacity = finalOpacity;
        }
      }
    }

    if (confettiGroupRef.current) {
      const active = dt >= 0 && dt < 1.1;
      const children = confettiGroupRef.current.children;
      if (active) {
        const fade = dt > 0.85 ? Math.max(0.05, (1.1 - dt) / 0.25) : 1;
        for (let i = 0; i < children.length; i++) {
          const piece = children[i];
          const spec = confettiSpecs[i];
          if (!piece || !spec) continue;
          piece.position.set(
            spec.vx * dt * 0.62,
            2.28 + spec.vy * dt - 4.9 * dt * dt,
            spec.vz * dt * 0.62
          );
          piece.rotation.set(dt * spec.rotSpeed, dt * spec.rotSpeed * 0.8, 0);
          piece.scale.setScalar(fade);
        }
      } else {
        for (let i = 0; i < children.length; i++) {
          const piece = children[i];
          if (piece && piece.scale.x !== 0) {
            piece.scale.setScalar(0);
          }
        }
      }
    }
  });

  const cartDeckY = 1.18;
  const [centerX, centerY, centerZ] = awningSpec.center;

  return (
    <group
      name="hotdog-cart-prop"
      position={position}
      rotation={[0, rotationY, 0]}
      userData={{ occludableProp: true }}
    >
      {/* Twin Coaxial Spoked Wheels Seated Flush at y = 0 */}
      <CoaxialWheelMeshGroup
        spec={wheelSpec}
        position={[-0.76, 0, 0]}
        rimMaterial={TOYBOX_MATERIALS.chromeSilver}
        hubMaterial={TOYBOX_MATERIALS.brassAccent}
      />
      <CoaxialWheelMeshGroup
        spec={wheelSpec}
        position={[0.76, 0, 0]}
        rimMaterial={TOYBOX_MATERIALS.chromeSilver}
        hubMaterial={TOYBOX_MATERIALS.brassAccent}
      />

      {/* Solid Cross Axle Connecting Twin Wheels */}
      <mesh
        castShadow
        position={[0, wheelSpec.wheelCenter[1], 0]}
        rotation={[0, 0, Math.PI * 0.5]}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry args={[0.026, 0.026, 1.54, 8]} />
      </mesh>

      {/* Four Corner Stabilizer Kickstands Flush at y = 0 */}
      {(
        [
          [-0.46, -0.72],
          [0.46, -0.72],
          [-0.46, 0.72],
          [0.46, 0.72],
        ] as Array<[number, number]>
      ).map(([kx, kz], idx) => (
        <group key={`kickstand-${idx}`} position={[kx, 0, kz]}>
          <mesh
            castShadow
            receiveShadow
            position={[0, 0.015, 0]}
            material={TOYBOX_MATERIALS.tireRubber}
          >
            <cylinderGeometry args={[0.055, 0.065, 0.03, 10]} />
          </mesh>
          <mesh
            position={[0, 0.24, 0]}
            material={TOYBOX_MATERIALS.darkIron}
          >
            <cylinderGeometry args={[0.024, 0.024, 0.44, 8]} />
          </mesh>
        </group>
      ))}

      {/* Lower Painted Cream & Coral Cart Carriage (y: 0.44 -> 1.18) */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.8, 0]}
        material={TOYBOX_MATERIALS.pastelCream}
      >
        <boxGeometry args={[1.32, 0.68, 1.66]} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.82, 0]}
        material={layered(TOYBOX_MATERIALS.awningCoral, 1)}
      >
        <boxGeometry args={[1.37, 0.2, 1.71]} />
      </mesh>
      <mesh
        position={[0, 1.115, 0]}
        material={layered(TOYBOX_MATERIALS.brassAccent, 2)}
      >
        <boxGeometry args={[1.38, 0.04, 1.72]} />
      </mesh>

      {/* Stainless Serving Counter Deck (top at y = 1.18) */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 1.16, 0]}
        material={TOYBOX_MATERIALS.chromeSilver}
      >
        <boxGeometry args={[1.42, 0.04, 1.8]} />
      </mesh>

      {/* Side Condiment Shelf (+X) with Ketchup, Mustard & Napkin Dispenser (tucked strictly <= +0.82m inside 1.92m bounds) */}
      <group position={[0.74, 1.14, 0]}>
        <mesh
          castShadow
          receiveShadow
          material={TOYBOX_MATERIALS.chromeSilver}
        >
          <boxGeometry args={[0.16, 0.03, 0.88]} />
        </mesh>
        <mesh
          castShadow
          position={[0.01, 0.1, -0.22]}
          material={TOYBOX_MATERIALS.hydrantCoral}
        >
          <cylinderGeometry args={[0.032, 0.038, 0.16, 10]} />
        </mesh>
        <mesh
          position={[0.01, 0.19, -0.22]}
          material={TOYBOX_MATERIALS.hydrantCoral}
        >
          <coneGeometry args={[0.0185, 0.04, 8]} />
        </mesh>
        <mesh
          castShadow
          position={[0.01, 0.1, -0.02]}
          material={TOYBOX_MATERIALS.taxiAmber}
        >
          <cylinderGeometry args={[0.032, 0.038, 0.16, 10]} />
        </mesh>
        <mesh
          position={[0.01, 0.19, -0.02]}
          material={TOYBOX_MATERIALS.taxiAmber}
        >
          <coneGeometry args={[0.0185, 0.04, 8]} />
        </mesh>
        <mesh
          castShadow
          position={[0.01, 0.095, 0.22]}
          material={TOYBOX_MATERIALS.chromeSilver}
        >
          <boxGeometry args={[0.08, 0.14, 0.14]} />
        </mesh>
      </group>

      {/* Rear Push Bar (-Z) */}
      <group position={[0, 1.04, -0.95]}>
        <mesh
          position={[-0.48, 0, 0.06]}
          rotation={[Math.PI * 0.5, 0, 0]}
          material={TOYBOX_MATERIALS.darkIron}
        >
          <cylinderGeometry args={[0.02, 0.02, 0.14, 8]} />
        </mesh>
        <mesh
          position={[0.48, 0, 0.06]}
          rotation={[Math.PI * 0.5, 0, 0]}
          material={TOYBOX_MATERIALS.darkIron}
        >
          <cylinderGeometry args={[0.02, 0.02, 0.14, 8]} />
        </mesh>
        <mesh
          rotation={[0, 0, Math.PI * 0.5]}
          material={TOYBOX_MATERIALS.chromeSilver}
        >
          <cylinderGeometry args={[0.024, 0.024, 1.04, 10]} />
        </mesh>
      </group>

      {/* Glowing Condiment & Hotdog Warmer Bay on Counter */}
      <group position={[0, cartDeckY, -0.04]}>
        <mesh
          castShadow
          receiveShadow
          position={[0, 0.03, 0]}
          material={TOYBOX_MATERIALS.chromeSilver}
        >
          <boxGeometry args={[0.88, 0.06, 0.72]} />
        </mesh>
        <mesh
          position={[0, 0.09, 0]}
          material={TOYBOX_MATERIALS.bulbWarmGlow}
        >
          <boxGeometry args={[0.74, 0.05, 0.58]} />
        </mesh>
        <mesh
          position={[0, 0.19, 0]}
          material={TOYBOX_MATERIALS.windowSkyGlass}
        >
          <boxGeometry args={[0.82, 0.22, 0.66]} />
        </mesh>
        <mesh
          castShadow
          position={[0, 0.31, 0]}
          material={TOYBOX_MATERIALS.chromeSilver}
        >
          <boxGeometry args={[0.86, 0.03, 0.7]} />
        </mesh>
        {[-0.2, 0, 0.2].map((hx, idx) => (
          <group key={`hotdog-${idx}`} position={[hx, 0.14, 0]}>
            <mesh
              castShadow
              rotation={[Math.PI * 0.5, 0, 0]}
              material={TOYBOX_MATERIALS.hotdogBun}
            >
              <capsuleGeometry args={[0.042, 0.18, 4, 8]} />
            </mesh>
            <mesh
              castShadow
              position={[0, 0.022, 0]}
              rotation={[Math.PI * 0.5, 0, 0]}
              material={TOYBOX_MATERIALS.hotdogSausage}
            >
              <capsuleGeometry args={[0.025, 0.22, 4, 8]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Brass Vendor Bell on Front Left Counter */}
      <group ref={bellRef} position={[-0.48, cartDeckY + 0.08, 0.74]}>
        <mesh
          position={[0, -0.05, 0]}
          material={TOYBOX_MATERIALS.darkIron}
        >
          <cylinderGeometry args={[0.02, 0.028, 0.06, 8]} />
        </mesh>
        <mesh castShadow material={TOYBOX_MATERIALS.brassAccent}>
          <coneGeometry args={[0.068, 0.1, 10]} />
        </mesh>
      </group>

      {/* 4 Corner Awning Support Stanchions Trimmed Strictly to Underside Plane of 28-Deg Awning */}
      {cornerStanchions.posts.map((post, idx) => (
        <group key={`corner-stanchion-${idx}`}>
          <mesh
            position={[post.x, post.midY, post.z]}
            material={TOYBOX_MATERIALS.chromeSilver}
          >
            <cylinderGeometry args={[0.022, 0.024, post.height, 8]} />
          </mesh>
          <mesh
            position={[post.x, cartDeckY + 0.015, post.z]}
            material={TOYBOX_MATERIALS.brassAccent}
          >
            <cylinderGeometry args={[0.036, 0.042, 0.03, 8]} />
          </mesh>
          <mesh
            position={[post.x, post.topY - 0.015, post.z]}
            material={TOYBOX_MATERIALS.brassAccent}
          >
            <cylinderGeometry args={[0.032, 0.032, 0.03, 8]} />
          </mesh>
        </group>
      ))}

      {/* Underside Front & High-Rear Transverse Purlins + Pitched Side Rafters */}
      {[cornerStanchions.frontPurlin, cornerStanchions.rearPurlin].map(
        (purlin, idx) => (
          <mesh
            key={`purlin-${idx}`}
            position={[0, purlin.y - 0.015, purlin.z]}
            rotation={[0, 0, Math.PI * 0.5]}
            material={TOYBOX_MATERIALS.chromeSilver}
          >
            <cylinderGeometry args={[0.018, 0.018, 1.88, 8]} />
          </mesh>
        )
      )}
      {[-0.64, 0.64].map((rx, idx) => (
        <mesh
          key={`rafter-${idx}`}
          position={[rx, cornerStanchions.rafter.y, cornerStanchions.rafter.z]}
          rotation={[Math.PI * 0.5 + cornerStanchions.rafter.pitchRad, 0, 0]}
          material={TOYBOX_MATERIALS.chromeSilver}
        >
          <cylinderGeometry
            args={[0.018, 0.018, cornerStanchions.rafter.length, 8]}
          />
        </mesh>
      ))}

      {/* 28-Degree Pitched Red-and-White Striped Awning (Restitution: 0.28) */}
      <group position={[centerX, centerY, centerZ]}>
        <group ref={awningBounceRef}>
          <group position={[-centerX, -centerY, -centerZ]}>
            {awningSpec.stripePanels.map((panel) => (
              <mesh
                key={`stripe-${panel.index}`}
                castShadow
                receiveShadow
                position={panel.position}
                rotation={panel.rotation}
                material={
                  panel.isAlternateStripe
                    ? TOYBOX_MATERIALS.awningCream
                    : TOYBOX_MATERIALS.awningCoral
                }
              >
                {/* Spec pads each stripe by +4mm which overlaps neighbours coplanarly (z-fight).
                    Cream stripes shrink 4mm and coral stripes keep the pad so edges abut exactly. */}
                <boxGeometry
                  args={[
                    panel.isAlternateStripe ? panel.size[0] - 0.008 : panel.size[0],
                    panel.size[1],
                    panel.size[2],
                  ]}
                />
              </mesh>
            ))}

            {/* Front Valance Drop Apron */}
            <mesh
              receiveShadow
              position={awningSpec.frontValance.position}
              rotation={awningSpec.frontValance.rotation}
              material={TOYBOX_MATERIALS.awningCoral}
            >
              <boxGeometry args={awningSpec.frontValance.size} />
            </mesh>
          </group>
        </group>
      </group>

      {/* Animated Soft Fresnel Warmer Steam Puffs */}
      <group ref={steamGroupRef}>
        {Array.from({ length: STEAM_COUNT }, (_, idx) => (
          <mesh
            key={`steam-${idx}`}
            position={[0, 1.55, 0]}
            material={puffMaterials[idx]}
          >
            <icosahedronGeometry args={[1, 2]} />
          </mesh>
        ))}
      </group>

      {/* Joyful Confetti Burst on Awning Bounce (mounted visible={true}, scale={0} until hit) */}
      <group ref={confettiGroupRef} visible={true}>
        {confettiSpecs.map((_, idx) => (
          <mesh
            key={`confetti-${idx}`}
            visible={true}
            scale={0}
            castShadow={false}
            frustumCulled={false}
            material={
              CONFETTI_TOYBOX_MATERIALS[idx % CONFETTI_TOYBOX_MATERIALS.length]
            }
          >
            <boxGeometry args={[0.075, 0.035, 0.11]} />
          </mesh>
        ))}
      </group>

      {showWireframe && (
        <group>
          <mesh
            position={awningSpec.center}
            rotation={awningSpec.canvasRotation}
            material={TOYBOX_MATERIALS.qaColliderWireframe}
          >
            <boxGeometry
              args={[awningSpec.width, 0.06, awningSpec.slopedDepth]}
            />
          </mesh>
          <mesh
            position={[0, 1.29, 0]}
            material={TOYBOX_MATERIALS.qaBoundsWireframe}
          >
            <boxGeometry args={[1.92, 2.58, 2.04]} />
          </mesh>
        </group>
      )}
    </group>
  );
}
