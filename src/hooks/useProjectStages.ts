import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CropStage } from '@/types';

export function useProjectStages(companyId: string | null | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-stages', companyId, projectId],
    enabled: !!companyId && !!projectId,
    queryFn: async () => {
      if (!companyId || !projectId) return [] as CropStage[];
      const q = query(
        collection(db, 'projectStages'),
        where('companyId', '==', companyId),
        where('projectId', '==', projectId),
      );
      const snap = await getDocs(q);
      return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })) as CropStage[];
    },
  });
}

