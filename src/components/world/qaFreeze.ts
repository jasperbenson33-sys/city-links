/**
 * Deterministic QA freeze flag.
 *
 * When `?qaFreezeParticles=1` is present in the URL (or `window.__CURBSIDE_QA_FREEZE__ === true`),
 * every ambient `useFrame` animation in `src/components/world/**` (drifting clouds, steam puffs,
 * hydrant jet, fountain plumes, pigeon bobbing, flag wave) is pinned to a fixed time so stationary
 * frames are pixel-identical.
 */
export const QA_FREEZE_TIME = 4.0;

let cachedQueryFlag: boolean | null = null;

function readQueryFlag(): boolean {
  if (cachedQueryFlag !== null) return cachedQueryFlag;
  if (typeof window === 'undefined') return false;
  try {
    cachedQueryFlag =
      new URLSearchParams(window.location.search).get('qaFreezeParticles') === '1';
  } catch {
    cachedQueryFlag = false;
  }
  return cachedQueryFlag;
}

/** True when ambient animation must be frozen to `QA_FREEZE_TIME`. Cheap enough for per-frame use. */
export function isQaFreezeActive(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as unknown as { __CURBSIDE_QA_FREEZE__?: boolean }).__CURBSIDE_QA_FREEZE__ === true) {
    return true;
  }
  return readQueryFlag();
}

/**
 * Resolve the animation clock for a `useFrame` hook.
 * Returns `QA_FREEZE_TIME` when frozen, otherwise the live time (seconds) supplied by the caller.
 */
export function resolveAnimTime(liveSeconds: number): number {
  return isQaFreezeActive() ? QA_FREEZE_TIME : liveSeconds;
}
