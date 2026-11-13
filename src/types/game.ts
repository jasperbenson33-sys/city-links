import type { ClubId } from './clubs';
import type { FlagColor, Vec3Tuple } from './course';

export type CameraMode = 'follow' | 'street_scout' | 'focus' | 'overview';

export type RoundMode = 'hole1' | 'daily' | 'random';

export type BallPhase =
  | 'resting'
  | 'aiming'
  | 'inflight'
  | 'hazard_drop'
  | 'cupped';

export interface SunkFlagEntry {
  color: FlagColor;
  /** Strokes taken on this hole/leg */
  strokes: number;
  /** 0-based order sunk */
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
  /** Optional 0..1 intensity or sunk flag index */
  intensity?: number;
  flagIndex?: number;
}

export type TrickToastKind =
  | 'awning_bank'
  | 'umbrella_bounce'
  | 'van_roof_launch'
  | 'scaffolding_thread'
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
  /** UTC YYYY-MM-DD or hole identifier */
  dateSeed: string;
  bestStrokes: number;
  sunkOrder: SunkFlagEntry[];
}

export interface HoleScoreSummary {
  holeNumber: number;
  holeName: string;
  par: number;
  strokes: number;
  deltaToPar: number;
  label:
    | 'Hole-in-One!'
    | 'Albatross'
    | 'Eagle'
    | 'Birdie'
    | 'Par'
    | 'Bogey'
    | 'Double Bogey'
    | 'Triple+';
}
