'use client';

import React from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { COURSE_MASTER_PLAN } from '@/config/courseMasterPlan';
import { BALL_RADIUS } from '@/types/clubs';

export interface GameCanvasProps {
  children: React.ReactNode;
  className?: string;
}

const TEE = COURSE_MASTER_PLAN.teePosition;

const CAMERA_CONFIG = {
  fov: 52,
  near: 0.35,
  far: 340,
  position: [TEE[0], TEE[1] + BALL_RADIUS + 2.08, TEE[2] + 4.7] as [number, number, number],
};

const GL_CONFIG = {
  antialias: true,
  alpha: false,
  stencil: false,
  depth: true,
  powerPreference: 'high-performance' as const,
  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 1.06,
};

const SHADOWS_CONFIG = { type: THREE.PCFShadowMap };

/**
 * Anti-shimmer render surface: hardware MSAA on an opaque depth buffer, stable PCF shadows,
 * exact 2x DPR supersampling, a tight depth range (near 0.35 / far 340) for z-buffer precision,
 * and zero post-processing passes (so native MSAA stays active).
 */
export function GameCanvas({ children, className = 'h-full w-full touch-none' }: GameCanvasProps) {
  return (
    <Canvas
      shadows={SHADOWS_CONFIG}
      dpr={[2, 2]}
      camera={CAMERA_CONFIG}
      gl={GL_CONFIG}
      className={className}
    >
      {children}
    </Canvas>
  );
}

export default GameCanvas;
