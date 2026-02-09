import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  increment,
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

export type DeductForWorkCardInput = {
  companyId: string;
  projectId: string;
  inventoryItemId: string;
  quantity: number;
  stageName?: string;
  workCardId: string;
  date: Date;
  /** Manager who submitted the work (for usage record). */
  managerName?: string;
};

/** Deduct inventory for a work card (after admin approves). Decrements item quantity and records usage.
 * One unit at a time: for chemical box, quantity = number of ITEMS (units) used, not boxes.
 * E.g. 1 box has 12 items, using 2 means 2 units deducted; inventory is stored in units. */
export async function deductInventoryForWorkCard(input: DeductForWorkCardInput): Promise<void> {
  const { companyId, projectId, inventoryItemId, quantity, stageName, workCardId, date, managerName } = input;
  if (!inventoryItemId || quantity <= 0) return;

  const itemSnap = await getDoc(doc(db, 'inventoryItems', inventoryItemId));
  if (!itemSnap.exists()) throw new Error('Inventory item not found');
  const item = { id: itemSnap.id, ...itemSnap.data() } as InventoryItem;
  if (item.companyId !== companyId) throw new Error('Item does not belong to company');

  const it = item as InventoryItem & { packagingType?: string; unitsPerBox?: number };
  const isChemicalBox = item.category === 'chemical' && it.packagingType === 'box' && (it.unitsPerBox ?? 0) > 0;
  const unitsPerBox = isChemicalBox ? Number(it.unitsPerBox) : 1;

  // Work card quantity = units (items) used. For chemical box we deduct that many units by converting to boxes.
  const quantityToDeductFromStock = isChemicalBox ? quantity / unitsPerBox : quantity;
  const currentQty = Number(item.quantity) || 0;
  if (currentQty < quantityToDeductFromStock) {
    const currentUnits = isChemicalBox ? Math.floor(currentQty * unitsPerBox) : currentQty;
    throw new Error(`Insufficient stock: ${item.name} has ${isChemicalBox ? `${currentUnits} units` : currentQty + ' ' + item.unit}, need ${quantity} ${isChemicalBox ? 'units' : item.unit}`);
  }

  const itemRef = doc(db, 'inventoryItems', inventoryItemId);
  await updateDoc(itemRef, {
    quantity: increment(-quantityToDeductFromStock),
    lastUpdated: serverTimestamp(),
  });

  // Record usage in units (items) so it's clear; manager stored for display
  const quantityForUsage = quantity;
  const unitForUsage = isChemicalBox ? 'units' : item.unit;
  await addDoc(collection(db, 'inventoryUsage'), {
    companyId,
    projectId,
    inventoryItemId,
    category: item.category,
    quantity: quantityForUsage,
    unit: unitForUsage,
    source: 'workCard',
    workCardId,
    managerName: managerName ?? undefined,
    stageName: stageName ?? undefined,
    date,
    createdAt: serverTimestamp(),
  });
}

