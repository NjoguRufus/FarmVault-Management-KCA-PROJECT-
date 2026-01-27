import {
  collection,
  addDoc,
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { InventoryItem, InventoryPurchase, InventoryUsage, InventoryCategory } from '@/types';

type RestockInput = {
  companyId: string;
  inventoryItemId: string;
  quantityAdded: number;
  unit: string;
  totalCost: number;
  projectId?: string;
  date: Date;
};

export async function restockInventoryAndCreateExpense(input: RestockInput) {
  const { companyId, inventoryItemId, quantityAdded, unit, totalCost, projectId, date } = input;

  const batch = writeBatch(db);

  const itemRef = doc(db, 'inventoryItems', inventoryItemId);
  batch.update(itemRef, {
    quantity: (quantityAdded || 0) ? undefined : undefined,
    lastUpdated: serverTimestamp(),
  });

  const purchaseRef = doc(collection(db, 'inventoryPurchases'));
  const purchase: Omit<InventoryPurchase, 'id'> = {
    companyId,
    inventoryItemId,
    quantityAdded,
    unit,
    totalCost,
    pricePerUnit: quantityAdded ? totalCost / quantityAdded : undefined,
    projectId,
    date,
    expenseId: undefined,
    createdAt: new Date(),
  };

  batch.set(purchaseRef, {
    ...purchase,
    date,
    createdAt: serverTimestamp(),
  });

  await batch.commit();
}

type RecordUsageInput = {
  companyId: string;
  projectId: string;
  inventoryItemId: string;
  category: InventoryCategory;
  quantity: number;
  unit: string;
  source: 'workLog' | 'manual-adjustment';
  workLogId?: string;
  stageIndex?: number;
  stageName?: string;
  date: Date;
};

export async function recordInventoryUsage(input: RecordUsageInput) {
  const usage: Omit<InventoryUsage, 'id'> = {
    ...input,
    createdAt: new Date(),
  };

  await addDoc(collection(db, 'inventoryUsage'), {
    ...usage,
    date: input.date,
    createdAt: serverTimestamp(),
  });
}

