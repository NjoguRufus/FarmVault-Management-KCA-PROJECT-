import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function useCollection<T = any>(key: string, path: string) {
  return useQuery({
    queryKey: [key],
    queryFn: async () => {
      const snap = await getDocs(collection(db, path));
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as T[];
    },
  });
}

