import * as THREE from 'three';

export interface DitherCutawayHandle {
  material: THREE.Material;
  setOpacity: (opacity: number) => void;
}

/**
 * Deterministic screen-space Interleaved Gradient Noise (Jorge Jimenez, 2014).
 * Zero temporal seed (`0.0000%` stationary pixel delta) and zero repeating 4x4 waffle grid.
 */
export const CURBSIDE_IGN_GLSL = /* glsl */ `
float curbsideScreenIGN(vec2 fragPx) {
  return fract(52.9829189 * fract(dot(floor(fragPx), vec2(0.06711056, 0.00583715))));
}
`;

const POLYGON_OFFSET_MAT_CACHE = new WeakMap<
  THREE.Material,
  Map<string, THREE.Material>
>();

/**
 * Returns a cached clone of `base` carrying deterministic `polygonOffset` (`-tier / -tier`),
 * leaving shared palette instances untouched.
 */
export function getPolygonOffsetMaterial<T extends THREE.Material>(
  base: T,
  tier: 1 | 2 | 3 | -1 = 1,
): T {
  let perBase = POLYGON_OFFSET_MAT_CACHE.get(base);
  if (!perBase) {
    perBase = new Map();
    POLYGON_OFFSET_MAT_CACHE.set(base, perBase);
  }
  const key = String(tier);
  let hit = perBase.get(key);
  if (!hit) {
    hit = base.clone();
    hit.polygonOffset = true;
    const f = tier === -1 ? 1 : -tier;
    hit.polygonOffsetFactor = f;
    hit.polygonOffsetUnits = f;
    perBase.set(key, hit);
  }
  return hit as T;
}

/**
 * Clones a Three.js material into a deterministic screen-space Interleaved Gradient Noise (IGN)
 * cutaway material driven by Three.js's per-draw `opacity` uniform.
 *
 * - Opaque materials keep `transparent: false, depthWrite: true` so multi-part buildings, vehicles,
 *   and subterranean columns fade as ONE unified front-most silhouette with ZERO internal X-ray
 *   sub-mesh stacking, ZERO 4x4 waffle grid, and `0.0000%` stationary pixel delta.
 * - Originally transparent materials (`source.transparent === true`, e.g. fountain water / glass)
 *   scale `clone.opacity = baseOpacity * fade` AND discard via IGN down to `0.0` near the lens so
 *   transparent sub-meshes never hover over dithered stone.
 */
export function createDitherCutawayMaterial(
  source: THREE.Material,
  initialOpacity = 1.0,
): DitherCutawayHandle {
  const clone = source.clone();
  const baseOpacity = source.transparent
    ? Math.max(0.01, Math.min(1, source.opacity))
    : 1.0;
  const clampedInit = Math.max(0, Math.min(1, initialOpacity));

  clone.transparent = source.transparent;
  clone.depthWrite = source.transparent ? source.depthWrite : true;
  clone.opacity = baseOpacity * clampedInit;

  if (!(source instanceof THREE.ShaderMaterial)) {
    const prevBeforeCompile = source.onBeforeCompile;
    const prevCacheKeyFn = source.customProgramCacheKey;
    const baseOpLit = baseOpacity.toFixed(4);

    clone.customProgramCacheKey = function customIgnCutawayCacheKey() {
      const baseKey = prevCacheKeyFn ? prevCacheKeyFn.call(this) : '';
      return `${baseKey}|curbside-ign-dither-v2-${source.type}-${baseOpLit}`;
    };

    clone.onBeforeCompile = (shader, renderer) => {
      if (prevBeforeCompile) {
        prevBeforeCompile.call(clone, shader, renderer);
      }
      shader.fragmentShader =
        CURBSIDE_IGN_GLSL +
        shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          /* glsl */ `
          #include <clipping_planes_fragment>
          if (opacity <= 0.006) discard;
          float cutawayFade = opacity / ${baseOpLit};
          if (cutawayFade <= 0.006) discard;
          if (cutawayFade < 0.998) {
            float ignThreshold = curbsideScreenIGN(gl_FragCoord.xy);
            if (cutawayFade <= ignThreshold) discard;
          }
          `,
        );
    };
  }
  clone.needsUpdate = true;

  return {
    material: clone,
    setOpacity: (nextOpacity: number) => {
      const f = Math.max(0, Math.min(1, nextOpacity));
      clone.opacity = baseOpacity * f;
    },
  };
}
