'use client';

import React, { useMemo, useRef } from 'react';
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
  { x: -148, y: 18, z: -136, scale: 1.7, speed: 0.48, bobOffset: 0.0 },
  { x: -112, y: 22, z: -118, scale: 1.55, speed: 0.36, bobOffset: 1.3 },
  { x: 112, y: 17, z: -114, scale: 1.6, speed: 0.54, bobOffset: 2.4 },
  { x: 146, y: 21, z: -98, scale: 1.8, speed: 0.42, bobOffset: 3.1 },
  { x: 162, y: 15, z: -38, scale: 1.55, speed: 0.46, bobOffset: 4.2 },
  { x: -162, y: 16, z: -52, scale: 1.65, speed: 0.4, bobOffset: 5.0 },
];

export interface LightingAndSkyProps {
  /** Show pastel sky dome and flanking clouds. False for isolated QA studio. */
  showHorizon?: boolean;
  /** Sun shadow frustum half-extent (30 for full 48x48 island, 10 for isolated prop QA). */
  shadowSpan?: number;
}

export function LightingAndSky({
  showHorizon = true,
  shadowSpan = 30,
}: LightingAndSkyProps) {
  const cloudsGroupRef = useRef<THREE.Group>(null);

  const skyDomeMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTopColor: { value: new THREE.Color('#66B8F6') },
        uMidColor: { value: new THREE.Color('#A0DDFD') },
        uHorizonColor: { value: new THREE.Color('#D8EFFD') },
        uWarmMistColor: { value: new THREE.Color('#FFF2DF') },
        uBottomColor: { value: new THREE.Color('#FDE2C2') },
        uSunDir: { value: new THREE.Vector3(-0.42, 0.56, 0.45).normalize() },
        uSunGlowColor: { value: new THREE.Color('#FFF7DC') },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldDir;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          // View-relative ray keeps sunlit blue at the top of 3/4 portrait/desktop cameras
          // and warm apricot studio mist below the museum plinth.
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
          if (h >= 0.08) {
            col = mix(uMidColor, uTopColor, smoothstep(0.08, 0.68, h));
          } else if (h >= -0.44) {
            col = mix(uHorizonColor, uMidColor, smoothstep(-0.44, 0.08, h));
          } else if (h >= -0.60) {
            col = mix(uHorizonColor, uWarmMistColor, smoothstep(-0.44, -0.60, h));
          } else {
            col = mix(uWarmMistColor, uBottomColor, smoothstep(-0.60, -0.84, h));
          }

          float sunAmt = max(dot(normalize(vWorldDir), uSunDir), 0.0);
          col += uSunGlowColor * pow(sunAmt, 14.0) * 0.22;
          col += uSunGlowColor * pow(sunAmt, 84.0) * 0.28;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }, []);

  useFrame(({ clock }) => {
    const group = cloudsGroupRef.current;
    if (!group || !showHorizon) return;
    const t = clock.getElapsedTime();
    const children = group.children;
    for (let i = 0; i < children.length; i++) {
      const spec = CLOUD_SPECS[i];
      if (!spec) continue;
      const cloud = children[i];
      cloud.position.x = spec.x + Math.sin(t * 0.08 * spec.speed + spec.bobOffset) * 10;
      cloud.position.y = spec.y + Math.sin(t * 0.5 + spec.bobOffset) * 0.35;
    }
  });

  return (
    <group name="curbside-lighting-and-sky">
      <color attach="background" args={[showHorizon ? '#BEE4FA' : '#F4EFE6']} />
      {showHorizon && <fog attach="fog" args={['#FCEAD4', 290, 520]} />}

      {/* Sunlit Tabletop Key Light */}
      <directionalLight
        castShadow
        position={[-22, 54, 30]}
        intensity={2.15}
        color="#FFF3D9"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-shadowSpan}
        shadow-camera-right={shadowSpan}
        shadow-camera-top={shadowSpan}
        shadow-camera-bottom={-shadowSpan}
        shadow-camera-near={4}
        shadow-camera-far={140}
        shadow-bias={-0.0005}
        shadow-normalBias={0.05}
      />

      {/* Crisp Sky / Warm Limestone Bounce */}
      <hemisphereLight args={['#D0EEFF', '#F3B88C', 1.05]} />

      {/* Warm Ambient Fill */}
      <ambientLight intensity={0.42} color="#FFF8EC" />

      {/* Gentle NE Rim Fill for Crisp Architectural Edge Separation */}
      <directionalLight position={[28, 22, -26]} intensity={0.42} color="#FFE0BD" />

      {showHorizon && (
        <>
          <mesh material={skyDomeMaterial}>
            <sphereGeometry args={[440, 28, 18]} />
          </mesh>

          <group ref={cloudsGroupRef} name="drifting-clouds">
            {CLOUD_SPECS.map((c, idx) => (
              <group key={idx} position={[c.x, c.y, c.z]} scale={c.scale}>
                <mesh position={[0, 0, 0]} material={TOYBOX_MATERIALS.cloudSoft}>
                  <icosahedronGeometry args={[2.2, 1]} />
                </mesh>
                <mesh position={[-1.9, -0.35, 0.2]} material={TOYBOX_MATERIALS.cloudSoft}>
                  <icosahedronGeometry args={[1.6, 1]} />
                </mesh>
                <mesh position={[1.95, -0.25, -0.15]} material={TOYBOX_MATERIALS.cloudSoft}>
                  <icosahedronGeometry args={[1.7, 1]} />
                </mesh>
                <mesh position={[0.6, 0.75, 0.35]} material={TOYBOX_MATERIALS.cloudSoft}>
                  <icosahedronGeometry args={[1.45, 1]} />
                </mesh>
              </group>
            ))}
          </group>
        </>
      )}
    </group>
  );
}
