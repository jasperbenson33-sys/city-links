'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { buildVaultedSubwayArchSpec } from '@/lib/geometryHelpers';
import type { SubwayVaultEnclosureSpec } from '@/types/course';

const VAULT_CREAM_RIB_MAT = new THREE.MeshStandardMaterial({
  color: '#EFEAE0',
  roughness: 0.36,
  metalness: 0.06,
});
const VAULT_EMERALD_ACCENT_MAT = new THREE.MeshStandardMaterial({
  color: '#1D644C',
  roughness: 0.32,
  metalness: 0.1,
});
const SCONCE_BRASS_MAT = new THREE.MeshStandardMaterial({
  color: '#D8AF4E',
  roughness: 0.28,
  metalness: 0.72,
});
const SCONCE_GLOW_MAT = new THREE.MeshStandardMaterial({
  color: '#FEF3C7',
  emissive: '#FBBF24',
  emissiveIntensity: 0.92,
  roughness: 0.2,
});
const STATION_SIGN_BACK_MAT = new THREE.MeshStandardMaterial({
  color: '#164E3B',
  roughness: 0.4,
  metalness: 0.12,
});
const PLATFORM_SAFETY_YELLOW_MAT = new THREE.MeshStandardMaterial({
  color: '#EAB308',
  roughness: 0.62,
  metalness: 0.05,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

/**
 * Zone 7 Architectural Vaulted Ceramic-Tile IRT Subway Terminal Interior:
 * - 7 Guastavino arched cream-and-emerald vault ceiling ribs (`buildVaultedSubwayArchSpec`)
 * - Swept tiled ceiling haunch coves along West & East walls (clear of the 4 ceiling grates)
 * - 4 sunlit sidewalk-grate volumetric skylight cones & glowing platform light pools
 * - 10 warm glowing bronze-and-milkglass station sconces + terminal mosaic friezes
 */
export const Zone7SubwayFinale = React.memo(function Zone7SubwayFinale({
  vault,
}: {
  vault: SubwayVaultEnclosureSpec;
}) {
  const clearSpanW = vault.boundsXZ.maxX - vault.boundsXZ.minX;
  const centerX = (vault.boundsXZ.minX + vault.boundsXZ.maxX) * 0.5;
  const archSpec = useMemo(
    () =>
      buildVaultedSubwayArchSpec({
        clearSpanWidth: clearSpanW,
        springlineHeight: vault.vaultSpringlineY - vault.platformFloorY,
        archRiseHeight: vault.vaultCrownY - vault.vaultSpringlineY,
      }),
    [clearSpanW, vault.vaultSpringlineY, vault.platformFloorY, vault.vaultCrownY],
  );

  const ceilingSpanZ = vault.boundsXZ.maxZ - vault.boundsXZ.minZ;
  const ceilingCenterZ = (vault.boundsXZ.minZ + vault.boundsXZ.maxZ) * 0.5;

  // Coffered emerald cove strips spanning full platform along West & East haunches (x=22.4..25.6, 42.4..45.6)
  const coveGeo = useMemo(() => {
    const g = new THREE.BoxGeometry(0.42, 0.36, ceilingSpanZ - 0.4);
    return g;
  }, [ceilingSpanZ]);

  useEffect(() => () => coveGeo.dispose(), [coveGeo]);

  return (
    <group name="Zone7-subway-vault-architecture">
      {/* 7 Guastavino Vaulted Ceramic Transverse Arch Ribs (archRibZs) */}
      {vault.archRibZs.map((rz) => (
        <group key={`vault-rib-${rz}`} position={[centerX, vault.platformFloorY, rz]}>
          <mesh
            position={archSpec.leftPilaster.position}
            material={VAULT_EMERALD_ACCENT_MAT}
            receiveShadow
            castShadow={false}
          >
            <boxGeometry args={archSpec.leftPilaster.size} />
          </mesh>
          <mesh
            position={archSpec.rightPilaster.position}
            material={VAULT_EMERALD_ACCENT_MAT}
            receiveShadow
            castShadow={false}
          >
            <boxGeometry args={archSpec.rightPilaster.size} />
          </mesh>
          {archSpec.archSegments.map((seg) => (
            <group
              key={`seg-${seg.index}`}
              position={seg.position}
              rotation={seg.rotation}
            >
              <mesh
                material={VAULT_EMERALD_ACCENT_MAT}
                receiveShadow
                castShadow={false}
              >
                <boxGeometry args={seg.size} />
              </mesh>
              {seg.isCrownKeystone && (
                <mesh
                  position={[0, -seg.size[1] * 0.34, 0]}
                  material={SCONCE_BRASS_MAT}
                  castShadow={false}
                >
                  <boxGeometry args={[seg.size[0] * 0.42, 0.14, seg.size[2] + 0.08]} />
                </mesh>
              )}
            </group>
          ))}
        </group>
      ))}

      {/* Longitudinal Vault Springline Cornice & Haunch Tile Coves */}
      {[-1, 1].map((side) => (
        <group
          key={`haunch-${side}`}
          position={[centerX + side * (clearSpanW * 0.5 - 0.38), vault.vaultSpringlineY + 0.24, ceilingCenterZ]}
        >
          <mesh
            geometry={coveGeo}
            material={VAULT_EMERALD_ACCENT_MAT}
            receiveShadow
          />
          <mesh
            position={[-side * 1.15, 0.72, 0]}
            rotation={[0, 0, side * 0.48]}
            material={VAULT_CREAM_RIB_MAT}
            receiveShadow
          >
            <boxGeometry args={[2.1, 0.22, ceilingSpanZ - 0.6]} />
          </mesh>
        </group>
      ))}

      {/* Backlit Emerald Station Mosaic Nameplates ("MERCER · CROSSTOWN TERMINAL") */}
      {[88.0, 108.0].map((sz, idx) =>
        [-1, 1].map((side) => (
          <group
            key={`station-sign-${idx}-${side}`}
            position={[
              side < 0 ? vault.boundsXZ.minX + 0.32 : vault.boundsXZ.maxX - 0.32,
              vault.platformFloorY + 2.55,
              sz,
            ]}
          >
            <mesh material={STATION_SIGN_BACK_MAT}>
              <boxGeometry args={[0.12, 0.72, 4.4]} />
            </mesh>
            <mesh position={[-side * 0.06, 0, 0]} material={SCONCE_GLOW_MAT}>
              <boxGeometry args={[0.04, 0.38, 3.9]} />
            </mesh>
            <mesh position={[-side * 0.04, 0.38, 0]} material={SCONCE_BRASS_MAT}>
              <boxGeometry args={[0.1, 0.06, 4.5]} />
            </mesh>
            <mesh position={[-side * 0.04, -0.38, 0]} material={SCONCE_BRASS_MAT}>
              <boxGeometry args={[0.1, 0.06, 4.5]} />
            </mesh>
          </group>
        )),
      )}

      {/* Subtle Tactile Yellow Track/Aisle Platform Border Strips Framing Central Train Car */}
      {[-1.78, 1.78].map((dx, i) => (
        <mesh
          key={`safety-strip-${i}`}
          position={[centerX + dx, vault.platformFloorY + 0.008, 96.5]}
          rotation={[-Math.PI * 0.5, 0, 0]}
          material={PLATFORM_SAFETY_YELLOW_MAT}
          receiveShadow
          castShadow={false}
        >
          <planeGeometry args={[0.24, 15.2]} />
        </mesh>
      ))}

      {/* 10 Warm Glowing Brass & Frosted-Glass Station Wall Sconces */}
      {/* Note: Feathered Fresnel sidewalk-grate light shafts & floor pools are rendered in LightingAndSky -> SubterraneanLightingRig. */}
      {vault.sconcePositions.map((sp, sIdx) => {
        const isSouthWall = sp[2] > vault.boundsXZ.maxZ - 1.0;
        const dx = isSouthWall ? 0 : sp[0] < centerX ? 0.14 : -0.14;
        const dz = isSouthWall ? -0.14 : 0;
        return (
          <group key={`sconce-${sIdx}`} position={[sp[0] + dx, sp[1], sp[2] + dz]}>
            <mesh material={SCONCE_BRASS_MAT} castShadow={false}>
              <boxGeometry args={[0.16, 0.28, 0.16]} />
            </mesh>
            <mesh position={[dx * 0.8, 0.14, dz * 0.8]} material={SCONCE_GLOW_MAT} castShadow={false}>
              <sphereGeometry args={[0.17, 10, 8]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
});
