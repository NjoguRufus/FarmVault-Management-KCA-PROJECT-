import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

/** Company-scoped collections to wipe when "Delete everything" is used. Company doc and users are kept. */
const COMPANY_DATA_COLLECTIONS = [
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
  'feedback',
] as const;

const BATCH_SIZE = 500;

/**
 * Deletes all company data for the given company (all docs in company-scoped collections).
 * Does NOT delete the company document or user profiles so the tenant can still log in.
 * Only company-admin should call this; enforce in UI and consider in rules.
 */
export async function deleteAllCompanyData(companyId: string): Promise<void> {
  for (const collName of COMPANY_DATA_COLLECTIONS) {
    const q = query(
      collection(db, collName),
      where('companyId', '==', companyId)
    );
    const snap = await getDocs(q);
    let batch = writeBatch(db);
    let count = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      count++;
      if (count >= BATCH_SIZE) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
  }
}
