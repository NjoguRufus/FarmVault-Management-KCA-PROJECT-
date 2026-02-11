import {
  db,
  auth,
} from '@/lib/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
  getDocs,
  query,
  where,
  runTransaction,
} from 'firebase/firestore';
import type { HarvestCollectionStatus } from '@/types';

const COLLECTIONS = 'harvestCollections';
const PICKERS = 'harvestPickers';
const WEIGH_ENTRIES = 'pickerWeighEntries';
const PAYMENT_BATCHES = 'harvestPaymentBatches';
const CASH_POOLS = 'harvestCashPools';

/** Create a new day collection session */
export async function createHarvestCollection(params: {
  companyId: string;
  projectId: string;
  cropType: string;
  name: string;
  harvestDate: Date;
  pricePerKgPicker: number;
}): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS), {
    companyId: params.companyId,
    projectId: params.projectId,
    cropType: params.cropType,
    name: params.name,
    harvestDate: params.harvestDate,
    pricePerKgPicker: params.pricePerKgPicker,
    totalHarvestKg: 0,
    totalPickerCost: 0,
    status: 'collecting',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Add a picker to a collection */
export async function addHarvestPicker(params: {
  companyId: string;
  collectionId: string;
  pickerNumber: number;
  pickerName: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, PICKERS), {
    companyId: params.companyId,
    collectionId: params.collectionId,
    pickerNumber: params.pickerNumber,
    pickerName: params.pickerName,
    totalKg: 0,
    totalPay: 0,
    isPaid: false,
  });
  return ref.id;
}

/** Record a weigh entry and update picker totals + collection totals */
export async function addPickerWeighEntry(params: {
  companyId: string;
  pickerId: string;
  collectionId: string;
  weightKg: number;
  tripNumber: number;
}): Promise<string> {
  const ref = await addDoc(collection(db, WEIGH_ENTRIES), {
    companyId: params.companyId,
    pickerId: params.pickerId,
    collectionId: params.collectionId,
    weightKg: params.weightKg,
    tripNumber: params.tripNumber,
    recordedAt: serverTimestamp(),
  });
  await recalcPickerAndCollection(params.pickerId, params.collectionId);
  return ref.id;
}

/** Recompute picker totalKg/totalPay from weigh entries, then collection totals */
async function recalcPickerAndCollection(pickerId: string, collectionId: string): Promise<void> {
  const pricePerKg = await getPricePerKgPicker(collectionId);

  const entriesSnap = await getDocs(
    query(
      collection(db, WEIGH_ENTRIES),
      where('pickerId', '==', pickerId)
    )
  );
  const totalKg = entriesSnap.docs.reduce((sum, d) => sum + (d.data().weightKg ?? 0), 0);
  const totalPay = Math.round(totalKg * pricePerKg);

  const batch = writeBatch(db);
  batch.update(doc(db, PICKERS, pickerId), { totalKg, totalPay });
  await batch.commit();

  await recalcCollectionTotals(collectionId);
}

/** Get pricePerKgPicker from collection */
async function getPricePerKgPicker(collectionId: string): Promise<number> {
  const colSnap = await getDoc(doc(db, COLLECTIONS, collectionId));
  const data = colSnap.data();
  return data?.pricePerKgPicker ?? 0;
}

/** Recompute collection totalHarvestKg and totalPickerCost from all pickers */
export async function recalcCollectionTotals(collectionId: string): Promise<void> {
  const pickersSnap = await getDocs(
    query(collection(db, PICKERS), where('collectionId', '==', collectionId))
  );
  let totalHarvestKg = 0;
  let totalPickerCost = 0;
  pickersSnap.docs.forEach((d) => {
    const dta = d.data();
    totalHarvestKg += dta.totalKg ?? 0;
    totalPickerCost += dta.totalPay ?? 0;
  });

  await updateDoc(doc(db, COLLECTIONS, collectionId), {
    totalHarvestKg,
    totalPickerCost,
  });
}

/** Mark a picker as cash paid */
export async function markPickerCashPaid(pickerId: string): Promise<void> {
  await updateDoc(doc(db, PICKERS, pickerId), {
    isPaid: true,
    paidAt: serverTimestamp(),
  });
}

/** Mark multiple pickers as paid in one group (creates a payment batch for records) */
export async function markPickersPaidInBatch(params: {
  companyId: string;
  collectionId: string;
  pickerIds: string[];
  totalAmount: number;
}): Promise<string> {
  const { companyId, collectionId, pickerIds, totalAmount } = params;
  if (pickerIds.length === 0) throw new Error('No pickers to mark paid');

  const batchRef = await addDoc(collection(db, PAYMENT_BATCHES), {
    companyId,
    collectionId,
    pickerIds,
    totalAmount,
    paidAt: serverTimestamp(),
  });

  const wb = writeBatch(db);
  for (const pickerId of pickerIds) {
    wb.update(doc(db, PICKERS, pickerId), {
      isPaid: true,
      paidAt: serverTimestamp(),
      paymentBatchId: batchRef.id,
    });
  }
  await wb.commit();

  return batchRef.id;
}

/** Set buyer price and compute totalRevenue + profit; optionally mark buyer paid (closed) */
export async function setBuyerPriceAndMaybeClose(params: {
  collectionId: string;
  pricePerKgBuyer: number;
  markBuyerPaid: boolean;
}): Promise<void> {
  const colRef = doc(db, COLLECTIONS, params.collectionId);
  const pickersSnap = await getDocs(
    query(collection(db, PICKERS), where('collectionId', '==', params.collectionId))
  );
  const allPaid = pickersSnap.docs.every((d) => d.data().isPaid === true);
  if (params.markBuyerPaid && !allPaid) {
    throw new Error('Cannot close harvest: some pickers are still unpaid.');
  }

  const colSnap = await getDoc(doc(db, COLLECTIONS, params.collectionId));
  const col = colSnap.data();
  const totalHarvestKg = col?.totalHarvestKg ?? 0;
  const totalPickerCost = col?.totalPickerCost ?? 0;
  const totalRevenue = totalHarvestKg * params.pricePerKgBuyer;
  const profit = totalRevenue - totalPickerCost;

  const update: Record<string, unknown> = {
    pricePerKgBuyer: params.pricePerKgBuyer,
    totalRevenue,
    profit,
    status: params.markBuyerPaid ? 'closed' : 'sold',
  };
  if (params.markBuyerPaid) {
    update.buyerPaidAt = serverTimestamp();

    // For French beans, when buyer is marked as paid, automatically create a harvest + sale
    // record so that the Harvest Sales page reflects the revenue in Harvest Records and totals.
    const isFrenchBeans = (col?.cropType as string | undefined)?.toLowerCase() === 'french-beans';
    const alreadySavedToHarvests = !!col?.buyerPaidAt;
    if (isFrenchBeans && !alreadySavedToHarvests && totalHarvestKg > 0 && totalRevenue > 0) {
      // Create aggregate harvest document
      const harvestRef = await addDoc(collection(db, 'harvests'), {
        quantity: totalHarvestKg,
        unit: 'kg',
        quality: 'A',
        projectId: col?.projectId,
        companyId: col?.companyId,
        cropType: col?.cropType,
        destination: 'market',
        date: col?.harvestDate ?? serverTimestamp(),
        createdAt: serverTimestamp(),
        notes: col?.name ? `From picker collection: ${col.name}` : 'From picker collection',
        farmPricingMode: 'total',
        farmPriceUnitType: 'kg',
        farmTotalPrice: totalRevenue,
      });

      // Create matching sale document so total revenue is included in Harvest Sales totals
      await addDoc(collection(db, 'sales'), {
        harvestId: harvestRef.id,
        buyerName: 'Buyer (collections)',
        quantity: totalHarvestKg,
        unit: 'kg',
        unitPrice: params.pricePerKgBuyer,
        totalAmount: totalRevenue,
        status: 'completed',
        projectId: col?.projectId,
        companyId: col?.companyId,
        cropType: col?.cropType,
        date: col?.harvestDate ?? serverTimestamp(),
        createdAt: serverTimestamp(),
      });
    }
  }
  await updateDoc(colRef, update);
}

/** Update collection status to payout_complete when all pickers are paid (optional, for UI state) */
export async function refreshCollectionStatus(collectionId: string): Promise<HarvestCollectionStatus> {
  const pickersSnap = await getDocs(
    query(collection(db, PICKERS), where('collectionId', '==', collectionId))
  );
  const allPaid = pickersSnap.docs.length > 0 && pickersSnap.docs.every((d) => d.data().isPaid === true);
  const colRef = doc(db, COLLECTIONS, collectionId);
  const status: HarvestCollectionStatus = allPaid ? 'payout_complete' : 'collecting';
  await updateDoc(colRef, { status });
  return status;
}

/** Register or update cash pool for a harvest collection (French beans wallet). */
export async function registerHarvestCash(params: {
  collectionId: string;
  projectId: string;
  companyId: string;
  cropType: string;
  cashReceived: number;
  source: string;
  receivedBy: string;
}): Promise<void> {
  const snap = await getDocs(
    query(collection(db, CASH_POOLS), where('collectionId', '==', params.collectionId))
  );
  if (snap.empty) {
    await addDoc(collection(db, CASH_POOLS), {
      collectionId: params.collectionId,
      projectId: params.projectId,
      cropType: params.cropType,
      companyId: params.companyId,
      cashReceived: params.cashReceived,
      totalPaidOut: 0,
      remainingBalance: params.cashReceived,
      source: params.source,
      receivedAt: serverTimestamp(),
      receivedBy: params.receivedBy,
    });
    return;
  }

  const docSnap = snap.docs[0];
  const data = docSnap.data() as any;
  const totalPaidOut = Number(data.totalPaidOut ?? 0);
  await updateDoc(docSnap.ref, {
    cashReceived: params.cashReceived,
    remainingBalance: params.cashReceived - totalPaidOut,
    source: params.source,
    receivedAt: serverTimestamp(),
    receivedBy: params.receivedBy,
  });
}

/**
 * Internal helper: mirror a wallet deduction into the per-collection cash pool
 * so that UI balances (cashReceived, totalPaidOut, remainingBalance) stay in sync.
 */
async function mirrorWalletDeductionToCashPool(collectionId: string, amount: number): Promise<void> {
  if (amount <= 0) return;

  const snap = await getDocs(
    query(collection(db, CASH_POOLS), where('collectionId', '==', collectionId))
  );
  if (snap.empty) return;

  const docSnap = snap.docs[0];
  const data = docSnap.data() as any;
  const cashReceived = Number(data.cashReceived ?? 0);
  const prevPaidOut = Number(data.totalPaidOut ?? 0);
  const newPaidOut = prevPaidOut + amount;
  const remainingBalance = Math.max(0, cashReceived - newPaidOut);

  await updateDoc(docSnap.ref, {
    totalPaidOut: newPaidOut,
    remainingBalance,
  });
}

/** Apply a picker payout from the single master harvest wallet (per project/crop). */
export async function applyHarvestCashPayment(params: {
  companyId: string;
  projectId: string;
  cropType: string;
  collectionId: string;
  amount: number;
}): Promise<void> {
  const { companyId, projectId, cropType, collectionId, amount } = params;
  if (amount <= 0) return;

  const walletId = `${companyId}_${projectId}_${cropType}`;
  const walletRef = doc(db, 'harvestWallets', walletId);
  const usageRef = doc(db, 'collectionCashUsage', `${walletId}_${collectionId}`);

  await runTransaction(db, async (tx) => {
    // 1) Read wallet and usage before any writes (required by Firestore)
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists()) {
      throw new Error('No harvest wallet found for this project/crop. Add cash first.');
    }
    const wallet = walletSnap.data() as any;
    const currentBalance = wallet.currentBalance ?? 0;
    const cashPaidOutTotal = wallet.cashPaidOutTotal ?? 0;
    if (currentBalance < amount) {
      throw new Error('Not enough cash in Harvest Wallet.');
    }

    const usageSnap = await tx.get(usageRef);

    // 2) Writes
    tx.update(walletRef, {
      currentBalance: currentBalance - amount,
      cashPaidOutTotal: cashPaidOutTotal + amount,
      lastUpdatedAt: new Date(),
    });

    if (!usageSnap.exists()) {
      tx.set(usageRef, {
        companyId,
        projectId,
        cropType,
        walletId,
        collectionId,
        totalDeducted: amount,
        lastUpdatedAt: new Date(),
      });
    } else {
      const usage = usageSnap.data() as any;
      const totalDeducted = (usage.totalDeducted ?? 0) + amount;
      tx.update(usageRef, {
        totalDeducted,
        lastUpdatedAt: new Date(),
      });
    }
  });

  // Also reflect this deduction in the collection's cash pool (if any)
  await mirrorWalletDeductionToCashPool(collectionId, amount);
}

export async function payPickersFromWalletBatchFirestore(params: {
  companyId: string;
  projectId: string;
  cropType: string;
  collectionId: string;
  pickerIds: string[];
}): Promise<void> {
  const { companyId, projectId, cropType, collectionId, pickerIds } = params;
  if (!pickerIds.length) return;

  const walletId = `${companyId}_${projectId}_${cropType}`;
  const walletRef = doc(db, 'harvestWallets', walletId);
  const usageRef = doc(db, 'collectionCashUsage', `${walletId}_${collectionId}`);

  // Track total amount deducted inside the transaction so we can mirror it
  // into the collection cash pool afterwards.
  let totalAmountForCashPool = 0;

  await runTransaction(db, async (tx) => {
    // 1) Read wallet, pickers, and usage before any writes
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists()) {
      throw new Error('No harvest wallet found for this project/crop. Add cash first.');
    }
    const wallet = walletSnap.data() as any;
    let currentBalance = wallet.currentBalance ?? 0;
    let cashPaidOutTotal = wallet.cashPaidOutTotal ?? 0;

    // Load pickers
    const pickerRefs = pickerIds.map((id) => doc(db, 'harvestPickers', id));
    const pickerSnaps = await Promise.all(pickerRefs.map((r) => tx.get(r)));
    const toPay: { ref: any; amount: number }[] = [];
    for (const snap of pickerSnaps) {
      if (!snap.exists()) continue;
      const p = snap.data() as any;
      if (p.isPaid) continue;
      const amount = p.totalPay ?? 0;
      if (amount > 0) {
        toPay.push({ ref: snap.ref, amount });
      }
    }
    if (!toPay.length) {
      throw new Error('All selected pickers are already paid or zero.');
    }

    const totalAmount = toPay.reduce((s, p) => s + p.amount, 0);
    if (currentBalance < totalAmount) {
      throw new Error('Not enough cash in Harvest Wallet.');
    }

    // Remember total amount so we can update the collection cash pool later
    totalAmountForCashPool = totalAmount;

    const usageSnap = await tx.get(usageRef);

    // 2) Writes
    // Update wallet
    currentBalance -= totalAmount;
    cashPaidOutTotal += totalAmount;
    tx.update(walletRef, {
      currentBalance,
      cashPaidOutTotal,
      lastUpdatedAt: new Date(),
    });

    // Update collection usage
    if (!usageSnap.exists()) {
      tx.set(usageRef, {
        companyId,
        projectId,
        cropType,
        walletId,
        collectionId,
        totalDeducted: totalAmount,
        lastUpdatedAt: new Date(),
      });
    } else {
      const usage = usageSnap.data() as any;
      const totalDeducted = (usage.totalDeducted ?? 0) + totalAmount;
      tx.update(usageRef, {
        totalDeducted,
        lastUpdatedAt: new Date(),
      });
    }

    // Mark pickers paid
    toPay.forEach(({ ref }) => {
      tx.update(ref, {
        isPaid: true,
        paidAt: new Date(),
      });
    });
  });

  // Also reflect this deduction in the collection's cash pool (if any)
  if (totalAmountForCashPool > 0) {
    await mirrorWalletDeductionToCashPool(collectionId, totalAmountForCashPool);
  }
}

/** Get the shared harvest wallet for a project/crop (used for balance display across all collections). */
export async function getHarvestWallet(params: {
  companyId: string;
  projectId: string;
  cropType: string;
}): Promise<{ id: string; currentBalance: number; cashPaidOutTotal: number; cashReceivedTotal: number } | null> {
  const walletId = `${params.companyId}_${params.projectId}_${params.cropType}`;
  const snap = await getDoc(doc(db, 'harvestWallets', walletId));
  if (!snap.exists()) return null;
  const d = snap.data() as any;
  return {
    id: snap.id,
    currentBalance: Number(d.currentBalance ?? 0),
    cashPaidOutTotal: Number(d.cashPaidOutTotal ?? 0),
    cashReceivedTotal: Number(d.cashReceivedTotal ?? 0),
  };
}

/** Top up (or create) the master harvest wallet for a project/crop. */
export async function topUpHarvestWallet(params: {
  companyId: string;
  projectId: string;
  cropType: string;
  amount: number;
}): Promise<void> {
  const { companyId, projectId, cropType, amount } = params;
  if (amount <= 0) {
    throw new Error('Top up amount must be greater than 0.');
  }

  const walletId = `${companyId}_${projectId}_${cropType}`;
  const walletRef = doc(db, 'harvestWallets', walletId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(walletRef);
    if (!snap.exists()) {
      tx.set(walletRef, {
        companyId,
        projectId,
        cropType,
        cashReceivedTotal: amount,
        cashPaidOutTotal: 0,
        currentBalance: amount,
        lastUpdatedAt: new Date(),
      });
    } else {
      const w = snap.data() as any;
      const cashReceivedTotal = (w.cashReceivedTotal ?? 0) + amount;
      const currentBalance = (w.currentBalance ?? 0) + amount;
      tx.update(walletRef, {
        cashReceivedTotal,
        currentBalance,
        lastUpdatedAt: new Date(),
      });
    }
  });
}
