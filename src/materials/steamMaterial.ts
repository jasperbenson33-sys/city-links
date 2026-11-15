import * as THREE from 'three';

export interface SoftSteamMaterialOptions {
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  roughness?: number;
  fresnelPower?: number;
  nearFadeStart?: number;
  nearFadeEnd?: number;
}

/**
 * Creates a soft, pillowy volumetric-look steam puff MeshStandardMaterial with:
 * 1. View-space radial Fresnel silhouette feathering (`pow(|N·V|, fresnelPower)`) so overlapping
 *    low-poly icosahedron billows blend seamlessly without crisp "soap-bubble" outlines.
 * 2. Deterministic per-fragment camera-proximity fade (`smoothstep(nearFadeStart, nearFadeEnd, camDist)`,
 *    discarding `<= nearFadeStart`) so backing the camera near or through a steam plume never slices
 *    the near-plane or washes out the viewport (`0.0000%` stationary pixel delta preserved).
 * 3. Safe `.clone()` override preserving `onBeforeCompile` + `customProgramCacheKey` for prop-local clones.
 */
export function createSoftSteamMaterial(
  opts: SoftSteamMaterialOptions = {},
): THREE.MeshStandardMaterial {
  const color = opts.color ?? '#FFFDF9';
  const emissive = opts.emissive ?? '#FFF5E6';
  const emissiveIntensity = opts.emissiveIntensity ?? 0.28;
  const opacity = opts.opacity ?? 0.34;
  const roughness = opts.roughness ?? 0.92;
  const fresnelPower = opts.fresnelPower ?? 1.8;
  const nearFadeStart = opts.nearFadeStart ?? 1.65;
  const nearFadeEnd = opts.nearFadeEnd ?? 3.2;

  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    roughness,
    metalness: 0.0,
    transparent: true,
    opacity,
    depthWrite: false,
  });

  const fpLit = fresnelPower.toFixed(3);
  const nsLit = nearFadeStart.toFixed(3);
  const neLit = Math.max(nearFadeStart + 0.05, nearFadeEnd).toFixed(3);
  const cacheKey = `curbside-soft-steam-v1-${fpLit}-${nsLit}-${neLit}`;

  mat.customProgramCacheKey = () => cacheKey;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      /* glsl */ `
      #include <normal_fragment_maps>
      float steamCamDist = length(vViewPosition);
      float steamNearFade = smoothstep(${nsLit}, ${neLit}, steamCamDist);
      if (steamNearFade <= 0.001) discard;
      vec3 steamViewDir = vViewPosition / max(steamCamDist, 1e-4);
      float steamFresnel = pow(clamp(abs(dot(normal, steamViewDir)), 0.0, 1.0), ${fpLit});
      diffuseColor.a *= steamFresnel * steamNearFade;
      if (diffuseColor.a <= 0.003) discard;
      `,
    );
  };

  const baseClone = mat.clone.bind(mat);
  mat.clone = function cloneSoftSteamMaterial(): THREE.MeshStandardMaterial {
    const cloned = createSoftSteamMaterial({
      color: `#${this.color.getHexString()}`,
      emissive: `#${this.emissive.getHexString()}`,
      emissiveIntensity: this.emissiveIntensity,
      opacity: this.opacity,
      roughness: this.roughness,
      fresnelPower,
      nearFadeStart,
      nearFadeEnd,
    });
    // Copy standard flags (e.g. polygonOffset, visible, side, depthWrite) while keeping shader hooks
    cloned.side = this.side;
    cloned.depthWrite = this.depthWrite;
    cloned.depthTest = this.depthTest;
    cloned.fog = this.fog;
    cloned.polygonOffset = this.polygonOffset;
    cloned.polygonOffsetFactor = this.polygonOffsetFactor;
    cloned.polygonOffsetUnits = this.polygonOffsetUnits;
    cloned.visible = this.visible;
    void baseClone;
    return cloned;
  };

  mat.needsUpdate = true;
  return mat;
}
