import * as THREE from 'three';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function hash2D(x: number, y: number, seed = 1337): number {
  let n =
    Math.imul(x, 374761393) +
    Math.imul(y, 668265263) +
    Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

/**
 * Seamlessly tileable, band-limited 2D value noise evaluated on a periodic grid.
 * Prevents 1-texel Nyquist white-noise mipmap shimmer during diagonal camera pans & fast flights.
 */
function periodicValueNoise2D(
  px: number,
  py: number,
  texSize: number,
  cellSize: number,
  seed: number,
): number {
  const gridCount = Math.max(1, Math.round(texSize / cellSize));
  const gx = (px / texSize) * gridCount;
  const gy = (py / texSize) * gridCount;
  const ix0 = Math.floor(gx);
  const iy0 = Math.floor(gy);
  const fx = gx - ix0;
  const fy = gy - iy0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const wrap = (i: number) => ((i % gridCount) + gridCount) % gridCount;
  const x0 = wrap(ix0);
  const x1 = wrap(ix0 + 1);
  const y0 = wrap(iy0);
  const y1 = wrap(iy0 + 1);

  const n00 = hash2D(x0, y0, seed);
  const n10 = hash2D(x1, y0, seed);
  const n01 = hash2D(x0, y1, seed);
  const n11 = hash2D(x1, y1, seed);

  const nx0 = n00 + (n10 - n00) * ux;
  const nx1 = n01 + (n11 - n01) * ux;
  return nx0 + (nx1 - nx0) * uy;
}

/**
 * Symmetric distance from texel center `(lx + 0.5)` to the nearest cell boundary in `[0, cellSpan]`.
 * Guarantees centered, seamlessly wrapped mortar/grout joints with zero 1-texel cliff edges.
 */
function edgeDistanceInCell(localCoord: number, cellSpan: number): number {
  const c = localCoord + 0.5;
  return Math.min(c, cellSpan - c);
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
  // 16x hardware anisotropic filtering (clamped automatically by WebGL2 to maxAnisotropy)
  // keeps oblique grout lines, stripes, and aggregate stable with zero crawl during pans.
  tex.anisotropy = 16;
  if (opts?.repeat) {
    tex.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  tex.needsUpdate = true;
  return tex;
}

/**
 * Warm Venetian limestone courtyard ashlar pavers (256x256 tileable, chamfer-antialiased joints).
 */
export function createCourtyardPaverTexture(): THREE.DataTexture {
  const size = 256;
  const cell = 64;
  const tones = [
    hexToRgb('#F3E4CA'),
    hexToRgb('#EDE0C6'),
    hexToRgb('#F6EAD3'),
    hexToRgb('#E7D7B9'),
  ];
  const grout = hexToRgb('#DBCBB0');

  return makeDataTexture(size, (x, y) => {
    const row = Math.floor(y / cell);
    const offsetX = (row % 2) * (cell / 2);
    const tx = (x + offsetX) % size;
    const col = Math.floor(tx / cell);
    const lx = tx % cell;
    const ly = y % cell;

    const minEdge = Math.min(
      edgeDistanceInCell(lx, cell),
      edgeDistanceInCell(ly, cell),
    );
    const stoneMask = smoothstep(1.0, 4.2, minEdge);
    const bevelHighlight =
      smoothstep(2.2, 4.8, minEdge) * (1 - smoothstep(4.8, 8.2, minEdge)) * 3.0;

    const tone = tones[(row * 3 + col * 5) % tones.length]!;
    const grain =
      (periodicValueNoise2D(x, y, size, 4, 71) - 0.5) * 6.0 +
      (periodicValueNoise2D(x, y, size, 16, 173) - 0.5) * 4.0;
    const stone: [number, number, number] = [
      tone[0] + grain + bevelHighlight,
      tone[1] + grain + bevelHighlight,
      tone[2] + grain + bevelHighlight,
    ];
    return lerp3(grout, stone, stoneMask);
  });
}

/**
 * Crisp sunlit sidewalk limestone flagstone grid (256x256 tileable, smoothstepped joints).
 */
export function createSidewalkFlagstoneTexture(): THREE.DataTexture {
  const size = 256;
  const cell = 128;
  const baseA = hexToRgb('#F0E3CC');
  const baseB = hexToRgb('#E9DAC1');
  const joint = hexToRgb('#CEC0A7');

  return makeDataTexture(size, (x, y) => {
    const cellX = Math.floor(x / cell);
    const cellY = Math.floor(y / cell);
    const lx = x % cell;
    const ly = y % cell;

    const minEdge = Math.min(
      edgeDistanceInCell(lx, cell),
      edgeDistanceInCell(ly, cell),
    );
    const stoneMask = smoothstep(1.2, 3.5, minEdge);
    const bevel =
      smoothstep(2.2, 4.6, minEdge) * (1 - smoothstep(4.6, 8.5, minEdge)) * 3.5;

    const base = (cellX + cellY) % 2 === 0 ? baseA : baseB;
    const speck =
      (periodicValueNoise2D(x, y, size, 4, 203) - 0.5) * 6.5 +
      (periodicValueNoise2D(x, y, size, 16, 307) - 0.5) * 3.5;
    const stone: [number, number, number] = [
      base[0] + speck + bevel,
      base[1] + speck + bevel,
      base[2] + speck + bevel,
    ];
    return lerp3(joint, stone, stoneMask);
  });
}

/**
 * Warm terracotta/brownstone running-bond brick plaza texture (256x256 tileable, feathered mortar).
 */
export function createSubwayBrickTexture(): THREE.DataTexture {
  const size = 256;
  const brickH = 32;
  const brickW = 64;
  const bricks = [
    hexToRgb('#BA5D43'),
    hexToRgb('#AF533A'),
    hexToRgb('#C4684E'),
    hexToRgb('#A34B34'),
  ];
  const mortar = hexToRgb('#D6C3AB');

  return makeDataTexture(size, (x, y) => {
    const row = Math.floor(y / brickH);
    const tx = (x + (row % 2) * (brickW / 2)) % size;
    const col = Math.floor(tx / brickW);
    const lx = tx % brickW;
    const ly = y % brickH;

    const minEdge = Math.min(
      edgeDistanceInCell(lx, brickW),
      edgeDistanceInCell(ly, brickH),
    );
    const brickMask = smoothstep(1.4, 3.8, minEdge);

    const idx =
      Math.floor(hash2D(col, row, 409) * bricks.length) % bricks.length;
    const tone = bricks[idx]!;
    const grain =
      (periodicValueNoise2D(x, y, size, 4, 511) - 0.5) * 7.0 +
      (periodicValueNoise2D(x, y, size, 8, 613) - 0.5) * 3.5;
    const face: [number, number, number] = [
      tone[0] + grain,
      tone[1] + grain,
      tone[2] + grain,
    ];
    return lerp3(mortar, face, brickMask);
  });
}

/**
 * Crisp Coffee-Golf mowed emerald AstroTurf putting-green stripes (512x512 tileable).
 * Feathered stripe transitions + band-limited turf blade grain eliminate diagonal stripe stair-stepping.
 */
export function createPuttingGreenStripeTexture(): THREE.DataTexture {
  const size = 512;
  const stripeW = 128;
  const darkStripe = hexToRgb('#41B449');
  const lightStripe = hexToRgb('#59CA53');

  return makeDataTexture(size, (x, y) => {
    // Periodic triangle wave across 2*stripeW period -> feathered smoothstep stripe edge
    const period = stripeW * 2;
    const phase = ((x + 0.5) % period) / period; // [0, 1)
    const tri = 1 - Math.abs(phase * 2 - 1) * 2; // [-1, +1], zero-crossings at 0.25 & 0.75
    const feather = 6.5 / stripeW;
    const stripeMix = smoothstep(-feather, feather, tri);

    const base = lerp3(darkStripe, lightStripe, stripeMix);
    const blade =
      (periodicValueNoise2D(x, y, size, 2, 887) - 0.5) * 3.2 +
      (periodicValueNoise2D(x, y, size, 8, 919) - 0.5) * 2.2;
    return [base[0] + blade, base[1] + blade, base[2] + blade];
  });
}

/**
 * Dark slate asphalt roadway aggregate micro-grain (256x256 tileable).
 * Band-limited 2-octave periodic value noise keeps close-up tee road views crisp with zero mip shimmer.
 */
export function createAsphaltAggregateTexture(): THREE.DataTexture {
  const size = 256;
  const base = hexToRgb('#353C49');

  return makeDataTexture(size, (x, y) => {
    const fine = periodicValueNoise2D(x, y, size, 2, 991) - 0.5;
    const med = periodicValueNoise2D(x, y, size, 6, 1049) - 0.5;
    const delta = fine * 5.2 + med * 3.4;
    return [base[0] + delta, base[1] + delta, base[2] + delta];
  });
}

/**
 * Venetian barrel-tile terracotta roof ribbing (256x256 tileable).
 * Smooth cosine barrel ridges + smooth periodic course overlap eliminate oblique roof moiré.
 */
export function createTerracottaRoofTexture(): THREE.DataTexture {
  const size = 256;
  const ridge = hexToRgb('#D3623D');
  const trough = hexToRgb('#AF492A');
  const courseH = 64;

  return makeDataTexture(size, (x, y) => {
    const wave = 0.5 + 0.5 * Math.sin(((x + 0.5) / 32) * Math.PI * 2);
    const ly = y % courseH;
    const edgeDist = edgeDistanceInCell(ly, courseH);
    const lipShadow = (1 - smoothstep(1.2, 5.2, edgeDist)) * -13.0;
    const grain = (periodicValueNoise2D(x, y, size, 4, 773) - 0.5) * 6.0;
    return [
      trough[0] + (ridge[0] - trough[0]) * wave + lipShadow + grain,
      trough[1] + (ridge[1] - trough[1]) * wave + lipShadow + grain,
      trough[2] + (ridge[2] - trough[2]) * wave + lipShadow + grain,
    ];
  });
}

/**
 * Warm Venetian tumbled courtyard cobblestone & mossy-sandstone terrace pavers (256x256 tileable)
 * for `patio_rough` pocket-park rough zones bordering the putting green.
 */
export function createPatioCobblestoneTexture(): THREE.DataTexture {
  const size = 256;
  const rowH = 32;
  const cobbleW = 42.6667; // 6 cobbles per 256px width (exact integer wrap)
  const stones = [
    hexToRgb('#A99780'),
    hexToRgb('#9B8972'),
    hexToRgb('#B4A28A'),
    hexToRgb('#92816B'),
  ];
  const mossMortar = hexToRgb('#6F7E5B');
  const warmMortar = hexToRgb('#847864');

  return makeDataTexture(size, (x, y) => {
    const row = Math.floor(y / rowH);
    const shift = (row % 2) * (cobbleW * 0.5);
    const wx = (x + shift) % size;
    const col = Math.floor(wx / cobbleW) % 6;
    const u = ((wx % cobbleW) + 0.5) / cobbleW - 0.5; // [-0.5, 0.5]
    const v = ((y % rowH) + 0.5) / rowH - 0.5; // [-0.5, 0.5]

    // Rounded superellipse cobble profile so stones read as tumbled Venetian cobbles, not harsh squares
    const superR = Math.pow(
      Math.pow(Math.abs(u) * 2, 3.2) + Math.pow(Math.abs(v) * 2, 3.2),
      1 / 3.2,
    );
    const stoneMask = 1 - smoothstep(0.76, 0.94, superR);
    const domeShade = (1 - superR * superR) * 5.5 - 2.0;

    const stoneIdx =
      Math.floor(hash2D(col, row, 1201) * stones.length) % stones.length;
    const stoneBase = stones[stoneIdx]!;
    const grain = (periodicValueNoise2D(x, y, size, 4, 1303) - 0.5) * 7.5;
    const stoneCol: [number, number, number] = [
      stoneBase[0] + domeShade + grain,
      stoneBase[1] + domeShade + grain,
      stoneBase[2] + domeShade + grain,
    ];

    const mossMix = smoothstep(
      0.38,
      0.68,
      periodicValueNoise2D(x, y, size, 32, 1409),
    );
    const jointCol = lerp3(warmMortar, mossMortar, mossMix * 0.72);
    return lerp3(jointCol, stoneCol, stoneMask);
  });
}

/**
 * Weathered NYC cedar water-tower staves & rooftop timber bridge planks (256x256 tileable, 16x anisotropy).
 */
export function createCedarPlankTexture(): THREE.DataTexture {
  const size = 256;
  const plankW = 32; // 8 planks across 256px
  const plankH = 128; // staggered end joints
  const woods = [
    hexToRgb('#8E5A38'),
    hexToRgb('#835132'),
    hexToRgb('#996340'),
    hexToRgb('#7C4B2D'),
  ];
  const seam = hexToRgb('#59341E');

  return makeDataTexture(size, (x, y) => {
    const col = Math.floor(x / plankW);
    const yShift = (col % 2) * (plankH / 2);
    const wy = (y + yShift) % size;
    const row = Math.floor(wy / plankH);
    const lx = x % plankW;
    const ly = wy % plankH;

    const minEdge = Math.min(
      edgeDistanceInCell(lx, plankW),
      edgeDistanceInCell(ly, plankH) * 1.15,
    );
    const plankMask = smoothstep(0.9, 2.8, minEdge);

    const tone = woods[(col * 3 + row * 5) % woods.length]!;
    // Longitudinal wood grain (fine X, stretched Y) — seamlessly periodic
    const grainStreak =
      (periodicValueNoise2D(x, y, size, 4, 2111) - 0.5) * 8.0 *
        0.55 +
      (periodicValueNoise2D(x, Math.floor(y / 8), 32, 2, 2207) - 0.5) * 9.0;
    const woodCol: [number, number, number] = [
      tone[0] + grainStreak,
      tone[1] + grainStreak * 0.85,
      tone[2] + grainStreak * 0.7,
    ];
    return lerp3(seam, woodCol, plankMask);
  });
}

/**
 * Classic NYC Guastavino / IRT bevel-glazed warm cream ceramic subway tile (256x256 running bond).
 */
export function createCreamSubwayTileTexture(): THREE.DataTexture {
  const size = 256;
  const tileW = 64; // 4 courses wide
  const tileH = 32; // 8 courses tall (2:1 subway brick ratio)
  const glazes = [
    hexToRgb('#F7EFE0'),
    hexToRgb('#F2E8D5'),
    hexToRgb('#FAF3E6'),
    hexToRgb('#EDE2CD'),
  ];
  const mortar = hexToRgb('#CFC2AB');

  return makeDataTexture(size, (x, y) => {
    const row = Math.floor(y / tileH);
    const shift = (row % 2) * (tileW / 2);
    const tx = (x + shift) % size;
    const col = Math.floor(tx / tileW);
    const lx = tx % tileW;
    const ly = y % tileH;

    const minEdge = Math.min(
      edgeDistanceInCell(lx, tileW),
      edgeDistanceInCell(ly, tileH),
    );
    const tileMask = smoothstep(1.0, 3.2, minEdge);
    const glazePillow =
      smoothstep(2.0, 5.2, minEdge) * (1 - smoothstep(5.2, 10.0, minEdge)) * 4.5;

    const tone = glazes[(row * 5 + col * 3) % glazes.length]!;
    const Craquelure = (periodicValueNoise2D(x, y, size, 8, 3109) - 0.5) * 3.5;
    const tileCol: [number, number, number] = [
      tone[0] + glazePillow + Craquelure,
      tone[1] + glazePillow + Craquelure,
      tone[2] + glazePillow + Craquelure,
    ];
    return lerp3(mortar, tileCol, tileMask);
  });
}

/**
 * Classic NYC IRT glazed emerald-jade ceramic subway wainscot & mosaic border tile (256x256).
 */
export function createEmeraldSubwayTileTexture(): THREE.DataTexture {
  const size = 256;
  const tileW = 64;
  const tileH = 32;
  const glazes = [
    hexToRgb('#1F6E58'),
    hexToRgb('#1A614D'),
    hexToRgb('#257A62'),
    hexToRgb('#1D6853'),
  ];
  const mortar = hexToRgb('#C8BFA9');

  return makeDataTexture(size, (x, y) => {
    const row = Math.floor(y / tileH);
    const shift = (row % 2) * (tileW / 2);
    const tx = (x + shift) % size;
    const col = Math.floor(tx / tileW);
    const lx = tx % tileW;
    const ly = y % tileH;

    const minEdge = Math.min(
      edgeDistanceInCell(lx, tileW),
      edgeDistanceInCell(ly, tileH),
    );
    const tileMask = smoothstep(1.0, 3.1, minEdge);
    const glazeHighlight =
      smoothstep(2.2, 5.0, minEdge) * (1 - smoothstep(5.0, 9.5, minEdge)) * 6.0;

    const tone = glazes[(row * 3 + col * 7) % glazes.length]!;
    const depthVar = (periodicValueNoise2D(x, y, size, 8, 3313) - 0.5) * 5.0;
    const tileCol: [number, number, number] = [
      tone[0] + glazeHighlight * 0.7 + depthVar,
      tone[1] + glazeHighlight + depthVar,
      tone[2] + glazeHighlight * 0.85 + depthVar,
    ];
    return lerp3(mortar, tileCol, tileMask);
  });
}

/**
 * Warm ribbed maple & rattan vintage IRT subway coach walkthrough aisle floor (256x256).
 */
export function createSubwayRattanFloorTexture(): THREE.DataTexture {
  const size = 256;
  const slatPitch = 16; // 16 longitudinal floor ribs across 256px
  const mapleLight = hexToRgb('#C9965B');
  const mapleDark = hexToRgb('#A3733E');
  const groove = hexToRgb('#7D552B');

  return makeDataTexture(size, (x, y) => {
    const lx = x % slatPitch;
    const edgeDist = edgeDistanceInCell(lx, slatPitch);
    const ribMask = smoothstep(0.9, 2.8, edgeDist);
    const col = Math.floor(x / slatPitch);
    const base = col % 2 === 0 ? mapleLight : mapleDark;
    const grain = (periodicValueNoise2D(x, y, size, 8, 3517) - 0.5) * 6.0;
    const slatCol: [number, number, number] = [
      base[0] + grain,
      base[1] + grain * 0.9,
      base[2] + grain * 0.75,
    ];
    return lerp3(groove, slatCol, ribMask);
  });
}
