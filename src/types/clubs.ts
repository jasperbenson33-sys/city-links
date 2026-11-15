import type { Vec3Tuple } from './course';

export type ClubId = 'driver' | 'wedge' | 'skimmer' | 'putter';

export const CLUB_ORDER: readonly ClubId[] = [
  'driver',
  'wedge',
  'skimmer',
  'putter',
] as const;

export const BALL_RADIUS = 0.18;
export const CUP_RADIUS = 0.42;
export const CUP_DEPTH = 0.42;
export const CUP_APRON_RADIUS = 1.5;
export const AUTO_PUTTER_DISTANCE = 6.5;
export const WORLD_GRAVITY_Y = -18.0;

export interface ClubSpec {
  id: ClubId;
  /** Primary UI title (e.g. 'Street Driver', 'Cloud Lobber Wedge', 'Curb Skimmer', 'Brass Putter') */
  name: string;
  /** Short compact label for compact pill buttons */
  shortName: string;
  /** Trajectory badge subtitle ('Sky' | 'Lob' | 'Curb' | 'Roll') */
  subtitle: 'Sky' | 'Lob' | 'Curb' | 'Roll';
  /** Crisp one-line tactile description */
  tagline: string;
  accentHex: string;
  arcHex: string;
  /** Minimum launch speed (m/s) at minimum valid pull */
  minSpeed: number;
  /** Maximum launch speed (m/s) at 100% pull */
  maxSpeed: number;
  /** Launch angle above horizontal XZ plane in degrees */
  launchAngleDeg: number;
  /** Rapier linearDamping while airborne */
  flightDamping: number;
  /** Rapier linearDamping while rolling on standard ground */
  rollDamping: number;
  /** Ball restitution coefficient for this club */
  restitution: number;
  /** Horizontal speed retention multiplier on first turf bounce (lower = softer wedge check) */
  turfCheckMultiplier: number;
  /** Nominal flat-ground carry distance at 100% power (meters) */
  nominalCarryMeters: number;
  /** Nominal flat-ground roll-out after landing at 100% power (meters) */
  nominalRollMeters: number;
  /** True if shot stays knee-high (< 0.48m apex) to thread under scaffolding & carts */
  canThreadUnderpass: boolean;
}

export const CLUB_SPECS: Record<ClubId, ClubSpec> = {
  driver: {
    id: 'driver',
    name: 'Street Driver',
    shortName: 'Driver',
    subtitle: 'Sky',
    tagline: 'Sweeping carry down 5th Ave to the Crosswalk A-Position',
    accentHex: '#FF6B4A',
    arcHex: '#FF8566',
    minSpeed: 7.0,
    maxSpeed: 26.5,
    launchAngleDeg: 28,
    flightDamping: 0.07,
    rollDamping: 1.25,
    restitution: 0.52,
    turfCheckMultiplier: 0.82,
    nominalCarryMeters: 31.8,
    nominalRollMeters: 7.6,
    canThreadUnderpass: false,
  },
  wedge: {
    id: 'wedge',
    name: 'Cloud Lobber Wedge',
    shortName: 'Wedge',
    subtitle: 'Lob',
    tagline: 'High parachute arc banking off awnings & clearing courtyard walls',
    accentHex: '#38BDF8',
    arcHex: '#7DD3FC',
    minSpeed: 5.0,
    maxSpeed: 21.5,
    launchAngleDeg: 50,
    flightDamping: 0.14,
    rollDamping: 3.1,
    restitution: 0.28,
    turfCheckMultiplier: 0.45,
    nominalCarryMeters: 22.4,
    nominalRollMeters: 1.4,
    canThreadUnderpass: false,
  },
  skimmer: {
    id: 'skimmer',
    name: 'Curb Skimmer',
    shortName: 'Skimmer',
    subtitle: 'Curb',
    tagline: 'Low punch under scaffolding, up van ramps & around storm gutters',
    accentHex: '#FACC15',
    arcHex: '#FDE047',
    minSpeed: 5.0,
    maxSpeed: 24.5,
    launchAngleDeg: 6.0,
    flightDamping: 0.04,
    rollDamping: 0.76,
    restitution: 0.62,
    turfCheckMultiplier: 0.93,
    nominalCarryMeters: 5.8,
    nominalRollMeters: 31.5,
    canThreadUnderpass: true,
  },
  putter: {
    id: 'putter',
    name: 'Brass Putter',
    shortName: 'Putter',
    subtitle: 'Roll',
    tagline: 'True pocket-park AstroTurf roll with generous cup capture',
    accentHex: '#22C55E',
    arcHex: '#6EE7B7',
    minSpeed: 1.8,
    maxSpeed: 14.0,
    launchAngleDeg: 0,
    flightDamping: 0.04,
    rollDamping: 1.6,
    restitution: 0.36,
    turfCheckMultiplier: 0.96,
    nominalCarryMeters: 0,
    nominalRollMeters: 13.5,
    canThreadUnderpass: true,
  },
};

export interface ComputeTrajectoryOptions {
  /** Ball launch origin [x, y, z] in world space */
  origin: Vec3Tuple;
  clubId: ClubId;
  /** Normalized pull power in [0, 1] */
  power: number;
  /**
   * Horizontal aim direction [dx, dz] or [dx, dy, dz] in world XZ.
   * Preferred over aimYaw when aiming via touch/mouse drag vector.
   */
  aimDirection?: [number, number] | Vec3Tuple;
  /**
   * Horizontal compass yaw in radians: 0 = North (-Z), +PI/2 = East (+X), PI = South (+Z), -PI/2 = West (-X).
   */
  aimYaw?: number;
  /** Flat landing plane Y if sampleGroundY is omitted */
  groundY?: number;
  /** Optional world surface height sampler (x, z) => surfaceY for multi-tier street/sidewalk/courtyard preview */
  sampleGroundY?: (x: number, z: number) => number;
  /** Fixed physics integration step in seconds (defaults to 1/60 to match Rapier) */
  dt?: number;
  /** Max simulation steps (defaults to 180 = 3.0s) */
  maxSteps?: number;
}

export interface DeterministicTrajectoryResult {
  clubId: ClubId;
  /** Clamped normalized power in [0, 1] */
  power: number;
  /** Unit horizontal aim vector [dx, dz] */
  horizontalDirection: [number, number];
  /** Exact initial linear velocity [vx, vy, vz] to pass directly to Rapier setLinvel */
  launchVelocity: Vec3Tuple;
  /** Sampled 3D arc points [x, y, z] from origin to first ground contact */
  arcPoints: Vec3Tuple[];
  /** First ground/surface landing position [x, surfaceY, z] */
  landingPoint: Vec3Tuple;
  /** Estimated resting point [x, surfaceY, z] after flat-surface rollout */
  estimatedStopPoint: Vec3Tuple;
  /** Visual landing zone ring radius in meters */
  landingRingRadius: number;
  /** Maximum apex Y reached during flight */
  apexY: number;
  /** Maximum height above launch origin Y */
  maxClearanceAboveOrigin: number;
  /** Airborne flight duration in seconds */
  flightDurationSeconds: number;
}
