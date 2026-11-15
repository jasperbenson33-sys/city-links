import * as THREE from 'three';
import type { BuildingPaletteId } from '@/types';
import {
  createAsphaltAggregateTexture,
  createCourtyardPaverTexture,
  createPatioCobblestoneTexture,
  createPuttingGreenStripeTexture,
  createSidewalkFlagstoneTexture,
  createSubwayBrickTexture,
  createTerracottaRoofTexture,
} from './proceduralTextures';
import { createSoftSteamMaterial } from './steamMaterial';

function smoothstepRamp(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Shared 4-band antialiased sunlit toon ramp texture (128x1 LinearFilter).
 * Preserves crisp Coffee-Golf / Walkabout plane separation across 4 tonal steps while
 * feathering band terminators over ~3.5% of NdotL so curved silhouettes never stair-step.
 */
function createSunlitToonGradientMap(): THREE.DataTexture {
  const width = 128;
  const stops = [184, 210, 235, 255];
  const edges = [0.25, 0.5, 0.75];
  const feather = 0.022;
  const data = new Uint8Array(width * 4);

  for (let i = 0; i < width; i++) {
    const u = i / (width - 1);
    let val = stops[0];
    val += (stops[1] - stops[0]) * smoothstepRamp(edges[0] - feather, edges[0] + feather, u);
    val += (stops[2] - stops[1]) * smoothstepRamp(edges[1] - feather, edges[1] + feather, u);
    val += (stops[3] - stops[2]) * smoothstepRamp(edges[2] - feather, edges[2] + feather, u);
    const byteVal = Math.round(val);
    const idx = i * 4;
    data[idx] = byteVal;
    data[idx + 1] = byteVal;
    data[idx + 2] = byteVal;
    data[idx + 3] = 255;
  }

  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export const TOON_GRADIENT_MAP = createSunlitToonGradientMap();

function toonMat(
  color: string,
  opts?: {
    emissive?: string;
    emissiveIntensity?: number;
    side?: THREE.Side;
    transparent?: boolean;
    opacity?: number;
    depthWrite?: boolean;
    flatShading?: boolean;
  },
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: TOON_GRADIENT_MAP,
    emissive: opts?.emissive ?? '#000000',
    emissiveIntensity: opts?.emissiveIntensity ?? 0,
    side: opts?.side ?? THREE.FrontSide,
    transparent: opts?.transparent ?? false,
    opacity: opts?.opacity ?? 1,
    depthWrite: opts?.depthWrite ?? true,
  });
}

function matteMat(
  color: string,
  opts?: {
    map?: THREE.Texture;
    roughness?: number;
    metalness?: number;
    emissive?: string;
    emissiveIntensity?: number;
    flatShading?: boolean;
    side?: THREE.Side;
    transparent?: boolean;
    opacity?: number;
    depthWrite?: boolean;
    polygonOffset?: boolean;
    polygonOffsetFactor?: number;
    polygonOffsetUnits?: number;
    fog?: boolean;
  },
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    map: opts?.map ?? null,
    roughness: opts?.roughness ?? 0.8,
    metalness: opts?.metalness ?? 0.03,
    emissive: opts?.emissive ?? '#000000',
    emissiveIntensity: opts?.emissiveIntensity ?? 0,
    flatShading: opts?.flatShading ?? false,
    side: opts?.side ?? THREE.FrontSide,
    transparent: opts?.transparent ?? false,
    opacity: opts?.opacity ?? 1,
    depthWrite: opts?.depthWrite ?? true,
    polygonOffset: opts?.polygonOffset ?? false,
    polygonOffsetFactor: opts?.polygonOffsetFactor ?? 0,
    polygonOffsetUnits: opts?.polygonOffsetUnits ?? 0,
    fog: opts?.fog ?? true,
  });
}

export const VENICE_TEXTURES = {
  asphaltAggregate: createAsphaltAggregateTexture(),
  sidewalkFlagstone: createSidewalkFlagstoneTexture(),
  courtyardPaver: createCourtyardPaverTexture(),
  patioCobblestone: createPatioCobblestoneTexture(),
  subwayBrick: createSubwayBrickTexture(),
  puttingGreenStripes: createPuttingGreenStripeTexture(),
  terracottaRoof: createTerracottaRoofTexture(),
} as const;

/**
 * Rich Walkabout: Venice + Coffee Golf material set for facades, streets, curbs,
 * recessed gutters, pergolas, catenary string lights, and skyline silhouettes.
 */
export const VENICE_MATERIALS = {
  // === Street, Sidewalk, Gutter, Ramp & Turf Surfaces ===
  asphaltRoadSlate: matteMat('#FFFFFF', {
    map: VENICE_TEXTURES.asphaltAggregate,
    roughness: 0.9,
    metalness: 0.04,
  }),
  asphaltRoadEdgeBase: matteMat('#2D3340', { roughness: 0.92, metalness: 0.03 }),
  crosswalkWhite: matteMat('#F8F4EA', {
    roughness: 0.76,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }),
  loadingZoneAmber: matteMat('#F2B233', {
    roughness: 0.72,
    metalness: 0.03,
    emissive: '#B45309',
    emissiveIntensity: 0.06,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }),
  laneLineCream: matteMat('#E7DCC4', {
    roughness: 0.76,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }),
  gutterConcreteChannel: matteMat('#545D6B', { roughness: 0.84, metalness: 0.05 }),
  gutterConcreteLip: matteMat('#677180', { roughness: 0.8, metalness: 0.06 }),
  gutterWetWaterSheen: matteMat('#38BDF8', {
    roughness: 0.28,
    metalness: 0.12,
    emissive: '#0284C7',
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  }),
  graniteCurbStone: matteMat('#D3C9BA', {
    roughness: 0.78,
    metalness: 0.04,
    flatShading: true,
  }),
  graniteCurbBevelTop: matteMat('#E2D9C9', {
    roughness: 0.74,
    metalness: 0.04,
    flatShading: true,
  }),
  graniteCurbJoint: matteMat('#B8AD9E', { roughness: 0.85, metalness: 0.02 }),
  sidewalkLimestone: matteMat('#FFFFFF', {
    map: VENICE_TEXTURES.sidewalkFlagstone,
    roughness: 0.84,
    metalness: 0.02,
  }),
  sidewalkSlabBody: matteMat('#E3D3BA', { roughness: 0.86, metalness: 0.02 }),
  subwayBrickPlaza: matteMat('#FFFFFF', {
    map: VENICE_TEXTURES.subwayBrick,
    roughness: 0.86,
    metalness: 0.02,
  }),
  courtyardPaver: matteMat('#FFFFFF', {
    map: VENICE_TEXTURES.courtyardPaver,
    roughness: 0.82,
    metalness: 0.02,
  }),
  courtyardTerraceSideStone: matteMat('#DECDB2', {
    roughness: 0.84,
    metalness: 0.02,
    flatShading: true,
  }),
  courtyardRampStone: matteMat('#F3E7D2', {
    map: VENICE_TEXTURES.courtyardPaver,
    roughness: 0.82,
    metalness: 0.02,
  }),
  courtyardRampCourseAccent: matteMat('#D1BFA3', {
    roughness: 0.84,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }),
  courtyardRampCheek: matteMat('#D7C4A8', {
    roughness: 0.82,
    metalness: 0.02,
    flatShading: true,
  }),
  puttingGreenTurf: matteMat('#FFFFFF', {
    map: VENICE_TEXTURES.puttingGreenStripes,
    roughness: 0.88,
    metalness: 0.0,
  }),
  puttingGreenFringe: matteMat('#2E9139', {
    roughness: 0.9,
    metalness: 0.0,
  }),
  puttingGreenStoneBorder: matteMat('#EDE0C8', {
    roughness: 0.78,
    metalness: 0.02,
    flatShading: true,
  }),
  patioRoughStone: matteMat('#FFFFFF', {
    map: VENICE_TEXTURES.patioCobblestone,
    roughness: 0.9,
    metalness: 0.01,
  }),
  patioRoughMoss: matteMat('#5A8245', {
    roughness: 0.94,
    metalness: 0.0,
    flatShading: true,
  }),

  // === Walkabout: Venice Facade Stucco, Brick, Trim & Roofs ===
  stuccoTerracotta: matteMat('#D86F4B', { roughness: 0.88, metalness: 0.02 }),
  stuccoTerracottaDeep: matteMat('#B55336', { roughness: 0.9, metalness: 0.02 }),
  stuccoOchre: matteMat('#EBB55B', { roughness: 0.86, metalness: 0.02 }),
  stuccoOchreDeep: matteMat('#D4983E', { roughness: 0.88, metalness: 0.02 }),
  stuccoCreamLimestone: matteMat('#F3E0BC', { roughness: 0.84, metalness: 0.02 }),
  stuccoCreamDeep: matteMat('#DEC7A1', { roughness: 0.86, metalness: 0.02 }),
  brickBrownstone: matteMat('#A24B37', { roughness: 0.9, metalness: 0.03 }),
  brickBrownstoneDeep: matteMat('#7E3626', { roughness: 0.92, metalness: 0.03 }),
  stuccoSageTrim: matteMat('#7DA590', { roughness: 0.86, metalness: 0.02 }),
  stuccoSageDeep: matteMat('#5C8570', { roughness: 0.88, metalness: 0.02 }),

  roofTerracottaTile: matteMat('#FFFFFF', {
    map: VENICE_TEXTURES.terracottaRoof,
    roughness: 0.74,
    metalness: 0.04,
    flatShading: true,
  }),
  roofTerracottaRidge: matteMat('#A64628', {
    roughness: 0.76,
    metalness: 0.04,
    flatShading: true,
  }),
  roofMansardSlate: matteMat('#3C4454', {
    roughness: 0.68,
    metalness: 0.1,
    flatShading: true,
  }),
  roofTarFlat: matteMat('#565D6C', { roughness: 0.9, metalness: 0.04 }),
  campanileSpireCopper: matteMat('#4D8E84', {
    roughness: 0.56,
    metalness: 0.22,
    flatShading: true,
  }),

  // === Storefronts, Windows, Shutters, Ironwork, Pergola & Flora ===
  storefrontTimber: matteMat('#4B2E20', { roughness: 0.74, metalness: 0.04 }),
  storefrontWarmInterior: matteMat('#FFE5A3', {
    roughness: 0.36,
    metalness: 0.04,
    emissive: '#FFAC45',
    emissiveIntensity: 0.62,
  }),
  windowDarkGlass: matteMat('#2F4356', {
    roughness: 0.34,
    metalness: 0.16,
    emissive: '#1E3246',
    emissiveIntensity: 0.12,
  }),
  windowWarmLit: matteMat('#FFE094', {
    roughness: 0.34,
    metalness: 0.06,
    emissive: '#FFB347',
    emissiveIntensity: 0.54,
  }),
  shutterSageDefault: matteMat('#357664', { roughness: 0.76, metalness: 0.02 }),
  shutterEspresso: matteMat('#523C33', { roughness: 0.78, metalness: 0.02 }),
  wroughtIron: matteMat('#494244', {
    roughness: 0.62,
    metalness: 0.12,
    emissive: '#2A2321',
    emissiveIntensity: 0.08,
  }),
  copperDrainpipe: matteMat('#8C5E45', { roughness: 0.5, metalness: 0.2 }),
  pergolaCedar: matteMat('#7A4B2E', { roughness: 0.78, metalness: 0.03 }),
  pergolaVineLeaf: matteMat('#499346', {
    roughness: 0.76,
    metalness: 0.02,
    flatShading: true,
  }),
  flowerBoxClay: matteMat('#BA6041', { roughness: 0.84, metalness: 0.02 }),
  flowerBoxBlossomCoral: matteMat('#F45B69', {
    roughness: 0.7,
    metalness: 0.02,
    flatShading: true,
  }),
  flowerBoxBlossomGold: matteMat('#FBBF24', {
    roughness: 0.7,
    metalness: 0.02,
    flatShading: true,
  }),
  signagePlaqueBg: matteMat('#F4E9D4', { roughness: 0.78, metalness: 0.02 }),
  signagePlaqueInk: matteMat('#433127', { roughness: 0.8, metalness: 0.02 }),

  // === Overhead Catenary Café String Lights & Distant Horizon ===
  stringLightCord: matteMat('#564B44', {
    roughness: 0.84,
    metalness: 0.03,
    emissive: '#2E2520',
    emissiveIntensity: 0.06,
  }),
  stringLightBulbGlow: new THREE.MeshStandardMaterial({
    color: '#FFF6D4',
    emissive: '#FFBD54',
    emissiveIntensity: 1.18,
    roughness: 0.52,
    metalness: 0.0,
  }),
  skylineTerracotta: matteMat('#D18A72', { roughness: 0.9, metalness: 0.02 }),
  skylineOchre: matteMat('#DDBB8D', { roughness: 0.9, metalness: 0.02 }),
  skylineLimestone: matteMat('#DFCBB4', { roughness: 0.9, metalness: 0.02 }),
  skylineBrick: matteMat('#B87664', { roughness: 0.92, metalness: 0.02 }),
  horizonEarthApron: matteMat('#DEC4A4', { roughness: 0.96, metalness: 0.0 }),
} as const;

const DYNAMIC_COLOR_MAT_CACHE = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Returns a cached MeshStandardMaterial for a given hex color + roughness,
 * avoiding runtime material allocations while preserving per-building palette accents.
 */
export function getCachedMatteMaterial(
  hex: string,
  roughness = 0.76,
  metalness = 0.03,
): THREE.MeshStandardMaterial {
  const key = `${hex.toUpperCase()}_${roughness.toFixed(2)}_${metalness.toFixed(2)}`;
  const hit = DYNAMIC_COLOR_MAT_CACHE.get(key);
  if (hit) return hit;
  const mat = matteMat(hex, { roughness, metalness });
  DYNAMIC_COLOR_MAT_CACHE.set(key, mat);
  return mat;
}

export function getBuildingWallMaterial(
  palette: BuildingPaletteId,
  isDeepShade = false,
): THREE.MeshStandardMaterial {
  switch (palette) {
    case 'terracotta':
      return isDeepShade
        ? VENICE_MATERIALS.stuccoTerracottaDeep
        : VENICE_MATERIALS.stuccoTerracotta;
    case 'ochre':
      return isDeepShade
        ? VENICE_MATERIALS.stuccoOchreDeep
        : VENICE_MATERIALS.stuccoOchre;
    case 'cream_limestone':
      return isDeepShade
        ? VENICE_MATERIALS.stuccoCreamDeep
        : VENICE_MATERIALS.stuccoCreamLimestone;
    case 'warm_brick':
      return isDeepShade
        ? VENICE_MATERIALS.brickBrownstoneDeep
        : VENICE_MATERIALS.brickBrownstone;
    case 'sage_trim':
    default:
      return isDeepShade
        ? VENICE_MATERIALS.stuccoSageDeep
        : VENICE_MATERIALS.stuccoSageTrim;
  }
}

export function getBuildingTrimMaterial(
  trimPalette: BuildingPaletteId,
): THREE.MeshStandardMaterial {
  switch (trimPalette) {
    case 'terracotta':
      return VENICE_MATERIALS.stuccoTerracottaDeep;
    case 'ochre':
      return VENICE_MATERIALS.stuccoOchreDeep;
    case 'warm_brick':
      return VENICE_MATERIALS.brickBrownstone;
    case 'sage_trim':
      return VENICE_MATERIALS.stuccoSageTrim;
    case 'cream_limestone':
    default:
      return VENICE_MATERIALS.stuccoCreamLimestone;
  }
}

/**
 * Shared, GPU-reused Sunlit Toybox Material Palette for Curbside Links.
 * Preserves ALL historical keys used by props while upgrading colors/roughness
 * for Walkabout: Venice warmth and Coffee Golf surface clarity.
 */
export const TOYBOX_MATERIALS = {
  // === Streets, Sidewalks & Storm-Drain Gutters ===
  asphaltBlacktop: VENICE_MATERIALS.asphaltRoadSlate,
  asphaltDarkGutter: VENICE_MATERIALS.gutterConcreteChannel,
  limestoneSidewalk: VENICE_MATERIALS.sidewalkLimestone,
  limestoneCurb: VENICE_MATERIALS.graniteCurbStone,
  limestoneTrim: VENICE_MATERIALS.graniteCurbBevelTop,
  plazaPaverWarm: VENICE_MATERIALS.courtyardPaver,
  plazaPaverCool: VENICE_MATERIALS.courtyardTerraceSideStone,
  plazaGrout: VENICE_MATERIALS.graniteCurbJoint,
  plazaTerracottaInlay: VENICE_MATERIALS.subwayBrickPlaza,
  poolCopingStone: VENICE_MATERIALS.stuccoCreamLimestone,
  poolWallLimestone: VENICE_MATERIALS.stuccoCreamDeep,
  tactileAdaPad: toonMat('#F5B82E', { emissive: '#D97706', emissiveIntensity: 0.08 }),
  crosswalkAmber: VENICE_MATERIALS.loadingZoneAmber,
  roadMarkingWhite: VENICE_MATERIALS.crosswalkWhite,
  stormDrainSteel: matteMat('#5B6778', { roughness: 0.5, metalness: 0.24 }),
  gutterWaterTrickle: VENICE_MATERIALS.gutterWetWaterSheen,

  // === Legacy Cutaway Plinth Keys (kept for compatibility) ===
  plinthEarthCutaway: toonMat('#A56343'),
  plinthStrataMid: toonMat('#7A482C'),
  plinthWalnutBase: toonMat('#55301C'),
  plinthRimLip: toonMat('#E8D7BE'),
  plinthBrassPlaque: matteMat('#F59E0B', {
    roughness: 0.38,
    metalness: 0.32,
    emissive: '#D97706',
    emissiveIntensity: 0.14,
  }),

  // === Terracotta, Brownstone & Facade Accents ===
  terracottaBrick: VENICE_MATERIALS.stuccoTerracotta,
  terracottaDeep: VENICE_MATERIALS.brickBrownstoneDeep,
  terracottaTerrace: VENICE_MATERIALS.stuccoTerracottaDeep,
  pastelPeach: toonMat('#F5BC9C'),
  pastelCream: VENICE_MATERIALS.stuccoCreamLimestone,
  pastelSage: VENICE_MATERIALS.stuccoSageTrim,
  pastelCoral: toonMat('#E5866F'),
  pastelLavender: toonMat('#C9BFE3'),
  roofTarDeck: VENICE_MATERIALS.roofTarFlat,
  roofSlate: VENICE_MATERIALS.roofMansardSlate,
  windowWarmGlow: VENICE_MATERIALS.windowWarmLit,
  windowSkyGlass: matteMat('#BAE6FD', {
    roughness: 0.32,
    metalness: 0.16,
    emissive: '#7DD3FC',
    emissiveIntensity: 0.16,
  }),

  // === Emerald AstroTurf Parklets, Cedar & Foliage ===
  turfEmerald: VENICE_MATERIALS.puttingGreenTurf,
  turfStripeLight: matteMat('#5FD056', { roughness: 0.86, metalness: 0.0 }),
  turfFringe: VENICE_MATERIALS.puttingGreenFringe,
  cedarWood: VENICE_MATERIALS.pergolaCedar,
  cedarDark: matteMat('#5E3720', { roughness: 0.8, metalness: 0.03 }),
  foliageEmerald: matteMat('#3FA84E', { roughness: 0.76, metalness: 0.02, flatShading: true }),
  foliageSunny: matteMat('#84CC16', { roughness: 0.74, metalness: 0.02, flatShading: true }),
  foliagePeach: matteMat('#FB923C', { roughness: 0.74, metalness: 0.02, flatShading: true }),
  treeTrunk: matteMat('#6E432A', { roughness: 0.86, metalness: 0.02, flatShading: true }),
  flowerCoral: VENICE_MATERIALS.flowerBoxBlossomCoral,

  // === Whimsical Toybox Props & Vehicles ===
  taxiAmber: toonMat('#FACC15', { emissive: '#D97706', emissiveIntensity: 0.08 }),
  hydrantCoral: toonMat('#EF4444', { emissive: '#B91C1C', emissiveIntensity: 0.08 }),
  hydrantBonnet: toonMat('#DC2626'),
  awningCoral: matteMat('#EE4B3E', { roughness: 0.78, metalness: 0.02 }),
  awningCream: matteMat('#FDFBF4', { roughness: 0.78, metalness: 0.02 }),
  awningMint: toonMat('#2DD4BF'),
  awningMintDeep: toonMat('#0F766E'),
  awningNavy: toonMat('#1E3A8A'),
  hotdogBun: toonMat('#EAB308'),
  hotdogSausage: toonMat('#B91C1C'),
  brassAccent: matteMat('#F59E0B', {
    roughness: 0.38,
    metalness: 0.32,
    emissive: '#D97706',
    emissiveIntensity: 0.14,
  }),
  chromeSilver: matteMat('#E5ECF4', { roughness: 0.36, metalness: 0.32 }),
  darkIron: VENICE_MATERIALS.wroughtIron,
  galvanizedSteel: matteMat('#9BAAB9', { roughness: 0.46, metalness: 0.26 }),
  copperAccent: matteMat('#CD8158', { roughness: 0.42, metalness: 0.28 }),
  tireRubber: toonMat('#363B46'),
  hubcapCream: toonMat('#F3ECE0'),

  // Scaffolding & Subway
  scaffoldingSteel: matteMat('#6E7F94', { roughness: 0.48, metalness: 0.24 }),
  scaffoldingDeckWood: matteMat('#C78D56', { roughness: 0.82, metalness: 0.02 }),
  scaffoldingSafetyAmber: toonMat('#F59E0B'),
  subwayIronGreen: matteMat('#24664E', { roughness: 0.54, metalness: 0.18 }),
  subwayGlobeGreen: matteMat('#4ADE80', {
    roughness: 0.28,
    metalness: 0.05,
    emissive: '#22C55E',
    emissiveIntensity: 0.6,
  }),
  grateWarmUnder: new THREE.MeshBasicMaterial({ color: '#FF9E5E' }),

  // Delivery Box Van
  vanCreamBody: toonMat('#FFFBEB'),
  vanMintStripe: toonMat('#14B8A6'),
  vanNavyCab: toonMat('#2563EB'),
  vanRoofBounceDeck: toonMat('#34D399'),

  // Bistro Set
  bistroTableTop: toonMat('#FAF5E8'),
  bistroCastIron: matteMat('#464B57', {
    roughness: 0.62,
    metalness: 0.14,
    emissive: '#23262E',
    emissiveIntensity: 0.05,
  }),

  // Fountain & Water Hazard
  turquoiseWater: matteMat('#2DD4BF', {
    roughness: 0.26,
    metalness: 0.1,
    emissive: '#0EA5E9',
    emissiveIntensity: 0.22,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  }),
  turquoiseWaterDeep: toonMat('#0F766E'),
  waterBeadCyan: matteMat('#74ECFA', {
    roughness: 0.28,
    metalness: 0.06,
    emissive: '#22D3EE',
    emissiveIntensity: 0.28,
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
  }),
  waterFoamWhite: new THREE.MeshBasicMaterial({
    color: '#F0FDFA',
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  }),
  lilyPadGreen: toonMat('#34D399'),
  lilyPadDeep: toonMat('#059669'),
  lilyBlossomPink: toonMat('#FB7185', { emissive: '#F43F5E', emissiveIntensity: 0.14 }),
  steamColumnWhite: createSoftSteamMaterial({
    color: '#FFFDF9',
    emissive: '#FFF5E6',
    emissiveIntensity: 0.28,
    opacity: 0.34,
    roughness: 0.92,
    fresnelPower: 1.8,
    nearFadeStart: 1.65,
    nearFadeEnd: 3.2,
  }),

  // Pigeons
  pigeonBody: matteMat('#94A3B8', { roughness: 0.65, metalness: 0.04, flatShading: true }),
  pigeonWing: matteMat('#64748B', { roughness: 0.65, metalness: 0.04, flatShading: true }),
  pigeonNeck: matteMat('#5EEAD4', { roughness: 0.38, metalness: 0.2 }),
  pigeonBeakFeet: toonMat('#FB923C'),

  // Cups & Flags
  cupHoleDark: new THREE.MeshBasicMaterial({ color: '#0F172A' }),
  cupRimWhite: matteMat('#FFFFFF', { roughness: 0.36, metalness: 0.05 }),
  cupSunkCheck: matteMat('#FDE047', {
    roughness: 0.34,
    metalness: 0.18,
    emissive: '#FACC15',
    emissiveIntensity: 0.45,
  }),
  flagPoleWhite: matteMat('#FFFDF7', { roughness: 0.34, metalness: 0.1 }),
  flagSunkGhost: matteMat('#CBD5E1', {
    roughness: 0.55,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
  bulbWarmGlow: VENICE_MATERIALS.stringLightBulbGlow,

  // Sky & Distant Horizon
  cloudSoft: new THREE.MeshBasicMaterial({ color: '#FFFDF7', fog: false }),
  skylineNear: VENICE_MATERIALS.skylineTerracotta,
  skylineFar: VENICE_MATERIALS.skylineLimestone,

  // QA Inspector Wireframe / Grid Overlays
  qaColliderWireframe: new THREE.MeshBasicMaterial({
    color: '#06B6D4',
    wireframe: true,
    transparent: true,
    opacity: 0.82,
  }),
  qaBoundsWireframe: new THREE.MeshBasicMaterial({
    color: '#F43F5E',
    wireframe: true,
    transparent: true,
    opacity: 0.78,
  }),
  qaSensorWireframe: new THREE.MeshBasicMaterial({
    color: '#FACC15',
    wireframe: true,
    transparent: true,
    opacity: 0.75,
  }),
} as const;

export type ToyboxFlagColor = 'red' | 'yellow' | 'blue' | 'purple' | 'green';

export const FLAG_COLOR_MATERIALS: Record<
  ToyboxFlagColor,
  {
    banner: THREE.MeshStandardMaterial;
    halo: THREE.MeshBasicMaterial;
    hex: string;
  }
> = {
  red: {
    hex: '#EF4444',
    banner: matteMat('#EF4444', {
      roughness: 0.36,
      metalness: 0.04,
      emissive: '#DC2626',
      emissiveIntensity: 0.34,
      side: THREE.DoubleSide,
    }),
    halo: new THREE.MeshBasicMaterial({
      color: '#EF4444',
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  },
  yellow: {
    hex: '#FACC15',
    banner: matteMat('#FACC15', {
      roughness: 0.36,
      metalness: 0.04,
      emissive: '#EA8C00',
      emissiveIntensity: 0.36,
      side: THREE.DoubleSide,
    }),
    halo: new THREE.MeshBasicMaterial({
      color: '#FACC15',
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  },
  blue: {
    hex: '#3B82F6',
    banner: matteMat('#3B82F6', {
      roughness: 0.36,
      metalness: 0.04,
      emissive: '#2563EB',
      emissiveIntensity: 0.34,
      side: THREE.DoubleSide,
    }),
    halo: new THREE.MeshBasicMaterial({
      color: '#3B82F6',
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  },
  purple: {
    hex: '#A855F7',
    banner: matteMat('#A855F7', {
      roughness: 0.36,
      metalness: 0.04,
      emissive: '#9333EA',
      emissiveIntensity: 0.34,
      side: THREE.DoubleSide,
    }),
    halo: new THREE.MeshBasicMaterial({
      color: '#A855F7',
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  },
  green: {
    hex: '#10B981',
    banner: matteMat('#10B981', {
      roughness: 0.36,
      metalness: 0.04,
      emissive: '#059669',
      emissiveIntensity: 0.38,
      side: THREE.DoubleSide,
    }),
    halo: new THREE.MeshBasicMaterial({
      color: '#10B981',
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  },
};

export const CONFETTI_TOYBOX_MATERIALS = [
  new THREE.MeshBasicMaterial({ color: '#EF4444', side: THREE.DoubleSide }),
  new THREE.MeshBasicMaterial({ color: '#FACC15', side: THREE.DoubleSide }),
  new THREE.MeshBasicMaterial({ color: '#3B82F6', side: THREE.DoubleSide }),
  new THREE.MeshBasicMaterial({ color: '#A855F7', side: THREE.DoubleSide }),
  new THREE.MeshBasicMaterial({ color: '#10B981', side: THREE.DoubleSide }),
  new THREE.MeshBasicMaterial({ color: '#FFFDF7', side: THREE.DoubleSide }),
];
