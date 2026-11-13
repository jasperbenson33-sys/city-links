import * as THREE from 'three';

/**
 * Shared 4-band sunlit toon ramp texture.
 * Using RGBAFormat + NearestFilter gives crisp Coffee-Golf-style plane separation
 * while keeping shadowed faces bright, warm, and legible on mobile GPUs.
 */
function createSunlitToonGradientMap(): THREE.DataTexture {
  const stops = [178, 206, 234, 255];
  const data = new Uint8Array(stops.length * 4);
  for (let i = 0; i < stops.length; i++) {
    const v = stops[i];
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, stops.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
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
  }
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
    // Note: MeshToonMaterial calculates flat normals cleanly if flatShading is desired via geometry or standard
  });
}

function matteMat(
  color: string,
  opts?: {
    roughness?: number;
    metalness?: number;
    emissive?: string;
    emissiveIntensity?: number;
    flatShading?: boolean;
    side?: THREE.Side;
    transparent?: boolean;
    opacity?: number;
    depthWrite?: boolean;
  }
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts?.roughness ?? 0.78,
    metalness: opts?.metalness ?? 0.03,
    emissive: opts?.emissive ?? '#000000',
    emissiveIntensity: opts?.emissiveIntensity ?? 0,
    flatShading: opts?.flatShading ?? false,
    side: opts?.side ?? THREE.FrontSide,
    transparent: opts?.transparent ?? false,
    opacity: opts?.opacity ?? 1,
    depthWrite: opts?.depthWrite ?? true,
  });
}

/**
 * Shared, GPU-reused Sunlit Toybox Material Palette for Curbside Links.
 * Zero per-frame allocations — every tile, prop, cup, and cutaway plinth
 * references these static module-level instances.
 */
export const TOYBOX_MATERIALS = {
  // === Streets, Sidewalks & Storm-Drain Gutters ===
  asphaltBlacktop: toonMat('#383E4D'),
  asphaltDarkGutter: toonMat('#252A36'),
  limestoneSidewalk: toonMat('#F3E6D0'),
  limestoneCurb: toonMat('#DDD0BA'),
  limestoneTrim: toonMat('#FAF2E3'),
  plazaPaverWarm: toonMat('#EAD8BF'),
  plazaPaverCool: toonMat('#DFD4C4'),
  plazaGrout: toonMat('#CBBAA2'),
  plazaTerracottaInlay: toonMat('#CF7253'),
  poolCopingStone: toonMat('#FBF5EB'),
  poolWallLimestone: toonMat('#CFC0AA'),
  tactileAdaPad: toonMat('#FBBF24', { emissive: '#D97706', emissiveIntensity: 0.08 }),
  crosswalkAmber: toonMat('#FACC15', { emissive: '#B45309', emissiveIntensity: 0.1 }),
  roadMarkingWhite: toonMat('#FFFDF5'),
  stormDrainSteel: matteMat('#475569', { roughness: 0.45, metalness: 0.55 }),
  gutterWaterTrickle: matteMat('#38BDF8', {
    roughness: 0.18,
    metalness: 0.1,
    emissive: '#0EA5E9',
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.85,
  }),

  // === Architectural Cutaway Plinth (under 48m x 48m Island) ===
  plinthEarthCutaway: toonMat('#A56343'),
  plinthStrataMid: toonMat('#7A482C'),
  plinthWalnutBase: toonMat('#55301C'),
  plinthRimLip: toonMat('#E8D7BE'),
  plinthBrassPlaque: matteMat('#F59E0B', {
    roughness: 0.28,
    metalness: 0.72,
    emissive: '#D97706',
    emissiveIntensity: 0.14,
  }),

  // === Terracotta, Brownstone & Low-Profile Corner Accents ===
  terracottaBrick: toonMat('#C86446'),
  terracottaDeep: toonMat('#A14930'),
  terracottaTerrace: toonMat('#D9835D'),
  pastelPeach: toonMat('#F5BC9C'),
  pastelCream: toonMat('#F8EAD4'),
  pastelSage: toonMat('#9BCBB8'),
  pastelCoral: toonMat('#E5866F'),
  pastelLavender: toonMat('#C9BFE3'),
  roofTarDeck: toonMat('#5A6070'),
  roofSlate: toonMat('#454C5C'),
  windowWarmGlow: matteMat('#FFF3C4', {
    roughness: 0.28,
    metalness: 0.08,
    emissive: '#FFD580',
    emissiveIntensity: 0.48,
  }),
  windowSkyGlass: matteMat('#BAE6FD', {
    roughness: 0.18,
    metalness: 0.28,
    emissive: '#7DD3FC',
    emissiveIntensity: 0.16,
  }),

  // === Emerald AstroTurf Parklets, Cedar & Foliage ===
  turfEmerald: toonMat('#22C55E'),
  turfStripeLight: toonMat('#4ADE80'),
  turfFringe: toonMat('#16A34A'),
  cedarWood: toonMat('#C27849'),
  cedarDark: toonMat('#965632'),
  foliageEmerald: matteMat('#34D399', { roughness: 0.74, metalness: 0.02, flatShading: true }),
  foliageSunny: matteMat('#84CC16', { roughness: 0.74, metalness: 0.02, flatShading: true }),
  foliagePeach: matteMat('#FB923C', { roughness: 0.74, metalness: 0.02, flatShading: true }),
  treeTrunk: toonMat('#764930'),
  flowerCoral: toonMat('#FB7185'),

  // === Whimsical Toybox Props & Vehicles ===
  taxiAmber: toonMat('#FACC15', { emissive: '#D97706', emissiveIntensity: 0.08 }),
  hydrantCoral: toonMat('#EF4444', { emissive: '#B91C1C', emissiveIntensity: 0.08 }),
  hydrantBonnet: toonMat('#DC2626'),
  awningCoral: toonMat('#F04438'),
  awningCream: toonMat('#FFFDF7'),
  awningMint: toonMat('#2DD4BF'),
  awningMintDeep: toonMat('#0F766E'),
  awningNavy: toonMat('#1E3A8A'),
  hotdogBun: toonMat('#EAB308'),
  hotdogSausage: toonMat('#B91C1C'),
  brassAccent: matteMat('#F59E0B', {
    roughness: 0.26,
    metalness: 0.74,
    emissive: '#D97706',
    emissiveIntensity: 0.14,
  }),
  chromeSilver: matteMat('#E2E8F0', { roughness: 0.24, metalness: 0.78 }),
  darkIron: matteMat('#272C36', { roughness: 0.48, metalness: 0.56 }),
  galvanizedSteel: matteMat('#94A3B8', { roughness: 0.36, metalness: 0.62 }),
  copperAccent: matteMat('#C8784E', { roughness: 0.34, metalness: 0.66 }),
  tireRubber: toonMat('#1F242D'),
  hubcapCream: toonMat('#F8FAFC'),

  // Scaffolding & Subway
  scaffoldingSteel: matteMat('#64748B', { roughness: 0.4, metalness: 0.58 }),
  scaffoldingDeckWood: toonMat('#D99B5E'),
  scaffoldingSafetyAmber: toonMat('#F59E0B'),
  subwayIronGreen: matteMat('#1E5B45', { roughness: 0.52, metalness: 0.36 }),
  subwayGlobeGreen: matteMat('#4ADE80', {
    roughness: 0.22,
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
  bistroTableTop: toonMat('#FFFDF7'),
  bistroCastIron: matteMat('#1F2937', { roughness: 0.46, metalness: 0.55 }),

  // Fountain & Water Hazard
  turquoiseWater: matteMat('#2DD4BF', {
    roughness: 0.16,
    metalness: 0.12,
    emissive: '#0EA5E9',
    emissiveIntensity: 0.22,
    transparent: true,
    opacity: 0.86,
  }),
  turquoiseWaterDeep: toonMat('#0F766E'),
  waterBeadCyan: matteMat('#67E8F9', {
    roughness: 0.15,
    metalness: 0.1,
    emissive: '#22D3EE',
    emissiveIntensity: 0.35,
  }),
  waterFoamWhite: new THREE.MeshBasicMaterial({
    color: '#F0FDFA',
    transparent: true,
    opacity: 0.88,
  }),
  lilyPadGreen: toonMat('#34D399'),
  lilyPadDeep: toonMat('#059669'),
  lilyBlossomPink: toonMat('#FB7185', { emissive: '#F43F5E', emissiveIntensity: 0.14 }),
  steamColumnWhite: matteMat('#FFFFFF', {
    roughness: 0.9,
    metalness: 0.0,
    emissive: '#FFF7ED',
    emissiveIntensity: 0.28,
    transparent: true,
    opacity: 0.78,
  }),

  // Pigeons
  pigeonBody: matteMat('#94A3B8', { roughness: 0.65, metalness: 0.04, flatShading: true }),
  pigeonWing: matteMat('#64748B', { roughness: 0.65, metalness: 0.04, flatShading: true }),
  pigeonNeck: matteMat('#5EEAD4', { roughness: 0.38, metalness: 0.25 }),
  pigeonBeakFeet: toonMat('#FB923C'),

  // Cups & Flags
  cupHoleDark: new THREE.MeshBasicMaterial({ color: '#0F172A' }),
  cupRimWhite: toonMat('#FFFFFF'),
  cupSunkCheck: matteMat('#FDE047', {
    roughness: 0.3,
    metalness: 0.2,
    emissive: '#FACC15',
    emissiveIntensity: 0.45,
  }),
  flagPoleWhite: matteMat('#FFFFFF', { roughness: 0.28, metalness: 0.16 }),
  flagSunkGhost: matteMat('#CBD5E1', {
    roughness: 0.55,
    transparent: true,
    opacity: 0.48,
    side: THREE.DoubleSide,
  }),
  bulbWarmGlow: new THREE.MeshBasicMaterial({ color: '#FEF08A' }),

  // Sky & Distant Horizon
  cloudSoft: new THREE.MeshBasicMaterial({ color: '#FFFFFF', fog: false }),
  skylineNear: new THREE.MeshBasicMaterial({ color: '#E9B8A6', fog: false }),
  skylineFar: new THREE.MeshBasicMaterial({ color: '#F3CDBB', fog: false }),

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
