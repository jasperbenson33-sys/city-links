import type { ClubId } from './clubs';
import type { FlagColor, Vec3Tuple } from './course';

export type CameraMode = 'overview' | 'focus';

export type RoundMode = 'daily' | 'random';

export type BallPhase =
  | 'resting'
  | 'aiming'
  | 'inflight'
  | 'hazard_drop'
  | 'cupped';

export interface SunkFlagEntry {
  color: FlagColor;
  /** Strokes taken on this leg (since start tee or previous sunk cup) */
  strokes: number;
  /** 0-based order sunk (0..4) */
  orderIndex: number;
}

export type SoundEventType =
  | 'hit_driver'
  | 'hit_wedge'
  | 'hit_skimmer'
  | 'hit_putter'
  | 'curb_clack'
  | 'gutter_bank'
  | 'umbrella_boing'
  | 'hydrant_whoosh'
  | 'steam_hiss'
  | 'pigeon_flutter'
  | 'water_plop'
  | 'cup_rattle'
  | 'flag_chime'
  | 'round_fanfare'
  | 'club_switch'
  | 'ui_tap';

export interface SoundEventPayload {
  seq: number;
  type: SoundEventType;
  /** Optional 0..1 intensity or 0..4 sunk flag index for ascending chimes */
  intensity?: number;
  flagIndex?: number;
}

export type TrickToastKind =
  | 'umbrella_bounce'
  | 'hydrant_surf'
  | 'gutter_bank'
  | 'steam_lift'
  | 'water_penalty'
  | 'scorecard_copied';

export interface TrickToastEvent {
  seq: number;
  kind: TrickToastKind;
  label: string;
}

export interface AimPreviewSnapshot {
  isAiming: boolean;
  clubId: ClubId;
  /** Normalized pull power 0..1 */
  power: number;
  aimDirection: [number, number];
  launchVelocity: Vec3Tuple;
  arcPoints: Vec3Tuple[];
  landingPoint: Vec3Tuple;
  landingRingRadius: number;
}

export interface DailyBestRecord {
  /** UTC YYYY-MM-DD seed */
  dateSeed: string;
  bestStrokes: number;
  sunkOrder: SunkFlagEntry[];
}
