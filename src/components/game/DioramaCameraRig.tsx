'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ISLAND_HALF_SIZE, type FlagPinSpec, type GeneratedCityCourse } from '@/types';
import { useCurbsideStore } from '@/store';

export interface CameraRigControl {
  orbitDelta: (deltaYawRad: number, deltaPitchRad: number) => void;
  zoomByFactor: (factor: number) => void;
  panByScreenDelta: (dxPx: number, dyPx: number, viewportHeightPx: number) => void;
  resetView: () => void;
  getCurrentYaw: () => number;
}

interface DioramaCameraRigProps {
  ballWorldPositionRef: MutableRefObject<THREE.Vector3>;
  controlRef: MutableRefObject<CameraRigControl | null>;
}

const DEFAULT_OVERVIEW_YAW = 0.24;
const DEFAULT_OVERVIEW_PITCH = 0.75;
const DEFAULT_FOCUS_PITCH = 0.37;
const DEFAULT_FOCUS_DISTANCE = 19.6;

// Exact 14 envelope corners covering the 48m island, stepped walnut plinth (-2.47m..0),
// north brownstone pedestals, and max elevated 5.1m flagsticks (+6.45m) so perspective
// centering guarantees 100% symmetric left/right margins and zero HUD overlap.
const ISLAND_ENVELOPE_POINTS: ReadonlyArray<readonly [number, number, number]> = [
  [-25.7, -2.47, -25.7],
  [25.7, -2.47, -25.7],
  [-25.7, -2.47, 25.7],
  [25.7, -2.47, 25.7],
  [-24.48, -0.01, -24.48],
  [24.48, -0.01, -24.48],
  [-24.48, -0.01, 24.48],
  [24.48, -0.01, 24.48],
  [-22.0, 6.45, -22.0],
  [22.0, 6.45, -22.0],
  [-22.0, 6.45, 22.0],
  [22.0, 6.45, 22.0],
  [-22.4, 2.8, -26.7],
  [22.4, 2.8, -26.7],
];

function computeSymmetricOverviewFraming(
  yaw: number,
  pitch: number,
  tanHalfV: number,
  tanHalfH: number,
): { targetX: number; targetY: number; targetZ: number; distance: number } {
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);
  const sinP = Math.sin(pitch);
  const cosP = Math.cos(pitch);

  const camDirX = sinY * cosP;
  const camDirY = sinP;
  const camDirZ = cosY * cosP;

  const fwdX = -camDirX;
  const fwdY = -camDirY;
  const fwdZ = -camDirZ;

  const rightX = cosY;
  const rightZ = -sinY;

  const upX = -sinY * sinP;
  const upY = cosP;
  const upZ = -cosY * sinP;

  let tx = 0;
  let ty = 0.5;
  let tz = 0;
  let dist = 160;

  // Keep island vertically centered slightly below pure midpoint to stay clear of top HUD
  const desiredCenterNdcY = -0.02;
  const fillWidthFraction = 0.918; // ~16px margin on both sides at 390px width
  const fillHeightFraction = 0.72;

  for (let iter = 0; iter < 4; iter++) {
    const cx = tx + camDirX * dist;
    const cy = ty + camDirY * dist;
    const cz = tz + camDirZ * dist;

    let uMin = Infinity;
    let uMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;

    for (const p of ISLAND_ENVELOPE_POINTS) {
      const rx = p[0] - cx;
      const ry = p[1] - cy;
      const rz = p[2] - cz;
      const depth = Math.max(10, rx * fwdX + ry * fwdY + rz * fwdZ);
      const u = (rx * rightX + rz * rightZ) / depth;
      const v = (rx * upX + ry * upY + rz * upZ) / depth;
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }

    const uMid = 0.5 * (uMin + uMax);
    const uHalf = 0.5 * (uMax - uMin);
    const vMid = 0.5 * (vMin + vMax);
    const vHalf = 0.5 * (vMax - vMin);

    const du = uMid * dist;
    const dv = (vMid - desiredCenterNdcY * tanHalfV) * dist;

    tx += rightX * du + upX * dv;
    ty += upY * dv;
    tz += rightZ * du + upZ * dv;

    const dW = (uHalf / Math.max(0.08, tanHalfH * fillWidthFraction)) * dist;
    const dH = (vHalf / Math.max(0.12, tanHalfV * fillHeightFraction)) * dist;
    dist = Math.max(dW, dH);
  }

  return {
    targetX: tx,
    targetY: ty,
    targetZ: tz,
    distance: THREE.MathUtils.clamp(dist, 46, 250),
  };
}

function resolveFocusTargetFlag(
  course: GeneratedCityCourse,
  sunkFlags: Record<string, boolean>,
  activeTargetFlag: string | null,
  ballX: number,
  ballZ: number,
): FlagPinSpec | null {
  if (activeTargetFlag && !sunkFlags[activeTargetFlag]) {
    const active = course.flags.find((f) => f.color === activeTargetFlag);
    if (active) return active;
  }
  let best: FlagPinSpec | null = null;
  let bestDistSq = Infinity;
  for (const flag of course.flags) {
    if (sunkFlags[flag.color]) continue;
    const dx = flag.position[0] - ballX;
    const dz = flag.position[2] - ballZ;
    const dSq = dx * dx + dz * dz;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      best = flag;
    }
  }
  return best;
}

function computeYawBehindBallToDir(dirX: number, dirZ: number): number {
  return Math.atan2(-dirX, -dirZ);
}

function normalizeAngleDelta(delta: number): number {
  let d = delta;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function DioramaCameraRig({
  ballWorldPositionRef,
  controlRef,
}: DioramaCameraRigProps) {
  const { camera, size } = useThree();

  const course = useCurbsideStore((s) => s.course);
  const sunkFlags = useCurbsideStore((s) => s.sunkFlags);
  const activeTargetFlag = useCurbsideStore((s) => s.activeTargetFlag);
  const cameraMode = useCurbsideStore((s) => s.cameraMode);
  const ballPhase = useCurbsideStore((s) => s.ballPhase);
  const aimDirection = useCurbsideStore((s) => s.aimDirection);
  const courseVersion = useCurbsideStore((s) => s.courseVersion);
  const resetCounter = useCurbsideStore((s) => s.resetCounter);

  const yawRef = useRef<number>(DEFAULT_OVERVIEW_YAW);
  const pitchRef = useRef<number>(DEFAULT_OVERVIEW_PITCH);
  const overviewZoomRef = useRef<number>(1.0);
  const focusZoomRef = useRef<number>(1.0);
  const panOffsetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const manualFocusOrbitRef = useRef<boolean>(false);
  const prevBallPhaseRef = useRef(ballPhase);

  const currentLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3(-2, -0.5, 1.4));
  const currentCamPosRef = useRef<THREE.Vector3>(new THREE.Vector3(30, 122, 128));
  const initializedRef = useRef<boolean>(false);

  const tmpDesiredTarget = useRef<THREE.Vector3>(new THREE.Vector3());
  const tmpDesiredPos = useRef<THREE.Vector3>(new THREE.Vector3());
  const tmpRight = useRef<THREE.Vector3>(new THREE.Vector3());
  const tmpForward = useRef<THREE.Vector3>(new THREE.Vector3());

  // Re-frame cleanly on new course / round restart
  useEffect(() => {
    manualFocusOrbitRef.current = false;
    overviewZoomRef.current = 1.0;
    focusZoomRef.current = 1.0;
    panOffsetRef.current.set(0, 0, 0);

    const s = useCurbsideStore.getState();
    if (s.cameraMode === 'overview') {
      yawRef.current = DEFAULT_OVERVIEW_YAW;
      pitchRef.current = DEFAULT_OVERVIEW_PITCH;
    } else {
      const bx = ballWorldPositionRef.current.x;
      const bz = ballWorldPositionRef.current.z;
      const flag = resolveFocusTargetFlag(
        s.course,
        s.sunkFlags,
        s.activeTargetFlag,
        bx,
        bz,
      );
      const dx = flag ? flag.position[0] - bx : s.aimDirection[0];
      const dz = flag ? flag.position[2] - bz : s.aimDirection[1];
      const len = Math.hypot(dx, dz);
      yawRef.current =
        len > 1e-4
          ? computeYawBehindBallToDir(dx / len, dz / len)
          : DEFAULT_OVERVIEW_YAW;
      pitchRef.current = DEFAULT_FOCUS_PITCH;
    }
  }, [courseVersion, resetCounter, ballWorldPositionRef]);

  // Adjust framing immediately when user toggles Overview <-> Focus
  useEffect(() => {
    manualFocusOrbitRef.current = false;
    panOffsetRef.current.set(0, 0, 0);

    if (cameraMode === 'overview') {
      yawRef.current = DEFAULT_OVERVIEW_YAW;
      pitchRef.current = DEFAULT_OVERVIEW_PITCH;
      overviewZoomRef.current = 1.0;
    } else {
      const s = useCurbsideStore.getState();
      const bx = ballWorldPositionRef.current.x;
      const bz = ballWorldPositionRef.current.z;
      const flag = resolveFocusTargetFlag(
        s.course,
        s.sunkFlags,
        s.activeTargetFlag,
        bx,
        bz,
      );
      const dx = flag ? flag.position[0] - bx : s.aimDirection[0];
      const dz = flag ? flag.position[2] - bz : s.aimDirection[1];
      const len = Math.hypot(dx, dz);
      if (len > 1e-4) {
        yawRef.current = computeYawBehindBallToDir(dx / len, dz / len);
      }
      pitchRef.current = DEFAULT_FOCUS_PITCH;
      focusZoomRef.current = 1.0;
    }
  }, [cameraMode, ballWorldPositionRef]);

  useEffect(() => {
    controlRef.current = {
      orbitDelta: (deltaYawRad: number, deltaPitchRad: number) => {
        if (useCurbsideStore.getState().cameraMode === 'focus') {
          manualFocusOrbitRef.current = true;
        }
        yawRef.current += deltaYawRad;
        pitchRef.current = THREE.MathUtils.clamp(
          pitchRef.current + deltaPitchRad,
          0.22,
          1.34,
        );
      },
      zoomByFactor: (factor: number) => {
        const mode = useCurbsideStore.getState().cameraMode;
        if (mode === 'overview') {
          overviewZoomRef.current = THREE.MathUtils.clamp(
            overviewZoomRef.current * factor,
            0.35,
            1.35,
          );
        } else {
          focusZoomRef.current = THREE.MathUtils.clamp(
            focusZoomRef.current * factor,
            0.65,
            1.8,
          );
        }
      },
      panByScreenDelta: (
        dxPx: number,
        dyPx: number,
        viewportHeightPx: number,
      ) => {
        const safeH = Math.max(240, viewportHeightPx);
        const mode = useCurbsideStore.getState().cameraMode;
        const panScale = mode === 'overview' ? 46 / safeH : 16 / safeH;

        const yaw = yawRef.current;
        tmpRight.current.set(Math.cos(yaw), 0, -Math.sin(yaw));
        tmpForward.current.set(-Math.sin(yaw), 0, -Math.cos(yaw));

        panOffsetRef.current.addScaledVector(tmpRight.current, -dxPx * panScale);
        panOffsetRef.current.addScaledVector(
          tmpForward.current,
          dyPx * panScale,
        );

        const maxPan = ISLAND_HALF_SIZE - 2;
        panOffsetRef.current.x = THREE.MathUtils.clamp(
          panOffsetRef.current.x,
          -maxPan,
          maxPan,
        );
        panOffsetRef.current.z = THREE.MathUtils.clamp(
          panOffsetRef.current.z,
          -maxPan,
          maxPan,
        );
      },
      resetView: () => {
        manualFocusOrbitRef.current = false;
        overviewZoomRef.current = 1.0;
        focusZoomRef.current = 1.0;
        panOffsetRef.current.set(0, 0, 0);
        if (useCurbsideStore.getState().cameraMode === 'overview') {
          yawRef.current = DEFAULT_OVERVIEW_YAW;
          pitchRef.current = DEFAULT_OVERVIEW_PITCH;
        } else {
          pitchRef.current = DEFAULT_FOCUS_PITCH;
        }
      },
      getCurrentYaw: () => yawRef.current,
    };
    return () => {
      controlRef.current = null;
    };
  }, [controlRef]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const persp = camera as THREE.PerspectiveCamera;
    const fovRad = THREE.MathUtils.degToRad(persp.fov || 44);
    const tanHalfV = Math.tan(fovRad * 0.5);
    const aspect = size.width / Math.max(1, size.height);
    const tanHalfH = tanHalfV * aspect;

    // Reset manual focus orbit when a shot finishes and settles onto a new lie
    if (prevBallPhaseRef.current !== 'resting' && ballPhase === 'resting') {
      manualFocusOrbitRef.current = false;
    }
    prevBallPhaseRef.current = ballPhase;

    const pitch = pitchRef.current;
    const ballPos = ballWorldPositionRef.current;
    const isMoving = ballPhase === 'inflight';

    let distance = 80;
    if (cameraMode === 'overview') {
      const yaw = yawRef.current;
      const framed = computeSymmetricOverviewFraming(
        yaw,
        pitch,
        tanHalfV,
        tanHalfH,
      );
      distance = framed.distance * overviewZoomRef.current;

      // Gentle tactical shot follow in overview without losing whole-block framing
      const followBlend = isMoving ? 0.2 : 0.0;
      tmpDesiredTarget.current.set(
        framed.targetX +
          panOffsetRef.current.x +
          (ballPos.x - framed.targetX - panOffsetRef.current.x) * followBlend,
        framed.targetY + Math.max(0, ballPos.y - 0.5) * 0.16 * followBlend,
        framed.targetZ +
          panOffsetRef.current.z +
          (ballPos.z - framed.targetZ - panOffsetRef.current.z) * followBlend,
      );
    } else {
      // True Behind-the-Ball Shot Framing: low ~22° pitch looking ~8.5m forward
      // from the ball toward the active unsunk flag (or aimed shot corridor).
      const targetFlag = resolveFocusTargetFlag(
        course,
        sunkFlags,
        activeTargetFlag,
        ballPos.x,
        ballPos.z,
      );

      let dirX = aimDirection[0];
      let dirZ = aimDirection[1];
      let flagDist = 16;

      if (targetFlag) {
        const fx = targetFlag.position[0] - ballPos.x;
        const fz = targetFlag.position[2] - ballPos.z;
        const fd = Math.hypot(fx, fz);
        flagDist = fd;
        if (ballPhase !== 'aiming' && fd > 1e-4) {
          dirX = fx / fd;
          dirZ = fz / fd;
        }
      }

      // Smoothly keep behind-the-ball alignment when resting/following unless player orbited manually
      if (
        !manualFocusOrbitRef.current &&
        (ballPhase === 'resting' || ballPhase === 'inflight')
      ) {
        const desiredYaw = computeYawBehindBallToDir(dirX, dirZ);
        const diff = normalizeAngleDelta(desiredYaw - yawRef.current);
        yawRef.current += diff * (1 - Math.exp(-5.5 * dt));
      }

      const baseFocusDist = aspect < 0.75 ? DEFAULT_FOCUS_DISTANCE : 17.5;
      distance = THREE.MathUtils.clamp(
        baseFocusDist * focusZoomRef.current,
        12,
        34,
      );

      const leadForward =
        ballPhase === 'aiming'
          ? 8.5
          : ballPhase === 'resting'
            ? THREE.MathUtils.clamp(flagDist * 0.65, 5.0, 9.0)
            : 2.5;

      tmpDesiredTarget.current.set(
        ballPos.x + dirX * leadForward + panOffsetRef.current.x * 0.35,
        Math.max(0.2, ballPos.y + 0.25),
        ballPos.z + dirZ * leadForward + panOffsetRef.current.z * 0.35,
      );
    }

    const yaw = yawRef.current;
    const horizDist = distance * Math.cos(pitch);
    const vertDist = distance * Math.sin(pitch);
    tmpDesiredPos.current.set(
      tmpDesiredTarget.current.x + Math.sin(yaw) * horizDist,
      tmpDesiredTarget.current.y + vertDist,
      tmpDesiredTarget.current.z + Math.cos(yaw) * horizDist,
    );

    if (!initializedRef.current) {
      initializedRef.current = true;
      currentLookAtRef.current.copy(tmpDesiredTarget.current);
      currentCamPosRef.current.copy(tmpDesiredPos.current);
    } else {
      const posAlpha = 1 - Math.exp(-(isMoving ? 6.5 : 8.5) * dt);
      const lookAlpha = 1 - Math.exp(-(isMoving ? 7.5 : 9.2) * dt);
      currentLookAtRef.current.lerp(tmpDesiredTarget.current, lookAlpha);
      currentCamPosRef.current.lerp(tmpDesiredPos.current, posAlpha);
    }

    camera.position.copy(currentCamPosRef.current);
    camera.lookAt(currentLookAtRef.current);
  });

  return null;
}
