'use client';

import React from 'react';
import { TOYBOX_MATERIALS } from '@/materials';
import {
  PROP_ACCENT_MATERIALS,
  withPolygonOffset,
  withSoftContrast,
} from './propMaterials';

/* Anti-shimmer layered-decal materials (cached clones; shared sources never mutated). */
const DECAL = {
  coneWhite: withPolygonOffset(PROP_ACCENT_MATERIALS.safetyConeWhite, 1),
  chalkboardFace: withPolygonOffset(PROP_ACCENT_MATERIALS.chalkboardSlate, 1),
  chalkHeader: withPolygonOffset(TOYBOX_MATERIALS.awningCoral, 2),
  chalkLine: withSoftContrast(withPolygonOffset(PROP_ACCENT_MATERIALS.chalkCream, 2)),
  soilBed: withPolygonOffset(TOYBOX_MATERIALS.cedarDark, 1),
  tunnelFloorPan: withPolygonOffset(PROP_ACCENT_MATERIALS.subwayTunnelVoid, 1),
  tileGreenBand: withPolygonOffset(PROP_ACCENT_MATERIALS.subwayTileGreenBand, 1),
  tileSeam: withPolygonOffset(PROP_ACCENT_MATERIALS.mortarCement, 1),
  stepNosing: withSoftContrast(withPolygonOffset(PROP_ACCENT_MATERIALS.subwaySignDark, 1)),
  signPlate: withPolygonOffset(PROP_ACCENT_MATERIALS.subwaySignDark, 1),
  signStripe: withSoftContrast(withPolygonOffset(PROP_ACCENT_MATERIALS.chalkCream, 2)),
  bulletCoral: withPolygonOffset(TOYBOX_MATERIALS.awningCoral, 2),
  bulletAmber: withPolygonOffset(TOYBOX_MATERIALS.taxiAmber, 2),
};

/** Lifts every stair tread so the lowest one clears the tunnel floor pan by > 1.5cm. */
const STEP_LIFT = 0.016;

/* ============================================================================
 * 1. Hazard Cone (`hazard_cone`, localSize: [0.26, 0.68, 0.26])
 * ============================================================================ */

export interface HazardConePropProps {
  position?: [number, number, number];
  rotationY?: number;
  showWireframe?: boolean;
}

/**
 * Faceted low-poly reflective orange safety cone seated flush at y = 0.00m.
 */
export function HazardConeProp({
  position = [0, 0, 0],
  rotationY = 0,
  showWireframe = false,
}: HazardConePropProps) {
  return (
    <group
      name="hazard-cone-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* Weighted Dark Rubber Square Base Flush at y = 0 */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.02, 0]}
        material={TOYBOX_MATERIALS.tireRubber}
      >
        <boxGeometry args={[0.26, 0.04, 0.26]} />
      </mesh>
      {/* Faceted Octagonal Tapered Safety-Orange Cone Body */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.36, 0]}
        material={PROP_ACCENT_MATERIALS.safetyConeOrange}
      >
        <cylinderGeometry args={[0.028, 0.108, 0.64, 8]} />
      </mesh>
      {/* Twin Reflective White Collar Bands */}
      <mesh
        position={[0, 0.34, 0]}
        material={DECAL.coneWhite}
      >
        <cylinderGeometry args={[0.082, 0.094, 0.085, 8]} />
      </mesh>
      <mesh
        position={[0, 0.49, 0]}
        material={DECAL.coneWhite}
      >
        <cylinderGeometry args={[0.064, 0.075, 0.07, 8]} />
      </mesh>

      {showWireframe && (
        <mesh
          position={[0, 0.34, 0]}
          material={TOYBOX_MATERIALS.qaBoundsWireframe}
        >
          <boxGeometry args={[0.26, 0.68, 0.26]} />
        </mesh>
      )}
    </group>
  );
}

/* ============================================================================
 * 2. Chalkboard Menu A-Frame Board (`menu_a_frame_board`, [0.65, 1.05, 0.55])
 * ============================================================================ */

export interface MenuAFrameBoardPropProps {
  position?: [number, number, number];
  rotationY?: number;
  showWireframe?: boolean;
}

/**
 * Cedar sidewalk A-frame chalkboard sign next to the corner hotdog cart,
 * seated cleanly on rubber footpads at exact y = 0.00m.
 */
export function MenuAFrameBoardProp({
  position = [0, 0, 0],
  rotationY = 0,
  showWireframe = false,
}: MenuAFrameBoardPropProps) {
  const splayRad = 0.23;

  return (
    <group
      name="menu-a-frame-board-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* 4 Rubber Foot Pads Seated Flush at y = 0 */}
      {[-0.25, 0.25].map((fx) =>
        [-0.22, 0.22].map((fz, idx) => (
          <mesh
            key={`foot-${fx}-${idx}`}
            position={[fx, 0.012, fz]}
            material={TOYBOX_MATERIALS.tireRubber}
          >
            <boxGeometry args={[0.055, 0.024, 0.055]} />
          </mesh>
        ))
      )}

      {/* Front & Back Angled Cedar Timber + Chalkboard Faces */}
      {([-1, 1] as const).map((side) => (
        <group
          key={`leaf-${side}`}
          position={[0, 0.52, side * 0.115]}
          rotation={[side * splayRad, 0, 0]}
        >
          {/* Outer Cedar Wood Frame */}
          <mesh
            castShadow
            receiveShadow
            material={TOYBOX_MATERIALS.cedarWood}
          >
            <boxGeometry args={[0.62, 1.02, 0.036]} />
          </mesh>
          {/* Dark Matte Chalkboard Face */}
          <mesh
            position={[0, 0.04, side * 0.026]}
            material={DECAL.chalkboardFace}
          >
            <boxGeometry args={[0.5, 0.78, 0.014]} />
          </mesh>
          {/* Stylized Menu Chalk Lines & Coral Header Ribbon */}
          <mesh
            position={[0, 0.3, side * 0.044]}
            material={DECAL.chalkHeader}
          >
            <boxGeometry args={[0.38, 0.07, 0.008]} />
          </mesh>
          {[0.14, 0.02, -0.1, -0.22].map((ly, lIdx) => (
            <mesh
              key={`line-${lIdx}`}
              position={[lIdx === 1 ? -0.04 : 0, ly, side * 0.044]}
              material={DECAL.chalkLine}
            >
              <boxGeometry
                args={[lIdx % 2 === 0 ? 0.36 : 0.28, 0.036, 0.008]}
              />
            </mesh>
          ))}
        </group>
      ))}

      {/* Brass Top Hinge Bar & Mid-Height Side Stay Chains */}
      <mesh
        position={[0, 1.02, 0]}
        rotation={[0, 0, Math.PI * 0.5]}
        material={TOYBOX_MATERIALS.brassAccent}
      >
        <cylinderGeometry args={[0.018, 0.018, 0.64, 8]} />
      </mesh>
      {[-0.31, 0.31].map((cx, idx) => (
        <mesh
          key={`stay-${idx}`}
          position={[cx, 0.34, 0]}
          material={TOYBOX_MATERIALS.brassAccent}
        >
          <boxGeometry args={[0.036, 0.036, 0.28]} />
        </mesh>
      ))}

      {showWireframe && (
        <mesh
          position={[0, 0.525, 0]}
          material={TOYBOX_MATERIALS.qaBoundsWireframe}
        >
          <boxGeometry args={[0.65, 1.05, 0.55]} />
        </mesh>
      )}
    </group>
  );
}

/* ============================================================================
 * 3. Subway / Promenade Slatted Wood Bench (`subway_bench`, [1.85, 0.88, 0.68])
 * ============================================================================ */

export interface SubwayBenchPropProps {
  position?: [number, number, number];
  rotationY?: number;
  showWireframe?: boolean;
}

/**
 * Classic cast-iron and slatted oak corner promenade bench seated flush at y = 0.
 */
export function SubwayBenchProp({
  position = [0, 0, 0],
  rotationY = 0,
  showWireframe = false,
}: SubwayBenchPropProps) {
  return (
    <group
      name="subway-bench-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* 3 Cast-Iron Frame Standards with Base Footplates at y = 0 */}
      {[-0.82, 0, 0.82].map((sx, idx) => (
        <group key={`leg-frame-${idx}`} position={[sx, 0, 0]}>
          {/* Front & Rear Ground Foot Pads */}
          <mesh
            castShadow
            receiveShadow
            position={[0, 0.015, 0.24]}
            material={TOYBOX_MATERIALS.bistroCastIron}
          >
            <boxGeometry args={[0.075, 0.03, 0.11]} />
          </mesh>
          <mesh
            castShadow
            receiveShadow
            position={[0, 0.015, -0.24]}
            material={TOYBOX_MATERIALS.bistroCastIron}
          >
            <boxGeometry args={[0.075, 0.03, 0.11]} />
          </mesh>
          {/* Front Leg */}
          <mesh
            castShadow
            position={[0, 0.22, 0.23]}
            material={TOYBOX_MATERIALS.bistroCastIron}
          >
            <boxGeometry args={[0.045, 0.42, 0.055]} />
          </mesh>
          {/* Rear Leg Rising to Backrest */}
          <mesh
            castShadow
            position={[0, 0.42, -0.24]}
            rotation={[-0.12, 0, 0]}
            material={TOYBOX_MATERIALS.bistroCastIron}
          >
            <boxGeometry args={[0.045, 0.84, 0.055]} />
          </mesh>
          {/* Under-Seat Cross Bracket */}
          <mesh
            castShadow
            position={[0, 0.41, 0]}
            material={TOYBOX_MATERIALS.bistroCastIron}
          >
            <boxGeometry args={[0.04, 0.045, 0.5]} />
          </mesh>
          {/* End Armrests Only on Left/Right Standards */}
          {idx !== 1 && (
            <group>
              <mesh
                castShadow
                position={[0, 0.62, 0.02]}
                material={TOYBOX_MATERIALS.bistroCastIron}
              >
                <boxGeometry args={[0.058, 0.04, 0.5]} />
              </mesh>
              <mesh
                castShadow
                position={[0, 0.52, 0.23]}
                material={TOYBOX_MATERIALS.bistroCastIron}
              >
                <boxGeometry args={[0.036, 0.2, 0.045]} />
              </mesh>
            </group>
          )}
        </group>
      ))}

      {/* 4 Oak Seat Slats */}
      {[-0.16, -0.04, 0.08, 0.2].map((sz, idx) => (
        <mesh
          key={`seat-slat-${idx}`}
          castShadow
          receiveShadow
          position={[0, 0.445, sz]}
          material={PROP_ACCENT_MATERIALS.oakBenchSlats}
        >
          <boxGeometry args={[1.82, 0.036, 0.095]} />
        </mesh>
      ))}

      {/* 3 Angled Oak Backrest Slats */}
      {[0.57, 0.69, 0.81].map((by, idx) => (
        <mesh
          key={`back-slat-${idx}`}
          castShadow
          receiveShadow
          position={[0, by, -0.23 - idx * 0.015]}
          rotation={[-0.12, 0, 0]}
          material={PROP_ACCENT_MATERIALS.oakBenchSlats}
        >
          <boxGeometry args={[1.82, 0.085, 0.036]} />
        </mesh>
      ))}

      {showWireframe && (
        <mesh
          position={[0, 0.44, 0]}
          material={TOYBOX_MATERIALS.qaBoundsWireframe}
        >
          <boxGeometry args={[1.85, 0.88, 0.68]} />
        </mesh>
      )}
    </group>
  );
}

/* ============================================================================
 * 4. Domed Urban Litter Receptacle (`trash_receptacle`, [0.58, 0.96, 0.58])
 * ============================================================================ */

export interface TrashReceptaclePropProps {
  position?: [number, number, number];
  rotationY?: number;
  showWireframe?: boolean;
}

/**
 * Faceted forest-green & cast-iron hooded urban trash bin seated flush at y = 0.
 */
export function TrashReceptacleProp({
  position = [0, 0, 0],
  rotationY = 0,
  showWireframe = false,
}: TrashReceptaclePropProps) {
  return (
    <group
      name="trash-receptacle-prop"
      position={position}
      rotation={[0, rotationY, 0]}
    >
      {/* Flanged Cast-Iron Foot Ring Seated Flush at y = 0 */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.025, 0]}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry args={[0.25, 0.28, 0.05, 10]} />
      </mesh>
      {/* Inner Dark Liner Drum */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.37, 0]}
        material={TOYBOX_MATERIALS.darkIron}
      >
        <cylinderGeometry args={[0.21, 0.195, 0.64, 10]} />
      </mesh>
      {/* Exterior Slatted Forest-Green Wrought-Iron Rib Basket */}
      {Array.from({ length: 10 }, (_, idx) => {
        const a = (idx / 10) * Math.PI * 2;
        const r = 0.232;
        return (
          <mesh
            key={`rib-${idx}`}
            position={[Math.cos(a) * r, 0.37, Math.sin(a) * r]}
            rotation={[0, -a, 0]}
            material={TOYBOX_MATERIALS.subwayIronGreen}
          >
            <boxGeometry args={[0.036, 0.66, 0.036]} />
          </mesh>
        );
      })}
      {/* Brass & Steel Rim Collar */}
      <mesh
        castShadow
        position={[0, 0.69, 0]}
        material={TOYBOX_MATERIALS.brassAccent}
      >
        <cylinderGeometry args={[0.26, 0.25, 0.05, 10]} />
      </mesh>
      {/* Hooded Rain Canopy Cap (top = 0.96m) */}
      {[0, 1, 2, 3].map((idx) => {
        const a = (idx / 4) * Math.PI * 2 + Math.PI * 0.25;
        const r = 0.2;
        return (
          <mesh
            key={`hood-post-${idx}`}
            position={[Math.cos(a) * r, 0.77, Math.sin(a) * r]}
            material={TOYBOX_MATERIALS.subwayIronGreen}
          >
            <cylinderGeometry args={[0.018, 0.018, 0.14, 6]} />
          </mesh>
        );
      })}
      <mesh
        castShadow
        position={[0, 0.87, 0]}
        material={TOYBOX_MATERIALS.subwayIronGreen}
      >
        <cylinderGeometry args={[0.16, 0.28, 0.1, 10]} />
      </mesh>
      <mesh
        castShadow
        position={[0, 0.935, 0]}
        material={TOYBOX_MATERIALS.brassAccent}
      >
        <sphereGeometry args={[0.035, 8, 6]} />
      </mesh>

      {showWireframe && (
        <mesh
          position={[0, 0.48, 0]}
          material={TOYBOX_MATERIALS.qaBoundsWireframe}
        >
          <boxGeometry args={[0.58, 0.96, 0.58]} />
        </mesh>
      )}
    </group>
  );
}

/* ============================================================================
 * 5. Courtyard Limestone Planter Hedge (`planter_hedge_rough`, [1.1, 0.92, 2.7])
 * ============================================================================ */

export interface PlanterHedgePropProps {
  position?: [number, number, number];
  rotationY?: number;
  width?: number;
  depth?: number;
  propId?: string;
  showWireframe?: boolean;
}

/**
 * Walkabout: Venice-inspired carved limestone boxwood planter trough
 * seated flush at y = 0 on the courtyard dining terrace, with faceted
 * sculpted hedges and subtle coral terrace blooms.
 */
export function PlanterHedgeProp({
  position = [0, 0, 0],
  rotationY = 0,
  width = 1.1,
  depth = 2.7,
  propId = 'planter-hedge',
  showWireframe = false,
}: PlanterHedgePropProps) {
  return (
    <group
      name="planter-hedge-prop"
      position={position}
      rotation={[0, rotationY, 0]}
      userData={{ occludableProp: true, propId }}
    >
      {/* Plinth Base & Carved Limestone Planter Box Flush at y = 0 */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.04, 0]}
        material={TOYBOX_MATERIALS.limestoneCurb}
      >
        <boxGeometry args={[width, 0.08, depth]} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.21, 0]}
        material={TOYBOX_MATERIALS.poolWallLimestone}
      >
        <boxGeometry args={[width - 0.06, 0.26, depth - 0.06]} />
      </mesh>
      {/* Overhanging Coping Rim + Corner Pillars */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.365, 0]}
        material={TOYBOX_MATERIALS.limestoneTrim}
      >
        <boxGeometry args={[width, 0.05, depth]} />
      </mesh>
      {/* Recessed Mulch / Soil Bed */}
      <mesh
        receiveShadow
        position={[0, 0.385, 0]}
        material={DECAL.soilBed}
      >
        <boxGeometry args={[width - 0.16, 0.04, depth - 0.16]} />
      </mesh>

      {/* Sculpted Two-Tier Beveled Boxwood Topiary Hedge */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.56, 0]}
        material={TOYBOX_MATERIALS.foliageEmerald}
      >
        <boxGeometry args={[width - 0.22, 0.36, depth - 0.22]} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.79, 0]}
        material={TOYBOX_MATERIALS.foliageEmerald}
      >
        <boxGeometry args={[width - 0.34, 0.16, depth - 0.34]} />
      </mesh>
      {/* Cleanly Seated Crown Topiary Finial Spheres & Geranium Blossoms */}
      {[-depth * 0.28, 0, depth * 0.28].map((hz, idx) => (
        <group key={`shrub-${idx}`} position={[0, 0.86, hz]}>
          <mesh
            castShadow
            receiveShadow
            scale={[0.85, 0.75, 0.95]}
            material={TOYBOX_MATERIALS.foliageSunny}
          >
            <icosahedronGeometry args={[0.21, 1]} />
          </mesh>
          <mesh
            position={[idx % 2 === 0 ? 0.14 : -0.14, 0.08, 0.1]}
            material={TOYBOX_MATERIALS.flowerCoral}
          >
            <icosahedronGeometry args={[0.058, 0]} />
          </mesh>
          <mesh
            position={[idx % 2 === 0 ? -0.12 : 0.12, 0.05, -0.1]}
            material={TOYBOX_MATERIALS.flowerCoral}
          >
            <icosahedronGeometry args={[0.048, 0]} />
          </mesh>
        </group>
      ))}

      {showWireframe && (
        <mesh
          position={[0, 0.46, 0]}
          material={TOYBOX_MATERIALS.qaBoundsWireframe}
        >
          <boxGeometry args={[width, 0.92, depth]} />
        </mesh>
      )}
    </group>
  );
}

/* ============================================================================
 * 6. Subway Stairwell Kiosk Portal (`subway_entrance_portal`, [4.2, 3.1, 3.4])
 * ============================================================================ */

export interface SubwayPortalPropProps {
  position?: [number, number, number];
  rotationY?: number;
  propId?: string;
  showWireframe?: boolean;
}

/**
 * Iconic NYC / Venetian wrought-iron Subway Stairwell Kiosk behind Hole 1 Tee.
 * - Seated flush on the south plaza at y = 0.00m.
 * - Entrance opening faces local +Z (so rotationY = PI points north straight into 5th Ave).
 * - Granite knee walls, forest-green pipe railings, cream subway-tile side walls with green mosaic
 *   trim, central & wall brass handrails sloping down into a dark #0E1418 recessed tunnel arch,
 *   warm glowing tunnel globe lamp, and overhead "5TH & MERCER" lintel (height 3.10m).
 */
export function SubwayPortalProp({
  position = [0, 0, 0],
  rotationY = 0,
  propId = 'subway-portal-south',
  showWireframe = false,
}: SubwayPortalPropProps) {
  // Handrail pitch ~11.2 deg downward from +Z entrance down into -Z dark tunnel mouth
  const railTiltRad = 0.195;

  return (
    <group
      name="subway-portal-prop"
      position={position}
      rotation={[0, rotationY, 0]}
      userData={{ occludableProp: true, propId }}
    >
      {/* Perimeter Limestone Curb Apron (exact corner-flush, zero coplanar overlap) */}
      {[-1.73, 1.73].map((ax, idx) => (
        <mesh
          key={`apron-side-${idx}`}
          receiveShadow
          position={[ax, 0.02, 0]}
          material={TOYBOX_MATERIALS.limestoneCurb}
        >
          <boxGeometry args={[0.7, 0.04, 3.36]} />
        </mesh>
      ))}
      <mesh
        receiveShadow
        position={[0, 0.02, -1.52]}
        material={TOYBOX_MATERIALS.limestoneCurb}
      >
        <boxGeometry args={[2.76, 0.04, 0.32]} />
      </mesh>
      <mesh
        receiveShadow
        position={[0, 0.02, 1.48]}
        material={TOYBOX_MATERIALS.limestoneCurb}
      >
        <boxGeometry args={[2.76, 0.04, 0.4]} />
      </mesh>

      {/* Deep Recessed #0E1418 Tunnel Chute Floor Pan */}
      <mesh
        position={[0, 0.008, -0.04]}
        material={DECAL.tunnelFloorPan}
      >
        <boxGeometry args={[2.76, 0.016, 2.64]} />
      </mesh>

      {/* Left & Right Carved Stone Knee Walls (x = +/- 1.62) */}
      {[-1.62, 1.62].map((wx, idx) => (
        <group key={`knee-wall-${idx}`} position={[wx, 0, 0]}>
          <mesh
            castShadow
            receiveShadow
            position={[0, 0.42, 0]}
            material={TOYBOX_MATERIALS.poolWallLimestone}
          >
            <boxGeometry args={[0.42, 0.8, 3.24]} />
          </mesh>
          <mesh
            castShadow
            receiveShadow
            position={[0, 0.84, 0]}
            material={TOYBOX_MATERIALS.limestoneTrim}
          >
            <boxGeometry args={[0.48, 0.08, 3.32]} />
          </mesh>
          {/* Forest-Green Cast-Iron Pipe Railings Along Side Walls (butt-mitered cleanly at z = -1.51) */}
          <mesh
            castShadow
            position={[0, 1.16, 0.04]}
            material={TOYBOX_MATERIALS.subwayIronGreen}
          >
            <boxGeometry args={[0.08, 0.06, 3.1]} />
          </mesh>
          {[-1.4, -0.46, 0.48].map((pz, pIdx) => (
            <mesh
              key={`rail-post-${pIdx}`}
              castShadow
              position={[0, 1.0, pz]}
              material={TOYBOX_MATERIALS.subwayIronGreen}
            >
              <cylinderGeometry args={[0.036, 0.04, 0.34, 8]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Glazed Subway-Tile Interior Cheek Walls + Classic Forest-Green Trim + Sloped Wall Rails */}
      {([-1, 1] as const).map((side) => (
        <group key={`tile-wall-${side}`}>
          {/* Cream Glazed Ceramic Tile Wall Panel */}
          <mesh
            receiveShadow
            position={[side * 1.37, 0.42, 0.04]}
            material={PROP_ACCENT_MATERIALS.subwayTileCream}
          >
            <boxGeometry args={[0.06, 0.78, 2.52]} />
          </mesh>
          {/* Classic IRT Forest-Green Glazed Mosaic Trim Stripe */}
          <mesh
            position={[side * 1.334, 0.62, 0.04]}
            material={DECAL.tileGreenBand}
          >
            <boxGeometry args={[0.024, 0.08, 2.48]} />
          </mesh>
          {/* Subtle Horizontal Tile Course Shadow Seam */}
          <mesh
            position={[side * 1.332, 0.36, 0.04]}
            material={DECAL.tileSeam}
          >
            <boxGeometry args={[0.02, 0.036, 2.48]} />
          </mesh>
          {/* Sloped Side Brass Handrail Reinforcing Descent Perspective */}
          <mesh
            position={[side * 1.26, 0.51, 0.01]}
            rotation={[Math.PI * 0.5 - railTiltRad, 0, 0]}
            material={TOYBOX_MATERIALS.brassAccent}
          >
            <cylinderGeometry args={[0.022, 0.022, 2.16, 8]} />
          </mesh>
          {[
            { z: 0.94, y: 0.69 },
            { z: -0.02, y: 0.5 },
            { z: -0.96, y: 0.32 },
          ].map((bk, bIdx) => (
            <mesh
              key={`wall-bracket-${side}-${bIdx}`}
              position={[side * 1.3, bk.y, bk.z]}
              material={TOYBOX_MATERIALS.brassAccent}
            >
              <boxGeometry args={[0.09, 0.036, 0.036]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Exterior Rear Headwall Parapet Strictly Behind the #0E1418 Dark Tunnel Void */}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.46, -1.51]}
        material={TOYBOX_MATERIALS.poolWallLimestone}
      >
        <boxGeometry args={[2.86, 0.88, 0.26]} />
      </mesh>
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.92, -1.51]}
        material={TOYBOX_MATERIALS.limestoneTrim}
      >
        <boxGeometry args={[2.92, 0.08, 0.32]} />
      </mesh>
      {/* Mitered Rear Green Pipe Railing + 4 Vertical Stanchions Anchored Into Coping */}
      <mesh
        castShadow
        position={[0, 1.16, -1.55]}
        material={TOYBOX_MATERIALS.subwayIronGreen}
      >
        <boxGeometry args={[3.32, 0.06, 0.08]} />
      </mesh>
      {[-1.24, -0.42, 0.42, 1.24].map((rx, rIdx) => (
        <mesh
          key={`rear-rail-post-${rIdx}`}
          castShadow
          position={[rx, 1.045, -1.55]}
          material={TOYBOX_MATERIALS.subwayIronGreen}
        >
          <cylinderGeometry args={[0.036, 0.04, 0.22, 8]} />
        </mesh>
      ))}

      {/* Recessed Deep Shadow #0E1418 Tunnel Mouth & Multi-Rib Vaulted Portal Frame */}
      <mesh
        position={[0, 0.44, -1.34]}
        material={PROP_ACCENT_MATERIALS.subwayTunnelVoid}
      >
        <boxGeometry args={[2.76, 0.86, 0.06]} />
      </mesh>
      {/* Inner Depth Arch Shadow Ribs Stepped Deeper Into Void */}
      {[-1.23, -1.29].map((rz, rIdx) => (
        <group key={`tunnel-rib-${rIdx}`} position={[0, 0, rz]}>
          {[-1, 1].map((side) => (
            <mesh
              key={`rib-pillar-${side}`}
              position={[side * (1.22 - rIdx * 0.06), 0.34, 0]}
              material={PROP_ACCENT_MATERIALS.subwayTunnelArch}
            >
              <boxGeometry args={[0.14, 0.66, 0.05]} />
            </mesh>
          ))}
          <mesh
            position={[0, 0.77, 0]}
            material={PROP_ACCENT_MATERIALS.subwayTunnelArch}
          >
            <boxGeometry args={[2.56, 0.16, 0.05]} />
          </mesh>
        </group>
      ))}
      {/* Front Vaulted Tunnel Portal Pilasters, Curved Haunches & Brow */}
      {([-1, 1] as const).map((side) => (
        <group key={`tunnel-arch-${side}`}>
          <mesh
            castShadow
            receiveShadow
            position={[side * 1.26, 0.34, -1.16]}
            material={PROP_ACCENT_MATERIALS.subwayTunnelArch}
          >
            <boxGeometry args={[0.2, 0.66, 0.14]} />
          </mesh>
          <mesh
            castShadow
            position={[side * 1.0, 0.66, -1.16]}
            rotation={[0, 0, -side * 0.48]}
            material={PROP_ACCENT_MATERIALS.subwayTunnelArch}
          >
            <boxGeometry args={[0.56, 0.16, 0.14]} />
          </mesh>
        </group>
      ))}
      <mesh
        castShadow
        receiveShadow
        position={[0, 0.8, -1.16]}
        material={PROP_ACCENT_MATERIALS.subwayTunnelArch}
      >
        <boxGeometry args={[2.76, 0.15, 0.16]} />
      </mesh>

      {/* Warm Glowing Subway Tunnel Pendant Globe Lamp Centered Beneath Arch Crown */}
      <group position={[0, 0.64, -1.12]}>
        <mesh
          position={[0, 0.12, 0]}
          material={TOYBOX_MATERIALS.subwayIronGreen}
        >
          <cylinderGeometry args={[0.022, 0.022, 0.12, 8]} />
        </mesh>
        <mesh
          position={[0, 0.06, 0]}
          material={TOYBOX_MATERIALS.brassAccent}
        >
          <cylinderGeometry args={[0.068, 0.048, 0.036, 10]} />
        </mesh>
        <mesh position={[0, -0.02, 0]} material={PROP_ACCENT_MATERIALS.subwayWarmGlobe}>
          <sphereGeometry args={[0.095, 12, 10]} />
        </mesh>
      </group>

      {/* Descending Staircase Treads (Step Down From +Z Entry Into -Z Dark Tunnel) */}
      {[
        { z: 1.14, h: 0.068, mat: TOYBOX_MATERIALS.limestoneSidewalk },
        { z: 0.72, h: 0.058, mat: TOYBOX_MATERIALS.limestoneSidewalk },
        { z: 0.3, h: 0.048, mat: PROP_ACCENT_MATERIALS.subwayTunnelTreadMid },
        { z: -0.12, h: 0.038, mat: TOYBOX_MATERIALS.stormDrainSteel },
        { z: -0.54, h: 0.028, mat: PROP_ACCENT_MATERIALS.subwayTunnelTreadDeep },
        { z: -0.96, h: 0.018, mat: PROP_ACCENT_MATERIALS.subwaySignDark },
      ].map((step, idx) => (
        <group key={`stair-step-${idx}`}>
          <mesh
            receiveShadow
            position={[0, 0.004 + (step.h + STEP_LIFT) * 0.5, step.z]}
            material={step.mat}
          >
            <boxGeometry args={[2.64, step.h + STEP_LIFT, 0.39]} />
          </mesh>
          {/* High-Contrast Safety Nosing Strip at Top Leading Edge of Each Step */}
          <mesh
            position={[0, 0.005 + step.h + STEP_LIFT, step.z + 0.175]}
            material={DECAL.stepNosing}
          >
            <boxGeometry args={[2.64, 0.03, 0.036]} />
          </mesh>
        </group>
      ))}

      {/* Central Brass Handrail Sloping Cleanly Downward Into Tunnel */}
      <group>
        <mesh
          castShadow
          position={[0, 0.57, 0.02]}
          rotation={[Math.PI * 0.5 - railTiltRad, 0, 0]}
          material={TOYBOX_MATERIALS.brassAccent}
        >
          <cylinderGeometry args={[0.028, 0.028, 2.18, 10]} />
        </mesh>
        <mesh
          position={[0, 0.78, 1.09]}
          material={TOYBOX_MATERIALS.brassAccent}
        >
          <sphereGeometry args={[0.036, 10, 8]} />
        </mesh>
        {[
          { z: 0.96, topY: 0.75, baseY: 0.07 + STEP_LIFT },
          { z: 0.02, topY: 0.57, baseY: 0.05 + STEP_LIFT },
          { z: -0.92, topY: 0.39, baseY: 0.02 + STEP_LIFT },
        ].map((post, pIdx) => {
          const postH = post.topY - post.baseY;
          return (
            <group key={`center-rail-post-${pIdx}`}>
              <mesh
                castShadow
                position={[0, post.baseY + postH * 0.5, post.z]}
                material={TOYBOX_MATERIALS.subwayIronGreen}
              >
                <cylinderGeometry args={[0.026, 0.032, postH, 8]} />
              </mesh>
              <mesh
                position={[0, post.baseY + 0.015, post.z]}
                material={TOYBOX_MATERIALS.brassAccent}
              >
                <cylinderGeometry args={[0.052, 0.058, 0.03, 8]} />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* Twin Front Ornate Iron Portal Columns + Classic Green Globe Streetlamps (+Z = +1.48) */}
      {[-1.62, 1.62].map((px, idx) => (
        <group key={`portal-pillar-${idx}`} position={[px, 0.88, 1.48]}>
          {/* Main Fluted Iron Column */}
          <mesh
            castShadow
            position={[0, 0.92, 0]}
            material={TOYBOX_MATERIALS.subwayIronGreen}
          >
            <cylinderGeometry args={[0.078, 0.098, 1.84, 8]} />
          </mesh>
          {/* Ornate Brass Collar */}
          <mesh
            castShadow
            position={[0, 1.84, 0]}
            material={TOYBOX_MATERIALS.brassAccent}
          >
            <cylinderGeometry args={[0.108, 0.09, 0.08, 8]} />
          </mesh>
          {/* Glowing Emerald Subway Entrance Globe Lamp (top ~3.08m <= 3.10m) */}
          <mesh
            position={[0, 2.04, 0]}
            material={TOYBOX_MATERIALS.subwayGlobeGreen}
          >
            <sphereGeometry args={[0.17, 12, 10]} />
          </mesh>
          {/* Brass Top Cap Finial */}
          <mesh
            position={[0, 2.2, 0]}
            material={TOYBOX_MATERIALS.brassAccent}
          >
            <coneGeometry args={[0.055, 0.06, 8]} />
          </mesh>
        </group>
      ))}

      {/* Overhead Station Canopy Header & Illuminated "5TH & MERCER" Lintel */}
      <group position={[0, 2.54, 1.48]}>
        <mesh
          castShadow
          receiveShadow
          material={TOYBOX_MATERIALS.subwayIronGreen}
        >
          <boxGeometry args={[3.56, 0.36, 0.28]} />
        </mesh>
        {/* Dark Enamel Station Nameplate */}
        <mesh
          position={[0, 0, 0.145]}
          material={DECAL.signPlate}
        >
          <boxGeometry args={[2.9, 0.24, 0.03]} />
        </mesh>
        {/* Crisp Cream Trim Stripe + Balanced Transit Route Bullets & Centered Station Plaque */}
        <mesh
          position={[0, -0.072, 0.165]}
          material={DECAL.signStripe}
        >
          <boxGeometry args={[2.68, 0.034, 0.02]} />
        </mesh>
        {/* Left Route Bullet Pair (Lines 5 & M) */}
        {[-1.12, -0.9].map((bx, idx) => (
          <mesh
            key={`bullet-l-${idx}`}
            position={[bx, 0.028, 0.166]}
            rotation={[Math.PI * 0.5, 0, 0]}
            material={idx === 0 ? DECAL.bulletCoral : DECAL.bulletAmber}
          >
            <cylinderGeometry args={[0.068, 0.068, 0.02, 14]} />
          </mesh>
        ))}
        {/* Centered Diegetic Enamel Wordmark Grouping ("5TH & MERCER ST") */}
        <group position={[0.04, 0.03, 0.166]}>
          <mesh position={[-0.4, 0, 0]} material={DECAL.signStripe}>
            <boxGeometry args={[0.36, 0.056, 0.018]} />
          </mesh>
          <mesh position={[-0.12, 0, 0]} material={DECAL.bulletAmber}>
            <boxGeometry args={[0.08, 0.056, 0.018]} />
          </mesh>
          <mesh position={[0.24, 0, 0]} material={DECAL.signStripe}>
            <boxGeometry args={[0.5, 0.056, 0.018]} />
          </mesh>
        </group>
        {/* Symmetrical Right Station Express & Brass Wayfinding Medallions */}
        <mesh
          position={[0.92, 0.028, 0.166]}
          rotation={[Math.PI * 0.5, 0, 0]}
          material={DECAL.bulletCoral}
        >
          <cylinderGeometry args={[0.064, 0.064, 0.02, 14]} />
        </mesh>
        <mesh
          position={[1.14, 0.028, 0.166]}
          rotation={[Math.PI * 0.5, 0, 0]}
          material={DECAL.signStripe}
        >
          <cylinderGeometry args={[0.064, 0.064, 0.02, 14]} />
        </mesh>
        {/* Peaked Pediment Crest */}
        <mesh
          castShadow
          position={[0, 0.23, 0]}
          material={TOYBOX_MATERIALS.subwayIronGreen}
        >
          <boxGeometry args={[3.68, 0.1, 0.34]} />
        </mesh>
      </group>

      {showWireframe && (
        <mesh
          position={[0, 1.55, 0]}
          material={TOYBOX_MATERIALS.qaBoundsWireframe}
        >
          <boxGeometry args={[4.2, 3.1, 3.4]} />
        </mesh>
      )}
    </group>
  );
}
