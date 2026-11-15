'use client';

import React, { useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SUBWAY_STATION_VAULT_SPEC } from '@/config/grandEscapadeMasterPlan';
import { createSunlitGrateShaftMaterial } from '@/materials';
import type { SubwayVaultEnclosureSpec, Vec3Tuple } from '@/types';

export interface SubterraneanLightingHandle {
  /** Synchronously updates underground point-light intensities & volumetric opacities for `subBlend ∈ [0, 1]`. */
  applyBlend: (subBlend: number) => void;
  /** Advances the 3-frame initial mount GPU shader/VBO warmup so mid-flyover Zone 7 entry pays 0.0ms compile cost. */
  tickWarmup: () => void;
}

export interface SubterraneanLightingRigProps {
  vaultSpec?: SubwayVaultEnclosureSpec;
  includeLightShafts?: boolean;
}

interface ComputedShaftInstance {
  id: string;
  midpoint: Vec3Tuple;
  quaternion: [number, number, number, number];
  length: number;
  topRadius: number;
  bottomRadius: number;
  ceilingGlowPos: Vec3Tuple;
  ceilingGlowSize: [number, number];
  floorPoolPos: Vec3Tuple;
  floorPoolSize: number;
}

const BASE_SHAFT_OPACITY = 0.145;
const BASE_FLOOR_POOL_OPACITY = 0.21;
const BASE_SCONCE_HALO_OPACITY = 0.15;

/**
 * Radial smoothstep 64x64 alpha gradient texture so floor sun-pools feather to exact 0.0 alpha
 * well inside the quad bounds (zero silhouette edge crawl during diagonal camera pans).
 */
function createRadialSunPoolTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) * 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r = Math.hypot(dx, dy);
      const t = Math.max(0, Math.min(1, (r - 0.12) / (0.94 - 0.12)));
      const falloff = 1 - t * t * (3 - 2 * t);
      const alpha = Math.pow(falloff, 1.55);
      const idx = (y * size + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 229;
      data[idx + 2] = 172;
      data[idx + 3] = Math.round(alpha * 255);
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Stage 2 Zone 7 Subterranean Subway Station Lighting Rig:
 * 1. Two permanently-mounted `visible={true}` warm station `<pointLight>`s (`intensity = 0` on surface
 *    so Three.js `NUM_POINT_LIGHTS` never changes mid-round -> zero shader recompilation hitch).
 * 2. Four dramatic sunlit sidewalk-grate volumetric shafts (`SUBWAY_STATION_VAULT_SPEC.lightShafts`)
 *    with radial Fresnel feathering + `< 1.85m` camera-proximity discard (`0%` whiteout, `0.0000%` static delta).
 * 3. Soft radial sunlit floor pools & warm amber sconce lantern halos, GPU-prewarmed on mount.
 */
export const SubterraneanLightingRig = React.memo(
  React.forwardRef<SubterraneanLightingHandle, SubterraneanLightingRigProps>(
    function SubterraneanLightingRig(
      {
        vaultSpec = SUBWAY_STATION_VAULT_SPEC,
        includeLightShafts = true,
      }: SubterraneanLightingRigProps,
      ref,
    ) {
      const gl = useThree((s) => s.gl);
      const camera = useThree((s) => s.camera);
      const scene = useThree((s) => s.scene);

      const concourseLightRef = useRef<THREE.PointLight>(null);
      const goldenPinLightRef = useRef<THREE.PointLight>(null);
      const volumetricsGroupRef = useRef<THREE.Group>(null);
      const lastAppliedBlendRef = useRef(-1);
      const currentSubBlendRef = useRef(0);
      const warmupRemainingRef = useRef(3);

      const materials = useMemo(() => {
        const shaftMat = createSunlitGrateShaftMaterial({
          color: '#FFF2CC',
          emissive: '#FFD685',
          emissiveIntensity: 1.25,
          opacity: 0,
          fresnelPower: 2.05,
          nearFadeStart: 1.85,
          nearFadeEnd: 3.65,
        });

        const poolTex = createRadialSunPoolTexture();
        const floorPoolMat = new THREE.MeshBasicMaterial({
          color: '#FFE5AC',
          map: poolTex,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
          fog: false,
        });

        const sconceHaloMat = createSunlitGrateShaftMaterial({
          color: '#FFD79A',
          emissive: '#FFA438',
          emissiveIntensity: 1.35,
          opacity: 0,
          fresnelPower: 2.35,
          nearFadeStart: 1.35,
          nearFadeEnd: 2.8,
        });

        return { shaftMat, poolTex, floorPoolMat, sconceHaloMat };
      }, []);

      // Pre-compile custom Fresnel shaft/sconce shaders & upload radial sun-pool texture on mount
      useEffect(() => {
        const volGroup = volumetricsGroupRef.current;
        if (volGroup && includeLightShafts) {
          const prevVisible = volGroup.visible;
          volGroup.visible = true;
          gl.compile(volGroup, camera, scene);
          volGroup.visible = prevVisible;
        }
        return () => {
          materials.shaftMat.dispose();
          materials.floorPoolMat.dispose();
          materials.poolTex.dispose();
          materials.sconceHaloMat.dispose();
        };
      }, [gl, camera, scene, includeLightShafts, materials]);

      const shafts = useMemo<ComputedShaftInstance[]>(() => {
        const up = new THREE.Vector3(0, 1, 0);
        const dir = new THREE.Vector3();
        const quat = new THREE.Quaternion();

        return vaultSpec.lightShafts.map((spec) => {
          const [cx, cy, cz] = spec.ceilingCenter;
          const [fx, fy, fz] = spec.floorTarget;
          const sameXZ = Math.abs(cx - fx) < 0.05 && Math.abs(cz - fz) < 0.05;
          const targetX = sameXZ ? fx - 0.3 : fx;
          const targetZ = sameXZ ? fz + 0.26 : fz;

          const topY = cy - 0.08;
          const botY = fy + 0.06;

          dir.set(cx - targetX, topY - botY, cz - targetZ);
          const length = Math.max(0.5, dir.length());
          dir.normalize();
          quat.setFromUnitVectors(up, dir);

          const topRadius = Math.max(
            0.85,
            Math.min(spec.grateSizeXZ[0], spec.grateSizeXZ[1]) * 0.42,
          );
          const bottomRadius = Math.max(
            topRadius + 0.35,
            spec.beamRadiusMeters * 0.86,
          );

          return {
            id: spec.id,
            midpoint: [
              (cx + targetX) * 0.5,
              (topY + botY) * 0.5,
              (cz + targetZ) * 0.5,
            ],
            quaternion: [quat.x, quat.y, quat.z, quat.w],
            length,
            topRadius,
            bottomRadius,
            ceilingGlowPos: [cx, cy - 0.04, cz],
            ceilingGlowSize: [
              spec.grateSizeXZ[0] * 1.35,
              spec.grateSizeXZ[1] * 1.35,
            ],
            floorPoolPos: [targetX, fy + 0.024, targetZ],
            floorPoolSize: spec.beamRadiusMeters * 2.2,
          };
        });
      }, [vaultSpec.lightShafts]);

      const sconceHaloPositions = useMemo<Vec3Tuple[]>(() => {
        const centerX =
          (vaultSpec.boundsXZ.minX + vaultSpec.boundsXZ.maxX) * 0.5;
        const centerZ =
          (vaultSpec.boundsXZ.minZ + vaultSpec.boundsXZ.maxZ) * 0.5;
        return vaultSpec.sconcePositions.map(([sx, sy, sz]) => {
          const dx = centerX - sx;
          const dz = centerZ - sz;
          const len = Math.hypot(dx, dz) || 1;
          return [sx + (dx / len) * 0.28, sy + 0.04, sz + (dz / len) * 0.28];
        });
      }, [vaultSpec.boundsXZ, vaultSpec.sconcePositions]);

      useImperativeHandle(
        ref,
        () => ({
          applyBlend(subBlend: number) {
            const clamped = Math.max(0, Math.min(1, subBlend));
            currentSubBlendRef.current = clamped;
            if (Math.abs(clamped - lastAppliedBlendRef.current) < 1e-4) {
              return;
            }
            lastAppliedBlendRef.current = clamped;

            if (concourseLightRef.current) {
              concourseLightRef.current.intensity = 1.65 * clamped;
            }
            if (goldenPinLightRef.current) {
              goldenPinLightRef.current.intensity = 2.15 * clamped;
            }

            const volGroup = volumetricsGroupRef.current;
            if (!volGroup) return;
            const showVolumetrics =
              includeLightShafts &&
              (warmupRemainingRef.current > 0 || clamped > 0.008);
            volGroup.visible = showVolumetrics;
            materials.shaftMat.opacity = BASE_SHAFT_OPACITY * clamped;
            materials.floorPoolMat.opacity = BASE_FLOOR_POOL_OPACITY * clamped;
            materials.sconceHaloMat.opacity = BASE_SCONCE_HALO_OPACITY * clamped;
          },
          tickWarmup() {
            if (warmupRemainingRef.current <= 0) return;
            warmupRemainingRef.current -= 1;
            if (warmupRemainingRef.current === 0 && volumetricsGroupRef.current) {
              volumetricsGroupRef.current.visible =
                includeLightShafts && currentSubBlendRef.current > 0.008;
            }
          },
        }),
        [includeLightShafts, materials],
      );

      const concourseCenterX =
        (vaultSpec.boundsXZ.minX + vaultSpec.boundsXZ.maxX) * 0.5;

      return (
        <group name="subterranean-subway-lighting-rig">
          {/* Permanently visible warm concourse & Golden-Pin point lights (intensity=0 above ground -> 0 shader recompiles) */}
          <pointLight
            ref={concourseLightRef}
            position={[concourseCenterX, -2.4, 88.0]}
            color="#FFB85C"
            intensity={0}
            distance={38}
            decay={1.35}
          />
          <pointLight
            ref={goldenPinLightRef}
            position={[concourseCenterX, -2.0, 118.0]}
            color="#FFD982"
            intensity={0}
            distance={32}
            decay={1.3}
          />

          {/* Volumetric overhead sidewalk-grate shafts, floor sun-pools & warm sconce halos */}
          <group
            ref={volumetricsGroupRef}
            name="subway-volumetric-light-shafts"
            visible={includeLightShafts}
          >
            {shafts.map((shaft) => (
              <React.Fragment key={shaft.id}>
                <mesh
                  position={shaft.midpoint}
                  quaternion={shaft.quaternion}
                  material={materials.shaftMat}
                  frustumCulled={false}
                  renderOrder={4}
                >
                  <cylinderGeometry
                    args={[
                      shaft.topRadius,
                      shaft.bottomRadius,
                      shaft.length,
                      24,
                      1,
                      true,
                    ]}
                  />
                </mesh>
                <mesh
                  position={shaft.ceilingGlowPos}
                  rotation={[Math.PI * 0.5, 0, 0]}
                  material={materials.floorPoolMat}
                  frustumCulled={false}
                  renderOrder={3}
                >
                  <planeGeometry args={shaft.ceilingGlowSize} />
                </mesh>
                <mesh
                  position={shaft.floorPoolPos}
                  rotation={[-Math.PI * 0.5, 0, 0]}
                  material={materials.floorPoolMat}
                  frustumCulled={false}
                  renderOrder={3}
                >
                  <planeGeometry
                    args={[shaft.floorPoolSize, shaft.floorPoolSize]}
                  />
                </mesh>
              </React.Fragment>
            ))}

            {sconceHaloPositions.map((pos, idx) => (
              <mesh
                key={`sconce-halo-${idx}`}
                position={pos}
                material={materials.sconceHaloMat}
                frustumCulled={false}
                renderOrder={4}
              >
                <icosahedronGeometry args={[0.66, 2]} />
              </mesh>
            ))}
          </group>
        </group>
      );
    },
  ),
);
