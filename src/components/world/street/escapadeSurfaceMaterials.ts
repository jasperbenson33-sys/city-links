import * as THREE from 'three';
import type { EscapadeMaterialVariant } from '@/types/course';
import { VENICE_MATERIALS } from '@/materials';

function createCanvasTex(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  repeat = 1,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

function buildCobbleHillMaterial(): THREE.MeshStandardMaterial {
  const mat = VENICE_MATERIALS.patioRoughStone.clone();
  mat.color.set('#FFFFFF');
  mat.roughness = 0.86;
  mat.metalness = 0.04;
  mat.flatShading = false;
  const tex = createCanvasTex(256, (ctx, size) => {
    ctx.fillStyle = '#6A655D';
    ctx.fillRect(0, 0, size, size);
    const cols = 5;
    const rows = 5;
    const cw = size / cols;
    const ch = size / rows;
    const shades = ['#A79C8D', '#998E7F', '#B3A89A', '#8D8274', '#9F9485'];
    for (let r = 0; r < rows; r++) {
      const stagger = (r % 2) * (cw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const x = c * cw + stagger + 3;
        const y = r * ch + 3;
        const w = cw - 6;
        const h = ch - 6;
        ctx.fillStyle = shades[(r * 7 + c + 15) % shades.length];
        ctx.beginPath();
        ctx.roundRect?.(x, y, w, h, 7);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 245, 226, 0.14)';
        ctx.fillRect(x + 3, y + 3, w - 6, 4);
      }
    }
  });
  if (tex) mat.map = tex;
  return mat;
}

function hashUint32(x: number, seed: number): number {
  let h = Math.imul(x + 1, seed) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function buildRooftopDeckMaterial(): THREE.MeshStandardMaterial {
  const tex = createCanvasTex(256, (ctx, size) => {
    ctx.fillStyle = '#56525A';
    ctx.fillRect(0, 0, size, size);
    const gravelTones = ['#49464E', '#5F5B64', '#434048', '#504C55'];
    for (let i = 0; i < 420; i++) {
      const hx = hashUint32(i, 0x9e3779b1);
      const hy = hashUint32(i + 4099, 0xc2b2ae35);
      const x = hx % size;
      const y = hy % size;
      const sz = 2 + ((hx >>> 12) & 1);
      ctx.fillStyle = gravelTones[(hy >>> 8) % gravelTones.length]!;
      ctx.fillRect(x, y, sz, sz);
    }
    ctx.strokeStyle = 'rgba(220, 210, 198, 0.14)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  });
  return new THREE.MeshStandardMaterial({
    color: tex ? '#FFFFFF' : '#56525A',
    map: tex,
    roughness: 0.9,
    metalness: 0.04,
  });
}

function buildTimberPlankMaterial(): THREE.MeshStandardMaterial {
  const tex = createCanvasTex(256, (ctx, size) => {
    ctx.fillStyle = '#734B2D';
    ctx.fillRect(0, 0, size, size);
    const planks = 6;
    const ph = size / planks;
    const tones = ['#A67249', '#9B6842', '#B17B51', '#8F5E3B'];
    for (let i = 0; i < planks; i++) {
      const y = i * ph + 2;
      ctx.fillStyle = tones[i % tones.length];
      ctx.fillRect(0, y, size, ph - 4);
      ctx.fillStyle = 'rgba(70, 42, 22, 0.22)';
      ctx.fillRect(hashUint32(i, 0x9e3779b1) % size, y, 2, ph - 4);
      ctx.fillStyle = 'rgba(255, 232, 200, 0.1)';
      ctx.fillRect(0, y + 2, size, 3);
    }
  });
  return new THREE.MeshStandardMaterial({
    color: tex ? '#FFFFFF' : '#A67249',
    map: tex,
    roughness: 0.82,
    metalness: 0.03,
  });
}

function buildViaductLimestoneMaterial(): THREE.MeshStandardMaterial {
  const tex = createCanvasTex(256, (ctx, size) => {
    ctx.fillStyle = '#C9B99D';
    ctx.fillRect(0, 0, size, size);
    const rows = 4;
    const cols = 2;
    const rw = size / cols;
    const rh = size / rows;
    const stones = ['#E4D7BE', '#DDD0B6', '#E9DEC8', '#D7C8AC'];
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (rw * 0.5);
      for (let c = -1; c <= cols; c++) {
        ctx.fillStyle = stones[(r * 3 + c + 8) % stones.length];
        ctx.fillRect(c * rw + off + 2, r * rh + 2, rw - 4, rh - 4);
      }
    }
  });
  return new THREE.MeshStandardMaterial({
    color: tex ? '#FFFFFF' : '#E2D4BA',
    map: tex,
    roughness: 0.84,
    metalness: 0.02,
  });
}

function buildBeauxArtsGraniteMaterial(): THREE.MeshStandardMaterial {
  const tex = createCanvasTex(256, (ctx, size) => {
    ctx.fillStyle = '#BFB6AD';
    ctx.fillRect(0, 0, size, size);
    const step = 64;
    const slabs = ['#DCD3C8', '#D6CCC0', '#E2DAD0', '#CFC5B9'];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = slabs[(r * 5 + c) % slabs.length];
        ctx.fillRect(c * step + 2, r * step + 2, step - 4, step - 4);
      }
    }
  });
  return new THREE.MeshStandardMaterial({
    color: tex ? '#FFFFFF' : '#DAD0C5',
    map: tex,
    roughness: 0.78,
    metalness: 0.04,
  });
}

function buildSubwayCeramicTileMaterial(): THREE.MeshStandardMaterial {
  const tex = createCanvasTex(256, (ctx, size) => {
    ctx.fillStyle = '#B8BFB4';
    ctx.fillRect(0, 0, size, size);
    const n = 4;
    const s = size / n;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const isBorderAccent = (r === 0 || c === 0) && (r + c) % 2 === 0;
        ctx.fillStyle = isBorderAccent ? '#2F7D63' : '#EFECE2';
        ctx.fillRect(c * s + 2, r * s + 2, s - 4, s - 4);
      }
    }
  });
  return new THREE.MeshStandardMaterial({
    color: tex ? '#FFFFFF' : '#EFECE2',
    map: tex,
    roughness: 0.42,
    metalness: 0.06,
  });
}

let cache: Partial<Record<EscapadeMaterialVariant, THREE.MeshStandardMaterial>> | null =
  null;

export function getEscapadeSurfaceMaterial(
  variant?: EscapadeMaterialVariant,
): THREE.MeshStandardMaterial | null {
  if (!variant) return null;
  if (!cache) {
    cache = {
      cobblestone_hill: buildCobbleHillMaterial(),
      tenement_rooftop_deck: buildRooftopDeckMaterial(),
      timber_bridge_plank: buildTimberPlankMaterial(),
      viaduct_limestone: buildViaductLimestoneMaterial(),
      copper_chute_metal: new THREE.MeshStandardMaterial({
        color: '#4DA693',
        roughness: 0.36,
        metalness: 0.42,
      }),
      beaux_arts_granite: buildBeauxArtsGraniteMaterial(),
      subway_ceramic_tile: buildSubwayCeramicTileMaterial(),
      subway_car_floor: (() => {
        const m = buildTimberPlankMaterial();
        m.color.set('#D2A46E');
        m.roughness = 0.68;
        m.polygonOffset = true;
        m.polygonOffsetFactor = -1;
        m.polygonOffsetUnits = -1;
        return m;
      })(),
    };
  }
  return cache[variant] ?? null;
}
