'use client';

import React, { useEffect, useRef } from 'react';
import {
  CLUB_ORDER,
  CLUB_SPECS,
  FLAG_COLORS,
  FLAG_COLOR_META,
  type FlagColor,
} from '@/types';
import { useCurbsideStore } from '@/store';
import { soundEngine } from '@/audio/soundEngine';
import { ClubHeadIcon } from './ClubHeadIcon';
import { ScorecardModal } from './ScorecardModal';

export function CurbsideHud() {
  const seed = useCurbsideStore((s) => s.seed);
  const roundMode = useCurbsideStore((s) => s.roundMode);
  const totalStrokes = useCurbsideStore((s) => s.totalStrokes);
  const sunkFlags = useCurbsideStore((s) => s.sunkFlags);
  const sunkOrder = useCurbsideStore((s) => s.sunkOrder);
  const activeTargetFlag = useCurbsideStore((s) => s.activeTargetFlag);
  const lastSunkFlag = useCurbsideStore((s) => s.lastSunkFlag);
  const isRoundComplete = useCurbsideStore((s) => s.isRoundComplete);
  const dailyBest = useCurbsideStore((s) => s.dailyBest);

  const selectedClub = useCurbsideStore((s) => s.selectedClub);
  const ballPhase = useCurbsideStore((s) => s.ballPhase);
  const hasTakenFirstStroke = useCurbsideStore((s) => s.hasTakenFirstStroke);
  const aimPreview = useCurbsideStore((s) => s.aimPreview);
  const cameraMode = useCurbsideStore((s) => s.cameraMode);
  const muted = useCurbsideStore((s) => s.muted);
  const canMulligan = useCurbsideStore((s) => s.canMulligan);
  const trickToast = useCurbsideStore((s) => s.trickToast);

  const hydrateDailyBest = useCurbsideStore((s) => s.hydrateDailyBest);
  const loadDailyCity = useCurbsideStore((s) => s.loadDailyCity);
  const loadRandomCity = useCurbsideStore((s) => s.loadRandomCity);
  const restartRound = useCurbsideStore((s) => s.restartRound);
  const mulligan = useCurbsideStore((s) => s.mulligan);
  const setSelectedClub = useCurbsideStore((s) => s.setSelectedClub);
  const toggleCameraMode = useCurbsideStore((s) => s.toggleCameraMode);
  const toggleMuted = useCurbsideStore((s) => s.toggleMuted);

  // Track Daily Best prior to completing a round so ScorecardModal knows if it beat a prior score
  const previousDailyBestRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isRoundComplete) {
      previousDailyBestRef.current = dailyBest?.bestStrokes ?? null;
    }
  }, [isRoundComplete, dailyBest]);

  // Hydrate Daily Best and subscribe Web Audio toybox synth with zero extra React renders
  useEffect(() => {
    hydrateDailyBest();
    const cleanupAudio = soundEngine.init();
    soundEngine.setMuted(useCurbsideStore.getState().muted);

    let lastSeq = useCurbsideStore.getState().soundEventSeq;
    let lastMuted = useCurbsideStore.getState().muted;

    const unsubscribe = useCurbsideStore.subscribe((state) => {
      if (state.muted !== lastMuted) {
        lastMuted = state.muted;
        soundEngine.setMuted(state.muted);
      }
      if (state.soundEventSeq !== lastSeq && state.lastSoundEvent) {
        lastSeq = state.soundEventSeq;
        if (!state.muted) {
          soundEngine.playPayload(state.lastSoundEvent);
        }
      }
    });

    return () => {
      unsubscribe();
      cleanupAudio();
    };
  }, [hydrateDailyBest]);

  const handleToggleSound = () => {
    const wasMuted = useCurbsideStore.getState().muted;
    toggleMuted();
    if (wasMuted) {
      soundEngine.setMuted(false);
      soundEngine.unlock();
      soundEngine.play('ui_tap', { intensity: 0.7 });
    } else {
      soundEngine.setMuted(true);
    }
  };

  // Build 5 flag progress dots: sunk flags first in exact player order, then remaining unsunk flags
  const orderedFlagDots: Array<{
    color: FlagColor;
    sunk: boolean;
    orderNumber: number | null;
  }> = [
    ...sunkOrder.map((entry) => ({
      color: entry.color,
      sunk: true,
      orderNumber: entry.orderIndex + 1,
    })),
    ...FLAG_COLORS.filter((c) => !sunkFlags[c]).map((color) => ({
      color,
      sunk: false,
      orderNumber: null,
    })),
  ];

  const activeClub = CLUB_SPECS[selectedClub];
  const showFirstStrokeWhisper =
    !isRoundComplete &&
    !hasTakenFirstStroke &&
    !aimPreview.isAiming &&
    !trickToast;
  const showCuppedLegChip =
    !isRoundComplete && ballPhase === 'cupped' && lastSunkFlag !== null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between overflow-hidden"
      style={{
        paddingTop:
          'max(0.625rem, var(--safe-top, env(safe-area-inset-top, 0px)))',
        paddingBottom:
          'max(0.75rem, var(--safe-bottom, env(safe-area-inset-bottom, 0px)))',
        paddingLeft:
          'max(0.625rem, var(--safe-left, env(safe-area-inset-left, 0px)))',
        paddingRight:
          'max(0.625rem, var(--safe-right, env(safe-area-inset-right, 0px)))',
      }}
    >
      {/* TOP BAR: Compact City Pill + 4 Action Buttons + Flag Progress Strip */}
      <div className="pointer-events-none flex flex-col gap-1.5">
        <header className="pointer-events-none flex items-center justify-between gap-1.5">
          {/* City Pill (Daily • YYYY-MM-DD or 1-Tap Return from Random City) */}
          {roundMode === 'daily' ? (
            <div
              aria-label={`Today's Daily City ${seed}`}
              className="pointer-events-none inline-flex min-h-[44px] max-w-[calc(100%-188px)] shrink items-center gap-1.5 truncate rounded-full border border-[#E2C294] bg-[#FFFDF8]/95 px-3 py-1.5 text-[12px] font-extrabold tracking-tight text-[#231914] shadow-[0_6px_18px_-6px_rgba(35,25,20,0.2)]"
            >
              <span aria-hidden="true" className="shrink-0 text-[13px]">
                ☀️
              </span>
              <span className="truncate">Daily • {seed}</span>
            </div>
          ) : (
            <button
              type="button"
              data-hud-interactive="true"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={loadDailyCity}
              aria-label="Return to Today's Daily City"
              className="pointer-events-auto inline-flex min-h-[44px] max-w-[calc(100%-188px)] shrink items-center gap-1.5 truncate rounded-full border border-[#E2C294] bg-[#FFFDF8]/95 px-2.5 py-1.5 text-[11.5px] font-extrabold tracking-tight text-[#231914] shadow-[0_6px_18px_-6px_rgba(35,25,20,0.2)] transition-transform duration-150 hover:bg-[#FFF5E2] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231914]"
            >
              <span className="truncate">Random City</span>
              <span className="shrink-0 rounded-full bg-[#231914] px-1.5 py-0.5 text-[10px] font-extrabold text-[#FFFDF8]">
                Daily ↩
              </span>
            </button>
          )}

          {/* Top-Right 44x44px Action Buttons */}
          <div
            data-hud-interactive="true"
            onPointerDown={(e) => e.stopPropagation()}
            className="pointer-events-auto inline-flex shrink-0 items-center rounded-full border border-[#E2C294] bg-[#FFFDF8]/95 p-0.5 shadow-[0_6px_18px_-6px_rgba(35,25,20,0.2)]"
          >
            {/* 1-Tap New Random City */}
            <button
              type="button"
              aria-label="New Random City"
              title="New Random City"
              onClick={loadRandomCity}
              className="flex h-11 w-11 items-center justify-center rounded-full text-[#231914] transition-[transform,background-color] duration-150 hover:bg-[#F5E6CE]/80 active:scale-[0.93] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231914]"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="h-[19px] w-[19px]"
              >
                <rect
                  x="3.5"
                  y="3.5"
                  width="17"
                  height="17"
                  rx="4.2"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" />
                <circle cx="15.5" cy="8.5" r="1.4" fill="currentColor" />
                <circle cx="12" cy="12" r="1.4" fill="currentColor" />
                <circle cx="8.5" cy="15.5" r="1.4" fill="currentColor" />
                <circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" />
              </svg>
            </button>

            {/* 1-Tap Overview / Ball Focus Camera Toggle */}
            <button
              type="button"
              aria-label={
                cameraMode === 'overview'
                  ? 'Switch to Ball Focus view'
                  : 'Switch to City Overview'
              }
              aria-pressed={cameraMode === 'focus'}
              title={cameraMode === 'overview' ? 'Ball Focus' : 'City Overview'}
              onClick={toggleCameraMode}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-[transform,background-color,color] duration-150 active:scale-[0.93] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231914] ${
                cameraMode === 'focus'
                  ? 'bg-[#231914] text-[#FFFDF8]'
                  : 'text-[#231914] hover:bg-[#F5E6CE]/80'
              }`}
            >
              {cameraMode === 'overview' ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className="h-[19px] w-[19px]"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="3.2"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M12 3.5V6.5M12 17.5V20.5M3.5 12H6.5M17.5 12H20.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className="h-[19px] w-[19px]"
                >
                  <path
                    d="M4 9V5.5C4 4.67 4.67 4 5.5 4H9M15 4H18.5C19.33 4 20 4.67 20 5.5V9M20 15V18.5C20 19.33 19.33 20 18.5 20H15M9 20H5.5C4.67 20 4 19.33 4 18.5V15"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                </svg>
              )}
            </button>

            {/* 1-Tap Restart Round */}
            <button
              type="button"
              aria-label="Restart Round"
              title="Restart Round"
              onClick={restartRound}
              className="flex h-11 w-11 items-center justify-center rounded-full text-[#231914] transition-[transform,background-color] duration-150 hover:bg-[#F5E6CE]/80 active:scale-[0.93] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231914]"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="h-[19px] w-[19px]"
              >
                <path
                  d="M4.5 10.5A7.5 7.5 0 1 1 6.7 17.3"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                />
                <path
                  d="M4.5 5.5V10.5H9.5"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {/* 1-Tap Sound Mute */}
            <button
              type="button"
              aria-label={muted ? 'Unmute Sound' : 'Mute Sound'}
              aria-pressed={!muted}
              title={muted ? 'Sound Off' : 'Sound On'}
              onClick={handleToggleSound}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-[transform,background-color,color] duration-150 active:scale-[0.93] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231914] ${
                muted
                  ? 'bg-[#EADAC2] text-[#4A3629]'
                  : 'text-[#231914] hover:bg-[#F5E6CE]/80'
              }`}
            >
              {muted ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className="h-[19px] w-[19px]"
                >
                  <path
                    d="M11 5.5L6.5 9H3.5V15H6.5L11 18.5V5.5Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M16 9.5L20.5 14.5M20.5 9.5L16 14.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className="h-[19px] w-[19px]"
                >
                  <path
                    d="M11 5.5L6.5 9H3.5V15H6.5L11 18.5V5.5Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M15.2 8.8C16.2 9.8 16.75 10.9 16.75 12C16.75 13.1 16.2 14.2 15.2 15.2M18.2 6.4C19.8 8 20.6 9.9 20.6 12C20.6 14.1 19.8 16 18.2 17.6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </header>

        {/* Row 2: Compact 5-Flag Progress Dots + Strokes + Daily Best + Optional 1-Tap Mulligan */}
        <div className="pointer-events-none flex items-center justify-center gap-1.5">
          <div
            aria-label={`Flags sunk: ${sunkOrder.length} of 5. Total strokes: ${totalStrokes}`}
            className="pointer-events-none inline-flex min-h-[36px] items-center gap-2 rounded-full border border-[#E2C294] bg-[#FFFDF8]/95 px-3 py-1 text-[#231914] shadow-[0_6px_16px_-6px_rgba(35,25,20,0.18)]"
          >
            {/* 5 Color-Coded Flag Dots (sunk flags fill in exact player sink order) */}
            <div className="flex items-center gap-1.5">
              {orderedFlagDots.map(({ color, sunk, orderNumber }) => {
                const meta = FLAG_COLOR_META[color];
                const isTarget = !sunk && activeTargetFlag === color;
                const darkCheckInk = color === 'yellow' ? '#231914' : '#FFFFFF';
                return (
                  <span
                    key={color}
                    title={`${meta.label} flag${sunk ? ' (sunk)' : ''}`}
                    className={`relative inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] leading-none font-black transition-transform duration-200 ${
                      sunk ? 'scale-105 shadow-xs' : 'bg-white/90'
                    }`}
                    style={{
                      backgroundColor: sunk ? meta.hex : 'rgba(255,255,255,0.9)',
                      border: `2px solid ${meta.hex}`,
                      boxShadow: isTarget
                        ? `0 0 0 2px rgba(35,25,20,0.22)`
                        : undefined,
                      color: darkCheckInk,
                    }}
                  >
                    {sunk ? orderNumber : ''}
                  </span>
                );
              })}
            </div>

            <span
              aria-hidden="true"
              className="h-3.5 w-[1px] bg-[#E2C294]"
            />

            {/* Stroke Counter */}
            <span className="text-[12.5px] font-black tracking-tight text-[#231914] tabular-nums">
              {totalStrokes}{' '}
              <span className="font-bold text-[#543E32]">
                {totalStrokes === 1 ? 'Stroke' : 'Strokes'}
              </span>
            </span>

            {/* Daily Best Badge */}
            {roundMode === 'daily' && dailyBest !== null && (
              <span className="inline-flex items-center rounded-full border border-[#D99B26]/70 bg-[#FEF08A] px-2 py-0.5 text-[10.5px] font-extrabold tracking-tight text-[#422006] tabular-nums">
                Best {dailyBest.bestStrokes}
              </span>
            )}
          </div>

          {/* 1-Tap Mulligan button (only shown after at least 1 shot and before round ends) */}
          {canMulligan && !isRoundComplete && (
            <button
              type="button"
              data-hud-interactive="true"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={mulligan}
              aria-label="Mulligan last shot"
              title="Mulligan last shot"
              className="pointer-events-auto flex h-11 min-w-[44px] items-center justify-center gap-1 rounded-full border border-[#E2C294] bg-[#FFFDF8]/95 px-2.5 text-[11.5px] font-extrabold text-[#231914] shadow-[0_6px_16px_-6px_rgba(35,25,20,0.18)] transition-[transform,background-color] duration-150 hover:bg-[#F5E6CE] active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231914]"
            >
              <span aria-hidden="true" className="text-[13px]">
                ↶
              </span>
              <span className="hidden min-[390px]:inline">Undo</span>
            </button>
          )}
        </div>

        {/* Non-blocking Whisper before first stroke */}
        {showFirstStrokeWhisper && (
          <div className="pointer-events-none mt-0.5 flex justify-center">
            <div className="pointer-events-none inline-flex items-center rounded-full border border-[#E2C294] bg-[#FFFDF8]/92 px-3.5 py-1 text-[12px] font-extrabold tracking-tight text-[#231914] shadow-[0_6px_16px_-6px_rgba(35,25,20,0.18)]">
              Drag to aim &amp; release
            </div>
          </div>
        )}

        {/* Non-blocking Cupped Flag Chip (flags 1..4) */}
        {showCuppedLegChip && lastSunkFlag && (
          <div
            role="status"
            aria-live="polite"
            className="animate-toast-pop pointer-events-none mt-0.5 flex justify-center"
          >
            <div className="pointer-events-none inline-flex items-center gap-1.5 rounded-full border border-[#E2C294] bg-[#FFFDF8] px-3.5 py-1 text-[12.5px] font-extrabold tracking-tight text-[#231914] shadow-[0_8px_20px_-6px_rgba(35,25,20,0.24)]">
              <span aria-hidden="true">
                {FLAG_COLOR_META[lastSunkFlag.color].emoji}
              </span>
              <span>
                {FLAG_COLOR_META[lastSunkFlag.color].label} Flag •{' '}
                {lastSunkFlag.strokes}{' '}
                {lastSunkFlag.strokes === 1 ? 'Stroke' : 'Strokes'}
              </span>
            </div>
          </div>
        )}

        {/* Reactive Trick-Shot & Penalty Micro-Toasts */}
        {trickToast && (
          <div
            key={trickToast.seq}
            role="status"
            aria-live="polite"
            className="animate-toast-pop pointer-events-none mt-0.5 flex justify-center"
          >
            <div className="pointer-events-none inline-flex items-center rounded-full border border-[#E2C294] bg-[#FFFDF8] px-3.5 py-1 text-[12.5px] font-extrabold tracking-tight text-[#231914] shadow-[0_8px_20px_-6px_rgba(35,25,20,0.22)]">
              {trickToast.label}
            </div>
          </div>
        )}
      </div>

      {/* 5-FLAG COMPLETE SCORECARD MODAL */}
      <ScorecardModal previousDailyBest={previousDailyBestRef.current} />

      {/* BOTTOM THUMB ZONE: Subtle Pull Meter + 1-Tap 4-Club Switcher Pill */}
      {!isRoundComplete && (
        <div className="pointer-events-none flex flex-col items-center gap-1.5">
          {/* Tactile Pull-Power Bar while aiming (zero yardages/numbers) */}
          {aimPreview.isAiming && (
            <div className="pointer-events-none flex flex-col items-center gap-1">
              {aimPreview.power < 0.08 && (
                <span className="rounded-full bg-[#231914]/85 px-2.5 py-0.5 text-[11px] font-bold text-[#FFFDF8]">
                  Release inside ring to cancel
                </span>
              )}
              <div className="pointer-events-none h-2.5 w-44 overflow-hidden rounded-full border border-white/80 bg-[#231914]/25 p-0.5 shadow-inner">
                <div
                  className="h-full rounded-full transition-[width] duration-75 ease-out"
                  style={{
                    width: `${Math.max(6, Math.min(100, aimPreview.power * 100))}%`,
                    backgroundColor: activeClub.accentHex,
                  }}
                />
              </div>
            </div>
          )}

          {/* Sleek 1-Tap 4-Club Switcher Pill */}
          <nav
            aria-label="Golf Clubs"
            data-hud-interactive="true"
            onPointerDown={(e) => e.stopPropagation()}
            className="pointer-events-auto mx-auto grid w-full max-w-[23.5rem] grid-cols-4 gap-1 rounded-[1.5rem] border border-[#E2C294] bg-[#FFFDF8]/95 p-1 shadow-[0_12px_28px_-8px_rgba(35,25,20,0.26)]"
          >
            {CLUB_ORDER.map((clubId) => {
              const club = CLUB_SPECS[clubId];
              const isSelected = selectedClub === clubId;
              return (
                <button
                  key={clubId}
                  type="button"
                  aria-label={`${club.name} (${club.subtitle})`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedClub(clubId, true)}
                  style={
                    isSelected
                      ? {
                          boxShadow: `0 3px 10px -2px rgba(35,25,20,0.34), inset 0 0 0 2px ${club.accentHex}`,
                        }
                      : undefined
                  }
                  className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-[1.15rem] px-1 py-1.5 leading-none transition-[transform,background-color,color,box-shadow] duration-150 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231914] ${
                    isSelected
                      ? 'bg-[#231914] text-[#FFFDF8]'
                      : 'text-[#231914] hover:bg-[#F5E6CE]/75'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      className="inline-flex shrink-0 items-center"
                      style={isSelected ? { color: club.accentHex } : undefined}
                    >
                      <ClubHeadIcon club={clubId} className="h-4 w-4" />
                    </span>
                    <span className="text-[11.5px] font-black tracking-tight whitespace-nowrap">
                      {club.name}
                    </span>
                  </div>
                  <span
                    className={`text-[9.5px] font-extrabold tracking-wide uppercase ${
                      isSelected ? 'text-[#FDE68A]' : 'text-[#543E32]'
                    }`}
                  >
                    {club.subtitle}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
