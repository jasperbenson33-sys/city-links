import * as THREE from 'three';

/**
 * Shared low-poly Walkabout/Toybox material accents dedicated to Curbside Links props.
 * Allocated once at module load to ensure zero per-frame or per-mount material churn.
 */
export const PROP_ACCENT_MATERIALS = {
  // Hazard Cones & Safety Striping
  safetyConeOrange: new THREE.MeshToonMaterial({ color: '#ff6d24' }),
  safetyConeWhite: new THREE.MeshToonMaterial({ color: '#f8f5ec' }),

  // Sidewalk Chalkboard & Bistro Print
  chalkboardSlate: new THREE.MeshToonMaterial({ color: '#24312d' }),
  chalkCream: new THREE.MeshToonMaterial({ color: '#fff7e2' }),

  // Venice Café Umbrella Palette Variants
  umbrellaOchre: new THREE.MeshToonMaterial({ color: '#ebb238' }),
  umbrellaBurgundy: new THREE.MeshToonMaterial({ color: '#9c353a' }),
  umbrellaTerracotta: new THREE.MeshToonMaterial({ color: '#d66248' }),

  // Scaffolding Masonry & Utility Collars
  terracottaBrickLight: new THREE.MeshToonMaterial({ color: '#c9674e' }),
  mortarCement: new THREE.MeshToonMaterial({ color: '#d6cec0' }),
  concreteCollar: new THREE.MeshToonMaterial({ color: '#b8b0a2' }),

  // Delivery Van Bakery Interior & Ramp
  metalRampSteel: new THREE.MeshStandardMaterial({
    color: '#7d8690',
    roughness: 0.55,
    metalness: 0.45,
  }),
  bakeryCrateWood: new THREE.MeshToonMaterial({ color: '#c98c54' }),
  bakeryBreadCrust: new THREE.MeshToonMaterial({ color: '#d9984a' }),

  // Subway Kiosk, Benches & Planters
  subwayTileCream: new THREE.MeshToonMaterial({ color: '#efe6d4' }),
  subwayTileGreenBand: new THREE.MeshToonMaterial({ color: '#1c6e4a' }),
  subwayTunnelVoid: new THREE.MeshBasicMaterial({ color: '#0e1418' }),
  subwayTunnelArch: new THREE.MeshStandardMaterial({
    color: '#1b242d',
    roughness: 0.78,
    metalness: 0.22,
  }),
  subwayTunnelTreadMid: new THREE.MeshToonMaterial({ color: '#868d96' }),
  subwayTunnelTreadDeep: new THREE.MeshToonMaterial({ color: '#39424e' }),
  subwayWarmGlobe: new THREE.MeshStandardMaterial({
    color: '#fff1c9',
    emissive: '#ffb347',
    emissiveIntensity: 0.95,
    roughness: 0.32,
  }),
  subwaySignDark: new THREE.MeshToonMaterial({ color: '#1b232a' }),
  oakBenchSlats: new THREE.MeshToonMaterial({ color: '#a86b3e' }),
  terracottaPot: new THREE.MeshToonMaterial({ color: '#c66544' }),

  // Golf Bag & Accessory Fabrics
  bagNavy: new THREE.MeshToonMaterial({ color: '#283d5c' }),
  bagCream: new THREE.MeshToonMaterial({ color: '#f7efe0' }),
  bagMint: new THREE.MeshToonMaterial({ color: '#4fc29a' }),
  towelCoral: new THREE.MeshToonMaterial({ color: '#eb5e48' }),

  // Detailed Pigeon Plumage Accents
  pigeonWingBar: new THREE.MeshToonMaterial({ color: '#313a47' }),
  pigeonChestBerry: new THREE.MeshToonMaterial({ color: '#8a5876' }),
} as const;
