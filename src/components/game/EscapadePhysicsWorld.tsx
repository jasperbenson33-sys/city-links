'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import type { CourseMasterPlan, Vec3Tuple } from '@/types';
import { BALL_RADIUS } from '@/types';
import {
  buildArcWallSegments,
  computeMasterPlanRampTransform,
  subtractRect2D,
} from '@/physics/coursePhysicsHelpers';

function aabbToBox(aabb: { min: Vec3Tuple; max: Vec3Tuple }): {
  center: Vec3Tuple;
  halfExtents: Vec3Tuple;
} {
  return {
    center: [
      (aabb.min[0] + aabb.max[0]) * 0.5,
      (aabb.min[1] + aabb.max[1]) * 0.5,
      (aabb.min[2] + aabb.max[2]) * 0.5,
    ],
    halfExtents: [
      Math.max(0.02, (aabb.max[0] - aabb.min[0]) * 0.5),
      Math.max(0.02, (aabb.max[1] - aabb.min[1]) * 0.5),
      Math.max(0.02, (aabb.max[2] - aabb.min[2]) * 0.5),
    ],
  };
}

function buildSlopedSegmentTransform(
  start: Vec3Tuple,
  end: Vec3Tuple,
  width: number,
  thickness: number,
): {
  position: Vec3Tuple;
  rotationEuler: Vec3Tuple;
  halfExtents: Vec3Tuple;
} {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const totalLen = Math.max(0.1, Math.hypot(dx, dy, dz));
  const forward = new THREE.Vector3(dx, dy, dz).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(worldUp, forward);
  if (right.lengthSq() < 1e-6) {
    right.set(1, 0, 0);
  } else {
    right.normalize();
  }
  const normal = new THREE.Vector3().crossVectors(forward, right).normalize();
  const mat = new THREE.Matrix4().makeBasis(right, normal, forward);
  const euler = new THREE.Euler().setFromRotationMatrix(mat);
  const halfT = thickness * 0.5;
  const cx = (start[0] + end[0]) * 0.5 - normal.x * halfT;
  const cy = (start[1] + end[1]) * 0.5 - normal.y * halfT;
  const cz = (start[2] + end[2]) * 0.5 - normal.z * halfT;
  return {
    position: [cx, cy, cz],
    rotationEuler: [euler.x, euler.y, euler.z],
    halfExtents: [Math.max(0.08, width * 0.5), halfT, totalLen * 0.5 + 0.04],
  };
}

/**
 * Converts intrinsic `Ry(rotY) * Rx(pitchRad)` ('YXZ') orientation into default Three/R3F 'XYZ' Euler angles.
 */
function toXyzEulerFromYXZ(pitchRad: number, rotY: number): Vec3Tuple {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(pitchRad, rotY, 0, 'YXZ'),
  );
  const eXyz = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [eXyz.x, eXyz.y, eXyz.z];
}

export interface EscapadePhysicsWorldProps {
  plan: CourseMasterPlan;
}

export function EscapadePhysicsWorld({ plan }: EscapadePhysicsWorldProps) {
  const geometryData = useMemo(() => {
    const cupPos = plan.cup.position;
    const cupRadius = plan.cup.cupRadius;
    const cupDepth = plan.cup.cupDepth;
    const cupCutout = {
      minX: cupPos[0] - cupRadius,
      maxX: cupPos[0] + cupRadius,
      minZ: cupPos[2] - cupRadius,
      maxZ: cupPos[2] + cupRadius,
    };

    // 1. Ground surface slabs across Zones 1..7, slicing any slab coplanar with the cup well
    const groundSlabs = plan.groundZones.flatMap((zone) => {
      const t = Math.max(0.24, zone.slabThickness);
      const centerY = zone.topY - t * 0.5;
      const pieces =
        Math.abs(zone.topY - cupPos[1]) < 0.25
          ? subtractRect2D(zone.boundsXZ, cupCutout)
          : [zone.boundsXZ];
      return pieces.map((rect, idx) => ({
        id: pieces.length > 1 ? `${zone.id}-part-${idx}` : zone.id,
        propId: zone.id,
        center: [
          (rect.minX + rect.maxX) * 0.5,
          centerY,
          (rect.minZ + rect.maxZ) * 0.5,
        ] as Vec3Tuple,
        halfExtents: [
          Math.max(0.04, (rect.maxX - rect.minX) * 0.5),
          t * 0.5,
          Math.max(0.04, (rect.maxZ - rect.minZ) * 0.5),
        ] as Vec3Tuple,
        friction: zone.friction,
        restitution: zone.restitution,
      }));
    });

    // Sub-surface safety floor strictly below the -7.5m Subway Concourse & -7.92m cup bottom
    const wb = plan.worldBoundsXZ;
    const skirtTopY = plan.outerGroundSkirt?.topY ?? -8.5;
    const worldFloor = {
      center: [
        (wb.minX + wb.maxX) * 0.5,
        skirtTopY - 0.5,
        (wb.minZ + wb.maxZ) * 0.5,
      ] as Vec3Tuple,
      halfExtents: [
        (wb.maxX - wb.minX) * 0.5 + 32,
        0.5,
        (wb.maxZ - wb.minZ) * 0.5 + 32,
      ] as Vec3Tuple,
    };

    // 2. Cup rim liner & bottom well
    const cupWallCount = 10;
    const wallThick = 0.08;
    const wallDist = cupRadius + wallThick * 0.5;
    const cupWalls = Array.from({ length: cupWallCount }, (_, i) => {
      const angle = (i / cupWallCount) * Math.PI * 2;
      const segLen =
        2 * wallDist * Math.tan(Math.PI / cupWallCount) + wallThick * 0.45;
      return {
        id: `esc-cup-wall-${i}`,
        center: [
          cupPos[0] + Math.sin(angle) * wallDist,
          cupPos[1] - cupDepth * 0.5,
          cupPos[2] + Math.cos(angle) * wallDist,
        ] as Vec3Tuple,
        rotationY: angle,
        halfExtents: [segLen * 0.5, cupDepth * 0.5, wallThick * 0.5] as Vec3Tuple,
      };
    });
    const cupBottom = {
      center: [cupPos[0], cupPos[1] - cupDepth - 0.04, cupPos[2]] as Vec3Tuple,
      halfHeight: 0.04,
      radius: cupRadius + 0.05,
    };

    // 3. Flush walkable ramps (Zones 2, 3, 4, 5, 6, 7 stairwells & alley bridge)
    const rampTransforms = plan.ramps.map((ramp) => ({
      id: ramp.id,
      transform: computeMasterPlanRampTransform(ramp),
    }));

    // 4. Storm gutters (supports horizontal AND sloped Zone 2 gutters + Zone 2 +9.5m 90-degree curve!)
    const straightGutters = plan.gutters
      .filter((g) => g.kind === 'straight')
      .map((g) => {
        if (g.start && g.end) {
          const tx = buildSlopedSegmentTransform(g.start, g.end, g.width + 0.06, 0.24);
          return {
            id: g.id,
            position: tx.position,
            rotationEuler: tx.rotationEuler,
            halfExtents: tx.halfExtents,
          };
        }
        const b = aabbToBox(g.aabb);
        return {
          id: g.id,
          position: b.center,
          rotationEuler: [0, 0, 0] as Vec3Tuple,
          halfExtents: b.halfExtents,
        };
      });

    const curvedGutters = plan.gutters
      .filter((g) => g.kind === 'corner_90')
      .flatMap((g) => {
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
          bottomY: g.channelY - 0.24,
          topY: g.channelY,
          wallThickness: g.width + 0.08,
          segments: 24,
        }).map((seg, idx) => ({
          key: `${g.id}-floor-${idx}`,
          propId: g.id,
          seg,
        }));
      });

    // 5. Stone curbs (straight + curved)
    const straightCurbs = plan.curbs.filter(
      (c) => c.kind === 'straight' || c.kind === 'beveled_45',
    );
    const curvedCurbs = plan.curbs
      .filter((c) => c.kind === 'curved_90')
      .flatMap((c) => {
        if (
          !c.arcPivotXZ ||
          c.arcRadius === undefined ||
          c.startAngleRad === undefined ||
          c.endAngleRad === undefined
        ) {
          return [];
        }
        return buildArcWallSegments({
          pivotX: c.arcPivotXZ[0],
          pivotZ: c.arcPivotXZ[1],
          radius: c.arcRadius,
          startAngleRad: c.startAngleRad,
          endAngleRad: c.endAngleRad,
          bottomY: c.bottomY,
          topY: c.topY,
          wallThickness: 0.22,
          segments: 24,
        }).map((seg, idx) => ({
          key: `${c.id}-${idx}`,
          propId: c.id,
          seg,
          friction: c.friction,
          restitution: c.restitution,
        }));
      });

    // 6. Architectural walls, parapets, balustrades, subway vault enclosure, perimeter buildings & boundary seals
    const wallColliders = plan.architecturalWalls.map((w) => ({
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

    const buildingColliders = plan.perimeterBuildings.map((b) => ({
      id: b.id,
      ...aabbToBox(b.aabb),
    }));

    const wallBottomY = -10;
    const wallTopY = 56;
    const wallH = wallTopY - wallBottomY;
    const wallMidY = (wallBottomY + wallTopY) * 0.5;
    const safetyWalls: Array<{
      id: string;
      center: Vec3Tuple;
      halfExtents: Vec3Tuple;
    }> = [
      {
        id: 'esc-seal-north',
        center: [(wb.minX + wb.maxX) * 0.5, wallMidY, wb.minZ - 0.8],
        halfExtents: [(wb.maxX - wb.minX) * 0.5 + 4, wallH * 0.5, 0.8],
      },
      {
        id: 'esc-seal-south',
        center: [(wb.minX + wb.maxX) * 0.5, wallMidY, wb.maxZ + 0.8],
        halfExtents: [(wb.maxX - wb.minX) * 0.5 + 4, wallH * 0.5, 0.8],
      },
      {
        id: 'esc-seal-west',
        center: [wb.minX - 0.8, wallMidY, (wb.minZ + wb.maxZ) * 0.5],
        halfExtents: [0.8, wallH * 0.5, (wb.maxZ - wb.minZ) * 0.5 + 4],
      },
      {
        id: 'esc-seal-east',
        center: [wb.maxX + 0.8, wallMidY, (wb.minZ + wb.maxZ) * 0.5],
        halfExtents: [0.8, wallH * 0.5, (wb.maxZ - wb.minZ) * 0.5 + 4],
      },
    ];

    // 7. Props: specialized Delivery Vans & 28-deg Awnings + all solidColliders
    const vanRamps: Array<{
      id: string;
      transform: ReturnType<typeof computeMasterPlanRampTransform>;
    }> = [];
    const vanBoxes: Array<{
      id: string;
      propId: string;
      center: Vec3Tuple;
      halfExtents: Vec3Tuple;
      restitution: number;
    }> = [];
    const awningColliders: Array<{
      id: string;
      propId: string;
      center: Vec3Tuple;
      rotation: [number, number, number];
      halfExtents: Vec3Tuple;
      restitution: number;
    }> = [];
    const pitchedBankColliders: Array<{
      id: string;
      propId: string;
      center: Vec3Tuple;
      rotation: [number, number, number];
      halfExtents: Vec3Tuple;
      friction: number;
      restitution: number;
    }> = [];
    const propSolidBoxes: Array<{
      id: string;
      propId: string;
      center: Vec3Tuple;
      halfExtents: Vec3Tuple;
      friction: number;
      restitution: number;
    }> = [];

    for (const prop of plan.props) {
      if (prop.vanRampMeta) {
        const vm = prop.vanRampMeta;
        if (vm.slopedRampSpec) {
          vanRamps.push({
            id: `${prop.id}-rear-ramp`,
            transform: computeMasterPlanRampTransform(vm.slopedRampSpec),
          });
        }
        if (vm.roofAccessKickerSpec) {
          vanRamps.push({
            id: `${prop.id}-roof-kicker`,
            transform: computeMasterPlanRampTransform(vm.roofAccessKickerSpec),
          });
        }
        const deck = vm.roofLaunchDeckBoundsXZ;
        if (deck) {
          vanBoxes.push({
            id: `${prop.id}-roof-deck`,
            propId: prop.id,
            center: [
              (deck.minX + deck.maxX) * 0.5,
              vm.roofDeckTopY - 0.04,
              (deck.minZ + deck.maxZ) * 0.5,
            ],
            halfExtents: [
              (deck.maxX - deck.minX) * 0.5,
              0.04,
              (deck.maxZ - deck.minZ) * 0.5,
            ],
            restitution: vm.roofRestitution,
          });
        }
      }

      if (prop.hotdogAwningMeta) {
        const am = prop.hotdogAwningMeta;
        const rotY = prop.rotationY ?? 0;
        const pitchRad = (am.pitchDeg * Math.PI) / 180;
        awningColliders.push({
          id: `${prop.id}-awning`,
          propId: 'hotdog-cart-awning',
          center: am.awningCenter,
          rotation: toXyzEulerFromYXZ(pitchRad, rotY),
          halfExtents: [
            am.awningSize[0] * 0.5,
            am.awningSize[1] * 0.5,
            am.awningSize[2] * 0.5,
          ],
          restitution: am.restitution,
        });
      }

      if (prop.pitchedBankMeta) {
        const pm = prop.pitchedBankMeta;
        const rotY = prop.rotationY ?? 0;
        const pitchRad = (pm.pitchDeg * Math.PI) / 180;
        pitchedBankColliders.push({
          id: `${prop.id}-pitched-bank`,
          propId: prop.id,
          center: pm.sashCenter,
          rotation: toXyzEulerFromYXZ(pitchRad, rotY),
          halfExtents: [
            pm.sashSize[0] * 0.5,
            pm.sashSize[1] * 0.5,
            pm.sashSize[2] * 0.5,
          ],
          friction: pm.friction ?? 0.06,
          restitution: pm.restitution,
        });
      }

      if (prop.solidColliders.length === 0) continue;
      const isGlassBank = prop.reactive?.kind === 'skylight_angled_bank';
      const restitution =
        prop.reactive?.restitution ??
        (prop.type === 'bistro_umbrella_set' ? 0.65 : isGlassBank ? 0.68 : 0.54);
      const friction = isGlassBank ? 0.08 : 0.25;

      prop.solidColliders.forEach((col, idx) => {
        const box = aabbToBox(col);
        propSolidBoxes.push({
          id: `${prop.id}-col-${idx}`,
          propId: prop.id,
          center: box.center,
          halfExtents: box.halfExtents,
          friction,
          restitution,
        });
      });
    }

    return {
      groundSlabs,
      worldFloor,
      cupWalls,
      cupBottom,
      rampTransforms,
      straightGutters,
      curvedGutters,
      straightCurbs,
      curvedCurbs,
      wallColliders,
      buildingColliders,
      safetyWalls,
      vanRamps,
      vanBoxes,
      awningColliders,
      pitchedBankColliders,
      propSolidBoxes,
    };
  }, [plan]);

  return (
    <group name="grand-escapade-physics-world">
      {/* Sub-surface safety floor strictly below the -7.5m Subway Vault */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          position={geometryData.worldFloor.center}
          args={geometryData.worldFloor.halfExtents}
          friction={0.35}
          restitution={0.22}
        />
      </RigidBody>

      {/* Main multi-elevation ground slabs across Zones 1..7 */}
      {geometryData.groundSlabs.map((slab) => (
        <RigidBody
          key={slab.id}
          type="fixed"
          colliders={false}
          friction={slab.friction}
          restitution={slab.restitution}
          userData={{ propId: slab.propId }}
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

      {/* Zero-lip walkable ramps across Zones 2..7 */}
      {geometryData.rampTransforms.map(({ id, transform }) => (
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
            friction={0.04}
            restitution={0.12}
            contactSkin={0.002}
          />
        </RigidBody>
      ))}

      {/* Straight & sloped storm gutter tracks + Zone 2 +9.5m Belvedere 90-degree curve */}
      {geometryData.straightGutters.map((g) => (
        <RigidBody
          key={g.id}
          type="fixed"
          colliders={false}
          position={g.position}
          rotation={g.rotationEuler}
          userData={{ propId: g.id }}
        >
          <CuboidCollider
            args={g.halfExtents}
            friction={0.08}
            restitution={0.25}
            contactSkin={0.002}
          />
        </RigidBody>
      ))}

      {geometryData.curvedGutters.map((item) => (
        <RigidBody
          key={item.key}
          type="fixed"
          colliders={false}
          position={item.seg.center}
          rotation={[0, item.seg.rotationY, 0]}
          userData={{ propId: item.propId }}
        >
          <CuboidCollider
            args={item.seg.halfExtents}
            friction={0.08}
            restitution={0.25}
            contactSkin={0.002}
          />
        </RigidBody>
      ))}

      {/* Stone curbs */}
      {geometryData.straightCurbs.map((curb) => (
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
            friction={curb.friction}
            restitution={curb.restitution}
            contactSkin={0.002}
          />
        </RigidBody>
      ))}

      {geometryData.curvedCurbs.map((item) => (
        <RigidBody
          key={item.key}
          type="fixed"
          colliders={false}
          position={item.seg.center}
          rotation={[0, item.seg.rotationY, 0]}
          userData={{ propId: item.propId }}
        >
          <CuboidCollider
            args={item.seg.halfExtents}
            friction={item.friction}
            restitution={item.restitution}
            contactSkin={0.002}
          />
        </RigidBody>
      ))}

      {/* Architectural retaining walls, balustrades, rooftop parapets & Zone 7 Subway Vault */}
      {geometryData.wallColliders.map((w) => (
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

      {geometryData.buildingColliders.map((b) => (
        <RigidBody
          key={b.id}
          type="fixed"
          colliders={false}
          userData={{ propId: b.id }}
        >
          <CuboidCollider
            position={b.center}
            args={b.halfExtents}
            friction={0.25}
            restitution={0.55}
          />
        </RigidBody>
      ))}

      {geometryData.safetyWalls.map((wall) => (
        <RigidBody
          key={wall.id}
          type="fixed"
          colliders={false}
          userData={{ propId: wall.id }}
        >
          <CuboidCollider
            position={wall.center}
            args={wall.halfExtents}
            friction={0.2}
            restitution={0.5}
          />
        </RigidBody>
      ))}

      {/* Delivery van ramps + launch deck + hero prop solid colliders */}
      {geometryData.vanRamps.map(({ id, transform }) => (
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

      {geometryData.vanBoxes.map((box) => (
        <RigidBody
          key={box.id}
          type="fixed"
          colliders={false}
          userData={{ propId: box.propId }}
        >
          <CuboidCollider
            position={box.center}
            args={box.halfExtents}
            friction={0.08}
            restitution={box.restitution}
            contactSkin={0.002}
          />
        </RigidBody>
      ))}

      {geometryData.awningColliders.map((aw) => (
        <RigidBody
          key={aw.id}
          type="fixed"
          colliders={false}
          position={aw.center}
          rotation={aw.rotation}
          userData={{ propId: aw.propId }}
        >
          <CuboidCollider
            args={aw.halfExtents}
            friction={0.18}
            restitution={aw.restitution}
          />
        </RigidBody>
      ))}

      {geometryData.pitchedBankColliders.map((pb) => (
        <RigidBody
          key={pb.id}
          type="fixed"
          colliders={false}
          position={pb.center}
          rotation={pb.rotation}
          userData={{ propId: pb.propId }}
        >
          <CuboidCollider
            args={pb.halfExtents}
            friction={pb.friction}
            restitution={pb.restitution}
            contactSkin={0.002}
          />
        </RigidBody>
      ))}

      {geometryData.propSolidBoxes.map((box) => (
        <RigidBody
          key={box.id}
          type="fixed"
          colliders={false}
          userData={{ propId: box.propId }}
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

      {/* Recessed Golden Pin cup liner at -7.5m Subway Concourse */}
      {geometryData.cupWalls.map((cw) => (
        <RigidBody
          key={cw.id}
          type="fixed"
          colliders={false}
          position={cw.center}
          rotation={[0, cw.rotationY, 0]}
          userData={{ propId: 'cup-rim' }}
        >
          <CuboidCollider
            args={cw.halfExtents}
            friction={0.18}
            restitution={0.35}
          />
        </RigidBody>
      ))}
      <RigidBody type="fixed" colliders={false} userData={{ propId: 'cup-bottom' }}>
        <CylinderCollider
          position={geometryData.cupBottom.center}
          args={[
            geometryData.cupBottom.halfHeight,
            geometryData.cupBottom.radius,
          ]}
          friction={0.45}
          restitution={0.15}
        />
      </RigidBody>
    </group>
  );
}
