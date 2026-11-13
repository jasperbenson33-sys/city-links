'use client';

import React from 'react';
import { TOYBOX_MATERIALS } from '@/materials';

export interface ScaffoldingTunnelPropProps {
  position?: [number, number, number];
  rotationY?: number;
  width?: number;
  depth?: number;
  clearHeight?: number;
  showWireframe?: boolean;
}

/**
 * Sidewalk Scaffolding Tunnel with baseplates seated flush at y = 0,
 * galvanized steel frame, planked overhead deck, and a wide knee-high
 * tunnel underneath for low Skimmer punch shots along +Z / -Z.
 */
export function ScaffoldingTunnelProp({
  position = [0, 0, 0],
  rotationY = 0,
  width = 1.95,
  depth = 3.1,
  clearHeight = 1.45,
  showWireframe = false,
}: ScaffoldingTunnelPropProps) {
  const halfW = width * 0.5 - 0.1;
  const halfD = depth * 0.5 - 0.1;
  const postHeight = clearHeight + 0.42;
  const deckY = clearHeight + 0.08;

  const corners: Array<[number, number]> = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [-halfW, halfD],
    [halfW, halfD],
  ];

  return (
    <group
      name="scaffolding-tunnel-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* 4 Steel Corner Stanchions + Footplates Flush at y = 0 */}
      {corners.map(([cx, cz], idx) => (
        <group key={idx} position={[cx, 0, cz]}>
          {/* Steel Baseplate sitting exactly on y = 0 */}
          <mesh
            castShadow
            receiveShadow
            position={[0, 0.015, 0]}
            material={TOYBOX_MATERIALS.darkIron}
          >
            <boxGeometry args={[0.24, 0.03, 0.24]} />
          </mesh>
          {/* Vertical Steel Post */}
          <mesh
            castShadow
            position={[0, 0.03 + postHeight * 0.5, 0]}
            material={TOYBOX_MATERIALS.scaffoldingSteel}
          >
            <cylinderGeometry args={[0.045, 0.048, postHeight, 8]} />
          </mesh>
          {/* Safety Amber Collar Sleeve */}
          <mesh
            position={[0, 0.32, 0]}
            material={TOYBOX_MATERIALS.scaffoldingSafetyAmber}
          >
            <cylinderGeometry args={[0.056, 0.056, 0.22, 8]} />
          </mesh>
        </group>
      ))}

      {/* Side Longitudinal Rails (X = +/-halfW, keeping +Z/-Z tunnel open!) */}
      {[-halfW, halfW].map((sx, idx) => (
        <group key={`rail-${idx}`} position={[sx, 0, 0]}>
          {/* Upper Ledger Beam */}
          <mesh
            castShadow
            position={[0, clearHeight, 0]}
            rotation={[Math.PI * 0.5, 0, 0]}
            material={TOYBOX_MATERIALS.scaffoldingSteel}
          >
            <cylinderGeometry args={[0.036, 0.036, depth - 0.12, 8]} />
          </mesh>
          {/* Top Guardrail */}
          <mesh
            castShadow
            position={[0, postHeight - 0.04, 0]}
            rotation={[Math.PI * 0.5, 0, 0]}
            material={TOYBOX_MATERIALS.scaffoldingSteel}
          >
            <cylinderGeometry args={[0.03, 0.03, depth - 0.12, 8]} />
          </mesh>
          {/* Side Diagonal X Cross-Braces (connected cleanly between stanchions below clearHeight) */}
          {(() => {
            const braceSpanZ = Math.max(0.4, depth - 0.34);
            const braceSpanY = Math.max(0.3, clearHeight - 0.22);
            const braceLen = Math.hypot(braceSpanZ, braceSpanY);
            const braceAngleX = Math.atan2(braceSpanZ, braceSpanY);
            const braceMidY = 0.11 + braceSpanY * 0.5;
            return (
              <>
                <mesh
                  castShadow
                  position={[0, braceMidY, 0]}
                  rotation={[braceAngleX, 0, 0]}
                  material={TOYBOX_MATERIALS.scaffoldingSteel}
                >
                  <cylinderGeometry args={[0.022, 0.022, braceLen, 6]} />
                </mesh>
                <mesh
                  castShadow
                  position={[0, braceMidY, 0]}
                  rotation={[-braceAngleX, 0, 0]}
                  material={TOYBOX_MATERIALS.scaffoldingSteel}
                >
                  <cylinderGeometry args={[0.022, 0.022, braceLen, 6]} />
                </mesh>
              </>
            );
          })()}
        </group>
      ))}

      {/* Front & Rear Overhead Cross Transoms */}
      {[-halfD, 0, halfD].map((tz, idx) => (
        <mesh
          key={`transom-${idx}`}
          castShadow
          position={[0, clearHeight, tz]}
          rotation={[0, 0, Math.PI * 0.5]}
          material={TOYBOX_MATERIALS.scaffoldingSteel}
        >
          <cylinderGeometry args={[0.038, 0.038, width - 0.08, 8]} />
        </mesh>
      ))}

      {/* Overhead Timber Planked Deck */}
      <mesh
        castShadow
        receiveShadow
        position={[0, deckY, 0]}
        material={TOYBOX_MATERIALS.scaffoldingDeckWood}
      >
        <boxGeometry args={[width + 0.12, 0.09, depth + 0.12]} />
      </mesh>

      {/* Safety Amber Toe-Board Trim along Front & Back Fascia */}
      {[-halfD - 0.04, halfD + 0.04].map((fz, idx) => (
        <mesh
          key={`fascia-${idx}`}
          castShadow
          position={[0, deckY + 0.11, fz]}
          material={TOYBOX_MATERIALS.scaffoldingSafetyAmber}
        >
          <boxGeometry args={[width + 0.14, 0.13, 0.06]} />
        </mesh>
      ))}

      {/* Warm Cafe String Bulbs Tucked Beneath Overhead Deck */}
      {[-0.65, 0, 0.65].map((bx, idx) => (
        <mesh
          key={`bulb-${idx}`}
          position={[bx, clearHeight - 0.04, halfD]}
          material={TOYBOX_MATERIALS.bulbWarmGlow}
        >
          <sphereGeometry args={[0.065, 8, 8]} />
        </mesh>
      ))}

      {/* QA Collider & Tunnel Wireframes */}
      {showWireframe && (
        <group>
          {/* Left & Right Solid Post Colliders */}
          {[-halfW, halfW].map((sx, idx) => (
            <mesh
              key={`wf-side-${idx}`}
              position={[sx, postHeight * 0.5, 0]}
              material={TOYBOX_MATERIALS.qaColliderWireframe}
            >
              <boxGeometry args={[0.24, postHeight, depth]} />
            </mesh>
          ))}
          {/* Overhead Deck Solid Collider */}
          <mesh
            position={[0, deckY + 0.02, 0]}
            material={TOYBOX_MATERIALS.qaColliderWireframe}
          >
            <boxGeometry args={[width + 0.12, 0.22, depth + 0.12]} />
          </mesh>
          {/* Clear Knee-High Tunnel Bounds Indicator */}
          <mesh
            position={[0, clearHeight * 0.5, 0]}
            material={TOYBOX_MATERIALS.qaSensorWireframe}
          >
            <boxGeometry args={[width - 0.48, clearHeight - 0.06, depth]} />
          </mesh>
        </group>
      )}
    </group>
  );
}
