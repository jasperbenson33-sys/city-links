'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { TOYBOX_MATERIALS } from '@/materials';
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
 * The game camera far plane is 185m (tight depth range = zero z-fight), so the cloud bank is pulled in
 * by `CLOUD_RANGE_SCALE` (positions AND sizes scale together, preserving the exact same sky silhouette).
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

/** Sky dome radius (< camera far 185) — the dome follows the camera so it can never be clipped. */
const SKY_DOME_RADIUS = 150;

/**
 * Static, tightly fitted sun-shadow volume for the compact single hole.
 * Box = playable 5th & Mercer corridor + courtyard (+ margin on the sun-facing side for casters),
 * world metres.
 */
const SHADOW_FIT_BOX = {
  minX: -27,
  maxX: 44,
  minZ: -34,
  maxZ: 55,
  minY: -0.5,
  maxY: 16,
};

export interface LightingAndSkyProps {
  /** Show golden-hour sky dome, atmospheric perspective, and drifting clouds. False for isolated QA studio. */
  showHorizon?: boolean;
  /**
   * Sun shadow frustum half-extent override (isolated QA turntable uses 12). When omitted on the
   * full street, a static frustum is fitted tightly around the playable corridor + courtyard.
   */
  shadowSpan?: number;
  /** World-space focus point for the directional sun shadow frustum. */
  shadowTarget?: [number, number, number];
}

export const LightingAndSky = React.memo(function LightingAndSky({
  showHorizon = true,
  shadowSpan,
  shadowTarget,
}: LightingAndSkyProps) {
  const cloudsGroupRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);
  const shadowBakeRemainingRef = useRef(5);
  const prevSceneChildCountRef = useRef(-1);
  const gl = useThree((s) => s.gl);

  const resolvedSpan = shadowSpan ?? 12;
  const resolvedTarget: [number, number, number] =
    shadowTarget ?? (showHorizon ? [9, 0, 2] : [0, 0, 0]);

  const sunOffset: [number, number, number] = showHorizon
    ? [-16, 46, 14]
    : [-10, 22, 12];

  const sunPos: [number, number, number] = [
    resolvedTarget[0] + sunOffset[0],
    resolvedTarget[1] + sunOffset[1],
    resolvedTarget[2] + sunOffset[2],
  ];

  const useFittedFrustum = showHorizon && shadowSpan === undefined;

  /** Static light-space extents (never changes frame-to-frame, so shadow texels cannot swim). */
  const fitted = useMemo(() => {
    const eye = new THREE.Vector3(sunPos[0], sunPos[1], sunPos[2]);
    const tgt = new THREE.Vector3(resolvedTarget[0], resolvedTarget[1], resolvedTarget[2]);
    const zAxis = eye.clone().sub(tgt).normalize();
    const xAxis = new THREE.Vector3(0, 1, 0).cross(zAxis).normalize();
    const yAxis = zAxis.clone().cross(xAxis).normalize();
    const b = SHADOW_FIT_BOX;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const p = new THREE.Vector3();
    for (const x of [b.minX, b.maxX]) {
      for (const y of [b.minY, b.maxY]) {
        for (const z of [b.minZ, b.maxZ]) {
          p.set(x, y, z).sub(eye);
          const lx = p.dot(xAxis);
          const ly = p.dot(yAxis);
          minX = Math.min(minX, lx);
          maxX = Math.max(maxX, lx);
          minY = Math.min(minY, ly);
          maxY = Math.max(maxY, ly);
        }
      }
    }
    // Snap to whole metres so the fitted volume is a clean, reproducible number.
    return {
      left: Math.floor(minX),
      right: Math.ceil(maxX),
      bottom: Math.floor(minY),
      top: Math.ceil(maxY),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sunPos[0], sunPos[1], sunPos[2], resolvedTarget[0], resolvedTarget[1], resolvedTarget[2]]);

  const shadowLeft = useFittedFrustum ? fitted.left : -resolvedSpan;
  const shadowRight = useFittedFrustum ? fitted.right : resolvedSpan;
  const shadowTop = useFittedFrustum ? fitted.top : resolvedSpan;
  const shadowBottom = useFittedFrustum ? fitted.bottom : -resolvedSpan;

  const lightTargetObj = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    lightTargetObj.position.set(
      resolvedTarget[0],
      resolvedTarget[1],
      resolvedTarget[2],
    );
    lightTargetObj.updateMatrixWorld();
  }, [lightTargetObj, resolvedTarget[0], resolvedTarget[1], resolvedTarget[2]]);

  // W3-M1: In full-course mode (useFittedFrustum), bake the static 2048x2048 sun shadow map for 5 frames
  // after mount (and re-arm if Suspense children attach), then lock autoUpdate = false so 3,912 static
  // casters aren't re-submitted every frame. Restore autoUpdate = true on unmount or in /qa-gallery.
  useEffect(() => {
    if (!useFittedFrustum) {
      gl.shadowMap.autoUpdate = true;
      gl.shadowMap.needsUpdate = true;
      return;
    }
    shadowBakeRemainingRef.current = 5;
    prevSceneChildCountRef.current = -1;
    gl.shadowMap.autoUpdate = true;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
      gl.shadowMap.needsUpdate = true;
    };
  }, [gl, useFittedFrustum, shadowLeft, shadowRight, shadowTop, shadowBottom]);

  const skyDomeMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTopColor: { value: new THREE.Color('#53A6E5') },
        uMidColor: { value: new THREE.Color('#9ED4F4') },
        uHorizonColor: { value: new THREE.Color('#FBE3BD') },
        uWarmMistColor: { value: new THREE.Color('#F5CFA0') },
        uBottomColor: { value: new THREE.Color('#E6BA8B') },
        uSunDir: { value: new THREE.Vector3(-0.48, 0.42, 0.42).normalize() },
        uSunGlowColor: { value: new THREE.Color('#FFE9B8') },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldDir;
        void main() {
          // Dome rides on the camera inside the shader (cameraPosition is current at draw time:
          // zero frame lag, never clipped by the 185m far plane).
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
        varying vec3 vWorldDir;

        void main() {
          float h = vWorldDir.y;
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

          float sunAmt = max(dot(normalize(vWorldDir), uSunDir), 0.0);
          col += uSunGlowColor * pow(sunAmt, 10.0) * 0.24;
          col += uSunGlowColor * pow(sunAmt, 72.0) * 0.34;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }, []);

  useFrame(({ camera, gl: frameGl, scene }, delta) => {
    if (useFittedFrustum) {
      const childCount = scene.children.length;
      if (
        prevSceneChildCountRef.current !== -1 &&
        childCount > prevSceneChildCountRef.current
      ) {
        shadowBakeRemainingRef.current = Math.max(
          shadowBakeRemainingRef.current,
          2,
        );
      }
      prevSceneChildCountRef.current = childCount;

      if (shadowBakeRemainingRef.current > 0) {
        frameGl.shadowMap.autoUpdate = true;
        frameGl.shadowMap.needsUpdate = true;
        shadowBakeRemainingRef.current -= 1;
      } else if (frameGl.shadowMap.autoUpdate) {
        frameGl.shadowMap.autoUpdate = false;
      }
    }

    const group = cloudsGroupRef.current;
    if (!group || !showHorizon) return;
    // Cloud bank rides with the camera (XZ) so every cloud stays <= ~115m away: never clipped by far=185.
    group.position.set(camera.position.x, 0, camera.position.z);
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

  return (
    <group name="curbside-lighting-and-sky">
      <color attach="background" args={[showHorizon ? '#EED7BA' : '#F4EFE6']} />
      {showHorizon && <fog attach="fog" args={['#F5DEC2', 95, 176]} />}

      <primitive object={lightTargetObj} />

      {/* Late-Afternoon Walkabout: Venice Golden-Hour Directional Sun */}
      <directionalLight
        castShadow
        position={sunPos}
        target={lightTargetObj}
        intensity={2.35}
        color="#FFE5BA"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={shadowLeft}
        shadow-camera-right={shadowRight}
        shadow-camera-top={shadowTop}
        shadow-camera-bottom={shadowBottom}
        shadow-camera-near={2}
        shadow-camera-far={130}
        shadow-bias={-0.0004}
        shadow-normalBias={0.035}
      />

      {/* Crisp Azure Sky / Warm Venetian Terracotta Ground Bounce */}
      <hemisphereLight args={['#C8E4FF', '#EFAF7B', 0.96]} />

      {/* Soft Warm Ambient Fill for Legible Interior Shadows */}
      <ambientLight intensity={0.34} color="#FFF6E6" />

      {/* Cool North-East Sky Rim Fill for Faceted Architectural Edge Separation */}
      <directionalLight
        position={[resolvedTarget[0] + 34, 24, resolvedTarget[2] - 28]}
        intensity={0.46}
        color="#C9DFFF"
      />

      {showHorizon && (
        <>
          <mesh
            material={skyDomeMaterial}
            renderOrder={-1000}
            frustumCulled={false}
          >
            <sphereGeometry args={[SKY_DOME_RADIUS, 28, 18]} />
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
