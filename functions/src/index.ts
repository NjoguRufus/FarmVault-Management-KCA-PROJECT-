import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

/**
 * Top up the master harvest wallet for a (company, project, crop).
 * currentBalance += amount
 * cashReceivedTotal += amount
 */
export const addHarvestWalletCash = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
    }

    const { companyId, projectId, cropType, amount } = data;

    if (!companyId || !projectId || !cropType) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "companyId, projectId and cropType are required.",
      );
    }
    if (typeof amount !== "number" || amount <= 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "amount must be a positive number (integer cents).",
      );
    }

    const walletId = `${companyId}_${projectId}_${cropType}`;
    const walletRef = db.collection("harvestWallets").doc(walletId);
    const now = admin.firestore.Timestamp.now();
    const uid = context.auth.uid!;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(walletRef);

      if (!snap.exists) {
        tx.set(walletRef, {
          companyId,
          projectId,
          cropType,
          cashReceivedTotal: amount,
          cashPaidOutTotal: 0,
          currentBalance: amount,
          lastUpdatedAt: now,
          createdAt: now,
          createdBy: uid,
          updatedBy: uid,
        });
      } else {
        const wallet = snap.data() || {};
        const cashReceivedTotal = (wallet.cashReceivedTotal || 0) + amount;
        const currentBalance = (wallet.currentBalance || 0) + amount;

        tx.update(walletRef, {
          cashReceivedTotal,
          currentBalance,
          lastUpdatedAt: now,
          updatedBy: uid,
        });
      }
    });

    return { success: true };
  },
);

/**
 * Deduct picker payments from the single master wallet,
 * and track per-collection deduction totals.
 */
export const payPickerFromWallet = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
    }

    const {
      companyId,
      projectId,
      cropType,
      collectionId,
      pickerId,
      payoutAmount,
      walletId: walletIdInput,
    } = data;

    if (!companyId || !projectId || !cropType || !collectionId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "companyId, projectId, cropType and collectionId are required.",
      );
    }
    if (typeof payoutAmount !== "number" || payoutAmount <= 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "payoutAmount must be a positive number (integer cents).",
      );
    }

    const uid = context.auth.uid!;
    const now = admin.firestore.Timestamp.now();

    const walletId = walletIdInput || `${companyId}_${projectId}_${cropType}`;
    const walletRef = db.collection("harvestWallets").doc(walletId);

    const usageId = `${walletId}_${collectionId}`;
    const usageRef = db.collection("collectionCashUsage").doc(usageId);

    const paymentLogRef = db.collection("harvestWalletPayments").doc();

    await db.runTransaction(async (tx) => {
      let walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) {
        // If no wallet exists yet, create an empty one so that
        // future top-ups and deductions all hit the same doc.
        tx.set(walletRef, {
          companyId,
          projectId,
          cropType,
          cashReceivedTotal: 0,
          cashPaidOutTotal: 0,
          currentBalance: 0,
          lastUpdatedAt: now,
          createdAt: now,
          createdBy: uid,
          updatedBy: uid,
        });
        // Re-read within this transaction to use consistent object shape.
        walletSnap = await tx.get(walletRef);
      }

      const wallet = walletSnap.data() || {};
      const currentBalance = wallet.currentBalance || 0;
      const cashPaidOutTotal = wallet.cashPaidOutTotal || 0;

      if (currentBalance < payoutAmount) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Not enough cash in Harvest Wallet. Please add cash.",
        );
      }

      // Update wallet
      tx.update(walletRef, {
        currentBalance: currentBalance - payoutAmount,
        cashPaidOutTotal: cashPaidOutTotal + payoutAmount,
        lastUpdatedAt: now,
        updatedBy: uid,
      });

      // Update per-collection usage
      const usageSnap = await tx.get(usageRef);
      if (!usageSnap.exists) {
        tx.set(usageRef, {
          companyId,
          projectId,
          cropType,
          walletId,
          collectionId,
          totalDeducted: payoutAmount,
          createdAt: now,
          lastUpdatedAt: now,
        });
      } else {
        const usage = usageSnap.data() || {};
        const totalDeducted = (usage.totalDeducted || 0) + payoutAmount;
        tx.update(usageRef, {
          totalDeducted,
          lastUpdatedAt: now,
        });
      }

      // Optional audit log
      tx.set(paymentLogRef, {
        companyId,
        projectId,
        cropType,
        walletId,
        collectionId,
        pickerId: pickerId ?? null,
        amount: payoutAmount,
        createdAt: now,
        createdBy: uid,
      });
    });

    return { success: true };
  },
);

/**
 * Bulk pay multiple pickers from the master wallet in a single transaction.
 * - Deducts total payout from wallet
 * - Increments collectionCashUsage.totalDeducted
 * - Marks pickers as paid and creates a payment batch
 */
export const payPickersFromWalletBatch = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
    }

    const {
      companyId,
      projectId,
      cropType,
      collectionId,
      pickerIds,
    } = data as {
      companyId: string;
      projectId: string;
      cropType: string;
      collectionId: string;
      pickerIds: string[];
    };

    if (!companyId || !projectId || !cropType || !collectionId || !Array.isArray(pickerIds)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "companyId, projectId, cropType, collectionId and pickerIds[] are required.",
      );
    }
    if (pickerIds.length === 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "pickerIds must contain at least one id.",
      );
    }

    const uid = context.auth.uid!;
    const now = admin.firestore.Timestamp.now();
    const walletId = `${companyId}_${projectId}_${cropType}`;
    const walletRef = db.collection("harvestWallets").doc(walletId);
    const usageId = `${walletId}_${collectionId}`;
    const usageRef = db.collection("collectionCashUsage").doc(usageId);
    const batchRef = db.collection("harvestPaymentBatches").doc();
    const pickersCol = db.collection("harvestPickers");

    await db.runTransaction(async (tx) => {
      // 1) Ensure wallet exists
      let walletSnap = await tx.get(walletRef);
      if (!walletSnap.exists) {
        tx.set(walletRef, {
          companyId,
          projectId,
          cropType,
          cashReceivedTotal: 0,
          cashPaidOutTotal: 0,
          currentBalance: 0,
          lastUpdatedAt: now,
          createdAt: now,
          createdBy: uid,
          updatedBy: uid,
        });
        walletSnap = await tx.get(walletRef);
      }
      const wallet = walletSnap.data() || {};
      let currentBalance = wallet.currentBalance || 0;
      let cashPaidOutTotal = wallet.cashPaidOutTotal || 0;

      // 2) Load pickers and compute total to pay for unpaid ones
      const pickerSnaps = await Promise.all(
        pickerIds.map((id: string) => tx.get(pickersCol.doc(id))),
      );

      const toPay: { id: string; amount: number }[] = [];
      for (const snap of pickerSnaps) {
        if (!snap.exists) continue;
        const p = snap.data() as any;
        if (p.isPaid) continue;
        const amount = p.totalPay || 0;
        if (amount > 0) {
          toPay.push({ id: snap.id, amount });
        }
      }

      if (toPay.length === 0) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "All selected pickers are already paid or have zero amount.",
        );
      }

      const totalAmount = toPay.reduce((sum, p) => sum + p.amount, 0);

      // 3) Check wallet balance
      if (currentBalance < totalAmount) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Not enough cash in Harvest Wallet.",
        );
      }

      // 4) Update wallet
      currentBalance -= totalAmount;
      cashPaidOutTotal += totalAmount;
      tx.update(walletRef, {
        currentBalance,
        cashPaidOutTotal,
        lastUpdatedAt: now,
        updatedBy: uid,
      });

      // 5) Update collection usage
      const usageSnap = await tx.get(usageRef);
      if (!usageSnap.exists) {
        tx.set(usageRef, {
          companyId,
          projectId,
          cropType,
          walletId,
          collectionId,
          totalDeducted: totalAmount,
          createdAt: now,
          lastUpdatedAt: now,
        });
      } else {
        const usage = usageSnap.data() || {};
        const totalDeducted = (usage.totalDeducted || 0) + totalAmount;
        tx.update(usageRef, {
          totalDeducted,
          lastUpdatedAt: now,
        });
      }

      // 6) Create payment batch and mark pickers paid
      tx.set(batchRef, {
        companyId,
        collectionId,
        pickerIds: toPay.map((p) => p.id),
        totalAmount,
        createdAt: now,
        createdBy: uid,
      });

      toPay.forEach(({ id }) => {
        tx.update(pickersCol.doc(id), {
          isPaid: true,
          paidAt: now,
          paymentBatchId: batchRef.id,
        });
      });
    });

    return { success: true };
  },
);

