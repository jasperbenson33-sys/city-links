'use client';

import {
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { BALL_RADIUS, type Vec3Tuple } from '@/types';
import {
  computeDeterministicTrajectory,
  resolveHorizontalAim,
} from '@/lib/aerodynamics';
import { getClubProfile } from '@/lib/clubs';
import { soundEngine } from '@/lib/sound';
import { useCurbsideStore } from '@/store';
import type { CameraRigControl } from './CameraRig';

export interface AimControlsAndArcProps {
  ballWorldPositionRef?: MutableRefObject<THREE.Vector3>;
  cameraControlRef?: MutableRefObject<CameraRigControl | null>;
}

const MAX_ARC_DOTS = 44;

function sampleEvenlyAlongPath(
  points: Vec3Tuple[],
  targetCount: number,
): Vec3Tuple[] {
  if (points.length === 0) return [];
  if (points.length <= targetCount) return points;
  const sampled: Vec3Tuple[] = [];
  const lastIdx = points.length - 1;
  for (let i = 0; i < targetCount; i++) {
    const idx = Math.round((i / (targetCount - 1)) * lastIdx);
    sampled.push(points[idx]);
  }
  return sampled;
}

export function AimControlsAndArc({
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
  });

  // Scratch matrix & vector for InstancedMesh arc dots
  const dummyObj = useMemo(() => new THREE.Object3D(), []);
  const projVec = useMemo(() => new THREE.Vector3(), []);

  // Attach crisp touch + mouse pointer handlers directly on the WebGL canvas
  useEffect(() => {
    const dom = gl.domElement;
    if (!dom) return;

    const getBallScreenCoords = (): { sx: number; sy: number } => {
      const s = useCurbsideStore.getState();
      projVec.set(s.ballPosition[0], s.ballPosition[1], s.ballPosition[2]);
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
      const dxStep = e.clientX - drag.lastX;
      const dyStep = e.clientY - drag.lastY;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;

      if (drag.mode === 'pull') {
        const pullDy = e.clientY - drag.startY;
        const pullDx = e.clientX - drag.startX;
        const maxPullPx = Math.max(120, Math.min(220, size.height * 0.27));
        const nextPower = Math.max(0, Math.min(1, pullDy / maxPullPx));
        // Slingshot lateral aim (pulling down-left shifts shot line right)
        const yawOffset = -(pullDx / maxPullPx) * 0.65;
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
        if (s.aimPower >= 0.05) {
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
  }, [camera, cameraControlRef, gl, projVec, size.height, size.width]);

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

  // Idle aim direction breadcrumbs before pulling
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
      return sampleEvenlyAlongPath(trajectory.arcPoints, MAX_ARC_DOTS);
    }
    return idleDots;
  }, [trajectory, idleDots]);

  // Update InstancedMesh dot transforms cleanly when activeDots changes
  useEffect(() => {
    const inst = dotInstancedRef.current;
    if (!inst) return;
    const isPreviewing = Boolean(trajectory);
    const count = Math.min(activeDots.length, MAX_ARC_DOTS);

    for (let i = 0; i < MAX_ARC_DOTS; i++) {
      if (!showGuides || i >= count) {
        dummyObj.position.set(0, -100, 0);
        dummyObj.scale.set(0.0001, 0.0001, 0.0001);
      } else {
        const pt = activeDots[i];
        const t = i / Math.max(1, count - 1);
        const radiusScale = isPreviewing
          ? 0.095 * (1 - t * 0.35)
          : 0.075 * (1 - t * 0.45);
        dummyObj.position.set(pt[0], pt[1], pt[2]);
        dummyObj.scale.set(radiusScale, radiusScale, radiusScale);
      }
      dummyObj.updateMatrix();
      inst.setMatrixAt(i, dummyObj.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  }, [activeDots, dummyObj, showGuides, trajectory]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pulse = 1 + Math.sin(t * 4.5) * 0.08;
    if (haloRef.current) {
      haloRef.current.scale.set(pulse, pulse, 1);
    }
    if (impactRingRef.current) {
      impactRingRef.current.scale.set(pulse, pulse, 1);
    }
    if (awningRingRef.current) {
      awningRingRef.current.scale.set(pulse * 1.1, pulse * 1.1, 1);
    }
  });

  if (!showGuides) return null;

  const stopTarget = trajectory?.estimatedStopPoint ?? null;
  const awningTarget = trajectory?.awningBouncePoint ?? null;
  const ringColor =
    trajectory?.firstImpactKind === 'awning' ? '#F59E0B' : profile.accentHex;

  return (
    <group name="aim-controls-and-arc">
      {/* Ball locator halo on resting lie */}
      <mesh
        ref={haloRef}
        position={[
          ballPosition[0],
          ballPosition[1] - BALL_RADIUS + 0.018,
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
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Predicted Stop / Landing Ring */}
      {stopTarget && (
        <mesh
          ref={impactRingRef}
          position={[stopTarget[0], stopTarget[1] + 0.025, stopTarget[2]]}
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
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}
