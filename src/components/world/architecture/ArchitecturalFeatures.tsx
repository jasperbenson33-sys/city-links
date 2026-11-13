'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  ARCHITECTURAL_WALLS,
  COURTYARD_PERGOLA,
  OUTER_CITY_GROUND_SKIRT,
  SKYLINE_BACKDROPS,
  STRING_LIGHT_SPANS,
} from '@/config/courseMasterPlan';
import type {
  ArchitecturalWallSpec,
  CourtyardPergolaSpec,
  PerimeterBuildingSpec,
  StringLightSpanSpec,
} from '@/types/course';
import { VENICE_MATERIALS } from '@/materials';

function getSkylineMaterial(
  palette: PerimeterBuildingSpec['palette'],
): THREE.MeshStandardMaterial {
  switch (palette) {
    case 'terracotta':
      return VENICE_MATERIALS.skylineTerracotta;
    case 'ochre':
      return VENICE_MATERIALS.skylineOchre;
    case 'warm_brick':
      return VENICE_MATERIALS.skylineBrick;
    case 'cream_limestone':
    case 'sage_trim':
    default:
      return VENICE_MATERIALS.skylineLimestone;
  }
}

function getSkylineRoofMaterial(
  roofStyle: PerimeterBuildingSpec['roofStyle'],
): THREE.MeshStandardMaterial {
  if (roofStyle === 'mansard_slate') return VENICE_MATERIALS.roofMansardSlate;
  if (roofStyle === 'cornice_parapet') return VENICE_MATERIALS.roofTarFlat;
  return VENICE_MATERIALS.roofTerracottaTile;
}

/**
 * Renders courtyard and subway plaza architectural walls directly from CAD specs.
 */
export function ArchitecturalWallsGroup({
  walls = ARCHITECTURAL_WALLS,
  showWireframe = false,
}: {
  walls?: ArchitecturalWallSpec[];
  showWireframe?: boolean;
}) {
  return (
    <group name="architectural-walls-group">
      {walls.map((wall) => (
        <ArchitecturalWallMesh
          key={wall.id}
          wall={wall}
          showWireframe={showWireframe}
        />
      ))}
    </group>
  );
}

function ArchitecturalWallMesh({
  wall,
  showWireframe,
}: {
  wall: ArchitecturalWallSpec;
  showWireframe: boolean;
}) {
  const width = wall.size[0];
  const depth = wall.size[2];
  const baseY = Math.min(wall.groundY, wall.center[1] - wall.size[1] * 0.5);
  const topY = wall.topY;
  const totalHeight = Math.max(0.25, topY - baseY);

  if (wall.kind === 'wrought_iron_planter_wall') {
    // Ground masonry base cleanly from wall.groundY up through courtyard level (0.60m)
    // and place coping + wrought-iron rail + low greenery strictly <= wall.topY.
    const visibleTerraceY = Math.max(baseY, 0.6);
    const masonryTopY = Math.min(topY - 0.16, Math.max(baseY + 0.24, visibleTerraceY + 0.14));
    const masonryH = Math.max(0.14, masonryTopY - baseY);
    const copingH = 0.055;
    const copingTopY = Math.min(topY - 0.08, masonryTopY + copingH);
    const railH = Math.max(0.06, topY - copingTopY);
    const postCount = Math.max(3, Math.round(width / 1.1) + 1);
    const picketCount = Math.max(12, Math.round(width / 0.16));

    return (
      <group
        name={`wall-${wall.id}`}
        position={[wall.center[0], 0, wall.center[2]]}
        rotation={[0, wall.rotationY, 0]}
      >
        {/* Limestone planter wall base */}
        <mesh
          position={[0, baseY + masonryH * 0.5, 0]}
          material={VENICE_MATERIALS.stuccoCreamDeep}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[width, masonryH, depth]} />
        </mesh>

        {/* Molded stone coping ledge */}
        <mesh
          position={[0, masonryTopY + copingH * 0.5, 0]}
          material={VENICE_MATERIALS.graniteCurbBevelTop}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[width + 0.05, copingH, depth + 0.06]} />
        </mesh>

        {/* Low terracotta planter soil & clipped courtyard boxwood strip (strictly <= topY) */}
        <mesh
          position={[0, copingTopY + railH * 0.34, 0.05]}
          material={VENICE_MATERIALS.pergolaVineLeaf}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[width - 0.34, Math.max(0.06, railH * 0.58), depth * 0.45]} />
        </mesh>

        {/* Blossom clusters nestled into planter hedge */}
        {Array.from({ length: Math.max(4, Math.floor(width / 0.75)) }, (_, idx) => {
          const px = -width * 0.42 + (idx / Math.max(1, Math.floor(width / 0.75) - 1)) * width * 0.84;
          return (
            <mesh
              key={`blossom-${idx}`}
              position={[px, copingTopY + railH * 0.66, 0.05]}
              material={
                idx % 2 === 0
                  ? VENICE_MATERIALS.flowerBoxBlossomCoral
                  : VENICE_MATERIALS.flowerBoxBlossomGold
              }
              castShadow
            >
              <dodecahedronGeometry args={[0.048, 0]} />
            </mesh>
          );
        })}

        {/* Wrought-iron top handrail flush at wall.topY */}
        <mesh
          position={[0, topY - 0.022, -depth * 0.18]}
          material={VENICE_MATERIALS.wroughtIron}
          castShadow
        >
          <boxGeometry args={[width, 0.042, 0.05]} />
        </mesh>

        {/* Lower horizontal iron bar */}
        <mesh
          position={[0, copingTopY + 0.045, -depth * 0.18]}
          material={VENICE_MATERIALS.wroughtIron}
          castShadow
        >
          <boxGeometry args={[width - 0.04, 0.024, 0.032]} />
        </mesh>

        {/* Wrought-iron stanchion posts */}
        {Array.from({ length: postCount }, (_, idx) => {
          const t = postCount === 1 ? 0.5 : idx / (postCount - 1);
          const x = -width * 0.48 + t * width * 0.96;
          return (
            <group key={`post-${idx}`} position={[x, 0, -depth * 0.18]}>
              <mesh
                position={[0, copingTopY + railH * 0.5, 0]}
                material={VENICE_MATERIALS.wroughtIron}
                castShadow
              >
                <boxGeometry args={[0.048, railH, 0.048]} />
              </mesh>
              <mesh
                position={[0, baseY + masonryH * 0.5 + 0.02, depth * 0.18]}
                material={VENICE_MATERIALS.stuccoCreamLimestone}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[0.22, masonryH + 0.04, depth + 0.02]} />
              </mesh>
            </group>
          );
        })}

        {/* Vertical iron pickets */}
        {Array.from({ length: picketCount }, (_, idx) => {
          const t = (idx + 0.5) / picketCount;
          const x = -width * 0.47 + t * width * 0.94;
          return (
            <mesh
              key={`picket-${idx}`}
              position={[x, copingTopY + railH * 0.48, -depth * 0.18]}
              material={VENICE_MATERIALS.wroughtIron}
              castShadow
            >
              <boxGeometry args={[0.018, Math.max(0.04, railH - 0.04), 0.018]} />
            </mesh>
          );
        })}

        {showWireframe && (
          <mesh position={[0, baseY + totalHeight * 0.5, 0]}>
            <boxGeometry args={[width, totalHeight, depth]} />
            <meshBasicMaterial color="#F59E0B" wireframe />
          </mesh>
        )}
      </group>
    );
  }

  // Axis-aligned ramp cheek walls & courtyard retaining steps (always oriented along dominant span)
  const alongZ = depth > width;
  const spanLen = alongZ ? depth : width;
  const wallThick = alongZ ? width : depth;
  const isRampOrStepWall =
    wall.kind === 'courtyard_boundary_wall' ||
    wall.id.startsWith('wall-ramp-') ||
    wall.id.includes('step');

  if (isRampOrStepWall) {
    const bodyH = Math.max(0.18, totalHeight - 0.06);
    const copingH = 0.06;
    const pilasterCount = Math.max(2, Math.round(spanLen / 2.2) + 1);

    return (
      <group
        name={`wall-${wall.id}`}
        position={[wall.center[0], 0, wall.center[2]]}
        rotation={[0, wall.rotationY, 0]}
      >
        {/* Limestone / Ramp Cheek Masonry Body */}
        <mesh
          position={[0, baseY + bodyH * 0.5, 0]}
          material={VENICE_MATERIALS.courtyardTerraceSideStone}
          castShadow
          receiveShadow
        >
          <boxGeometry
            args={alongZ ? [wallThick, bodyH, spanLen] : [spanLen, bodyH, wallThick]}
          />
        </mesh>

        {/* Beveled Granite Coping Cap flush at topY */}
        <mesh
          position={[0, baseY + bodyH + copingH * 0.5, 0]}
          material={VENICE_MATERIALS.graniteCurbBevelTop}
          castShadow
          receiveShadow
        >
          <boxGeometry
            args={
              alongZ
                ? [wallThick + 0.03, copingH, spanLen + 0.02]
                : [spanLen + 0.02, copingH, wallThick + 0.03]
            }
          />
        </mesh>

        {/* Subtle Cheek Wall Stone Pilaster Buttresses */}
        {Array.from({ length: pilasterCount }, (_, idx) => {
          const t = pilasterCount === 1 ? 0.5 : idx / (pilasterCount - 1);
          const offset = -spanLen * 0.46 + t * spanLen * 0.92;
          return (
            <mesh
              key={`cheek-pil-${idx}`}
              position={
                alongZ
                  ? [0, baseY + totalHeight * 0.5, offset]
                  : [offset, baseY + totalHeight * 0.5, 0]
              }
              material={VENICE_MATERIALS.stuccoCreamDeep}
              castShadow
              receiveShadow
            >
              <boxGeometry
                args={
                  alongZ
                    ? [wallThick + 0.05, totalHeight, 0.24]
                    : [0.24, totalHeight, wallThick + 0.05]
                }
              />
            </mesh>
          );
        })}

        {showWireframe && (
          <mesh position={[0, baseY + totalHeight * 0.5, 0]}>
            <boxGeometry args={[width, totalHeight, depth]} />
            <meshBasicMaterial color="#F59E0B" wireframe />
          </mesh>
        )}
      </group>
    );
  }

  // Default: Subway Plaza / Masonry Retaining Wall with pilasters, recessed blind arches, coping & crest balustrade
  const bodyH = Math.max(0.4, totalHeight - 0.16);
  const copingH = 0.095;
  const pilasterCount = Math.max(3, Math.round(spanLen / 2.6) + 1);
  const bayCount = pilasterCount - 1;
  const baySpan = spanLen / Math.max(1, bayCount);

  return (
    <group
      name={`wall-${wall.id}`}
      position={[wall.center[0], 0, wall.center[2]]}
      rotation={[0, wall.rotationY, 0]}
    >
      {/* Granite plinth base */}
      <mesh
        position={[0, baseY + 0.11, 0]}
        material={VENICE_MATERIALS.graniteCurbStone}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={
            alongZ
              ? [wallThick + 0.1, 0.22, spanLen + 0.08]
              : [spanLen + 0.08, 0.22, wallThick + 0.1]
          }
        />
      </mesh>

      {/* Main masonry retaining wall */}
      <mesh
        position={[0, baseY + bodyH * 0.5, 0]}
        material={VENICE_MATERIALS.brickBrownstone}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[width, bodyH, depth]} />
      </mesh>

      {/* Recessed Venetian blind-arch limestone bays along both main faces */}
      {!alongZ &&
        Array.from({ length: bayCount }, (_, bIdx) => {
          const bx = -spanLen * 0.5 + (bIdx + 0.5) * baySpan;
          const archW = Math.max(0.9, baySpan * 0.62);
          const archH = Math.max(0.35, bodyH - 0.34);
          return (
            <group key={`ret-bay-${bIdx}`} position={[bx, baseY + 0.24, 0]}>
              {/* Terracotta/limestone recessed panel inlay */}
              <mesh
                position={[0, archH * 0.5, 0]}
                material={VENICE_MATERIALS.stuccoTerracottaDeep}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[archW, archH, depth + 0.035]} />
              </mesh>
              {/* Limestone architrave lintel + keystone */}
              <mesh
                position={[0, archH + 0.05, 0]}
                material={VENICE_MATERIALS.stuccoCreamLimestone}
                castShadow
              >
                <boxGeometry args={[archW + 0.14, 0.09, depth + 0.06]} />
              </mesh>
              <mesh
                position={[0, archH + 0.07, 0]}
                material={VENICE_MATERIALS.graniteCurbBevelTop}
              >
                <boxGeometry args={[0.16, 0.13, depth + 0.08]} />
              </mesh>
            </group>
          );
        })}

      {/* Chamfered limestone coping cap */}
      <mesh
        position={[0, baseY + bodyH + copingH * 0.5, 0]}
        material={VENICE_MATERIALS.graniteCurbBevelTop}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[width + 0.14, copingH, depth + 0.14]} />
      </mesh>

      {/* Wrought-iron top rail & vertical balusters crowning the retaining wall strictly <= topY */}
      <mesh
        position={[0, topY - 0.018, 0]}
        material={VENICE_MATERIALS.wroughtIron}
        castShadow
      >
        <boxGeometry
          args={
            alongZ
              ? [0.044, 0.036, spanLen - 0.16]
              : [spanLen - 0.16, 0.036, 0.044]
          }
        />
      </mesh>
      {!alongZ &&
        Array.from({ length: Math.max(8, Math.round(spanLen / 0.45)) }, (_, k) => {
          const count = Math.max(8, Math.round(spanLen / 0.45));
          const x = -spanLen * 0.48 + (k / (count - 1)) * spanLen * 0.96;
          const balH = Math.max(0.04, topY - (baseY + bodyH + copingH));
          return (
            <mesh
              key={`bal-${k}`}
              position={[x, baseY + bodyH + copingH + balH * 0.5, 0]}
              material={VENICE_MATERIALS.wroughtIron}
            >
              <boxGeometry args={[0.022, balH, 0.022]} />
            </mesh>
          );
        })}

      {/* Stone pilasters + finials */}
      {Array.from({ length: pilasterCount }, (_, idx) => {
        const t = pilasterCount === 1 ? 0.5 : idx / (pilasterCount - 1);
        const offset = -spanLen * 0.48 + t * spanLen * 0.96;
        return (
          <group
            key={`pilaster-${idx}`}
            position={alongZ ? [0, 0, offset] : [offset, 0, 0]}
          >
            <mesh
              position={[0, baseY + (bodyH + 0.08) * 0.5, 0]}
              material={VENICE_MATERIALS.stuccoCreamDeep}
              castShadow
              receiveShadow
            >
              <boxGeometry
                args={
                  alongZ
                    ? [wallThick + 0.14, bodyH + 0.08, 0.38]
                    : [0.38, bodyH + 0.08, wallThick + 0.14]
                }
              />
            </mesh>
            <mesh
              position={[0, topY - 0.04, 0]}
              material={VENICE_MATERIALS.graniteCurbBevelTop}
              castShadow
            >
              <boxGeometry
                args={
                  alongZ
                    ? [wallThick + 0.18, 0.08, 0.44]
                    : [0.44, 0.08, wallThick + 0.18]
                }
              />
            </mesh>
          </group>
        );
      })}

      {showWireframe && (
        <mesh position={[0, baseY + totalHeight * 0.5, 0]}>
          <boxGeometry args={[width, totalHeight, depth]} />
          <meshBasicMaterial color="#F59E0B" wireframe />
        </mesh>
      )}
    </group>
  );
}

/**
 * Renders the sunlit Venetian cedar & stone pergola over the north courtyard terrace.
 */
export function CourtyardPergolaMesh({
  pergola = COURTYARD_PERGOLA,
}: {
  pergola?: CourtyardPergolaSpec;
}) {
  const { minX, maxX, minZ, maxZ } = pergola.boundsXZ;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const groundY = pergola.groundY;
  const beamY = groundY + pergola.beamClearHeight;
  const plinthH = 0.52;
  const timberPostH = pergola.beamClearHeight - plinthH;
  const rafterCount = Math.max(5, pergola.rafterCount);

  return (
    <group name={`pergola-${pergola.id}`}>
      {/* 6 Limestone Column Plinths + Cedar Timber Posts + Knee Braces */}
      {pergola.postPositions.map((pos, idx) => {
        const isNorthRow = pos[2] < centerZ;
        const braceSignZ = isNorthRow ? 1 : -1;
        return (
          <group key={`pergola-post-${idx}`} position={[pos[0], groundY, pos[2]]}>
            {/* Molded limestone plinth */}
            <mesh
              position={[0, plinthH * 0.5, 0]}
              material={VENICE_MATERIALS.stuccoCreamDeep}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.44, plinthH, 0.44]} />
            </mesh>
            <mesh
              position={[0, plinthH + 0.035, 0]}
              material={VENICE_MATERIALS.graniteCurbBevelTop}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.5, 0.07, 0.5]} />
            </mesh>

            {/* Cedar column shaft */}
            <mesh
              position={[0, plinthH + timberPostH * 0.5, 0]}
              material={VENICE_MATERIALS.pergolaCedar}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.24, timberPostH, 0.24]} />
            </mesh>

            {/* Wrought-iron base shoe + capital collar */}
            <mesh
              position={[0, plinthH + 0.09, 0]}
              material={VENICE_MATERIALS.wroughtIron}
              castShadow
            >
              <boxGeometry args={[0.28, 0.06, 0.28]} />
            </mesh>
            <mesh
              position={[0, pergola.beamClearHeight - 0.14, 0]}
              material={VENICE_MATERIALS.wroughtIron}
              castShadow
            >
              <boxGeometry args={[0.29, 0.07, 0.29]} />
            </mesh>

            {/* Diagonal cedar knee brace along X */}
            <mesh
              position={[pos[0] > centerX ? -0.34 : 0.34, pergola.beamClearHeight - 0.28, 0]}
              rotation={[0, 0, pos[0] > centerX ? Math.PI * 0.25 : -Math.PI * 0.25]}
              material={VENICE_MATERIALS.pergolaCedar}
              castShadow
            >
              <boxGeometry args={[0.1, 0.65, 0.12]} />
            </mesh>

            {/* Transverse wrought-iron scroll brace */}
            <mesh
              position={[0, pergola.beamClearHeight - 0.26, braceSignZ * 0.28]}
              rotation={[braceSignZ * Math.PI * 0.25, 0, 0]}
              material={VENICE_MATERIALS.wroughtIron}
              castShadow
            >
              <boxGeometry args={[0.08, 0.58, 0.08]} />
            </mesh>
          </group>
        );
      })}

      {/* Longitudinal Cedar Header Double Beams (South & North rows) */}
      {[minZ + 0.1, maxZ - 0.1].map((beamZ, rowIdx) => (
        <group key={`header-beam-${rowIdx}`} position={[centerX, beamY, beamZ]}>
          <mesh
            position={[0, 0.12, -0.09]}
            material={VENICE_MATERIALS.pergolaCedar}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[spanX + 0.75, 0.24, 0.12]} />
          </mesh>
          <mesh
            position={[0, 0.12, 0.09]}
            material={VENICE_MATERIALS.pergolaCedar}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[spanX + 0.75, 0.24, 0.12]} />
          </mesh>
        </group>
      ))}

      {/* 9 Notched Transverse Rafters with overhanging Venetian tails */}
      {Array.from({ length: rafterCount }, (_, idx) => {
        const t = rafterCount === 1 ? 0.5 : idx / (rafterCount - 1);
        const rx = minX + 0.25 + t * (spanX - 0.5);
        return (
          <mesh
            key={`rafter-${idx}`}
            position={[rx, beamY + 0.27, centerZ]}
            material={VENICE_MATERIALS.pergolaCedar}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.12, 0.18, spanZ + 0.85]} />
          </mesh>
        );
      })}

      {/* Longitudinal Roof Purlins + Draped Pergola Greenery & Blossoms */}
      {[-spanZ * 0.3, 0, spanZ * 0.3].map((dz, pIdx) => (
        <mesh
          key={`purlin-${pIdx}`}
          position={[centerX, beamY + 0.39, centerZ + dz]}
          material={VENICE_MATERIALS.pergolaCedar}
          castShadow
        >
          <boxGeometry args={[spanX + 0.4, 0.07, 0.07]} />
        </mesh>
      ))}

      {/* Clustered low-poly climbing vine foliage over rafters */}
      {Array.from({ length: 10 }, (_, idx) => {
        const vx = minX + 0.75 + (idx / 9) * (spanX - 1.5);
        const vz = centerZ + ((idx % 3) - 1) * (spanZ * 0.28);
        return (
          <group key={`vine-${idx}`} position={[vx, beamY + 0.44, vz]}>
            <mesh material={VENICE_MATERIALS.pergolaVineLeaf} castShadow>
              <dodecahedronGeometry args={[0.42 + (idx % 2) * 0.1, 0]} />
            </mesh>
            {idx % 2 === 0 && (
              <mesh
                position={[0.16, -0.14, 0.24]}
                material={VENICE_MATERIALS.flowerBoxBlossomCoral}
                castShadow
              >
                <dodecahedronGeometry args={[0.16, 0]} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

/**
 * Renders catenary overhead warm glowing café string lights spanning 5th Ave, Mercer St, and Courtyard.
 */
export function StringLightSpansGroup({
  spans = STRING_LIGHT_SPANS,
}: {
  spans?: StringLightSpanSpec[];
}) {
  return (
    <group name="string-light-spans-group">
      {spans.map((span) => (
        <SingleStringLightSpan key={span.id} span={span} />
      ))}
    </group>
  );
}

function SingleStringLightSpan({ span }: { span: StringLightSpanSpec }) {
  const { tubeGeo, bulbPositions } = useMemo(() => {
    const start = new THREE.Vector3(...span.startAnchor);
    const end = new THREE.Vector3(...span.endAnchor);
    const curvePts: THREE.Vector3[] = [];
    const segs = 22;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = new THREE.Vector3().lerpVectors(start, end, t);
      p.y -= 4 * t * (1 - t) * span.sagMeters;
      curvePts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(curvePts);
    const tube = new THREE.TubeGeometry(curve, 24, 0.015, 5, false);

    const bulbs: [number, number, number][] = [];
    const count = Math.max(2, span.bulbCount);
    for (let b = 0; b < count; b++) {
      const t = (b + 0.6) / (count + 0.2);
      const p = curve.getPointAt(Math.min(0.96, Math.max(0.04, t)));
      bulbs.push([p.x, p.y - 0.065, p.z]);
    }
    return { tubeGeo: tube, bulbPositions: bulbs };
  }, [span.startAnchor, span.endAnchor, span.sagMeters, span.bulbCount]);

  useEffect(() => {
    return () => {
      tubeGeo.dispose();
    };
  }, [tubeGeo]);

  return (
    <group name={`string-span-${span.id}`}>
      {/* Catenary cord */}
      <mesh geometry={tubeGeo} material={VENICE_MATERIALS.stringLightCord} />

      {/* Wall anchor iron rosettes */}
      {[span.startAnchor, span.endAnchor].map((pt, idx) => (
        <mesh
          key={`anchor-${idx}`}
          position={pt}
          material={VENICE_MATERIALS.wroughtIron}
        >
          <boxGeometry args={[0.12, 0.12, 0.12]} />
        </mesh>
      ))}

      {/* Warm glowing café bulbs + sockets */}
      {bulbPositions.map((pos, bIdx) => (
        <group key={`bulb-${bIdx}`} position={pos}>
          <mesh
            position={[0, 0.045, 0]}
            material={VENICE_MATERIALS.stringLightCord}
          >
            <cylinderGeometry args={[0.016, 0.022, 0.045, 6]} />
          </mesh>
          <mesh material={VENICE_MATERIALS.stringLightBulbGlow}>
            <sphereGeometry args={[0.056, 8, 6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Renders the 7 layered Venetian skyline towers (including the San Mercer Campanile)
 * PLUS outer horizon ground skirt and perimeter city silhouette ring so orbiting 360°
 * at any camera pitch never reveals a sky void or exposed map edge.
 */
export function SkylineAndHorizonSkirt({
  backdrops = SKYLINE_BACKDROPS,
}: {
  backdrops?: PerimeterBuildingSpec[];
}) {
  const { minX, maxX, minZ, maxZ } = OUTER_CITY_GROUND_SKIRT.boundsXZ;
  const skirtW = maxX - minX;
  const skirtD = maxZ - minZ;
  const skirtCX = (minX + maxX) * 0.5;
  const skirtCZ = (minZ + maxZ) * 0.5;

  return (
    <group name="skyline-and-horizon-skirt">
      {/* Continuous OUTER_CITY_GROUND_SKIRT apron beneath all street & gutter elevations */}
      <mesh
        name="outer-city-ground-skirt"
        position={[skirtCX, OUTER_CITY_GROUND_SKIRT.topY, skirtCZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={VENICE_MATERIALS.horizonEarthApron}
        receiveShadow
      >
        <planeGeometry args={[skirtW, skirtD]} />
      </mesh>

      {/* All 8 layered CAD skyline towers (zero overlap, 360-degree horizon closure) */}
      {backdrops.map((b) => (
        <SkylineTowerMesh key={b.id} tower={b} />
      ))}

      {/* Far-horizon distant city rooftop silhouettes well outside the [-28..54, -50..57] CAD skyline ring */}
      <group name="outer-horizon-infill-silhouettes">
        {[
          { x: 10, z: -64, w: 96, h: 17.5, d: 14, mat: VENICE_MATERIALS.skylineOchre },
          { x: -34, z: 0, w: 14, h: 19.0, d: 104, mat: VENICE_MATERIALS.skylineTerracotta },
          { x: 60, z: -4, w: 14, h: 19.5, d: 104, mat: VENICE_MATERIALS.skylineLimestone },
          { x: 10, z: 64, w: 96, h: 17.0, d: 14, mat: VENICE_MATERIALS.skylineBrick },
        ].map((blk, idx) => (
          <group key={`outer-blk-${idx}`} position={[blk.x, -0.05, blk.z]}>
            <mesh position={[0, blk.h * 0.5, 0]} material={blk.mat}>
              <boxGeometry args={[blk.w, blk.h, blk.d]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/**
 * Builds a clean watertight 4-slope faceted Venetian hipped roof BufferGeometry
 * strictly fitted to `[widthX, depthZ]` with ZERO giant cone overhangs.
 */
function buildFittedHippedRoofGeometry(
  widthX: number,
  depthZ: number,
  rise: number,
): THREE.BufferGeometry {
  const hw = widthX * 0.5;
  const hd = depthZ * 0.5;
  const p0: [number, number, number] = [-hw, 0, hd];
  const p1: [number, number, number] = [hw, 0, hd];
  const p2: [number, number, number] = [hw, 0, -hd];
  const p3: [number, number, number] = [-hw, 0, -hd];

  let rA: [number, number, number];
  let rB: [number, number, number];

  if (widthX >= depthZ) {
    const rHalf = Math.max(0.08, (widthX - depthZ) * 0.42);
    rA = [-rHalf, rise, 0];
    rB = [rHalf, rise, 0];
  } else {
    const rHalf = Math.max(0.08, (depthZ - widthX) * 0.42);
    rA = [0, rise, rHalf];
    rB = [0, rise, -rHalf];
  }

  const tris: number[] = [];
  const pushTri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
  ) => {
    tris.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };

  if (widthX >= depthZ) {
    pushTri(p0, p1, rB);
    pushTri(p0, rB, rA);
    pushTri(p2, p3, rA);
    pushTri(p2, rA, rB);
    pushTri(p1, p2, rB);
    pushTri(p3, p0, rA);
  } else {
    pushTri(p0, p1, rA);
    pushTri(p2, p3, rB);
    pushTri(p1, p2, rB);
    pushTri(p1, rB, rA);
    pushTri(p3, p0, rA);
    pushTri(p3, rA, rB);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  geo.computeVertexNormals();
  return geo;
}

function FittedHippedRoof({
  position,
  widthX,
  depthZ,
  rise,
  material,
}: {
  position: [number, number, number];
  widthX: number;
  depthZ: number;
  rise: number;
  material: THREE.Material;
}) {
  const geo = useMemo(
    () => buildFittedHippedRoofGeometry(widthX, depthZ, rise),
    [widthX, depthZ, rise],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh position={position} geometry={geo} material={material} />;
}

const SKYLINE_BAY_WALL_MATS = [
  VENICE_MATERIALS.skylineOchre,
  VENICE_MATERIALS.skylineTerracotta,
  VENICE_MATERIALS.skylineLimestone,
  VENICE_MATERIALS.skylineBrick,
];

const SKYLINE_SHUTTER_MATS = [
  VENICE_MATERIALS.shutterSageDefault,
  VENICE_MATERIALS.shutterEspresso,
  VENICE_MATERIALS.stuccoTerracottaDeep,
];

function SkylineTowerMesh({ tower }: { tower: PerimeterBuildingSpec }) {
  const { minX, maxX, minZ, maxZ } = tower.boundsXZ;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const roofMat = getSkylineRoofMaterial(tower.roofStyle);
  const baseY = -0.05;

  if (tower.roofStyle === 'campanile_spire') {
    const shaftH = Math.max(12, tower.height - 7.8);
    const belfryH = 3.2;
    const spireH = 4.6;
    const shaftTopY = baseY + shaftH;
    const belfryTopY = shaftTopY + belfryH;

    return (
      <group name={`skyline-${tower.id}`} position={[cx, 0, cz]}>
        {/* Terracotta brick campanile shaft */}
        <mesh
          position={[0, baseY + shaftH * 0.5, 0]}
          material={VENICE_MATERIALS.stuccoTerracotta}
          castShadow
        >
          <boxGeometry args={[width, shaftH, depth]} />
        </mesh>

        {/* Cream limestone corner pilasters */}
        {[
          [-width * 0.48, -depth * 0.48],
          [width * 0.48, -depth * 0.48],
          [-width * 0.48, depth * 0.48],
          [width * 0.48, depth * 0.48],
        ].map(([px, pz], idx) => (
          <mesh
            key={`camp-pil-${idx}`}
            position={[px, baseY + shaftH * 0.5, pz]}
            material={VENICE_MATERIALS.stuccoCreamLimestone}
          >
            <boxGeometry args={[0.42, shaftH, 0.42]} />
          </mesh>
        ))}

        {/* Limestone gallery ledge below belfry */}
        <mesh
          position={[0, shaftTopY + 0.14, 0]}
          material={VENICE_MATERIALS.stuccoCreamLimestone}
        >
          <boxGeometry args={[width + 0.6, 0.28, depth + 0.6]} />
        </mesh>

        {/* Open-arched belfry corner piers */}
        {[
          [-width * 0.38, -depth * 0.38],
          [width * 0.38, -depth * 0.38],
          [-width * 0.38, depth * 0.38],
          [width * 0.38, depth * 0.38],
        ].map(([px, pz], idx) => (
          <mesh
            key={`belfry-pier-${idx}`}
            position={[px, shaftTopY + 0.28 + belfryH * 0.5, pz]}
            material={VENICE_MATERIALS.stuccoCreamLimestone}
          >
            <boxGeometry args={[0.72, belfryH, 0.72]} />
          </mesh>
        ))}

        {/* Warm lit bell chamber interior core */}
        <mesh
          position={[0, shaftTopY + 0.28 + belfryH * 0.46, 0]}
          material={VENICE_MATERIALS.storefrontWarmInterior}
        >
          <boxGeometry args={[width * 0.45, belfryH * 0.68, depth * 0.45]} />
        </mesh>

        {/* Upper belfry cornice */}
        <mesh
          position={[0, belfryTopY + 0.36, 0]}
          material={VENICE_MATERIALS.stuccoCreamLimestone}
        >
          <boxGeometry args={[width + 0.45, 0.36, depth + 0.45]} />
        </mesh>

        {/* Flush fitted patinated copper Venetian pyramid spire (zero overhang) */}
        <FittedHippedRoof
          position={[0, belfryTopY + 0.54, 0]}
          widthX={width + 0.2}
          depthZ={depth + 0.2}
          rise={spireH}
          material={VENICE_MATERIALS.campanileSpireCopper}
        />

        {/* Golden finial orb */}
        <mesh
          position={[0, belfryTopY + 0.62 + spireH, 0]}
          material={VENICE_MATERIALS.flowerBoxBlossomGold}
        >
          <sphereGeometry args={[0.28, 10, 8]} />
        </mesh>
      </group>
    );
  }

  // Subdivide wide backdrop slabs into picturesque stepped Walkabout: Venice palazzo bays
  const frontIsNS = tower.frontFace === 'north' || tower.frontFace === 'south';
  const faceSign =
    tower.frontFace === 'south' || tower.frontFace === 'east' ? 1 : -1;
  const majorSpan = frontIsNS ? width : depth;
  const minorDepth = frontIsNS ? depth : width;
  const bayCount = Math.max(1, Math.round(majorSpan / 7.5));
  const baySpan = majorSpan / bayCount;
  const baseWallMat = getSkylineMaterial(tower.palette);

  return (
    <group name={`skyline-${tower.id}`} position={[cx, 0, cz]}>
      {Array.from({ length: bayCount }, (_, bIdx) => {
        const bayOffset = -majorSpan * 0.5 + (bIdx + 0.5) * baySpan;
        const heightVar =
          bayCount === 1
            ? 0
            : bIdx % 3 === 1
              ? 1.8
              : bIdx % 3 === 2
                ? -0.95
                : 0.45;
        const bayH = Math.max(14.0, tower.height + heightVar);
        const bayW = frontIsNS ? baySpan : minorDepth;
        const bayD = frontIsNS ? minorDepth : baySpan;
        const bayMat =
          bIdx === 0
            ? baseWallMat
            : SKYLINE_BAY_WALL_MATS[
                (bIdx + tower.id.length) % SKYLINE_BAY_WALL_MATS.length
              ]!;
        const shutterMat =
          SKYLINE_SHUTTER_MATS[bIdx % SKYLINE_SHUTTER_MATS.length]!;
        const winCols = Math.max(2, Math.min(3, Math.floor(baySpan / 2.6)));
        const storiesAbove = Math.max(2, tower.stories - 1);
        const hasTerracottaRoof =
          tower.roofStyle === 'hipped_terracotta_tile' ||
          (bayCount > 1 && bIdx % 2 === 0);

        return (
          <group
            key={`palazzo-bay-${bIdx}`}
            position={frontIsNS ? [bayOffset, 0, 0] : [0, 0, bayOffset]}
          >
            {/* Stepped Palazzo Wall Volume */}
            <mesh position={[0, baseY + bayH * 0.5, 0]} material={bayMat}>
              <boxGeometry args={[bayW - 0.04, bayH, bayD - 0.04]} />
            </mesh>

            {/* Cream Limestone Corner Pilasters & Belt Courses */}
            <mesh
              position={[0, baseY + bayH - 3.6, 0]}
              material={VENICE_MATERIALS.skylineLimestone}
            >
              <boxGeometry args={[bayW + 0.14, 0.24, bayD + 0.14]} />
            </mesh>
            <mesh
              position={[0, baseY + bayH + 0.14, 0]}
              material={VENICE_MATERIALS.stuccoCreamLimestone}
            >
              <boxGeometry args={[bayW + 0.3, 0.28, bayD + 0.3]} />
            </mesh>

            {/* Framed Venetian Shuttered Windows across upper stories */}
            {Array.from({ length: storiesAbove }, (_, sIdx) => {
              const wy = baseY + 11.2 + sIdx * 3.1;
              if (wy > baseY + bayH - 1.35) return null;
              return Array.from({ length: winCols }, (_, cIdx) => {
                const uOff = (-0.5 + (cIdx + 0.5) / winCols) * (baySpan * 0.72);
                const winPos: [number, number, number] = frontIsNS
                  ? [uOff, wy, faceSign * (bayD * 0.5 + 0.04)]
                  : [faceSign * (bayW * 0.5 + 0.04), wy, uOff];
                const isLit = (bIdx + sIdx + cIdx) % 3 === 0;
                return (
                  <group
                    key={`pwin-${sIdx}-${cIdx}`}
                    position={winPos}
                    rotation={[0, frontIsNS ? (faceSign > 0 ? 0 : Math.PI) : faceSign > 0 ? Math.PI * 0.5 : -Math.PI * 0.5, 0]}
                  >
                    {/* Limestone architrave surround */}
                    <mesh
                      position={[0, 0, -0.01]}
                      material={VENICE_MATERIALS.stuccoCreamLimestone}
                    >
                      <boxGeometry args={[1.18, 1.82, 0.08]} />
                    </mesh>
                    {/* Projecting stone window sill */}
                    <mesh
                      position={[0, -0.94, 0.08]}
                      material={VENICE_MATERIALS.graniteCurbBevelTop}
                    >
                      <boxGeometry args={[1.34, 0.12, 0.2]} />
                    </mesh>
                    {/* Warm sunset-lit or dark reflected glass pane */}
                    <mesh
                      position={[0, 0, 0.025]}
                      material={
                        isLit
                          ? VENICE_MATERIALS.windowWarmLit
                          : VENICE_MATERIALS.windowDarkGlass
                      }
                    >
                      <boxGeometry args={[0.92, 1.54, 0.05]} />
                    </mesh>
                    {/* Paired Venetian Shutters */}
                    <mesh position={[-0.72, 0, 0.04]} material={shutterMat}>
                      <boxGeometry args={[0.38, 1.56, 0.06]} />
                    </mesh>
                    <mesh position={[0.72, 0, 0.04]} material={shutterMat}>
                      <boxGeometry args={[0.38, 1.56, 0.06]} />
                    </mesh>
                  </group>
                );
              });
            })}

            {/* Flush Fitted Hipped Terracotta Roof OR Stepped Parapet + Venetian Chimney */}
            {hasTerracottaRoof ? (
              <FittedHippedRoof
                position={[0, baseY + bayH + 0.28, 0]}
                widthX={bayW + 0.36}
                depthZ={bayD + 0.36}
                rise={1.55}
                material={
                  tower.roofStyle === 'mansard_slate'
                    ? VENICE_MATERIALS.roofMansardSlate
                    : roofMat
                }
              />
            ) : (
              <mesh
                position={[0, baseY + bayH + 0.45, 0]}
                material={VENICE_MATERIALS.stuccoCreamDeep}
              >
                <boxGeometry args={[bayW - 0.12, 0.36, bayD - 0.12]} />
              </mesh>
            )}

            {/* Brick Venetian Chimney Stack & Flared Pot */}
            {bIdx % 2 === 0 && (
              <group
                position={[
                  frontIsNS ? bayW * 0.24 : 0,
                  baseY + bayH + (hasTerracottaRoof ? 1.45 : 0.9),
                  frontIsNS ? 0 : bayD * 0.24,
                ]}
              >
                <mesh material={VENICE_MATERIALS.brickBrownstone}>
                  <boxGeometry args={[0.56, 1.25, 0.56]} />
                </mesh>
                <mesh
                  position={[0, 0.7, 0]}
                  material={VENICE_MATERIALS.stuccoCreamLimestone}
                >
                  <boxGeometry args={[0.7, 0.16, 0.7]} />
                </mesh>
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}
