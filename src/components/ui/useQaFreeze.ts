'use client';

import { useEffect, useState } from 'react';

export function readQaFreezeFlag(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const w = window as unknown as { __CURBSIDE_QA_FREEZE__?: boolean };
  return params.get('qaFreezeParticles') === '1' || w.__CURBSIDE_QA_FREEZE__ === true;
}

export function syncQaFreezeDocumentFlag(): boolean {
  const frozen = readQaFreezeFlag();
  if (typeof document !== 'undefined') {
    if (frozen) {
      document.documentElement.dataset.qaFreeze = '1';
    } else if (document.documentElement.dataset.qaFreeze === '1') {
      delete document.documentElement.dataset.qaFreeze;
    }
  }
  return frozen;
}

// Apply immediately on client module evaluation so first-frame CSS animations never start under ?qaFreezeParticles=1
if (typeof window !== 'undefined') {
  syncQaFreezeDocumentFlag();
}

/**
 * Returns true when `?qaFreezeParticles=1` (or `window.__CURBSIDE_QA_FREEZE__`) is active
 * so HUD animations and transitions freeze deterministically during pixel-shimmer tests.
 */
export function useQaFreeze(): boolean {
  const [frozen, setFrozen] = useState<boolean>(() => syncQaFreezeDocumentFlag());

  useEffect(() => {
    const sync = () => setFrozen(syncQaFreezeDocumentFlag());
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  return frozen;
}
