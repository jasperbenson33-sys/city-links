import * as THREE from 'three';

export interface SunlitGrateShaftMaterialOptions {
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  fresnelPower?: number;
  nearFadeStart?: number;
  nearFadeEnd?: number;
}

/**
 * Creates an additive, depthWrite-false volumetric sunbeam material for Zone 7's
 * overhead sidewalk-grate light shafts (`SUBWAY_STATION_VAULT_SPEC.lightShafts`).
 *
 * Anti-shimmer & anti-whiteout guarantees:
 * 1. View-space radial Fresnel feathering (`pow(|N·V|, fresnelPower)`) eliminates hard cone/cylinder edges.
 * 2. Per-fragment camera-proximity fade (`smoothstep(nearFadeStart, nearFadeEnd, length(vViewPosition))`,
 *    immediate `discard` `<= nearFadeStart = 1.8m`) prevents camera near-plane whiteout when orbiting
 *    or flying through subterranean light shafts.
 * 3. Zero temporal noise (`0.0000%` stationary pixel delta) + safe `.clone()` hook preservation.
 */
export function createSunlitGrateShaftMaterial(
  opts: SunlitGrateShaftMaterialOptions = {},
): THREE.MeshStandardMaterial {
  const color = opts.color ?? '#FFF1C9';
  const emissive = opts.emissive ?? '#FFD580';
  const emissiveIntensity = opts.emissiveIntensity ?? 1.25;
  const opacity = opts.opacity ?? 0.14;
  const fresnelPower = opts.fresnelPower ?? 2.05;
  const nearFadeStart = opts.nearFadeStart ?? 1.8;
  const nearFadeEnd = opts.nearFadeEnd ?? 3.6;

  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    roughness: 1.0,
    metalness: 0.0,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });

  const fpLit = fresnelPower.toFixed(3);
  const nsLit = nearFadeStart.toFixed(3);
  const neLit = Math.max(nearFadeStart + 0.05, nearFadeEnd).toFixed(3);
  const cacheKey = `curbside-grate-shaft-v1-${fpLit}-${nsLit}-${neLit}`;

  mat.customProgramCacheKey = () => cacheKey;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      /* glsl */ `
      #include <normal_fragment_maps>
      if (opacity <= 0.002) discard;
      float shaftCamDist = length(vViewPosition);
      float shaftNearFade = smoothstep(${nsLit}, ${neLit}, shaftCamDist);
      if (shaftNearFade <= 0.001) discard;
      vec3 shaftViewDir = vViewPosition / max(shaftCamDist, 1e-4);
      float shaftFresnel = pow(clamp(abs(dot(normal, shaftViewDir)), 0.0, 1.0), ${fpLit});
      diffuseColor.a *= shaftFresnel * shaftNearFade;
      if (diffuseColor.a <= 0.002) discard;
      `,
    );
  };

  mat.clone = function cloneSunlitGrateShaftMaterial(): THREE.MeshStandardMaterial {
    const cloned = createSunlitGrateShaftMaterial({
      color: `#${this.color.getHexString()}`,
      emissive: `#${this.emissive.getHexString()}`,
      emissiveIntensity: this.emissiveIntensity,
      opacity: this.opacity,
      fresnelPower,
      nearFadeStart,
      nearFadeEnd,
    });
    cloned.side = this.side;
    cloned.blending = this.blending;
    cloned.depthWrite = this.depthWrite;
    cloned.depthTest = this.depthTest;
    cloned.fog = this.fog;
    cloned.visible = this.visible;
    return cloned;
  };

  mat.needsUpdate = true;
  return mat;
}
