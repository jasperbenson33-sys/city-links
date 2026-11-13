'use client';

import {
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { BALL_RADIUS, CLUB_SPECS, type GeneratedCityCourse } from '@/types';
import {
  computeDeterministicTrajectory,
  getCourseSurfaceElevationAt,
} from '@/engine';
import { useCurbsideStore } from '@/store';
import type { CameraRigControl } from './DioramaCameraRig';

interface AimControlsAndArcProps {
  course: GeneratedCityCourse;
  ballWorldPositionRef: MutableRefObject<THREE.Vector3>;
  cameraControlRef: MutableRefObject<CameraRigControl | null>;
}

const MAX_ARC_DOTS = 32;
const PULL_ZONE_RADIUS_PX = 150;
const CANCEL_DRAG_PX = 16;

type ActiveGesture =
  | { kind: 'none' }
  | {
      kind: 'aim';
      pointerId: number;
      startX: number;
      startY: number;
      currX: number;
      currY: number;
    }
  | {
      kind: 'orbit';
      pointerId: number;
      lastX: number;
      lastY: number;
    }
  | {
      kind: 'pinch';
      lastDist: number;
      lastMidX: number;
      lastMidY: number;
    };

export function AimControlsAndArc({
  course,
  ballWorldPositionRef,
  cameraControlRef,
}: AimControlsAndArcProps) {
  const { camera, gl } = useThree();

  const ballPhase = useCurbsideStore((s) => s.ballPhase);
  const selectedClub = useCurbsideStore((s) => s.selectedClub);
  const isRoundComplete = useCurbsideStore((s) => s.isRoundComplete);

  const dotsMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const landingGroupRef = useRef<THREE.Group | null>(null);
  const landingRingRef = useRef<THREE.Mesh | null>(null);
  const cueHaloRef = useRef<THREE.Group | null>(null);
  const cueOuterRingRef = useRef<THREE.Mesh | null>(null);
  const tetherMeshRef = useRef<THREE.Group | null>(null);

  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const gestureRef = useRef<ActiveGesture>({ kind: 'none' });
  const courseRef = useRef<GeneratedCityCourse>(course);
  courseRef.current = course;

  const arcRenderStateRef = useRef<{
    visible: boolean;
    arcPoints: [number, number, number][];
    landingPoint: [number, number, number];
    landingRingRadius: number;
    aimDir: [number, number];
    power: number;
    colorHex: string;
  }>({
    visible: false,
    arcPoints: [],
    landingPoint: [0, 0, 0],
    landingRingRadius: 0.4,
    aimDir: [0, -1],
    power: 0,
    colorHex: CLUB_SPECS.driver.arcHex,
  });

  const dummyObj = useMemo(() => new THREE.Object3D(), []);
  const tmpProj = useMemo(() => new THREE.Vector3(), []);
  const tmpCamDir = useMemo(() => new THREE.Vector3(), []);

  const computeAimFromDrag = (
    dxPx: number,
    dyPx: number,
    viewportW: number,
    viewportH: number,
  ) => {
    const pullPx = Math.hypot(dxPx, dyPx);
    if (pullPx < CANCEL_DRAG_PX) {
      return { valid: false as const, power: 0, dir: [0, -1] as [number, number] };
    }

    const maxPullPx = Math.min(
      155,
      Math.max(100, Math.min(viewportW, viewportH) * 0.28),
    );
    const power = THREE.MathUtils.clamp(
      (pullPx - CANCEL_DRAG_PX) / Math.max(40, maxPullPx - CANCEL_DRAG_PX),
      0.04,
      1.0,
    );

    camera.getWorldDirection(tmpCamDir);
    let fx = tmpCamDir.x;
    let fz = tmpCamDir.z;
    const flen = Math.hypot(fx, fz);
    if (flen > 1e-4) {
      fx /= flen;
      fz /= flen;
    } else {
      fx = 0;
      fz = -1;
    }
    const rx = -fz;
    const rz = fx;

    // Slingshot opposite pullback mapping: pull down (+dy) -> shoot forward (+f)
    const wx = -dxPx * rx + dyPx * fx;
    const wz = -dxPx * rz + dyPx * fz;
    const wlen = Math.hypot(wx, wz);
    const dir: [number, number] =
      wlen > 1e-4 ? [wx / wlen, wz / wlen] : [fx, fz];

    return { valid: true as const, power, dir };
  };

  const resetVisualAim = () => {
    arcRenderStateRef.current.visible = false;
    useCurbsideStore.getState().clearAimPreview();
  };

  useEffect(() => {
    const dom = gl.domElement;

    const cancelAllGestures = () => {
      activePointersRef.current.clear();
      if (gestureRef.current.kind === 'aim') {
        resetVisualAim();
      }
      gestureRef.current = { kind: 'none' };
    };

    const getBallScreenPos = () => {
      const rect = dom.getBoundingClientRect();
      tmpProj.copy(ballWorldPositionRef.current).project(camera);
      return {
        x: (tmpProj.x * 0.5 + 0.5) * rect.width + rect.left,
        y: (-tmpProj.y * 0.5 + 0.5) * rect.height + rect.top,
        width: rect.width,
        height: rect.height,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.target !== dom) return;
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        dom.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture failure on synthetic/detached events
      }

      // 2-finger pinch immediately supersedes any 1-finger drag
      if (activePointersRef.current.size >= 2) {
        if (gestureRef.current.kind === 'aim') {
          resetVisualAim();
        }
        const pts = Array.from(activePointersRef.current.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        gestureRef.current = {
          kind: 'pinch',
          lastDist: Math.max(10, dist),
          lastMidX: (pts[0].x + pts[1].x) * 0.5,
          lastMidY: (pts[0].y + pts[1].y) * 0.5,
        };
        return;
      }

      const state = useCurbsideStore.getState();
      const canAim =
        e.button === 0 &&
        !state.isRoundComplete &&
        (state.ballPhase === 'resting' || state.ballPhase === 'aiming');

      if (canAim) {
        const ballScr = getBallScreenPos();
        const distToBall = Math.hypot(
          e.clientX - ballScr.x,
          e.clientY - ballScr.y,
        );
        const inLowerPlayZone = e.clientY >= window.innerHeight * 0.34;
        if (distToBall <= PULL_ZONE_RADIUS_PX || inLowerPlayZone) {
          gestureRef.current = {
            kind: 'aim',
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            currX: e.clientX,
            currY: e.clientY,
          };
          return;
        }
      }

      // Dragging outside pull zone or secondary mouse button orbits smoothly
      gestureRef.current = {
        kind: 'orbit',
        pointerId: e.pointerId,
        lastX: e.clientX,
        lastY: e.clientY,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!activePointersRef.current.has(e.pointerId)) return;
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const g = gestureRef.current;

      if (g.kind === 'pinch' && activePointersRef.current.size >= 2) {
        const pts = Array.from(activePointersRef.current.values());
        const dist = Math.max(
          10,
          Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
        );
        const midX = (pts[0].x + pts[1].x) * 0.5;
        const midY = (pts[0].y + pts[1].y) * 0.5;

        const factor = g.lastDist / dist;
        cameraControlRef.current?.zoomByFactor(factor);
        cameraControlRef.current?.panByScreenDelta(
          midX - g.lastMidX,
          midY - g.lastMidY,
          dom.clientHeight,
        );

        g.lastDist = dist;
        g.lastMidX = midX;
        g.lastMidY = midY;
        return;
      }

      if (g.kind === 'orbit' && g.pointerId === e.pointerId) {
        const dx = e.clientX - g.lastX;
        const dy = e.clientY - g.lastY;
        g.lastX = e.clientX;
        g.lastY = e.clientY;
        cameraControlRef.current?.orbitDelta(-dx * 0.0065, dy * 0.0052);
        return;
      }

      if (g.kind === 'aim' && g.pointerId === e.pointerId) {
        g.currX = e.clientX;
        g.currY = e.clientY;
        const rect = dom.getBoundingClientRect();
        const aim = computeAimFromDrag(
          g.currX - g.startX,
          g.currY - g.startY,
          rect.width,
          rect.height,
        );

        if (!aim.valid) {
          if (arcRenderStateRef.current.visible) {
            resetVisualAim();
          }
          return;
        }

        const state = useCurbsideStore.getState();
        const origin: [number, number, number] = [
          ballWorldPositionRef.current.x,
          ballWorldPositionRef.current.y,
          ballWorldPositionRef.current.z,
        ];
        const traj = computeDeterministicTrajectory({
          origin,
          clubId: state.selectedClub,
          power: aim.power,
          aimDirection: aim.dir,
          sampleGroundY: (x, z) =>
            getCourseSurfaceElevationAt(courseRef.current, x, z),
        });

        arcRenderStateRef.current = {
          visible: true,
          arcPoints: traj.arcPoints,
          landingPoint: traj.landingPoint,
          landingRingRadius: traj.landingRingRadius,
          aimDir: traj.horizontalDirection,
          power: aim.power,
          colorHex: CLUB_SPECS[state.selectedClub].arcHex,
        };

        state.setAimPreview({
          isAiming: true,
          clubId: state.selectedClub,
          power: aim.power,
          aimDirection: traj.horizontalDirection,
          launchVelocity: traj.launchVelocity,
          arcPoints: traj.arcPoints,
          landingPoint: traj.landingPoint,
          landingRingRadius: traj.landingRingRadius,
        });
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      activePointersRef.current.delete(e.pointerId);
      try {
        if (dom.hasPointerCapture(e.pointerId)) {
          dom.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore if already released
      }

      const g = gestureRef.current;
      if (g.kind === 'aim' && g.pointerId === e.pointerId) {
        const rect = dom.getBoundingClientRect();
        const aim = computeAimFromDrag(
          g.currX - g.startX,
          g.currY - g.startY,
          rect.width,
          rect.height,
        );
        arcRenderStateRef.current.visible = false;
        gestureRef.current = { kind: 'none' };

        if (!aim.valid) {
          useCurbsideStore.getState().clearAimPreview();
          return;
        }

        const state = useCurbsideStore.getState();
        if (
          state.isRoundComplete ||
          (state.ballPhase !== 'resting' && state.ballPhase !== 'aiming')
        ) {
          useCurbsideStore.getState().clearAimPreview();
          return;
        }

        const origin: [number, number, number] = [
          ballWorldPositionRef.current.x,
          ballWorldPositionRef.current.y,
          ballWorldPositionRef.current.z,
        ];
        const traj = computeDeterministicTrajectory({
          origin,
          clubId: state.selectedClub,
          power: aim.power,
          aimDirection: aim.dir,
          sampleGroundY: (x, z) =>
            getCourseSurfaceElevationAt(courseRef.current, x, z),
        });

        state.launchShot({
          origin,
          clubId: state.selectedClub,
          power: aim.power,
          aimDirection: traj.horizontalDirection,
          launchVelocity: traj.launchVelocity,
        });
        return;
      }

      if (activePointersRef.current.size === 0) {
        gestureRef.current = { kind: 'none' };
      } else if (g.kind === 'pinch' && activePointersRef.current.size === 1) {
        const [remId, remPt] = Array.from(activePointersRef.current.entries())[0];
        gestureRef.current = {
          kind: 'orbit',
          pointerId: remId,
          lastX: remPt.x,
          lastY: remPt.y,
        };
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(THREE.MathUtils.clamp(e.deltaY, -120, 120) * 0.0014);
      cameraControlRef.current?.zoomByFactor(factor);
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onVisibility = () => {
      if (document.hidden) cancelAllGestures();
    };

    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointermove', onPointerMove);
    dom.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('pointercancel', cancelAllGestures);
    dom.addEventListener('lostpointercapture', cancelAllGestures);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('blur', cancelAllGestures);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointercancel', cancelAllGestures);
      dom.removeEventListener('lostpointercapture', cancelAllGestures);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('blur', cancelAllGestures);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [camera, gl, ballWorldPositionRef, cameraControlRef]);

  // Recompute preview smoothly if user switches club mid-drag or before release
  useEffect(() => {
    const g = gestureRef.current;
    if (g.kind !== 'aim') return;
    const rect = gl.domElement.getBoundingClientRect();
    const aim = computeAimFromDrag(
      g.currX - g.startX,
      g.currY - g.startY,
      rect.width,
      rect.height,
    );
    if (!aim.valid) return;
    const origin: [number, number, number] = [
      ballWorldPositionRef.current.x,
      ballWorldPositionRef.current.y,
      ballWorldPositionRef.current.z,
    ];
    const traj = computeDeterministicTrajectory({
      origin,
      clubId: selectedClub,
      power: aim.power,
      aimDirection: aim.dir,
      sampleGroundY: (x, z) => getCourseSurfaceElevationAt(course, x, z),
    });
    arcRenderStateRef.current = {
      visible: true,
      arcPoints: traj.arcPoints,
      landingPoint: traj.landingPoint,
      landingRingRadius: traj.landingRingRadius,
      aimDir: traj.horizontalDirection,
      power: aim.power,
      colorHex: CLUB_SPECS[selectedClub].arcHex,
    };
  }, [selectedClub, course, gl, ballWorldPositionRef]);

  useFrame((rootState) => {
    const t = rootState.clock.elapsedTime;
    const ballPos = ballWorldPositionRef.current;
    const isOverview = useCurbsideStore.getState().cameraMode === 'overview';
    const showCue =
      !isRoundComplete && (ballPhase === 'resting' || ballPhase === 'aiming');

    // Dual-ring pulsing resting ball locator so player spots the ball instantly in Overview
    if (cueHaloRef.current) {
      cueHaloRef.current.visible = showCue;
      if (showCue) {
        const groundY = getCourseSurfaceElevationAt(
          course,
          ballPos.x,
          ballPos.z,
        );
        const overviewFactor = isOverview ? 1.24 : 0.72;
        cueHaloRef.current.position.set(
          ballPos.x,
          Math.max(groundY, ballPos.y - BALL_RADIUS) + 0.026,
          ballPos.z,
        );
        cueHaloRef.current.scale.set(overviewFactor, 1, overviewFactor);
        if (cueOuterRingRef.current) {
          const pulse = 1 + Math.sin(t * 3.4) * 0.16;
          cueOuterRingRef.current.scale.set(pulse, pulse, 1);
        }
      }
    }

    const arcState = arcRenderStateRef.current;
    const dots = dotsMeshRef.current;
    const landingGroup = landingGroupRef.current;
    const tether = tetherMeshRef.current;

    if (!arcState.visible || arcState.arcPoints.length < 2) {
      if (dots) dots.visible = false;
      if (landingGroup) landingGroup.visible = false;
      if (tether) tether.visible = false;
      return;
    }

    const overviewDotScale = isOverview ? 1.4 : 1.0;
    const overviewRingScale = isOverview ? 1.38 : 1.0;

    if (dots) {
      dots.visible = true;
      const pts = arcState.arcPoints;
      const count = Math.min(MAX_ARC_DOTS, pts.length);
      for (let i = 0; i < MAX_ARC_DOTS; i++) {
        if (i >= count) {
          dummyObj.scale.set(0, 0, 0);
          dummyObj.updateMatrix();
          dots.setMatrixAt(i, dummyObj.matrix);
          continue;
        }
        const frac = count > 1 ? i / (count - 1) : 0;
        const srcIdx = Math.min(
          pts.length - 1,
          Math.round(frac * (pts.length - 1)),
        );
        const p = pts[srcIdx];
        const radiusScale = (1.0 - frac * 0.42) * overviewDotScale;
        dummyObj.position.set(p[0], p[1], p[2]);
        dummyObj.scale.setScalar(radiusScale);
        dummyObj.updateMatrix();
        dots.setMatrixAt(i, dummyObj.matrix);
      }
      dots.instanceMatrix.needsUpdate = true;
    }

    if (landingGroup) {
      landingGroup.visible = true;
      const [lx, ly, lz] = arcState.landingPoint;
      const surfY = getCourseSurfaceElevationAt(course, lx, lz);
      landingGroup.position.set(lx, Math.max(ly, surfY) + 0.035, lz);
      const r = Math.max(0.28, arcState.landingRingRadius) * overviewRingScale;
      landingGroup.scale.set(r, 1, r);
      if (landingRingRef.current) {
        const ringPulse = 1 + Math.sin(t * 6.0) * 0.06;
        landingRingRef.current.scale.set(ringPulse, ringPulse, 1);
      }
    }

    if (tether) {
      tether.visible = true;
      const len = (0.65 + arcState.power * 2.1) * (isOverview ? 1.25 : 1.0);
      // Rotate parent around +Y so local +Z points strictly opposite aimDir
      const oppYaw = Math.atan2(-arcState.aimDir[0], -arcState.aimDir[1]);
      tether.position.set(
        ballPos.x,
        ballPos.y - BALL_RADIUS + 0.032,
        ballPos.z,
      );
      tether.rotation.set(0, oppYaw, 0);
      tether.scale.set(isOverview ? 1.3 : 1, 1, len);
    }
  });

  const clubColors = CLUB_SPECS[selectedClub];

  return (
    <group name="aim-controls-and-arc">
      {/* Crisp dual-ring resting ball locator (high contrast in zoomed-out Overview) */}
      <group
        ref={cueHaloRef}
        visible={!isRoundComplete && (ballPhase === 'resting' || ballPhase === 'aiming')}
      >
        <mesh rotation={[-Math.PI * 0.5, 0, 0]}>
          <ringGeometry args={[0.3, 0.48, 28]} />
          <meshBasicMaterial
            color="#FFFFFF"
            transparent
            opacity={0.92}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={cueOuterRingRef} rotation={[-Math.PI * 0.5, 0, 0]}>
          <ringGeometry args={[0.56, 0.84, 32]} />
          <meshBasicMaterial
            color={clubColors.accentHex}
            transparent
            opacity={0.86}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* Slingshot pullback power band behind the ball */}
      <group ref={tetherMeshRef} visible={false}>
        <mesh position={[0, 0, 0.55]} rotation={[-Math.PI * 0.5, 0, 0]}>
          <planeGeometry args={[0.18, 0.9]} />
          <meshBasicMaterial
            color={clubColors.accentHex}
            transparent
            opacity={0.8}
            depthWrite={false}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* Crisp dotted 3D trajectory arc */}
      <instancedMesh
        ref={dotsMeshRef}
        args={[undefined, undefined, MAX_ARC_DOTS]}
        visible={false}
        frustumCulled={false}
      >
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshBasicMaterial color={clubColors.arcHex} toneMapped={false} />
      </instancedMesh>

      {/* Honest ground landing zone target ring */}
      <group ref={landingGroupRef} visible={false}>
        <mesh ref={landingRingRef} rotation={[-Math.PI * 0.5, 0, 0]}>
          <ringGeometry args={[0.7, 1.0, 28]} />
          <meshBasicMaterial
            color={clubColors.accentHex}
            transparent
            opacity={0.94}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh rotation={[-Math.PI * 0.5, 0, 0]}>
          <circleGeometry args={[0.7, 28]} />
          <meshBasicMaterial
            color={clubColors.arcHex}
            transparent
            opacity={0.26}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh rotation={[-Math.PI * 0.5, 0, 0]} position={[0, 0.005, 0]}>
          <circleGeometry args={[0.22, 18]} />
          <meshBasicMaterial color="#FFFFFF" depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
