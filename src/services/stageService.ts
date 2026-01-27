import { CropStage, CropType } from '@/types';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function getCurrentStageForProject(
  stages: CropStage[],
): { stageIndex: number; stageName: string } | null {
  if (!stages.length) return null;

  const today = new Date();
  const withStatus = stages.map((s) => {
    const start = s.startDate ? new Date(s.startDate) : undefined;
    const end = s.endDate ? new Date(s.endDate) : undefined;
    let status: 'pending' | 'in-progress' | 'completed' = 'pending';
    if (start && end) {
      if (today < start) status = 'pending';
      else if (today > end) status = 'completed';
      else status = 'in-progress';
    }
    return { ...s, status };
  });

  const inProgress = withStatus.find((s) => s.status === 'in-progress');
  if (inProgress) {
    return { stageIndex: inProgress.stageIndex, stageName: inProgress.stageName };
  }

  const completed = withStatus
    .filter((s) => s.status === 'completed')
    .sort((a, b) => a.stageIndex - b.stageIndex);
  if (completed.length) {
    const last = completed[completed.length - 1];
    return { stageIndex: last.stageIndex, stageName: last.stageName };
  }

  const earliest = withStatus.sort((a, b) => a.stageIndex - b.stageIndex)[0];
  return { stageIndex: earliest.stageIndex, stageName: earliest.stageName };
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

