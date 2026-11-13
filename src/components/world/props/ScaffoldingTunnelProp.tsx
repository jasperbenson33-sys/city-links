'use client';

import React, { useMemo } from 'react';
import { TOYBOX_MATERIALS } from '@/materials';
import { PROP_ACCENT_MATERIALS } from './propMaterials';

export interface ScaffoldingTunnelPropProps {
  position?: [number, number, number];
  rotationY?: number;
  width?: number;
  depth?: number;
  clearHeight?: number;
  wallGapMeters?: number;
  showWireframe?: boolean;
}

/**
 * Sidewalk Scaffolding Shed with baseplates seated flush at y = 0,
 * 0.00m flush against the west brownstone facade (local -X edge at -width/2),
 * galvanized steel stanchions & X-bracing, timber plank overhead bridge deck with
 * exact 2.35m walkthrough clearance underneath, safety-yellow toe-boards,
 * and masonry repair details (terracotta bricks, mortar bucket, warning beacon) on top.
 */
export function ScaffoldingTunnelProp({
  position = [0, 0, 0],
  rotationY = 0,
  width = 2.6,
  depth = 9.0,
  clearHeight = 2.35,
  showWireframe = false,
}: ScaffoldingTunnelPropProps) {
  const halfW = width * 0.5;
  // Wall-side (-X) stanchions sit just inside -halfW so 0.24m baseplates stay <= -halfW
  const innerPostX = -halfW + 0.14;
  const outerPostX = halfW - 0.14;
  const baySpanZ = depth - 0.28;
  const bayCount = Math.max(2, Math.round(depth / 2.25));
  const deckTopY = clearHeight + 0.08;
  const topRailY = Math.min(2.85, clearHeight + 0.48);

  const zLines = useMemo(() => {
    return Array.from({ length: bayCount + 1 }, (_, i) => {
      const u = i / bayCount - 0.5;
      return u * baySpanZ;
    });
  }, [bayCount, baySpanZ]);

  const bayCenters = useMemo(() => {
    return Array.from({ length: bayCount }, (_, i) => {
      return (zLines[i] + zLines[i + 1]) * 0.5;
    });
  }, [bayCount, zLines]);

  const bayDz = baySpanZ / bayCount;
  const braceH = clearHeight - 0.55;
  const braceDiagLen = Math.hypot(bayDz, braceH);
  const braceAngle = Math.atan2(braceH, bayDz);

  const plankOffsetsX = useMemo(() => {
    const count = 8;
    const span = width - 0.26;
    return Array.from({ length: count }, (_, i) => {
      const u = i / (count - 1) - 0.5;
      return u * span;
    });
  }, [width]);

  return (
    <group
      name="scaffolding-tunnel-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* Steel Baseplates & Vertical Stanchions Flush at y = 0 */}
      {zLines.map((pz, zIdx) =>
        [innerPostX, outerPostX].map((px, xIdx) => (
          <group key={`post-${zIdx}-${xIdx}`} position={[px, 0, pz]}>
            {/* Flush Steel Baseplate (bottom exact y = 0) */}
            <mesh
              castShadow
              receiveShadow
              position={[0, 0.015, 0]}
              material={TOYBOX_MATERIALS.darkIron}
            >
              <boxGeometry args={[0.24, 0.03, 0.24]} />
            </mesh>
            {/* Vertical Galvanized Steel Standard */}
            <mesh
              castShadow
              position={[0, 0.03 + (topRailY - 0.03) * 0.5, 0]}
              material={TOYBOX_MATERIALS.scaffoldingSteel}
            >
              <cylinderGeometry args={[0.045, 0.048, topRailY - 0.03, 8]} />
            </mesh>
            {/* High-Visibility Pedestrian Safety Collar Sleeve on Curb-Side Posts */}
            {xIdx === 1 && (
              <mesh
                position={[0, 0.95, 0]}
                material={TOYBOX_MATERIALS.scaffoldingSafetyAmber}
              >
                <cylinderGeometry args={[0.058, 0.058, 0.45, 8]} />
              </mesh>
            )}
            {/* Wall Tie Rubber Pads Kissing West Brownstone Facade at Exact x = -halfW */}
            {xIdx === 0 && (
              <mesh
                position={[-(0.14 - 0.025), clearHeight * 0.65, 0]}
                material={TOYBOX_MATERIALS.darkIron}
              >
                <boxGeometry args={[0.05, 0.14, 0.14]} />
              </mesh>
            )}
          </group>
        ))
      )}

      {/* Longitudinal Upper Ledgers & Guardrails */}
      {[innerPostX, outerPostX].map((px, xIdx) => (
        <group key={`longitudinal-${xIdx}`} position={[px, 0, 0]}>
          {/* Soffit-Level Ledger Beam (underside at exact y = clearHeight) */}
          <mesh
            castShadow
            position={[0, clearHeight + 0.035, 0]}
            rotation={[Math.PI * 0.5, 0, 0]}
            material={TOYBOX_MATERIALS.scaffoldingSteel}
          >
            <cylinderGeometry args={[0.036, 0.036, baySpanZ, 8]} />
          </mesh>
          {/* Mid Guardrail */}
          <mesh
            castShadow
            position={[0, deckTopY + 0.2, 0]}
            rotation={[Math.PI * 0.5, 0, 0]}
            material={TOYBOX_MATERIALS.scaffoldingSteel}
          >
            <cylinderGeometry args={[0.026, 0.026, baySpanZ, 8]} />
          </mesh>
          {/* Top Guardrail */}
          <mesh
            castShadow
            position={[0, topRailY, 0]}
            rotation={[Math.PI * 0.5, 0, 0]}
            material={TOYBOX_MATERIALS.scaffoldingSteel}
          >
            <cylinderGeometry args={[0.03, 0.03, baySpanZ, 8]} />
          </mesh>
        </group>
      ))}

      {/* Street-Side (+X) Cross-Braces Keeping Underpass Completely Open along Z */}
      {bayCenters.map((bz, idx) => (
        <group
          key={`xbrace-${idx}`}
          position={[outerPostX, 0.55 + braceH * 0.5, bz]}
        >
          <mesh
            castShadow
            rotation={[Math.PI * 0.5 - braceAngle, 0, 0]}
            material={TOYBOX_MATERIALS.scaffoldingSteel}
          >
            <cylinderGeometry args={[0.022, 0.022, braceDiagLen, 6]} />
          </mesh>
          <mesh
            castShadow
            rotation={[-(Math.PI * 0.5 - braceAngle), 0, 0]}
            material={TOYBOX_MATERIALS.scaffoldingSteel}
          >
            <cylinderGeometry args={[0.022, 0.022, braceDiagLen, 6]} />
          </mesh>
        </group>
      ))}

      {/* Transverse Overhead Transom Beams & Walkable Timber Plank Bridge Deck (Clearance >= 2.35m) */}
      {zLines.map((pz, idx) => (
        <mesh
          key={`transom-${idx}`}
          castShadow
          position={[0, clearHeight + 0.028, pz]}
          rotation={[0, 0, Math.PI * 0.5]}
          material={TOYBOX_MATERIALS.scaffoldingSteel}
        >
          <cylinderGeometry args={[0.032, 0.032, width - 0.18, 8]} />
        </mesh>
      ))}

      {plankOffsetsX.map((px, idx) => (
        <mesh
          key={`plank-${idx}`}
          castShadow
          receiveShadow
          position={[px, clearHeight + 0.055, 0]}
          material={TOYBOX_MATERIALS.scaffoldingDeckWood}
        >
          <boxGeometry args={[(width - 0.22) / plankOffsetsX.length, 0.05, depth - 0.04]} />
        </mesh>
      ))}

      {/* Safety-Yellow Toe-Boards Framing Upper Platform */}
      {[innerPostX + 0.03, outerPostX - 0.03].map((tx, idx) => (
        <mesh
          key={`toe-side-${idx}`}
          castShadow
          position={[tx, deckTopY + 0.075, 0]}
          material={TOYBOX_MATERIALS.scaffoldingSafetyAmber}
        >
          <boxGeometry args={[0.04, 0.15, depth - 0.1]} />
        </mesh>
      ))}
      {[-depth * 0.5 + 0.08, depth * 0.5 - 0.08].map((tz, idx) => (
        <mesh
          key={`toe-end-${idx}`}
          castShadow
          position={[0, deckTopY + 0.075, tz]}
          material={TOYBOX_MATERIALS.scaffoldingSafetyAmber}
        >
          <boxGeometry args={[width - 0.24, 0.15, 0.04]} />
        </mesh>
      ))}

      {/* Warm Overhead Soffit Bulkhead Lamps Lighting the Walkable Sidewalk Tunnel */}
      {bayCenters
        .filter((_, idx) => idx % 2 === 0)
        .map((bz, idx) => (
          <group key={`lamp-${idx}`} position={[0, clearHeight + 0.01, bz]}>
            <mesh material={TOYBOX_MATERIALS.darkIron}>
              <cylinderGeometry args={[0.09, 0.1, 0.03, 10]} />
            </mesh>
            <mesh
              position={[0, -0.025, 0]}
              material={TOYBOX_MATERIALS.bulbWarmGlow}
            >
              <sphereGeometry args={[0.055, 8, 6]} />
            </mesh>
          </group>
        ))}

      {/* Masonry Repair Details on Top Deck: Brick Pallet, Mortar Bucket & Warning Beacon */}
      <group position={[-0.25, deckTopY, -1.6]}>
        {/* Timber Brick Pallet */}
        <mesh
          castShadow
          receiveShadow
          position={[0, 0.025, 0]}
          material={PROP_ACCENT_MATERIALS.bakeryCrateWood}
        >
          <boxGeometry args={[0.78, 0.05, 0.92]} />
        </mesh>
        {/* 2 Tiers of Faceted Terracotta Masonry Bricks */}
        {[0, 1].map((row) =>
          [-0.2, 0.2].map((bx) =>
            [-0.26, 0, 0.26].map((bz, bi) => (
              <mesh
                key={`brick-${row}-${bx}-${bi}`}
                castShadow
                position={[bx, 0.1 + row * 0.095, bz]}
                material={PROP_ACCENT_MATERIALS.terracottaBrickLight}
              >
                <boxGeometry args={[0.28, 0.085, 0.2]} />
              </mesh>
            ))
          )
        )}
      </group>

      {/* Galvanized Mortar Bucket + Wooden Trowel + Amber Warning Beacon */}
      <group position={[0.35, deckTopY, 1.4]}>
        <mesh
          castShadow
          position={[0, 0.15, 0]}
          material={TOYBOX_MATERIALS.galvanizedSteel}
        >
          <cylinderGeometry args={[0.17, 0.13, 0.3, 12]} />
        </mesh>
        <mesh
          position={[0, 0.27, 0]}
          material={PROP_ACCENT_MATERIALS.mortarCement}
        >
          <cylinderGeometry args={[0.15, 0.15, 0.04, 12]} />
        </mesh>
        {/* Flashing Construction Warning Lamp on South End Post */}
        <group position={[outerPostX - 0.35, 0.14, depth * 0.5 - 1.65]}>
          <mesh
            castShadow
            position={[0, 0.06, 0]}
            material={TOYBOX_MATERIALS.darkIron}
          >
            <boxGeometry args={[0.14, 0.12, 0.14]} />
          </mesh>
          <mesh
            position={[0, 0.17, 0]}
            material={TOYBOX_MATERIALS.taxiAmber}
          >
            <cylinderGeometry args={[0.06, 0.06, 0.1, 10]} />
          </mesh>
        </group>
      </group>

      {/* QA Wireframe: Outer Bounds + Clear Walkthrough Corridor Envelope */}
      {showWireframe && (
        <group>
          <mesh
            position={[0, 1.425, 0]}
            material={TOYBOX_MATERIALS.qaBoundsWireframe}
          >
            <boxGeometry args={[width, 2.85, depth]} />
          </mesh>
          <mesh
            position={[0, clearHeight * 0.5, 0]}
            material={TOYBOX_MATERIALS.qaSensorWireframe}
          >
            <boxGeometry args={[width - 0.38, clearHeight, depth]} />
          </mesh>
        </group>
      )}
    </group>
  );
}
