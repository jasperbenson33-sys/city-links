/**
 * Deterministic seed & Mulberry32 PRNG utilities for Curbside Links.
 */

/**
 * Returns Today's Daily Seed in canonical UTC `YYYY-MM-DD` format.
 */
export function getTodayDailySeedUTC(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Hashes an arbitrary seed string into a non-zero unsigned 32-bit integer
 * using FNV-1a + Murmur3 finalizer avalanche mixing.
 */
export function hashSeedString(seed: string): number {
  const normalized = String(seed).trim() || 'curbside-default';
  let h = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) || 0x6d2b79f5;
}

/**
 * Canonical deterministic Mulberry32 PRNG returning uniform floats in [0, 1).
 */
export function mulberry32(seedInt: number): () => number {
  let a = seedInt >>> 0;
  if (a === 0) a = 0x6d2b79f5;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a fresh, URL-friendly random city seed (e.g. `city-k8p4m2`).
 */
export function createRandomSeed(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    const bytes = new Uint8Array(6);
    globalThis.crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length; i++) {
      token += alphabet[bytes[i]! % alphabet.length];
    }
  } else {
    for (let i = 0; i < 6; i++) {
      token += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  }
  return `city-${token}`;
}

export interface SeededRng {
  next: () => number;
  range: (min: number, max: number) => number;
  int: (minInclusive: number, maxInclusive: number) => number;
  chance: (probability: number) => boolean;
  pick: <T>(items: readonly T[]) => T;
  shuffle: <T>(items: readonly T[]) => T[];
}

export function createSeededRng(seed: string | number): SeededRng {
  const seedInt = typeof seed === 'number' ? seed >>> 0 : hashSeedString(seed);
  const next = mulberry32(seedInt);

  return {
    next,
    range(min: number, max: number): number {
      return min + (max - min) * next();
    },
    int(minInclusive: number, maxInclusive: number): number {
      return minInclusive + Math.floor(next() * (maxInclusive - minInclusive + 1));
    },
    chance(probability: number): boolean {
      return next() < probability;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error('createSeededRng.pick called with empty array');
      }
      return items[Math.floor(next() * items.length)]!;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = copy[i]!;
        copy[i] = copy[j]!;
        copy[j] = tmp;
      }
      return copy;
    },
  };
}
