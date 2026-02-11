"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.payPickerFromWallet = exports.addHarvestWalletCash = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.firestore();
/**
 * Top up the master harvest wallet for a (company, project, crop).
 * currentBalance += amount
 * cashReceivedTotal += amount
 */
exports.addHarvestWalletCash = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
    }
    const { companyId, projectId, cropType, amount } = data;
    if (!companyId || !projectId || !cropType) {
        throw new functions.https.HttpsError("invalid-argument", "companyId, projectId and cropType are required.");
    }
    if (typeof amount !== "number" || amount <= 0) {
        throw new functions.https.HttpsError("invalid-argument", "amount must be a positive number (integer cents).");
    }
    const walletId = `${companyId}_${projectId}_${cropType}`;
    const walletRef = db.collection("harvestWallets").doc(walletId);
    const now = admin.firestore.Timestamp.now();
    const uid = context.auth.uid;
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
        }
        else {
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
});
/**
 * Deduct picker payments from the single master wallet,
 * and track per-collection deduction totals.
 */
exports.payPickerFromWallet = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
    }
    const { companyId, projectId, cropType, collectionId, pickerId, payoutAmount, walletId: walletIdInput, } = data;
    if (!companyId || !projectId || !cropType || !collectionId) {
        throw new functions.https.HttpsError("invalid-argument", "companyId, projectId, cropType and collectionId are required.");
    }
    if (typeof payoutAmount !== "number" || payoutAmount <= 0) {
        throw new functions.https.HttpsError("invalid-argument", "payoutAmount must be a positive number (integer cents).");
    }
    const uid = context.auth.uid;
    const now = admin.firestore.Timestamp.now();
    const walletId = walletIdInput || `${companyId}_${projectId}_${cropType}`;
    const walletRef = db.collection("harvestWallets").doc(walletId);
    const usageId = `${walletId}_${collectionId}`;
    const usageRef = db.collection("collectionCashUsage").doc(usageId);
    const paymentLogRef = db.collection("harvestWalletPayments").doc();
    await db.runTransaction(async (tx) => {
        const walletSnap = await tx.get(walletRef);
        if (!walletSnap.exists) {
            throw new functions.https.HttpsError("failed-precondition", "No harvest wallet found for this project/crop. Add cash first.");
        }
        const wallet = walletSnap.data() || {};
        const currentBalance = wallet.currentBalance || 0;
        const cashPaidOutTotal = wallet.cashPaidOutTotal || 0;
        if (currentBalance < payoutAmount) {
            throw new functions.https.HttpsError("failed-precondition", "Not enough cash in Harvest Wallet.");
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
        }
        else {
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
});
//# sourceMappingURL=index.js.map