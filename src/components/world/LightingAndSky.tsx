'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TOYBOX_MATERIALS } from '@/materials';

interface CloudSpec {
  x: number;
  y: number;
  z: number;
  scale: number;
  speed: number;
  bobOffset: number;
}

const CLOUD_SPECS: CloudSpec[] = [
  { x: -135, y: 32, z: -128, scale: 1.75, speed: 0.44, bobOffset: 0.0 },
  { x: -95, y: 38, z: -115, scale: 1.5, speed: 0.34, bobOffset: 1.3 },
  { x: 118, y: 30, z: -112, scale: 1.65, speed: 0.5, bobOffset: 2.4 },
  { x: 148, y: 35, z: -82, scale: 1.8, speed: 0.4, bobOffset: 3.1 },
  { x: 156, y: 28, z: 32, scale: 1.55, speed: 0.46, bobOffset: 4.2 },
  { x: -148, y: 30, z: 48, scale: 1.65, speed: 0.38, bobOffset: 5.0 },
];

export interface LightingAndSkyProps {
  /** Show golden-hour sky dome, atmospheric perspective, and drifting clouds. False for isolated QA studio. */
  showHorizon?: boolean;
  /** Sun shadow frustum half-extent (44 for full 72m street + courtyard, 12 for isolated QA turntable). */
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

  const resolvedSpan = shadowSpan ?? (showHorizon ? 44 : 12);
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

  const lightTargetObj = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    lightTargetObj.position.set(
      resolvedTarget[0],
      resolvedTarget[1],
      resolvedTarget[2],
    );
    lightTargetObj.updateMatrixWorld();
  }, [lightTargetObj, resolvedTarget[0], resolvedTarget[1], resolvedTarget[2]]);

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
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(worldPos.xyz - cameraPosition);
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

  useFrame((_, delta) => {
    const group = cloudsGroupRef.current;
    if (!group || !showHorizon) return;
    elapsedRef.current += Math.min(delta, 0.1);
    const t = elapsedRef.current;
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
      {showHorizon && <fog attach="fog" args={['#F5DEC2', 110, 320]} />}

      <primitive object={lightTargetObj} />

      {/* Late-Afternoon Walkabout: Venice Golden-Hour Directional Sun */}
      <directionalLight
        castShadow
        position={sunPos}
        target={lightTargetObj}
        intensity={2.35}
        color="#FFE5BA"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-resolvedSpan}
        shadow-camera-right={resolvedSpan}
        shadow-camera-top={resolvedSpan}
        shadow-camera-bottom={-resolvedSpan}
        shadow-camera-near={4}
        shadow-camera-far={135}
        shadow-bias={-0.00035}
        shadow-normalBias={0.03}
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
          <mesh material={skyDomeMaterial}>
            <sphereGeometry args={[380, 28, 18]} />
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
