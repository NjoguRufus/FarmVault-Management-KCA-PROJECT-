import { addDays } from 'date-fns';
import { CropType } from '@/types';

export interface CropStageDefinition {
  name: string;
  order: number;
  expectedDurationDays: number;
}

export type CropStageConfig = Record<CropType, CropStageDefinition[]>;

export const cropStageConfig: CropStageConfig = {
  tomatoes: [
    { name: 'Nursery',             order: 0, expectedDurationDays: 21 },
    { name: 'Transplanting',       order: 1, expectedDurationDays: 7  },
    { name: 'Vegetative Growth',   order: 2, expectedDurationDays: 28 },
    { name: 'Flowering',           order: 3, expectedDurationDays: 14 },
    { name: 'Fruiting',            order: 4, expectedDurationDays: 28 },
    { name: 'Harvesting',          order: 5, expectedDurationDays: 21 },
  ],
  'french-beans': [
    { name: 'Planting',            order: 0, expectedDurationDays: 7  },
    { name: 'Germination',         order: 1, expectedDurationDays: 7  },
    { name: 'Vegetative Growth',   order: 2, expectedDurationDays: 21 },
    { name: 'Flowering',           order: 3, expectedDurationDays: 7  },
    { name: 'Pod Formation',       order: 4, expectedDurationDays: 14 },
    { name: 'Harvesting',          order: 5, expectedDurationDays: 14 },
  ],
  capsicum: [
    { name: 'Nursery',             order: 0, expectedDurationDays: 21 },
    { name: 'Transplanting',       order: 1, expectedDurationDays: 7  },
    { name: 'Vegetative Growth',   order: 2, expectedDurationDays: 35 },
    { name: 'Flowering',           order: 3, expectedDurationDays: 14 },
    { name: 'Fruiting',            order: 4, expectedDurationDays: 35 },
    { name: 'Harvesting',          order: 5, expectedDurationDays: 30 },
  ],
  maize: [
    { name: 'Land Preparation',          order: 0, expectedDurationDays: 7  },
    { name: 'Planting',                  order: 1, expectedDurationDays: 7  },
    { name: 'Germination',               order: 2, expectedDurationDays: 7  },
    { name: 'Vegetative Growth',         order: 3, expectedDurationDays: 35 },
    { name: 'Tasseling & Silking',       order: 4, expectedDurationDays: 14 },
    { name: 'Maturity',                  order: 5, expectedDurationDays: 21 },
    { name: 'Harvesting',                order: 6, expectedDurationDays: 14 },
  ],
  watermelons: [
    { name: 'Planting',            order: 0, expectedDurationDays: 7  },
    { name: 'Germination',         order: 1, expectedDurationDays: 7  },
    { name: 'Vine Development',    order: 2, expectedDurationDays: 28 },
    { name: 'Flowering',           order: 3, expectedDurationDays: 14 },
    { name: 'Fruit Development',   order: 4, expectedDurationDays: 28 },
    { name: 'Harvesting',          order: 5, expectedDurationDays: 21 },
  ],
  rice: [
    { name: 'Nursery',             order: 0, expectedDurationDays: 21 },
    { name: 'Transplanting',       order: 1, expectedDurationDays: 7  },
    { name: 'Tillering',           order: 2, expectedDurationDays: 21 },
    { name: 'Panicle Initiation',  order: 3, expectedDurationDays: 14 },
    { name: 'Flowering',           order: 4, expectedDurationDays: 14 },
    { name: 'Maturity',            order: 5, expectedDurationDays: 21 },
    { name: 'Harvesting',          order: 6, expectedDurationDays: 14 },
  ],
};

export function getCropStages(cropType: CropType): CropStageDefinition[] {
  return cropStageConfig[cropType] ?? [];
}

export interface GeneratedStage {
  stageName: string;
  stageIndex: number;
  startDate: Date;
  endDate: Date;
  expectedDurationDays: number;
}

export function generateStageTimeline(
  cropType: CropType,
  plantingDate: Date,
  startingStageIndex: number,
): GeneratedStage[] {
  const defs = getCropStages(cropType);
  const slice = defs.slice(startingStageIndex);
  let currentStart = plantingDate;

  const stages: GeneratedStage[] = [];

  slice.forEach((def) => {
    const startDate = currentStart;
    const endDate = addDays(startDate, def.expectedDurationDays - 1);
    stages.push({
      stageName: def.name,
      stageIndex: def.order,
      startDate,
      endDate,
      expectedDurationDays: def.expectedDurationDays,
    });
    currentStart = addDays(endDate, 1);
  });

  return stages;
}

