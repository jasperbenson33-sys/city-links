'use client';

import React from 'react';
import * as THREE from 'three';
import { VENICE_MATERIALS } from '@/materials';
import type { Stage2PropCommonProps } from './GrandEscapadeRooftopProps';

const KIOSK_EMERALD_MAT = new THREE.MeshStandardMaterial({
  color: '#1E5242',
  roughness: 0.44,
  metalness: 0.26,
});
const KIOSK_ROOF_COPPER_MAT = new THREE.MeshStandardMaterial({
  color: '#3F7D6D',
  roughness: 0.4,
  metalness: 0.34,
});
const PAPER_NEWS_MAT = new THREE.MeshStandardMaterial({
  color: '#F4EBD9',
  roughness: 0.85,
  metalness: 0.02,
});
const BRASS_METAL_MAT = new THREE.MeshStandardMaterial({
  color: '#DFB654',
  roughness: 0.26,
  metalness: 0.78,
});
const CHROME_METAL_MAT = new THREE.MeshStandardMaterial({
  color: '#CBD5E1',
  roughness: 0.25,
  metalness: 0.75,
});
const SUBWAY_OLIVE_MAT = new THREE.MeshStandardMaterial({
  color: '#2F4F3E',
  roughness: 0.42,
  metalness: 0.24,
});
const SUBWAY_CREAM_MAT = new THREE.MeshStandardMaterial({
  color: '#F3ECE0',
  roughness: 0.38,
  metalness: 0.08,
});
const SUBWAY_INTERIOR_WARM_MAT = new THREE.MeshStandardMaterial({
  color: '#FEF3C7',
  emissive: '#F59E0B',
  emissiveIntensity: 0.72,
  roughness: 0.35,
});
const SUBWAY_RATTAN_BENCH_MAT = new THREE.MeshStandardMaterial({
  color: '#C68B4C',
  roughness: 0.72,
  metalness: 0.04,
});
const SUBWAY_BOGIE_STEEL_MAT = new THREE.MeshStandardMaterial({
  color: '#323842',
  roughness: 0.56,
  metalness: 0.62,
});
const SUBWAY_GLAZED_TILE_MAT = new THREE.MeshStandardMaterial({
  color: '#F1ECE2',
  roughness: 0.3,
  metalness: 0.06,
});
const SUBWAY_WINDOW_GLASS_MAT = new THREE.MeshStandardMaterial({
  color: '#182C34',
  emissive: '#0E242B',
  emissiveIntensity: 0.24,
  roughness: 0.16,
  metalness: 0.32,
  transparent: true,
  opacity: 0.62,
  depthWrite: false,
});
const SUBWAY_MARKER_GREEN_MAT = new THREE.MeshStandardMaterial({
  color: '#22C55E',
  emissive: '#16A34A',
  emissiveIntensity: 1.35,
  roughness: 0.22,
});
const SUBWAY_MARKER_AMBER_MAT = new THREE.MeshStandardMaterial({
  color: '#FCD34D',
  emissive: '#F59E0B',
  emissiveIntensity: 1.45,
  roughness: 0.22,
});
const HEADHOUSE_TRANSOM_GLOW_MAT = new THREE.MeshStandardMaterial({
  color: '#FFF7DF',
  emissive: '#FDE68A',
  emissiveIntensity: 1.15,
  roughness: 0.28,
});

/**
 * Zone 6 Beaux-Arts Dark-Emerald & Brass Newspaper Kiosk (`[-1.2..1.2] x [0..2.95] x [-0.95..0.95]`).
 */
export const NewspaperKioskProp = React.memo(function NewspaperKioskProp({
  propId,
}: Stage2PropCommonProps) {
  return (
    <group
      name="newspaper-kiosk"
      userData={{ occludableProp: true, propId }}
    >
      {/* Granite Plinth */}
      <mesh position={[0, 0.07, 0]} material={VENICE_MATERIALS.graniteCurbStone} castShadow receiveShadow>
        <boxGeometry args={[2.32, 0.14, 1.82]} />
      </mesh>
      {/* Emerald Cast-Iron Lower Wainscot Booth */}
      <mesh position={[0, 0.58, 0]} material={KIOSK_EMERALD_MAT} castShadow receiveShadow>
        <boxGeometry args={[2.16, 0.88, 1.66]} />
      </mesh>
      {/* Display Counter Sill & Stacked Newspapers */}
      <mesh position={[0, 1.04, 0.1]} material={VENICE_MATERIALS.storefrontTimber} castShadow>
        <boxGeometry args={[2.24, 0.07, 1.82]} />
      </mesh>
      {[-0.65, -0.2, 0.25, 0.68].map((px, idx) => (
        <mesh key={`stack-${idx}`} position={[px, 1.13, 0.86]} material={PAPER_NEWS_MAT} castShadow>
          <boxGeometry args={[0.28, 0.11 + (idx % 2) * 0.04, 0.22]} />
        </mesh>
      ))}
      {/* Open Window Interior Backing + Warm Lantern */}
      <mesh position={[0, 1.62, -0.58]} material={KIOSK_EMERALD_MAT} castShadow>
        <boxGeometry args={[2.06, 1.12, 0.42]} />
      </mesh>
      <mesh position={[0, 2.08, 0.06]} material={SUBWAY_INTERIOR_WARM_MAT}>
        <boxGeometry args={[1.45, 0.06, 0.4]} />
      </mesh>
      {/* Corner Brass Mullion Pillars */}
      {[
        [-0.98, 0.78],
        [0.98, 0.78],
        [-0.98, -0.78],
        [0.98, -0.78],
      ].map(([cx, cz], idx) => (
        <mesh key={`kiosk-pil-${idx}`} position={[cx, 1.62, cz]} material={BRASS_METAL_MAT} castShadow>
          <boxGeometry args={[0.1, 1.14, 0.1]} />
        </mesh>
      ))}
      {/* Beaux-Arts Green-Copper Awning Roof + Rooftop Header Sign (strictly <= 2.92m) */}
      <mesh position={[0, 2.26, 0]} material={KIOSK_ROOF_COPPER_MAT} castShadow receiveShadow>
        <boxGeometry args={[2.36, 0.18, 1.88]} />
      </mesh>
      <mesh
        position={[0, 2.58, 0]}
        rotation={[0, Math.PI * 0.25, 0]}
        material={KIOSK_ROOF_COPPER_MAT}
        castShadow
      >
        <coneGeometry args={[1.28, 0.48, 4]} />
      </mesh>
      <mesh position={[0, 2.84, 0]} material={BRASS_METAL_MAT}>
        <boxGeometry args={[1.18, 0.16, 0.12]} />
      </mesh>
    </group>
  );
});

/**
 * Zone 7 Vintage Chrome & Burnished-Brass Subway Fare Turnstile Bank (`[-1.6..1.6] x [0..1.05] x [-0.45..0.45]`)
 * with 3-bar tripod arms (angled tucked so lanes stay unobstructed), NFC reader domes, and wide open center channels.
 */
export const BrassTurnstileGateProp = React.memo(function BrassTurnstileGateProp({
  propId,
}: Stage2PropCommonProps) {
  return (
    <group
      name="brass-turnstile-gate"
      userData={{ occludableProp: true, propId, tightBallRayOnly: true }}
    >
      {/* Low Floor Anchor Sill Plate */}
      <mesh position={[0, 0.02, 0]} material={SUBWAY_BOGIE_STEEL_MAT} receiveShadow>
        <boxGeometry args={[3.1, 0.04, 0.84]} />
      </mesh>
      {/* 3 Brass & Stainless Turnstile Fare Cabinets creating 2 clean open lanes */}
      {[-1.34, 0, 1.34].map((kx, idx) => (
        <group key={`turn-cab-${idx}`} position={[kx, 0, 0]}>
          <mesh position={[0, 0.46, 0]} material={CHROME_METAL_MAT} castShadow receiveShadow>
            <boxGeometry args={[0.38, 0.88, 0.72]} />
          </mesh>
          <mesh position={[0, 0.94, 0]} material={BRASS_METAL_MAT} castShadow>
            <boxGeometry args={[0.42, 0.14, 0.76]} />
          </mesh>
          {/* Illuminated Emerald NFC / Token Tap Bezel Domes (front & rear entry pads) */}
          {[-0.24, 0.24].map((dz, dIdx) => (
            <group key={`nfc-${dIdx}`} position={[0, 1.015, dz]}>
              <mesh material={SUBWAY_BOGIE_STEEL_MAT}>
                <cylinderGeometry args={[0.095, 0.105, 0.028, 12]} />
              </mesh>
              <mesh position={[0, 0.015, 0]} material={SUBWAY_MARKER_GREEN_MAT}>
                <cylinderGeometry args={[0.068, 0.068, 0.014, 12]} />
              </mesh>
            </group>
          ))}
          {/* Front & Back Circular Subway Token Crest Medallions */}
          {[-0.37, 0.37].map((fz, fIdx) => (
            <mesh
              key={`crest-${fIdx}`}
              position={[0, 0.72, fz]}
              rotation={[Math.PI * 0.5, 0, 0]}
              material={KIOSK_EMERALD_MAT}
            >
              <cylinderGeometry args={[0.08, 0.08, 0.024, 12]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Open Swung 3-Bar Chrome Tripod Turnstile Assemblies (tucked toward left/center pedestals so lanes stay open) */}
      {[-1.12, 0.22].map((ax, idx) => (
        <group key={`tripod-${idx}`} position={[ax, 0.72, 0]}>
          <mesh rotation={[0, 0, Math.PI * 0.5]} material={BRASS_METAL_MAT}>
            <cylinderGeometry args={[0.065, 0.065, 0.09, 12]} />
          </mesh>
          {[0.55, 2.65, 4.75].map((ang, bIdx) => (
            <group key={`bar-${bIdx}`} rotation={[ang, 0, 0]}>
              <mesh
                position={[0.07, -0.15, 0.06]}
                rotation={[0.38, 0, -0.45]}
                material={CHROME_METAL_MAT}
                castShadow={false}
              >
                <cylinderGeometry args={[0.019, 0.019, 0.34, 8]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
});

/**
 * Zone 7 Landmark Parked 1920s IRT Olive-Green & Cream Subway Coach (`[-1.55..1.55] x [0..3.35] x [-6.8..6.8]`)
 * with OPEN North/South end vestibule portals (`|x| < 1.15m`) AND OPEN center side pocket doors (`z in [-1.2..+1.2]`)
 * matching the solid side colliders 1:1 so golfers can shoot straight through the rattan-bench interior!
 */
export const VintageSubwayCarProp = React.memo(function VintageSubwayCarProp({
  propId,
}: Stage2PropCommonProps) {
  const halfW = 1.48;
  const endHalfZ = 6.72;
  const doorClearHalfZ = 1.2; // open side pocket door at z in [-1.2 .. +1.2]
  const wingLen = endHalfZ - doorClearHalfZ; // 5.52m
  const wingCenterZ = (endHalfZ + doorClearHalfZ) * 0.5; // 3.96m

  return (
    <group
      name="vintage-subway-car"
      userData={{ occludableVehicle: true, propId }}
    >
      {/* Recessed Outer Bogie Wheel Trucks tucked along flanks (x = +/-1.32, central aisle clear!) */}
      {[-1, 1].map((sideX) =>
        [-4.8, 4.8].map((bz, bIdx) => (
          <group key={`bogie-${sideX}-${bIdx}`} position={[sideX * 1.32, 0.26, bz]}>
            <mesh material={SUBWAY_BOGIE_STEEL_MAT} castShadow>
              <boxGeometry args={[0.26, 0.28, 1.85]} />
            </mesh>
            {[-0.6, 0.6].map((wz, wIdx) => (
              <mesh
                key={`wheel-${wIdx}`}
                position={[0, -0.04, wz]}
                rotation={[0, 0, Math.PI * 0.5]}
                material={CHROME_METAL_MAT}
              >
                <cylinderGeometry args={[0.22, 0.22, 0.14, 12]} />
              </mesh>
            ))}
          </group>
        )),
      )}

      {/* Left & Right Split Coach Walls (front wing + rear wing; open sliding center door at |z|<1.2) */}
      {[-1, 1].map((sideX) =>
        [-1, 1].map((endSign) => {
          const wz = endSign * wingCenterZ;
          return (
            <group
              key={`car-wing-${sideX}-${endSign}`}
              position={[sideX * 1.38, 0, wz]}
            >
              {/* Olive Lower Steel Car Body Wainscot */}
              <mesh position={[0, 0.72, 0]} material={SUBWAY_OLIVE_MAT} castShadow receiveShadow>
                <boxGeometry args={[0.28, 1.32, wingLen]} />
              </mesh>
              {/* Brass Waist Belt Molding */}
              <mesh position={[0, 1.4, 0]} material={BRASS_METAL_MAT}>
                <boxGeometry args={[0.31, 0.08, wingLen]} />
              </mesh>
              {/* Cream Lower Sill & Upper Transom Sash Rails */}
              <mesh position={[0, 1.48, 0]} material={SUBWAY_CREAM_MAT}>
                <boxGeometry args={[0.24, 0.08, wingLen]} />
              </mesh>
              <mesh position={[0, 2.38, 0]} material={SUBWAY_CREAM_MAT}>
                <boxGeometry args={[0.24, 0.09, wingLen]} />
              </mesh>
              {/* Semi-Transparent Tinted Side Coach Window Glazing Strip */}
              <mesh position={[0, 1.94, 0]} material={SUBWAY_WINDOW_GLASS_MAT}>
                <boxGeometry args={[0.05, 0.84, wingLen - 0.14]} />
              </mesh>
              {/* Cream Window Mullion Frame Piers */}
              {[-2.4, -0.8, 0.8, 2.4].map((mz, mIdx) => (
                <mesh
                  key={`pier-${mIdx}`}
                  position={[0, 1.94, mz]}
                  material={SUBWAY_CREAM_MAT}
                  castShadow
                >
                  <boxGeometry args={[0.24, 1.04, 0.34]} />
                </mesh>
              ))}
              {/* Pocket Door Stile Post + Vertical Brass Exterior Grab Iron */}
              <mesh
                position={[0, 1.28, -endSign * (wingLen * 0.5 - 0.08)]}
                material={SUBWAY_OLIVE_MAT}
                castShadow
              >
                <boxGeometry args={[0.26, 2.38, 0.16]} />
              </mesh>
              <mesh
                position={[sideX * 0.15, 1.36, -endSign * (wingLen * 0.5 - 0.11)]}
                material={BRASS_METAL_MAT}
                castShadow={false}
              >
                <cylinderGeometry args={[0.022, 0.022, 1.42, 8]} />
              </mesh>
              {/* Interior Golden Rattan Bench Seat Facing Center Aisle */}
              <mesh
                position={[-sideX * 0.26, 0.5, 0]}
                material={SUBWAY_RATTAN_BENCH_MAT}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[0.42, 0.44, wingLen - 0.6]} />
              </mesh>
              {/* Upper Olive Letterboard Header */}
              <mesh position={[0, 2.54, 0]} material={SUBWAY_OLIVE_MAT} castShadow>
                <boxGeometry args={[0.28, 0.24, wingLen]} />
              </mesh>
            </group>
          );
        }),
      )}

      {/* Header Lintels Spanning Open Center Side Doors (z in [-1.2..+1.2]) */}
      {[-1, 1].map((sideX) => (
        <mesh
          key={`door-lintel-${sideX}`}
          position={[sideX * 1.38, 2.54, 0]}
          material={SUBWAY_OLIVE_MAT}
          castShadow
        >
          <boxGeometry args={[0.28, 0.24, doorClearHalfZ * 2]} />
        </mesh>
      ))}

      {/* End Vestibule Bulkhead Returns + Cab Sash Windows (aligned to |x| in 1.19..1.47 so |x| < 1.15 aisle stays open!) */}
      {[-1, 1].map((endSign) => {
        const ez = endSign * (endHalfZ - 0.1);
        return (
          <group key={`end-cab-${endSign}`}>
            {[-1, 1].map((sideX) => (
              <group key={`cab-post-${sideX}`} position={[sideX * 1.33, 0, ez]}>
                <mesh position={[0, 1.32, 0]} material={SUBWAY_OLIVE_MAT} castShadow>
                  <boxGeometry args={[0.28, 2.52, 0.18]} />
                </mesh>
                {/* Framed Motorman Cab Sash Window */}
                <mesh
                  position={[0, 1.9, endSign * 0.05]}
                  material={SUBWAY_CREAM_MAT}
                >
                  <boxGeometry args={[0.22, 0.84, 0.1]} />
                </mesh>
                <mesh
                  position={[0, 1.9, endSign * 0.08]}
                  material={SUBWAY_WINDOW_GLASS_MAT}
                >
                  <boxGeometry args={[0.16, 0.7, 0.05]} />
                </mesh>
              </group>
            ))}
            {/* Upper End Bulkhead Arch Transom Header */}
            <mesh position={[0, 2.52, ez]} material={SUBWAY_OLIVE_MAT} castShadow>
              <boxGeometry args={[2.96, 0.28, 0.16]} />
            </mesh>
            {/* End Vestibule Destination Sign Drumhead */}
            <mesh position={[0, 2.52, ez + endSign * 0.08]} material={SUBWAY_INTERIOR_WARM_MAT}>
              <boxGeometry args={[1.55, 0.24, 0.08]} />
            </mesh>
            {/* Centered Cyclops Brass Headlamp on Clerestory Nose */}
            <group position={[0, 2.98, endSign * (endHalfZ - 0.02)]}>
              <mesh rotation={[Math.PI * 0.5, 0, 0]} material={BRASS_METAL_MAT}>
                <cylinderGeometry args={[0.13, 0.13, 0.12, 12]} />
              </mesh>
              <mesh
                position={[0, 0, endSign * 0.05]}
                rotation={[Math.PI * 0.5, 0, 0]}
                material={SUBWAY_INTERIOR_WARM_MAT}
              >
                <cylinderGeometry args={[0.09, 0.09, 0.04, 12]} />
              </mesh>
            </group>
            {/* Twin Classic Green & Amber IRT Route Marker Lights Flanking Clerestory Brow */}
            <mesh
              position={[-0.72, 2.98, endSign * (endHalfZ - 0.05)]}
              material={SUBWAY_MARKER_GREEN_MAT}
            >
              <sphereGeometry args={[0.062, 10, 8]} />
            </mesh>
            <mesh
              position={[0.72, 2.98, endSign * (endHalfZ - 0.05)]}
              material={SUBWAY_MARKER_AMBER_MAT}
            >
              <sphereGeometry args={[0.062, 10, 8]} />
            </mesh>
          </group>
        );
      })}

      {/* Curved Clerestory Steel Car Roof + Torpedo Vents + Warm Aisle Globe Lanterns (<= 3.34m) */}
      <mesh position={[0, 2.74, 0]} material={SUBWAY_CREAM_MAT} castShadow receiveShadow>
        <boxGeometry args={[halfW * 2.02, 0.16, endHalfZ * 2]} />
      </mesh>
      <mesh position={[0, 3.04, 0]} material={SUBWAY_OLIVE_MAT} castShadow>
        <boxGeometry args={[1.76, 0.44, endHalfZ * 1.96]} />
      </mesh>
      {[-4.5, -1.5, 1.5, 4.5].map((vz, idx) => (
        <mesh
          key={`roof-vent-${idx}`}
          position={[0, 3.27, vz]}
          rotation={[Math.PI * 0.5, 0, 0]}
          material={SUBWAY_BOGIE_STEEL_MAT}
          castShadow={false}
        >
          <cylinderGeometry args={[0.065, 0.065, 0.34, 8]} />
        </mesh>
      ))}
      {[-4.2, -1.4, 1.4, 4.2].map((lz, idx) => (
        <mesh key={`lamp-${idx}`} position={[0, 2.6, lz]} material={SUBWAY_INTERIOR_WARM_MAT}>
          <sphereGeometry args={[0.14, 10, 8]} />
        </mesh>
      ))}
    </group>
  );
});

/**
 * Zone 7 Cream-and-Emerald Glazed Ceramic Subway Platform Column (`[-0.39..0.39] x [0..3.9] x [-0.39..0.39]`).
 */
export const SubwayMosaicPillarProp = React.memo(function SubwayMosaicPillarProp({
  propId,
}: Stage2PropCommonProps) {
  return (
    <group
      name="subway-mosaic-pillar"
      userData={{ occludableProp: true, propId }}
    >
      {/* Stepped Granite & Dark-Emerald Column Plinth */}
      <mesh position={[0, 0.16, 0]} material={VENICE_MATERIALS.graniteCurbStone} castShadow receiveShadow>
        <boxGeometry args={[0.74, 0.32, 0.74]} />
      </mesh>
      {/* Glazed Cream Ceramic Riveted Column Shaft */}
      <mesh position={[0, 1.94, 0]} material={SUBWAY_GLAZED_TILE_MAT} castShadow receiveShadow>
        <boxGeometry args={[0.56, 3.24, 0.56]} />
      </mesh>
      {/* Emerald & Brass Mosaic Station Nameplate Band */}
      <mesh position={[0, 2.58, 0]} material={KIOSK_EMERALD_MAT}>
        <boxGeometry args={[0.62, 0.44, 0.62]} />
      </mesh>
      <mesh position={[0, 2.58, 0]} material={BRASS_METAL_MAT}>
        <boxGeometry args={[0.64, 0.08, 0.64]} />
      </mesh>
      {/* Beaux-Arts Flared Column Capital Bracket (top <= 3.88m) */}
      <mesh position={[0, 3.71, 0]} material={KIOSK_ROOF_COPPER_MAT} castShadow>
        <boxGeometry args={[0.76, 0.34, 0.76]} />
      </mesh>
    </group>
  );
});

/**
 * Zone 6 Ornamental Open-Throat Cast-Iron & Emerald-Glass Beaux-Arts Subway Headhouse
 * (`[-4.8..4.8] x [0..3.85] x [-1.2..1.2]`), 1:1 aligned to the West & East stairhead piers
 * (`x in [-4.78..-4.42]` & `[+4.42..+4.78]`) with a wide open `8.84m` center throat and zero rear wall.
 */
export const GrandSubwayHeadhouseProp = React.memo(function GrandSubwayHeadhouseProp({
  propId,
}: Stage2PropCommonProps) {
  return (
    <group
      name="grand-subway-headhouse"
      userData={{ occludableProp: true, propId, tightBallRayOnly: true }}
    >
      {/* West & East Cast-Iron / Granite Flanking Portal Piers (clear throat: |x| < 4.42m!) */}
      {[-1, 1].map((sideX) => (
        <group key={`headhouse-pier-${sideX}`} position={[sideX * 4.6, 0, 0]}>
          {/* Grounded Granite Plinth */}
          <mesh
            position={[0, 0.16, 0]}
            material={VENICE_MATERIALS.graniteCurbStone}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.4, 0.32, 2.38]} />
          </mesh>
          {/* Twin Front & Rear Fluted Emerald Cast-Iron Columns */}
          {[-0.98, 0.98].map((pz, pIdx) => (
            <mesh
              key={`col-${pIdx}`}
              position={[0, 1.82, pz]}
              material={KIOSK_EMERALD_MAT}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.32, 3.04, 0.36]} />
            </mesh>
          ))}
          {/* Ornamental Recessed Emerald Grille Mullion Panel between Pier Columns */}
          <mesh position={[0, 1.78, 0]} material={KIOSK_EMERALD_MAT} castShadow>
            <boxGeometry args={[0.18, 2.86, 1.64]} />
          </mesh>
          {/* Brass Capital Corbel Moulding + Lower Brass Kickband */}
          <mesh position={[0, 0.36, 0]} material={BRASS_METAL_MAT}>
            <boxGeometry args={[0.36, 0.08, 2.36]} />
          </mesh>
          <mesh position={[0, 3.28, 0]} material={BRASS_METAL_MAT} castShadow>
            <boxGeometry args={[0.38, 0.18, 2.36]} />
          </mesh>
          {/* Corner Ornate Brass Haunch Brackets flanking Throat Opening */}
          {[-0.98, 0.98].map((bz, bIdx) => (
            <mesh
              key={`corbel-${bIdx}`}
              position={[-sideX * 0.24, 3.16, bz]}
              material={BRASS_METAL_MAT}
            >
              <boxGeometry args={[0.16, 0.26, 0.18]} />
            </mesh>
          ))}
          {/* Four Warm Frosted-Glass Transit Station Globe Beacons */}
          {[-1.08, 1.08].map((lz, lIdx) => (
            <group key={`beacon-${lIdx}`} position={[0, 2.72, lz]}>
              <mesh material={BRASS_METAL_MAT}>
                <cylinderGeometry args={[0.045, 0.06, 0.14, 10]} />
              </mesh>
              <mesh
                position={[0, 0.13, 0]}
                material={HEADHOUSE_TRANSOM_GLOW_MAT}
                castShadow={false}
              >
                <sphereGeometry args={[0.13, 12, 10]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* Overhead Beaux-Arts Emerald Iron & Patinated Copper Canopy Lintel (y = 3.38..3.85m) */}
      <mesh position={[0, 3.51, 0]} material={KIOSK_EMERALD_MAT} castShadow receiveShadow>
        <boxGeometry args={[9.56, 0.26, 2.36]} />
      </mesh>
      {/* Brass Lower Drip Soffit Trim & Upper Crest Cornice */}
      <mesh position={[0, 3.39, 0]} material={BRASS_METAL_MAT}>
        <boxGeometry args={[9.52, 0.06, 2.38]} />
      </mesh>
      <mesh position={[0, 3.7, 0]} material={KIOSK_ROOF_COPPER_MAT} castShadow receiveShadow>
        <boxGeometry args={[9.6, 0.14, 2.4]} />
      </mesh>
      <mesh position={[0, 3.79, 0]} material={KIOSK_ROOF_COPPER_MAT} castShadow>
        <boxGeometry args={[9.44, 0.12, 1.18]} />
      </mesh>

      {/* North Arrival & South Stairwell Illuminated Opal-Glass SUBWAY Transom Marquees */}
      {[-1.18, 1.18].map((sz, sIdx) => (
        <group key={`transom-${sIdx}`} position={[0, 3.52, sz]}>
          <mesh material={BRASS_METAL_MAT}>
            <boxGeometry args={[5.56, 0.24, 0.06]} />
          </mesh>
          <mesh
            position={[0, 0, Math.sign(sz) * 0.025]}
            material={HEADHOUSE_TRANSOM_GLOW_MAT}
          >
            <boxGeometry args={[5.28, 0.17, 0.03]} />
          </mesh>
          {/* Twin Emerald IRT Crest Roundels Flanking Illuminated SUBWAY Strip */}
          {[-2.35, 2.35].map((rx, rIdx) => (
            <mesh
              key={`roundel-${rIdx}`}
              position={[rx, 0, Math.sign(sz) * 0.036]}
              rotation={[Math.PI * 0.5, 0, 0]}
              material={KIOSK_EMERALD_MAT}
            >
              <cylinderGeometry args={[0.075, 0.075, 0.02, 12]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
});
