'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TOYBOX_MATERIALS } from '@/materials';
import { useCurbsideStore } from '@/store/useCurbsideStore';
import type {
  CourseId,
  CourseMasterPlan,
  SubwayVaultEnclosureSpec,
  Vec3Tuple,
} from '@/types';
import {
  ESCAPADE_FLYOVER_SHADOW_HALF_SPAN,
  ESCAPADE_FLYOVER_SHADOW_TEXEL_METERS,
  ESCAPADE_FLYOVER_STATIC_ANCHOR,
  ESCAPADE_SHADOW_FAR,
  ESCAPADE_SHADOW_HALF_SPAN,
  ESCAPADE_SHADOW_HYSTERESIS_METERS,
  ESCAPADE_SHADOW_MAP_SIZE,
  ESCAPADE_SHADOW_NEAR,
  ESCAPADE_SUN_OFFSET,
  SubterraneanLightingRig,
  computeSubterraneanBlend,
  computeSunLightBasis,
  snapWorldAnchorToShadowTexelGrid,
  type SubterraneanLightingHandle,
} from './lighting';
import { resolveAnimTime } from './qaFreeze';

interface CloudSpec {
  x: number;
  y: number;
  z: number;
  scale: number;
  speed: number;
  bobOffset: number;
}

/**
 * Cloud bank range scale so drifting clouds ride inside the camera far plane
 * while preserving their Walkabout-style silhouette proportions.
 */
const CLOUD_RANGE_SCALE = 0.62;

const CLOUD_SPECS: CloudSpec[] = [
  { x: -135, y: 32, z: -128, scale: 1.75, speed: 0.44, bobOffset: 0.0 },
  { x: -95, y: 38, z: -115, scale: 1.5, speed: 0.34, bobOffset: 1.3 },
  { x: 118, y: 30, z: -112, scale: 1.65, speed: 0.5, bobOffset: 2.4 },
  { x: 148, y: 35, z: -82, scale: 1.8, speed: 0.4, bobOffset: 3.1 },
  { x: 156, y: 28, z: 32, scale: 1.55, speed: 0.46, bobOffset: 4.2 },
  { x: -148, y: 30, z: 48, scale: 1.65, speed: 0.38, bobOffset: 5.0 },
].map((c) => ({
  ...c,
  x: c.x * CLOUD_RANGE_SCALE,
  y: c.y * CLOUD_RANGE_SCALE,
  z: c.z * CLOUD_RANGE_SCALE,
  scale: c.scale * CLOUD_RANGE_SCALE,
}));

/** Sky dome radius (< camera far) — rides on cameraPosition in vertex shader so it can never be clipped. */
const SKY_DOME_RADIUS = 150;

/** Shared horizon/fog hex so sky dome horizon, WebGL clear color, and distance fog match to 0 LSBs. */
const HORIZON_MIST_HEX = '#F5DEC2';
const SUBWAY_BG_HEX = '#3A2B1F';
const SUBWAY_FOG_HEX = '#4A3626';

/**
 * Static, tightly fitted sun-shadow volume for Classic Hole 1 (5th & Mercer corridor + courtyard +
 * perimeter rooftops `x: -15.5..41.5, z: -38.5..45.0, y: 0..18.2`), ~2.5cm shadow texels.
 */
const SHADOW_FIT_BOX = {
  minX: -16.5,
  maxX: 42.5,
  minZ: -39.5,
  maxZ: 46.0,
  minY: -0.5,
  maxY: 18.5,
};

const COLOR_SURF_BG = new THREE.Color(HORIZON_MIST_HEX);
const COLOR_SUB_BG = new THREE.Color(SUBWAY_BG_HEX);
const COLOR_SURF_FOG = new THREE.Color(HORIZON_MIST_HEX);
const COLOR_SUB_FOG = new THREE.Color(SUBWAY_FOG_HEX);

const COLOR_SURF_SUN = new THREE.Color('#FFE5BA');
const COLOR_SUB_SUN = new THREE.Color('#FFD18B');

const COLOR_SURF_HEMI_SKY = new THREE.Color('#C8E4FF');
const COLOR_SUB_HEMI_SKY = new THREE.Color('#FFE0B2');
const COLOR_SURF_HEMI_GND = new THREE.Color('#EFAF7B');
const COLOR_SUB_HEMI_GND = new THREE.Color('#9E6B43');

const COLOR_SURF_AMB = new THREE.Color('#FFF6E6');
const COLOR_SUB_AMB = new THREE.Color('#FFE6C2');

const COLOR_SURF_RIM = new THREE.Color('#C9DFFF');
const COLOR_SUB_RIM = new THREE.Color('#FFD79A');

const COLOR_SKY_TOP = new THREE.Color('#53A6E5');
const COLOR_SKY_MID = new THREE.Color('#9FD5F5');
const COLOR_SKY_WARM_MIST = new THREE.Color('#F2CCA0');
const COLOR_SKY_BOTTOM = new THREE.Color('#E5BA8C');

export interface LightingAndSkyProps {
  /** Show golden-hour sky dome, atmospheric perspective, and drifting clouds. False for isolated QA studio. */
  showHorizon?: boolean;
  /**
   * Sun shadow frustum half-extent override (isolated QA turntable uses 12). When omitted on the
   * full course, `'classic'` uses its static 4096² fit and `'grand-escapade'` uses its 2048²
   * texel-snapped following shadow frustum (`±48m`, `0.046875m` exact texel step).
   */
  shadowSpan?: number;
  /** World-space focus point for the directional sun shadow frustum (used in isolated QA / classic). */
  shadowTarget?: [number, number, number];
  /** Explicit course selector override; auto-resolves from `plan` or `useCurbsideStore` when omitted. */
  courseId?: CourseId;
  /** Optional master plan reference for automatic `'classic'` vs `'grand-escapade'` detection. */
  plan?: CourseMasterPlan;
  /** Optional live ball position tuple override. */
  ballPosition?: Vec3Tuple;
  /** Optional live ball Vector3 ref for zero-allocation tracking. */
  ballPositionRef?: React.RefObject<THREE.Vector3 | null>;
  /** Optional subterranean subway station vault spec override for light shafts & sconces. */
  subwayVault?: SubwayVaultEnclosureSpec;
  /** Render Zone 7 volumetric sidewalk-grate light shafts & sconce halos (default true). */
  includeLightShafts?: boolean;
}

export const LightingAndSky = React.memo(function LightingAndSky({
  showHorizon = true,
  shadowSpan,
  shadowTarget,
  courseId,
  plan,
  ballPosition,
  ballPositionRef,
  subwayVault,
  includeLightShafts = true,
}: LightingAndSkyProps) {
  const storeCourseId = useCurbsideStore((s) => s.courseId);
  const effectiveCourseId: CourseId =
    courseId ??
    plan?.courseId ??
    (plan?.holeId === 'hole-1-5th-and-mercer' ? 'classic' : storeCourseId);

  const isFullCourse = showHorizon && shadowSpan === undefined;
  const isClassicCourse = isFullCourse && effectiveCourseId === 'classic';
  const isEscapadeCourse =
    isFullCourse && effectiveCourseId === 'grand-escapade';

  const bgColorRef = useRef<THREE.Color>(null);
  const fogRef = useRef<THREE.Fog>(null);
  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);
  const rimLightRef = useRef<THREE.DirectionalLight>(null);
  const skyDomeMeshRef = useRef<THREE.Mesh>(null);
  const cloudsGroupRef = useRef<THREE.Group>(null);
  const subterraneanRigRef = useRef<SubterraneanLightingHandle>(null);

  const elapsedRef = useRef(0);
  const shadowBakeRemainingRef = useRef(5);
  const hasSnappedOnceRef = useRef(false);
  const wasFlyoverModeRef = useRef(false);
  const lastCommittedRawAnchorRef = useRef<Vec3Tuple>([0, 0, 31]);
  const lastTexelKeyRef = useRef('');
  const lastAppliedSubBlendRef = useRef(-1);

  const gl = useThree((s) => s.gl);

  const resolvedSpan = shadowSpan ?? 12;
  const resolvedTarget: [number, number, number] =
    shadowTarget ?? (showHorizon ? [9, 0, 2] : [0, 0, 0]);

  const classicOrStudioSunOffset: [number, number, number] = showHorizon
    ? [-16, 46, 14]
    : [-10, 22, 12];

  const escapadeSunBasis = useMemo(
    () => computeSunLightBasis(ESCAPADE_SUN_OFFSET),
    [],
  );

  const initialEscapadeSnap = useMemo(() => {
    const startBall = useCurbsideStore.getState().ballPosition ?? [0, 0, 31];
    return snapWorldAnchorToShadowTexelGrid(startBall, escapadeSunBasis);
  }, [escapadeSunBasis]);

  const initialSunPos: [number, number, number] = isEscapadeCourse
    ? initialEscapadeSnap.sunPosition
    : [
        resolvedTarget[0] + classicOrStudioSunOffset[0],
        resolvedTarget[1] + classicOrStudioSunOffset[1],
        resolvedTarget[2] + classicOrStudioSunOffset[2],
      ];

  const initialTargetPos: [number, number, number] = isEscapadeCourse
    ? initialEscapadeSnap.target
    : resolvedTarget;

  const shadowMapSize: [number, number] = isClassicCourse
    ? [4096, 4096]
    : [ESCAPADE_SHADOW_MAP_SIZE, ESCAPADE_SHADOW_MAP_SIZE];

  /** Static light-space extents for Classic Hole 1 (`SHADOW_FIT_BOX`). */
  const fittedClassic = useMemo(() => {
    const eye = new THREE.Vector3(
      resolvedTarget[0] + classicOrStudioSunOffset[0],
      resolvedTarget[1] + classicOrStudioSunOffset[1],
      resolvedTarget[2] + classicOrStudioSunOffset[2],
    );
    const tgt = new THREE.Vector3(
      resolvedTarget[0],
      resolvedTarget[1],
      resolvedTarget[2],
    );
    const zAxis = eye.clone().sub(tgt).normalize();
    const xAxis = new THREE.Vector3(0, 1, 0).cross(zAxis).normalize();
    const yAxis = zAxis.clone().cross(xAxis).normalize();
    const b = SHADOW_FIT_BOX;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minDepth = Infinity;
    let maxDepth = -Infinity;
    const p = new THREE.Vector3();
    for (const x of [b.minX, b.maxX]) {
      for (const y of [b.minY, b.maxY]) {
        for (const z of [b.minZ, b.maxZ]) {
          p.set(x, y, z).sub(eye);
          const lx = p.dot(xAxis);
          const ly = p.dot(yAxis);
          const depth = -p.dot(zAxis);
          minX = Math.min(minX, lx);
          maxX = Math.max(maxX, lx);
          minY = Math.min(minY, ly);
          maxY = Math.max(maxY, ly);
          minDepth = Math.min(minDepth, depth);
          maxDepth = Math.max(maxDepth, depth);
        }
      }
    }
    return {
      left: Math.floor(minX),
      right: Math.ceil(maxX),
      bottom: Math.floor(minY),
      top: Math.ceil(maxY),
      near: Math.max(2, Math.floor(minDepth - 3)),
      far: Math.ceil(maxDepth + 5),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    classicOrStudioSunOffset[0],
    classicOrStudioSunOffset[1],
    classicOrStudioSunOffset[2],
    resolvedTarget[0],
    resolvedTarget[1],
    resolvedTarget[2],
  ]);

  const shadowLeft = isEscapadeCourse
    ? -ESCAPADE_SHADOW_HALF_SPAN
    : isClassicCourse
      ? fittedClassic.left
      : -resolvedSpan;
  const shadowRight = isEscapadeCourse
    ? ESCAPADE_SHADOW_HALF_SPAN
    : isClassicCourse
      ? fittedClassic.right
      : resolvedSpan;
  const shadowTop = isEscapadeCourse
    ? ESCAPADE_SHADOW_HALF_SPAN
    : isClassicCourse
      ? fittedClassic.top
      : resolvedSpan;
  const shadowBottom = isEscapadeCourse
    ? -ESCAPADE_SHADOW_HALF_SPAN
    : isClassicCourse
      ? fittedClassic.bottom
      : -resolvedSpan;
  const shadowNear = isEscapadeCourse
    ? ESCAPADE_SHADOW_NEAR
    : isClassicCourse
      ? fittedClassic.near
      : 2;
  const shadowFar = isEscapadeCourse
    ? ESCAPADE_SHADOW_FAR
    : isClassicCourse
      ? fittedClassic.far
      : 90;

  const lightTargetObj = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    lightTargetObj.position.set(
      initialTargetPos[0],
      initialTargetPos[1],
      initialTargetPos[2],
    );
    lightTargetObj.updateMatrixWorld();
    if (isEscapadeCourse) {
      hasSnappedOnceRef.current = false;
      lastTexelKeyRef.current = '';
      lastAppliedSubBlendRef.current = -1;
    }
  }, [
    isEscapadeCourse,
    lightTargetObj,
    initialTargetPos[0],
    initialTargetPos[1],
    initialTargetPos[2],
  ]);

  // Bake sun shadow map for 5 initial frames after mount/course-switch, then lock `autoUpdate = false`
  // so steady-state frames pay 0.0ms shadow pass cost until a hysteresis step requests a 1-frame bake.
  useEffect(() => {
    if (!isFullCourse) {
      gl.shadowMap.autoUpdate = true;
      gl.shadowMap.needsUpdate = true;
      return;
    }
    shadowBakeRemainingRef.current = 5;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
      gl.shadowMap.needsUpdate = true;
    };
  }, [
    gl,
    isFullCourse,
    effectiveCourseId,
    shadowLeft,
    shadowRight,
    shadowTop,
    shadowBottom,
  ]);

  const skyDomeMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: {
        uTopColor: { value: COLOR_SKY_TOP.clone() },
        uMidColor: { value: COLOR_SKY_MID.clone() },
        uHorizonColor: { value: COLOR_SURF_BG.clone() },
        uWarmMistColor: { value: COLOR_SKY_WARM_MIST.clone() },
        uBottomColor: { value: COLOR_SKY_BOTTOM.clone() },
        uSunDir: { value: new THREE.Vector3(-0.48, 0.42, 0.42).normalize() },
        uSunGlowColor: { value: new THREE.Color('#FFE9B8') },
        uSunGlowScale: { value: 1.0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldDir;
        void main() {
          // Dome rides on cameraPosition inside the shader (zero frame lag, never clipped by far plane).
          vWorldDir = normalize(position);
          vec4 worldPos = vec4(position + cameraPosition, 1.0);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uWarmMistColor;
        uniform vec3 uBottomColor;
        uniform vec3 uSunDir;
        uniform vec3 uSunGlowColor;
        uniform float uSunGlowScale;
        varying vec3 vWorldDir;

        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = dir.y;
          vec3 col;
          if (h >= 0.16) {
            col = mix(uMidColor, uTopColor, smoothstep(0.16, 0.72, h));
          } else if (h >= -0.02) {
            col = mix(uHorizonColor, uMidColor, smoothstep(-0.02, 0.16, h));
          } else if (h >= -0.22) {
            col = mix(uHorizonColor, uWarmMistColor, smoothstep(-0.02, -0.22, h));
          } else {
            col = mix(uWarmMistColor, uBottomColor, smoothstep(-0.22, -0.65, h));
          }

          float sunAmt = max(dot(dir, uSunDir), 0.0);
          vec3 sunHalo = uSunGlowColor * uSunGlowScale * (pow(sunAmt, 10.0) * 0.18 + pow(sunAmt, 72.0) * 0.28);
          col = col + sunHalo * (1.0 - col * 0.35);

          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
  }, []);

  useEffect(() => {
    return () => {
      skyDomeMaterial.dispose();
    };
  }, [skyDomeMaterial]);

  useFrame(({ camera, gl: frameGl, scene }, delta) => {
    if (isEscapadeCourse) {
      const storeState = useCurbsideStore.getState();
      const refVec = ballPositionRef?.current;
      const liveBall: Vec3Tuple = refVec
        ? [refVec.x, refVec.y, refVec.z]
        : (ballPosition ?? storeState.ballPosition);

      const camTuple: Vec3Tuple = [
        camera.position.x,
        camera.position.y,
        camera.position.z,
      ];
      const dxCamBall = camTuple[0] - liveBall[0];
      const dyCamBall = camTuple[1] - liveBall[1];
      const dzCamBall = camTuple[2] - liveBall[2];
      const camBallDist = Math.hypot(dxCamBall, dyCamBall, dzCamBall);

      // Subterranean crossfade: combines camera position (so 1-Tap Flyover crossfades smoothly even
      // while the golf ball rests on Zone 1 Tee) with local ball position when camera is following.
      const camSubBlend = computeSubterraneanBlend(camTuple);
      const ballSubBlend =
        camBallDist < 20.0 ? computeSubterraneanBlend(liveBall) : 0;
      const subBlend = Math.max(camSubBlend, ballSubBlend);

      if (Math.abs(subBlend - lastAppliedSubBlendRef.current) > 1e-4) {
        lastAppliedSubBlendRef.current = subBlend;

        if (bgColorRef.current) {
          bgColorRef.current.lerpColors(COLOR_SURF_BG, COLOR_SUB_BG, subBlend);
        }
        if (fogRef.current) {
          fogRef.current.color.lerpColors(
            COLOR_SURF_FOG,
            COLOR_SUB_FOG,
            subBlend,
          );
          fogRef.current.near = 135 + (48 - 135) * subBlend;
          fogRef.current.far = 328 + (128 - 328) * subBlend;
        }
        if (sunLightRef.current) {
          sunLightRef.current.color.lerpColors(
            COLOR_SURF_SUN,
            COLOR_SUB_SUN,
            subBlend,
          );
          sunLightRef.current.intensity = 2.35 + (0.42 - 2.35) * subBlend;
        }
        if (hemiLightRef.current) {
          hemiLightRef.current.color.lerpColors(
            COLOR_SURF_HEMI_SKY,
            COLOR_SUB_HEMI_SKY,
            subBlend,
          );
          hemiLightRef.current.groundColor.lerpColors(
            COLOR_SURF_HEMI_GND,
            COLOR_SUB_HEMI_GND,
            subBlend,
          );
          hemiLightRef.current.intensity = 0.98 + (0.94 - 0.98) * subBlend;
        }
        if (ambientLightRef.current) {
          ambientLightRef.current.color.lerpColors(
            COLOR_SURF_AMB,
            COLOR_SUB_AMB,
            subBlend,
          );
          ambientLightRef.current.intensity = 0.35 + (0.48 - 0.35) * subBlend;
        }
        if (rimLightRef.current) {
          rimLightRef.current.color.lerpColors(
            COLOR_SURF_RIM,
            COLOR_SUB_RIM,
            subBlend,
          );
          rimLightRef.current.intensity = 0.48 + (0.58 - 0.48) * subBlend;
        }

        // Sync sky dome horizon uniforms with fog color so stairwell descent has 0 LSB horizon seam
        skyDomeMaterial.uniforms.uTopColor.value.lerpColors(
          COLOR_SKY_TOP,
          COLOR_SUB_BG,
          subBlend,
        );
        skyDomeMaterial.uniforms.uMidColor.value.lerpColors(
          COLOR_SKY_MID,
          COLOR_SUB_BG,
          subBlend,
        );
        skyDomeMaterial.uniforms.uHorizonColor.value.lerpColors(
          COLOR_SURF_BG,
          COLOR_SUB_BG,
          subBlend,
        );
        skyDomeMaterial.uniforms.uWarmMistColor.value.lerpColors(
          COLOR_SKY_WARM_MIST,
          COLOR_SUB_BG,
          subBlend,
        );
        skyDomeMaterial.uniforms.uBottomColor.value.lerpColors(
          COLOR_SKY_BOTTOM,
          COLOR_SUB_BG,
          subBlend,
        );
        skyDomeMaterial.uniforms.uSunGlowScale.value = 1 - subBlend;

        if (skyDomeMeshRef.current) {
          skyDomeMeshRef.current.visible = subBlend < 0.97;
        }

        subterraneanRigRef.current?.applyBlend(subBlend);
      }

      subterraneanRigRef.current?.tickWarmup();

      const isFlyoverMode = Boolean(
        storeState.isCourseFlyoverActive || storeState.flyoverProgress !== null,
      );

      // During 1-Tap Course Flyover Scout, lock a single static aerial shadow frustum (±92m)
      // covering all surface Zones 1..6 so 0 shadow rebakes occur mid-flight (0 >25ms frame spikes).
      if (isFlyoverMode && sunLightRef.current) {
        if (!wasFlyoverModeRef.current) {
          wasFlyoverModeRef.current = true;
          const sun = sunLightRef.current;
          const cam = sun.shadow.camera;
          cam.left = -ESCAPADE_FLYOVER_SHADOW_HALF_SPAN;
          cam.right = ESCAPADE_FLYOVER_SHADOW_HALF_SPAN;
          cam.top = ESCAPADE_FLYOVER_SHADOW_HALF_SPAN;
          cam.bottom = -ESCAPADE_FLYOVER_SHADOW_HALF_SPAN;
          cam.updateProjectionMatrix();

          const snappedAerial = snapWorldAnchorToShadowTexelGrid(
            ESCAPADE_FLYOVER_STATIC_ANCHOR,
            escapadeSunBasis,
            ESCAPADE_FLYOVER_SHADOW_TEXEL_METERS,
          );
          lastTexelKeyRef.current = `flyover:${snappedAerial.texelKey}`;
          lightTargetObj.position.set(
            snappedAerial.target[0],
            snappedAerial.target[1],
            snappedAerial.target[2],
          );
          lightTargetObj.updateMatrixWorld(true);
          sun.position.set(
            snappedAerial.sunPosition[0],
            snappedAerial.sunPosition[1],
            snappedAerial.sunPosition[2],
          );
          sun.updateMatrixWorld(true);
          cam.updateMatrixWorld(true);

          shadowBakeRemainingRef.current = Math.max(
            shadowBakeRemainingRef.current,
            1,
          );
        }
      } else if (sunLightRef.current) {
        const exitingFlyover = wasFlyoverModeRef.current;
        if (exitingFlyover) {
          wasFlyoverModeRef.current = false;
          const cam = sunLightRef.current.shadow.camera;
          cam.left = -ESCAPADE_SHADOW_HALF_SPAN;
          cam.right = ESCAPADE_SHADOW_HALF_SPAN;
          cam.top = ESCAPADE_SHADOW_HALF_SPAN;
          cam.bottom = -ESCAPADE_SHADOW_HALF_SPAN;
          cam.updateProjectionMatrix();
        }

        // Texel-snapped following shadow frustum (±48m, 4.68cm texels, 12.0m hysteresis deadband)
        if (subBlend < 0.98 || exitingFlyover) {
          const focusAnchor: Vec3Tuple =
            camBallDist > 26.0
              ? [camTuple[0], camTuple[1] - 3.0, camTuple[2]]
              : liveBall;

          const prevAnchor = lastCommittedRawAnchorRef.current;
          const jumpDist = Math.hypot(
            focusAnchor[0] - prevAnchor[0],
            focusAnchor[1] - prevAnchor[1],
            focusAnchor[2] - prevAnchor[2],
          );

          if (
            !hasSnappedOnceRef.current ||
            exitingFlyover ||
            jumpDist >= ESCAPADE_SHADOW_HYSTERESIS_METERS
          ) {
            const snapped = snapWorldAnchorToShadowTexelGrid(
              focusAnchor,
              escapadeSunBasis,
            );
            const wasInitial = !hasSnappedOnceRef.current;
            hasSnappedOnceRef.current = true;
            lastCommittedRawAnchorRef.current = [
              focusAnchor[0],
              focusAnchor[1],
              focusAnchor[2],
            ];

            if (snapped.texelKey !== lastTexelKeyRef.current) {
              lastTexelKeyRef.current = snapped.texelKey;
              lightTargetObj.position.set(
                snapped.target[0],
                snapped.target[1],
                snapped.target[2],
              );
              lightTargetObj.updateMatrixWorld(true);

              const sun = sunLightRef.current;
              sun.position.set(
                snapped.sunPosition[0],
                snapped.sunPosition[1],
                snapped.sunPosition[2],
              );
              sun.updateMatrixWorld(true);
              sun.shadow.camera.updateMatrixWorld(true);

              if (rimLightRef.current) {
                rimLightRef.current.position.set(
                  snapped.target[0] + 34,
                  snapped.target[1] + 24,
                  snapped.target[2] - 28,
                );
                rimLightRef.current.updateMatrixWorld(true);
              }

              shadowBakeRemainingRef.current = Math.max(
                shadowBakeRemainingRef.current,
                wasInitial ? 2 : 1,
              );
            }
          }
        }
      }
    }

    if (isFullCourse) {
      if (frameGl.shadowMap.autoUpdate) {
        frameGl.shadowMap.autoUpdate = false;
      }
      if (shadowBakeRemainingRef.current > 0 && scene.children.length > 0) {
        frameGl.shadowMap.needsUpdate = true;
        shadowBakeRemainingRef.current -= 1;
      }
    }

    const group = cloudsGroupRef.current;
    if (!group || !showHorizon) return;

    if (isEscapadeCourse) {
      group.visible = lastAppliedSubBlendRef.current < 0.9;
      if (!group.visible) return;
      // Elevate cloud bank by +26.5m on Grand Escapade (`y = 43.9..50.1m`) so clouds float
      // visibly in the open golden-hour sky above the +31..+35m stepped perimeter skyline.
      group.position.set(camera.position.x, 26.5, camera.position.z);
    } else {
      group.visible = true;
      group.position.set(camera.position.x, 0, camera.position.z);
    }

    elapsedRef.current += Math.min(delta, 0.1);
    // `?qaFreezeParticles=1` pins the cloud clock to t = 4.0 for 0.00% stationary pixel delta.
    const t = resolveAnimTime(elapsedRef.current);
    const children = group.children;
    for (let i = 0; i < children.length; i++) {
      const spec = CLOUD_SPECS[i];
      if (!spec) continue;
      const cloud = children[i];
      cloud.position.x =
        spec.x + Math.sin(t * 0.08 * spec.speed + spec.bobOffset) * 9;
      cloud.position.y = spec.y + Math.sin(t * 0.45 + spec.bobOffset) * 0.35;
    }
  });

  const initialFogNear = isEscapadeCourse ? 135 : 95;
  const initialFogFar = isEscapadeCourse ? 328 : 176;

  return (
    <group name="curbside-lighting-and-sky">
      <color
        ref={bgColorRef}
        attach="background"
        args={[showHorizon ? HORIZON_MIST_HEX : '#F4EFE6']}
      />
      {showHorizon && (
        <fog
          ref={fogRef}
          attach="fog"
          args={[HORIZON_MIST_HEX, initialFogNear, initialFogFar]}
        />
      )}

      <primitive object={lightTargetObj} />

      {/* Late-Afternoon Walkabout: Venice Golden-Hour Directional Sun */}
      <directionalLight
        ref={sunLightRef}
        castShadow
        position={initialSunPos}
        target={lightTargetObj}
        intensity={2.35}
        color="#FFE5BA"
        shadow-mapSize={shadowMapSize}
        shadow-radius={isEscapadeCourse ? 1.55 : 1.65}
        shadow-camera-left={shadowLeft}
        shadow-camera-right={shadowRight}
        shadow-camera-top={shadowTop}
        shadow-camera-bottom={shadowBottom}
        shadow-camera-near={shadowNear}
        shadow-camera-far={shadowFar}
        shadow-bias={isEscapadeCourse ? -0.0002 : -0.00018}
        shadow-normalBias={isEscapadeCourse ? 0.024 : 0.022}
      />

      {/* Crisp Azure Sky / Warm Venetian Terracotta Ground Bounce (crossfades underground) */}
      <hemisphereLight
        ref={hemiLightRef}
        args={['#C8E4FF', '#EFAF7B', 0.98]}
      />

      {/* Soft Warm Ambient Fill for Legible Interior Shadows */}
      <ambientLight ref={ambientLightRef} intensity={0.35} color="#FFF6E6" />

      {/* Cool North-East Sky Rim Fill / Subterranean Concourse Modeling Fill */}
      <directionalLight
        ref={rimLightRef}
        position={[
          initialTargetPos[0] + 34,
          initialTargetPos[1] + 24,
          initialTargetPos[2] - 28,
        ]}
        intensity={0.48}
        color="#C9DFFF"
      />

      {isEscapadeCourse && (
        <SubterraneanLightingRig
          ref={subterraneanRigRef}
          vaultSpec={subwayVault}
          includeLightShafts={includeLightShafts}
        />
      )}

      {showHorizon && (
        <>
          <mesh
            ref={skyDomeMeshRef}
            material={skyDomeMaterial}
            renderOrder={-1000}
            frustumCulled={false}
          >
            <sphereGeometry args={[SKY_DOME_RADIUS, 40, 24]} />
          </mesh>

          <group ref={cloudsGroupRef} name="drifting-clouds">
            {CLOUD_SPECS.map((c, idx) => (
              <group key={idx} position={[c.x, c.y, c.z]} scale={c.scale}>
                <mesh position={[0, 0, 0]} material={TOYBOX_MATERIALS.cloudSoft}>
                  <icosahedronGeometry args={[2.3, 1]} />
                </mesh>
                <mesh
                  position={[-2.0, -0.35, 0.2]}
                  material={TOYBOX_MATERIALS.cloudSoft}
                >
                  <icosahedronGeometry args={[1.65, 1]} />
                </mesh>
                <mesh
                  position={[2.0, -0.25, -0.15]}
                  material={TOYBOX_MATERIALS.cloudSoft}
                >
                  <icosahedronGeometry args={[1.75, 1]} />
                </mesh>
                <mesh
                  position={[0.6, 0.78, 0.35]}
                  material={TOYBOX_MATERIALS.cloudSoft}
                >
                  <icosahedronGeometry args={[1.5, 1]} />
                </mesh>
              </group>
            ))}
          </group>
        </>
      )}
    </group>
  );
});
