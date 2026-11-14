'use client';

import '@/components/game/suppressThirdPartyWarnings';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import {
  BuildingFacadeModule,
  QA_FACADE_SAMPLES,
  type QaFacadeSample,
} from '@/components/world/architecture';
import {
  CornerBuildingAccentProp,
  PROP_QA_REGISTRY,
  PlacedPropRenderer,
  type CoaxialAxleIndicator,
  type PropQAGalleryEntry,
  type RenderablePropSpec,
} from '@/components/world/props';
import { PERIMETER_BUILDINGS } from '@/config/courseMasterPlan';
import type { PerimeterBuildingSpec } from '@/types/course';

type CameraPresetView = 'macro' | 'front' | 'side' | 'top';
type FilterCategory =
  | 'all'
  | 'hero-obstacle'
  | 'dynamic-hazard'
  | 'courtyard-furniture'
  | 'street-architecture'
  | 'facade';

interface UnifiedQaAsset {
  id: string;
  title: string;
  kind: 'prop' | 'facade';
  category: Exclude<FilterCategory, 'all'>;
  subtitle: string;
  description: string;
  localSize: [number, number, number];
  localBoundsMin: [number, number, number];
  localBoundsMax: [number, number, number];
  coaxialAxles: CoaxialAxleIndicator[];
  propEntry?: PropQAGalleryEntry;
  facadeSample?: QaFacadeSample;
}

const VALID_VIEWS: CameraPresetView[] = ['front', 'side', 'top', 'macro'];

const CATEGORY_TABS: Array<{ id: FilterCategory; label: string }> = [
  { id: 'all', label: 'All Assets' },
  { id: 'hero-obstacle', label: 'Hero Obstacles' },
  { id: 'dynamic-hazard', label: 'Dynamic Hazards' },
  { id: 'courtyard-furniture', label: 'Café & Corner' },
  { id: 'street-architecture', label: 'Street & Transit' },
  { id: 'facade', label: 'Facades' },
];

function buildUnifiedAssets(): UnifiedQaAsset[] {
  const propAssets: UnifiedQaAsset[] = PROP_QA_REGISTRY.map((entry) => ({
    id: entry.id,
    title: entry.title,
    kind: 'prop',
    category: entry.category,
    subtitle: entry.propType,
    description: entry.description,
    localSize: entry.localSize,
    localBoundsMin: entry.localBoundsMin,
    localBoundsMax: entry.localBoundsMax,
    coaxialAxles: entry.coaxialAxles,
    propEntry: entry,
  }));

  const featuredFacadeIds = new Set(QA_FACADE_SAMPLES.map((s) => s.id));
  const extraBuildings: QaFacadeSample[] = PERIMETER_BUILDINGS.filter(
    (b) => !featuredFacadeIds.has(b.id)
  ).map((b: PerimeterBuildingSpec) => {
    const w = b.boundsXZ.maxX - b.boundsXZ.minX;
    const d = b.boundsXZ.maxZ - b.boundsXZ.minZ;
    return {
      id: b.id,
      label: b.name,
      category: 'facade',
      summary: `${b.palette} ${b.stories}-story perimeter building (${b.frontFace} frontage).`,
      localSize: [w, b.height, d],
      recommendedCameraDistance: Math.max(18, Math.round(Math.max(w, d) * 1.45)),
      building: b,
    };
  });

  const facadeAssets: UnifiedQaAsset[] = [...QA_FACADE_SAMPLES, ...extraBuildings].map(
    (sample) => {
      const [w, h, d] = sample.localSize;
      return {
        id: sample.id,
        title: sample.label,
        kind: 'facade',
        category: 'facade',
        subtitle: `${sample.building.palette} · ${sample.building.stories}F`,
        description: sample.summary,
        localSize: sample.localSize,
        localBoundsMin: [-w * 0.5, 0, -d * 0.5],
        localBoundsMax: [w * 0.5, h, d * 0.5],
        coaxialAxles: [],
        facadeSample: sample,
      };
    }
  );

  return [...propAssets, ...facadeAssets];
}

const ALL_QA_ASSETS = buildUnifiedAssets();

function computePresetCamera(
  asset: UnifiedQaAsset,
  view: CameraPresetView
): { pos: [number, number, number]; target: [number, number, number] } {
  const [minX, minY, minZ] = asset.localBoundsMin;
  const [maxX, maxY, maxZ] = asset.localBoundsMax;
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.48;
  const cz = (minZ + maxZ) * 0.5;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const spanZ = maxZ - minZ;
  const maxSpan = Math.max(spanX, spanY, spanZ, 1.2);

  const dist =
    asset.kind === 'facade'
      ? Math.max(14, maxSpan * 1.38)
      : Math.max(2.3, maxSpan * 1.48);

  switch (view) {
    case 'front':
      return {
        pos: [cx, cy + spanY * 0.04, cz + dist],
        target: [cx, cy, cz],
      };
    case 'side':
      return {
        pos: [cx + dist, cy + spanY * 0.04, cz],
        target: [cx, cy, cz],
      };
    case 'top':
      return {
        pos: [cx, cy + Math.max(dist * 1.22, spanY + 1.6), cz + 0.02],
        target: [cx, minY + spanY * 0.25, cz],
      };
    case 'macro':
    default:
      return {
        pos: [cx + dist * 0.72, cy + dist * 0.42, cz + dist * 0.72],
        target: [cx, cy, cz],
      };
  }
}

function CameraPresetController({
  asset,
  view,
  resetTick,
  qaFreeze,
}: {
  asset: UnifiedQaAsset;
  view: CameraPresetView;
  resetTick: number;
  qaFreeze: boolean;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    const { pos, target } = computePresetCamera(asset, view);
    camera.position.set(pos[0], pos[1], pos[2]);
    if (controlsRef.current) {
      controlsRef.current.target.set(target[0], target[1], target[2]);
      controlsRef.current.update();
    } else {
      camera.lookAt(target[0], target[1], target[2]);
    }
  }, [asset, view, resetTick, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping={!qaFreeze}
      dampingFactor={0.08}
      minDistance={0.9}
      maxDistance={68}
      maxPolarAngle={Math.PI * 0.495}
    />
  );
}

function AabbAndAxleOverlay({
  asset,
  visible,
}: {
  asset: UnifiedQaAsset;
  visible: boolean;
}) {
  const [minX, minY, minZ] = asset.localBoundsMin;
  const [maxX, maxY, maxZ] = asset.localBoundsMax;
  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;

  const boxEdgesGeo = useMemo(() => {
    const box = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [sizeX, sizeY, sizeZ]);

  const groundRectGeo = useMemo(() => {
    const plane = new THREE.PlaneGeometry(sizeX, sizeZ);
    plane.rotateX(-Math.PI * 0.5);
    const edges = new THREE.EdgesGeometry(plane);
    plane.dispose();
    return edges;
  }, [sizeX, sizeZ]);

  const axleGeos = useMemo(() => {
    return asset.coaxialAxles.map((axle) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...axle.start),
        new THREE.Vector3(...axle.end),
      ]);
      return { label: axle.label, geo };
    });
  }, [asset.coaxialAxles]);

  useEffect(() => {
    return () => {
      boxEdgesGeo.dispose();
      groundRectGeo.dispose();
      axleGeos.forEach((a) => a.geo.dispose());
    };
  }, [boxEdgesGeo, groundRectGeo, axleGeos]);

  if (!visible) return null;

  return (
    <group name="qa-collider-and-datum-overlay">
      {/* Exact Local AABB Wireframe */}
      <lineSegments position={[cx, cy, cz]} geometry={boxEdgesGeo}>
        <lineBasicMaterial color="#00d8ff" />
      </lineSegments>

      {/* y = 0.00m Footprint Datum Perimeter */}
      <lineSegments position={[cx, 0.004, cz]} geometry={groundRectGeo}>
        <lineBasicMaterial color="#36ff7d" />
      </lineSegments>

      {/* Coaxial Axle Centerlines */}
      {axleGeos.map((axle, idx) => (
        <lineSegments key={`axle-${idx}`} geometry={axle.geo}>
          <lineBasicMaterial color="#ff3be0" />
        </lineSegments>
      ))}
    </group>
  );
}

function TurntableAssetStage({
  asset,
  autoTurntable,
  qaFreeze,
  showWireframe,
  lastActionAt,
  forceSteam,
  forceScatter,
  selectedClub,
}: {
  asset: UnifiedQaAsset;
  autoTurntable: boolean;
  qaFreeze: boolean;
  showWireframe: boolean;
  lastActionAt: number;
  forceSteam: boolean;
  forceScatter: boolean;
  selectedClub: 'driver' | 'wedge' | 'skimmer' | 'putter';
}) {
  const stageRef = useRef<THREE.Group>(null);
  const gridRef = useRef<THREE.GridHelper>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const mat of mats) {
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -1;
      mat.polygonOffsetUnits = -1;
      mat.depthWrite = false;
      mat.needsUpdate = true;
    }
  }, [asset.id]);

  useFrame((_, delta) => {
    if (!stageRef.current) return;
    if (qaFreeze) return;
    if (autoTurntable) {
      stageRef.current.rotation.y += Math.min(delta, 0.05) * 0.42;
    } else {
      stageRef.current.rotation.y = 0;
    }
  });

  const stageRadius =
    asset.kind === 'facade'
      ? Math.max(12, Math.max(asset.localSize[0], asset.localSize[2]) * 0.72)
      : Math.max(2.6, Math.max(asset.localSize[0], asset.localSize[2]) * 0.85);

  const syntheticProp = useMemo((): RenderablePropSpec => {
    if (asset.propEntry?.courseProp) {
      return {
        ...asset.propEntry.courseProp,
        position: [0, 0, 0],
        rotationY: 0,
      };
    }
    return {
      id: asset.id,
      type: asset.propEntry?.propType ?? 'brass_bollard',
      position: [0, 0, 0],
      rotationY: 0,
      localSize: [
        asset.localSize[0],
        asset.localSize[1],
        asset.localSize[2],
      ],
    };
  }, [asset]);

  return (
    <group>
      {/* y = 0.00m Reference Datum Turntable Disk with polygonOffset & slight recess to avoid z-fighting with y = 0 wheel contact patches */}
      <mesh receiveShadow position={[0, -0.044, 0]}>
        <cylinderGeometry args={[stageRadius, stageRadius + 0.16, 0.08, 32]} />
        <meshStandardMaterial
          color="#d8d1c2"
          roughness={0.85}
          polygonOffset
          polygonOffsetFactor={2}
          polygonOffsetUnits={2}
        />
      </mesh>

      {/* Measurement Grid Flush above datum disc without z-fighting */}
      <gridHelper
        ref={gridRef}
        args={[
          Math.ceil(stageRadius * 2),
          Math.max(8, Math.ceil(stageRadius * 2)),
          '#64748b',
          '#b6bec9',
        ]}
        position={[0, 0.0015, 0]}
      />

      {/* Rotating Turntable Subject Group */}
      <group ref={stageRef}>
        {asset.kind === 'facade' && asset.facadeSample ? (
          <BuildingFacadeModule
            building={asset.facadeSample.building}
            centered
            orientFrontToPlusZ
            showWireframe={showWireframe}
          />
        ) : asset.propEntry?.propType === 'corner_building_accent' ? (
          <CornerBuildingAccentProp
            position={[0, 0, 0]}
            rotationY={0}
            showWireframe={showWireframe}
          />
        ) : (
          <PlacedPropRenderer
            prop={syntheticProp}
            ballPosition={forceScatter ? [0.4, 0.04, 0.4] : undefined}
            selectedClub={selectedClub}
            lastUmbrellaHitAt={lastActionAt}
            lastHydrantSurfAt={lastActionAt}
            lastFountainSplashAt={lastActionAt}
            lastVanRoofHitAt={lastActionAt}
            showWireframe={showWireframe}
            isStandaloneQA
          />
        )}

        {/* Force Steam / Scatter Preview Badge Light when active */}
        {forceSteam && asset.propEntry?.propType === 'subway_steam_grate' && (
          <pointLight
            position={[0, 0.5, 0]}
            color="#ffcb7a"
            intensity={1.5}
            distance={4}
          />
        )}

        <AabbAndAxleOverlay asset={asset} visible={showWireframe} />
      </group>
    </group>
  );
}

export function QaGalleryStudio() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const urlAssetId = searchParams.get('asset');
  const urlViewRaw = searchParams.get('view');
  const urlWireframeRaw = searchParams.get('wireframe');
  const qaFreeze = searchParams.get('qaFreezeParticles') === '1';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { __CURBSIDE_QA_FREEZE__?: boolean };
    if (qaFreeze) {
      w.__CURBSIDE_QA_FREEZE__ = true;
    }
    return () => {
      if (qaFreeze && w.__CURBSIDE_QA_FREEZE__ === true) {
        delete w.__CURBSIDE_QA_FREEZE__;
      }
    };
  }, [qaFreeze]);

  const initialAsset =
    ALL_QA_ASSETS.find((a) => a.id === urlAssetId) ?? ALL_QA_ASSETS[0]!;
  const initialView: CameraPresetView = VALID_VIEWS.includes(
    urlViewRaw as CameraPresetView
  )
    ? (urlViewRaw as CameraPresetView)
    : 'macro';
  const initialWireframe =
    urlWireframeRaw === '1' || urlWireframeRaw === 'true';

  const [selectedId, setSelectedId] = useState<string>(initialAsset.id);
  const [view, setView] = useState<CameraPresetView>(initialView);
  const [showWireframe, setShowWireframe] = useState<boolean>(initialWireframe);
  const [autoTurntable, setAutoTurntable] = useState<boolean>(false);
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [resetTick, setResetTick] = useState<number>(0);
  const [lastActionAt, setLastActionAt] = useState<number>(-10);
  const [forceScatter, setForceScatter] = useState<boolean>(false);
  const [forceSteam, setForceSteam] = useState<boolean>(false);
  const [selectedClub, setSelectedClub] = useState<
    'driver' | 'wedge' | 'skimmer' | 'putter'
  >('driver');

  // Keep local state synchronized if URL query parameters change externally
  useEffect(() => {
    if (urlAssetId) {
      const found = ALL_QA_ASSETS.find((a) => a.id === urlAssetId);
      if (found) setSelectedId(found.id);
    }
    if (urlViewRaw && VALID_VIEWS.includes(urlViewRaw as CameraPresetView)) {
      setView(urlViewRaw as CameraPresetView);
    }
    if (urlWireframeRaw !== null) {
      setShowWireframe(urlWireframeRaw === '1' || urlWireframeRaw === 'true');
    }
  }, [urlAssetId, urlViewRaw, urlWireframeRaw]);

  const syncQuery = useCallback(
    (nextId: string, nextView: CameraPresetView, nextWire: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('asset', nextId);
      params.set('view', nextView);
      params.set('wireframe', nextWire ? '1' : '0');
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const selectedAsset = useMemo(
    () =>
      ALL_QA_ASSETS.find((a) => a.id === selectedId) ?? ALL_QA_ASSETS[0]!,
    [selectedId]
  );

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ALL_QA_ASSETS.filter((asset) => {
      if (categoryFilter !== 'all' && asset.category !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        asset.id.toLowerCase().includes(q) ||
        asset.title.toLowerCase().includes(q) ||
        asset.subtitle.toLowerCase().includes(q)
      );
    });
  }, [categoryFilter, searchQuery]);

  const handleSelectAsset = (id: string) => {
    setSelectedId(id);
    setForceScatter(false);
    setForceSteam(false);
    syncQuery(id, view, showWireframe);
  };

  const handleSelectView = (nextView: CameraPresetView) => {
    setView(nextView);
    setAutoTurntable(false);
    setResetTick((n) => n + 1);
    syncQuery(selectedId, nextView, showWireframe);
  };

  const handleToggleWireframe = () => {
    const next = !showWireframe;
    setShowWireframe(next);
    syncQuery(selectedId, view, next);
  };

  const courseProp = selectedAsset.propEntry?.courseProp;

  return (
    <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#0f1722] text-slate-100 lg:flex-row">
      {/* Asset Selector Sidebar (Bottom Drawer on Mobile, Left Sidebar on Desktop) */}
      <aside className="order-2 flex h-[26dvh] min-h-[188px] w-full shrink-0 flex-col border-t border-slate-800 bg-[#131c29] lg:order-1 lg:h-full lg:w-80 lg:border-t-0 lg:border-r">
        <div className="border-b border-slate-800 px-3 py-2 lg:px-4 lg:py-3">
          <div className="hidden items-center justify-between lg:flex">
            <span className="text-[11px] font-bold tracking-wider text-amber-400 uppercase">
              Curbside Links QA Studio
            </span>
            <Link
              href="/"
              className="rounded border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
            >
              Play Hole 1
            </Link>
          </div>
          <h1 className="mt-1 hidden text-base font-bold text-white lg:block">
            4-Angle Macro Turntable
          </h1>
          <p className="hidden text-xs text-slate-400 lg:block">
            {PROP_QA_REGISTRY.length} Props &amp;{' '}
            {ALL_QA_ASSETS.length - PROP_QA_REGISTRY.length} Facade Modules
          </p>

          <div className="flex items-center gap-2 lg:mt-2.5 lg:block">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter assets by id or name..."
              className="w-full rounded-md border border-slate-700 bg-[#0d141e] px-2.5 py-1 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-400 focus:outline-none lg:py-1.5"
            />
            <span className="shrink-0 font-mono text-[10px] text-slate-400 lg:hidden">
              {filteredAssets.length}/{ALL_QA_ASSETS.length}
            </span>
          </div>

          <div className="mt-1.5 flex gap-1 overflow-x-auto pb-0.5 lg:mt-2 lg:flex-wrap lg:overflow-visible lg:pb-0">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategoryFilter(tab.id)}
                className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                  categoryFilter === tab.id
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid flex-1 grid-cols-2 content-start gap-1.5 overflow-y-auto p-2 lg:flex lg:flex-col lg:gap-0 lg:space-y-1 lg:p-2.5">
          {filteredAssets.map((asset) => {
            const active = asset.id === selectedAsset.id;
            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => handleSelectAsset(asset.id)}
                className={`w-full rounded-lg border px-2 py-1.5 text-left transition lg:px-2.5 lg:py-2 ${
                  active
                    ? 'border-amber-400/90 bg-amber-400/15 text-white'
                    : 'border-slate-800/80 bg-[#172233] text-slate-300 hover:border-slate-600 hover:bg-[#1b283b]'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="truncate text-[11px] font-semibold lg:text-xs">
                    {asset.title}
                  </span>
                  <span className="shrink-0 rounded bg-slate-900/80 px-1 py-0.5 font-mono text-[9px] text-slate-400 lg:px-1.5 lg:text-[10px]">
                    {asset.kind === 'facade' ? 'FACADE' : 'PROP'}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between font-mono text-[9px] text-slate-400 lg:text-[10px]">
                  <span className="truncate">{asset.id}</span>
                  <span className="hidden sm:inline">
                    {asset.localSize[0].toFixed(1)}×
                    {asset.localSize[1].toFixed(1)}×
                    {asset.localSize[2].toFixed(1)}m
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main 3D Viewport & Controls */}
      <main className="order-1 relative flex min-h-0 min-w-0 flex-1 flex-col lg:order-2">
        {/* Top Toolbar */}
        <header className="flex flex-col gap-1.5 border-b border-slate-800 bg-[#131c29]/95 px-2.5 py-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-3 lg:px-4 lg:py-2.5">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5 lg:gap-2">
                <h2 className="truncate text-xs font-bold text-white lg:text-sm">
                  {selectedAsset.title}
                </h2>
                <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-amber-300 lg:px-2 lg:text-[11px]">
                  {selectedAsset.id}
                </span>
              </div>
              <Link
                href="/"
                className="shrink-0 rounded border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] font-medium text-slate-200 hover:bg-slate-700 lg:hidden"
              >
                Play
              </Link>
            </div>
            <p className="mt-0.5 hidden max-w-2xl truncate text-xs text-slate-400 sm:block">
              {selectedAsset.description}
            </p>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 lg:flex-wrap lg:gap-2 lg:overflow-visible lg:pb-0">
            {/* 4-Angle Camera Presets */}
            <div className="flex shrink-0 rounded-lg border border-slate-700 bg-[#0d141e] p-0.5">
              {(
                [
                  ['front', 'Front'],
                  ['side', 'Side'],
                  ['top', 'Top'],
                  ['macro', 'Macro 3/4'],
                ] as Array<[CameraPresetView, string]>
              ).map(([presetId, label]) => (
                <button
                  key={presetId}
                  type="button"
                  data-testid={`qa-view-${presetId}`}
                  onClick={() => handleSelectView(presetId)}
                  className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold transition lg:px-2.5 lg:text-xs ${
                    view === presetId
                      ? 'bg-sky-400 text-slate-950'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Collider / AABB / Coaxial Axle Wireframe Toggle */}
            <button
              type="button"
              data-testid="qa-wireframe-toggle"
              onClick={handleToggleWireframe}
              className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition lg:px-3 lg:py-1.5 lg:text-xs ${
                showWireframe
                  ? 'border-cyan-400 bg-cyan-400/20 text-cyan-200'
                  : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Wireframe: {showWireframe ? 'ON' : 'OFF'}
            </button>

            {/* Auto-Turntable Toggle */}
            <button
              type="button"
              data-testid="qa-turntable-toggle"
              onClick={() => setAutoTurntable((v) => !v)}
              className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition lg:px-3 lg:py-1.5 lg:text-xs ${
                autoTurntable
                  ? 'border-emerald-400 bg-emerald-400/20 text-emerald-200'
                  : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Turntable: {autoTurntable ? 'ON' : 'OFF'}
            </button>

            {/* Interactive Trigger Button */}
            {selectedAsset.kind === 'prop' && (
              <button
                type="button"
                onClick={() => {
                  setLastActionAt(performance.now() * 0.001);
                  if (selectedAsset.propEntry?.propType === 'pigeon_flock') {
                    setForceScatter((s) => !s);
                  }
                  if (
                    selectedAsset.propEntry?.propType === 'subway_steam_grate'
                  ) {
                    setForceSteam((s) => !s);
                  }
                }}
                className="shrink-0 rounded-lg border border-amber-500/60 bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/30 lg:px-3 lg:py-1.5 lg:text-xs"
              >
                Trigger Anim
              </button>
            )}
          </div>
        </header>

        {/* R3F 3D Canvas */}
        <div className="relative min-h-0 flex-1 bg-[#a8daf2]">
          <Canvas
            shadows={{ type: THREE.PCFShadowMap }}
            dpr={[1.5, 2]}
            camera={{ fov: 40, near: 0.25, far: 120, position: [5, 3, 5] }}
            gl={{
              antialias: true,
              powerPreference: 'high-performance',
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.05,
            }}
          >
            <color attach="background" args={['#b3e2f7']} />
            <ambientLight intensity={0.72} color="#fff7eb" />
            <hemisphereLight
              args={['#dff4ff', '#d4bfa6', 0.55]}
              position={[0, 20, 0]}
            />
            <directionalLight
              castShadow
              position={[12, 20, 14]}
              intensity={1.55}
              color="#fff4db"
              shadow-mapSize-width={2048}
              shadow-mapSize-height={2048}
              shadow-camera-near={2}
              shadow-camera-far={65}
              shadow-camera-left={-18}
              shadow-camera-right={18}
              shadow-camera-top={18}
              shadow-camera-bottom={-18}
              shadow-bias={-0.0004}
              shadow-normalBias={0.035}
            />
            <directionalLight
              position={[-10, 8, -12]}
              intensity={0.42}
              color="#b5e3ff"
            />

            <TurntableAssetStage
              asset={selectedAsset}
              autoTurntable={autoTurntable}
              qaFreeze={qaFreeze}
              showWireframe={showWireframe}
              lastActionAt={lastActionAt}
              forceSteam={forceSteam}
              forceScatter={forceScatter}
              selectedClub={selectedClub}
            />

            <CameraPresetController
              asset={selectedAsset}
              view={view}
              resetTick={resetTick}
              qaFreeze={qaFreeze}
            />
          </Canvas>

          {/* Bottom-Left Engineering Inspection HUD */}
          <div className="pointer-events-none absolute bottom-2 left-2 max-w-[245px] rounded-xl border border-slate-800/80 bg-[#0e1520]/85 p-2 text-[10px] text-slate-200 shadow-lg backdrop-blur sm:bottom-4 sm:left-4 sm:max-w-md sm:p-3 sm:text-xs">
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px] sm:gap-x-4 sm:gap-y-1 sm:text-[11px]">
              <span className="text-slate-400">Local Size:</span>
              <span>
                {selectedAsset.localSize[0].toFixed(2)}m ×{' '}
                {selectedAsset.localSize[1].toFixed(2)}m ×{' '}
                {selectedAsset.localSize[2].toFixed(2)}m
              </span>
              <span className="text-slate-400">Ground Datum:</span>
              <span className="text-emerald-300">
                y = 0.00m (World {courseProp ? `${courseProp.position[1].toFixed(2)}m` : 'Stage'})
              </span>
              <span className="text-slate-400">Coaxial Axes:</span>
              <span className="text-fuchsia-300">
                {selectedAsset.coaxialAxles.length > 0
                  ? `${selectedAsset.coaxialAxles.length} Verified`
                  : 'Standard / Planar'}
              </span>
            </div>

            {courseProp?.hotdogAwningMeta && (
              <p className="mt-1 font-mono text-[10px] text-amber-300 sm:mt-1.5 sm:text-[11px]">
                Awning: {courseProp.hotdogAwningMeta.pitchDeg}° pitch ·{' '}
                restitution {courseProp.hotdogAwningMeta.restitution}
              </p>
            )}
            {courseProp?.vanRampMeta && (
              <p className="mt-1 font-mono text-[10px] text-amber-300 sm:mt-1.5 sm:text-[11px]">
                Loading Ramp: {courseProp.vanRampMeta.rampLaunchAngleDeg.toFixed(2)}° slope ·{' '}
                roof {courseProp.vanRampMeta.roofDeckTopY.toFixed(2)}m
              </p>
            )}
            {courseProp?.scaffoldingMeta && (
              <p className="mt-1 font-mono text-[10px] text-amber-300 sm:mt-1.5 sm:text-[11px]">
                Scaffolding: {courseProp.scaffoldingMeta.clearHeightMeters.toFixed(2)}m clear ·{' '}
                {courseProp.scaffoldingMeta.wallGapMeters.toFixed(2)}m wall gap
              </p>
            )}
            {courseProp?.steamLiftMeta && (
              <p className="mt-1 font-mono text-[10px] text-amber-300 sm:mt-1.5 sm:text-[11px]">
                Steam Cycle: {courseProp.steamLiftMeta.activeSeconds}s on /{' '}
                {courseProp.steamLiftMeta.cycleSeconds}s period
              </p>
            )}
            {selectedAsset.propEntry?.propType === 'golf_bag_tee' && (
              <div className="pointer-events-auto mt-1.5 flex items-center gap-1 sm:mt-2 sm:gap-1.5">
                <span className="text-[10px] text-slate-400 sm:text-[11px]">Equipped:</span>
                {(['driver', 'wedge', 'skimmer', 'putter'] as const).map(
                  (club) => (
                    <button
                      key={club}
                      type="button"
                      onClick={() => setSelectedClub(club)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize ${
                        selectedClub === club
                          ? 'bg-emerald-400 text-slate-950'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {club}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* Wireframe Color Key */}
          {showWireframe && (
            <div className="pointer-events-none absolute top-2 right-2 rounded-xl border border-slate-800/80 bg-[#0e1520]/85 px-2 py-1.5 font-mono text-[9px] text-slate-200 shadow-lg backdrop-blur sm:top-auto sm:right-4 sm:bottom-4 sm:px-3 sm:py-2 sm:text-[11px]">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="inline-block h-2 w-3 bg-[#00d8ff]" />
                <span>Local AABB Bounds</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 sm:gap-2">
                <span className="inline-block h-2 w-3 bg-[#36ff7d]" />
                <span>y = 0.00m Ground Datum</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 sm:gap-2">
                <span className="inline-block h-2 w-3 bg-[#ff3be0]" />
                <span>Coaxial Axle / Symmetry Axis</span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
