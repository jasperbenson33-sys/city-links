'use client';

import dynamic from 'next/dynamic';
import { CurbsideHud } from './CurbsideHud';

const CurbsideGameRoot = dynamic(
  () => import('@/components/game/CurbsideGameRoot'),
  {
    ssr: false,
    loading: () => (
      <div
        className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-gradient-to-b from-[#6BBDF7] via-[#BFE8FD] to-[#FFE8CC]"
        style={{ touchAction: 'none' }}
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-[#E2C294] bg-[#FFFDF8]/95 px-4 py-2 text-[13px] font-extrabold tracking-tight text-[#231914] shadow-sm">
          <span aria-hidden="true">🏙️⛳</span>
          <span>Curbside Links</span>
        </div>
      </div>
    ),
  }
);

export function CurbsideClientShell() {
  return (
    <CurbsideGameRoot>
      <CurbsideHud />
    </CurbsideGameRoot>
  );
}
