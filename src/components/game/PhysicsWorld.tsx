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
  type GroundSurfaceZoneSpec,
  type StoneCurbSegmentSpec,
  type Vec3Tuple,
} from '@/types';
import {
  buildArcWallSegments,
  computeMasterPlanRampTransform,
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

function zoneToSlabBox(zone: GroundSurfaceZoneSpec) {
  const { minX, maxX, minZ, maxZ } = zone.boundsXZ;
  const thickness = Math.max(0.24, zone.slabThickness);
  // Keep fountain basin floor submerged so water sensor catches the ball cleanly
  const topY = zone.surfaceTag === 'fountain_hazard' ? zone.topY - 0.14 : zone.topY;
  return {
    center: [
      (minX + maxX) * 0.5,
      topY - thickness * 0.5,
      (minZ + maxZ) * 0.5,
    ] as Vec3Tuple,
    halfExtents: [
      Math.max(0.05, (maxX - minX) * 0.5),
      thickness * 0.5,
      Math.max(0.05, (maxZ - minZ) * 0.5),
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

    // 2. Ground zones (arc-clipped SE zones are split cleanly around the r=2.20..2.65 curved gutter)
    const groundSlabs = GROUND_ZONES.filter((z) => !z.arcClip).map((zone) => ({
      id: zone.id,
      friction: Math.max(0.05, Math.min(0.95, zone.friction)),
      restitution: zone.restitution,
      ...zoneToSlabBox(zone),
    }));

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

    // 3. Storm gutters (curved SE stone curb wall comes directly from curb-corner-se-bevel-45)
    const gutterFloors = STORM_GUTTERS.filter((g) => g.kind === 'straight').map(
      (g) => ({
        id: g.id,
        ...aabbToBox(g.aabb),
      }),
    );

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

    // 5. Walkable ramps (flush zero-lip sloped cuboids) + flush gutter-to-ramp apron bevel
    const rampTransforms = [
      ...WALKABLE_RAMPS.map((ramp) => ({
        id: ramp.id,
        transform: computeMasterPlanRampTransform(ramp),
      })),
      {
        id: 'gutter-to-ramp-apron',
        transform: computeMasterPlanRampTransform({
          id: 'gutter-to-ramp-apron',
          label: 'Mercer South Gutter-to-Ramp Flush Apron (-0.02m -> 0.00m)',
          surfaceTag: 'storm_gutter',
          boundsXZ: { minX: 13.7, maxX: 14.58, minZ: -18.55, maxZ: -17.98 },
          bottomY: -0.02,
          topY: 0.0105,
          climbDirection: 'east',
          slopeAngleDeg: 1.99,
          slabThickness: 0.25,
          friction: 0.35,
          restitution: 0.25,
          aabb: { min: [13.7, -0.25, -18.55], max: [14.58, 0.015, -17.98] },
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
        restitution: prop.id === 'bistro-umbrella' ? 0.65 : 0.35,
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
        >
          <CuboidCollider
            position={slab.center}
            args={slab.halfExtents}
            friction={slab.friction}
            restitution={slab.restitution}
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
        >
          <CuboidCollider
            position={box.center}
            args={box.halfExtents}
            friction={box.friction}
            restitution={box.restitution}
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
        >
          <CuboidCollider
            position={box.center}
            args={box.halfExtents}
            friction={0.28}
            restitution={0.24}
          />
        </RigidBody>
      ))}

      {/* Storm gutter channels */}
      {gutterFloors.map((g) => (
        <RigidBody
          key={g.id}
          type="fixed"
          colliders={false}
          friction={0.08}
          restitution={0.25}
        >
          <CuboidCollider
            position={g.center}
            args={g.halfExtents}
            friction={0.08}
            restitution={0.25}
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
        >
          <CuboidCollider
            args={[
              curb.size[0] * 0.5,
              curb.size[1] * 0.5,
              curb.size[2] * 0.5,
            ]}
            friction={curb.kind === 'beveled_45' ? 0.08 : curb.friction}
            restitution={curb.kind === 'beveled_45' ? 0.72 : curb.restitution}
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
        >
          <CuboidCollider
            args={item.seg.halfExtents}
            friction={item.friction}
            restitution={item.restitution}
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
        >
          <CuboidCollider
            args={transform.halfExtents}
            friction={0.05}
            restitution={0.12}
          />
        </RigidBody>
      ))}

      {/* Sealed perimeter buildings & architectural courtyard walls */}
      {buildingColliders.map((b) => (
        <RigidBody key={b.id} type="fixed" colliders={false}>
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
        >
          <CuboidCollider
            args={w.halfExtents}
            friction={0.22}
            restitution={w.restitution}
          />
        </RigidBody>
      ))}

      {safetyWalls.map((wall) => (
        <RigidBody key={wall.id} type="fixed" colliders={false}>
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
        <RigidBody key={part.id} type="fixed" colliders={false}>
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
        >
          <CuboidCollider
            args={transform.halfExtents}
            friction={0.08}
            restitution={0.28}
          />
        </RigidBody>
      ))}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          position={vanRoofDeckBox.center}
          args={vanRoofDeckBox.halfExtents}
          friction={0.08}
          restitution={vanRoofDeckBox.restitution}
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
          />
        </RigidBody>
      )}

      {/* Remaining solid street furniture & patio rough planters/tables/umbrella */}
      {patioSolidColliders.map((part) => (
        <RigidBody key={part.id} type="fixed" colliders={false}>
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

      {/* Hole 1 Cup sensor */}
      <RigidBody type="fixed" colliders={false} sensor>
        <CylinderCollider
          position={cupTrigger.center}
          args={[BALL_RADIUS * 0.85, cupTrigger.radius]}
        />
      </RigidBody>
    </group>
  );
}
