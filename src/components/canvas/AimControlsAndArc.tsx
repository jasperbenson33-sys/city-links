'use client';

import {
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type RefObject,
} from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { BALL_RADIUS, type ClubId, type Vec3Tuple } from '@/types';
import {
  computeDeterministicTrajectory,
  resolveHorizontalAim,
} from '@/lib/aerodynamics';
import { getClubProfile } from '@/lib/clubs';
import { soundEngine } from '@/lib/sound';
import { useCurbsideStore } from '@/store';
import { isQaFreezeActive, resolveAnimTime } from '@/components/world/qaFreeze';
import type { CameraRigControl } from './CameraRig';

export interface AimControlsAndArcProps {
  ballWorldPositionRef?: MutableRefObject<THREE.Vector3>;
  ballMeshRef?: RefObject<THREE.Object3D | null>;
  cameraControlRef?: MutableRefObject<CameraRigControl | null>;
}

const MAX_ARC_DOTS = 64;
const DOT_ARC_STEP_METERS = 0.85;
const CLUB_MORPH_DURATION_SEC = 0.15;
const PULL_CANCEL_THRESHOLD = 0.06;
const PULL_LATERAL_DEADZONE_PX = 5;

function sampleFixedArcLengthAlongPath(
  points: Vec3Tuple[],
  maxDots: number,
  stepMeters = DOT_ARC_STEP_METERS,
): Vec3Tuple[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0]];

  let totalLen = 0;
  const cumLen = new Float64Array(points.length);
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    const dz = points[i][2] - points[i - 1][2];
    totalLen += Math.hypot(dx, dy, dz);
    cumLen[i] = totalLen;
  }
  if (totalLen <= 1e-4) return [points[0]];

  // Sample at fixed arc-length steps anchored at ball origin so dots never swim while pulling
  const effectiveStep = Math.max(
    stepMeters,
    totalLen / Math.max(1, maxDots - 1),
  );
  const sampled: Vec3Tuple[] = [];
  let segIdx = 0;
  for (let k = 1; k < maxDots; k++) {
    const targetS = k * effectiveStep;
    if (targetS >= totalLen - 0.15) break;
    while (segIdx < points.length - 2 && cumLen[segIdx + 1] < targetS) {
      segIdx++;
    }
    const s0 = cumLen[segIdx];
    const s1 = cumLen[segIdx + 1];
    const span = Math.max(1e-6, s1 - s0);
    const alpha = THREE.MathUtils.clamp((targetS - s0) / span, 0, 1);
    const p0 = points[segIdx];
    const p1 = points[segIdx + 1];
    sampled.push([
      p0[0] + (p1[0] - p0[0]) * alpha,
      p0[1] + (p1[1] - p0[1]) * alpha,
      p0[2] + (p1[2] - p0[2]) * alpha,
    ]);
  }
  sampled.push(points[points.length - 1]);
  return sampled;
}

function buildDotTargets(
  pts: Vec3Tuple[],
  isPreviewing: boolean,
): { positions: Vec3Tuple[]; scales: number[] } {
  const count = Math.min(pts.length, MAX_ARC_DOTS);
  const positions: Vec3Tuple[] = new Array(MAX_ARC_DOTS);
  const scales: number[] = new Array(MAX_ARC_DOTS);
  const tail = count > 0 ? pts[count - 1] : ([0, -100, 0] as Vec3Tuple);

  for (let i = 0; i < MAX_ARC_DOTS; i++) {
    if (i < count) {
      const pt = pts[i];
      const t = i / Math.max(1, count - 1);
      positions[i] = [pt[0], pt[1], pt[2]];
      scales[i] = isPreviewing
        ? 0.095 * (1 - t * 0.35)
        : 0.075 * (1 - t * 0.45);
    } else {
      positions[i] = [tail[0], count > 0 ? tail[1] : -100, tail[2]];
      scales[i] = 0.0001;
    }
  }
  return { positions, scales };
}

export function AimControlsAndArc({
  ballWorldPositionRef,
  ballMeshRef,
  cameraControlRef,
}: AimControlsAndArcProps) {
  const { camera, gl, size } = useThree();

  const shotPhase = useCurbsideStore((s) => s.shotPhase);
  const selectedClub = useCurbsideStore((s) => s.selectedClub);
  const aimYaw = useCurbsideStore((s) => s.aimYaw);
  const aimPower = useCurbsideStore((s) => s.aimPower);
  const ballPosition = useCurbsideStore((s) => s.ballPosition);
  const isHoleComplete = useCurbsideStore((s) => s.isHoleComplete);

  const haloRef = useRef<THREE.Mesh | null>(null);
  const impactRingRef = useRef<THREE.Mesh | null>(null);
  const awningRingRef = useRef<THREE.Mesh | null>(null);
  const dotInstancedRef = useRef<THREE.InstancedMesh | null>(null);

  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number;
    mode: 'pull' | 'orbit';
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    startYaw: number;
    lastPowerStep: number;
    dxWindow: [number, number, number];
    dyWindow: [number, number, number];
    windowIdx: number;
    windowCount: number;
    smoothedPullDx: number;
    smoothedPullDy: number;
  }>({
    active: false,
    pointerId: -1,
    mode: 'orbit',
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startYaw: 0,
    lastPowerStep: 0,
    dxWindow: [0, 0, 0],
    dyWindow: [0, 0, 0],
    windowIdx: 0,
    windowCount: 0,
    smoothedPullDx: 0,
    smoothedPullDy: 0,
  });

  // Club-switch 150ms arc morph state
  const prevClubRef = useRef<ClubId>(selectedClub);
  const currentDotsRef = useRef<{ positions: Vec3Tuple[]; scales: number[] }>(
    buildDotTargets([], false),
  );
  const morphFromRef = useRef<{ positions: Vec3Tuple[]; scales: number[] } | null>(
    null,
  );
  const morphElapsedRef = useRef(0);
  const morphActiveRef = useRef(false);

  // Scratch matrix & vector for InstancedMesh arc dots
  const dummyObj = useMemo(() => new THREE.Object3D(), []);
  const projVec = useMemo(() => new THREE.Vector3(), []);
  const worldBallVec = useMemo(() => new THREE.Vector3(), []);

  // Attach crisp touch + mouse pointer handlers directly on the WebGL canvas
  useEffect(() => {
    const dom = gl.domElement;
    if (!dom) return;

    const getBallScreenCoords = (): { sx: number; sy: number } => {
      if (ballMeshRef?.current) {
        ballMeshRef.current.getWorldPosition(worldBallVec);
        projVec.copy(worldBallVec);
      } else if (ballWorldPositionRef?.current) {
        projVec.copy(ballWorldPositionRef.current);
      } else {
        const s = useCurbsideStore.getState();
        projVec.set(s.ballPosition[0], s.ballPosition[1], s.ballPosition[2]);
      }
      projVec.project(camera);
      return {
        sx: (projVec.x * 0.5 + 0.5) * size.width,
        sy: (-projVec.y * 0.5 + 0.5) * size.height,
      };
    };

    const isInsidePullZone = (clientX: number, clientY: number): boolean => {
      const rect = dom.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      const { sx, sy } = getBallScreenCoords();
      const distToBallPx = Math.hypot(localX - sx, localY - sy);
      if (distToBallPx <= 118) return true;
      // Also allow intuitive lower-center thumb slingshot zone on mobile portrait
      const normX = localX / Math.max(1, rect.width);
      const normY = localY / Math.max(1, rect.height);
      return normX >= 0.24 && normX <= 0.76 && normY >= 0.52 && normY <= 0.84;
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const s = useCurbsideStore.getState();
      if (s.isHoleComplete) return;

      const canPull =
        (s.shotPhase === 'aiming' || s.shotPhase === 'pulling') &&
        !s.isStreetScoutActive &&
        !s.cameraAuditStationId &&
        isInsidePullZone(e.clientX, e.clientY);

      dragStateRef.current = {
        active: true,
        pointerId: e.pointerId,
        mode: canPull ? 'pull' : 'orbit',
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        startYaw: s.aimYaw,
        lastPowerStep: 0,
        dxWindow: [0, 0, 0],
        dyWindow: [0, 0, 0],
        windowIdx: 0,
        windowCount: 0,
        smoothedPullDx: 0,
        smoothedPullDy: 0,
      };

      try {
        dom.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer already released
      }

      if (canPull) {
        s.setAimPower(0.05);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag.active || drag.pointerId !== e.pointerId) return;

      const s = useCurbsideStore.getState();
      const rawDx = e.clientX - drag.lastX;
      const rawDy = e.clientY - drag.lastY;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;

      // 3-sample moving average pointer/touch smoothing eliminates micro-thumb tremor
      drag.dxWindow[drag.windowIdx] = rawDx;
      drag.dyWindow[drag.windowIdx] = rawDy;
      drag.windowIdx = (drag.windowIdx + 1) % 3;
      drag.windowCount = Math.min(3, drag.windowCount + 1);
      const dxStep =
        (drag.dxWindow[0] + drag.dxWindow[1] + drag.dxWindow[2]) /
        drag.windowCount;
      const dyStep =
        (drag.dyWindow[0] + drag.dyWindow[1] + drag.dyWindow[2]) /
        drag.windowCount;

      if (drag.mode === 'pull') {
        drag.smoothedPullDx += dxStep;
        drag.smoothedPullDy += dyStep;
        const maxPullPx = Math.max(120, Math.min(220, size.height * 0.27));
        const nextPower = Math.max(
          0,
          Math.min(1, drag.smoothedPullDy / maxPullPx),
        );
        // Slingshot lateral aim with soft 5px deadzone so micro-thumb wobble stays rock steady
        const rawPullDx = drag.smoothedPullDx;
        const adjPullDx =
          Math.abs(rawPullDx) <= PULL_LATERAL_DEADZONE_PX
            ? 0
            : rawPullDx - Math.sign(rawPullDx) * PULL_LATERAL_DEADZONE_PX;
        const yawOffset = -(adjPullDx / maxPullPx) * 0.65;
        s.setAimYaw(drag.startYaw + yawOffset);
        s.setAimPower(nextPower);

        const stepBucket = Math.floor(nextPower * 10);
        if (stepBucket > 0 && stepBucket !== drag.lastPowerStep) {
          drag.lastPowerStep = stepBucket;
          soundEngine.playSwingTick(nextPower);
        }
      } else {
        // Full 360-degree street-level look around the ball
        const yawDelta = -dxStep * 0.0068;
        const pitchDelta = dyStep * 0.0032;
        if (cameraControlRef?.current) {
          cameraControlRef.current.orbitDelta(yawDelta, pitchDelta);
        } else {
          s.setAimYaw(s.aimYaw + yawDelta);
        }
      }
    };

    const finishDrag = (e: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag.active || drag.pointerId !== e.pointerId) return;
      drag.active = false;
      drag.pointerId = -1;

      try {
        if (dom.hasPointerCapture(e.pointerId)) {
          dom.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore release errors
      }

      if (drag.mode === 'pull') {
        const s = useCurbsideStore.getState();
        if (s.aimPower >= PULL_CANCEL_THRESHOLD) {
          s.launchShot();
        } else {
          s.clearAimPreview();
          s.setShotPhase('aiming');
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (!cameraControlRef?.current) return;
      const factor = e.deltaY > 0 ? 1.06 : 0.94;
      cameraControlRef.current.zoomByFactor(factor);
    };

    dom.addEventListener('pointerdown', handlePointerDown);
    dom.addEventListener('pointermove', handlePointerMove);
    dom.addEventListener('pointerup', finishDrag);
    dom.addEventListener('pointercancel', finishDrag);
    dom.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      dom.removeEventListener('pointerdown', handlePointerDown);
      dom.removeEventListener('pointermove', handlePointerMove);
      dom.removeEventListener('pointerup', finishDrag);
      dom.removeEventListener('pointercancel', finishDrag);
      dom.removeEventListener('wheel', handleWheel);
    };
  }, [
    ballMeshRef,
    ballWorldPositionRef,
    camera,
    cameraControlRef,
    gl,
    projVec,
    size.height,
    size.width,
    worldBallVec,
  ]);

  const showGuides =
    !isHoleComplete && (shotPhase === 'aiming' || shotPhase === 'pulling');

  const profile = getClubProfile(selectedClub);

  const trajectory = useMemo(() => {
    if (!showGuides || aimPower <= 0.03) return null;
    return computeDeterministicTrajectory({
      origin: ballPosition,
      clubId: selectedClub,
      power: aimPower,
      aimYaw,
      simulateAwningBounce: true,
      simulateObstacles: true,
    });
  }, [showGuides, aimPower, ballPosition, selectedClub, aimYaw]);

  // Idle aim direction breadcrumbs before pulling (>= 0.025m surface clearance)
  const idleDots = useMemo<Vec3Tuple[]>(() => {
    if (!showGuides || aimPower > 0.03) return [];
    const [dx, dz] = resolveHorizontalAim(undefined, aimYaw);
    const pts: Vec3Tuple[] = [];
    for (let i = 1; i <= 8; i++) {
      const d = i * 0.85;
      pts.push([
        ballPosition[0] + dx * d,
        ballPosition[1] - BALL_RADIUS + 0.06,
        ballPosition[2] + dz * d,
      ]);
    }
    return pts;
  }, [showGuides, aimPower, aimYaw, ballPosition]);

  const activeDots = useMemo(() => {
    if (trajectory) {
      return sampleFixedArcLengthAlongPath(trajectory.arcPoints, MAX_ARC_DOTS);
    }
    return idleDots;
  }, [trajectory, idleDots]);

  const targetDots = useMemo(
    () => buildDotTargets(activeDots, Boolean(trajectory)),
    [activeDots, trajectory],
  );

  // Trigger a smooth 150ms cross-fade/morph when switching clubs
  useEffect(() => {
    if (prevClubRef.current !== selectedClub) {
      prevClubRef.current = selectedClub;
      if (showGuides && !isQaFreezeActive()) {
        morphFromRef.current = {
          positions: currentDotsRef.current.positions.map(
            (p) => [p[0], p[1], p[2]] as Vec3Tuple,
          ),
          scales: [...currentDotsRef.current.scales],
        };
        morphElapsedRef.current = 0;
        morphActiveRef.current = true;
      } else {
        morphActiveRef.current = false;
      }
    }
  }, [selectedClub, showGuides]);

  // Keep non-morph targets mirrored immediately so steady frames are exact
  useEffect(() => {
    if (!morphActiveRef.current) {
      currentDotsRef.current = targetDots;
    }
  }, [targetDots]);

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const animTime = resolveAnimTime(clock.elapsedTime);
    const frozen = isQaFreezeActive();

    // Update pulsing halo & target rings deterministically (pinned when ?qaFreezeParticles=1)
    const pulse = frozen ? 1.0 : 1 + Math.sin(animTime * 4.5) * 0.08;
    if (haloRef.current) {
      haloRef.current.scale.set(pulse, pulse, 1);
    }
    if (impactRingRef.current) {
      impactRingRef.current.scale.set(pulse, pulse, 1);
    }
    if (awningRingRef.current) {
      awningRingRef.current.scale.set(pulse * 1.1, pulse * 1.1, 1);
    }

    const inst = dotInstancedRef.current;
    if (!inst) return;

    let blend = 1;
    if (morphActiveRef.current && morphFromRef.current && !frozen) {
      morphElapsedRef.current += dt;
      const u = Math.min(1, morphElapsedRef.current / CLUB_MORPH_DURATION_SEC);
      // Cubic ease-out for silky 150ms club switch transition
      blend = 1 - Math.pow(1 - u, 3);
      if (u >= 1) {
        morphActiveRef.current = false;
        morphFromRef.current = null;
      }
    } else if (frozen) {
      morphActiveRef.current = false;
      morphFromRef.current = null;
    }

    const from = morphFromRef.current;
    const isPreviewing = Boolean(trajectory);
    const scrollPhase = frozen ? 0 : (animTime * 2.6) % 1;

    for (let i = 0; i < MAX_ARC_DOTS; i++) {
      if (!showGuides) {
        dummyObj.position.set(0, -100, 0);
        dummyObj.scale.set(0.0001, 0.0001, 0.0001);
      } else {
        const tp = targetDots.positions[i];
        const ts = targetDots.scales[i];
        let x = tp[0];
        let y = tp[1];
        let z = tp[2];
        let s = ts;

        if (blend < 1 && from) {
          const fp = from.positions[i];
          const fs = from.scales[i];
          x = fp[0] + (tp[0] - fp[0]) * blend;
          y = fp[1] + (tp[1] - fp[1]) * blend;
          z = fp[2] + (tp[2] - fp[2]) * blend;
          s = fs + (ts - fs) * blend;
        }

        currentDotsRef.current.positions[i] = [x, y, z];
        currentDotsRef.current.scales[i] = s;

        // Subtle animated flow pulse along active pull-back dots (frozen under ?qaFreezeParticles=1)
        const flowGain =
          !frozen && isPreviewing && s > 0.001
            ? 0.92 + 0.14 * Math.sin((i / 4 - scrollPhase) * Math.PI * 2)
            : 1.0;

        dummyObj.position.set(x, y, z);
        dummyObj.scale.set(s * flowGain, s * flowGain, s * flowGain);
      }
      dummyObj.updateMatrix();
      inst.setMatrixAt(i, dummyObj.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  });

  if (!showGuides) return null;

  const stopTarget = trajectory?.estimatedStopPoint ?? null;
  const awningTarget = trajectory?.awningBouncePoint ?? null;
  const ringColor =
    trajectory?.firstImpactKind === 'awning' ? '#F59E0B' : profile.accentHex;

  return (
    <group name="aim-controls-and-arc">
      {/* Ball locator halo on resting lie (>= 0.025m clearance + polygonOffset) */}
      <mesh
        ref={haloRef}
        position={[
          ballPosition[0],
          ballPosition[1] - BALL_RADIUS + 0.026,
          ballPosition[2],
        ]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[BALL_RADIUS * 1.25, BALL_RADIUS * 1.65, 32]} />
        <meshBasicMaterial
          color={profile.accentHex}
          transparent
          opacity={0.72}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Sunlit 3D Trajectory Arc / Aim Dots */}
      <instancedMesh
        ref={dotInstancedRef}
        args={[undefined, undefined, MAX_ARC_DOTS]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial
          color={trajectory ? '#FFF7D6' : profile.accentHex}
          transparent
          opacity={trajectory ? 0.92 : 0.65}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </instancedMesh>

      {/* Predicted Awning Contact Bullseye when locked onto Hotdog Cart Awning */}
      {awningTarget && (
        <mesh
          ref={awningRingRef}
          position={[awningTarget[0], awningTarget[1] + 0.06, awningTarget[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.28, 0.44, 28]} />
          <meshBasicMaterial
            color="#F59E0B"
            transparent
            opacity={0.9}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Predicted Stop / Landing Ring (>= 0.025m clearance + polygonOffset) */}
      {stopTarget && (
        <mesh
          ref={impactRingRef}
          position={[stopTarget[0], stopTarget[1] + 0.028, stopTarget[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry
            args={[
              Math.max(0.24, trajectory!.landingRingRadius * 0.55),
              trajectory!.landingRingRadius * 0.78,
              32,
            ]}
          />
          <meshBasicMaterial
            color={ringColor}
            transparent
            opacity={0.82}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}
