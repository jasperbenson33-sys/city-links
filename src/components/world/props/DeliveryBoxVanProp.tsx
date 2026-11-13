'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildCoaxialWheelSpec } from '@/lib/geometryHelpers';
import { TOYBOX_MATERIALS } from '@/materials';
import { CoaxialWheelMeshGroup } from './HotdogCartProp';
import { PROP_ACCENT_MATERIALS } from './propMaterials';

export interface DeliveryBoxVanPropProps {
  position?: [number, number, number];
  rotationY?: number;
  lastRoofHitAt?: number;
  propId?: string;
  showWireframe?: boolean;
}

/**
 * Parallel-Parked Artisan Bakery Delivery Box Van oriented with:
 * +Z = Forward cab, +X = Right, +Y = Up.
 * - 4 coaxial wheels via buildCoaxialWheelSpec(axleAxis: 'x') with lug rings flush at y = 0.
 * - Authentic box-van rear door portal header lintel + swung-open split rear cargo doors
 *   with brass hinges, cam latches, corner step bumperettes & vertical tail-light clusters.
 * - Lowered rear metal loading ramp (z: -3.50 -> -0.90, 22.56 deg) feeding straight under
 *   the open door portal onto the interior roof-access kicker ramp (z: -0.90 -> +0.90, 32.80 deg)
 *   and cargo-only emerald bounce roof launch deck (z: +0.90 -> +2.02, topY = 2.24m).
 * - Wrapped with userData={{ occludableVehicle: true, propId }} for smooth CameraRig fade.
 */
export function DeliveryBoxVanProp({
  position = [0, 0, 0],
  rotationY = 0,
  lastRoofHitAt = -10,
  propId = 'delivery-van-east',
  showWireframe = false,
}: DeliveryBoxVanPropProps) {
  const roofDeckRef = useRef<THREE.Mesh>(null);

  const wheelSpec = useMemo(
    () =>
      buildCoaxialWheelSpec({
        outerRadius: 0.36,
        tireTubeRadius: 0.085,
        axleAxis: 'x',
        spokeCount: 6,
        rimWidth: 0.14,
        hubRadius: 0.095,
        hubWidth: 0.17,
        axleRadius: 0.028,
        axleLength: 0.24,
      }),
    []
  );

  // Wedge 1: Lowered Rear Loading Ramp (local z: -3.50 -> -0.90, y: 0.00 -> 1.08, 22.56 deg)
  // Wedge 2: Interior Roof-Access Kicker Chute (local z: -0.90 -> +0.90, y: 1.08 -> 2.24, 32.80 deg)
  const { rampGeometry, kickerGeometry, deflectorGeo } = useMemo(() => {
    const chuteWidth = 1.68;

    const rearShape = new THREE.Shape();
    rearShape.moveTo(-3.5, 0.0);
    rearShape.lineTo(-3.44, 0.025);
    rearShape.lineTo(-0.9, 1.08);
    rearShape.lineTo(-0.9, 0.99);
    rearShape.lineTo(-3.28, 0.0);
    rearShape.closePath();

    const rGeo = new THREE.ExtrudeGeometry(rearShape, {
      depth: chuteWidth,
      bevelEnabled: false,
      steps: 1,
    });
    rGeo.rotateY(-Math.PI * 0.5);
    rGeo.translate(chuteWidth * 0.5, 0, 0);
    rGeo.computeVertexNormals();

    const kickerShape = new THREE.Shape();
    kickerShape.moveTo(-0.9, 1.08);
    kickerShape.lineTo(0.9, 2.24);
    kickerShape.lineTo(0.9, 2.08);
    kickerShape.lineTo(-0.9, 0.98);
    kickerShape.closePath();

    const kGeo = new THREE.ExtrudeGeometry(kickerShape, {
      depth: chuteWidth,
      bevelEnabled: false,
      steps: 1,
    });
    kGeo.rotateY(-Math.PI * 0.5);
    kGeo.translate(chuteWidth * 0.5, 0, 0);
    kGeo.computeVertexNormals();

    // Aerodynamic cab-roof wind deflector fairing transitioning smoothly from cab top (y=1.82, z=2.56)
    // up to cargo box bulkhead top (y=2.24, z=2.02) — zero stilt canopy over cab!
    const fairShape = new THREE.Shape();
    fairShape.moveTo(2.02, 1.82);
    fairShape.lineTo(2.62, 1.82);
    fairShape.quadraticCurveTo(2.26, 2.18, 2.02, 2.22);
    fairShape.closePath();

    const fairWidth = 1.66;
    const fGeo = new THREE.ExtrudeGeometry(fairShape, {
      depth: fairWidth,
      bevelEnabled: false,
      steps: 1,
    });
    fGeo.rotateY(-Math.PI * 0.5);
    fGeo.translate(fairWidth * 0.5, 0, 0);
    fGeo.computeVertexNormals();

    return { rampGeometry: rGeo, kickerGeometry: kGeo, deflectorGeo: fGeo };
  }, []);

  const rampAngleRad = Math.atan2(1.08, 2.6);
  const kickerAngleRad = Math.atan2(1.16, 1.8);

  const rampRibs = useMemo(() => {
    const count = 9;
    return Array.from({ length: count }, (_, idx) => {
      const t = (idx + 0.5) / count;
      const rz = -3.44 + t * (-0.9 - -3.44);
      const ry = 0.025 + t * (1.08 - 0.025);
      return [0, ry + 0.008, rz] as [number, number, number];
    });
  }, []);

  const kickerRibs = useMemo(() => {
    const count = 6;
    return Array.from({ length: count }, (_, idx) => {
      const t = (idx + 0.5) / count;
      const rz = -0.9 + t * 1.8;
      const ry = 1.08 + t * 1.16;
      return [0, ry + 0.008, rz] as [number, number, number];
    });
  }, []);

  useFrame(() => {
    if (!roofDeckRef.current) return;
    const dt =
      (typeof performance !== 'undefined' ? performance.now() * 0.001 : 0) -
      lastRoofHitAt;
    if (dt >= 0 && dt < 0.55) {
      const pop = 1 + Math.sin(dt * 30.0) * 0.14 * Math.exp(-5.5 * dt);
      roofDeckRef.current.scale.set(1, pop, 1);
    } else {
      roofDeckRef.current.scale.set(1, 1, 1);
    }
  });

  const wheelMounts: Array<[number, number, number]> = [
    [-0.85, 0, -0.22],
    [0.85, 0, -0.22],
    [-0.85, 0, 2.68],
    [0.85, 0, 2.68],
  ];

  return (
    <group
      name="delivery-box-van-prop"
      position={position}
      rotation={[0, rotationY, 0]}
      userData={{ occludableVehicle: true, propId }}
    >
      {/* 4 Coaxial Wheels with Lug Rings Seated Flush at y = 0 */}
      {wheelMounts.map((mount, idx) => (
        <CoaxialWheelMeshGroup
          key={`van-wheel-${idx}`}
          spec={wheelSpec}
          position={mount}
          rimMaterial={TOYBOX_MATERIALS.hubcapCream}
          hubMaterial={TOYBOX_MATERIALS.chromeSilver}
          showLugRing
        />
      ))}

      {/* Lowered Rear Metal Loading Ramp (z: -3.50 -> -0.90, y: 0.00 -> 1.08, 22.56 deg) */}
      <mesh
        castShadow
        receiveShadow
        geometry={rampGeometry}
        material={PROP_ACCENT_MATERIALS.metalRampSteel}
      />
      {rampRibs.map((ribPos, idx) => (
        <mesh
          key={`ramp-rib-${idx}`}
          receiveShadow
          position={ribPos}
          rotation={[-rampAngleRad, 0, 0]}
          material={TOYBOX_MATERIALS.darkIron}
        >
          <boxGeometry args={[1.56, 0.012, 0.036]} />
        </mesh>
      ))}
      {[-0.81, 0.81].map((rx, idx) => (
        <mesh
          key={`ramp-rail-${idx}`}
          castShadow
          position={[rx, 0.565, -2.2]}
          rotation={[-rampAngleRad, 0, 0]}
          material={TOYBOX_MATERIALS.scaffoldingSafetyAmber}
        >
          <boxGeometry args={[0.045, 0.045, 2.74]} />
        </mesh>
      ))}

      {/* Interior Roof-Access Kicker Chute (z: -0.90 -> +0.90, y: 1.08 -> 2.24, 32.80 deg) */}
      <mesh
        castShadow
        receiveShadow
        geometry={kickerGeometry}
        material={PROP_ACCENT_MATERIALS.metalRampSteel}
      />
      {kickerRibs.map((ribPos, idx) => (
        <mesh
          key={`kicker-rib-${idx}`}
          receiveShadow
          position={ribPos}
          rotation={[-kickerAngleRad, 0, 0]}
          material={TOYBOX_MATERIALS.darkIron}
        >
          <boxGeometry args={[1.56, 0.012, 0.034]} />
        </mesh>
      ))}
      {[-0.81, 0.81].map((rx, idx) => (
        <mesh
          key={`kicker-rail-${idx}`}
          castShadow
          position={[rx, 1.685, 0]}
          rotation={[-kickerAngleRad, 0, 0]}
          material={TOYBOX_MATERIALS.scaffoldingSafetyAmber}
        >
          <boxGeometry args={[0.04, 0.04, 2.08]} />
        </mesh>
      ))}

      {/* Narrow Inner Chassis Frame Inboard of Wheels */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.54, 1.2]}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <boxGeometry args={[1.22, 0.34, 4.18]} />
      </mesh>
      {/* Center Rocker Step Skirt */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.54, 1.23]}
        material={TOYBOX_MATERIALS.vanNavyCab}
      >
        <boxGeometry args={[1.88, 0.32, 1.96]} />
      </mesh>

      {/* Recessed Lower Cargo Underfloor */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.88, 0.65]}
        material={TOYBOX_MATERIALS.scaffoldingDeckWood}
      >
        <boxGeometry args={[1.76, 0.16, 2.7]} />
      </mesh>

      {/* Side Cargo Walls (x: [-1.00..-0.86] & [+0.86..+1.00], z: -0.90 -> +2.02) */}
      {[-0.93, 0.93].map((wx, idx) => (
        <group key={`cargo-wall-${idx}`} position={[wx, 1.48, 0.56]}>
          <mesh
            castShadow
            receiveShadow
            material={TOYBOX_MATERIALS.vanCreamBody}
          >
            <boxGeometry args={[0.14, 1.48, 2.92]} />
          </mesh>
          <mesh
            position={[wx > 0 ? 0.008 : -0.008, -0.22, 0]}
            material={TOYBOX_MATERIALS.vanMintStripe}
          >
            <boxGeometry args={[0.135, 0.22, 2.93]} />
          </mesh>
          <mesh
            position={[wx > 0 ? 0.075 : -0.075, 0.16, 0.15]}
            material={TOYBOX_MATERIALS.terracottaTerrace}
          >
            <boxGeometry args={[0.02, 0.38, 1.1]} />
          </mesh>
          <mesh
            position={[wx > 0 ? 0.088 : -0.088, 0.16, 0.15]}
            material={TOYBOX_MATERIALS.pastelCream}
          >
            <boxGeometry args={[0.015, 0.24, 0.86]} />
          </mesh>
        </group>
      ))}

      {/* Front Cargo Bulkhead Wall (z = +1.97) */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 1.48, 1.97]}
        material={TOYBOX_MATERIALS.vanCreamBody}
      >
        <boxGeometry args={[1.94, 1.48, 0.1]} />
      </mesh>

      {/* Rear Cargo Door Portal Header Lintel + Clearance Lights (z = -0.88, y: 2.02..2.24)
          Leaves clear 0.94m vertical opening (y: 1.08..2.02) above ramp entrance! */}
      <group position={[0, 2.13, -0.88]}>
        <mesh
          castShadow
          receiveShadow
          material={TOYBOX_MATERIALS.vanCreamBody}
        >
          <boxGeometry args={[1.98, 0.22, 0.16]} />
        </mesh>
        <mesh position={[0, 0.055, -0.005]} material={TOYBOX_MATERIALS.vanMintStripe}>
          <boxGeometry args={[1.99, 0.09, 0.165]} />
        </mesh>
        {/* 3 Amber Commercial Truck Clearance Marker Lights */}
        {[-0.22, 0, 0.22].map((lx, idx) => (
          <mesh
            key={`clearance-lamp-${idx}`}
            position={[lx, 0.055, -0.09]}
            material={TOYBOX_MATERIALS.taxiAmber}
          >
            <boxGeometry args={[0.075, 0.04, 0.02]} />
          </mesh>
        ))}
      </group>

      {/* Swung-Open Split Rear Cargo Doors Folded Cleanly Back Along Side Flanks */}
      {([-1, 1] as const).map((side) => (
        <group
          key={`rear-door-${side}`}
          position={[side * 1.0, 1.42, -0.88]}
          rotation={[0, side * 0.14, 0]}
        >
          {/* Open Door Leaf Panel Tucked Forward Along Side Flank */}
          <mesh
            castShadow
            receiveShadow
            position={[side * 0.035, 0, 0.44]}
            material={TOYBOX_MATERIALS.vanCreamBody}
          >
            <boxGeometry args={[0.06, 1.24, 0.86]} />
          </mesh>
          {/* Mint Continuation Stripe on Open Door */}
          <mesh
            position={[side * 0.04, -0.18, 0.44]}
            material={TOYBOX_MATERIALS.vanMintStripe}
          >
            <boxGeometry args={[0.064, 0.2, 0.87]} />
          </mesh>
          {/* Vertical Chrome Cam-Lock Bar */}
          <mesh
            castShadow
            position={[side * 0.072, 0, 0.72]}
            material={TOYBOX_MATERIALS.chromeSilver}
          >
            <cylinderGeometry args={[0.014, 0.014, 1.12, 6]} />
          </mesh>
          {/* 3 Brass Door Hinges Connecting Door to Rear Corner Pilaster */}
          {[-0.44, 0, 0.44].map((hy, hIdx) => (
            <mesh
              key={`hinge-${side}-${hIdx}`}
              position={[0, hy, 0.02]}
              material={TOYBOX_MATERIALS.brassAccent}
            >
              <boxGeometry args={[0.08, 0.055, 0.1]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Steel Rear Step Bumperettes & 3-Lens Vertical Tail-Light Housings */}
      {([-1, 1] as const).map((side) => (
        <group key={`rear-trim-${side}`}>
          {/* Corner Step Bumperette Clear of Central 1.68m Ramp */}
          <mesh
            castShadow
            receiveShadow
            position={[side * 0.91, 0.62, -0.94]}
            material={TOYBOX_MATERIALS.chromeSilver}
          >
            <boxGeometry args={[0.22, 0.14, 0.14]} />
          </mesh>
          {/* Tail-Light Housing Frame */}
          <mesh
            position={[side * 0.93, 0.9, -0.9]}
            material={TOYBOX_MATERIALS.darkIron}
          >
            <boxGeometry args={[0.11, 0.34, 0.04]} />
          </mesh>
          {/* Red Brake Lens */}
          <mesh
            position={[side * 0.93, 0.99, -0.915]}
            material={TOYBOX_MATERIALS.hydrantCoral}
          >
            <boxGeometry args={[0.08, 0.11, 0.03]} />
          </mesh>
          {/* Amber Turn Signal Lens */}
          <mesh
            position={[side * 0.93, 0.89, -0.915]}
            material={TOYBOX_MATERIALS.taxiAmber}
          >
            <boxGeometry args={[0.08, 0.075, 0.03]} />
          </mesh>
          {/* White Reverse Lens */}
          <mesh
            position={[side * 0.93, 0.79, -0.915]}
            material={PROP_ACCENT_MATERIALS.safetyConeWhite}
          >
            <boxGeometry args={[0.08, 0.075, 0.03]} />
          </mesh>
        </group>
      ))}

      {/* Folded-Back Split Skylight Roof Flaps Flanking Kicker Channel */}
      {[-0.93, 0.93].map((rx, idx) => (
        <mesh
          key={`skylight-flap-${idx}`}
          castShadow
          position={[rx, 2.26, 0.0]}
          material={TOYBOX_MATERIALS.vanMintStripe}
        >
          <boxGeometry args={[0.16, 0.06, 1.76]} />
        </mesh>
      ))}

      {/* Cargo-Only Emerald Roof Bounce Deck (z: +0.90 -> +2.02, ends cleanly at cab bulkhead!) */}
      <group position={[0, 0, 1.46]}>
        <mesh
          castShadow
          receiveShadow
          position={[0, 2.16, 0]}
          material={TOYBOX_MATERIALS.vanCreamBody}
        >
          <boxGeometry args={[1.98, 0.08, 1.12]} />
        </mesh>
        <mesh
          ref={roofDeckRef}
          castShadow
          receiveShadow
          position={[0, 2.21, 0]}
          material={TOYBOX_MATERIALS.vanRoofBounceDeck}
        >
          <boxGeometry args={[1.76, 0.06, 1.06]} />
        </mesh>
        {/* Sleek Chrome Roof-Rack Side Guardrails Along Cargo Roof Edges */}
        {[-0.9, 0.9].map((rx, idx) => (
          <group key={`roof-rail-${idx}`} position={[rx, 2.26, 0]}>
            <mesh
              castShadow
              rotation={[Math.PI * 0.5, 0, 0]}
              material={TOYBOX_MATERIALS.chromeSilver}
            >
              <cylinderGeometry args={[0.018, 0.018, 1.02, 8]} />
            </mesh>
            {[-0.44, 0.44].map((pz, pIdx) => (
              <mesh
                key={`rail-post-${pIdx}`}
                position={[0, -0.025, pz]}
                material={TOYBOX_MATERIALS.darkIron}
              >
                <cylinderGeometry args={[0.016, 0.016, 0.05, 6]} />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      {/* Aerodynamic Cream Wind Deflector Fairing Over Cab Roof */}
      <mesh
        castShadow
        receiveShadow
        geometry={deflectorGeo}
        material={TOYBOX_MATERIALS.vanCreamBody}
      />

      {/* Forward Cab Section (lz: +2.02 -> +3.48, Open Sky Above Cab Roof!) */}
      <group position={[0, 0, 2.72]}>
        <mesh
          castShadow
          receiveShadow
          position={[0, 0.86, 0.12]}
          material={TOYBOX_MATERIALS.vanNavyCab}
        >
          <boxGeometry args={[1.88, 0.68, 1.22]} />
        </mesh>
        <mesh
          castShadow
          receiveShadow
          position={[0, 1.48, -0.08]}
          material={TOYBOX_MATERIALS.vanCreamBody}
        >
          <boxGeometry args={[1.84, 0.68, 0.88]} />
        </mesh>
        <mesh
          position={[0, 1.48, 0.34]}
          rotation={[-0.22, 0, 0]}
          material={TOYBOX_MATERIALS.windowSkyGlass}
        >
          <boxGeometry args={[1.64, 0.52, 0.08]} />
        </mesh>
        {[-0.93, 0.93].map((mx, idx) => (
          <mesh
            key={`cab-win-${idx}`}
            position={[mx, 1.5, -0.06]}
            material={TOYBOX_MATERIALS.windowSkyGlass}
          >
            <boxGeometry args={[0.03, 0.42, 0.62]} />
          </mesh>
        ))}
        {[-0.97, 0.97].map((mx, idx) => (
          <mesh
            key={`mirror-${idx}`}
            castShadow
            position={[mx, 1.38, 0.24]}
            material={TOYBOX_MATERIALS.darkIron}
          >
            <boxGeometry args={[0.06, 0.2, 0.1]} />
          </mesh>
        ))}
        <mesh
          position={[0, 0.86, 0.74]}
          material={TOYBOX_MATERIALS.chromeSilver}
        >
          <boxGeometry args={[0.96, 0.32, 0.04]} />
        </mesh>
        {[-0.64, 0.64].map((hx, idx) => (
          <group key={`headlight-${idx}`}>
            <mesh
              position={[hx, 0.88, 0.74]}
              rotation={[Math.PI * 0.5, 0, 0]}
              material={TOYBOX_MATERIALS.bulbWarmGlow}
            >
              <cylinderGeometry args={[0.11, 0.11, 0.04, 12]} />
            </mesh>
            <mesh
              position={[hx * 1.18, 0.74, 0.73]}
              material={TOYBOX_MATERIALS.taxiAmber}
            >
              <boxGeometry args={[0.14, 0.07, 0.04]} />
            </mesh>
          </group>
        ))}
        <mesh
          castShadow
          position={[0, 0.5, 0.74]}
          material={TOYBOX_MATERIALS.chromeSilver}
        >
          <boxGeometry args={[1.92, 0.12, 0.14]} />
        </mesh>
      </group>

      {showWireframe && (
        <group>
          <mesh
            position={[0, 1.13, 0]}
            material={TOYBOX_MATERIALS.qaColliderWireframe}
          >
            <boxGeometry args={[2.04, 2.26, 7.0]} />
          </mesh>
          <mesh
            position={[0, 0.54, -2.2]}
            rotation={[-rampAngleRad, 0, 0]}
            material={TOYBOX_MATERIALS.qaSensorWireframe}
          >
            <boxGeometry args={[1.68, 0.04, 2.82]} />
          </mesh>
          <mesh
            position={[0, 1.66, 0]}
            rotation={[-kickerAngleRad, 0, 0]}
            material={TOYBOX_MATERIALS.qaSensorWireframe}
          >
            <boxGeometry args={[1.68, 0.04, 2.14]} />
          </mesh>
        </group>
      )}
    </group>
  );
}
