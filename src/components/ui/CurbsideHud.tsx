'use client';

import React, { useEffect, useRef } from 'react';
import {
  CLUB_ORDER,
  CLUB_SPECS,
  type ClubId,
  type PhysicsSurfaceTag,
  type SoundEventPayload,
  type Vec3Tuple,
} from '@/types';
import { HOLE_1_CUP, TEE_POSITION } from '@/config/courseMasterPlan';
import { useCurbsideStore } from '@/store';
import { soundEngine } from '@/lib/sound';
import { ClubHeadIcon } from './ClubHeadIcon';
import { ScorecardModal } from './ScorecardModal';
import { useQaFreeze } from './useQaFreeze';

type ShotPhase =
  | 'aiming'
  | 'pulling'
  | 'ball_in_flight'
  | 'settling'
  | 'fountain_drop'
  | 'holed_out';

interface StoreCompat {
  holeNumber?: number;
  holeName?: string;
  par?: number;
  holeDistanceMeters?: number;
  strokes?: number;
  totalStrokes?: number;
  personalBest?: number | null;
  dailyBest?: { bestStrokes?: number } | null;
  hydratePersonalBest?: () => void;
  hydrateDailyBest?: () => void;
  selectedClub?: ClubId;
  selectClub?: (club: ClubId) => void;
  setSelectedClub?: (club: ClubId, manual?: boolean) => void;
  shotPhase?: ShotPhase;
  ballPhase?: string;
  aimPower?: number;
  aimPreview?: { isAiming?: boolean; power?: number };
  distanceToPinMeters?: number;
  ballPosition?: Vec3Tuple;
  currentSurfaceTag?: PhysicsSurfaceTag;
  isStreetScoutActive?: boolean;
  cameraMode?: string;
  toggleStreetScout?: () => void;
  toggleCameraMode?: () => void;
  isMuted?: boolean;
  muted?: boolean;
  toggleMute?: () => void;
  toggleMuted?: () => void;
  isHoleComplete?: boolean;
  isRoundComplete?: boolean;
  penaltyStrokes?: number;
  lastEventBanner?: string | null;
  trickToast?: { seq: number; label: string } | null;
  replayHole?: () => void;
  resetHole?: () => void;
  restartRound?: () => void;
  soundEventSeq?: number;
  lastSoundEvent?: SoundEventPayload | null;
}

const CLUB_UI_META: Record<
  ClubId,
  { label: string; badge: string; accentHex: string }
> = {
  driver: {
    label: 'Sky Driver',
    badge: 'Carry',
    accentHex: CLUB_SPECS.driver.accentHex,
  },
  wedge: {
    label: 'Cloud Lobber',
    badge: 'Wedge',
    accentHex: CLUB_SPECS.wedge.accentHex,
  },
  skimmer: {
    label: 'Curb Skimmer',
    badge: 'Low Punch',
    accentHex: CLUB_SPECS.skimmer.accentHex,
  },
  putter: {
    label: 'Sidewalk Putter',
    badge: 'Roll',
    accentHex: CLUB_SPECS.putter.accentHex,
  },
};

function formatLieDisplay(
  surfaceTag: PhysicsSurfaceTag | undefined,
  strokes: number,
  isOnTeeBox: boolean,
): { label: string; dotColor: string } {
  if (
    strokes === 0 &&
    isOnTeeBox &&
    (!surfaceTag || surfaceTag === 'road_asphalt')
  ) {
    return { label: 'Tee Box', dotColor: '#D95D39' };
  }

  switch (surfaceTag) {
    case 'road_asphalt':
      return { label: '5th Ave Fairway', dotColor: '#64748B' };
    case 'crosswalk_landing':
      return { label: 'Mercer Crosswalk', dotColor: '#F59E0B' };
    case 'loading_zone_asphalt':
      return { label: 'Loading Zone', dotColor: '#FACC15' };
    case 'sidewalk_paver':
      return { label: 'Sidewalk', dotColor: '#D6B88D' };
    case 'subway_brick_plaza':
      return { label: 'Subway Plaza', dotColor: '#B45309' };
    case 'storm_gutter':
      return { label: 'Storm Gutter', dotColor: '#0EA5E9' };
    case 'stone_curb':
      return { label: 'Stone Curb', dotColor: '#94A3B8' };
    case 'courtyard_ramp':
      return { label: 'Courtyard Ramp', dotColor: '#C28E5C' };
    case 'courtyard_paver':
      return { label: 'Courtyard Stone', dotColor: '#E0BA84' };
    case 'green_fringe_collar':
      return { label: 'Green Fringe', dotColor: '#16A34A' };
    case 'putting_green_turf':
      return { label: 'Putting Green', dotColor: '#22C55E' };
    case 'patio_rough':
      return { label: 'Patio Rough', dotColor: '#65A30D' };
    case 'fountain_hazard':
      return { label: 'Fountain Drop', dotColor: '#0284C7' };
    case 'awning_cushion':
      return { label: 'Awning Cushion', dotColor: '#EF4444' };
    case 'umbrella_bounce':
      return { label: 'Café Umbrella', dotColor: '#F97316' };
    case 'van_ramp_metal':
      return { label: 'Van Ramp', dotColor: '#475569' };
    case 'van_roof_deck':
      return { label: 'Van Roof', dotColor: '#334155' };
    case 'masonry_wall':
      return { label: 'Brick Wall', dotColor: '#9A3412' };
    default:
      return { label: 'Tee Box', dotColor: '#D95D39' };
  }
}

function getBannerBadgeEmoji(banner: string): string {
  const lower = banner.toLowerCase();
  if (lower.includes('awning') || lower.includes('umbrella')) return '🎪';
  if (lower.includes('gutter') || lower.includes('hydrant')) return '💦';
  if (lower.includes('steam')) return '💨';
  if (lower.includes('fountain') || lower.includes('penalty')) return '💧';
  if (lower.includes('van') || lower.includes('ramp')) return '🚐';
  if (lower.includes('scaffold')) return '🏗️';
  if (lower.includes('cup') || lower.includes('hole')) return '⛳';
  return '✨';
}

function formatPinDistance(meters: number): string {
  const clamped = Math.max(0, meters);
  if (clamped < 10) {
    return `${clamped.toFixed(1)}m`;
  }
  return `${Math.round(clamped)}m`;
}

export function CurbsideHud() {
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

  const personalBest = useCurbsideStore((s) => {
    const st = s as unknown as StoreCompat;
    if (st.personalBest !== undefined) return st.personalBest;
    return st.dailyBest?.bestStrokes ?? null;
  });

  const selectedClub = useCurbsideStore(
    (s) => ((s as unknown as StoreCompat).selectedClub ?? 'driver') as ClubId,
  );

  const shotPhase = useCurbsideStore((s) => {
    const st = s as unknown as StoreCompat;
    if (st.shotPhase) return st.shotPhase;
    if (st.ballPhase === 'cupped') return 'holed_out';
    if (st.ballPhase === 'inflight') return 'ball_in_flight';
    if (st.ballPhase === 'hazard_drop') return 'fountain_drop';
    if (st.aimPreview?.isAiming) return 'pulling';
    return 'aiming';
  });

  const aimPower = useCurbsideStore((s) => {
    const st = s as unknown as StoreCompat;
    if (typeof st.aimPower === 'number') return st.aimPower;
    return st.aimPreview?.power ?? 0;
  });

  const ballPosition = useCurbsideStore(
    (s) => (s as unknown as StoreCompat).ballPosition,
  );

  const distanceToPinMeters = useCurbsideStore((s) => {
    const st = s as unknown as StoreCompat;
    if (typeof st.distanceToPinMeters === 'number') {
      return st.distanceToPinMeters;
    }
    if (Array.isArray(st.ballPosition)) {
      const dx = HOLE_1_CUP.position[0] - st.ballPosition[0];
      const dz = HOLE_1_CUP.position[2] - st.ballPosition[2];
      return Math.hypot(dx, dz);
    }
    return holeDistanceMeters;
  });

  const currentSurfaceTag = useCurbsideStore(
    (s) => (s as unknown as StoreCompat).currentSurfaceTag,
  );

  const isStreetScoutActive = useCurbsideStore((s) => {
    const st = s as unknown as StoreCompat;
    if (typeof st.isStreetScoutActive === 'boolean') {
      return st.isStreetScoutActive;
    }
    return st.cameraMode === 'street_scout';
  });

  const isMuted = useCurbsideStore((s) => {
    const st = s as unknown as StoreCompat;
    if (typeof st.isMuted === 'boolean') return st.isMuted;
    return st.muted ?? false;
  });

  const isHoleComplete = useCurbsideStore((s) => {
    const st = s as unknown as StoreCompat;
    return Boolean(
      st.isHoleComplete || st.isRoundComplete || st.shotPhase === 'holed_out',
    );
  });

  const lastEventBanner = useCurbsideStore((s) => {
    const st = s as unknown as StoreCompat;
    return st.lastEventBanner ?? st.trickToast?.label ?? null;
  });

  // Track Personal Best prior to completion so ScorecardModal knows when beaten
  const previousBestRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isHoleComplete) {
      previousBestRef.current = personalBest;
    }
  }, [isHoleComplete, personalBest]);

  // Hydrate Personal Best & keep Web Audio mute state synced with store
  useEffect(() => {
    const initState = useCurbsideStore.getState() as unknown as StoreCompat;
    initState.hydratePersonalBest?.();
    initState.hydrateDailyBest?.();

    const initialMuted = Boolean(initState.isMuted ?? initState.muted ?? false);
    soundEngine.setMuted(initialMuted);

    let lastMuted = initialMuted;
    const unsubscribe = useCurbsideStore.subscribe((rawState) => {
      const state = rawState as unknown as StoreCompat;
      const nextMuted = Boolean(state.isMuted ?? state.muted ?? false);
      if (nextMuted !== lastMuted) {
        lastMuted = nextMuted;
        soundEngine.setMuted(nextMuted);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleSelectClub = (clubId: ClubId) => {
    soundEngine.unlock();
    soundEngine.playUiClick(0.75);
    const st = useCurbsideStore.getState() as unknown as StoreCompat;
    if (st.selectClub) {
      st.selectClub(clubId);
    } else {
      st.setSelectedClub?.(clubId, true);
    }
  };

  const handleToggleStreetScout = () => {
    soundEngine.unlock();
    soundEngine.playUiClick(0.8);
    const st = useCurbsideStore.getState() as unknown as StoreCompat;
    if (st.toggleStreetScout) {
      st.toggleStreetScout();
    } else {
      st.toggleCameraMode?.();
    }
  };

  const handleToggleMute = () => {
    const st = useCurbsideStore.getState() as unknown as StoreCompat;
    const wasMuted = Boolean(st.isMuted ?? st.muted ?? false);
    if (st.toggleMute) {
      st.toggleMute();
    } else {
      st.toggleMuted?.();
    }
    if (wasMuted) {
      soundEngine.setMuted(false);
      soundEngine.unlock();
      soundEngine.playUiClick(0.75);
    } else {
      soundEngine.setMuted(true);
    }
  };

  const handleReplayHole = () => {
    soundEngine.unlock();
    soundEngine.playUiClick(0.85);
    const st = useCurbsideStore.getState() as unknown as StoreCompat;
    if (st.replayHole) {
      st.replayHole();
    } else if (st.resetHole) {
      st.resetHole();
    } else {
      st.restartRound?.();
    }
  };

  const qaFreeze = useQaFreeze();
  const isOnTeeBox =
    Array.isArray(ballPosition) &&
    Math.hypot(
      ballPosition[0] - TEE_POSITION[0],
      ballPosition[2] - TEE_POSITION[2],
    ) <= 2.0;
  const lie = formatLieDisplay(currentSurfaceTag, strokes, isOnTeeBox);

  const activeClubAccent = CLUB_SPECS[selectedClub]?.accentHex ?? '#FF6B4A';
  const showScoutHint =
    !isHoleComplete && isStreetScoutActive && !lastEventBanner;
  const showPullHint =
    !isHoleComplete &&
    !isStreetScoutActive &&
    strokes === 0 &&
    shotPhase === 'aiming' &&
    aimPower <= 0.01 &&
    !lastEventBanner;
  const isPulling = !isHoleComplete && shotPhase === 'pulling';
  const displayDistance =
    strokes === 0 && isOnTeeBox ? holeDistanceMeters : distanceToPinMeters;
  const transitionCls = qaFreeze
    ? 'transition-none'
    : 'transition-[transform,opacity,background-color,color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)]';

  return (
    <div
      data-qa-freeze={qaFreeze ? '1' : undefined}
      className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between overflow-hidden"
      style={{
        paddingTop:
          'max(0.55rem, var(--safe-top, env(safe-area-inset-top, 0px)))',
        paddingBottom:
          'max(0.7rem, var(--safe-bottom, env(safe-area-inset-bottom, 0px)))',
        paddingLeft:
          'max(0.625rem, var(--safe-left, env(safe-area-inset-left, 0px)))',
        paddingRight:
          'max(0.625rem, var(--safe-right, env(safe-area-inset-right, 0px)))',
      }}
    >
      {/* TOP WHISPER BAR + DYNAMIC LIE / EVENT TOAST (fades out cleanly behind ScorecardModal) */}
      <div
        aria-hidden={isHoleComplete}
        className={`pointer-events-none flex flex-col gap-1.5 ${
          qaFreeze
            ? 'transition-none'
            : 'transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]'
        } ${isHoleComplete ? 'opacity-0' : 'opacity-100'}`}
      >
        <header className="pointer-events-none flex items-start justify-between gap-1.5">
          {/* Left Compact Hole Pill */}
          <div
            aria-label={`Hole ${holeNumber}, ${holeName}, Par ${par}, ${formatPinDistance(displayDistance)} to pin`}
            className="pointer-events-none inline-flex min-h-[44px] min-w-0 shrink flex-col justify-center rounded-2xl border border-[#E2C294] bg-[#FFFDF8]/92 px-3 py-1 text-[#231914] shadow-[0_6px_18px_-6px_rgba(35,25,20,0.2)] backdrop-blur-sm"
          >
            <div className="flex items-center gap-1.5 text-[11px] leading-tight font-black tracking-tight uppercase">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#D95D39]" />
              <span className="truncate">
                Hole {holeNumber} • {holeName}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] leading-tight font-extrabold text-[#543E32] tabular-nums">
              <span>PAR {par}</span>
              <span aria-hidden="true" className="text-[#C7A67B]">
                •
              </span>
              <span className="text-[#B93815]">
                {formatPinDistance(displayDistance)} to pin
              </span>
            </div>
          </div>

          {/* Right Compact Controls Capsule */}
          <div
            data-hud-interactive="true"
            onPointerDown={(e) => e.stopPropagation()}
            className="pointer-events-auto inline-flex shrink-0 items-center rounded-full border border-[#E2C294] bg-[#FFFDF8]/92 p-0.5 shadow-[0_6px_18px_-6px_rgba(35,25,20,0.2)] backdrop-blur-sm"
          >
            {/* 1-Tap Street Scout Peek Toggle */}
            <button
              type="button"
              aria-label={
                isStreetScoutActive
                  ? 'Exit Street Scout Peek'
                  : 'Street Scout Peek'
              }
              aria-pressed={isStreetScoutActive}
              title="Street Scout Peek"
              onClick={handleToggleStreetScout}
              style={{ willChange: qaFreeze ? undefined : 'transform, opacity' }}
              className={`relative flex h-11 w-11 items-center justify-center rounded-full ${transitionCls} active:scale-[0.93] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231914] ${
                isStreetScoutActive
                  ? 'scale-[1.03] bg-[#D95D39] text-[#FFFDF8] shadow-[0_2px_10px_-2px_rgba(217,93,57,0.55)]'
                  : 'text-[#231914] hover:bg-[#F5E6CE]/80'
              }`}
            >
              {/* Elevated Corner Overview Eye/Map Icon */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="h-[19px] w-[19px]"
              >
                <path
                  d="M2.8 12C4.9 8.2 8.2 6.2 12 6.2C15.8 6.2 19.1 8.2 21.2 12C19.1 15.8 15.8 17.8 12 17.8C8.2 17.8 4.9 15.8 2.8 12Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="2.6"
                  fill="currentColor"
                />
              </svg>
            </button>

            {/* Sound Mute Toggle */}
            <button
              type="button"
              aria-label={isMuted ? 'Unmute Sound' : 'Mute Sound'}
              aria-pressed={!isMuted}
              title={isMuted ? 'Sound Off' : 'Sound On'}
              onClick={handleToggleMute}
              style={{ willChange: qaFreeze ? undefined : 'transform, opacity' }}
              className={`flex h-11 w-11 items-center justify-center rounded-full ${transitionCls} active:scale-[0.93] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231914] ${
                isMuted
                  ? 'bg-[#EADAC2] text-[#4A3629]'
                  : 'text-[#231914] hover:bg-[#F5E6CE]/80'
              }`}
            >
              {isMuted ? (
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

            {/* Quick Reset-Hole Button */}
            <button
              type="button"
              aria-label="Reset Hole"
              title="Reset Hole"
              onClick={handleReplayHole}
              style={{ willChange: qaFreeze ? undefined : 'transform, opacity' }}
              className={`flex h-11 w-11 items-center justify-center rounded-full text-[#231914] ${transitionCls} hover:bg-[#F5E6CE]/80 active:scale-[0.93] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231914]`}
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
          </div>
        </header>

        {/* Sub-Row: Subtle Lie Pill (Left) + Stroke & Personal Best Badge (Right) */}
        <div className="pointer-events-none flex items-center justify-between gap-2">
          <div
            aria-label={`Current lie: ${lie.label}`}
            className={`pointer-events-none inline-flex items-center gap-1.5 rounded-full border border-[#E2C294]/90 bg-[#FFFDF8]/88 px-2.5 py-1 text-[11px] leading-none font-extrabold tracking-tight text-[#231914] shadow-[0_4px_12px_-4px_rgba(35,25,20,0.16)] backdrop-blur-sm ${transitionCls}`}
          >
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 rounded-full ${transitionCls}`}
              style={{ backgroundColor: lie.dotColor }}
            />
            <span>{lie.label}</span>
          </div>

          <div
            aria-label={`Stroke ${strokes}${personalBest !== null ? `, Best ${personalBest}` : ''}`}
            className="pointer-events-none inline-flex items-center gap-1.5 rounded-full border border-[#E2C294]/90 bg-[#FFFDF8]/92 px-2.5 py-1 text-[11px] leading-none font-extrabold tracking-tight text-[#231914] shadow-[0_4px_12px_-4px_rgba(35,25,20,0.16)] backdrop-blur-sm tabular-nums"
          >
            <span className="text-[#6B5142] uppercase">Stroke</span>
            <span className="text-[12.5px] font-black text-[#231914]">
              {strokes}
            </span>
            {personalBest !== null && (
              <>
                <span aria-hidden="true" className="h-3 w-[1px] bg-[#E2C294]" />
                <span className="inline-flex items-center rounded-full border border-[#D99B26]/70 bg-[#FEF08A] px-1.5 py-0.5 text-[9.5px] font-black text-[#422006]">
                  BEST {personalBest}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Celebratory Event / Trick-Shot Toast */}
        {lastEventBanner && !isHoleComplete && (
          <div
            key={lastEventBanner}
            role="status"
            aria-live="polite"
            style={{ willChange: qaFreeze ? undefined : 'transform, opacity' }}
            className={`${qaFreeze ? '' : 'animate-toast-pop '}pointer-events-none mt-0.5 flex justify-center`}
          >
            <div className="pointer-events-none inline-flex items-center gap-1.5 rounded-full border border-[#D95D39]/50 bg-[#FFFDF8]/96 px-3.5 py-1 text-[12px] font-black tracking-tight text-[#231914] shadow-[0_8px_20px_-6px_rgba(35,25,20,0.24)]">
              <span aria-hidden="true">
                {getBannerBadgeEmoji(lastEventBanner)}
              </span>
              <span>{lastEventBanner}</span>
            </div>
          </div>
        )}
      </div>

      {/* HOLE COMPLETE CELEBRATION CARD */}
      <ScorecardModal previousBest={previousBestRef.current} />

      {/* BOTTOM THUMB ZONE: Pull Meter / Gesture Hint + 4-Club Selector Dock */}
      {!isHoleComplete && (
        <div className="pointer-events-none flex flex-col items-center gap-1.5">
          {/* Pre-Stroke 1 or Street Scout Non-Intrusive Gesture Hint */}
          {(showScoutHint || showPullHint) && (
            <div className="pointer-events-none flex justify-center">
              <div className="pointer-events-none inline-flex items-center rounded-full border border-[#E2C294]/90 bg-[#FFFDF8]/90 px-3 py-1 text-[11px] font-extrabold tracking-tight text-[#231914] shadow-[0_6px_16px_-6px_rgba(35,25,20,0.18)] backdrop-blur-sm">
                {showScoutHint
                  ? 'Drag screen to orbit • Tap eye icon to aim'
                  : 'Pull back to power & aim • Drag screen to look'}
              </div>
            </div>
          )}

          {/* Tactile Pull Power Meter (GPU scaleX, zero width-layout thrashing, zero input lag) */}
          {isPulling && (
            <div
              style={{ willChange: qaFreeze ? undefined : 'transform, opacity' }}
              className={`${qaFreeze ? '' : 'animate-toast-pop '}pointer-events-none flex flex-col items-center gap-1`}
            >
              {aimPower < 0.08 && (
                <span className="rounded-full bg-[#231914]/85 px-2.5 py-0.5 text-[10.5px] font-bold text-[#FFFDF8]">
                  Release near ball to cancel
                </span>
              )}
              <div className="pointer-events-none flex items-center gap-2 rounded-full border border-[#E2C294] bg-[#FFFDF8]/90 px-2.5 py-1 shadow-sm">
                <div className="h-2 w-36 overflow-hidden rounded-full bg-[#231914]/15">
                  <div
                    className="h-full w-full origin-left rounded-full"
                    style={{
                      transform: `scaleX(${Math.max(0.04, Math.min(1, aimPower))})`,
                      backgroundColor: activeClubAccent,
                      willChange: qaFreeze ? undefined : 'transform',
                      transition: 'none',
                    }}
                  />
                </div>
                <span className="w-8 text-right text-[10.5px] font-black text-[#231914] tabular-nums">
                  {Math.round(Math.max(0, Math.min(1, aimPower)) * 100)}%
                </span>
              </div>
            </div>
          )}

          {/* Bottom 4-Club Selector Dock */}
          <nav
            aria-label="Golf Clubs"
            data-hud-interactive="true"
            onPointerDown={(e) => e.stopPropagation()}
            className="pointer-events-auto mx-auto grid w-full max-w-[23.5rem] grid-cols-4 gap-1 rounded-[1.45rem] border border-[#E2C294] bg-[#FFFDF8]/95 p-1 shadow-[0_12px_28px_-8px_rgba(35,25,20,0.26)] backdrop-blur-sm"
          >
            {CLUB_ORDER.map((clubId) => {
              const meta = CLUB_UI_META[clubId];
              const isSelected = selectedClub === clubId;
              return (
                <button
                  key={clubId}
                  type="button"
                  aria-label={`${meta.label} (${meta.badge})`}
                  aria-pressed={isSelected}
                  onClick={() => handleSelectClub(clubId)}
                  style={{
                    willChange: qaFreeze ? undefined : 'transform, opacity',
                    ...(isSelected
                      ? {
                          boxShadow: `0 3px 10px -2px rgba(35,25,20,0.34), inset 0 0 0 2px ${meta.accentHex}`,
                        }
                      : {}),
                  }}
                  className={`relative flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-[1.1rem] px-1 py-1.5 text-center leading-none ${transitionCls} active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231914] ${
                    isSelected
                      ? 'scale-[1.015] bg-[#231914] text-[#FFFDF8]'
                      : 'text-[#231914] hover:bg-[#F5E6CE]/75'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-flex shrink-0 items-center justify-center ${transitionCls}`}
                    style={isSelected ? { color: meta.accentHex } : undefined}
                  >
                    <ClubHeadIcon club={clubId} className="h-4 w-4" />
                  </span>
                  <span className="mt-0.5 text-[9.5px] leading-[1.08] font-black tracking-[-0.02em] whitespace-nowrap">
                    {meta.label}
                  </span>
                  <span
                    className={`text-[8.5px] leading-none font-extrabold tracking-wide uppercase ${
                      isSelected ? 'text-[#FDE68A]' : 'text-[#6B5142]'
                    }`}
                  >
                    {meta.badge}
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
