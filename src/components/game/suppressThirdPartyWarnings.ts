'use client';

const SUPPRESSED_DEPRECATION_SUBSTRINGS = [
  'THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.',
  'using deprecated parameters for the initialization function; pass a single object instead',
];

const GLOBAL_FLAG = '__curbsideWarnFilterInstalled__';

/**
 * Installs a narrowly scoped filter for known third-party R3F (`THREE.Clock`) and
 * `@dimforge/rapier3d-compat` (`RAPIER.init()`) deprecation warnings without masking
 * any application or Three.js scene/shader warnings.
 */
export function installThirdPartyDeprecationFilter(): void {
  if (typeof window === 'undefined') return;
  const g = globalThis as Record<string, unknown>;
  if (g[GLOBAL_FLAG]) return;
  g[GLOBAL_FLAG] = true;

  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const first = args[0];
    if (
      typeof first === 'string' &&
      SUPPRESSED_DEPRECATION_SUBSTRINGS.some((msg) => first.includes(msg))
    ) {
      return;
    }
    originalWarn(...args);
  };
}

installThirdPartyDeprecationFilter();
