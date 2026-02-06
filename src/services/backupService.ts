import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  setDoc,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

const BACKUP_ROOT = 'developerBackups';

/** Company-scoped collections that have a companyId field (except companies itself). */
const COMPANY_COLLECTIONS = [
  'users',
  'projects',
  'projectStages',
  'harvests',
  'sales',
  'expenses',
  'workLogs',
  'employees',
  'inventoryCategories',
  'inventoryItems',
  'inventoryPurchases',
  'inventoryUsage',
  'suppliers',
  'seasonChallenges',
  'neededItems',
  'deliveries',
] as const;

export interface CompanyBackupSnapshot {
  id: string;
  companyId: string;
  companyName?: string;
  createdAt: Timestamp;
  collections: Record<string, Array<{ id: string; [key: string]: any }>>;
}

/** Create a backup of all company data. Only developer should call this. */
export async function createCompanyBackup(companyId: string, companyName?: string): Promise<string> {
  const snapRef = doc(collection(db, BACKUP_ROOT, companyId, 'snapshots'));
  const collections: Record<string, Array<{ id: string; [key: string]: any }>> = {};

  // 1. Company document
  const companySnap = await getDoc(doc(db, 'companies', companyId));
  if (companySnap.exists()) {
    collections['companies'] = [{ id: companySnap.id, ...companySnap.data() }];
  } else {
    collections['companies'] = [];
  }

  // 2. All company-scoped collections
  for (const collName of COMPANY_COLLECTIONS) {
    const q = query(
      collection(db, collName),
      where('companyId', '==', companyId)
    );
    const snap = await getDocs(q);
    collections[collName] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  const snapshotId = snapRef.id;
  await setDoc(snapRef, {
    companyId,
    companyName: companyName ?? null,
    createdAt: serverTimestamp(),
    collections,
  });

  return snapshotId;
}

/** List backup snapshot IDs and minimal info for a company (newest first). */
export async function listCompanyBackups(companyId: string): Promise<
  Array<{ id: string; companyId: string; companyName?: string; createdAt: Timestamp | null }>
> {
  const q = query(
    collection(db, BACKUP_ROOT, companyId, 'snapshots'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      companyId: data.companyId ?? companyId,
      companyName: data.companyName ?? undefined,
      createdAt: data.createdAt ?? null,
    };
  });
}

/** Get one backup snapshot (full data). */
export async function getBackupSnapshot(
  companyId: string,
  snapshotId: string
): Promise<CompanyBackupSnapshot | null> {
  const ref = doc(db, BACKUP_ROOT, companyId, 'snapshots', snapshotId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CompanyBackupSnapshot;
}

/** Restore a company's data from a backup. Overwrites existing docs with same id. Only developer should call. */
export async function restoreCompanyFromBackup(
  companyId: string,
  snapshotId: string
): Promise<void> {
  const backup = await getBackupSnapshot(companyId, snapshotId);
  if (!backup?.collections) throw new Error('Backup not found or invalid');

  const batchSize = 500;
  let batch = writeBatch(db);
  let count = 0;

  for (const [collName, docs] of Object.entries(backup.collections)) {
    if (!Array.isArray(docs)) continue;
    for (const item of docs) {
      const { id: docId, ...data } = item;
      if (!docId) continue;
      const ref = collName === 'companies' ? doc(db, 'companies', docId) : doc(db, collName, docId);
      batch.set(ref, data);
      count++;
      if (count >= batchSize) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
  }
  if (count > 0) await batch.commit();
}
