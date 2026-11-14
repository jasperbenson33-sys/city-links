import * as THREE from 'three';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function hash2D(x: number, y: number, seed = 1337): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function makeDataTexture(
  size: number,
  fillPixel: (x: number, y: number) => [number, number, number],
  opts?: { repeat?: [number, number] },
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fillPixel(x, y);
      const idx = (y * size + x) * 4;
      data[idx] = Math.max(0, Math.min(255, Math.round(r)));
      data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  // Anisotropic filtering keeps grout lines & grain stable (no crawl) at glancing orbit angles.
  tex.anisotropy = 8;
  if (opts?.repeat) {
    tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  tex.needsUpdate = true;
  return tex;
}

/**
 * Warm Venetian limestone courtyard ashlar pavers (128x128 tileable).
 */
export function createCourtyardPaverTexture(): THREE.DataTexture {
  const size = 128;
  const tones = [
    hexToRgb('#F3E4CA'),
    hexToRgb('#EDE0C6'),
    hexToRgb('#F6EAD3'),
    hexToRgb('#E6D6B7'),
  ];
  const grout = hexToRgb('#CEBC9F');

  return makeDataTexture(size, (x, y) => {
    const row = Math.floor(y / 32);
    const offsetX = (row % 2) * 16;
    const tx = (x + offsetX) % 128;
    const col = Math.floor(tx / 32);
    const lx = tx % 32;
    const ly = y % 32;

    if (lx < 2 || ly < 2) {
      return grout;
    }
    const tone = tones[(row * 3 + col * 5) % tones.length]!;
    const grain = (hash2D(x >> 1, y >> 1, 71) - 0.5) * 8;
    return [tone[0] + grain, tone[1] + grain, tone[2] + grain];
  });
}

/**
 * Crisp sunlit sidewalk limestone flagstone grid (128x128 tileable).
 */
export function createSidewalkFlagstoneTexture(): THREE.DataTexture {
  const size = 128;
  const baseA = hexToRgb('#F0E3CC');
  const baseB = hexToRgb('#E9DAC0');
  const joint = hexToRgb('#C8B89E');

  return makeDataTexture(size, (x, y) => {
    const cellX = Math.floor(x / 64);
    const cellY = Math.floor(y / 64);
    const lx = x % 64;
    const ly = y % 64;

    if (lx < 2 || ly < 2) {
      return joint;
    }
    const base = (cellX + cellY) % 2 === 0 ? baseA : baseB;
    const speck = (hash2D(x >> 1, y >> 1, 203) - 0.5) * 9;
    return [base[0] + speck, base[1] + speck, base[2] + speck];
  });
}

/**
 * Warm terracotta/brownstone running-bond brick plaza texture (128x128 tileable).
 */
export function createSubwayBrickTexture(): THREE.DataTexture {
  const size = 128;
  const bricks = [
    hexToRgb('#BA5D43'),
    hexToRgb('#AD5037'),
    hexToRgb('#C5694E'),
    hexToRgb('#9F4730'),
  ];
  const mortar = hexToRgb('#D7C4AC');

  return makeDataTexture(size, (x, y) => {
    const brickH = 16;
    const brickW = 32;
    const row = Math.floor(y / brickH);
    const tx = (x + (row % 2) * (brickW / 2)) % 128;
    const col = Math.floor(tx / brickW);
    const lx = tx % brickW;
    const ly = y % brickH;

    if (lx < 2 || ly < 2) {
      return mortar;
    }
    const idx = Math.floor(hash2D(col, row, 409) * bricks.length) % bricks.length;
    const tone = bricks[idx]!;
    const grain = (hash2D(x >> 1, y >> 1, 511) - 0.5) * 10;
    return [tone[0] + grain, tone[1] + grain, tone[2] + grain];
  });
}

/**
 * Crisp Coffee-Golf mowed emerald AstroTurf putting-green stripes (256x256 tileable).
 * Fine per-texel blade grain at gentle natural amplitude paired with 8x anisotropic mipmaps.
 */
export function createPuttingGreenStripeTexture(): THREE.DataTexture {
  const size = 256;
  const darkStripe = hexToRgb('#41B449');
  const lightStripe = hexToRgb('#59CA53');

  return makeDataTexture(size, (x, y) => {
    const band = Math.floor(x / 64) % 2;
    const base = band === 0 ? darkStripe : lightStripe;
    const blade = (hash2D(x, y, 887) - 0.5) * 4.5;
    return [base[0] + blade, base[1] + blade, base[2] + blade];
  });
}

/**
 * Dark slate asphalt roadway aggregate micro-grain (256x256 tileable).
 * Fine per-texel mineral aggregate (1.4cm/texel on 3.6m tile) at gentle amplitude so close-up
 * tee views stay crisp while 8x anisotropic mipmapping prevents distant shimmer.
 */
export function createAsphaltAggregateTexture(): THREE.DataTexture {
  const size = 256;
  const base = hexToRgb('#343B48');

  return makeDataTexture(size, (x, y) => {
    const r = hash2D(x, y, 991);
    const delta = r > 0.88 ? 6.5 : r < 0.12 ? -5.5 : (r - 0.5) * 4.0;
    return [base[0] + delta, base[1] + delta, base[2] + delta];
  });
}

/**
 * Venetian barrel-tile terracotta roof ribbing (128x128 tileable).
 */
export function createTerracottaRoofTexture(): THREE.DataTexture {
  const size = 128;
  const ridge = hexToRgb('#D3623D');
  const trough = hexToRgb('#AE4829');

  return makeDataTexture(size, (x, y) => {
    const wave = 0.5 + 0.5 * Math.sin((x / 16) * Math.PI * 2);
    const rowLip = y % 32 < 3 ? -16 : 0;
    const grain = (hash2D(x >> 1, y >> 1, 773) - 0.5) * 8;
    return [
      trough[0] + (ridge[0] - trough[0]) * wave + rowLip + grain,
      trough[1] + (ridge[1] - trough[1]) * wave + rowLip + grain,
      trough[2] + (ridge[2] - trough[2]) * wave + rowLip + grain,
    ];
  });
}
