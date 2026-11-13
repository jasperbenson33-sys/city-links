import type { Vec3Tuple } from './course';

export type ClubId = 'driver' | 'wedge' | 'skimmer' | 'putter';

export const CLUB_ORDER: readonly ClubId[] = [
  'driver',
  'wedge',
  'skimmer',
  'putter',
] as const;

export const BALL_RADIUS = 0.18;
export const CUP_RADIUS = 0.38;
export const CUP_DEPTH = 0.14;
export const CUP_APRON_RADIUS = 1.5;
export const AUTO_PUTTER_DISTANCE = 5.5;
export const WORLD_GRAVITY_Y = -18.0;

export interface ClubSpec {
  id: ClubId;
  /** Primary UI title (e.g. 'Driver') */
  name: string;
  /** Trajectory badge subtitle (e.g. 'Sky', 'Lob', 'Curb', 'Roll') */
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
  /** Nominal flat-ground carry distance at 100% power (meters, internal solver reference) */
  nominalCarryMeters: number;
  /** Nominal flat-ground roll-out after landing at 100% power (meters, internal solver reference) */
  nominalRollMeters: number;
  /** Maximum clearance height check: true if shot stays knee-high (< 0.48m apex) for underpasses */
  canThreadUnderpass: boolean;
}

export const CLUB_SPECS: Record<ClubId, ClubSpec> = {
  driver: {
    id: 'driver',
    name: 'Driver',
    subtitle: 'Sky',
    tagline: 'High sweeping carry over streets, vans & onto rooftops',
    accentHex: '#FF6B4A',
    arcHex: '#FF8566',
    minSpeed: 6.5,
    maxSpeed: 22.5,
    launchAngleDeg: 30,
    flightDamping: 0.08,
    rollDamping: 1.35,
    restitution: 0.52,
    turfCheckMultiplier: 0.82,
    nominalCarryMeters: 23.2,
    nominalRollMeters: 5.8,
    canThreadUnderpass: false,
  },
  wedge: {
    id: 'wedge',
    name: 'Wedge',
    subtitle: 'Lob',
    tagline: 'Steep parachute arc clearing walls & checking softly',
    accentHex: '#38BDF8',
    arcHex: '#7DD3FC',
    minSpeed: 4.8,
    maxSpeed: 18.0,
    launchAngleDeg: 52,
    flightDamping: 0.16,
    rollDamping: 3.1,
    restitution: 0.28,
    turfCheckMultiplier: 0.45,
    nominalCarryMeters: 16.2,
    nominalRollMeters: 1.4,
    canThreadUnderpass: false,
  },
  skimmer: {
    id: 'skimmer',
    name: 'Skimmer',
    subtitle: 'Curb',
    tagline: 'Low punch under carts & scaffolding, banks storm gutters',
    accentHex: '#FACC15',
    arcHex: '#FDE047',
    minSpeed: 4.5,
    maxSpeed: 21.0,
    launchAngleDeg: 6.5,
    flightDamping: 0.05,
    rollDamping: 0.88,
    restitution: 0.64,
    turfCheckMultiplier: 0.92,
    nominalCarryMeters: 5.4,
    nominalRollMeters: 18.0,
    canThreadUnderpass: true,
  },
  putter: {
    id: 'putter',
    name: 'Putter',
    subtitle: 'Roll',
    tagline: 'True ground roll with generous cup-lip capture',
    accentHex: '#22C55E',
    arcHex: '#6EE7B7',
    minSpeed: 1.8,
    maxSpeed: 13.5,
    launchAngleDeg: 0,
    flightDamping: 0.04,
    rollDamping: 1.65,
    restitution: 0.36,
    turfCheckMultiplier: 0.96,
    nominalCarryMeters: 0,
    nominalRollMeters: 12.2,
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
   * Preferred over aimYaw when aiming via touch drag vector.
   */
  aimDirection?: [number, number] | Vec3Tuple;
  /**
   * Horizontal compass yaw in radians: 0 = North (-Z), +PI/2 = East (+X), PI = South (+Z), -PI/2 = West (-X).
   * Used when aimDirection is not provided.
   */
  aimYaw?: number;
  /** Flat landing plane Y if sampleGroundY is omitted (defaults to origin[1] - BALL_RADIUS or origin[1]) */
  groundY?: number;
  /** Optional world surface height sampler (x, z) => surfaceY for multi-tier terrace/street landing preview */
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
