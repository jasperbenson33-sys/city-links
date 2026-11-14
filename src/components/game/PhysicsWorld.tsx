'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import {
  CuboidCollider,
  CylinderCollider,
  RigidBody,
} from '@react-three/rapier';
import {
  ARCHITECTURAL_WALLS,
  COURSE_MASTER_PLAN,
  COURSE_PROPS,
  GROUND_ZONES,
  HOLE_1_CUP,
  PERIMETER_BUILDINGS,
  STONE_CURBS,
  STORM_GUTTERS,
  WALKABLE_RAMPS,
} from '@/config/courseMasterPlan';
import {
  BALL_RADIUS,
  CUP_DEPTH,
  CUP_RADIUS,
  type StoneCurbSegmentSpec,
  type Vec3Tuple,
} from '@/types';
import {
  buildArcWallSegments,
  computeMasterPlanRampTransform,
  subtractRect2D,
  type RectBoundsXZ,
} from '@/physics';

function aabbToBox(aabb: { min: Vec3Tuple; max: Vec3Tuple }) {
  const cx = (aabb.min[0] + aabb.max[0]) * 0.5;
  const cy = (aabb.min[1] + aabb.max[1]) * 0.5;
  const cz = (aabb.min[2] + aabb.max[2]) * 0.5;
  const hx = Math.max(0.02, (aabb.max[0] - aabb.min[0]) * 0.5);
  const hy = Math.max(0.02, (aabb.max[1] - aabb.min[1]) * 0.5);
  const hz = Math.max(0.02, (aabb.max[2] - aabb.min[2]) * 0.5);
  return {
    center: [cx, cy, cz] as Vec3Tuple,
    halfExtents: [hx, hy, hz] as Vec3Tuple,
  };
}

function boundsToSlabBox(
  boundsXZ: RectBoundsXZ,
  topY: number,
  slabThickness: number,
) {
  const { minX, maxX, minZ, maxZ } = boundsXZ;
  const thickness = Math.max(0.24, slabThickness);
  return {
    center: [
      (minX + maxX) * 0.5,
      topY - thickness * 0.5,
      (minZ + maxZ) * 0.5,
    ] as Vec3Tuple,
    halfExtents: [
      Math.max(0.02, (maxX - minX) * 0.5),
      thickness * 0.5,
      Math.max(0.02, (maxZ - minZ) * 0.5),
    ] as Vec3Tuple,
  };
}

function buildCurvedSegments(curb: StoneCurbSegmentSpec) {
  if (
    !curb.arcPivotXZ ||
    curb.arcRadius === undefined ||
    curb.startAngleRad === undefined ||
    curb.endAngleRad === undefined
  ) {
    return [];
  }
  return buildArcWallSegments({
    pivotX: curb.arcPivotXZ[0],
    pivotZ: curb.arcPivotXZ[1],
    radius: curb.arcRadius,
    startAngleRad: curb.startAngleRad,
    endAngleRad: curb.endAngleRad,
    bottomY: curb.bottomY,
    topY: curb.topY,
    wallThickness: 0.25,
    segments: 12,
  });
}

export function PhysicsWorld() {
  const {
    groundSlabs,
    cornerApronFillBoxes,
    cornerRoadFillBoxes,
    gutterFloors,
    curvedGutterFloorSegments,
    straightCurbs,
    curvedCurbSegments,
    rampTransforms,
    buildingColliders,
    wallColliders,
    safetyWalls,
    scaffoldingColliders,
    vanRampTransforms,
    vanSolidBoxes,
    vanRoofDeckBox,
    treeColliders,
    awningCollider,
    cartBaseCollider,
    patioSolidColliders,
    fountainRimSegments,
    fountainSensor,
    steamSensor,
    hydrantSensor,
    cupRimSegments,
    cupBottomCollider,
    cupTrigger,
    worldFloor,
  } = useMemo(() => {
    const wb = COURSE_MASTER_PLAN.worldBoundsXZ;

    // 1. Sub-surface leak-proof base slab spanning full street + courtyard corridor (-0.025m top)
    const worldFloor = {
      center: [
        (wb.minX + wb.maxX) * 0.5,
        -0.325,
        (wb.minZ + wb.maxZ) * 0.5,
      ] as Vec3Tuple,
      halfExtents: [
        (wb.maxX - wb.minX) * 0.5 + 4,
        0.3,
        (wb.maxZ - wb.minZ) * 0.5 + 4,
      ] as Vec3Tuple,
    };

    // 2. Ground zones: partition courtyard terrace/fringe/green without coplanar overlap,
    // and carve a genuine cylindrical recessed well at HOLE_1_CUP.
    const fringeZone = GROUND_ZONES.find(
      (z) => z.id === 'zone-courtyard-green-fringe',
    );
    const greenZone = GROUND_ZONES.find(
      (z) => z.id === 'zone-courtyard-putting-green',
    );
    const patioNorthZone = GROUND_ZONES.find(
      (z) => z.id === 'zone-courtyard-patio-rough-north',
    );
    const patioSouthZone = GROUND_ZONES.find(
      (z) => z.id === 'zone-courtyard-patio-rough-south',
    );
    const cupCutoutXZ: RectBoundsXZ = {
      minX: HOLE_1_CUP.position[0] - CUP_RADIUS,
      maxX: HOLE_1_CUP.position[0] + CUP_RADIUS,
      minZ: HOLE_1_CUP.position[2] - CUP_RADIUS,
      maxZ: HOLE_1_CUP.position[2] + CUP_RADIUS,
    };

    const groundSlabs = GROUND_ZONES.filter((z) => !z.arcClip).flatMap((zone) => {
      const topY =
        zone.surfaceTag === 'fountain_hazard' ? zone.topY - 0.14 : zone.topY;
      const friction = Math.max(0.05, Math.min(0.95, zone.friction));
      let rects: RectBoundsXZ[] = [zone.boundsXZ];
      if (zone.id === 'zone-courtyard-stone-terrace') {
        const cutouts = [
          fringeZone?.boundsXZ,
          patioNorthZone?.boundsXZ,
          patioSouthZone?.boundsXZ,
        ].filter((b): b is RectBoundsXZ => Boolean(b));
        for (const hole of cutouts) {
          rects = rects.flatMap((r) => subtractRect2D(r, hole));
        }
      } else if (zone.id === 'zone-courtyard-green-fringe' && greenZone) {
        rects = subtractRect2D(zone.boundsXZ, greenZone.boundsXZ);
      } else if (zone.id === 'zone-courtyard-putting-green') {
        rects = subtractRect2D(zone.boundsXZ, cupCutoutXZ);
      }
      return rects.map((rect, idx) => ({
        id: rects.length === 1 ? zone.id : `${zone.id}-part-${idx}`,
        friction,
        restitution: zone.restitution,
        ...boundsToSlabBox(rect, topY, zone.slabThickness),
      }));
    });

    // Cylindrical recessed cup liner flush with +0.60m green surface & 14cm cup floor
    const cupRimSegments = buildArcWallSegments({
      pivotX: HOLE_1_CUP.position[0],
      pivotZ: HOLE_1_CUP.position[2],
      radius: CUP_RADIUS + 0.14,
      startAngleRad: 0,
      endAngleRad: Math.PI * 2,
      bottomY: HOLE_1_CUP.position[1] - CUP_DEPTH - 0.04,
      topY: HOLE_1_CUP.position[1],
      wallThickness: 0.28,
      segments: 16,
    }).map((seg, idx) => ({
      key: `cup-rim-${idx}`,
      seg,
    }));

    const cupBottomCollider = {
      center: [
        HOLE_1_CUP.position[0],
        HOLE_1_CUP.position[1] - CUP_DEPTH - 0.04,
        HOLE_1_CUP.position[2],
      ] as Vec3Tuple,
      halfHeight: 0.04,
      radius: CUP_RADIUS + 0.04,
    };

    const seApron = GROUND_ZONES.find(
      (z) => z.id === 'zone-se-vendor-corner-apron',
    );
    const cornerApronFillBoxes: Array<{
      id: string;
      center: Vec3Tuple;
      halfExtents: Vec3Tuple;
      friction: number;
      restitution: number;
    }> = [];
    if (seApron) {
      const topY = seApron.topY;
      const t = Math.max(0.24, seApron.slabThickness);
      const cy = topY - t * 0.5;
      // East of pivot X = 6.2 (clear of gutter arc)
      cornerApronFillBoxes.push({
        id: 'se-apron-east',
        center: [(6.2 + seApron.boundsXZ.maxX) * 0.5, cy, -16.375],
        halfExtents: [(seApron.boundsXZ.maxX - 6.2) * 0.5, t * 0.5, 1.625],
        friction: seApron.friction,
        restitution: seApron.restitution,
      });
      // South of pivot Z = -15.8 up to X = 6.2
      cornerApronFillBoxes.push({
        id: 'se-apron-south',
        center: [5.1, cy, (-15.8 + seApron.boundsXZ.maxZ) * 0.5],
        halfExtents: [1.1, t * 0.5, (seApron.boundsXZ.maxZ + 15.8) * 0.5],
        friction: seApron.friction,
        restitution: seApron.restitution,
      });
      // Inner SE sidewalk corner pie inside r <= 2.15 around pivot [6.2, -15.8]
      cornerApronFillBoxes.push({
        id: 'se-apron-inner-arc-a',
        center: [5.5, cy, -16.5],
        halfExtents: [0.7, t * 0.5, 0.7],
        friction: seApron.friction,
        restitution: seApron.restitution,
      });
    }

    // Arc-clipped zone-se-corner-road-spandrel (r >= 2.65m road asphalt fill at y = 0.00m)
    const seSpandrel = GROUND_ZONES.find(
      (z) => z.id === 'zone-se-corner-road-spandrel',
    );
    const spandrelTopY = seSpandrel?.topY ?? 0;
    const cornerRoadFillBoxes = [
      {
        id: 'se-road-corner-patch-1',
        center: [4.85, spandrelTopY - 0.15, -18.38] as Vec3Tuple,
        halfExtents: [1.3, 0.15, 0.24] as Vec3Tuple,
      },
      {
        id: 'se-road-corner-patch-2',
        center: [3.75, spandrelTopY - 0.15, -17.35] as Vec3Tuple,
        halfExtents: [0.22, 0.15, 1.1] as Vec3Tuple,
      },
      {
        id: 'se-road-corner-patch-corner',
        center: [3.95, spandrelTopY - 0.15, -18.08] as Vec3Tuple,
        halfExtents: [0.4, 0.15, 0.4] as Vec3Tuple,
      },
    ];

    // 3. Storm gutters (straight channels + curved SE corner floor flush at -0.02m)
    const gutterFloors = STORM_GUTTERS.filter((g) => g.kind === 'straight').map(
      (g) => ({
        id: g.id,
        ...aabbToBox(g.aabb),
      }),
    );

    const curvedGutterFloorSegments = STORM_GUTTERS.filter(
      (g) => g.kind === 'corner_90',
    ).flatMap((g) => {
      if (
        !g.arcPivot ||
        g.arcRadius === undefined ||
        g.startAngleRad === undefined ||
        g.endAngleRad === undefined
      ) {
        return [];
      }
      return buildArcWallSegments({
        pivotX: g.arcPivot[0],
        pivotZ: g.arcPivot[2],
        radius: g.arcRadius,
        startAngleRad: g.startAngleRad,
        endAngleRad: g.endAngleRad,
        bottomY: -0.25,
        topY: g.channelY,
        wallThickness: g.width + 0.06,
        segments: 12,
      }).map((seg, idx) => ({
        key: `${g.id}-floor-${idx}`,
        seg,
      }));
    });

    // 4. Stone curbs (straight + 45-degree beveled bank + curved)
    const straightCurbs = STONE_CURBS.filter(
      (c) => c.kind === 'straight' || c.kind === 'beveled_45',
    );
    const curvedCurbSegments = STONE_CURBS.filter(
      (c) => c.kind === 'curved_90',
    ).flatMap((curb) =>
      buildCurvedSegments(curb).map((seg, idx) => ({
        key: `${curb.id}-${idx}`,
        seg,
        friction: curb.friction,
        restitution: curb.restitution,
      })),
    );

    // 5. Walkable ramps (flush zero-lip sloped cuboids) + continuous gutter transition aprons
    const rampTransforms = [
      ...WALKABLE_RAMPS.map((ramp) => ({
        id: ramp.id,
        transform: computeMasterPlanRampTransform(ramp),
      })),
      {
        id: 'gutter-to-ramp-apron',
        transform: computeMasterPlanRampTransform({
          id: 'gutter-to-ramp-apron',
          label: 'Mercer South Gutter-to-Ramp Flush Apron (-0.02m -> 0.0067m)',
          surfaceTag: 'storm_gutter',
          boundsXZ: { minX: 13.8, maxX: 14.55, minZ: -18.55, maxZ: -17.98 },
          bottomY: -0.02,
          topY: 0.00667,
          climbDirection: 'east',
          slopeAngleDeg: 2.036,
          slabThickness: 0.25,
          friction: 0.35,
          restitution: 0.25,
          aabb: { min: [13.8, -0.25, -18.55], max: [14.55, 0.008, -17.98] },
        }),
      },
      {
        id: 'gutter-to-west-entry-apron',
        transform: computeMasterPlanRampTransform({
          id: 'gutter-to-west-entry-apron',
          label: 'West 5th Gutter-to-ADA-Entry Flush Apron (-0.02m -> 0.00m)',
          surfaceTag: 'storm_gutter',
          boundsXZ: { minX: -4.02, maxX: -3.88, minZ: 20, maxZ: 23 },
          bottomY: -0.02,
          topY: 0.0046,
          climbDirection: 'west',
          slopeAngleDeg: 10.0,
          slabThickness: 0.25,
          friction: 0.35,
          restitution: 0.2,
          aabb: { min: [-4.02, -0.25, 20], max: [-3.88, 0.005, 23] },
        }),
      },
      {
        id: 'gutter-to-west-exit-apron',
        transform: computeMasterPlanRampTransform({
          id: 'gutter-to-west-exit-apron',
          label: 'West 5th Gutter-to-ADA-Exit Flush Apron (-0.02m -> 0.00m)',
          surfaceTag: 'storm_gutter',
          boundsXZ: { minX: -4.02, maxX: -3.88, minZ: -16.5, maxZ: -13.5 },
          bottomY: -0.02,
          topY: 0.0046,
          climbDirection: 'west',
          slopeAngleDeg: 10.0,
          slabThickness: 0.25,
          friction: 0.35,
          restitution: 0.2,
          aabb: { min: [-4.02, -0.25, -16.5], max: [-3.88, 0.005, -13.5] },
        }),
      },
    ];

    // 6. Sealed perimeter buildings + architectural walls + world boundary safety walls
    const buildingColliders = PERIMETER_BUILDINGS.map((b) => ({
      id: b.id,
      ...aabbToBox(b.aabb),
    }));

    const wallColliders = ARCHITECTURAL_WALLS.map((w) => ({
      id: w.id,
      center: w.center,
      halfExtents: [
        Math.max(0.05, w.size[0] * 0.5),
        Math.max(0.05, w.size[1] * 0.5),
        Math.max(0.05, w.size[2] * 0.5),
      ] as Vec3Tuple,
      rotationY: w.rotationY,
      restitution: w.restitution,
    }));

    const wallH = 14;
    const safetyWalls: Array<{
      id: string;
      center: Vec3Tuple;
      halfExtents: Vec3Tuple;
    }> = [
      {
        id: 'seal-north',
        center: [(wb.minX + wb.maxX) * 0.5, wallH * 0.5 - 1, wb.minZ - 0.5],
        halfExtents: [(wb.maxX - wb.minX) * 0.5 + 2, wallH * 0.5, 0.5],
      },
      {
        id: 'seal-south',
        center: [(wb.minX + wb.maxX) * 0.5, wallH * 0.5 - 1, wb.maxZ + 0.5],
        halfExtents: [(wb.maxX - wb.minX) * 0.5 + 2, wallH * 0.5, 0.5],
      },
      {
        id: 'seal-west',
        center: [wb.minX - 0.5, wallH * 0.5 - 1, (wb.minZ + wb.maxZ) * 0.5],
        halfExtents: [0.5, wallH * 0.5, (wb.maxZ - wb.minZ) * 0.5 + 2],
      },
      {
        id: 'seal-east',
        center: [wb.maxX + 0.5, wallH * 0.5 - 1, (wb.minZ + wb.maxZ) * 0.5],
        halfExtents: [0.5, wallH * 0.5, (wb.maxZ - wb.minZ) * 0.5 + 2],
      },
    ];

    // 7. Specialty hero prop colliders from COURSE_PROPS
    const scaffoldingProp = COURSE_PROPS.find(
      (p) => p.id === 'scaffolding-shed-west',
    );
    const scaffoldingColliders = (scaffoldingProp?.solidColliders ?? []).map(
      (aabb, idx) => ({
        id: `scaffold-part-${idx}`,
        ...aabbToBox(aabb),
      }),
    );

    // Delivery Van: directly consume architect's split solidColliders,
    // slopedRampSpec (0.00 -> 1.08), roofAccessKickerSpec (1.08 -> 2.24), and roofLaunchDeckBoundsXZ
    const vanProp = COURSE_PROPS.find((p) => p.id === 'delivery-van-east');
    const vanMeta = vanProp?.vanRampMeta;
    const vanRampTransforms = [
      vanMeta?.slopedRampSpec,
      vanMeta?.roofAccessKickerSpec,
    ]
      .filter((spec): spec is NonNullable<typeof spec> => Boolean(spec))
      .map((spec) => ({
        id: spec.id,
        transform: computeMasterPlanRampTransform(spec),
      }));

    const vanSolidBoxes = (vanProp?.solidColliders ?? []).map((aabb, idx) => ({
      id: `van-solid-${idx}`,
      ...aabbToBox(aabb),
    }));

    const roofBounds = vanMeta?.roofLaunchDeckBoundsXZ ?? {
      minX: 1.36,
      maxX: 3.2,
      minZ: -10.4,
      maxZ: -7.8,
    };
    const roofDeckTopY = vanMeta?.roofDeckTopY ?? 2.24;
    const vanRoofDeckBox = {
      center: [
        (roofBounds.minX + roofBounds.maxX) * 0.5,
        roofDeckTopY - 0.06,
        (roofBounds.minZ + roofBounds.maxZ) * 0.5,
      ] as Vec3Tuple,
      halfExtents: [
        (roofBounds.maxX - roofBounds.minX) * 0.5,
        0.06,
        (roofBounds.maxZ - roofBounds.minZ) * 0.5,
      ] as Vec3Tuple,
      restitution: vanMeta?.roofRestitution ?? 0.62,
    };

    const treeMeta = COURSE_PROPS.find(
      (p) => p.id === 'tree-overhang-east',
    )?.treeOverhangMeta;
    const treeColliders = treeMeta
      ? {
          trunk: aabbToBox(treeMeta.trunkAabb),
          canopy: aabbToBox(treeMeta.canopyAabb),
        }
      : null;

    // Hotdog cart base + exact 28 deg awning oriented by YXZ(pitchRad, rotY, 0)
    const cartProp = COURSE_PROPS.find((p) => p.id === 'hotdog-cart-corner');
    const awningMeta = cartProp?.hotdogAwningMeta;
    let awningCollider: {
      center: Vec3Tuple;
      halfExtents: Vec3Tuple;
      rotation: Vec3Tuple;
      restitution: number;
    } | null = null;
    if (cartProp && awningMeta) {
      const eYXZ = new THREE.Euler(
        (awningMeta.pitchDeg * Math.PI) / 180,
        cartProp.rotationY,
        0,
        'YXZ',
      );
      const q = new THREE.Quaternion().setFromEuler(eYXZ);
      const eXYZ = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      awningCollider = {
        center: awningMeta.awningCenter,
        halfExtents: [
          awningMeta.awningSize[0] * 0.5,
          awningMeta.awningSize[1] * 0.5,
          awningMeta.awningSize[2] * 0.5,
        ],
        rotation: [eXYZ.x, eXYZ.y, eXYZ.z],
        restitution: awningMeta.restitution,
      };
    }

    const cartBaseCollider = cartProp
      ? {
          center: [
            cartProp.position[0],
            cartProp.groundY + 0.52,
            cartProp.position[2],
          ] as Vec3Tuple,
          halfExtents: [0.75, 0.52, 0.48] as Vec3Tuple,
          rotation: [0, cartProp.rotationY, 0] as Vec3Tuple,
        }
      : null;

    // Patio rough planters/tables/umbrella poles/cones/hydrant/lamp posts
    const specialIds = new Set([
      'scaffolding-shed-west',
      'delivery-van-east',
      'tree-overhang-east',
      'hotdog-cart-corner',
      'fountain-courtyard-front',
      'steam-grate-corner',
    ]);
    const patioSolidColliders = COURSE_PROPS.filter(
      (p) => !specialIds.has(p.id) && p.solidColliders.length > 0,
    ).flatMap((prop) =>
      prop.solidColliders.map((aabb, idx) => ({
        id: `${prop.id}-solid-${idx}`,
        ...aabbToBox(aabb),
        restitution: prop.type === 'bistro_umbrella_set' ? 0.65 : 0.35,
        friction: prop.surfaceTag === 'patio_rough' ? 0.75 : 0.35,
      })),
    );

    // Fountain stone rim wall (+0.28m above courtyard terrace) + inner water basin sensor
    const fountainProp = COURSE_PROPS.find(
      (p) => p.id === 'fountain-courtyard-front',
    );
    const fountainCenter = fountainProp?.position ?? [20.55, 0.6, -21.6];
    const fountainRimSegments = buildArcWallSegments({
      pivotX: fountainCenter[0],
      pivotZ: fountainCenter[2],
      radius: 1.24,
      startAngleRad: 0,
      endAngleRad: Math.PI * 2,
      bottomY: fountainCenter[1] - 0.02,
      topY: fountainCenter[1] + 0.3,
      wallThickness: 0.22,
      segments: 10,
    }).map((seg, idx) => ({
      key: `fountain-rim-${idx}`,
      seg,
    }));

    const fountainSensor = {
      center: [
        fountainCenter[0],
        fountainCenter[1] + 0.12,
        fountainCenter[2],
      ] as Vec3Tuple,
      radius: 1.05,
      halfHeight: 0.22,
    };

    const steamMeta = COURSE_PROPS.find(
      (p) => p.id === 'steam-grate-corner',
    )?.steamLiftMeta;
    const steamSensor = steamMeta
      ? {
          center: [
            (steamMeta.utilityBayBoundsXZ.minX +
              steamMeta.utilityBayBoundsXZ.maxX) *
              0.5,
            0.35,
            (steamMeta.utilityBayBoundsXZ.minZ +
              steamMeta.utilityBayBoundsXZ.maxZ) *
              0.5,
          ] as Vec3Tuple,
          halfExtents: [
            (steamMeta.utilityBayBoundsXZ.maxX -
              steamMeta.utilityBayBoundsXZ.minX) *
              0.5,
            0.4,
            (steamMeta.utilityBayBoundsXZ.maxZ -
              steamMeta.utilityBayBoundsXZ.minZ) *
              0.5,
          ] as Vec3Tuple,
        }
      : null;

    const hydrantReactive = COURSE_PROPS.find(
      (p) => p.id === 'hydrant-corner-se',
    )?.reactive;
    const hydrantSensor = hydrantReactive
      ? {
          center: hydrantReactive.zoneCenter,
          radius: hydrantReactive.zoneRadius ?? 1.35,
        }
      : null;

    const cupTrigger = {
      center: [
        HOLE_1_CUP.position[0],
        HOLE_1_CUP.position[1] + 0.08,
        HOLE_1_CUP.position[2],
      ] as Vec3Tuple,
      radius: HOLE_1_CUP.cupRadius,
    };

    return {
      groundSlabs,
      cornerApronFillBoxes,
      cornerRoadFillBoxes,
      gutterFloors,
      curvedGutterFloorSegments,
      straightCurbs,
      curvedCurbSegments,
      rampTransforms,
      buildingColliders,
      wallColliders,
      safetyWalls,
      scaffoldingColliders,
      vanRampTransforms,
      vanSolidBoxes,
      vanRoofDeckBox,
      treeColliders,
      awningCollider,
      cartBaseCollider,
      patioSolidColliders,
      fountainRimSegments,
      fountainSensor,
      steamSensor,
      hydrantSensor,
      cupRimSegments,
      cupBottomCollider,
      cupTrigger,
      worldFloor,
    };
  }, []);

  return (
    <group name="curbside-physics-world">
      {/* Sub-surface seamless base slab so a ball never escapes below grade */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          position={worldFloor.center}
          args={worldFloor.halfExtents}
          friction={0.35}
          restitution={0.22}
        />
      </RigidBody>

      {/* Main ground surface zones */}
      {groundSlabs.map((slab) => (
        <RigidBody
          key={slab.id}
          type="fixed"
          colliders={false}
          friction={slab.friction}
          restitution={slab.restitution}
          userData={{ propId: slab.id }}
        >
          <CuboidCollider
            position={slab.center}
            args={slab.halfExtents}
            friction={slab.friction}
            restitution={slab.restitution}
            contactSkin={0.002}
          />
        </RigidBody>
      ))}

      {/* SE corner apron clipped safely outside the r=2.425m curved storm gutter */}
      {cornerApronFillBoxes.map((box) => (
        <RigidBody
          key={box.id}
          type="fixed"
          colliders={false}
          friction={box.friction}
          restitution={box.restitution}
          userData={{ propId: box.id }}
        >
          <CuboidCollider
            position={box.center}
            args={box.halfExtents}
            friction={box.friction}
            restitution={box.restitution}
            contactSkin={0.002}
          />
        </RigidBody>
      ))}

      {/* SE corner road seam fill */}
      {cornerRoadFillBoxes.map((box) => (
        <RigidBody
          key={box.id}
          type="fixed"
          colliders={false}
          friction={0.28}
          restitution={0.24}
          userData={{ propId: box.id }}
        >
          <CuboidCollider
            position={box.center}
            args={box.halfExtents}
            friction={0.28}
            restitution={0.24}
            contactSkin={0.002}
          />
        </RigidBody>
      ))}

      {/* Storm gutter channels (straight + SE 90° curved floor flush at -0.02m) */}
      {gutterFloors.map((g) => (
        <RigidBody
          key={g.id}
          type="fixed"
          colliders={false}
          friction={0.08}
          restitution={0.25}
          userData={{ propId: g.id }}
        >
          <CuboidCollider
            position={g.center}
            args={g.halfExtents}
            friction={0.08}
            restitution={0.25}
            contactSkin={0.002}
          />
        </RigidBody>
      ))}

      {curvedGutterFloorSegments.map((item) => (
        <RigidBody
          key={item.key}
          type="fixed"
          colliders={false}
          position={item.seg.center}
          rotation={[0, item.seg.rotationY, 0]}
          userData={{ propId: 'gutter-corner-se-90' }}
        >
          <CuboidCollider
            args={item.seg.halfExtents}
            friction={0.08}
            restitution={0.25}
            contactSkin={0.002}
          />
        </RigidBody>
      ))}

      {/* Stone curbs (15cm straight curbs + 45-degree beveled SE bank + curved curbs) */}
      {straightCurbs.map((curb) => (
        <RigidBody
          key={curb.id}
          type="fixed"
          colliders={false}
          position={curb.center}
          rotation={[0, curb.rotationY, 0]}
          userData={{ propId: curb.id }}
        >
          <CuboidCollider
            args={[
              curb.size[0] * 0.5,
              curb.size[1] * 0.5,
              curb.size[2] * 0.5,
            ]}
            friction={curb.kind === 'beveled_45' ? 0.08 : curb.friction}
            restitution={curb.kind === 'beveled_45' ? 0.72 : curb.restitution}
            contactSkin={0.002}
          />
        </RigidBody>
      ))}

      {curvedCurbSegments.map((item) => (
        <RigidBody
          key={item.key}
          type="fixed"
          colliders={false}
          position={item.seg.center}
          rotation={[0, item.seg.rotationY, 0]}
          userData={{ propId: 'curb-corner-se-bevel-45' }}
        >
          <CuboidCollider
            args={item.seg.halfExtents}
            friction={item.friction}
            restitution={item.restitution}
            contactSkin={0.002}
          />
        </RigidBody>
      ))}

      {/* Flush sloped walkable ramps (including ramp-courtyard-main 0.00 -> +0.60m and west curb cuts) */}
      {rampTransforms.map(({ id, transform }) => (
        <RigidBody
          key={id}
          type="fixed"
          colliders={false}
          position={transform.position}
          rotation={transform.rotationEuler}
          userData={{ propId: id }}
        >
          <CuboidCollider
            args={transform.halfExtents}
            friction={0.05}
            restitution={0.12}
            contactSkin={0.002}
          />
        </RigidBody>
      ))}

      {/* Sealed perimeter buildings & architectural courtyard walls */}
      {buildingColliders.map((b) => (
        <RigidBody key={b.id} type="fixed" colliders={false} userData={{ propId: b.id }}>
          <CuboidCollider
            position={b.center}
            args={b.halfExtents}
            friction={0.25}
            restitution={0.55}
          />
        </RigidBody>
      ))}

      {wallColliders.map((w) => (
        <RigidBody
          key={w.id}
          type="fixed"
          colliders={false}
          position={w.center}
          rotation={[0, w.rotationY, 0]}
          userData={{ propId: w.id }}
        >
          <CuboidCollider
            args={w.halfExtents}
            friction={0.22}
            restitution={w.restitution}
          />
        </RigidBody>
      ))}

      {safetyWalls.map((wall) => (
        <RigidBody key={wall.id} type="fixed" colliders={false} userData={{ propId: wall.id }}>
          <CuboidCollider
            position={wall.center}
            args={wall.halfExtents}
            friction={0.2}
            restitution={0.5}
          />
        </RigidBody>
      ))}

      {/* Scaffolding shed: open 2.35m tunnel underneath, solid posts + overhead deck */}
      {scaffoldingColliders.map((part) => (
        <RigidBody key={part.id} type="fixed" colliders={false} userData={{ propId: part.id }}>
          <CuboidCollider
            position={part.center}
            args={part.halfExtents}
            friction={0.25}
            restitution={0.58}
          />
        </RigidBody>
      ))}

      {/* Delivery van: CAD sloped rear ramp + interior roof-access kicker + roof deck + split solid shoulders/cab */}
      {vanRampTransforms.map(({ id, transform }) => (
        <RigidBody
          key={id}
          type="fixed"
          colliders={false}
          position={transform.position}
          rotation={transform.rotationEuler}
          userData={{ propId: id }}
        >
          <CuboidCollider
            args={transform.halfExtents}
            friction={0.08}
            restitution={0.28}
            contactSkin={0.002}
          />
        </RigidBody>
      ))}
      <RigidBody type="fixed" colliders={false} userData={{ propId: 'delivery-van-east' }}>
        <CuboidCollider
          position={vanRoofDeckBox.center}
          args={vanRoofDeckBox.halfExtents}
          friction={0.08}
          restitution={vanRoofDeckBox.restitution}
          contactSkin={0.002}
        />
        {vanSolidBoxes.map((box) => (
          <CuboidCollider
            key={box.id}
            position={box.center}
            args={box.halfExtents}
            friction={0.25}
            restitution={0.55}
          />
        ))}
      </RigidBody>

      {/* Overhanging corner street tree: trunk + high canopy deflector (y: 2.65..5.60) */}
      {treeColliders && (
        <RigidBody type="fixed" colliders={false} userData={{ propId: 'tree-overhang-east' }}>
          <CuboidCollider
            position={treeColliders.trunk.center}
            args={treeColliders.trunk.halfExtents}
            friction={0.45}
            restitution={0.52}
          />
          <CuboidCollider
            position={treeColliders.canopy.center}
            args={treeColliders.canopy.halfExtents}
            friction={0.85}
            restitution={0.22}
          />
        </RigidBody>
      )}

      {/* Hotdog cart base + exact 28-degree pitched canvas awning */}
      {cartBaseCollider && (
        <RigidBody
          type="fixed"
          colliders={false}
          position={cartBaseCollider.center}
          rotation={cartBaseCollider.rotation}
        >
          <CuboidCollider
            args={cartBaseCollider.halfExtents}
            friction={0.3}
            restitution={0.48}
          />
        </RigidBody>
      )}

      {awningCollider && (
        <RigidBody
          type="fixed"
          colliders={false}
          position={awningCollider.center}
          rotation={awningCollider.rotation}
          userData={{ propId: 'hotdog-cart-awning' }}
        >
          <CuboidCollider
            args={awningCollider.halfExtents}
            friction={0.02}
            restitution={awningCollider.restitution}
            contactSkin={0.002}
          />
        </RigidBody>
      )}

      {/* Remaining solid street furniture & patio rough planters/tables/umbrella */}
      {patioSolidColliders.map((part) => (
        <RigidBody key={part.id} type="fixed" colliders={false} userData={{ propId: part.id }}>
          <CuboidCollider
            position={part.center}
            args={part.halfExtents}
            friction={part.friction}
            restitution={part.restitution}
          />
        </RigidBody>
      ))}

      {/* Courtyard Fountain +0.28m stone rim wall + inner water basin sensor */}
      {fountainRimSegments.map((item) => (
        <RigidBody
          key={item.key}
          type="fixed"
          colliders={false}
          position={item.seg.center}
          rotation={[0, item.seg.rotationY, 0]}
          userData={{ propId: 'fountain-rim' }}
        >
          <CuboidCollider
            args={item.seg.halfExtents}
            friction={0.25}
            restitution={0.55}
          />
        </RigidBody>
      ))}

      <RigidBody type="fixed" colliders={false} sensor>
        <CylinderCollider
          position={fountainSensor.center}
          args={[fountainSensor.halfHeight, fountainSensor.radius]}
        />
      </RigidBody>

      {/* Subway steam grate sensor */}
      {steamSensor && (
        <RigidBody type="fixed" colliders={false} sensor>
          <CuboidCollider
            position={steamSensor.center}
            args={steamSensor.halfExtents}
          />
        </RigidBody>
      )}

      {/* Fire hydrant splash boost sensor */}
      {hydrantSensor && (
        <RigidBody type="fixed" colliders={false} sensor>
          <CylinderCollider
            position={hydrantSensor.center}
            args={[0.45, hydrantSensor.radius]}
          />
        </RigidBody>
      )}

      {/* Hole 1 Physical Recessed Cup Liner & Well Floor + Sensor */}
      {cupRimSegments.map((item) => (
        <RigidBody
          key={item.key}
          type="fixed"
          colliders={false}
          position={item.seg.center}
          rotation={[0, item.seg.rotationY, 0]}
          userData={{ propId: 'cup-rim' }}
        >
          <CuboidCollider
            args={item.seg.halfExtents}
            friction={0.25}
            restitution={0.35}
            contactSkin={0.002}
          />
        </RigidBody>
      ))}

      <RigidBody type="fixed" colliders={false} userData={{ propId: 'cup-bottom' }}>
        <CylinderCollider
          position={cupBottomCollider.center}
          args={[cupBottomCollider.halfHeight, cupBottomCollider.radius]}
          friction={0.75}
          restitution={0.1}
          contactSkin={0.002}
        />
      </RigidBody>

      <RigidBody type="fixed" colliders={false} sensor>
        <CylinderCollider
          position={cupTrigger.center}
          args={[BALL_RADIUS * 0.85, cupTrigger.radius]}
        />
      </RigidBody>
    </group>
  );
}
