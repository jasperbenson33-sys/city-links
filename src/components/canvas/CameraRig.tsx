'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AUDIT_CAMERA_STATIONS,
  COURSE_PROPS,
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
  controlRef?: MutableRefObject<CameraRigControl | null>;
}

interface MaterialFadeSnapshot {
  material: THREE.Material;
  origTransparent: boolean;
  origOpacity: number;
  origDepthWrite: boolean;
}

interface OccludableEntry {
  object: THREE.Object3D;
  aabb: { min: Vec3Tuple; max: Vec3Tuple };
  marginXZ: number;
  snapshots: MaterialFadeSnapshot[] | null;
  currentOpacity: number;
}

const FADE_MIN_OPACITY = 0.16;
const CORRIDOR_MARGIN_XZ = 1.35;

function resolveObjectAabb(
  obj: THREE.Object3D,
): { min: Vec3Tuple; max: Vec3Tuple } | null {
  const userAabb = obj.userData?.aabb as
    | { min: Vec3Tuple; max: Vec3Tuple }
    | undefined;
  if (userAabb?.min && userAabb?.max) {
    return userAabb;
  }

  const propId = obj.userData?.propId as string | undefined;
  if (propId) {
    const found = COURSE_PROPS.find((p) => p.id === propId);
    if (found?.aabb) {
      return found.aabb;
    }
  }

  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return null;
  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
  };
}

function cloneMaterialsForOcclusion(
  obj: THREE.Object3D,
): MaterialFadeSnapshot[] {
  const snapshots: MaterialFadeSnapshot[] = [];
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    if (Array.isArray(mesh.material)) {
      const clonedList = mesh.material.map((m) => {
        const c = m.clone();
        snapshots.push({
          material: c,
          origTransparent: m.transparent,
          origOpacity: m.opacity,
          origDepthWrite: m.depthWrite,
        });
        return c;
      });
      mesh.material = clonedList;
    } else {
      const orig = mesh.material;
      const c = orig.clone();
      snapshots.push({
        material: c,
        origTransparent: orig.transparent,
        origOpacity: orig.opacity,
        origDepthWrite: orig.depthWrite,
      });
      mesh.material = c;
    }
  });
  return snapshots;
}

function applyEntryOpacity(entry: OccludableEntry, nextOpacity: number): void {
  if (!entry.snapshots) return;
  const faded = nextOpacity < 0.99;
  for (const snap of entry.snapshots) {
    const mat = snap.material as THREE.Material & {
      transparent: boolean;
      opacity: number;
      depthWrite: boolean;
    };
    const prevTransparent = mat.transparent;
    if (faded) {
      mat.transparent = true;
      mat.depthWrite = false;
      mat.opacity = Math.min(snap.origOpacity, nextOpacity);
    } else {
      mat.transparent = snap.origTransparent;
      mat.depthWrite = snap.origDepthWrite;
      mat.opacity = snap.origOpacity;
    }
    if (prevTransparent !== mat.transparent) {
      mat.needsUpdate = true;
    }
  }
}

export function CameraRig({
  ballWorldPositionRef,
  controlRef,
}: CameraRigProps) {
  const { camera, scene } = useThree();

  const currentLookAtRef = useRef(new THREE.Vector3(0, 1.0, 20));
  const currentPosRef = useRef(new THREE.Vector3(0, 2.25, 32.22));
  const initializedRef = useRef(false);
  const lastAuditStationRef = useRef<string | null>(null);
  const pitchOffsetRef = useRef(0);
  const zoomScaleRef = useRef(1);

  const occludablesRef = useRef<OccludableEntry[]>([]);
  const knownObjectsRef = useRef<Set<THREE.Object3D>>(new Set());
  const elapsedSecRef = useRef(0);
  const lastScanSecRef = useRef(-10);
  const scanCountRef = useRef(0);
  const lastSceneChildCountRef = useRef(-1);

  // Scratch vectors to avoid per-frame allocations
  const desiredPosRef = useRef(new THREE.Vector3());
  const desiredLookAtRef = useRef(new THREE.Vector3());
  const rayDirRef = useRef(new THREE.Vector3());

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
        if (entry.snapshots) {
          for (const snap of entry.snapshots) {
            snap.material.dispose();
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
    const ballPos = ballWorldPositionRef
      ? [
          ballWorldPositionRef.current.x,
          ballWorldPositionRef.current.y,
          ballWorldPositionRef.current.z,
        ]
      : store.ballPosition;

    const bx = ballPos[0];
    const by = ballPos[1];
    const bz = ballPos[2];

    const perspCam = camera as THREE.PerspectiveCamera;
    let desiredFov = 52;
    let instantSnap = false;

    // 1. Resolve active camera target mode
    if (store.cameraAuditStationId) {
      const station = AUDIT_CAMERA_STATIONS.find(
        (s) => s.id === store.cameraAuditStationId,
      );
      if (station) {
        desiredPosRef.current.set(...station.position);
        desiredLookAtRef.current.set(...station.lookAt);
        desiredFov = station.fovDeg;
        if (lastAuditStationRef.current !== station.id) {
          lastAuditStationRef.current = station.id;
          instantSnap = true;
        }
      }
    } else {
      lastAuditStationRef.current = null;

      if (store.isStreetScoutActive) {
        desiredPosRef.current.set(...STREET_SCOUT_CAMERA_PRESET.position);
        desiredLookAtRef.current.set(...STREET_SCOUT_CAMERA_PRESET.lookAt);
        desiredFov = STREET_SCOUT_CAMERA_PRESET.fovDeg;
      } else {
        const yaw = store.aimYaw;
        const dirX = Math.sin(yaw);
        const dirZ = -Math.cos(yaw);
        const inFlight =
          store.shotPhase === 'ball_in_flight' ||
          store.shotPhase === 'settling';

        const behindDist = (inFlight ? 5.6 : 4.7) * zoomScaleRef.current;
        const eyeHeight =
          (inFlight ? 2.3 : 2.08) + pitchOffsetRef.current * 1.1;

        desiredPosRef.current.set(
          bx - dirX * behindDist,
          by + eyeHeight,
          bz - dirZ * behindDist,
        );

        const forwardOffset = inFlight ? 2.6 : 4.8;
        desiredLookAtRef.current.set(
          bx + dirX * forwardOffset,
          by + (inFlight ? 0.35 : 0.72),
          bz + dirZ * forwardOffset,
        );
        desiredFov = inFlight ? 54 : 52;
      }
    }

    if (!initializedRef.current || instantSnap) {
      initializedRef.current = true;
      currentPosRef.current.copy(desiredPosRef.current);
      currentLookAtRef.current.copy(desiredLookAtRef.current);
      camera.position.copy(currentPosRef.current);
      camera.lookAt(currentLookAtRef.current);
      if (perspCam.isPerspectiveCamera && perspCam.fov !== desiredFov) {
        perspCam.fov = desiredFov;
        perspCam.updateProjectionMatrix();
      }
    } else {
      const followRate = store.isStreetScoutActive ? 6.5 : 8.5;
      const alpha = 1 - Math.exp(-followRate * dt);
      currentPosRef.current.lerp(desiredPosRef.current, alpha);
      currentLookAtRef.current.lerp(desiredLookAtRef.current, alpha);
      camera.position.copy(currentPosRef.current);
      camera.lookAt(currentLookAtRef.current);
      if (perspCam.isPerspectiveCamera) {
        const nextFov = THREE.MathUtils.lerp(perspCam.fov, desiredFov, alpha);
        if (Math.abs(nextFov - perspCam.fov) > 0.02) {
          perspCam.fov = nextFov;
          perspCam.updateProjectionMatrix();
        }
      }
    }

    // 2. Discover occludable buildings, delivery van & tall/hedge props ONCE after mount
    // (re-scan only if Suspense added root scene children or during initial mount settle)
    const sceneChildrenChanged = scene.children.length !== lastSceneChildCountRef.current;
    const needsInitialRetry =
      occludablesRef.current.length === 0 ||
      (scanCountRef.current < 3 && elapsedSecRef.current - lastScanSecRef.current > 0.8);
    if (sceneChildrenChanged || needsInitialRetry) {
      lastSceneChildCountRef.current = scene.children.length;
      lastScanSecRef.current = elapsedSecRef.current;
      scanCountRef.current += 1;
      const known = knownObjectsRef.current;
      scene.traverse((obj) => {
        if (known.has(obj)) return;
        const isBuilding = obj.userData?.occludableBuilding === true;
        const isVehicle = obj.userData?.occludableVehicle === true;
        const isProp = obj.userData?.occludableProp === true;
        if (isBuilding || isVehicle || isProp) {
          known.add(obj);
          const aabb = resolveObjectAabb(obj);
          if (aabb) {
            occludablesRef.current.push({
              object: obj,
              aabb,
              marginXZ: isProp ? 0.85 : CORRIDOR_MARGIN_XZ,
              snapshots: null,
              currentOpacity: 1.0,
            });
          }
        }
      });
    }

    // 3. Per-frame smooth foreground occlusion fade between camera and ball
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

    if (camToBallDist > 0.25) {
      rayDirRef.current.divideScalar(camToBallDist);
      const dirTuple: Vec3Tuple = [
        rayDirRef.current.x,
        rayDirRef.current.y,
        rayDirRef.current.z,
      ];
      // Stop ray slightly before the ball so background buildings behind the ball NEVER fade
      const rayMaxDist = Math.max(0.2, camToBallDist - 0.55);

      for (const entry of occludablesRef.current) {
        let occluded = false;
        if (!disableFade) {
          const expandedAabb = {
            min: [
              entry.aabb.min[0] - entry.marginXZ,
              entry.aabb.min[1] - 0.4,
              entry.aabb.min[2] - entry.marginXZ,
            ] as Vec3Tuple,
            max: [
              entry.aabb.max[0] + entry.marginXZ,
              entry.aabb.max[1] + 0.8,
              entry.aabb.max[2] + entry.marginXZ,
            ] as Vec3Tuple,
          };
          const hit = intersectRayAABB3D(
            camOrigin,
            dirTuple,
            expandedAabb,
            rayMaxDist,
          );
          if (hit.hit && hit.tMin <= rayMaxDist) {
            occluded = true;
          }
        }

        const targetOpacity = occluded ? FADE_MIN_OPACITY : 1.0;
        if (
          occluded &&
          !entry.snapshots &&
          Math.abs(entry.currentOpacity - targetOpacity) > 0.01
        ) {
          entry.snapshots = cloneMaterialsForOcclusion(entry.object);
        }

        if (Math.abs(entry.currentOpacity - targetOpacity) > 0.005) {
          const lerpSpeed = occluded ? 11.0 : 8.5;
          entry.currentOpacity = THREE.MathUtils.lerp(
            entry.currentOpacity,
            targetOpacity,
            1 - Math.exp(-lerpSpeed * dt),
          );
          if (!occluded && entry.currentOpacity > 0.99) {
            entry.currentOpacity = 1.0;
          }
          applyEntryOpacity(entry, entry.currentOpacity);
        }
      }
    }
  });

  return null;
}
