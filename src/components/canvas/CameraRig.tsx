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
  getMasterPlanGroundElevationAt,
  getVanRampOrRoofElevationAt,
} from '@/config/courseMasterPlan';
import {
  GRAND_ESCAPADE_MASTER_PLAN,
  SUBWAY_STATION_VAULT_SPEC,
  computeForwardCourseYaw,
  computeRemainingCourseDistance,
  isSubterraneanSubwayPosition,
} from '@/config/grandEscapadeMasterPlan';
import {
  evaluateCatmullRomSpline3D,
  intersectRayAABB3D,
} from '@/lib/geometryHelpers';
import {
  AUTO_PUTTER_DISTANCE,
  BALL_RADIUS,
  type CoursePropSpec,
  type GrandEscapadeMasterPlan,
  type Vec3Tuple,
} from '@/types';
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
  origCastShadow: boolean;
  origMaterial: THREE.Material | THREE.Material[];
  fadeMaterial: THREE.Material | THREE.Material[];
  fadeLeafMaterials: Array<{
    mat: THREE.Material & { opacity: number };
    origOpacity: number;
  }>;
}

interface OccludableBox {
  min: Vec3Tuple;
  max: Vec3Tuple;
  padBottom: number;
  padTop: number;
}

interface OccludableEntry {
  object: THREE.Object3D;
  aabb: { min: Vec3Tuple; max: Vec3Tuple };
  testBoxes: OccludableBox[];
  isProp: boolean;
  isLowProp: boolean;
  tightBallRayOnly: boolean;
  perBoxNearLensOnly: boolean;
  fullFadeDist: number;
  enterMarginXZ: number;
  exitMarginXZ: number;
  nearLensEnterMargin: number;
  nearLensExitMargin: number;
  snapshots: MaterialFadeSnapshot[];
  currentOpacity: number;
  lastTargetOpacity: number;
  isFaded: boolean;
  clearHoldSec: number;
  showingFadeMaterial: boolean;
}

const FADE_MIN_OPACITY = 0.06;
const OCCLUDE_ENTER_MARGIN_XZ = 0.55;
const OCCLUDE_EXIT_MARGIN_XZ = 0.72;
const OCCLUDE_PROP_ENTER_MARGIN_XZ = 0.18;
const OCCLUDE_PROP_EXIT_MARGIN_XZ = 0.28;
const OCCLUDE_FOUNTAIN_ENTER_MARGIN_XZ = 0.12;
const OCCLUDE_FOUNTAIN_EXIT_MARGIN_XZ = 0.20;
const OCCLUDE_PROP_FULL_FADE_DIST = 4.4;
const OCCLUDE_SUBWAY_FULL_FADE_DIST = 5.4;
const OCCLUDE_HOLD_SECONDS = 0.25;
const OCCLUDE_OPACITY_SNAP_EPS = 0.002;
const OCCLUDE_NEAR_LENS_ENTER_MARGIN = 0.65;
const OCCLUDE_NEAR_LENS_EXIT_MARGIN = 0.85;
const OCCLUDE_PROP_NEAR_LENS_ENTER = 0.28;
const OCCLUDE_PROP_NEAR_LENS_EXIT = 0.42;
const LOW_PROP_HEIGHT_THRESHOLD = 1.55;
const CAMERA_SNAP_EPS = 1e-4;
const QA_SLOW_ORBIT_OMEGA = (Math.PI * 2) / 8.0;
const FLYOVER_FORWARD_SEC = 9.5;
const FLYOVER_HOLD_SEC = 0.85;
const FLYOVER_RETURN_SEC = 3.4;

// Interior dogleg corner buildings must fade via occlusion instead of pushing/clamping the camera
const INTERIOR_CORNER_BUILDING_IDS = new Set([
  'bld-se-corner-bodega',
  'bld-south-courtyard-1',
  'bld-sw-corner-bakery',
  'esc-bld-z6-south-headhouse-overbuild',
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
  planProps: CoursePropSpec[],
): { min: Vec3Tuple; max: Vec3Tuple } | null {
  obj.updateMatrixWorld(true);
  const userAabb = obj.userData?.aabb as
    | { min: Vec3Tuple; max: Vec3Tuple }
    | undefined;
  let declaredAabb: { min: Vec3Tuple; max: Vec3Tuple } | null =
    userAabb?.min && userAabb?.max ? userAabb : null;

  if (!declaredAabb) {
    const propId = obj.userData?.propId as string | undefined;
    if (propId) {
      const found = planProps.find((p) => p.id === propId);
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

function isFountainObject(obj: THREE.Object3D): boolean {
  const propId = obj.userData?.propId as string | undefined;
  return (
    obj.name === 'fountain-hazard-prop' ||
    propId === 'fountain-courtyard-front' ||
    propId === 'esc-z6-midtown-fountain'
  );
}

function isSubwayVehicleOrPillar(obj: THREE.Object3D): boolean {
  const propId = obj.userData?.propId as string | undefined;
  return (
    obj.name === 'vintage-subway-car' ||
    obj.name === 'subway-mosaic-pillar' ||
    Boolean(propId && propId.startsWith('esc-z7-'))
  );
}

function resolveOccludableBoxes(
  obj: THREE.Object3D,
  fallbackAabb: { min: Vec3Tuple; max: Vec3Tuple },
  isProp: boolean,
  isLowProp: boolean,
  tightBallRayOnly: boolean,
  planProps: CoursePropSpec[],
): OccludableBox[] {
  const propId = obj.userData?.propId as string | undefined;
  if (isFountainObject(obj)) {
    const fountainSpec = planProps.find(
      (p) =>
        p.id === propId ||
        p.id === 'fountain-courtyard-front' ||
        p.id === 'esc-z6-midtown-fountain',
    );
    const basinBox = fountainSpec?.solidColliders?.[0];
    const spireBox = fountainSpec?.solidColliders?.[1];
    if (basinBox && spireBox) {
      // Split Tier 2 at lower-bowl rim (+0.56m above basin) vs narrow upper finial (+0.28m radius)
      // so elevated sightlines over the basin or outer bowl never clip a false square corner.
      const lowerBowlTopY = Math.min(spireBox.max[1], basinBox.max[1] + 0.56);
      const centerX = (spireBox.min[0] + spireBox.max[0]) * 0.5;
      const centerZ = (spireBox.min[2] + spireBox.max[2]) * 0.5;
      return [
        { min: basinBox.min, max: basinBox.max, padBottom: 0.04, padTop: 0 },
        {
          min: spireBox.min,
          max: [spireBox.max[0], lowerBowlTopY, spireBox.max[2]],
          padBottom: 0,
          padTop: 0,
        },
        {
          min: [centerX - 0.28, lowerBowlTopY, centerZ - 0.28],
          max: [centerX + 0.28, spireBox.max[1], centerZ + 0.28],
          padBottom: 0,
          padTop: 0,
        },
      ];
    }
  }

  // Open-aisle Vintage Subway Car fades strictly by its side walls and roof canopy
  // so looking straight down the open vestibule aisle keeps the train exterior rich & solid.
  if (obj.name === 'vintage-subway-car' || propId === 'esc-z7-vintage-subway-car') {
    const carSpec = planProps.find(
      (p) => p.id === propId || p.id === 'esc-z7-vintage-subway-car',
    );
    if (carSpec?.solidColliders && carSpec.solidColliders.length > 0) {
      return carSpec.solidColliders.map((c) => ({
        min: c.min,
        max: c.max,
        padBottom: 0,
        padTop: 0.05,
      }));
    }
  }

  if (tightBallRayOnly) {
    return [{ min: fallbackAabb.min, max: fallbackAabb.max, padBottom: 0, padTop: 0 }];
  }

  return [
    {
      min: fallbackAabb.min,
      max: fallbackAabb.max,
      padBottom: isLowProp ? 0.04 : isProp ? 0.15 : 0.4,
      padTop: isLowProp ? 0 : isProp ? 0.28 : 0.75,
    },
  ];
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
  // Preserve original material blend state & depthWrite and discard via deterministic screen-space
  // Interleaved Gradient Noise (IGN) so multi-part occluders fade cleanly with zero X-ray stacking or waffle grid.
  c.transparent = orig.transparent;
  c.depthWrite = orig.depthWrite;
  c.opacity = orig.opacity;
  if (!(orig instanceof THREE.ShaderMaterial)) {
    const prevOnBeforeCompile = orig.onBeforeCompile;
    const prevCacheKey = orig.customProgramCacheKey?.() ?? '';
    c.onBeforeCompile = (shader, renderer) => {
      if (prevOnBeforeCompile) {
        prevOnBeforeCompile.call(c, shader, renderer);
      }
      if (shader.fragmentShader.includes('#include <alphatest_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <alphatest_fragment>',
          `#include <alphatest_fragment>
if (opacity <= 0.006) discard;
if (opacity < 0.998) {
  float ign = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
  if (opacity <= ign + 0.001) discard;
}`,
        );
      }
    };
    c.customProgramCacheKey = () =>
      prevCacheKey ? `${prevCacheKey}|curbside-ign-cutaway-v2` : 'curbside-ign-cutaway-v2';
  }
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
        origCastShadow: mesh.castShadow,
        origMaterial: origList,
        fadeMaterial: fadeList,
        fadeLeafMaterials,
      });
    } else {
      const orig = mesh.material;
      const { clone, origOpacity } = createFadeLeafMaterial(orig);
      snapshots.push({
        mesh,
        origCastShadow: mesh.castShadow,
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
        // Scale originally transparent sub-meshes (fountain water/droplets) proportionally so they dissolve completely
        leaf.mat.opacity =
          leaf.origOpacity < 0.99
            ? leaf.origOpacity * nextOpacity
            : nextOpacity;
      }
    } else if (entry.showingFadeMaterial) {
      snap.mesh.material = snap.origMaterial;
    }
    if (entry.isProp) {
      const nextCastShadow = snap.origCastShadow && nextOpacity > 0.25;
      if (snap.mesh.castShadow !== nextCastShadow) {
        snap.mesh.castShadow = nextCastShadow;
      }
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
  const activePlan = useCurbsideStore((s) => s.activePlan);

  const currentLookAtRef = useRef(
    new THREE.Vector3(
      activePlan.teePosition[0],
      activePlan.teePosition[1] + 1.0,
      activePlan.teePosition[2] - 10.0,
    ),
  );
  const currentPosRef = useRef(
    new THREE.Vector3(
      activePlan.teePosition[0],
      activePlan.teePosition[1] + 2.25,
      activePlan.teePosition[2] + 4.7,
    ),
  );
  const initializedRef = useRef(false);
  const lastAuditStationRef = useRef<string | null>(null);
  const pitchOffsetRef = useRef(0);
  const zoomScaleRef = useRef(1);

  // Smooth cylindrical follow coordinates (prevents chord-wise overhead whip on 90° post-shot turns)
  const smoothedYawRef = useRef(useCurbsideStore.getState().aimYaw);
  const yawVelRef = useRef(0);
  const lastManualOrbitSecRef = useRef(-10);
  const smoothedBehindDistRef = useRef(4.7);
  const smoothedEyeHeightRef = useRef(2.08);
  const smoothedForwardDistRef = useRef(4.8);
  const smoothedLookHeightRef = useRef(0.72);
  const smoothedFlightRiseRef = useRef(0);
  const smoothedWallDistRef = useRef<number | null>(null);
  const smoothedSlopePitchRef = useRef(0);
  const shotLaunchYRef = useRef<number | null>(null);
  const pullHoldYawRef = useRef<number | null>(null);
  const scoutBlendRef = useRef(0);
  const flyoverBlendRef = useRef(0);
  const flyoverElapsedRef = useRef(0);
  const wasFlyoverActiveRef = useRef(false);
  const slowOrbitElapsedRef = useRef(0);
  const flightTimerRef = useRef(0);
  const prevBallPosRef = useRef(new THREE.Vector3(NaN, NaN, NaN));
  const estimatedBallSpeedRef = useRef(0);
  const rollBlendAlphaRef = useRef(0);
  const chuteTravelYawRef = useRef<number | null>(null);

  const occludablesRef = useRef<OccludableEntry[]>([]);
  const knownObjectsRef = useRef<Set<THREE.Object3D>>(new Set());
  const elapsedSecRef = useRef(0);
  const hasIndexedOccludablesRef = useRef(false);
  const hasWarmedShadersRef = useRef(false);

  // Scratch vectors to avoid per-frame allocations
  const ballVecRef = useRef(new THREE.Vector3());
  const followPosRef = useRef(new THREE.Vector3());
  const followLookAtRef = useRef(new THREE.Vector3());
  const scoutLookAtScratchRef = useRef(new THREE.Vector3());
  const flyoverPosScratchRef = useRef(new THREE.Vector3());
  const flyoverLookAtScratchRef = useRef(new THREE.Vector3());
  const appliedLookAtRef = useRef(new THREE.Vector3(NaN, NaN, NaN));
  const desiredPosRef = useRef(new THREE.Vector3());
  const desiredLookAtRef = useRef(new THREE.Vector3());
  const rayDirRef = useRef(new THREE.Vector3());
  const fountainHoldPosRef = useRef<THREE.Vector3 | null>(null);
  const fountainHoldLookAtRef = useRef<THREE.Vector3 | null>(null);
  const wasFountainDropRef = useRef(false);

  // Static outer perimeter wall/facade AABBs expanded for soft camera lens avoidance.
  // Interior dogleg corner buildings & subway vault ceilings are intentionally excluded so
  // occlusion fade & subterranean ceiling clamping handle them cleanly.
  const solidWallAabbs = useMemo(() => {
    const pad = 0.55;
    const boxes: Array<{ min: Vec3Tuple; max: Vec3Tuple }> = [];
    for (const b of activePlan.perimeterBuildings) {
      if (INTERIOR_CORNER_BUILDING_IDS.has(b.id)) continue;
      boxes.push({
        min: [b.aabb.min[0] - pad, b.aabb.min[1] - 0.5, b.aabb.min[2] - pad],
        max: [b.aabb.max[0] + pad, b.aabb.max[1] + 0.5, b.aabb.max[2] + pad],
      });
    }
    for (const w of activePlan.architecturalWalls) {
      if (w.size[1] < 1.8) continue;
      if (w.kind === 'subway_vault_ceiling_slab') continue;
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
  }, [activePlan]);

  // Reset occlusion material cache & camera follow state cleanly when switching courses
  useEffect(() => {
    for (const entry of occludablesRef.current) {
      for (const snap of entry.snapshots) {
        snap.mesh.material = snap.origMaterial;
        snap.mesh.castShadow = snap.origCastShadow;
        if (Array.isArray(snap.fadeMaterial)) {
          for (const m of snap.fadeMaterial) m.dispose();
        } else {
          snap.fadeMaterial.dispose();
        }
      }
    }
    occludablesRef.current = [];
    knownObjectsRef.current.clear();
    hasIndexedOccludablesRef.current = false;
    hasWarmedShadersRef.current = false;
    initializedRef.current = false;
    smoothedWallDistRef.current = null;
    smoothedSlopePitchRef.current = 0;
    chuteTravelYawRef.current = null;
    flyoverBlendRef.current = 0;
    flyoverElapsedRef.current = 0;
    wasFlyoverActiveRef.current = false;
    smoothedYawRef.current = useCurbsideStore.getState().aimYaw;
    yawVelRef.current = 0;
  }, [activePlan.courseId]);

  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      orbitDelta: (deltaYawRad, deltaPitchRad) => {
        lastManualOrbitSecRef.current = elapsedSecRef.current;
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
          snap.mesh.castShadow = snap.origCastShadow;
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

  // Priority 0 preserves R3F's automatic gl.render() pass while reading after GolfBall
  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    elapsedSecRef.current += dt;
    const store = useCurbsideStore.getState();

    // Read Rapier-interpolated rendered mesh matrix first; force matrixWorld refresh if needed
    const ballVec = ballVecRef.current;
    if (ballMeshRef?.current) {
      if (ballMeshRef.current.parent) {
        ballMeshRef.current.parent.updateMatrixWorld(true);
      } else {
        ballMeshRef.current.updateMatrixWorld(true);
      }
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
      flyoverBlendRef.current = 0;
      flyoverElapsedRef.current = 0;
      wasFlyoverActiveRef.current = false;
      const station = activePlan.auditStations.find(
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
          desiredLookAtRef.current.set(
            station.lookAt[0],
            station.lookAt[1],
            station.lookAt[2],
          );
          instantSnap = true;
        } else {
          desiredPosRef.current.set(
            station.position[0],
            station.position[1],
            station.position[2],
          );
          desiredLookAtRef.current.set(
            station.lookAt[0],
            station.lookAt[1],
            station.lookAt[2],
          );
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

      // Update 1-Tap 7-Zone Course Flyover Scout state
      const escapadePlan =
        activePlan.courseId === 'grand-escapade'
          ? (activePlan as GrandEscapadeMasterPlan)
          : null;
      const hasFlyover = Boolean(
        escapadePlan?.flyoverSplinePoints?.length &&
          escapadePlan?.flyoverLookAtPoints?.length,
      );
      const flyoverWanted = Boolean(store.isCourseFlyoverActive && hasFlyover);
      if (flyoverWanted && !wasFlyoverActiveRef.current) {
        flyoverElapsedRef.current = 0;
      }
      wasFlyoverActiveRef.current = flyoverWanted;

      // Lock follow yaw steady during active slingshot pullback so thumb tremor never shakes the camera
      if (!slowOrbit && store.shotPhase === 'pulling') {
        if (pullHoldYawRef.current === null) {
          pullHoldYawRef.current = smoothedYawRef.current;
        }
      } else {
        pullHoldYawRef.current = null;
      }

      // Compute smooth ground roll-settle yaw anticipation along the course centerline
      // so camera glides cleanly into upcoming corners without staring into far walls or whipping backwards.
      const cupPos = activePlan.cup.position;
      const distToPin = Math.hypot(cupPos[0] - bx, cupPos[2] - bz);
      const remainingCourseDist = computeRemainingCourseDistance(activePlan, [
        bx,
        by,
        bz,
      ]);
      const stepDist = Number.isNaN(prevBallPosRef.current.x)
        ? 0
        : ballVec.distanceTo(prevBallPosRef.current);
      prevBallPosRef.current.set(bx, by, bz);
      const instSpeed = dt > 1e-4 ? stepDist / dt : 0;

      const isCopperChute =
        inFlight &&
        activePlan.courseId === 'grand-escapade' &&
        store.currentSurfaceTag === 'storm_gutter' &&
        by >= 1.8 &&
        by <= 15.2 &&
        bx >= 47.0 &&
        bx <= 56.5 &&
        bz >= 5.0 &&
        bz <= 16.5;

      if (inFlight && !slowOrbit) {
        flightTimerRef.current += dt;
        estimatedBallSpeedRef.current =
          flightTimerRef.current <= dt * 1.5
            ? instSpeed
            : THREE.MathUtils.lerp(
                estimatedBallSpeedRef.current,
                instSpeed,
                1 - Math.exp(-12.0 * dt),
              );

        if (isCopperChute) {
          // Sweep from the open West/South-Southwest courtyard side (+0.48 rad) so the bronze
          // helical chute stays unobstructed instead of rotating behind East Zone 5/6 walls.
          const openCourtyardYaw = 0.48;
          if (chuteTravelYawRef.current === null) {
            let startYaw = smoothedYawRef.current;
            while (startYaw > Math.PI) startYaw -= Math.PI * 2;
            while (startYaw < -Math.PI) startYaw += Math.PI * 2;
            if (startYaw < -2.1) startYaw += Math.PI * 2;
            chuteTravelYawRef.current = startYaw;
          }
          const delta = openCourtyardYaw - chuteTravelYawRef.current;
          chuteTravelYawRef.current += delta * (1 - Math.exp(-3.4 * dt));
        } else {
          chuteTravelYawRef.current = null;
        }

        const groundY = getMasterPlanGroundElevationAt(bx, bz, activePlan);
        const vanY =
          activePlan.courseId === 'classic'
            ? getVanRampOrRoofElevationAt(bx, bz)
            : null;
        const supportY =
          vanY !== null && by - BALL_RADIUS >= vanY - 0.12
            ? Math.max(groundY, vanY)
            : groundY;
        const onGroundRoll = by <= supportY + BALL_RADIUS + 0.12;
        const movedFromSafe =
          Math.hypot(
            bx - store.lastSafeBallPosition[0],
            bz - store.lastSafeBallPosition[2],
          ) >= 0.65 || distToPin < AUTO_PUTTER_DISTANCE;
        const allowRollAlign =
          activePlan.courseId === 'grand-escapade'
            ? remainingCourseDist > 0.5
            : distToPin < 35 && distToPin > 0.5;

        if (
          flightTimerRef.current > 0.85 &&
          allowRollAlign &&
          onGroundRoll &&
          movedFromSafe &&
          estimatedBallSpeedRef.current < 1.5
        ) {
          const speedFrac =
            1 -
            THREE.MathUtils.clamp(
              (estimatedBallSpeedRef.current - 0.15) / (1.5 - 0.15),
              0,
              1,
            );
          const smoothFrac = speedFrac * speedFrac * (3 - 2 * speedFrac);
          rollBlendAlphaRef.current = THREE.MathUtils.lerp(
            rollBlendAlphaRef.current,
            smoothFrac,
            1 - Math.exp(-3.4 * dt),
          );
        } else if (!onGroundRoll || estimatedBallSpeedRef.current > 2.2) {
          rollBlendAlphaRef.current = THREE.MathUtils.lerp(
            rollBlendAlphaRef.current,
            0,
            1 - Math.exp(-4.0 * dt),
          );
        }
      } else {
        flightTimerRef.current = 0;
        estimatedBallSpeedRef.current = 0;
        rollBlendAlphaRef.current = 0;
        chuteTravelYawRef.current = null;
      }

      const forwardCourseYaw =
        remainingCourseDist > 0.5
          ? computeForwardCourseYaw(activePlan, [bx, by, bz], 18.0)
          : store.aimYaw;
      const inFlightTargetYaw = isCopperChute && chuteTravelYawRef.current !== null
        ? chuteTravelYawRef.current
        : inFlight && rollBlendAlphaRef.current > 0.001
          ? store.aimYaw +
            shortestAngleDelta(store.aimYaw, forwardCourseYaw) *
              rollBlendAlphaRef.current
          : store.aimYaw;

      // Compute cylindrical/polar follow pose with exponential smoothing
      const targetFollowYaw =
        !slowOrbit && store.shotPhase === 'pulling' && pullHoldYawRef.current !== null
          ? pullHoldYawRef.current
          : inFlightTargetYaw;
      const baseYaw = slowOrbit
        ? targetFollowYaw +
          (slowOrbitElapsedRef.current += dt) * QA_SLOW_ORBIT_OMEGA
        : targetFollowYaw;
      if (!slowOrbit) slowOrbitElapsedRef.current = 0;

      // Hold camera position & yaw calm during the brief < 0.6s hazard drop arc,
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
          yawVelRef.current = 0;
          smoothedWallDistRef.current = null;
          smoothedFlightRiseRef.current = 0;
          smoothedBehindDistRef.current = 4.7 * zoomScaleRef.current;
          smoothedEyeHeightRef.current = 2.08 + pitchOffsetRef.current * 1.1;
          smoothedForwardDistRef.current = 4.8;
          smoothedLookHeightRef.current = 0.72;
          instantSnap = true;
        }

        const poseAlpha = 1 - Math.exp(-9.5 * dt);
        const riseAlpha = 1 - Math.exp(-5.0 * dt);
        const shouldSnapPose = !initializedRef.current || (!inFlight && stepDist > 6.0);

        if (slowOrbit || shouldSnapPose) {
          smoothedYawRef.current = baseYaw;
          yawVelRef.current = 0;
          if (shouldSnapPose && !slowOrbit) {
            smoothedWallDistRef.current = null;
            instantSnap = true;
          }
        } else {
          // Critically damped yaw spring eliminates initial angular-velocity whip on 90°-120° post-shot turns
          // while staying snappy during manual touch/mouse orbiting.
          const errYaw = shortestAngleDelta(baseYaw, smoothedYawRef.current);
          if (
            Math.abs(errYaw) < 1e-5 &&
            Math.abs(yawVelRef.current) < 1e-4
          ) {
            smoothedYawRef.current = baseYaw;
            yawVelRef.current = 0;
          } else {
            const isManualOrbitActive =
              elapsedSecRef.current - lastManualOrbitSecRef.current < 0.28;
            const omega = isManualOrbitActive ? 22.0 : 5.4;
            const temp = (yawVelRef.current + omega * errYaw) * dt;
            const decay = Math.exp(-omega * dt);
            yawVelRef.current = (yawVelRef.current - omega * temp) * decay;
            smoothedYawRef.current = baseYaw + (errYaw + temp) * decay;
          }
        }

        const isInSubway =
          activePlan.courseId === 'grand-escapade' &&
          (isSubterraneanSubwayPosition([bx, by, bz]) ||
            (bz >= 59.0 && bx >= 18.0 && bx <= 50.0 && by < -0.35));

        const launchY = shotLaunchYRef.current ?? by;
        const apexLift = Math.max(0, by - launchY);
        const dropLift =
          inFlight && !isInSubway && by < launchY - 1.5
            ? THREE.MathUtils.clamp((launchY - by) * 0.14, 0, 1.3)
            : 0;
        const targetFlightRise = inFlight && !isInSubway
          ? (isCopperChute ? 1.85 : 1.2) +
            THREE.MathUtils.clamp(apexLift * 0.24, 0, 1.2) +
            dropLift
          : 0;
        smoothedFlightRiseRef.current =
          shouldSnapPose || Math.abs(targetFlightRise - smoothedFlightRiseRef.current) < 1e-4
            ? targetFlightRise
            : THREE.MathUtils.lerp(
                smoothedFlightRiseRef.current,
                targetFlightRise,
                riseAlpha,
              );

        const dirX = Math.sin(smoothedYawRef.current);
        const dirZ = -Math.cos(smoothedYawRef.current);

        // Uphill terrace framing for Zone 2 incline (+9.5m climb) and ramped plazas
        const curGroundY = getMasterPlanGroundElevationAt(bx, bz, activePlan);
        const aheadGroundY = getMasterPlanGroundElevationAt(
          bx + dirX * 4.0,
          bz + dirZ * 4.0,
          activePlan,
        );
        const rawSlopeDelta =
          !inFlight && !isInSubway && Math.abs(by - BALL_RADIUS - curGroundY) < 0.75
            ? THREE.MathUtils.clamp(aheadGroundY - curGroundY, -1.4, 2.2)
            : 0;
        smoothedSlopePitchRef.current =
          shouldSnapPose ||
          Math.abs(rawSlopeDelta - smoothedSlopePitchRef.current) < 1e-4
            ? rawSlopeDelta
            : THREE.MathUtils.lerp(
                smoothedSlopePitchRef.current,
                rawSlopeDelta,
                1 - Math.exp(-6.0 * dt),
              );

        const subwayScale = isInSubway ? 0.85 : 1.0;
        const targetBehindDist =
          (inFlight ? (isCopperChute ? 6.0 : 5.6) : 4.7) *
          zoomScaleRef.current *
          subwayScale;
        const baseEyeHeight = isInSubway
          ? 1.62 + pitchOffsetRef.current * 0.65
          : (inFlight ? 2.3 : 2.08) +
            pitchOffsetRef.current * 1.1 +
            THREE.MathUtils.clamp(smoothedSlopePitchRef.current * 0.14, -0.15, 0.35);
        const targetEyeHeight = baseEyeHeight + smoothedFlightRiseRef.current;
        const targetForwardDist = isInSubway ? 4.2 : inFlight ? 2.6 : 4.8;
        const targetLookHeight = isInSubway
          ? 0.42
          : inFlight
            ? 0.35 + apexLift * 0.15
            : 0.72 + THREE.MathUtils.clamp(smoothedSlopePitchRef.current * 0.34, -0.35, 0.85);

        smoothedBehindDistRef.current =
          shouldSnapPose ||
          Math.abs(targetBehindDist - smoothedBehindDistRef.current) < 1e-4
            ? targetBehindDist
            : THREE.MathUtils.lerp(
                smoothedBehindDistRef.current,
                targetBehindDist,
                poseAlpha,
              );
        smoothedEyeHeightRef.current =
          shouldSnapPose ||
          Math.abs(targetEyeHeight - smoothedEyeHeightRef.current) < 1e-4
            ? targetEyeHeight
            : THREE.MathUtils.lerp(
                smoothedEyeHeightRef.current,
                targetEyeHeight,
                poseAlpha,
              );
        smoothedForwardDistRef.current =
          shouldSnapPose ||
          Math.abs(targetForwardDist - smoothedForwardDistRef.current) < 1e-4
            ? targetForwardDist
            : THREE.MathUtils.lerp(
                smoothedForwardDistRef.current,
                targetForwardDist,
                poseAlpha,
              );
        smoothedLookHeightRef.current =
          shouldSnapPose ||
          Math.abs(targetLookHeight - smoothedLookHeightRef.current) < 1e-4
            ? targetLookHeight
            : THREE.MathUtils.lerp(
                smoothedLookHeightRef.current,
                targetLookHeight,
                poseAlpha,
              );

        let camX = bx - dirX * smoothedBehindDistRef.current;
        let camY = by + smoothedEyeHeightRef.current;
        let camZ = bz - dirZ * smoothedBehindDistRef.current;

        const subwayVaultCeilLimit =
          (escapadePlan?.subwayStationVault?.vaultCrownY ??
            SUBWAY_STATION_VAULT_SPEC.vaultCrownY) - 0.55;
        if (isInSubway) {
          camY = Math.min(camY, subwayVaultCeilLimit);
        }

        // Soft wall-avoidance clamping along ball->camera ray so lens never clips inside outer perimeter walls
        const rayStart: Vec3Tuple = [bx, by + 0.55, bz];
        const vecX = camX - rayStart[0];
        const vecY = camY - rayStart[1];
        const vecZ = camZ - rayStart[2];
        const vecLen = Math.hypot(vecX, vecY, vecZ);
        if (vecLen > 1.2) {
          const rayDir: Vec3Tuple = [vecX / vecLen, vecY / vecLen, vecZ / vecLen];
          let targetDist = vecLen;
          for (const wallBox of solidWallAabbs) {
            const hit = intersectRayAABB3D(rayStart, rayDir, wallBox, vecLen);
            if (hit.hit && hit.tMin > 0.25 && hit.tMin < targetDist) {
              targetDist = Math.max(1.2, hit.tMin);
            }
          }
          if (smoothedWallDistRef.current === null || slowOrbit) {
            smoothedWallDistRef.current = targetDist;
          } else if (Math.abs(targetDist - smoothedWallDistRef.current) < CAMERA_SNAP_EPS) {
            smoothedWallDistRef.current = targetDist;
          } else {
            // Pull inward briskly to avoid grazing geometry; extend back out smoothly
            const clampRate = targetDist < smoothedWallDistRef.current ? 18.0 : 8.5;
            smoothedWallDistRef.current = THREE.MathUtils.lerp(
              smoothedWallDistRef.current,
              targetDist,
              1 - Math.exp(-clampRate * dt),
            );
          }
          const appliedDist = Math.min(vecLen, smoothedWallDistRef.current);
          if (appliedDist < vecLen - CAMERA_SNAP_EPS) {
            camX = rayStart[0] + rayDir[0] * appliedDist;
            camY = rayStart[1] + rayDir[1] * appliedDist;
            camZ = rayStart[2] + rayDir[2] * appliedDist;
          }
        } else {
          smoothedWallDistRef.current = vecLen;
        }

        if (isInSubway) {
          camY = Math.min(camY, subwayVaultCeilLimit);
        }

        followPosRef.current.set(camX, camY, camZ);
        followLookAtRef.current.set(
          bx + dirX * smoothedForwardDistRef.current,
          by + smoothedLookHeightRef.current,
          bz + dirZ * smoothedForwardDistRef.current,
        );

        // Blend Street Scout OR 1-Tap 7-Zone Course Flyover Scout over follow pose
        const targetFlyoverBlend = flyoverWanted ? 1 : 0;
        if (flyoverWanted && store.flyoverProgress !== null) {
          flyoverBlendRef.current = 1;
        } else {
          const flyAlpha = 1 - Math.exp(-7.5 * dt);
          flyoverBlendRef.current =
            Math.abs(targetFlyoverBlend - flyoverBlendRef.current) < 1e-4
              ? targetFlyoverBlend
              : THREE.MathUtils.lerp(flyoverBlendRef.current, targetFlyoverBlend, flyAlpha);
        }

        if (flyoverWanted && escapadePlan) {
          const flyPts = escapadePlan.flyoverSplinePoints ?? GRAND_ESCAPADE_MASTER_PLAN.flyoverSplinePoints;
          const flyLookPts = escapadePlan.flyoverLookAtPoints ?? GRAND_ESCAPADE_MASTER_PLAN.flyoverLookAtPoints;
          let flyU = 0;
          let exitFadeOut = 1;

          if (store.flyoverProgress !== null) {
            flyU = THREE.MathUtils.clamp(store.flyoverProgress, 0, 1);
            flyoverElapsedRef.current = flyU * FLYOVER_FORWARD_SEC;
          } else {
            flyoverElapsedRef.current += dt;
            const tFwdEnd = FLYOVER_FORWARD_SEC;
            const tHoldEnd = tFwdEnd + FLYOVER_HOLD_SEC;
            const tBackEnd = tHoldEnd + FLYOVER_RETURN_SEC;
            const e = flyoverElapsedRef.current;
            const startedNearTee =
              Math.hypot(
                bx - activePlan.teePosition[0],
                bz - activePlan.teePosition[2],
              ) < 18.0;

            if (e <= tFwdEnd) {
              const p = e / tFwdEnd;
              flyU = p * p * (3 - 2 * p);
            } else if (e <= tHoldEnd) {
              flyU = 1.0;
            } else if (startedNearTee && e <= tBackEnd) {
              const p = (e - tHoldEnd) / FLYOVER_RETURN_SEC;
              flyU = 1.0 - p * p * (3 - 2 * p);
              if (p > 0.72) {
                const tail = (p - 0.72) / 0.28;
                exitFadeOut = 1 - tail * tail * (3 - 2 * tail);
              }
            } else if (!startedNearTee && e <= tHoldEnd + 1.6) {
              flyU = 1.0;
              const tail = (e - tHoldEnd) / 1.6;
              exitFadeOut = 1 - tail * tail * (3 - 2 * tail);
            } else {
              flyU = startedNearTee ? 0 : 1;
              exitFadeOut = 0;
              store.setCourseFlyover(false, null);
            }
          }

          const splinePos = evaluateCatmullRomSpline3D(flyPts, flyU);
          const splineLook = evaluateCatmullRomSpline3D(flyLookPts, flyU);
          const inSubwayFlyover =
            isSubterraneanSubwayPosition(splinePos) ||
            (splinePos[2] >= 62.0 &&
              splinePos[0] >= 20.0 &&
              splinePos[0] <= 48.0 &&
              splinePos[1] < -0.35);
          const safeSplineY = inSubwayFlyover
            ? Math.min(splinePos[1], subwayVaultCeilLimit)
            : splinePos[1];
          flyoverPosScratchRef.current.set(
            splinePos[0],
            safeSplineY,
            splinePos[2],
          );
          flyoverLookAtScratchRef.current.set(...splineLook);

          const uFly = THREE.MathUtils.clamp(
            flyoverBlendRef.current * exitFadeOut,
            0,
            1,
          );
          const easeFly = uFly * uFly * (3 - 2 * uFly);
          desiredPosRef.current
            .copy(followPosRef.current)
            .lerp(flyoverPosScratchRef.current, easeFly);
          desiredLookAtRef.current
            .copy(followLookAtRef.current)
            .lerp(flyoverLookAtScratchRef.current, easeFly);
          desiredFov = THREE.MathUtils.lerp(inFlight ? 54 : 52, 54, easeFly);
          if (store.flyoverProgress !== null) {
            instantSnap = true;
          }
        } else if (scoutBlendRef.current <= 0) {
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
              rayDirRef.current.set(...activePlan.streetScoutCamera.position),
              ease,
            );
          desiredLookAtRef.current
            .copy(followLookAtRef.current)
            .lerp(
              scoutLookAtScratchRef.current.set(
                ...activePlan.streetScoutCamera.lookAt,
              ),
              ease,
            );
          desiredFov = THREE.MathUtils.lerp(
            inFlight ? 54 : 52,
            activePlan.streetScoutCamera.fovDeg,
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
      // Single-stage follow tracks interpolated ball coordinates immediately without double Cartesian lag,
      // while Street Scout transitions ease smoothly.
      const followRate =
        store.isStreetScoutActive ||
        scoutBlendRef.current > 0.001 ||
        store.isCourseFlyoverActive ||
        flyoverBlendRef.current > 0.001
          ? 9.0
          : 48.0;
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
          perspCam.fov = THREE.MathUtils.lerp(perspCam.fov, desiredFov, Math.min(1, 1 - Math.exp(-10.5 * dt)));
          perspCam.updateProjectionMatrix();
        }
      }
    }

    // 2. Discover occludable buildings, delivery van & tall/hedge props ONCE after mount,
    // completely decoupled from scene.children.length so shot guide visibility changes never hitch.
    if (!hasIndexedOccludablesRef.current) {
      scene.updateMatrixWorld(true);
      const known = knownObjectsRef.current;
      const newlyAdded: OccludableEntry[] = [];

      scene.traverse((obj) => {
        if (known.has(obj)) return;
        const isCopperChuteProp =
          obj.name === 'copper-spiral-chute' ||
          obj.userData?.propId === 'esc-z5-copper-spiral-chute';
        const isBuilding = obj.userData?.occludableBuilding === true;
        const isVehicle = obj.userData?.occludableVehicle === true;
        const isProp = obj.userData?.occludableProp === true;
        if ((isBuilding || isVehicle || isProp) && !isCopperChuteProp) {
          known.add(obj);
          const fountainFlag = isFountainObject(obj);
          const isSubwayObj = isSubwayVehicleOrPillar(obj);
          const perBoxNearLensOnly =
            obj.name === 'vintage-subway-car' ||
            obj.userData?.propId === 'esc-z7-vintage-subway-car';
          const tightBallRayOnly =
            isProp && obj.userData?.tightBallRayOnly === true;
          const aabb = resolveObjectAabb(obj, activePlan.props);
          if (aabb) {
            const heightY = aabb.max[1] - aabb.min[1];
            const isLowProp =
              isProp &&
              (fountainFlag ||
                tightBallRayOnly ||
                heightY < LOW_PROP_HEIGHT_THRESHOLD);
            const testBoxes = resolveOccludableBoxes(
              obj,
              aabb,
              isProp,
              isLowProp,
              tightBallRayOnly,
              activePlan.props,
            );
            const enterMarginXZ = tightBallRayOnly
              ? 0
              : fountainFlag
                ? OCCLUDE_FOUNTAIN_ENTER_MARGIN_XZ
                : isProp || perBoxNearLensOnly
                  ? OCCLUDE_PROP_ENTER_MARGIN_XZ
                  : OCCLUDE_ENTER_MARGIN_XZ;
            const exitMarginXZ = tightBallRayOnly
              ? 0.03
              : fountainFlag
                ? OCCLUDE_FOUNTAIN_EXIT_MARGIN_XZ
                : isProp || perBoxNearLensOnly
                  ? OCCLUDE_PROP_EXIT_MARGIN_XZ
                  : OCCLUDE_EXIT_MARGIN_XZ;
            const entry: OccludableEntry = {
              object: obj,
              aabb,
              testBoxes,
              isProp: isProp || perBoxNearLensOnly,
              isLowProp,
              tightBallRayOnly,
              perBoxNearLensOnly,
              fullFadeDist: isSubwayObj
                ? OCCLUDE_SUBWAY_FULL_FADE_DIST
                : OCCLUDE_PROP_FULL_FADE_DIST,
              enterMarginXZ,
              exitMarginXZ,
              nearLensEnterMargin:
                isProp || perBoxNearLensOnly
                  ? OCCLUDE_PROP_NEAR_LENS_ENTER
                  : OCCLUDE_NEAR_LENS_ENTER_MARGIN,
              nearLensExitMargin:
                isProp || perBoxNearLensOnly
                  ? OCCLUDE_PROP_NEAR_LENS_EXIT
                  : OCCLUDE_NEAR_LENS_EXIT_MARGIN,
              snapshots: cloneMaterialsForOcclusion(obj),
              currentOpacity: 1.0,
              lastTargetOpacity: FADE_MIN_OPACITY,
              isFaded: false,
              clearHoldSec: 0,
              showingFadeMaterial: false,
            };
            occludablesRef.current.push(entry);
            newlyAdded.push(entry);
          }
        }
      });

      if (occludablesRef.current.length > 0) {
        hasIndexedOccludablesRef.current = true;
      }

      // Pre-warm cutaway shaders once on startup discovery so mid-orbit fades compile in 0ms
      if (newlyAdded.length > 0 && !hasWarmedShadersRef.current) {
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

    // 3. Per-frame smooth foreground occlusion cutaway with spatial + temporal hysteresis
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
    const wallCamToBallDist = rayDirRef.current.length();
    let wallDirTuple: Vec3Tuple | null = null;
    let wallRayMaxDist = 0;
    if (wallCamToBallDist > 0.05) {
      rayDirRef.current.divideScalar(wallCamToBallDist);
      wallDirTuple = [
        rayDirRef.current.x,
        rayDirRef.current.y,
        rayDirRef.current.z,
      ];
      // Stop ray slightly before the ball so background buildings behind the ball NEVER fade
      wallRayMaxDist = Math.max(0.2, wallCamToBallDist - 0.55);
    }

    // Aim prop occlusion rays directly at ball crown (by + BALL_RADIUS) so perimeter
    // hedges and low courtyard rims cleanly seen over never graze false stipple fades.
    rayDirRef.current.set(
      bx - camOrigin[0],
      by + BALL_RADIUS - camOrigin[1],
      bz - camOrigin[2],
    );
    const propCamToBallDist = rayDirRef.current.length();
    let propDirTuple: Vec3Tuple | null = null;
    let propRayMaxDist = 0;
    if (propCamToBallDist > 0.05) {
      rayDirRef.current.divideScalar(propCamToBallDist);
      propDirTuple = [
        rayDirRef.current.x,
        rayDirRef.current.y,
        rayDirRef.current.z,
      ];
      propRayMaxDist = Math.max(0.2, propCamToBallDist - 0.55);
    }

    const disableFade =
      Boolean(store.cameraAuditStationId) ||
      Boolean(store.isStreetScoutActive) ||
      Boolean(store.isCourseFlyoverActive) ||
      scoutBlendRef.current > 0.05 ||
      flyoverBlendRef.current > 0.05;

    if (wallDirTuple || propDirTuple) {
      for (const entry of occludablesRef.current) {
        const dirTuple = entry.isProp ? propDirTuple : wallDirTuple;
        const rayMaxDist = entry.isProp ? propRayMaxDist : wallRayMaxDist;
        let hitNow = false;
        let hitDist = rayMaxDist;
        if (!disableFade && dirTuple) {
          const marginXZ = entry.isFaded
            ? entry.exitMarginXZ
            : entry.enterMarginXZ;
          const nearLensMargin = entry.isFaded
            ? Math.max(marginXZ, entry.nearLensExitMargin)
            : Math.max(marginXZ, entry.nearLensEnterMargin);
          // Skip omnidirectional near-lens trigger on low props & tight-ray tee props so
          // flanking props stay 100% solid unless the camera->ball ray directly pierces them.
          // Hollow vehicles like the open-aisle IRT subway car check individual wall/roof testBoxes.
          const nearOrInsideLens =
            !entry.isLowProp &&
            !entry.tightBallRayOnly &&
            (entry.perBoxNearLensOnly
              ? entry.testBoxes.some(
                  (b) =>
                    camOrigin[0] >= b.min[0] - nearLensMargin &&
                    camOrigin[0] <= b.max[0] + nearLensMargin &&
                    camOrigin[1] >= b.min[1] - 0.15 &&
                    camOrigin[1] <= b.max[1] + 0.25 &&
                    camOrigin[2] >= b.min[2] - nearLensMargin &&
                    camOrigin[2] <= b.max[2] + nearLensMargin,
                )
              : camOrigin[0] >= entry.aabb.min[0] - nearLensMargin &&
                camOrigin[0] <= entry.aabb.max[0] + nearLensMargin &&
                camOrigin[1] >= entry.aabb.min[1] - 0.2 &&
                camOrigin[1] <= entry.aabb.max[1] + (entry.isProp ? 0.28 : 0.75) &&
                camOrigin[2] >= entry.aabb.min[2] - nearLensMargin &&
                camOrigin[2] <= entry.aabb.max[2] + nearLensMargin);
          if (nearOrInsideLens) {
            hitNow = true;
            hitDist = 0;
          } else {
            for (const box of entry.testBoxes) {
              const expandedAabb = {
                min: [
                  box.min[0] - marginXZ,
                  box.min[1] - box.padBottom,
                  box.min[2] - marginXZ,
                ] as Vec3Tuple,
                max: [
                  box.max[0] + marginXZ,
                  box.max[1] + box.padTop,
                  box.max[2] + marginXZ,
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
                hitDist = Math.min(hitDist, Math.max(0, hit.tMin));
              }
            }
          }
        }

        if (hitNow) {
          entry.isFaded = true;
          entry.clearHoldSec = 0;
          // Ramp occluding props & subterranean pillars/subway bulkheads all the way to 0.00
          // inside fullFadeDist (zero IGN stipple dandruff), while tall street buildings retain 0.06 silhouette context.
          const lensFactor = entry.isProp
            ? THREE.MathUtils.clamp(
                (hitDist - entry.fullFadeDist) / 0.8,
                0,
                1,
              )
            : THREE.MathUtils.clamp((hitDist - 0.85) / 1.05, 0, 1);
          entry.lastTargetOpacity = FADE_MIN_OPACITY * lensFactor;
        } else if (entry.isFaded) {
          entry.clearHoldSec += dt;
          if (entry.clearHoldSec >= OCCLUDE_HOLD_SECONDS) {
            entry.isFaded = false;
            entry.clearHoldSec = 0;
          }
        }

        const targetOpacity = entry.isFaded ? entry.lastTargetOpacity : 1.0;
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
