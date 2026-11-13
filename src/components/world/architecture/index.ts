import { PERIMETER_BUILDINGS } from '@/config/courseMasterPlan';
import type { PerimeterBuildingSpec } from '@/types/course';

export {
  BuildingFacadeModule,
  type BuildingFacadeModuleProps,
} from './BuildingFacadeModule';
export {
  ArchitecturalWallsGroup,
  CourtyardPergolaMesh,
  SkylineAndHorizonSkirt,
  StringLightSpansGroup,
} from './ArchitecturalFeatures';
export {
  PerimeterEnclosure,
  type PerimeterEnclosureProps,
} from './PerimeterEnclosure';

export interface QaFacadeSample {
  id: string;
  label: string;
  category: 'facade';
  summary: string;
  localSize: [number, number, number];
  recommendedCameraDistance: number;
  building: PerimeterBuildingSpec;
}

const FEATURED_FACADE_SAMPLE_SPECS: Array<{
  buildingId: string;
  label: string;
  summary: string;
}> = [
  {
    buildingId: 'bld-west-3',
    label: 'Pasticceria Terracotta Storefront',
    summary:
      'Terracotta stucco 4-story Venetian bakery with double shopfront arches, striped 28° awning, louvered shutters & hipped tile roof.',
  },
  {
    buildingId: 'bld-se-corner-bodega',
    label: '5th & Mercer Corner Bodega',
    summary:
      'Dual-frontage corner terracotta bodega & bakery facing both 5th Ave (W) and Mercer St (N) with corner wrap cornice & awnings.',
  },
  {
    buildingId: 'bld-west-2-scaffolding-host',
    label: 'Mercer Masonry Brownstone',
    summary:
      'Aged brick brownstone with recessed arched windows, fire escape balconies & parapet coping (flush scaffolding host).',
  },
  {
    buildingId: 'bld-west-4',
    label: 'Trattoria del Sole Mansard',
    summary:
      'Warm ochre 4-story facade crowned with slate mansard roof, ornate Juliet flower-box balconies & copper drainpipes.',
  },
  {
    buildingId: 'bld-east-2',
    label: 'Mercer Row Apothecary',
    summary:
      'Cream limestone facade with espresso shutters, timber apothecary shopfront & classic cornice parapet.',
  },
  {
    buildingId: 'bld-north-3-courtyard',
    label: 'Piazza Pergola Townhouse',
    summary:
      'Sunlit courtyard residence grounded cleanly at +0.60m terrace height with terrace doors, shutters & Venetian flower boxes.',
  },
];

function buildQaFacadeSamples(): QaFacadeSample[] {
  const byId = new Map<string, PerimeterBuildingSpec>();
  for (const b of PERIMETER_BUILDINGS) {
    byId.set(b.id, b);
  }

  const samples: QaFacadeSample[] = [];
  for (const spec of FEATURED_FACADE_SAMPLE_SPECS) {
    const bld = byId.get(spec.buildingId);
    if (!bld) continue;
    const widthX = bld.boundsXZ.maxX - bld.boundsXZ.minX;
    const depthZ = bld.boundsXZ.maxZ - bld.boundsXZ.minZ;
    const maxHoriz = Math.max(widthX, depthZ);
    samples.push({
      id: bld.id,
      label: spec.label,
      category: 'facade',
      summary: spec.summary,
      localSize: [widthX, bld.height, depthZ],
      recommendedCameraDistance: Math.max(18, Math.round(maxHoriz * 1.45)),
      building: bld,
    });
  }

  if (samples.length === 0 && PERIMETER_BUILDINGS.length > 0) {
    const bld = PERIMETER_BUILDINGS[0]!;
    const widthX = bld.boundsXZ.maxX - bld.boundsXZ.minX;
    const depthZ = bld.boundsXZ.maxZ - bld.boundsXZ.minZ;
    samples.push({
      id: bld.id,
      label: bld.name,
      category: 'facade',
      summary: `${bld.palette} ${bld.stories}-story facade module.`,
      localSize: [widthX, bld.height, depthZ],
      recommendedCameraDistance: Math.max(18, Math.round(Math.max(widthX, depthZ) * 1.45)),
      building: bld,
    });
  }

  return samples;
}

export const QA_FACADE_SAMPLES: QaFacadeSample[] = buildQaFacadeSamples();
