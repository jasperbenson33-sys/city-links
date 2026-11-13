import {
  BALL_RADIUS,
  CLUB_SPECS,
  WORLD_GRAVITY_Y,
  type ClubId,
  type ComputeTrajectoryOptions,
  type DeterministicTrajectoryResult,
} from '../types/clubs';
import type { Vec3Tuple } from '../types/course';

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * Resolves a unit horizontal XZ aim vector `[dx, dz]` from either `aimDirection` or compass `aimYaw`.
 * Compass `aimYaw` convention: `0` = North (`[0, -1]`), `+PI/2` = East (`[1, 0]`), `PI` = South (`[0, 1]`).
 */
export function resolveHorizontalAim(
  aimDirection?: [number, number] | Vec3Tuple,
  aimYaw = 0,
): [number, number] {
  if (aimDirection) {
    const rx = aimDirection[0];
    const rz = aimDirection.length === 3 ? aimDirection[2] : aimDirection[1];
    const len = Math.hypot(rx, rz);
    if (len > 1e-6) {
      return [rx / len, rz / len];
    }
  }
  return [Math.sin(aimYaw), -Math.cos(aimYaw)];
}

/**
 * Computes deterministic launch speed (m/s) for a club and normalized pull power in [0, 1].
 */
export function computeClubLaunchSpeed(clubId: ClubId, power: number): number {
  const spec = CLUB_SPECS[clubId];
  const p = clamp01(power);
  if (p <= 0) return 0;
  return spec.minSpeed + (spec.maxSpeed - spec.minSpeed) * p;
}

/**
 * Computes exact initial linear velocity `[vx, vy, vz]` to apply to the ball RigidBody.
 */
export function computeClubLaunchVelocity(
  clubId: ClubId,
  power: number,
  aimDirection?: [number, number] | Vec3Tuple,
  aimYaw = 0,
): Vec3Tuple {
  const spec = CLUB_SPECS[clubId];
  const speed = computeClubLaunchSpeed(clubId, power);
  const [dx, dz] = resolveHorizontalAim(aimDirection, aimYaw);
  const angleRad = (spec.launchAngleDeg * Math.PI) / 180;
  const vh = speed * Math.cos(angleRad);
  const vy = speed * Math.sin(angleRad);
  return [dx * vh, vy, dz * vh];
}

/**
 * Shared deterministic trajectory integrator used by BOTH:
 * 1. Gameplay 3D Aim Arc & Landing Ring (`AimControlsAndArc.tsx`), matching Rapier fixed-step integration (`dt = 1/60`).
 * 2. Procedural Solver multi-club reachability verification (`validateGeneratedCourse`).
 */
export function computeDeterministicTrajectory(
  opts: ComputeTrajectoryOptions,
): DeterministicTrajectoryResult {
  const spec = CLUB_SPECS[opts.clubId];
  const power = clamp01(opts.power);
  const horizontalDirection = resolveHorizontalAim(opts.aimDirection, opts.aimYaw);
  const launchVelocity = computeClubLaunchVelocity(
    opts.clubId,
    power,
    horizontalDirection,
  );

  const dt = opts.dt ?? 1 / 60;
  const maxSteps = opts.maxSteps ?? 180;
  const defaultSurfaceY = opts.groundY ?? opts.origin[1] - BALL_RADIUS;

  // For pure ground roll (putter) or zero power, trace clean ground rollout directly
  if (power <= 1e-4) {
    const surfaceY = opts.sampleGroundY
      ? opts.sampleGroundY(opts.origin[0], opts.origin[2])
      : defaultSurfaceY;
    const pt: Vec3Tuple = [opts.origin[0], surfaceY + BALL_RADIUS, opts.origin[2]];
    return {
      clubId: opts.clubId,
      power: 0,
      horizontalDirection,
      launchVelocity: [0, 0, 0],
      arcPoints: [pt],
      landingPoint: [opts.origin[0], surfaceY, opts.origin[2]],
      estimatedStopPoint: [opts.origin[0], surfaceY, opts.origin[2]],
      landingRingRadius: 0.25,
      apexY: opts.origin[1],
      maxClearanceAboveOrigin: 0,
      flightDurationSeconds: 0,
    };
  }

  if (spec.launchAngleDeg <= 0.2) {
    // Putter ground roll preview
    const rollSpeed = Math.hypot(launchVelocity[0], launchVelocity[2]);
    // Integrate damped ground roll: dv/dt = -rollDamping * v - frictionDecel
    let vx = launchVelocity[0];
    let vz = launchVelocity[2];
    let x = opts.origin[0];
    let z = opts.origin[2];
    const arcPoints: Vec3Tuple[] = [[x, opts.origin[1], z]];

    for (let step = 1; step <= maxSteps; step++) {
      const dampingFactor = 1 / (1 + dt * (spec.rollDamping + 0.45));
      vx *= dampingFactor;
      vz *= dampingFactor;
      const spd = Math.hypot(vx, vz);
      const coulombDecel = 1.35 * dt;
      if (spd <= coulombDecel || spd < 0.12) {
        break;
      }
      const scale = (spd - coulombDecel) / spd;
      vx *= scale;
      vz *= scale;
      x += vx * dt;
      z += vz * dt;
      const sy = opts.sampleGroundY ? opts.sampleGroundY(x, z) : defaultSurfaceY;
      if (step % 3 === 0) {
        arcPoints.push([x, sy + BALL_RADIUS + 0.02, z]);
      }
    }

    const finalSurfaceY = opts.sampleGroundY
      ? opts.sampleGroundY(x, z)
      : defaultSurfaceY;
    arcPoints.push([x, finalSurfaceY + BALL_RADIUS + 0.02, z]);

    return {
      clubId: opts.clubId,
      power,
      horizontalDirection,
      launchVelocity,
      arcPoints,
      landingPoint: [x, finalSurfaceY, z],
      estimatedStopPoint: [x, finalSurfaceY, z],
      landingRingRadius: Math.max(0.28, Math.min(0.55, 0.24 + rollSpeed * 0.018)),
      apexY: opts.origin[1],
      maxClearanceAboveOrigin: 0,
      flightDurationSeconds: 0,
    };
  }

  // Airborne ballistic integration matching Rapier semi-implicit Euler + linearDamping
  let x = opts.origin[0];
  let y = opts.origin[1];
  let z = opts.origin[2];
  let vx = launchVelocity[0];
  let vy = launchVelocity[1];
  let vz = launchVelocity[2];
  let apexY = y;
  let flightSteps = 0;

  const arcPoints: Vec3Tuple[] = [[x, y, z]];

  for (let step = 1; step <= maxSteps; step++) {
    const prevX = x;
    const prevY = y;
    const prevZ = z;

    vy += WORLD_GRAVITY_Y * dt;
    const damp = 1 / (1 + dt * spec.flightDamping);
    vx *= damp;
    vy *= damp;
    vz *= damp;

    x += vx * dt;
    y += vy * dt;
    z += vz * dt;

    if (y > apexY) apexY = y;
    flightSteps = step;

    const surfaceY = opts.sampleGroundY
      ? opts.sampleGroundY(x, z)
      : defaultSurfaceY;
    const contactCenterY = surfaceY + BALL_RADIUS;

    // Landed on descending branch (or after clearing initial launch step)
    if (step > 2 && vy <= 0 && y <= contactCenterY) {
      const denom = prevY - y;
      const frac = denom > 1e-6 ? Math.max(0, Math.min(1, (prevY - contactCenterY) / denom)) : 1;
      const lx = prevX + (x - prevX) * frac;
      const lz = prevZ + (z - prevZ) * frac;
      const lSurfY = opts.sampleGroundY ? opts.sampleGroundY(lx, lz) : surfaceY;
      arcPoints.push([lx, lSurfY + BALL_RADIUS, lz]);
      x = lx;
      z = lz;
      y = lSurfY + BALL_RADIUS;
      break;
    }

    if (step % 2 === 0) {
      arcPoints.push([x, y, z]);
    }
  }

  const landingSurfaceY = opts.sampleGroundY
    ? opts.sampleGroundY(x, z)
    : defaultSurfaceY;
  const landingPoint: Vec3Tuple = [x, landingSurfaceY, z];

  // Estimate post-landing rollout along horizontalDirection
  const horizLandingSpeed = Math.hypot(vx, vz) * spec.turfCheckMultiplier;
  const estRollDist =
    (horizLandingSpeed * horizLandingSpeed) /
    (2 * (2.6 + spec.rollDamping * 3.4));
  const stopX = x + horizontalDirection[0] * estRollDist;
  const stopZ = z + horizontalDirection[1] * estRollDist;
  const stopSurfaceY = opts.sampleGroundY
    ? opts.sampleGroundY(stopX, stopZ)
    : landingSurfaceY;

  const ringRadius =
    opts.clubId === 'wedge'
      ? 0.42 + power * 0.25
      : opts.clubId === 'driver'
        ? 0.55 + power * 0.45
        : 0.38 + power * 0.3;

  return {
    clubId: opts.clubId,
    power,
    horizontalDirection,
    launchVelocity,
    arcPoints,
    landingPoint,
    estimatedStopPoint: [stopX, stopSurfaceY, stopZ],
    landingRingRadius: ringRadius,
    apexY,
    maxClearanceAboveOrigin: Math.max(0, apexY - opts.origin[1]),
    flightDurationSeconds: flightSteps * dt,
  };
}
