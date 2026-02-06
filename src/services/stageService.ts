import { CropStage, CropType } from '@/types';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/** Derive display status: respect stored status first, then dates (aligned with CropStagesPage). */
function getDerivedStatus(
  stage: CropStage,
  today: Date,
): 'pending' | 'in-progress' | 'completed' {
  if (stage.status === 'completed') return 'completed';
  const start = stage.startDate ? new Date(stage.startDate) : undefined;
  const end = stage.endDate ? new Date(stage.endDate) : undefined;
  if (!start || !end) return 'pending';
  if (today < start) return 'pending';
  if (today > end) return 'completed';
  return 'in-progress';
}

/** Returns the current crop stage for the project (first non-completed), aligned with CropStagesPage. */
export function getCurrentStageForProject(
  stages: CropStage[],
): { stageIndex: number; stageName: string } | null {
  if (!stages.length) return null;

  const today = new Date();
  const sorted = [...stages].sort((a, b) => (a.stageIndex ?? 0) - (b.stageIndex ?? 0));

  const firstNonCompleted = sorted.find(
    (s) => getDerivedStatus(s, today) !== 'completed',
  );
  if (firstNonCompleted) {
    return {
      stageIndex: firstNonCompleted.stageIndex ?? 0,
      stageName: firstNonCompleted.stageName ?? `Stage ${firstNonCompleted.stageIndex}`,
    };
  }

  const last = sorted[sorted.length - 1];
  return last
    ? { stageIndex: last.stageIndex ?? 0, stageName: last.stageName ?? `Stage ${last.stageIndex}` }
    : null;
}

export async function fetchProjectStages(companyId: string, projectId: string, cropType: CropType) {
  const q = query(
    collection(db, 'projectStages'),
    where('companyId', '==', companyId),
    where('projectId', '==', projectId),
    where('cropType', '==', cropType),
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })) as CropStage[];
}

