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
import {
  ARCHITECTURAL_WALLS,
  AUDIT_CAMERA_STATIONS,
  COURSE_PROPS,
  PERIMETER_BUILDINGS,
  STREET_SCOUT_CAMERA_PRESET,
} from '@/config/courseMasterPlan';
import { intersectRayAABB3D } from '@/lib/geometryHelpers';
import type { Vec3Tuple } from '@/types';
import { useCurbsideStore } from '@/store';

export interface CameraRigControl {
  orbitDelta: (deltaYawRad: number, deltaPitchRad: number) => void;
  zoomByFactor: (factor: number) => void;
  panByScreenDelta: (dxPx: number, dyPx: number, viewportHeightPx: number) => void;
  resetView: () => void;
  getCurrentYaw: () => number;
}

export interface CameraRigProps {
  ballWorldPositionRef?: MutableRefObject<THREE.Vector3>;
  ballMeshRef?: RefObject<THREE.Object3D | null>;
  controlRef?: MutableRefObject<CameraRigControl | null>;
}

interface MaterialFadeSnapshot {
  mesh: THREE.Mesh;
  origMaterial: THREE.Material | THREE.Material[];
  fadeMaterial: THREE.Material | THREE.Material[];
  fadeLeafMaterials: Array<{
    mat: THREE.Material & { opacity: number };
    origOpacity: number;
  }>;
}

interface OccludableEntry {
  object: THREE.Object3D;
  aabb: { min: Vec3Tuple; max: Vec3Tuple };
  enterMarginXZ: number;
  exitMarginXZ: number;
  snapshots: MaterialFadeSnapshot[];
  currentOpacity: number;
  isFaded: boolean;
  clearHoldSec: number;
  showingFadeMaterial: boolean;
}

const FADE_MIN_OPACITY = 0.16;
const OCCLUDE_ENTER_MARGIN_XZ = 0.78;
const OCCLUDE_EXIT_MARGIN_XZ = 0.98;
const OCCLUDE_PROP_ENTER_MARGIN_XZ = 0.58;
const OCCLUDE_PROP_EXIT_MARGIN_XZ = 0.78;
const OCCLUDE_HOLD_SECONDS = 0.25;
const OCCLUDE_OPACITY_SNAP_EPS = 0.002;
const OCCLUDE_NEAR_LENS_ENTER_MARGIN = 0.75;
const OCCLUDE_NEAR_LENS_EXIT_MARGIN = 0.95;
const CAMERA_SNAP_EPS = 1e-4;
const QA_SLOW_ORBIT_OMEGA = (Math.PI * 2) / 8.0;

// Interior dogleg corner buildings must fade via occlusion instead of pushing/clamping the camera
const INTERIOR_CORNER_BUILDING_IDS = new Set([
  'bld-se-corner-bodega',
  'bld-south-courtyard-1',
  'bld-sw-corner-bakery',
]);

let cachedSlowOrbitFlag: boolean | null = null;

function isQaSlowOrbitActive(): boolean {
  if (typeof window === 'undefined') return false;
  const winFlag = (window as unknown as { __CURBSIDE_QA_SLOW_ORBIT__?: boolean })
    .__CURBSIDE_QA_SLOW_ORBIT__;
  if (typeof winFlag === 'boolean') return winFlag;
  if (cachedSlowOrbitFlag !== null) return cachedSlowOrbitFlag;
  try {
    cachedSlowOrbitFlag =
      new URLSearchParams(window.location.search).get('qaSlowOrbit') === '1';
  } catch {
    cachedSlowOrbitFlag = false;
  }
  return cachedSlowOrbitFlag;
}

function shortestAngleDelta(fromRad: number, toRad: number): number {
  const diff = toRad - fromRad;
  return Math.atan2(Math.sin(diff), Math.cos(diff));
}

function resolveObjectAabb(
  obj: THREE.Object3D,
): { min: Vec3Tuple; max: Vec3Tuple } | null {
  const userAabb = obj.userData?.aabb as
    | { min: Vec3Tuple; max: Vec3Tuple }
    | undefined;
  let declaredAabb: { min: Vec3Tuple; max: Vec3Tuple } | null =
    userAabb?.min && userAabb?.max ? userAabb : null;

  if (!declaredAabb) {
    const propId = obj.userData?.propId as string | undefined;
    if (propId) {
      const found = COURSE_PROPS.find((p) => p.id === propId);
      if (found?.aabb) {
        declaredAabb = found.aabb;
      }
    }
  }

  const box = new THREE.Box3().setFromObject(obj);
  const meshAabb = !box.isEmpty()
    ? {
        min: [box.min.x, box.min.y, box.min.z] as Vec3Tuple,
        max: [box.max.x, box.max.y, box.max.z] as Vec3Tuple,
      }
    : null;

  if (declaredAabb && meshAabb) {
    return {
      min: [
        Math.min(declaredAabb.min[0], meshAabb.min[0]),
        Math.min(declaredAabb.min[1], meshAabb.min[1]),
        Math.min(declaredAabb.min[2], meshAabb.min[2]),
      ],
      max: [
        Math.max(declaredAabb.max[0], meshAabb.max[0]),
        Math.max(declaredAabb.max[1], meshAabb.max[1]),
        Math.max(declaredAabb.max[2], meshAabb.max[2]),
      ],
    };
  }

  return declaredAabb ?? meshAabb;
}

function createFadeLeafMaterial(orig: THREE.Material): {
  clone: THREE.Material;
  origOpacity: number;
} {
  const c = orig.clone() as THREE.Material & {
    transparent: boolean;
    opacity: number;
    depthWrite: boolean;
  };
  c.transparent = true;
  c.depthWrite = true;
  c.opacity = orig.opacity;
  c.needsUpdate = true;
  return { clone: c, origOpacity: orig.opacity };
}

function cloneMaterialsForOcclusion(
  obj: THREE.Object3D,
): MaterialFadeSnapshot[] {
  const snapshots: MaterialFadeSnapshot[] = [];
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    if (Array.isArray(mesh.material)) {
      const origList = mesh.material;
      const fadeLeafMaterials: MaterialFadeSnapshot['fadeLeafMaterials'] = [];
      const fadeList = origList.map((m) => {
        const { clone, origOpacity } = createFadeLeafMaterial(m);
        fadeLeafMaterials.push({
          mat: clone as THREE.Material & { opacity: number },
          origOpacity,
        });
        return clone;
      });
      snapshots.push({
        mesh,
        origMaterial: origList,
        fadeMaterial: fadeList,
        fadeLeafMaterials,
      });
    } else {
      const orig = mesh.material;
      const { clone, origOpacity } = createFadeLeafMaterial(orig);
      snapshots.push({
        mesh,
        origMaterial: orig,
        fadeMaterial: clone,
        fadeLeafMaterials: [
          {
            mat: clone as THREE.Material & { opacity: number },
            origOpacity,
          },
        ],
      });
    }
  });
  return snapshots;
}

function applyEntryOpacity(entry: OccludableEntry, nextOpacity: number): void {
  const shouldUseFade = nextOpacity < 0.998;
  for (const snap of entry.snapshots) {
    if (shouldUseFade) {
      if (!entry.showingFadeMaterial) {
        snap.mesh.material = snap.fadeMaterial;
      }
      for (const leaf of snap.fadeLeafMaterials) {
        leaf.mat.opacity = Math.min(leaf.origOpacity, nextOpacity);
      }
    } else if (entry.showingFadeMaterial) {
      snap.mesh.material = snap.origMaterial;
    }
  }
  entry.showingFadeMaterial = shouldUseFade;
}

export function CameraRig({
  ballWorldPositionRef,
  ballMeshRef,
  controlRef,
}: CameraRigProps) {
  const { camera, gl, scene } = useThree();

  const currentLookAtRef = useRef(new THREE.Vector3(0, 1.0, 20));
  const currentPosRef = useRef(new THREE.Vector3(0, 2.25, 32.22));
  const initializedRef = useRef(false);
  const lastAuditStationRef = useRef<string | null>(null);
  const pitchOffsetRef = useRef(0);
  const zoomScaleRef = useRef(1);

  // Smooth cylindrical follow coordinates (prevents chord-wise overhead whip on 90° post-shot turns)
  const smoothedYawRef = useRef(useCurbsideStore.getState().aimYaw);
  const smoothedBehindDistRef = useRef(4.7);
  const smoothedEyeHeightRef = useRef(2.08);
  const smoothedForwardDistRef = useRef(4.8);
  const smoothedLookHeightRef = useRef(0.72);
  const smoothedFlightRiseRef = useRef(0);
  const shotLaunchYRef = useRef<number | null>(null);
  const pullHoldYawRef = useRef<number | null>(null);
  const scoutBlendRef = useRef(0);
  const slowOrbitElapsedRef = useRef(0);

  const occludablesRef = useRef<OccludableEntry[]>([]);
  const knownObjectsRef = useRef<Set<THREE.Object3D>>(new Set());
  const elapsedSecRef = useRef(0);
  const lastScanSecRef = useRef(-10);
  const scanCountRef = useRef(0);
  const lastSceneChildCountRef = useRef(-1);
  const hasWarmedShadersRef = useRef(false);

  // Scratch vectors to avoid per-frame allocations
  const ballVecRef = useRef(new THREE.Vector3());
  const followPosRef = useRef(new THREE.Vector3());
  const followLookAtRef = useRef(new THREE.Vector3());
  const scoutLookAtScratchRef = useRef(new THREE.Vector3());
  const appliedLookAtRef = useRef(new THREE.Vector3(NaN, NaN, NaN));
  const desiredPosRef = useRef(new THREE.Vector3());
  const desiredLookAtRef = useRef(new THREE.Vector3());
  const rayDirRef = useRef(new THREE.Vector3());
  const fountainHoldPosRef = useRef<THREE.Vector3 | null>(null);
  const fountainHoldLookAtRef = useRef<THREE.Vector3 | null>(null);
  const wasFountainDropRef = useRef(false);

  // Static outer perimeter wall/facade AABBs expanded for soft camera lens avoidance.
  // Interior dogleg corner buildings are intentionally excluded so occlusion fade handles them cleanly.
  const solidWallAabbs = useMemo(() => {
    const pad = 0.55;
    const boxes: Array<{ min: Vec3Tuple; max: Vec3Tuple }> = [];
    for (const b of PERIMETER_BUILDINGS) {
      if (INTERIOR_CORNER_BUILDING_IDS.has(b.id)) continue;
      boxes.push({
        min: [b.aabb.min[0] - pad, b.aabb.min[1] - 0.5, b.aabb.min[2] - pad],
        max: [b.aabb.max[0] + pad, b.aabb.max[1] + 0.5, b.aabb.max[2] + pad],
      });
    }
    for (const w of ARCHITECTURAL_WALLS) {
      if (w.size[1] < 1.8) continue;
      boxes.push({
        min: [
          w.center[0] - w.size[0] * 0.5 - pad,
          w.center[1] - w.size[1] * 0.5 - 0.5,
          w.center[2] - w.size[2] * 0.5 - pad,
        ],
        max: [
          w.center[0] + w.size[0] * 0.5 + pad,
          w.center[1] + w.size[1] * 0.5 + 0.5,
          w.center[2] + w.size[2] * 0.5 + pad,
        ],
      });
    }
    return boxes;
  }, []);

  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      orbitDelta: (deltaYawRad, deltaPitchRad) => {
        const s = useCurbsideStore.getState();
        s.setAimYaw(s.aimYaw + deltaYawRad);
        pitchOffsetRef.current = Math.max(
          -0.45,
          Math.min(0.65, pitchOffsetRef.current + deltaPitchRad),
        );
      },
      zoomByFactor: (factor) => {
        zoomScaleRef.current = Math.max(
          0.72,
          Math.min(1.45, zoomScaleRef.current * factor),
        );
      },
      panByScreenDelta: () => {
        // Street-level follow camera keeps ball anchored in frame
      },
      resetView: () => {
        pitchOffsetRef.current = 0;
        zoomScaleRef.current = 1;
      },
      getCurrentYaw: () => useCurbsideStore.getState().aimYaw,
    };
    return () => {
      if (controlRef) controlRef.current = null;
    };
  }, [controlRef]);

  // Clean up cloned fade materials on unmount
  useEffect(() => {
    return () => {
      for (const entry of occludablesRef.current) {
        for (const snap of entry.snapshots) {
          snap.mesh.material = snap.origMaterial;
          if (Array.isArray(snap.fadeMaterial)) {
            for (const m of snap.fadeMaterial) m.dispose();
          } else {
            snap.fadeMaterial.dispose();
          }
        }
      }
      occludablesRef.current = [];
      knownObjectsRef.current.clear();
    };
  }, []);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    elapsedSecRef.current += dt;
    const store = useCurbsideStore.getState();

    // Read Rapier-interpolated rendered mesh matrix first; fall back to vector ref / store
    const ballVec = ballVecRef.current;
    if (ballMeshRef?.current) {
      ballMeshRef.current.getWorldPosition(ballVec);
    } else if (ballWorldPositionRef?.current) {
      ballVec.copy(ballWorldPositionRef.current);
    } else {
      ballVec.set(...store.ballPosition);
    }
    const bx = ballVec.x;
    const by = ballVec.y;
    const bz = ballVec.z;

    const perspCam = camera as THREE.PerspectiveCamera;
    const slowOrbit = isQaSlowOrbitActive();
    let desiredFov = 52;
    let instantSnap = false;

    const inFlight =
      store.shotPhase === 'ball_in_flight' || store.shotPhase === 'settling';
    if (inFlight && shotLaunchYRef.current === null) {
      shotLaunchYRef.current = by;
    } else if (!inFlight) {
      shotLaunchYRef.current = null;
    }

    // 1. Resolve active camera target mode
    if (store.cameraAuditStationId) {
      wasFountainDropRef.current = false;
      fountainHoldPosRef.current = null;
      fountainHoldLookAtRef.current = null;
      const station = AUDIT_CAMERA_STATIONS.find(
        (s) => s.id === store.cameraAuditStationId,
      );
      if (station) {
        if (slowOrbit) {
          slowOrbitElapsedRef.current += dt;
          const dx = station.position[0] - station.lookAt[0];
          const dz = station.position[2] - station.lookAt[2];
          const angle = slowOrbitElapsedRef.current * QA_SLOW_ORBIT_OMEGA;
          const ca = Math.cos(angle);
          const sa = Math.sin(angle);
          desiredPosRef.current.set(
            station.lookAt[0] + dx * ca - dz * sa,
            station.position[1],
            station.lookAt[2] + dx * sa + dz * ca,
          );
          desiredLookAtRef.current.set(...station.lookAt);
          instantSnap = true;
        } else {
          desiredPosRef.current.set(...station.position);
          desiredLookAtRef.current.set(...station.lookAt);
        }
        desiredFov = station.fovDeg;
        if (lastAuditStationRef.current !== station.id) {
          lastAuditStationRef.current = station.id;
          slowOrbitElapsedRef.current = 0;
          instantSnap = true;
        }
      }
    } else {
      lastAuditStationRef.current = null;

      // Update Street Scout ease-in-out blend scalar
      const targetScout = store.isStreetScoutActive ? 1 : 0;
      const scoutAlpha = 1 - Math.exp(-6.5 * dt);
      scoutBlendRef.current =
        Math.abs(targetScout - scoutBlendRef.current) < 1e-4
          ? targetScout
          : THREE.MathUtils.lerp(scoutBlendRef.current, targetScout, scoutAlpha);

      // Lock follow yaw steady during active slingshot pullback so thumb tremor never shakes the camera
      if (!slowOrbit && store.shotPhase === 'pulling') {
        if (pullHoldYawRef.current === null) {
          pullHoldYawRef.current = smoothedYawRef.current;
        }
      } else {
        pullHoldYawRef.current = null;
      }

      // Compute cylindrical/polar follow pose with exponential smoothing
      const targetFollowYaw =
        !slowOrbit && store.shotPhase === 'pulling' && pullHoldYawRef.current !== null
          ? pullHoldYawRef.current
          : store.aimYaw;
      const baseYaw = slowOrbit
        ? targetFollowYaw +
          (slowOrbitElapsedRef.current += dt) * QA_SLOW_ORBIT_OMEGA
        : targetFollowYaw;
      if (!slowOrbit) slowOrbitElapsedRef.current = 0;

      // Hold camera position & yaw calm during the brief < 0.6s fountain drop arc,
      // then snap cleanly to the drop-zone aim pose once landed (eliminates 446°/s whip).
      if (store.shotPhase === 'fountain_drop' && !slowOrbit) {
        if (!wasFountainDropRef.current) {
          wasFountainDropRef.current = true;
          fountainHoldPosRef.current = currentPosRef.current.clone();
          fountainHoldLookAtRef.current = currentLookAtRef.current.clone();
        }
        desiredPosRef.current.copy(
          fountainHoldPosRef.current ?? currentPosRef.current,
        );
        desiredLookAtRef.current.copy(
          fountainHoldLookAtRef.current ?? currentLookAtRef.current,
        );
        desiredFov = 52;
      } else {
        if (wasFountainDropRef.current) {
          wasFountainDropRef.current = false;
          fountainHoldPosRef.current = null;
          fountainHoldLookAtRef.current = null;
          smoothedYawRef.current = store.aimYaw;
          smoothedFlightRiseRef.current = 0;
          smoothedBehindDistRef.current = 4.7 * zoomScaleRef.current;
          smoothedEyeHeightRef.current = 2.08 + pitchOffsetRef.current * 1.1;
          smoothedForwardDistRef.current = 4.8;
          smoothedLookHeightRef.current = 0.72;
          instantSnap = true;
        }

        const yawRate = 7.5;
        const yawAlpha = slowOrbit ? 1 : 1 - Math.exp(-yawRate * dt);
        const poseAlpha = 1 - Math.exp(-8.5 * dt);
        const riseAlpha = 1 - Math.exp(-4.5 * dt);

        const dYaw = shortestAngleDelta(smoothedYawRef.current, baseYaw);
        smoothedYawRef.current =
          Math.abs(dYaw) < 1e-5
            ? baseYaw
            : smoothedYawRef.current + dYaw * yawAlpha;

        const launchY = shotLaunchYRef.current ?? by;
        const apexLift = Math.max(0, by - launchY);
        const targetFlightRise = inFlight
          ? 1.2 + THREE.MathUtils.clamp(apexLift * 0.24, 0, 1.2)
          : 0;
        smoothedFlightRiseRef.current =
          Math.abs(targetFlightRise - smoothedFlightRiseRef.current) < 1e-4
            ? targetFlightRise
            : THREE.MathUtils.lerp(
                smoothedFlightRiseRef.current,
                targetFlightRise,
                riseAlpha,
              );

        const targetBehindDist = (inFlight ? 5.6 : 4.7) * zoomScaleRef.current;
        const targetEyeHeight =
          (inFlight ? 2.3 : 2.08) +
          pitchOffsetRef.current * 1.1 +
          smoothedFlightRiseRef.current;
        const targetForwardDist = inFlight ? 2.6 : 4.8;
        const targetLookHeight = inFlight ? 0.35 + apexLift * 0.15 : 0.72;

        smoothedBehindDistRef.current =
          Math.abs(targetBehindDist - smoothedBehindDistRef.current) < 1e-4
            ? targetBehindDist
            : THREE.MathUtils.lerp(
                smoothedBehindDistRef.current,
                targetBehindDist,
                poseAlpha,
              );
        smoothedEyeHeightRef.current =
          Math.abs(targetEyeHeight - smoothedEyeHeightRef.current) < 1e-4
            ? targetEyeHeight
            : THREE.MathUtils.lerp(
                smoothedEyeHeightRef.current,
                targetEyeHeight,
                poseAlpha,
              );
        smoothedForwardDistRef.current =
          Math.abs(targetForwardDist - smoothedForwardDistRef.current) < 1e-4
            ? targetForwardDist
            : THREE.MathUtils.lerp(
                smoothedForwardDistRef.current,
                targetForwardDist,
                poseAlpha,
              );
        smoothedLookHeightRef.current =
          Math.abs(targetLookHeight - smoothedLookHeightRef.current) < 1e-4
            ? targetLookHeight
            : THREE.MathUtils.lerp(
                smoothedLookHeightRef.current,
                targetLookHeight,
                poseAlpha,
              );

        const dirX = Math.sin(smoothedYawRef.current);
        const dirZ = -Math.cos(smoothedYawRef.current);

        let camX = bx - dirX * smoothedBehindDistRef.current;
        let camY = by + smoothedEyeHeightRef.current;
        let camZ = bz - dirZ * smoothedBehindDistRef.current;

        // Soft wall-avoidance clamping along ball->camera ray so lens never clips inside outer perimeter walls
        const rayStart: Vec3Tuple = [bx, by + 0.55, bz];
        const vecX = camX - rayStart[0];
        const vecY = camY - rayStart[1];
        const vecZ = camZ - rayStart[2];
        const vecLen = Math.hypot(vecX, vecY, vecZ);
        if (vecLen > 1.2) {
          const rayDir: Vec3Tuple = [vecX / vecLen, vecY / vecLen, vecZ / vecLen];
          let clampedDist = vecLen;
          for (const wallBox of solidWallAabbs) {
            const hit = intersectRayAABB3D(rayStart, rayDir, wallBox, vecLen);
            if (hit.hit && hit.tMin > 0.25 && hit.tMin < clampedDist) {
              clampedDist = Math.max(1.2, hit.tMin);
            }
          }
          if (clampedDist < vecLen) {
            camX = rayStart[0] + rayDir[0] * clampedDist;
            camY = rayStart[1] + rayDir[1] * clampedDist;
            camZ = rayStart[2] + rayDir[2] * clampedDist;
          }
        }

        followPosRef.current.set(camX, camY, camZ);
        followLookAtRef.current.set(
          bx + dirX * smoothedForwardDistRef.current,
          by + smoothedLookHeightRef.current,
          bz + dirZ * smoothedForwardDistRef.current,
        );

        if (scoutBlendRef.current <= 0) {
          desiredPosRef.current.copy(followPosRef.current);
          desiredLookAtRef.current.copy(followLookAtRef.current);
          desiredFov = inFlight ? 54 : 52;
        } else {
          // Smoothstep ease-in-out between ball follow camera and Street Scout overview
          const u = scoutBlendRef.current;
          const ease = u * u * (3 - 2 * u);
          desiredPosRef.current
            .copy(followPosRef.current)
            .lerp(
              rayDirRef.current.set(...STREET_SCOUT_CAMERA_PRESET.position),
              ease,
            );
          desiredLookAtRef.current
            .copy(followLookAtRef.current)
            .lerp(
              scoutLookAtScratchRef.current.set(
                ...STREET_SCOUT_CAMERA_PRESET.lookAt,
              ),
              ease,
            );
          desiredFov = THREE.MathUtils.lerp(
            inFlight ? 54 : 52,
            STREET_SCOUT_CAMERA_PRESET.fovDeg,
            ease,
          );
        }

        if (slowOrbit) {
          instantSnap = true;
        }
      }
    }

    if (!initializedRef.current || instantSnap) {
      initializedRef.current = true;
      currentPosRef.current.copy(desiredPosRef.current);
      currentLookAtRef.current.copy(desiredLookAtRef.current);
      if (
        !camera.position.equals(currentPosRef.current) ||
        !appliedLookAtRef.current.equals(currentLookAtRef.current)
      ) {
        camera.position.copy(currentPosRef.current);
        camera.lookAt(currentLookAtRef.current);
        appliedLookAtRef.current.copy(currentLookAtRef.current);
      }
      if (perspCam.isPerspectiveCamera && perspCam.fov !== desiredFov) {
        perspCam.fov = desiredFov;
        perspCam.updateProjectionMatrix();
      }
    } else {
      const followRate = store.isStreetScoutActive ? 7.5 : 10.5;
      const alpha = 1 - Math.exp(-followRate * dt);

      const posDist = currentPosRef.current.distanceTo(desiredPosRef.current);
      const lookDist = currentLookAtRef.current.distanceTo(
        desiredLookAtRef.current,
      );

      if (posDist <= CAMERA_SNAP_EPS) {
        currentPosRef.current.copy(desiredPosRef.current);
      } else {
        currentPosRef.current.lerp(desiredPosRef.current, alpha);
      }

      if (lookDist <= CAMERA_SNAP_EPS) {
        currentLookAtRef.current.copy(desiredLookAtRef.current);
      } else {
        currentLookAtRef.current.lerp(desiredLookAtRef.current, alpha);
      }

      if (
        !camera.position.equals(currentPosRef.current) ||
        !appliedLookAtRef.current.equals(currentLookAtRef.current)
      ) {
        camera.position.copy(currentPosRef.current);
        camera.lookAt(currentLookAtRef.current);
        appliedLookAtRef.current.copy(currentLookAtRef.current);
      }

      if (perspCam.isPerspectiveCamera) {
        const fovDiff = Math.abs(desiredFov - perspCam.fov);
        if (fovDiff <= 1e-3) {
          if (perspCam.fov !== desiredFov) {
            perspCam.fov = desiredFov;
            perspCam.updateProjectionMatrix();
          }
        } else {
          perspCam.fov = THREE.MathUtils.lerp(perspCam.fov, desiredFov, alpha);
          perspCam.updateProjectionMatrix();
        }
      }
    }

    // 2. Discover occludable buildings, delivery van & tall/hedge props ONCE after mount,
    // pre-cloning & pre-compiling transparent fade shaders upfront so mid-orbit fades have 0 frame hitch.
    // Stop re-traversing scene once occludables are populated unless scene.children changes.
    const sceneChildrenChanged =
      scene.children.length !== lastSceneChildCountRef.current;
    const needsInitialRetry = occludablesRef.current.length === 0;

    if (sceneChildrenChanged || needsInitialRetry) {
      lastSceneChildCountRef.current = scene.children.length;
      lastScanSecRef.current = elapsedSecRef.current;
      scanCountRef.current += 1;
      const known = knownObjectsRef.current;
      const newlyAdded: OccludableEntry[] = [];

      scene.traverse((obj) => {
        if (known.has(obj)) return;
        const isBuilding = obj.userData?.occludableBuilding === true;
        const isVehicle = obj.userData?.occludableVehicle === true;
        const isProp = obj.userData?.occludableProp === true;
        if (isBuilding || isVehicle || isProp) {
          known.add(obj);
          const aabb = resolveObjectAabb(obj);
          if (aabb) {
            const entry: OccludableEntry = {
              object: obj,
              aabb,
              enterMarginXZ: isProp
                ? OCCLUDE_PROP_ENTER_MARGIN_XZ
                : OCCLUDE_ENTER_MARGIN_XZ,
              exitMarginXZ: isProp
                ? OCCLUDE_PROP_EXIT_MARGIN_XZ
                : OCCLUDE_EXIT_MARGIN_XZ,
              snapshots: cloneMaterialsForOcclusion(obj),
              currentOpacity: 1.0,
              isFaded: false,
              clearHoldSec: 0,
              showingFadeMaterial: false,
            };
            occludablesRef.current.push(entry);
            newlyAdded.push(entry);
          }
        }
      });

      // Pre-warm shaders & transparent fade variants once on discovery so idle/orbit never hitches
      if (newlyAdded.length > 0 || !hasWarmedShadersRef.current) {
        hasWarmedShadersRef.current = true;
        for (const entry of newlyAdded) {
          for (const snap of entry.snapshots) {
            snap.mesh.material = snap.fadeMaterial;
          }
        }
        try {
          gl.compile(scene, camera);
        } catch {
          // Safe fallback if test harness provides mock renderer
        }
        for (const entry of newlyAdded) {
          for (const snap of entry.snapshots) {
            snap.mesh.material = snap.origMaterial;
          }
        }
      }
    }

    // 3. Per-frame smooth foreground occlusion fade with spatial + temporal hysteresis
    const camOrigin: Vec3Tuple = [
      camera.position.x,
      camera.position.y,
      camera.position.z,
    ];
    rayDirRef.current.set(
      bx - camOrigin[0],
      by + 0.25 - camOrigin[1],
      bz - camOrigin[2],
    );
    const camToBallDist = rayDirRef.current.length();
    const disableFade = Boolean(store.cameraAuditStationId);

    if (camToBallDist > 0.05) {
      rayDirRef.current.divideScalar(camToBallDist);
      const dirTuple: Vec3Tuple = [
        rayDirRef.current.x,
        rayDirRef.current.y,
        rayDirRef.current.z,
      ];
      // Stop ray slightly before the ball so background buildings behind the ball NEVER fade
      const rayMaxDist = Math.max(0.2, camToBallDist - 0.55);

      for (const entry of occludablesRef.current) {
        let hitNow = false;
        if (!disableFade) {
          const marginXZ = entry.isFaded
            ? entry.exitMarginXZ
            : entry.enterMarginXZ;
          const nearLensMargin = entry.isFaded
            ? Math.max(marginXZ, OCCLUDE_NEAR_LENS_EXIT_MARGIN)
            : Math.max(marginXZ, OCCLUDE_NEAR_LENS_ENTER_MARGIN);
          const nearOrInsideLens =
            camOrigin[0] >= entry.aabb.min[0] - nearLensMargin &&
            camOrigin[0] <= entry.aabb.max[0] + nearLensMargin &&
            camOrigin[1] >= entry.aabb.min[1] - 0.5 &&
            camOrigin[1] <= entry.aabb.max[1] + 0.85 &&
            camOrigin[2] >= entry.aabb.min[2] - nearLensMargin &&
            camOrigin[2] <= entry.aabb.max[2] + nearLensMargin;
          if (nearOrInsideLens) {
            hitNow = true;
          } else {
            const expandedAabb = {
              min: [
                entry.aabb.min[0] - marginXZ,
                entry.aabb.min[1] - 0.4,
                entry.aabb.min[2] - marginXZ,
              ] as Vec3Tuple,
              max: [
                entry.aabb.max[0] + marginXZ,
                entry.aabb.max[1] + 0.8,
                entry.aabb.max[2] + marginXZ,
              ] as Vec3Tuple,
            };
            const hit = intersectRayAABB3D(
              camOrigin,
              dirTuple,
              expandedAabb,
              rayMaxDist,
            );
            if (hit.hit && hit.tMin <= rayMaxDist) {
              hitNow = true;
            }
          }
        }

        if (hitNow) {
          entry.isFaded = true;
          entry.clearHoldSec = 0;
        } else if (entry.isFaded) {
          entry.clearHoldSec += dt;
          if (entry.clearHoldSec >= OCCLUDE_HOLD_SECONDS) {
            entry.isFaded = false;
            entry.clearHoldSec = 0;
          }
        }

        const targetOpacity = entry.isFaded ? FADE_MIN_OPACITY : 1.0;
        const diff = Math.abs(entry.currentOpacity - targetOpacity);
        if (diff > OCCLUDE_OPACITY_SNAP_EPS) {
          const alpha = 1 - Math.exp(-10 * dt);
          entry.currentOpacity = THREE.MathUtils.lerp(
            entry.currentOpacity,
            targetOpacity,
            alpha,
          );
          if (Math.abs(entry.currentOpacity - targetOpacity) <= OCCLUDE_OPACITY_SNAP_EPS) {
            entry.currentOpacity = targetOpacity;
          }
          applyEntryOpacity(entry, entry.currentOpacity);
        } else if (entry.currentOpacity !== targetOpacity) {
          entry.currentOpacity = targetOpacity;
          applyEntryOpacity(entry, targetOpacity);
        }
      }
    }
  });

  return null;
}
