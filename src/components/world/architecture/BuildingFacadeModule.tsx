'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import {
  buildArchedFrameSpec,
  buildPitchedAwningSpec,
} from '@/lib/geometryHelpers';
import {
  getBuildingTrimMaterial,
  getBuildingWallMaterial,
  getCachedMatteMaterial,
  TOYBOX_MATERIALS,
  VENICE_MATERIALS,
} from '@/materials';
import {
  ELEVATIONS,
  type CardinalDirection,
  type PerimeterBuildingSpec,
} from '@/types';

export interface BuildingFacadeModuleProps {
  building: PerimeterBuildingSpec;
  /** Render centered at local [0, 0, 0] for solo QA turntable inspection (default true). */
  centered?: boolean;
  /** Rotate centered solo building so its primary frontFace points along +Z toward Front camera. */
  orientFrontToPlusZ?: boolean;
  /** Show AABB wireframe overlay for QA inspection. */
  showWireframe?: boolean;
}

/**
 * Anti-shimmer decal materials: local clones of shared '@/materials' entries carrying
 * polygonOffset (tier 1 = -1/-1, tier 2 = -2/-2). Shared materials are never mutated.
 */
const DECAL_MAT_CACHE = new WeakMap<THREE.Material, Partial<Record<1 | 2, THREE.Material>>>();
function decalMat(base: THREE.Material, tier: 1 | 2 = 1): THREE.Material {
  let entry = DECAL_MAT_CACHE.get(base);
  if (!entry) {
    entry = {};
    DECAL_MAT_CACHE.set(base, entry);
  }
  let hit = entry[tier];
  if (!hit) {
    hit = base.clone();
    hit.polygonOffset = true;
    hit.polygonOffsetFactor = -tier;
    hit.polygonOffsetUnits = -tier;
    entry[tier] = hit;
  }
  return hit;
}

function hashStr(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/**
 * Computes a clean, watertight 4-slope faceted Venetian hipped roof BufferGeometry
 * spanning [-widthX/2..+widthX/2, 0..rise, -depthZ/2..+depthZ/2].
 */
function buildHippedRoofGeometry(
  widthX: number,
  depthZ: number,
  rise: number,
): THREE.BufferGeometry {
  const hw = widthX * 0.5;
  const hd = depthZ * 0.5;

  const p0: [number, number, number] = [-hw, 0, hd]; // SW
  const p1: [number, number, number] = [hw, 0, hd]; // SE
  const p2: [number, number, number] = [hw, 0, -hd]; // NE
  const p3: [number, number, number] = [-hw, 0, -hd]; // NW

  let rA: [number, number, number];
  let rB: [number, number, number];

  if (widthX >= depthZ) {
    const rHalf = Math.max(0.15, (widthX - depthZ) * 0.45);
    rA = [-rHalf, rise, 0];
    rB = [rHalf, rise, 0];
  } else {
    const rHalf = Math.max(0.15, (depthZ - widthX) * 0.45);
    rA = [0, rise, rHalf];
    rB = [0, rise, -rHalf];
  }

  const positions: number[] = [];
  const uvs: number[] = [];

  const pushTri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
  ) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    // Planar roof UVs scaled cleanly in meters (~1.6m per tile repeat)
    const uvScale = 0.62;
    uvs.push(
      (a[0] + a[2] * 0.35) * uvScale,
      (a[1] * 1.4 + Math.hypot(a[0], a[2]) * 0.3) * uvScale,
      (b[0] + b[2] * 0.35) * uvScale,
      (b[1] * 1.4 + Math.hypot(b[0], b[2]) * 0.3) * uvScale,
      (c[0] + c[2] * 0.35) * uvScale,
      (c[1] * 1.4 + Math.hypot(c[0], c[2]) * 0.3) * uvScale,
    );
  };

  if (widthX >= depthZ) {
    // South slope (CCW from outside)
    pushTri(p0, p1, rB);
    pushTri(p0, rB, rA);
    // East hip triangle
    pushTri(p1, p2, rB);
    // North slope
    pushTri(p2, p3, rA);
    pushTri(p2, rA, rB);
    // West hip triangle
    pushTri(p3, p0, rA);
  } else {
    // South hip triangle
    pushTri(p0, p1, rA);
    // East slope
    pushTri(p1, p2, rB);
    pushTri(p1, rB, rA);
    // North hip triangle
    pushTri(p2, p3, rB);
    // West slope
    pushTri(p3, p0, rA);
    pushTri(p3, rA, rB);
  }

  // Bottom cap (facing -Y)
  pushTri(p0, p3, p2);
  pushTri(p0, p2, p1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a sloped 4-sided mansard frustum roof Geometry.
 */
function buildMansardRoofGeometry(
  widthX: number,
  depthZ: number,
  rise: number,
  inset = 0.75,
): THREE.BufferGeometry {
  const hw = widthX * 0.5;
  const hd = depthZ * 0.5;
  const thw = Math.max(0.4, hw - inset);
  const thd = Math.max(0.4, hd - inset);

  const b0: [number, number, number] = [-hw, 0, hd];
  const b1: [number, number, number] = [hw, 0, hd];
  const b2: [number, number, number] = [hw, 0, -hd];
  const b3: [number, number, number] = [-hw, 0, -hd];

  const t0: [number, number, number] = [-thw, rise, thd];
  const t1: [number, number, number] = [thw, rise, thd];
  const t2: [number, number, number] = [thw, rise, -thd];
  const t3: [number, number, number] = [-thw, rise, -thd];

  const positions: number[] = [];
  const pushQuad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
  ) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    positions.push(a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  };

  pushQuad(b0, b1, t1, t0);
  pushQuad(b1, b2, t2, t1);
  pushQuad(b2, b3, t3, t2);
  pushQuad(b3, b0, t0, t3);
  pushQuad(t0, t1, t2, t3);
  pushQuad(b0, b3, b2, b1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

interface ExposedFaceConfig {
  face: CardinalDirection;
  /** Span range in face-local horizontal coordinate U (centered on face midpoint = 0) */
  uMin: number;
  uMax: number;
  isPrimaryStreetFront: boolean;
  effectiveStreetY: number;
}

function getFaceTransform(
  face: CardinalDirection,
  widthX: number,
  depthZ: number,
): { pos: [number, number, number]; rotY: number; fullSpan: number } {
  switch (face) {
    case 'south':
      return { pos: [0, 0, depthZ * 0.5], rotY: 0, fullSpan: widthX };
    case 'north':
      return { pos: [0, 0, -depthZ * 0.5], rotY: Math.PI, fullSpan: widthX };
    case 'east':
      return { pos: [widthX * 0.5, 0, 0], rotY: Math.PI * 0.5, fullSpan: depthZ };
    case 'west':
      return { pos: [-widthX * 0.5, 0, 0], rotY: -Math.PI * 0.5, fullSpan: depthZ };
  }
}

/**
 * Determines which outer street/courtyard faces of a building are exposed to playfield
 * sightlines and their unobstructed horizontal [uMin, uMax] frontage intervals.
 */
function resolveExposedFaces(building: PerimeterBuildingSpec): ExposedFaceConfig[] {
  const widthX = building.boundsXZ.maxX - building.boundsXZ.minX;
  const depthZ = building.boundsXZ.maxZ - building.boundsXZ.minZ;
  const isCourtyard =
    building.corridorSector === 'north_courtyard' ||
    building.corridorSector === 'east_courtyard_backstop' ||
    building.corridorSector === 'south_courtyard';
  const streetY = isCourtyard ? ELEVATIONS.COURTYARD_GREEN_Y : ELEVATIONS.SIDEWALK_Y;

  const { fullSpan } = getFaceTransform(building.frontFace, widthX, depthZ);
  let uMin = -fullSpan * 0.5;
  let uMax = fullSpan * 0.5;

  // Clip corner-locked overlapping wall segments so awnings/balconies never clip into adjoining buildings
  if (building.id === 'bld-south-1') {
    // North face (-Z): local +U points West (-X). Exposed world X: [-7.25 .. 0.0]
    uMin = -fullSpan * 0.5;
    uMax = -fullSpan * 0.5 + 7.25;
  } else if (building.id === 'bld-south-2') {
    // North face (-Z): local +U points West (-X). Exposed world X: [0.0 .. +7.25]
    uMin = fullSpan * 0.5 - 7.25;
    uMax = fullSpan * 0.5;
  } else if (building.id === 'bld-west-5-nw-corner') {
    // East face (+X): local +U points North (-Z). Exposed world Z: [-29.25 .. -22.0]
    uMin = -fullSpan * 0.5;
    uMax = -fullSpan * 0.5 + 7.25;
  } else if (building.id === 'bld-south-courtyard-1') {
    // North face (-Z): local +U points West (-X). Exposed world X: [19.0 .. 33.5]
    uMin = fullSpan * 0.5 - 14.5;
    uMax = fullSpan * 0.5;
  }

  const faces: ExposedFaceConfig[] = [
    {
      face: building.frontFace,
      uMin,
      uMax,
      isPrimaryStreetFront: true,
      effectiveStreetY: streetY,
    },
  ];

  // Dual-frontage corner buildings get complete storefront + window detailing on their secondary exposed street face!
  if (building.id === 'bld-se-corner-bodega') {
    // North face (-Z) overlooks the Hotdog Vendor Corner Plaza & Mercer Approach!
    faces.push({
      face: 'north',
      uMin: -widthX * 0.5,
      uMax: widthX * 0.5,
      isPrimaryStreetFront: true,
      effectiveStreetY: ELEVATIONS.SIDEWALK_Y,
    });
  } else if (building.id === 'bld-west-5-nw-corner') {
    // South end meets bld-west-4; North face is outer perimeter, no extra street face needed.
  }

  return faces;
}

function WindowUnit({
  width,
  jambHeight,
  hasShutters,
  shutterMat,
  trimMat,
  isWarmLit,
  isArched,
}: {
  width: number;
  jambHeight: number;
  hasShutters: boolean;
  shutterMat: THREE.Material;
  trimMat: THREE.Material;
  isWarmLit: boolean;
  isArched: boolean;
}) {
  const frameSpec = useMemo(
    () =>
      buildArchedFrameSpec({
        openingWidth: width,
        jambHeight,
        frameWidth: 0.11,
        frameDepth: 0.09,
        sillHeight: 0.09,
        archSegments: isArched ? 7 : 5,
        includeShutters: hasShutters,
      }),
    [width, jambHeight, hasShutters, isArched],
  );

  const glassMat = isWarmLit
    ? VENICE_MATERIALS.windowWarmLit
    : VENICE_MATERIALS.windowDarkGlass;

  const glassH = isArched
    ? jambHeight + frameSpec.archInnerRadius * 0.86
    : jambHeight;
  // Glass is overlapped 1.5cm into sill/jambs/lintel so no two faces share a plane.
  const glassBottomY = 0.075;
  const glassTopY = 0.09 + glassH + 0.02;
  const mullionMat = decalMat(VENICE_MATERIALS.storefrontTimber, 1);
  const muntinMat = decalMat(VENICE_MATERIALS.storefrontTimber, 2);
  const slatMat = decalMat(VENICE_MATERIALS.shutterEspresso, 1);

  return (
    <group>
      {/* Stone Window Sill */}
      <mesh
        castShadow
        receiveShadow
        position={frameSpec.sill.position}
        material={trimMat}
      >
        <boxGeometry args={frameSpec.sill.size} />
      </mesh>

      {/* Left & Right Jamb Moldings */}
      <mesh
        castShadow
        position={frameSpec.leftJamb.position}
        material={trimMat}
      >
        <boxGeometry args={frameSpec.leftJamb.size} />
      </mesh>
      <mesh
        castShadow
        position={frameSpec.rightJamb.position}
        material={trimMat}
      >
        <boxGeometry args={frameSpec.rightJamb.size} />
      </mesh>

      {/* Top Arch Voussoirs OR Flat Lintel */}
      {isArched ? (
        frameSpec.archRingSegments.map((seg) => (
          <mesh
            key={seg.index}
            castShadow
            position={seg.position}
            rotation={seg.rotation}
            material={trimMat}
          >
            <boxGeometry args={seg.size} />
          </mesh>
        ))
      ) : (
        <mesh
          castShadow
          position={[0, 0.09 + jambHeight + 0.065, 0.055]}
          material={trimMat}
        >
          <boxGeometry args={[width + 0.3, 0.13, 0.12]} />
        </mesh>
      )}

      {/* Recessed Glass Plane + Crisp Muntin Sash Bars */}
      <mesh
        position={[0, (glassBottomY + glassTopY) * 0.5, 0.015]}
        material={glassMat}
      >
        <boxGeometry args={[width + 0.03, glassTopY - glassBottomY, 0.025]} />
      </mesh>
      <mesh
        position={[0, 0.09 + glassH * 0.5, 0.037]}
        material={mullionMat}
      >
        <boxGeometry args={[0.04, glassH, 0.03]} />
      </mesh>
      <mesh
        position={[0, 0.09 + jambHeight * 0.54, 0.044]}
        material={muntinMat}
      >
        <boxGeometry args={[width + 0.04, 0.04, 0.03]} />
      </mesh>

      {/* Louvered Venetian Shutters */}
      {frameSpec.shutters.map((sh) => (
        <group
          key={sh.side}
          position={sh.position}
          rotation={sh.rotation}
        >
          <mesh material={shutterMat}>
            <boxGeometry args={sh.size} />
          </mesh>
          {/* Louvered horizontal slat accents */}
          {[-0.36, -0.12, 0.12, 0.36].map((sy, idx) => (
            <mesh
              key={idx}
              position={[0, sy * sh.size[1], 0.028]}
              material={slatMat}
            >
              <boxGeometry args={[sh.size[0] * 0.78, 0.036, 0.024]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function JulietBalcony({
  width,
  trimMat,
  useWroughtIron,
  hasFlowerBox,
}: {
  width: number;
  trimMat: THREE.Material;
  useWroughtIron: boolean;
  hasFlowerBox: boolean;
}) {
  const deckW = width + 0.36;
  const deckD = 0.52;
  const railH = 0.74;
  const picketCount = Math.max(5, Math.round(deckW / 0.18));

  return (
    <group>
      {/* Stone Balcony Deck Slab */}
      <mesh
        castShadow
        receiveShadow
        position={[0, -0.04, deckD * 0.5 - 0.01]}
        material={trimMat}
      >
        <boxGeometry args={[deckW, 0.1, deckD + 0.02]} />
      </mesh>

      {/* Twin Carved Corbel Brackets Underneath */}
      {[-deckW * 0.36, deckW * 0.36].map((bx, idx) => (
        <group key={idx} position={[bx, -0.18, deckD * 0.38]}>
          <mesh castShadow material={trimMat}>
            <boxGeometry args={[0.14, 0.2, deckD * 0.72]} />
          </mesh>
          <mesh
            castShadow
            position={[0, -0.11, -0.06]}
            material={trimMat}
          >
            <boxGeometry args={[0.12, 0.12, deckD * 0.42]} />
          </mesh>
        </group>
      ))}

      {/* Baluster or Wrought-Iron Railing */}
      <mesh
        position={[0, railH, deckD - 0.04]}
        material={useWroughtIron ? VENICE_MATERIALS.wroughtIron : trimMat}
      >
        <boxGeometry args={[deckW * 0.96, 0.06, 0.07]} />
      </mesh>
      {[-deckW * 0.48, deckW * 0.48].map((sx, idx) => (
        <mesh
          key={`side-rail-${idx}`}
          position={[sx, railH - 0.02, deckD * 0.5 - 0.01]}
          material={useWroughtIron ? VENICE_MATERIALS.wroughtIron : trimMat}
        >
          <boxGeometry args={[0.06, 0.06, deckD + 0.02]} />
        </mesh>
      ))}

      {Array.from({ length: picketCount }, (_, idx) => {
        const px =
          -deckW * 0.44 + (idx / Math.max(1, picketCount - 1)) * (deckW * 0.88);
        return (
          <mesh
            key={`p-${idx}`}
            position={[px, railH * 0.5, deckD - 0.04]}
            material={useWroughtIron ? VENICE_MATERIALS.wroughtIron : trimMat}
          >
            <boxGeometry
              args={
                useWroughtIron
                  ? [0.036, railH, 0.036]
                  : [0.075, railH, 0.075]
              }
            />
          </mesh>
        );
      })}

      {/* Terracotta Flower Box on Select Balconies */}
      {hasFlowerBox && (
        <group position={[0, 0.08, deckD + 0.04]}>
          <mesh castShadow material={VENICE_MATERIALS.flowerBoxClay}>
            <boxGeometry args={[deckW * 0.62, 0.16, 0.18]} />
          </mesh>
          {[-0.28, -0.1, 0.1, 0.28].map((fx, i) => (
            <group key={i} position={[fx * deckW * 0.65, 0.12, 0]}>
              <mesh material={VENICE_MATERIALS.pergolaVineLeaf}>
                <dodecahedronGeometry args={[0.11, 0]} />
              </mesh>
              <mesh
                position={[0, 0.08, 0.03]}
                material={
                  i % 2 === 0
                    ? VENICE_MATERIALS.flowerBoxBlossomCoral
                    : VENICE_MATERIALS.flowerBoxBlossomGold
                }
              >
                <octahedronGeometry args={[0.055, 0]} />
              </mesh>
            </group>
          ))}
        </group>
      )}
    </group>
  );
}

function StorefrontBay({
  bayWidth,
  isDoorBay,
  awningHex,
  trimMat,
  suppressProtrusions,
}: {
  bayWidth: number;
  isDoorBay: boolean;
  awningHex?: string;
  trimMat: THREE.Material;
  suppressProtrusions: boolean;
}) {
  const frameSpec = useMemo(
    () =>
      buildArchedFrameSpec({
        openingWidth: Math.min(2.1, bayWidth * 0.72),
        jambHeight: 2.0,
        frameWidth: 0.14,
        frameDepth: suppressProtrusions ? 0.04 : 0.1,
        sillHeight: isDoorBay ? 0.04 : 0.42,
        archSegments: 7,
        includeShutters: false,
      }),
    [bayWidth, isDoorBay, suppressProtrusions],
  );

  const awningSpec = useMemo(() => {
    if (!awningHex || suppressProtrusions) return null;
    return buildPitchedAwningSpec({
      width: Math.min(2.6, bayWidth * 0.88),
      slopedDepth: 0.92,
      centerY: 2.65,
      pitchDeg: 28,
      stripeCount: 7,
      mountBottomY: 2.35,
    });
  }, [awningHex, bayWidth, suppressProtrusions]);

  const awningPrimaryMat = awningHex
    ? getCachedMatteMaterial(awningHex, 0.78, 0.02)
    : VENICE_MATERIALS.stuccoTerracotta;

  const openingW = Math.min(2.1, bayWidth * 0.72);

  return (
    <group>
      {/* Stone Pilaster Columns Flanking Bay */}
      {[-bayWidth * 0.45, bayWidth * 0.45].map((px, idx) => (
        <mesh
          key={`pilaster-${idx}`}
          castShadow
          receiveShadow
          position={[px, 1.55, suppressProtrusions ? 0.02 : 0.0475]}
          material={trimMat}
        >
          <boxGeometry args={[0.18, 3.1, suppressProtrusions ? 0.06 : 0.135]} />
        </mesh>
      ))}

      {/* Arched Shopfront Surround */}
      <mesh
        castShadow
        position={frameSpec.sill.position}
        material={trimMat}
      >
        <boxGeometry args={frameSpec.sill.size} />
      </mesh>
      <mesh
        castShadow
        position={frameSpec.leftJamb.position}
        material={trimMat}
      >
        <boxGeometry args={frameSpec.leftJamb.size} />
      </mesh>
      <mesh
        castShadow
        position={frameSpec.rightJamb.position}
        material={trimMat}
      >
        <boxGeometry args={frameSpec.rightJamb.size} />
      </mesh>
      {frameSpec.archRingSegments.map((seg) => (
        <mesh
          key={seg.index}
          castShadow
          position={seg.position}
          rotation={seg.rotation}
          material={trimMat}
        >
          <boxGeometry args={seg.size} />
        </mesh>
      ))}

      {isDoorBay ? (
        <group>
          {/* Panelled Timber Cafe/Bodega Entry Door */}
          <mesh
            position={[0, 1.08, 0.02]}
            material={VENICE_MATERIALS.storefrontTimber}
          >
            <boxGeometry args={[openingW * 0.88, 2.02, 0.03]} />
          </mesh>
          {/* Warm Glowing Upper Glass Panes & Arched Transom */}
          <mesh
            position={[0, 1.56, 0.047]}
            material={decalMat(VENICE_MATERIALS.storefrontWarmInterior, 1)}
          >
            <boxGeometry args={[openingW * 0.64, 0.85, 0.024]} />
          </mesh>
          <mesh
            position={[0, 2.26, 0.047]}
            material={decalMat(VENICE_MATERIALS.storefrontWarmInterior, 2)}
          >
            <boxGeometry args={[openingW * 0.8, 0.42, 0.024]} />
          </mesh>
          {/* Brass Door Push Bar */}
          <mesh
            position={[openingW * 0.24, 1.02, 0.08]}
            material={TOYBOX_MATERIALS.brassAccent}
          >
            <cylinderGeometry args={[0.02, 0.02, 0.36, 8]} />
          </mesh>
        </group>
      ) : (
        <group>
          {/* Warm Illuminated Bakery / Trattoria Display Window */}
          <mesh
            position={[0, 1.47, 0.02]}
            material={VENICE_MATERIALS.storefrontWarmInterior}
          >
            <boxGeometry args={[openingW + 0.03, 2.12, 0.025]} />
          </mesh>
          {/* Dark Timber Muntin Grid */}
          <mesh
            position={[0, 1.48, 0.043]}
            material={decalMat(VENICE_MATERIALS.storefrontTimber, 1)}
          >
            <boxGeometry args={[0.05, 2.07, 0.03]} />
          </mesh>
          <mesh
            position={[0, 1.72, 0.05]}
            material={decalMat(VENICE_MATERIALS.storefrontTimber, 2)}
          >
            <boxGeometry args={[openingW + 0.04, 0.05, 0.03]} />
          </mesh>
          {/* Shop Signage Frieze Plaque Above Window */}
          <mesh
            position={[0, 3.04, suppressProtrusions ? 0.03 : 0.06]}
            material={VENICE_MATERIALS.signagePlaqueBg}
          >
            <boxGeometry args={[bayWidth * 0.72, 0.26, 0.04]} />
          </mesh>
          <mesh
            position={[0, 3.04, suppressProtrusions ? 0.055 : 0.085]}
            material={decalMat(VENICE_MATERIALS.signagePlaqueInk, 1)}
          >
            <boxGeometry args={[bayWidth * 0.54, 0.08, 0.03]} />
          </mesh>
        </group>
      )}

      {/* 28-Deg Striped Fabric Shop Awning (omitted on Scaffolding host) */}
      {awningSpec && (
        <group position={[0, 0, 0.44]}>
          {awningSpec.stripePanels.map((panel) => (
            <mesh
              key={panel.index}
              castShadow
              receiveShadow
              position={panel.position}
              rotation={panel.rotation}
              material={
                panel.isAlternateStripe
                  ? TOYBOX_MATERIALS.awningCream
                  : awningPrimaryMat
              }
            >
              {/* Helper pads each stripe by +4mm, which overlaps neighbours coplanar: abut exactly instead */}
              <boxGeometry args={[panel.size[0] - 0.004, panel.size[1], panel.size[2]]} />
            </mesh>
          ))}
          <mesh
            position={awningSpec.frontValance.position}
            material={awningPrimaryMat}
          >
            <boxGeometry args={awningSpec.frontValance.size} />
          </mesh>
          {/* Wrought-Iron Awning Wall-Mount Tie Rods */}
          {[-awningSpec.width * 0.42, awningSpec.width * 0.42].map((ax, i) => (
            <mesh
              key={`tie-${i}`}
              position={[ax, 2.52, -0.18]}
              rotation={[0.6, 0, 0]}
              material={VENICE_MATERIALS.wroughtIron}
            >
              <cylinderGeometry args={[0.019, 0.019, 0.56, 6]} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

function FireEscapeAssembly({
  startY,
  topY,
  storiesAboveGround,
}: {
  startY: number;
  topY: number;
  storiesAboveGround: number;
}) {
  const levels = Math.max(1, storiesAboveGround);
  const stepY = (topY - startY) / levels;
  const platW = 2.0;
  const platD = 0.78;

  return (
    <group position={[0, 0, 0]}>
      {Array.from({ length: levels }, (_, idx) => {
        const ly = startY + idx * stepY;
        const nextY = ly + stepY;
        const dir = idx % 2 === 0 ? 1 : -1;
        const stairLen = Math.hypot(platW * 0.7, stepY);
        const stairPitch = Math.atan2(stepY, platW * 0.7);
        return (
          <group key={`fe-${idx}`}>
            {/* Grated Iron Balcony Platform */}
            <mesh
              castShadow
              position={[0, ly, platD * 0.5 - 0.01]}
              material={VENICE_MATERIALS.wroughtIron}
            >
              <boxGeometry args={[platW, 0.055, platD + 0.02]} />
            </mesh>
            {/* Front & Side Safety Railings */}
            <mesh
              position={[0, ly + 0.78, platD - 0.03]}
              material={VENICE_MATERIALS.wroughtIron}
            >
              <boxGeometry args={[platW, 0.04, 0.04]} />
            </mesh>
            {[-0.9, -0.45, 0, 0.45, 0.9].map((px, pi) => (
              <mesh
                key={`fp-${pi}`}
                position={[px, ly + 0.4, platD - 0.03]}
                material={VENICE_MATERIALS.wroughtIron}
              >
                <boxGeometry args={[0.036, 0.78, 0.036]} />
              </mesh>
            ))}
            {/* Diagonal Zig-Zag Stair Flight */}
            {idx < levels - 1 && (
              <mesh
                castShadow
                position={[0, (ly + nextY) * 0.5, platD * 0.5]}
                rotation={[0, 0, dir * stairPitch]}
                material={VENICE_MATERIALS.wroughtIron}
              >
                <boxGeometry args={[stairLen, 0.05, 0.34]} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

function FacadeFaceDetail({
  building,
  faceConfig,
  wallSize,
  trimMat,
  shutterMat,
  roofStartY,
}: {
  building: PerimeterBuildingSpec;
  faceConfig: ExposedFaceConfig;
  wallSize: [number, number, number];
  trimMat: THREE.Material;
  shutterMat: THREE.Material;
  roofStartY: number;
}) {
  const { pos, rotY } = getFaceTransform(
    faceConfig.face,
    wallSize[0],
    wallSize[2],
  );

  const exposedSpan = faceConfig.uMax - faceConfig.uMin;
  const uCenter = (faceConfig.uMin + faceConfig.uMax) * 0.5;
  const streetY = faceConfig.effectiveStreetY;
  const suppressLowProtrusions = Boolean(building.isScaffoldingHost);
  // Flush trim bands/quoins are decal-like layers over the wall: local polygonOffset clone, backs embedded 2cm.
  const flushTrimMat = decalMat(trimMat, 1);

  // Ground-floor storefront bays
  const bayCount = Math.max(
    1,
    Math.min(
      building.shopfrontBayCount || 2,
      Math.floor(exposedSpan / 2.65),
    ),
  );
  const baySpan = Math.max(2.2, (exposedSpan - 0.9) / bayCount);
  const doorBayIdx = Math.floor(bayCount * 0.5);

  // Upper residential stories
  const upperStartY = streetY + 3.65;
  const upperSpanY = Math.max(2.6, roofStartY - upperStartY - 0.45);
  const upperStories = Math.max(1, building.stories - 1);
  const storyH = upperSpanY / upperStories;

  const colCount = Math.max(
    2,
    Math.min(
      building.windowColumns || 3,
      Math.floor((exposedSpan - 1.1) / 1.95),
    ),
  );
  const colSpan = (exposedSpan - 1.1) / colCount;
  const seedBase = hashStr(building.id + faceConfig.face);

  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      {/* Ground-Floor Stone Plinth Band extending seamlessly to y = 0 */}
      <mesh
        castShadow
        receiveShadow
        position={[uCenter, (streetY + 0.58) * 0.5, 0.02]}
        material={flushTrimMat}
      >
        <boxGeometry args={[exposedSpan - 0.03, streetY + 0.58, 0.08]} />
      </mesh>

      {/* Belt Course Ledge Separating Ground Retail & Upper Apartments */}
      <mesh
        castShadow
        receiveShadow
        position={[uCenter, streetY + 3.45, suppressLowProtrusions ? 0.02 : 0.06]}
        material={flushTrimMat}
      >
        <boxGeometry
          args={[exposedSpan + 0.06, 0.18, suppressLowProtrusions ? 0.08 : 0.16]}
        />
      </mesh>

      {/* Storefront Bays */}
      {Array.from({ length: bayCount }, (_, bIdx) => {
        const bu =
          uCenter - (bayCount - 1) * 0.5 * baySpan + bIdx * baySpan;
        return (
          <group key={`bay-${bIdx}`} position={[bu, streetY, 0]}>
            <StorefrontBay
              bayWidth={baySpan}
              isDoorBay={bIdx === doorBayIdx}
              awningHex={building.shopfrontAwningHex}
              trimMat={trimMat}
              suppressProtrusions={suppressLowProtrusions}
            />
          </group>
        );
      })}

      {/* Upper-Story Shuttered Windows & Juliet Balconies */}
      {Array.from({ length: upperStories }, (_, sIdx) => {
        const sillY = upperStartY + sIdx * storyH + 0.36;
        const isGrandFloor = sIdx === 0;
        const jambH = Math.min(1.42, storyH * (isGrandFloor ? 0.54 : 0.48));
        const winW = Math.min(1.08, colSpan * 0.46);

        return (
          <group key={`story-${sIdx}`}>
            {/* Subtle Floor Stringcourse Trim */}
            {sIdx > 0 && (
              <mesh
                position={[uCenter, upperStartY + sIdx * storyH - 0.04, 0.025]}
                material={decalMat(trimMat, 2)}
              >
                <boxGeometry args={[exposedSpan - 0.03, 0.09, 0.09]} />
              </mesh>
            )}

            {Array.from({ length: colCount }, (_, cIdx) => {
              const wu =
                uCenter - (colCount - 1) * 0.5 * colSpan + cIdx * colSpan;
              const hVal = hashStr(
                `${building.id}-${faceConfig.face}-${sIdx}-${cIdx}`,
              );
              const isWarmLit = hVal > 0.62;
              const showBalcony =
                sIdx < 2 &&
                building.julietBalconyCount > 0 &&
                ((sIdx === 0 && (cIdx + sIdx) % 2 === 0) ||
                  (sIdx === 1 && cIdx === Math.floor(colCount * 0.5)));

              return (
                <group key={`win-${cIdx}`} position={[wu, sillY, 0]}>
                  <WindowUnit
                    width={winW}
                    jambHeight={jambH}
                    hasShutters={building.hasShutters}
                    shutterMat={shutterMat}
                    trimMat={trimMat}
                    isWarmLit={isWarmLit}
                    isArched={isGrandFloor || building.palette !== 'warm_brick'}
                  />
                  {showBalcony && (
                    <JulietBalcony
                      width={winW}
                      trimMat={trimMat}
                      useWroughtIron={
                        building.palette === 'warm_brick' || sIdx === 1
                      }
                      hasFlowerBox={hVal > 0.46}
                    />
                  )}
                </group>
              );
            })}
          </group>
        );
      })}

      {/* Wrought-Iron Fire Escape (placed cleanly clear of any lower scaffolding) */}
      {building.hasFireEscape && exposedSpan >= 6.0 && (
        <group position={[faceConfig.uMax - 1.35, 0, 0]}>
          <FireEscapeAssembly
            startY={streetY + 3.65}
            topY={roofStartY - 0.55}
            storiesAboveGround={Math.max(2, upperStories)}
          />
        </group>
      )}

      {/* Exterior Copper Drainpipe & Downspout Hopper */}
      {!suppressLowProtrusions && (
        <group position={[faceConfig.uMin + 0.24, 0, 0.075]}>
          <mesh
            castShadow
            position={[0, roofStartY * 0.5, 0]}
            material={VENICE_MATERIALS.copperDrainpipe}
          >
            <cylinderGeometry args={[0.052, 0.052, roofStartY, 8]} />
          </mesh>
          <mesh
            position={[0, roofStartY - 0.16, 0.02]}
            material={VENICE_MATERIALS.copperDrainpipe}
          >
            <cylinderGeometry args={[0.12, 0.06, 0.22, 6]} />
          </mesh>
          {/* Wall Mount Clamp Collars */}
          {[2.2, 5.6, 9.0].map(
            (cy, i) =>
              cy < roofStartY - 0.5 && (
                <mesh
                  key={i}
                  position={[0, cy, -0.02]}
                  material={VENICE_MATERIALS.wroughtIron}
                >
                  <boxGeometry args={[0.14, 0.06, 0.08]} />
                </mesh>
              ),
          )}
        </group>
      )}

      {/* Corner Stone Quoins on Left & Right Exposed Edges */}
      {seedBase > 0.25 &&
        Array.from({ length: Math.min(8, Math.floor((roofStartY - 1) / 1.4)) }, (_, qi) => {
          const qy = 1.1 + qi * 1.35;
          if (qy >= roofStartY - 0.4) return null;
          const qw = qi % 2 === 0 ? 0.34 : 0.22;
          return (
            <React.Fragment key={`q-${qi}`}>
              <mesh
                position={[faceConfig.uMin + 0.015 + qw * 0.5, qy, 0.015]}
                material={flushTrimMat}
              >
                <boxGeometry args={[qw, 0.42, 0.07]} />
              </mesh>
              <mesh
                position={[faceConfig.uMax - 0.015 - qw * 0.5, qy, 0.015]}
                material={flushTrimMat}
              >
                <boxGeometry args={[qw, 0.42, 0.07]} />
              </mesh>
            </React.Fragment>
          );
        })}

      {/* Projecting Eave Cornice & Carved Corbel Dentils Along Exposed Front */}
      <group position={[uCenter, roofStartY, 0.12]}>
        <mesh castShadow receiveShadow material={trimMat}>
          <boxGeometry args={[exposedSpan + 0.18, 0.24, 0.28]} />
        </mesh>
        {Array.from(
          { length: Math.max(4, Math.floor(exposedSpan / 0.85)) },
          (_, ci) => {
            const totalCorbs = Math.max(4, Math.floor(exposedSpan / 0.85));
            const cx =
              -exposedSpan * 0.46 +
              (ci / Math.max(1, totalCorbs - 1)) * (exposedSpan * 0.92);
            return (
              <mesh
                key={`corb-${ci}`}
                castShadow
                position={[cx, -0.18, -0.02]}
                material={trimMat}
              >
                <boxGeometry args={[0.14, 0.16, 0.18]} />
              </mesh>
            );
          },
        )}
      </group>
    </group>
  );
}

/**
 * Reusable Walkabout: Venice faceted low-poly perimeter building module.
 * Renders any PerimeterBuildingSpec with ground-floor storefronts, arched windows,
 * shutters, Juliet balconies, flower boxes, fire escapes, drainpipes, and roofscapes.
 * Wrapped in `userData={{ occludableBuilding: true, buildingId, aabb }}` for CameraRig fade.
 */
export function BuildingFacadeModule({
  building,
  centered = true,
  orientFrontToPlusZ = false,
  showWireframe = false,
}: BuildingFacadeModuleProps) {
  const widthX = building.boundsXZ.maxX - building.boundsXZ.minX;
  const depthZ = building.boundsXZ.maxZ - building.boundsXZ.minZ;
  const centerX = (building.boundsXZ.minX + building.boundsXZ.maxX) * 0.5;
  const centerZ = (building.boundsXZ.minZ + building.boundsXZ.maxZ) * 0.5;

  const rootPos: [number, number, number] = centered
    ? [0, 0, 0]
    : [centerX, building.groundY, centerZ];

  const rootRotY = useMemo(() => {
    if (!centered || !orientFrontToPlusZ) return 0;
    switch (building.frontFace) {
      case 'south':
        return 0;
      case 'east':
        return -Math.PI * 0.5;
      case 'north':
        return Math.PI;
      case 'west':
        return Math.PI * 0.5;
    }
  }, [centered, orientFrontToPlusZ, building.frontFace]);

  const wallMat = getBuildingWallMaterial(building.palette);
  const trimMat = getBuildingTrimMaterial(building.trimPalette);
  const shutterMat = useMemo(
    () => getCachedMatteMaterial(building.shutterHex || '#2F6F5E', 0.72, 0.03),
    [building.shutterHex],
  );

  const roofRise =
    building.roofStyle === 'hipped_terracotta_tile'
      ? 1.55
      : building.roofStyle === 'mansard_slate'
        ? 1.75
        : building.roofStyle === 'campanile_spire'
          ? 4.6
          : 0.72;
  const bodyHeight = Math.max(4.0, building.height - roofRise);

  const hippedRoofGeo = useMemo(
    () =>
      building.roofStyle === 'hipped_terracotta_tile'
        ? buildHippedRoofGeometry(widthX, depthZ, roofRise)
        : null,
    [building.roofStyle, widthX, depthZ, roofRise],
  );

  const mansardRoofGeo = useMemo(
    () =>
      building.roofStyle === 'mansard_slate'
        ? buildMansardRoofGeometry(widthX, depthZ, roofRise, 0.78)
        : null,
    [building.roofStyle, widthX, depthZ, roofRise],
  );

  const exposedFaces = useMemo(
    () => resolveExposedFaces(building),
    [building],
  );

  const occludableAabb = useMemo(() => {
    const hasShopfrontAwning =
      Boolean(building.shopfrontAwningHex) && !building.isScaffoldingHost;
    if (!hasShopfrontAwning) return building.aabb;

    const min: [number, number, number] = [
      building.aabb.min[0],
      building.aabb.min[1],
      building.aabb.min[2],
    ];
    const max: [number, number, number] = [
      building.aabb.max[0],
      building.aabb.max[1],
      building.aabb.max[2],
    ];

    for (const fc of exposedFaces) {
      if (!fc.isPrimaryStreetFront) continue;
      switch (fc.face) {
        case 'north':
          min[2] -= 0.85;
          break;
        case 'south':
          max[2] += 0.85;
          break;
        case 'west':
          min[0] -= 0.85;
          break;
        case 'east':
          max[0] += 0.85;
          break;
      }
    }

    return { min, max };
  }, [building, exposedFaces]);

  const roofCapY = bodyHeight + roofRise;

  // Per-building deterministic 2-8mm growth so abutting/overlapping neighbours never share an identical wall plane.
  const wallEps = 0.002 + hashStr(`${building.id}-wall-eps`) * 0.006;
  const wallW = widthX + wallEps;
  const wallD = depthZ + wallEps;

  return (
    <group
      name={`building-${building.id}`}
      position={rootPos}
      rotation={[0, rootRotY, 0]}
      userData={{
        occludableBuilding: true,
        buildingId: building.id,
        aabb: occludableAabb,
      }}
    >
      {/* Main Structural Facade Massing Flush at Local y = 0 */}
      <mesh
        castShadow
        receiveShadow
        position={[0, bodyHeight * 0.5, 0]}
        material={wallMat}
      >
        <boxGeometry args={[wallW, bodyHeight, wallD]} />
      </mesh>

      {/* Detailed Street-Facing Storefronts, Windows, Shutters, Balconies & Cornices */}
      {exposedFaces.map((fc) => (
        <FacadeFaceDetail
          key={fc.face}
          building={building}
          faceConfig={fc}
          wallSize={[widthX, bodyHeight, depthZ]}
          trimMat={trimMat}
          shutterMat={shutterMat}
          roofStartY={bodyHeight}
        />
      ))}

      {/* Rooftop Architecture */}
      {building.roofStyle === 'hipped_terracotta_tile' && hippedRoofGeo && (
        <group position={[0, bodyHeight, 0]}>
          <mesh
            castShadow
            receiveShadow
            geometry={hippedRoofGeo}
            material={VENICE_MATERIALS.roofTerracottaTile}
          />
          {/* Ridge Tile Cap */}
          <mesh
            castShadow
            position={[0, roofRise + 0.04, 0]}
            material={VENICE_MATERIALS.roofTerracottaRidge}
          >
            <boxGeometry
              args={
                widthX >= depthZ
                  ? [Math.max(0.4, (widthX - depthZ) * 0.9), 0.14, 0.24]
                  : [0.24, 0.14, Math.max(0.4, (depthZ - widthX) * 0.9)]
              }
            />
          </mesh>
          {/* Venetian Brick Chimney + Flared Terracotta Chimney Pots */}
          <group position={[widthX * 0.22, roofRise * 0.65, -depthZ * 0.18]}>
            <mesh castShadow material={VENICE_MATERIALS.brickBrownstone}>
              <boxGeometry args={[0.72, 1.35, 0.72]} />
            </mesh>
            <mesh
              castShadow
              position={[0, 0.72, 0]}
              material={trimMat}
            >
              <boxGeometry args={[0.84, 0.12, 0.84]} />
            </mesh>
            {[-0.16, 0.16].map((cx, idx) => (
              <mesh
                key={idx}
                castShadow
                position={[cx, 0.95, 0]}
                material={VENICE_MATERIALS.roofTerracottaRidge}
              >
                <cylinderGeometry args={[0.14, 0.09, 0.36, 7]} />
              </mesh>
            ))}
          </group>
        </group>
      )}

      {building.roofStyle === 'cornice_parapet' && (
        <group position={[0, bodyHeight, 0]}>
          {/* Perimeter Parapet Walls */}
          <mesh
            castShadow
            receiveShadow
            position={[0, (roofRise + 0.02) * 0.5, wallD * 0.5 - 0.18]}
            material={wallMat}
          >
            <boxGeometry args={[wallW, roofRise + 0.02, 0.36]} />
          </mesh>
          <mesh
            castShadow
            receiveShadow
            position={[0, (roofRise + 0.02) * 0.5, -wallD * 0.5 + 0.18]}
            material={wallMat}
          >
            <boxGeometry args={[wallW, roofRise + 0.02, 0.36]} />
          </mesh>
          <mesh
            castShadow
            receiveShadow
            position={[wallW * 0.5 - 0.18, (roofRise + 0.02) * 0.5, 0]}
            material={wallMat}
          >
            <boxGeometry args={[0.36, roofRise + 0.02, wallD - 0.72]} />
          </mesh>
          <mesh
            castShadow
            receiveShadow
            position={[-wallW * 0.5 + 0.18, (roofRise + 0.02) * 0.5, 0]}
            material={wallMat}
          >
            <boxGeometry args={[0.36, roofRise + 0.02, wallD - 0.72]} />
          </mesh>
          {/* Coping Stone Rim */}
          <mesh
            castShadow
            position={[0, roofRise + 0.06, 0]}
            material={trimMat}
          >
            <boxGeometry args={[widthX + 0.08, 0.12, depthZ + 0.08]} />
          </mesh>
          {/* Recessed Tar Deck + Rooftop Skylight Bulkhead */}
          <mesh
            receiveShadow
            position={[0, 0.18, 0]}
            material={VENICE_MATERIALS.roofTarFlat}
          >
            <boxGeometry args={[widthX - 0.72, 0.08, depthZ - 0.72]} />
          </mesh>
          <mesh
            castShadow
            position={[-widthX * 0.15, 0.56, 0]}
            material={trimMat}
          >
            <boxGeometry args={[1.6, 0.68, 1.4]} />
          </mesh>
          <mesh
            castShadow
            position={[widthX * 0.25, 0.85, -depthZ * 0.2]}
            material={VENICE_MATERIALS.brickBrownstone}
          >
            <boxGeometry args={[0.68, 1.4, 0.68]} />
          </mesh>
        </group>
      )}

      {building.roofStyle === 'mansard_slate' && mansardRoofGeo && (
        <group position={[0, bodyHeight, 0]}>
          <mesh
            castShadow
            receiveShadow
            geometry={mansardRoofGeo}
            material={VENICE_MATERIALS.roofMansardSlate}
          />
          <mesh
            position={[0, roofRise + 0.045, 0]}
            material={trimMat}
          >
            <boxGeometry
              args={[
                Math.max(0.8, widthX - 1.5),
                0.12,
                Math.max(0.8, depthZ - 1.5),
              ]}
            />
          </mesh>
          {/* Twin Chimneys */}
          <mesh
            castShadow
            position={[widthX * 0.2, roofRise + 0.52, 0]}
            material={VENICE_MATERIALS.brickBrownstone}
          >
            <boxGeometry args={[0.65, 1.16, 0.65]} />
          </mesh>
        </group>
      )}

      {/* QA Wireframe Overlay */}
      {showWireframe && (
        <mesh
          position={[0, roofCapY * 0.5, 0]}
          material={TOYBOX_MATERIALS.qaBoundsWireframe}
        >
          <boxGeometry args={[widthX, building.height, depthZ]} />
        </mesh>
      )}
    </group>
  );
}
