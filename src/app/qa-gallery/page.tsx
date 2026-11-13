'use client';

// Suppress expected R3F 9.x / Three r183 internal deprecation warnings on QA studio mount
if (typeof window !== 'undefined' && !(window as unknown as { __curbsideQaWarnPatched?: boolean }).__curbsideQaWarnPatched) {
  (window as unknown as { __curbsideQaWarnPatched?: boolean }).__curbsideQaWarnPatched = true;
  const origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (
      msg.includes('THREE.Clock: This module has been deprecated') ||
      msg.includes('THREE.WebGLShadowMap: PCFSoftShadowMap has been removed')
    ) {
      return;
    }
    origWarn(...args);
  };
}

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type {
  ClubId,
  FlagColor,
  GeneratedCityCourse,
  PlacedTile,
} from '@/types';
import { FLAG_COLORS, GRID_COLS, GRID_ROWS } from '@/types';
import { createRandomSeed, generateCityCourse, getTodayDailySeedUTC } from '@/engine';
import {
  CityIslandWorld,
  LightingAndSky,
  ModularTileMesh,
  PROP_QA_REGISTRY,
  TILE_QA_REGISTRY,
  type PropQaItemId,
} from '@/components/world';
import type { TileBlueprintId } from '@/types';

type StudioTab = 'props' | 'tiles' | 'course' | 'matrix';
type CameraPreset = 'macro_3_4' | 'front' | 'side' | 'top';

const QA_MATRIX_SEEDS: string[] = Array.from({ length: 20 }, (_, i) =>
  `curbside-qa-seed-${String(i + 1).padStart(2, '0')}`
);

const FLAG_HEX: Record<FlagColor, string> = {
  red: '#E84A43',
  yellow: '#F4BC2C',
  blue: '#2D8BE8',
  purple: '#9252D6',
  green: '#29B266',
};

interface PresetPose {
  pos: [number, number, number];
  target: [number, number, number];
}

function getCameraPose(preset: CameraPreset, tab: StudioTab): PresetPose {
  const isFullIsland = tab === 'course';
  if (isFullIsland) {
    switch (preset) {
      case 'front':
        return { pos: [0, 14, 54], target: [0, 0.5, 0] };
      case 'side':
        return { pos: [54, 14, 0], target: [0, 0.5, 0] };
      case 'top':
        return { pos: [0, 68, 0.01], target: [0, 0, 0] };
      case 'macro_3_4':
      default:
        return { pos: [34, 34, 42], target: [0, 0.2, 0] };
    }
  }

  const isTile = tab === 'tiles';
  const scale = isTile ? 2.6 : 1.0;
  const lookY = isTile ? 1.2 : 0.85;
  switch (preset) {
    case 'front':
      return { pos: [0, lookY + 0.65 * scale, 5.4 * scale], target: [0, lookY, 0] };
    case 'side':
      return { pos: [5.4 * scale, lookY + 0.65 * scale, 0], target: [0, lookY, 0] };
    case 'top':
      return { pos: [0, 6.8 * scale, 0.01], target: [0, 0, 0] };
    case 'macro_3_4':
    default:
      return {
        pos: [3.6 * scale, 2.8 * scale, 4.4 * scale],
        target: [0, lookY * 0.85, 0],
      };
  }
}

function CameraPresetRig({
  preset,
  tab,
  applyCounter,
}: {
  preset: CameraPreset;
  tab: StudioTab;
  applyCounter: number;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);

  useEffect(() => {
    const pose = getCameraPose(preset, tab);
    camera.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    if (controlsRef.current) {
      controlsRef.current.target.set(pose.target[0], pose.target[1], pose.target[2]);
      controlsRef.current.update();
    } else {
      camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
    }
  }, [preset, tab, applyCounter, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={1.8}
      maxDistance={120}
      maxPolarAngle={Math.PI * 0.495}
    />
  );
}

/** Calibrated y = 0 inspection floor, 1m grid markings, and +X/+Y/+Z axis triad. */
function CalibratedGridStage({ span, yOffset = 0 }: { span: number; yOffset?: number }) {
  return (
    <group name="qa-calibrated-grid-stage" position={[0, yOffset, 0]}>
      {/* Crisp reference floor plane */}
      <mesh rotation={[-Math.PI * 0.5, 0, 0]} position={[0, -0.004, 0]} receiveShadow>
        <planeGeometry args={[span * 1.4, span * 1.4]} />
        <meshStandardMaterial color="#EAE3D7" roughness={0.95} metalness={0.0} />
      </mesh>
      {/* Calibrated 1m grid directly on floor */}
      <gridHelper args={[span, span, '#7C7062', '#D0C6B8']} position={[0, 0.001, 0]} />
      {/* Origin axes (+X Red Right, +Y Green Up, +Z Blue Forward) */}
      <axesHelper args={[Math.min(3.5, span * 0.25)]} position={[0, 0.008, 0]} />
      {/* Subtle 1m outer foot ring for isolated alignment checks */}
      <mesh rotation={[-Math.PI * 0.5, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[0.98, 1.02, 48]} />
        <meshBasicMaterial color="#9E8F7E" transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Architectural 2D tile & flag map thumbnail for the 20-Seed Verification Matrix. */
function isCourseSolvable(course: GeneratedCityCourse): boolean {
  return (
    course.reachability.length >= 25 &&
    course.reachability.every((edge) => edge.strokes <= 3)
  );
}

function CourseMatrixThumbnail({
  course,
  selected,
  onSelect,
}: {
  course: GeneratedCityCourse;
  selected: boolean;
  onSelect: () => void;
}) {
  const solvable = isCourseSolvable(course);
  const cellFill = (tile: PlacedTile): string => {
    switch (tile.category) {
      case 'road':
        return '#484D56';
      case 'gutter':
        return '#8D95A2';
      case 'ramp':
        return '#E89D3C';
      case 'terrace':
        return '#C8674B';
      case 'hazard':
        return '#33C7CD';
      case 'cup':
        return '#3CC46D';
      case 'plaza':
      default:
        return tile.blueprintId.includes('parklet') ? '#56CC7A' : '#EFE5D5';
    }
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex flex-col rounded-xl border p-2.5 text-left transition-all ${
        selected
          ? 'border-[#2D8BE8] bg-white ring-2 ring-[#2D8BE8]/35 shadow-md'
          : 'border-[#DDD3C3] bg-white/90 hover:border-[#B6A792] hover:shadow-sm'
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[11px] font-semibold text-[#2B2520]">
          {course.seed}
        </span>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            solvable
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-rose-100 text-rose-800'
          }`}
        >
          {solvable ? 'SOLVABLE' : 'CHECK'}
        </span>
      </div>

      {/* 6x6 Architectural Grid + Flags + Props */}
      <svg
        viewBox="0 0 120 120"
        className="w-full rounded-lg border border-[#D4C9B8] bg-[#E8DFCE]"
      >
        {course.tiles.map((tile) => {
          const x = tile.col * 20;
          const y = tile.row * 20;
          return (
            <g key={tile.id}>
              <rect
                x={x + 0.5}
                y={y + 0.5}
                width={19}
                height={19}
                rx={2}
                fill={cellFill(tile)}
              />
              {tile.tier >= 2 && (
                <rect
                  x={x + 2.5}
                  y={y + 2.5}
                  width={15}
                  height={15}
                  rx={1.5}
                  fill="none"
                  stroke="#FFF4DC"
                  strokeWidth={1.1}
                />
              )}
            </g>
          );
        })}

        {/* Prop dots */}
        {course.props.map((p) => {
          const sx = ((p.position[0] + 24) / 48) * 120;
          const sy = ((p.position[2] + 24) / 48) * 120;
          return (
            <circle
              key={p.id}
              cx={sx}
              cy={sy}
              r={1.35}
              fill={p.blocksGroundRoll ? '#FF8F3F' : '#1E293B'}
              opacity={0.75}
            />
          );
        })}

        {/* Start Tee Pin */}
        <circle
          cx={((course.startTeePosition[0] + 24) / 48) * 120}
          cy={((course.startTeePosition[2] + 24) / 48) * 120}
          r={3.2}
          fill="#FFFFFF"
          stroke="#1D222B"
          strokeWidth={1.3}
        />

        {/* 5 Color-Coded Flags */}
        {course.flags.map((f) => {
          const fx = ((f.position[0] + 24) / 48) * 120;
          const fy = ((f.position[2] + 24) / 48) * 120;
          return (
            <g key={f.color}>
              <circle
                cx={fx}
                cy={fy}
                r={3.6}
                fill={FLAG_HEX[f.color]}
                stroke="#FFFFFF"
                strokeWidth={1.1}
              />
            </g>
          );
        })}
      </svg>

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#6B5E50]">
        <span>
          {course.props.length} props · {course.generationMs.toFixed(1)}ms
        </span>
        <span className="font-semibold text-[#2D8BE8] group-hover:underline">
          Inspect 3D →
        </span>
      </div>
    </button>
  );
}

export default function QaGalleryPage() {
  const [tab, setTab] = useState<StudioTab>('props');
  const [selectedPropId, setSelectedPropId] = useState<PropQaItemId>('hotdog_cart_umbrella');
  const [selectedTileId, setSelectedTileId] = useState<TileBlueprintId>('road_corner_gutter');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('macro_3_4');
  const [presetCounter, setPresetCounter] = useState(0);
  const [showWireframe, setShowWireframe] = useState(false);
  const [forceAction, setForceAction] = useState(false);
  const [lastHitAt, setLastHitAt] = useState(-10);
  const [previewFlagColor, setPreviewFlagColor] = useState<FlagColor>('red');
  const [previewSunk, setPreviewSunk] = useState(false);
  const [selectedClub, setSelectedClub] = useState<ClubId>('driver');

  // Seed list starts deterministically so SSR and first client render always match cleanly
  const [matrixSeeds, setMatrixSeeds] = useState<string[]>(QA_MATRIX_SEEDS);
  const [activeCourseSeed, setActiveCourseSeed] = useState<string>(QA_MATRIX_SEEDS[0]!);

  const matrixCourses = useMemo(
    () => matrixSeeds.map((s) => generateCityCourse(s)),
    [matrixSeeds]
  );

  const activeCourse = useMemo(
    () =>
      matrixCourses.find((c) => c.seed === activeCourseSeed) ??
      generateCityCourse(activeCourseSeed),
    [matrixCourses, activeCourseSeed]
  );

  const activePropEntry = useMemo(
    () => PROP_QA_REGISTRY.find((p) => p.id === selectedPropId) ?? PROP_QA_REGISTRY[0]!,
    [selectedPropId]
  );

  const activeTileEntry = useMemo(
    () => TILE_QA_REGISTRY.find((t) => t.id === selectedTileId) ?? TILE_QA_REGISTRY[0]!,
    [selectedTileId]
  );

  const triggerHit = () => {
    setLastHitAt(performance.now() * 0.001);
  };

  const applyPreset = (nextPreset: CameraPreset) => {
    setCameraPreset(nextPreset);
    setPresetCounter((c) => c + 1);
  };

  const regenerate20RandomSeeds = () => {
    const next = Array.from({ length: 20 }, () => createRandomSeed());
    setMatrixSeeds(next);
    setActiveCourseSeed(next[0]!);
  };

  const loadTodayDailySeed = () => {
    const daily = getTodayDailySeedUTC();
    setActiveCourseSeed(daily);
    setTab('course');
  };

  const show3DStage = tab !== 'matrix';

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#F5EFE4] text-[#2B241D] select-auto">
      {/* Studio Top Bar */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#DDD2C0] bg-[#FAF6EE] px-4 py-2.5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E84A43] font-black text-white shadow-xs">
            QA
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-tight text-[#231D17] sm:text-base">
              Curbside Links — 3D QA Inspection Studio
            </h1>
            <p className="text-[11px] text-[#6E6050]">
              Calibrated y=0 plane · Coaxial wheel/umbrella specs · 19 tiles · 20-seed verification matrix
            </p>
          </div>
        </div>

        {/* Mode Tabs */}
        <nav className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['props', `Props (${PROP_QA_REGISTRY.length})`],
              ['tiles', `Tiles (${TILE_QA_REGISTRY.length})`],
              ['course', 'Full Island 3D'],
              ['matrix', '20-Seed Matrix'],
            ] as Array<[StudioTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setPresetCounter((c) => c + 1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                tab === id
                  ? 'bg-[#25201B] text-white shadow-xs'
                  : 'border border-[#D7CBB9] bg-white text-[#4A3F34] hover:bg-[#EFE7DA]'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Content Area */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Left Sidebar Selector & Inspector Controls */}
        {show3DStage && (
          <aside
            className="flex max-h-[38vh] w-full shrink-0 flex-col border-b border-[#DDD2C0] bg-[#FAF6EE] md:max-h-none md:w-80 md:border-r md:border-b-0"
            style={{ touchAction: 'pan-y' }}
          >
            {/* Camera Presets & Wireframe Toggle */}
            <div className="border-b border-[#E5DAC8] p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider text-[#7A6B5A] uppercase">
                  Camera Presets
                </span>
                <button
                  type="button"
                  onClick={() => setShowWireframe((v) => !v)}
                  className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${
                    showWireframe
                      ? 'bg-[#10B981] text-white shadow-xs'
                      : 'border border-[#D5C9B6] bg-white text-[#4B4035] hover:bg-[#EFE7DA]'
                  }`}
                >
                  {showWireframe ? '✓ Bounds Wireframe ON' : 'Collider / Bounds Wireframe'}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {(
                  [
                    ['macro_3_4', 'Macro 3/4'],
                    ['front', 'Front'],
                    ['side', 'Side'],
                    ['top', 'Top'],
                  ] as Array<[CameraPreset, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => applyPreset(id)}
                    className={`rounded-md px-2 py-1.5 text-[11px] font-bold transition ${
                      cameraPreset === id
                        ? 'bg-[#2D8BE8] text-white'
                        : 'border border-[#D8CCB9] bg-white text-[#3F352B] hover:bg-[#EFE7DA]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject-Specific Action Bar */}
            <div className="border-b border-[#E5DAC8] bg-[#F3ECE0] p-3 text-xs">
              {tab === 'props' && (
                <div className="space-y-2">
                  <div className="font-bold text-[#251F19]">{activePropEntry.label}</div>
                  <p className="text-[11px] leading-snug text-[#615447]">
                    {activePropEntry.summary}
                  </p>
                  <div className="font-mono text-[10px] text-[#7D6E5D]">
                    Bounds (X×Y×Z): {activePropEntry.localSize[0].toFixed(2)}m ×{' '}
                    {activePropEntry.localSize[1].toFixed(2)}m ×{' '}
                    {activePropEntry.localSize[2].toFixed(2)}m
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={triggerHit}
                      className="rounded-md bg-[#E84A43] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#D63C35]"
                    >
                      Trigger Hit / Splash
                    </button>
                    <button
                      type="button"
                      onClick={() => setForceAction((v) => !v)}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${
                        forceAction
                          ? 'bg-[#F59E0B] text-white'
                          : 'border border-[#D0C3B0] bg-white text-[#3E342A]'
                      }`}
                    >
                      {forceAction ? 'Gust/Scatter ON' : 'Force Gust / Scatter'}
                    </button>
                  </div>
                </div>
              )}

              {tab === 'tiles' && (
                <div className="space-y-2">
                  <div className="font-bold text-[#251F19]">{activeTileEntry.label}</div>
                  <p className="text-[11px] leading-snug text-[#615447]">
                    {activeTileEntry.summary}
                  </p>
                  {activeTileEntry.category === 'cup' && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {FLAG_COLORS.map((fc) => (
                          <button
                            key={fc}
                            type="button"
                            onClick={() => setPreviewFlagColor(fc)}
                            className={`h-5 w-5 shrink-0 rounded-full border-2 ${
                              previewFlagColor === fc
                                ? 'scale-110 border-[#231D17]'
                                : 'border-white/70 opacity-75'
                            }`}
                            style={{ backgroundColor: FLAG_HEX[fc] }}
                            title={`Flag ${fc}`}
                          />
                        ))}
                        <button
                          type="button"
                          onClick={() => setPreviewSunk((v) => !v)}
                          className={`ml-auto whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-bold ${
                            previewSunk
                              ? 'bg-[#D97706] text-white'
                              : 'border border-[#CFC2AF] bg-white text-[#41372D]'
                          }`}
                        >
                          {previewSunk ? '✓ Sunk State' : 'Preview Sunk'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === 'course' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs font-bold text-[#251F19]">
                      {activeCourse.seed}
                    </span>
                    <button
                      type="button"
                      onClick={loadTodayDailySeed}
                      className="shrink-0 rounded-md border border-[#CFC2AF] bg-white px-2 py-0.5 text-[10px] font-bold text-[#3D3329] hover:bg-[#EAE1D3]"
                    >
                      Today Daily UTC
                    </button>
                  </div>
                  <div className="text-[11px] text-[#615447]">
                    {GRID_COLS}×{GRID_ROWS} tiles · {activeCourse.props.length} props · 5 flags ·{' '}
                    {isCourseSolvable(activeCourse)
                      ? 'Solvable ✓'
                      : 'Reachability Warning'}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewSunk((v) => !v)}
                      className={`rounded-md px-2 py-1 text-[11px] font-bold ${
                        previewSunk
                          ? 'bg-[#D97706] text-white'
                          : 'border border-[#CFC2AF] bg-white text-[#41372D]'
                      }`}
                    >
                      {previewSunk ? 'All 5 Flags Sunk' : 'Toggle Sunk Flags'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('matrix')}
                      className="rounded-md border border-[#2D8BE8] bg-white px-2 py-1 text-[11px] font-bold text-[#2D8BE8]"
                    >
                      Open 20-Seed Matrix
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Scrollable Selector List */}
            <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
              {tab === 'props' && (
                <div className="space-y-1">
                  {PROP_QA_REGISTRY.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        setSelectedPropId(entry.id);
                        if (entry.id === 'golf_bag_tee') setSelectedClub('driver');
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition ${
                        selectedPropId === entry.id
                          ? 'bg-[#25201B] font-bold text-white'
                          : 'bg-white/75 text-[#382F26] hover:bg-white'
                      }`}
                    >
                      <span className="truncate">{entry.label}</span>
                      <span
                        className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                          selectedPropId === entry.id
                            ? 'bg-white/20 text-white'
                            : 'bg-[#EBE2D4] text-[#6B5D4E]'
                        }`}
                      >
                        {entry.category}
                      </span>
                    </button>
                  ))}
                  {selectedPropId === 'golf_bag_tee' && (
                    <div className="mt-2 rounded-lg border border-[#DDD2C0] bg-white p-2">
                      <div className="mb-1 text-[10px] font-bold text-[#6E6050] uppercase">
                        Equipped Club Preview
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {(['driver', 'wedge', 'skimmer', 'putter'] as ClubId[]).map((cid) => (
                          <button
                            key={cid}
                            type="button"
                            onClick={() => setSelectedClub(cid)}
                            className={`rounded px-1.5 py-1 text-[10px] font-bold capitalize ${
                              selectedClub === cid
                                ? 'bg-[#29B266] text-white'
                                : 'bg-[#F2ECE1] text-[#3B3127]'
                            }`}
                          >
                            {cid}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === 'tiles' && (
                <div className="space-y-1">
                  {TILE_QA_REGISTRY.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        setSelectedTileId(entry.id);
                        if (entry.defaultFlagColor) {
                          setPreviewFlagColor(entry.defaultFlagColor);
                        }
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition ${
                        selectedTileId === entry.id
                          ? 'bg-[#25201B] font-bold text-white'
                          : 'bg-white/75 text-[#382F26] hover:bg-white'
                      }`}
                    >
                      <span className="truncate">{entry.label}</span>
                      <span
                        className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                          selectedTileId === entry.id
                            ? 'bg-white/20 text-white'
                            : 'bg-[#EBE2D4] text-[#6B5D4E]'
                        }`}
                      >
                        {entry.category}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {tab === 'course' && (
                <div className="space-y-1">
                  {matrixCourses.map((c) => (
                    <button
                      key={c.seed}
                      type="button"
                      onClick={() => setActiveCourseSeed(c.seed)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left font-mono text-[11px] transition ${
                        activeCourse.seed === c.seed
                          ? 'bg-[#25201B] font-bold text-white'
                          : 'bg-white/75 text-[#382F26] hover:bg-white'
                      }`}
                    >
                      <span className="truncate">{c.seed}</span>
                      <span className="ml-2 shrink-0 text-[10px] opacity-80">
                        {c.props.length}p
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Right Viewport: Live 3D Studio Canvas OR 20-Seed Matrix */}
        {show3DStage ? (
          <main className="relative min-h-0 flex-1" style={{ touchAction: 'none' }}>
            <Canvas
              shadows={{ type: THREE.PCFShadowMap }}
              dpr={[1, 2]}
              gl={{ antialias: true, powerPreference: 'high-performance' }}
              camera={{ fov: 42, near: 0.15, far: 800, position: [4, 3, 5] }}
            >
              <Suspense fallback={null}>
                {tab !== 'course' && (
                  <>
                    <LightingAndSky showHorizon={false} shadowSpan={12} />
                    <CalibratedGridStage span={tab === 'tiles' ? 16 : 10} yOffset={tab === 'tiles' ? -0.345 : 0} />
                  </>
                )}

                {tab === 'props' &&
                  activePropEntry.render({
                    showWireframe,
                    lastHitAt,
                    forceAction,
                    selectedClub,
                  })}

                {tab === 'tiles' && (
                  <ModularTileMesh
                    blueprintId={activeTileEntry.id}
                    position={[0, 0, 0]}
                    flagColor={previewFlagColor}
                    isSunk={previewSunk}
                    showWireframe={showWireframe}
                  />
                )}

                {tab === 'course' && (
                  <CityIslandWorld
                    course={activeCourse}
                    sunkFlags={
                      previewSunk
                        ? {
                            red: true,
                            yellow: true,
                            blue: true,
                            purple: true,
                            green: true,
                          }
                        : undefined
                    }
                    selectedClub={selectedClub}
                    propHitTimestamps={{ [selectedPropId]: lastHitAt }}
                    includeLighting={true}
                    showHorizon={true}
                    showWireframe={showWireframe}
                    forceAction={forceAction}
                  />
                )}

                <CameraPresetRig
                  preset={cameraPreset}
                  tab={tab}
                  applyCounter={presetCounter}
                />
              </Suspense>
            </Canvas>

            {/* Stage Telemetry Badge */}
            <div className="pointer-events-none absolute right-3 bottom-3 rounded-lg bg-[#231D17]/80 px-3 py-1.5 font-mono text-[11px] text-[#FAF5EC] backdrop-blur-xs">
              {tab === 'props' && `PROP: ${activePropEntry.id} · y=0 grid (1m cells)`}
              {tab === 'tiles' && `TILE: ${activeTileEntry.id} (8m×8m) · y=0 grid`}
              {tab === 'course' &&
                `ISLAND: 48m×48m · Seed "${activeCourse.seed}" · 5 Flags · ${activeCourse.props.length} Props`}
            </div>
          </main>
        ) : (
          /* 20-Seed Verification Matrix View */
          <main
            className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"
            style={{ touchAction: 'pan-y' }}
          >
            <div className="mx-auto max-w-6xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#DDD2C0] bg-[#FAF6EE] p-3.5">
                <div>
                  <h2 className="text-sm font-extrabold text-[#231D17]">
                    20-Seed Procedural City Matrix (`generateCityCourse`)
                  </h2>
                  <p className="text-xs text-[#6B5D4E]">
                    Click any course card to launch its live 3D island diorama & inspect tiles, props, sightlines, and bounds.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={loadTodayDailySeed}
                    className="rounded-lg border border-[#D4C7B4] bg-white px-3 py-1.5 text-xs font-bold text-[#3D3329] hover:bg-[#EFE7DA]"
                  >
                    Inspect Daily UTC Seed
                  </button>
                  <button
                    type="button"
                    onClick={regenerate20RandomSeeds}
                    className="rounded-lg bg-[#2D8BE8] px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#2377CC]"
                  >
                    Roll 20 Fresh Random Seeds
                  </button>
                </div>
              </div>

              {/* Surface Legend */}
              <div className="flex flex-wrap items-center gap-4 text-[11px] font-semibold text-[#574A3D]">
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-xs bg-[#EFE5D5] ring-1 ring-[#C6B9A6]" />
                  Limestone Plaza
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-xs bg-[#484D56]" />
                  Asphalt Street
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-xs bg-[#8D95A2]" />
                  -0.06m Gutter Track
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-xs bg-[#E89D3C]" />
                  Ramp Approach
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-xs bg-[#C8674B]" />
                  Tier-2 (+1.35m) Terrace
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-xs bg-[#33C7CD]" />
                  Water Hazard
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-xs bg-[#3CC46D]" />
                  Emerald Cup Green
                </span>
              </div>

              {/* 20-Seed Thumbnail Matrix */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {matrixCourses.map((course) => (
                  <CourseMatrixThumbnail
                    key={course.seed}
                    course={course}
                    selected={course.seed === activeCourseSeed}
                    onSelect={() => {
                      setActiveCourseSeed(course.seed);
                      setTab('course');
                      setPresetCounter((c) => c + 1);
                    }}
                  />
                ))}
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
