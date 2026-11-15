'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useCurbsideStore } from '@/store';
import { soundEngine } from '@/lib/sound';
import { useQaFreeze } from './useQaFreeze';

export interface ScorecardModalProps {
  /** Personal best strokes prior to completing this hole (for New Personal Best comparison) */
  previousBest?: number | null;
  /** Legacy prop alias kept harmlessly compatible */
  previousDailyBest?: number | null;
}

interface StoreCompat {
  holeNumber?: number;
  holeName?: string;
  par?: number;
  holeDistanceMeters?: number;
  strokes?: number;
  totalStrokes?: number;
  penaltyStrokes?: number;
  personalBest?: number | null;
  dailyBest?: { bestStrokes?: number } | null;
  isHoleComplete?: boolean;
  isRoundComplete?: boolean;
  shotPhase?: string;
  replayHole?: () => void;
  resetHole?: () => void;
  restartRound?: () => void;
}

interface ScoreBadgeMeta {
  headline: string;
  deltaLabel: string;
  pillBg: string;
  pillText: string;
  pillBorder: string;
  celebrate: boolean;
}

function getScoreRelativeToPar(strokes: number, par: number): ScoreBadgeMeta {
  const diff = strokes - par;
  if (strokes === 1) {
    return {
      headline: 'HOLE-IN-ONE!',
      deltaLabel: `-${par - 1}`,
      pillBg: '#FEF08A',
      pillText: '#422006',
      pillBorder: '#D99B26',
      celebrate: true,
    };
  }
  if (diff <= -3) {
    return {
      headline: `ALBATROSS! ${diff}`,
      deltaLabel: `${diff}`,
      pillBg: '#FEF08A',
      pillText: '#422006',
      pillBorder: '#D99B26',
      celebrate: true,
    };
  }
  if (diff === -2) {
    return {
      headline: 'EAGLE! -2',
      deltaLabel: '-2',
      pillBg: '#FEF08A',
      pillText: '#422006',
      pillBorder: '#D99B26',
      celebrate: true,
    };
  }
  if (diff === -1) {
    return {
      headline: 'BIRDIE! -1',
      deltaLabel: '-1',
      pillBg: '#DCFCE7',
      pillText: '#14532D',
      pillBorder: '#22C55E',
      celebrate: true,
    };
  }
  if (diff === 0) {
    return {
      headline: 'PAR',
      deltaLabel: 'E',
      pillBg: '#FFF8EB',
      pillText: '#231914',
      pillBorder: '#D9B684',
      celebrate: false,
    };
  }
  if (diff === 1) {
    return {
      headline: 'BOGEY +1',
      deltaLabel: '+1',
      pillBg: '#FFEDD5',
      pillText: '#7C2D12',
      pillBorder: '#FB923C',
      celebrate: false,
    };
  }
  if (diff === 2) {
    return {
      headline: 'DOUBLE BOGEY +2',
      deltaLabel: '+2',
      pillBg: '#FEE2E2',
      pillText: '#7F1D1D',
      pillBorder: '#F87171',
      celebrate: false,
    };
  }
  return {
    headline: `+${diff} OVER PAR`,
    deltaLabel: `+${diff}`,
    pillBg: '#FEE2E2',
    pillText: '#7F1D1D',
    pillBorder: '#F87171',
    celebrate: false,
  };
}

const CONFETTI_PIECES = [
  { left: '8%', delay: '0ms', color: '#EF4444', sizeCls: 'h-2.5 w-1.5 rounded-full' },
  { left: '16%', delay: '110ms', color: '#FACC15', sizeCls: 'h-2 w-2 rounded-full' },
  { left: '24%', delay: '45ms', color: '#22C55E', sizeCls: 'h-3 w-1.5 rounded-sm' },
  { left: '33%', delay: '150ms', color: '#38BDF8', sizeCls: 'h-2 w-2 rounded-full' },
  { left: '42%', delay: '20ms', color: '#F97316', sizeCls: 'h-2.5 w-1.5 rounded-sm' },
  { left: '50%', delay: '130ms', color: '#FACC15', sizeCls: 'h-2.5 w-2.5 rounded-full' },
  { left: '59%', delay: '70ms', color: '#A855F7', sizeCls: 'h-3 w-1.5 rounded-sm' },
  { left: '68%', delay: '165ms', color: '#22C55E', sizeCls: 'h-2 w-2 rounded-full' },
  { left: '76%', delay: '95ms', color: '#EF4444', sizeCls: 'h-2.5 w-1.5 rounded-full' },
  { left: '84%', delay: '35ms', color: '#38BDF8', sizeCls: 'h-2.5 w-1.5 rounded-sm' },
  { left: '91%', delay: '125ms', color: '#F97316', sizeCls: 'h-2 w-2 rounded-full' },
];

export function ScorecardModal({
  previousBest,
  previousDailyBest,
}: ScorecardModalProps) {
  const qaFreeze = useQaFreeze();
  const isHoleComplete = useCurbsideStore((s) => {
    const st = s as unknown as StoreCompat;
    return Boolean(
      st.isHoleComplete || st.isRoundComplete || st.shotPhase === 'holed_out',
    );
  });

  const holeNumber = useCurbsideStore(
    (s) => (s as unknown as StoreCompat).holeNumber ?? 1,
  );
  const holeName = useCurbsideStore(
    (s) => (s as unknown as StoreCompat).holeName ?? '5th & Mercer',
  );
  const par = useCurbsideStore((s) => (s as unknown as StoreCompat).par ?? 4);
  const holeDistanceMeters = useCurbsideStore(
    (s) => (s as unknown as StoreCompat).holeDistanceMeters ?? 72,
  );
  const strokes = useCurbsideStore((s) => {
    const st = s as unknown as StoreCompat;
    return st.strokes ?? st.totalStrokes ?? 0;
  });
  const penaltyStrokes = useCurbsideStore(
    (s) => (s as unknown as StoreCompat).penaltyStrokes ?? 0,
  );
  const personalBest = useCurbsideStore((s) => {
    const st = s as unknown as StoreCompat;
    if (st.personalBest !== undefined) return st.personalBest;
    return st.dailyBest?.bestStrokes ?? null;
  });

  const cardRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!isHoleComplete) {
      setVisible(false);
      setEntered(false);
      return;
    }
    if (qaFreeze) {
      setVisible(true);
      setEntered(true);
      const rafFocus = window.requestAnimationFrame(() => {
        cardRef.current?.focus({ preventScroll: true });
      });
      return () => window.cancelAnimationFrame(rafFocus);
    }

    // Delay Scorecard reveal by ~240ms so the 150ms 3D cup-drop tween & celebration
    // play at locked 60 FPS before the modal glides in, and defer focus past entrance.
    let rafEnter = 0;
    let rafFocus = 0;
    const delayTimer = window.setTimeout(() => {
      setVisible(true);
      rafEnter = window.requestAnimationFrame(() => {
        setEntered(true);
        rafFocus = window.requestAnimationFrame(() => {
          cardRef.current?.focus({ preventScroll: true });
        });
      });
    }, 240);

    return () => {
      window.clearTimeout(delayTimer);
      if (rafEnter) window.cancelAnimationFrame(rafEnter);
      if (rafFocus) window.cancelAnimationFrame(rafFocus);
    };
  }, [isHoleComplete, qaFreeze]);

  if (!isHoleComplete || !visible) return null;

  const priorBest = previousBest ?? previousDailyBest ?? null;
  const isNewPersonalBest =
    strokes > 0 && (priorBest === null || strokes < priorBest);
  const effectiveBest =
    personalBest !== null
      ? Math.min(personalBest, strokes || personalBest)
      : strokes;

  const scoreMeta = getScoreRelativeToPar(Math.max(1, strokes), par);
  const showConfetti = !qaFreeze && (scoreMeta.celebrate || isNewPersonalBest);

  const handleReplay = () => {
    soundEngine.unlock();
    soundEngine.playUiClick(0.95);
    setEntered(false);
    const st = useCurbsideStore.getState() as unknown as StoreCompat;
    if (st.replayHole) {
      st.replayHole();
    } else if (st.resetHole) {
      st.resetHole();
    } else {
      st.restartRound?.();
    }
  };

  return (
    <div
      data-hud-interactive="true"
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        paddingTop:
          'max(1rem, var(--safe-top, env(safe-area-inset-top, 0px)))',
        paddingBottom:
          'max(1rem, var(--safe-bottom, env(safe-area-inset-bottom, 0px)))',
        paddingLeft:
          'max(1rem, var(--safe-left, env(safe-area-inset-left, 0px)))',
        paddingRight:
          'max(1rem, var(--safe-right, env(safe-area-inset-right, 0px)))',
        willChange: qaFreeze ? undefined : 'opacity',
        transition: qaFreeze
          ? 'none'
          : 'opacity 180ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      className={`pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#231914]/50 ${
        entered ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <section
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Hole ${holeNumber} Scorecard`}
        style={{
          willChange: qaFreeze ? undefined : 'transform, opacity',
          transition: qaFreeze
            ? 'none'
            : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className={`relative max-h-[calc(100dvh-2rem)] w-full max-w-[21.5rem] overflow-hidden overflow-y-auto overscroll-contain rounded-[1.85rem] border-2 border-[#E7C99E] bg-gradient-to-b from-[#FFFDF9] to-[#FFF3DD] p-5 text-center text-[#231914] shadow-[0_24px_54px_-12px_rgba(35,25,20,0.42)] focus:outline-none [@media(max-height:560px)]:p-3.5 ${
          entered
            ? 'translate-y-0 scale-100 opacity-100'
            : 'translate-y-3 scale-[0.94] opacity-0'
        }`}
      >
        {/* Sunlit Confetti Flourish */}
        {showConfetti && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-32 overflow-hidden"
          >
            {CONFETTI_PIECES.map((piece, idx) => (
              <span
                key={idx}
                className={`animate-confetti-flutter absolute top-0 ${piece.sizeCls}`}
                style={{
                  left: piece.left,
                  animationDelay: piece.delay,
                  backgroundColor: piece.color,
                  willChange: 'transform, opacity',
                }}
              />
            ))}
          </div>
        )}

        {/* Hole Header Pill */}
        <div className="relative inline-flex items-center gap-1.5 rounded-full border border-[#E5C89E] bg-[#FFF8EB] px-3 py-1 text-[11px] font-black tracking-tight text-[#543E32] uppercase">
          <span aria-hidden="true">⛳</span>
          <span>
            Hole {holeNumber}: {holeName} • Par {par} • {holeDistanceMeters}m
          </span>
        </div>

        {/* Relative-to-Par Celebration Banner */}
        <div className="relative mt-3 flex justify-center">
          <span
            className="inline-flex items-center rounded-full border px-4 py-1 text-[15px] font-black tracking-tight shadow-xs"
            style={{
              backgroundColor: scoreMeta.pillBg,
              color: scoreMeta.pillText,
              borderColor: scoreMeta.pillBorder,
            }}
          >
            {scoreMeta.headline}
          </span>
        </div>

        {/* Big Stroke Hero Counter */}
        <div className="relative mt-3 [@media(max-height:560px)]:mt-2">
          <div className="text-[48px] leading-none font-black tracking-tight text-[#231914] tabular-nums [@media(max-height:560px)]:text-[38px]">
            {strokes}
          </div>
          <div className="mt-0.5 text-[12.5px] font-extrabold tracking-wider text-[#543E32] uppercase">
            {strokes === 1 ? 'Total Stroke' : 'Total Strokes'}
          </div>
        </div>

        {/* New Personal Best Badge */}
        <div className="relative mt-2.5 flex justify-center">
          {isNewPersonalBest ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D99B26] bg-[#FEF08A] px-3 py-1 text-[11.5px] font-black text-[#422006] shadow-xs">
              <span aria-hidden="true">🏆</span>
              <span>
                {priorBest === null
                  ? 'NEW PERSONAL BEST!'
                  : `NEW PERSONAL BEST! (was ${priorBest})`}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#E5C89E] bg-[#FFF7E2] px-3 py-0.5 text-[11.5px] font-bold text-[#543E32]">
              <span>Personal Best: {effectiveBest}</span>
            </span>
          )}
        </div>

        {/* Stats Breakdown Grid */}
        <div className="relative mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-[#EAD2AF] bg-[#FFF8EB]/90 p-2.5 text-center [@media(max-height:560px)]:mt-2.5">
          <div className="flex flex-col items-center rounded-xl bg-white/85 px-1.5 py-2 shadow-[0_1px_2px_rgba(35,25,20,0.05)]">
            <span className="text-[9.5px] font-extrabold tracking-wider text-[#6B5142] uppercase">
              Strokes
            </span>
            <span className="mt-0.5 text-[16px] leading-none font-black text-[#231914] tabular-nums">
              {strokes}
            </span>
          </div>

          <div className="flex flex-col items-center rounded-xl bg-white/85 px-1.5 py-2 shadow-[0_1px_2px_rgba(35,25,20,0.05)]">
            <span className="text-[9.5px] font-extrabold tracking-wider text-[#6B5142] uppercase">
              Penalties
            </span>
            <span
              className={`mt-0.5 text-[16px] leading-none font-black tabular-nums ${
                penaltyStrokes > 0 ? 'text-[#B93815]' : 'text-[#231914]'
              }`}
            >
              {penaltyStrokes > 0 ? `+${penaltyStrokes}` : '0'}
            </span>
          </div>

          <div className="flex flex-col items-center rounded-xl bg-white/85 px-1.5 py-2 shadow-[0_1px_2px_rgba(35,25,20,0.05)]">
            <span className="text-[9.5px] font-extrabold tracking-wider text-[#6B5142] uppercase">
              Best
            </span>
            <span className="mt-0.5 text-[16px] leading-none font-black text-[#1B7340] tabular-nums">
              {effectiveBest}
            </span>
          </div>
        </div>

        {/* 1-Tap Replay Button */}
        <div className="relative mt-4 [@media(max-height:560px)]:mt-3">
          <button
            type="button"
            onClick={handleReplay}
            style={{ willChange: qaFreeze ? undefined : 'transform' }}
            className={`flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#C23914] px-4 py-3 text-[15.5px] font-black tracking-tight text-white shadow-[0_10px_24px_-6px_rgba(194,57,20,0.48)] hover:bg-[#AB3110] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231914] ${
              qaFreeze
                ? 'transition-none'
                : 'transition-[transform,background-color] duration-150'
            }`}
          >
            <span aria-hidden="true">↺</span>
            <span>Tee It Up Again</span>
          </button>
        </div>
      </section>
    </div>
  );
}
