'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FLAG_COLOR_META } from '@/types';
import { useCurbsideStore } from '@/store';
import { soundEngine } from '@/audio/soundEngine';

export interface ScorecardModalProps {
  /** Daily best strokes prior to completing this round (for New Best comparison) */
  previousDailyBest: number | null;
}

function buildShareText(
  seed: string,
  roundMode: 'daily' | 'random',
  totalStrokes: number,
  sunkOrder: ReadonlyArray<{ color: keyof typeof FLAG_COLOR_META; strokes: number }>
): string {
  const headerSeed = roundMode === 'daily' ? seed : `Random (${seed})`;
  const emojiLine = sunkOrder
    .map((entry) => `${FLAG_COLOR_META[entry.color].emoji}${entry.strokes}`)
    .join(' ');
  const strokeWord = totalStrokes === 1 ? 'Stroke' : 'Strokes';
  return `Curbside Links 🏙️⛳ ${headerSeed}\n${totalStrokes} ${strokeWord}: ${emojiLine}`;
}

async function copyTextWithFallback(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy execCommand fallback
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function ScorecardModal({ previousDailyBest }: ScorecardModalProps) {
  const isRoundComplete = useCurbsideStore((s) => s.isRoundComplete);
  const seed = useCurbsideStore((s) => s.seed);
  const roundMode = useCurbsideStore((s) => s.roundMode);
  const totalStrokes = useCurbsideStore((s) => s.totalStrokes);
  const sunkOrder = useCurbsideStore((s) => s.sunkOrder);
  const dailyBest = useCurbsideStore((s) => s.dailyBest);
  const restartRound = useCurbsideStore((s) => s.restartRound);
  const loadRandomCity = useCurbsideStore((s) => s.loadRandomCity);
  const notifyScorecardCopied = useCurbsideStore((s) => s.notifyScorecardCopied);

  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isRoundComplete) {
      setCopied(false);
      cardRef.current?.focus({ preventScroll: true });
    }
    return () => {
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, [isRoundComplete, seed]);

  if (!isRoundComplete) return null;

  const shareText = buildShareText(seed, roundMode, totalStrokes, sunkOrder);
  const isDaily = roundMode === 'daily';
  const isNewDailyBest =
    isDaily &&
    (previousDailyBest === null || totalStrokes < previousDailyBest);
  const matchedDailyBest =
    isDaily &&
    previousDailyBest !== null &&
    totalStrokes === previousDailyBest;

  const handleShare = async () => {
    soundEngine.unlock();
    let didShareOrCopy = false;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Curbside Links',
          text: shareText,
        });
        didShareOrCopy = true;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
      }
    }

    if (!didShareOrCopy) {
      didShareOrCopy = await copyTextWithFallback(shareText);
    } else {
      // Also copy to clipboard quietly when native share succeeds if possible
      void copyTextWithFallback(shareText);
    }

    if (didShareOrCopy) {
      setCopied(true);
      notifyScorecardCopied();
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        copyTimerRef.current = null;
        setCopied(false);
      }, 2200);
    }
  };

  return (
    <div
      data-hud-interactive="true"
      onPointerDown={(e) => e.stopPropagation()}
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#231914]/35 px-4 py-4 backdrop-blur-[3px]"
    >
      <section
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="5-Flag Scorecard"
        className="animate-modal-pop max-h-[calc(100dvh-2rem)] w-full max-w-[21.5rem] overflow-y-auto overscroll-contain rounded-[1.85rem] border-2 border-[#E7C99E] bg-gradient-to-b from-[#FFFDF9] to-[#FFF4DF] p-5 text-center text-[#231914] shadow-[0_24px_54px_-12px_rgba(35,25,20,0.42)] focus:outline-none [@media(max-height:560px)]:p-3.5"
      >
        {/* City Mode Pill */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E5C89E] bg-[#FFF8EB] px-3 py-1 text-[11.5px] font-extrabold tracking-tight text-[#543E32]">
          <span aria-hidden="true">🏙️</span>
          <span>{isDaily ? `Daily • ${seed}` : `Random City • ${seed}`}</span>
        </div>

        {/* Daily Best Badge */}
        {isDaily && dailyBest && (
          <div className="mt-2 flex justify-center">
            {isNewDailyBest ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#D99B26] bg-[#FEF08A] px-3 py-0.5 text-[11.5px] font-extrabold text-[#422006]">
                <span aria-hidden="true">🏆</span>
                <span>
                  {previousDailyBest === null
                    ? 'Daily Score Set!'
                    : `New Daily Best! (was ${previousDailyBest})`}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#E5C89E] bg-[#FFF7E2] px-3 py-0.5 text-[11.5px] font-bold text-[#543E32]">
                <span>
                  {matchedDailyBest
                    ? `Matched Daily Best: ${dailyBest.bestStrokes}`
                    : `Daily Best: ${dailyBest.bestStrokes}`}
                </span>
              </span>
            )}
          </div>
        )}

        {/* Total Strokes */}
        <div className="mt-3 [@media(max-height:560px)]:mt-2">
          <div className="text-[42px] leading-none font-black tracking-tight text-[#231914] tabular-nums [@media(max-height:560px)]:text-[34px]">
            {totalStrokes}
          </div>
          <div className="mt-0.5 text-[13px] font-extrabold tracking-wide text-[#543E32] uppercase">
            {totalStrokes === 1 ? 'Total Stroke' : 'Total Strokes'}
          </div>
        </div>

        {/* 5 Flags in Exact Player Sink Order */}
        <div
          aria-label="Flags sunk in order"
          className="mt-4 grid grid-cols-5 gap-1.5 rounded-2xl border border-[#EAD2AF] bg-[#FFF8EB]/90 p-2.5 [@media(max-height:560px)]:mt-2.5 [@media(max-height:560px)]:p-2"
        >
          {sunkOrder.map((entry) => {
            const meta = FLAG_COLOR_META[entry.color];
            return (
              <div
                key={entry.color}
                className="flex flex-col items-center gap-1 rounded-xl bg-white/85 px-1 py-1.5 shadow-[0_1px_3px_rgba(35,25,20,0.06)]"
              >
                <span
                  aria-label={`${meta.label} flag`}
                  className="text-[20px] leading-none"
                >
                  {meta.emoji}
                </span>
                <span className="text-[13px] leading-none font-black text-[#231914] tabular-nums">
                  {entry.strokes}
                </span>
                <span className="text-[9.5px] leading-none font-bold text-[#543E32]">
                  #{entry.orderIndex + 1}
                </span>
              </div>
            );
          })}
        </div>

        {/* Copy/Share Preview Strip */}
        <p className="mt-2.5 rounded-xl bg-[#F5E7CE]/65 px-3 py-1.5 font-mono text-[11px] leading-snug font-semibold text-[#3D2B21] select-all">
          {totalStrokes} Strokes:{' '}
          {sunkOrder
            .map((e) => `${FLAG_COLOR_META[e.color].emoji}${e.strokes}`)
            .join(' ')}
        </p>

        {/* Action Buttons (>= 48px tall) */}
        <div className="mt-4 flex flex-col gap-2 [@media(max-height:560px)]:mt-2.5">
          <button
            type="button"
            onClick={handleShare}
            className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[15px] font-black tracking-tight text-white shadow-[0_8px_20px_-6px_rgba(25,95,55,0.45)] transition-[transform,background-color] duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231914] ${
              copied
                ? 'bg-[#166534]'
                : 'bg-[#1B7340] hover:bg-[#166136]'
            }`}
          >
            <span aria-hidden="true">{copied ? '✓' : '📤'}</span>
            <span>{copied ? 'Copied!' : 'Share Scorecard'}</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={restartRound}
              className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl bg-[#C23914] px-3 py-2.5 text-[14px] font-black tracking-tight text-white shadow-[0_6px_16px_-6px_rgba(194,57,20,0.45)] transition-[transform,background-color] duration-150 hover:bg-[#AB3110] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231914]"
            >
              <span aria-hidden="true">↺</span>
              <span>Play Again</span>
            </button>

            <button
              type="button"
              onClick={loadRandomCity}
              className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl border border-[#D8B98C] bg-[#FFF6E5] px-3 py-2.5 text-[13.5px] font-black tracking-tight text-[#231914] transition-[transform,background-color] duration-150 hover:bg-[#FCEBD0] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231914]"
            >
              <span aria-hidden="true">🎲</span>
              <span>New City</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
