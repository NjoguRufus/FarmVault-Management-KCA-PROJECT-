import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  OperationsWorkCard,
  WorkCardPlanned,
  WorkCardActual,
  WorkCardPayment,
  WorkCardStatus,
} from '@/types';
import { createAuditLog } from '@/services/auditLogService';
import { deductInventoryForWorkCard } from '@/services/inventoryService';

const COLLECTION = 'operationsWorkCards';

export const AUDIT_EVENTS = {
  WORK_CREATED: 'WORK_CREATED',
  WORK_SUBMITTED: 'WORK_SUBMITTED',
  WORK_APPROVED: 'WORK_APPROVED',
  WORK_REJECTED: 'WORK_REJECTED',
  WORK_PAID: 'WORK_PAID',
} as const;

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (v && typeof (v as Timestamp).toDate === 'function') {
    const d = (v as Timestamp).toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function mapDoc(id: string, data: Record<string, unknown>): OperationsWorkCard {
  const planned = (data.planned || {}) as Record<string, unknown>;
  const actual = (data.actual || { submitted: false }) as Record<string, unknown>;
  const payment = (data.payment || { isPaid: false }) as Record<string, unknown>;
  return {
    id,
    companyId: String(data.companyId ?? ''),
    projectId: String(data.projectId ?? ''),
    stageId: String(data.stageId ?? ''),
    stageName: data.stageName != null ? String(data.stageName) : undefined,
    workTitle: String(data.workTitle ?? ''),
    workCategory: String(data.workCategory ?? ''),
    planned: {
      date: planned.date,
      workers: Number(planned.workers ?? 0),
      inputs: planned.inputs != null ? String(planned.inputs) : undefined,
      fuel: planned.fuel != null ? String(planned.fuel) : undefined,
      chemicals: planned.chemicals != null ? String(planned.chemicals) : undefined,
      fertilizer: planned.fertilizer != null ? String(planned.fertilizer) : undefined,
      estimatedCost:
        planned.estimatedCost != null ? Number(planned.estimatedCost) : undefined,
    },
    actual: {
      submitted: Boolean(actual.submitted),
      managerId: actual.managerId != null ? String(actual.managerId) : undefined,
      managerName: actual.managerName != null ? String(actual.managerName) : undefined,
      actualDate: actual.actualDate,
      actualWorkers:
        actual.actualWorkers != null ? Number(actual.actualWorkers) : undefined,
      ratePerPerson: actual.ratePerPerson != null ? Number(actual.ratePerPerson) : undefined,
      actualInputsUsed:
        actual.actualInputsUsed != null ? String(actual.actualInputsUsed) : undefined,
      actualFuelUsed:
        actual.actualFuelUsed != null ? String(actual.actualFuelUsed) : undefined,
      actualChemicalsUsed:
        actual.actualChemicalsUsed != null
          ? String(actual.actualChemicalsUsed)
          : undefined,
      actualFertilizerUsed:
        actual.actualFertilizerUsed != null
          ? String(actual.actualFertilizerUsed)
          : undefined,
      notes: actual.notes != null ? String(actual.notes) : undefined,
      actualResourceItemId: actual.actualResourceItemId != null ? String(actual.actualResourceItemId) : undefined,
      actualResourceQuantity: actual.actualResourceQuantity != null ? Number(actual.actualResourceQuantity) : undefined,
      actualResourceQuantitySecondary: actual.actualResourceQuantitySecondary != null ? Number(actual.actualResourceQuantitySecondary) : undefined,
      submittedAt: actual.submittedAt,
      actualHistory: Array.isArray(actual.actualHistory) ? actual.actualHistory as WorkCardActual['actualHistory'] : undefined,
    },
    payment: {
      isPaid: Boolean(payment.isPaid),
      paidAt: payment.paidAt,
      paidBy: payment.paidBy != null ? String(payment.paidBy) : undefined,
    },
    status: (data.status as WorkCardStatus) || 'planned',
    allocatedManagerId:
      data.allocatedManagerId != null ? String(data.allocatedManagerId) : null,
    createdByAdminId: String(data.createdByAdminId ?? ''),
    createdAt: data.createdAt,
    approvedBy: data.approvedBy != null ? String(data.approvedBy) : undefined,
    approvedAt: data.approvedAt,
    rejectionReason:
      data.rejectionReason != null ? String(data.rejectionReason) : undefined,
  };
}

/** Admin only: create a new work card. */
export async function createWorkCard(params: {
  companyId: string;
  projectId: string;
  stageId: string;
  stageName?: string;
  workTitle: string;
  workCategory: string;
  planned: WorkCardPlanned;
  allocatedManagerId: string | null;
  createdByAdminId: string;
  actorEmail: string;
  actorUid: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    companyId: params.companyId,
    projectId: params.projectId,
    stageId: params.stageId,
    stageName: params.stageName ?? null,
    workTitle: params.workTitle,
    workCategory: params.workCategory,
    planned: {
      date: params.planned.date,
      workers: params.planned.workers,
      inputs: params.planned.inputs ?? null,
      fuel: params.planned.fuel ?? null,
      chemicals: params.planned.chemicals ?? null,
      fertilizer: params.planned.fertilizer ?? null,
      estimatedCost: params.planned.estimatedCost ?? null,
    },
    actual: {
      submitted: false,
    },
    payment: { isPaid: false },
    status: 'planned',
    allocatedManagerId: params.allocatedManagerId,
    createdByAdminId: params.createdByAdminId,
    createdAt: serverTimestamp(),
  });
  await createAuditLog({
    actorEmail: params.actorEmail,
    actorUid: params.actorUid,
    actionType: AUDIT_EVENTS.WORK_CREATED,
    targetType: 'WORK_CARD',
    targetId: ref.id,
    metadata: { workTitle: params.workTitle, projectId: params.projectId },
  });
  return ref.id;
}

/** Admin only: update work card planned section (and title, category, stage, allocated manager). */
export async function updateWorkCard(params: {
  cardId: string;
  workTitle?: string;
  workCategory?: string;
  stageId?: string;
  stageName?: string;
  planned?: Partial<WorkCardPlanned>;
  allocatedManagerId?: string | null;
  actorEmail: string;
  actorUid: string;
}): Promise<void> {
  const card = await getWorkCard(params.cardId);
  if (!card) throw new Error('Work card not found');

  const updates: Record<string, unknown> = {};
  if (params.workTitle !== undefined) updates.workTitle = params.workTitle;
  if (params.workCategory !== undefined) updates.workCategory = params.workCategory;
  if (params.stageId !== undefined) updates.stageId = params.stageId;
  if (params.stageName !== undefined) updates.stageName = params.stageName;
  if (params.allocatedManagerId !== undefined) updates.allocatedManagerId = params.allocatedManagerId;
  if (params.planned) {
    const inputs = params.planned.inputs !== undefined ? params.planned.inputs : card.planned?.inputs;
    const fuel = params.planned.fuel !== undefined ? params.planned.fuel : card.planned?.fuel;
    const chemicals = params.planned.chemicals !== undefined ? params.planned.chemicals : card.planned?.chemicals;
    const fertilizer = params.planned.fertilizer !== undefined ? params.planned.fertilizer : card.planned?.fertilizer;
    const estimatedCost = params.planned.estimatedCost !== undefined ? params.planned.estimatedCost : card.planned?.estimatedCost;
    updates.planned = {
      date: params.planned.date ?? card.planned?.date ?? null,
      workers: params.planned.workers ?? card.planned?.workers ?? 0,
      inputs: inputs ?? null,
      fuel: fuel ?? null,
      chemicals: chemicals ?? null,
      fertilizer: fertilizer ?? null,
      estimatedCost: estimatedCost != null ? estimatedCost : null,
    };
  }

  if (Object.keys(updates).length === 0) return;

  const cardRef = doc(db, COLLECTION, params.cardId);
  await updateDoc(cardRef, updates);

  await createAuditLog({
    actorEmail: params.actorEmail,
    actorUid: params.actorUid,
    actionType: 'WORK_UPDATED',
    targetType: 'WORK_CARD',
    targetId: params.cardId,
  });
}

/** Manager only: submit execution data to an existing card. NEVER creates. */
export async function submitExecution(params: {
  cardId: string;
  managerId: string;
  managerName: string;
  /** All ids that represent this manager (user.id + employee.id) for allocation check */
  managerIds?: string[];
  actualWorkers?: number;
  /** Price per person (KES). Total labour = actualWorkers * ratePerPerson; expense created when marked as paid. */
  ratePerPerson?: number;
  actualInputsUsed?: string;
  actualFuelUsed?: string;
  actualChemicalsUsed?: string;
  actualFertilizerUsed?: string;
  notes?: string;
  /** For inventory deduction on approve (one resource per card) */
  actualResourceItemId?: string;
  actualResourceQuantity?: number;
  actualResourceQuantitySecondary?: number;
  actorEmail: string;
  actorUid: string;
}): Promise<void> {
  const card = await getWorkCard(params.cardId);
  if (!card) throw new Error('Work card not found');
  const managerIds = new Set(params.managerIds && params.managerIds.length > 0 ? params.managerIds : [params.managerId]);
  if (!canManagerSubmit(card, managerIds)) {
    throw new Error('You cannot submit this card: not allocated to you, or already submitted/approved/paid.');
  }
  const cardRef = doc(db, COLLECTION, params.cardId);
  const submittedAt = serverTimestamp();
  const actualPayload: Record<string, unknown> = {
    submitted: true,
    managerId: params.managerId,
    managerName: params.managerName,
    actualWorkers: params.actualWorkers ?? null,
    ratePerPerson: params.ratePerPerson != null ? params.ratePerPerson : null,
    actualInputsUsed: params.actualInputsUsed ?? null,
    actualFuelUsed: params.actualFuelUsed ?? null,
    actualChemicalsUsed: params.actualChemicalsUsed ?? null,
    actualFertilizerUsed: params.actualFertilizerUsed ?? null,
    notes: params.notes ?? null,
    actualResourceItemId: params.actualResourceItemId ?? null,
    actualResourceQuantity: params.actualResourceQuantity != null ? params.actualResourceQuantity : null,
    actualResourceQuantitySecondary: params.actualResourceQuantitySecondary != null ? params.actualResourceQuantitySecondary : null,
    submittedAt,
    actualDate: submittedAt,
  };
  await updateDoc(cardRef, {
    actual: actualPayload,
    status: 'submitted',
  });
  await createAuditLog({
    actorEmail: params.actorEmail,
    actorUid: params.actorUid,
    actionType: AUDIT_EVENTS.WORK_SUBMITTED,
    targetType: 'WORK_CARD',
    targetId: params.cardId,
    metadata: { managerId: params.managerId },
  });
}

/** Admin: approve a submitted card. Deducts inventory if manager recorded resource usage. */
export async function approveWorkCard(params: {
  cardId: string;
  approvedBy: string;
  actorEmail: string;
  actorUid: string;
}): Promise<void> {
  const card = await getWorkCard(params.cardId);
  if (!card) throw new Error('Work card not found');

  const cardRef = doc(db, COLLECTION, params.cardId);
  await updateDoc(cardRef, {
    status: 'approved',
    approvedBy: params.approvedBy,
    approvedAt: serverTimestamp(),
    rejectionReason: null,
  });

  const itemId = card.actual?.actualResourceItemId;
  const qty = card.actual?.actualResourceQuantity ?? 0;
  if (itemId && qty > 0 && card.companyId && card.projectId) {
    try {
      await deductInventoryForWorkCard({
        companyId: card.companyId,
        projectId: card.projectId,
        inventoryItemId: itemId,
        quantity: qty,
        stageName: card.stageName,
        workCardId: params.cardId,
        date: new Date(),
        managerName: card.actual?.managerName,
      });
    } catch (err) {
      console.error('Work card approve: inventory deduction failed', err);
      throw err;
    }
  }

  await createAuditLog({
    actorEmail: params.actorEmail,
    actorUid: params.actorUid,
    actionType: AUDIT_EVENTS.WORK_APPROVED,
    targetType: 'WORK_CARD',
    targetId: params.cardId,
  });
}

/** Admin: reject a submitted card. */
export async function rejectWorkCard(params: {
  cardId: string;
  rejectionReason: string;
  actorEmail: string;
  actorUid: string;
}): Promise<void> {
  const cardRef = doc(db, COLLECTION, params.cardId);
  await updateDoc(cardRef, {
    status: 'rejected',
    rejectionReason: params.rejectionReason,
  });
  await createAuditLog({
    actorEmail: params.actorEmail,
    actorUid: params.actorUid,
    actionType: AUDIT_EVENTS.WORK_REJECTED,
    targetType: 'WORK_CARD',
    targetId: params.cardId,
    metadata: { reason: params.rejectionReason },
  });
}

/** Manager or Admin: mark card as paid (only when status === 'approved' && !payment.isPaid). Creates a labour expense when amount > 0. */
export async function markWorkCardPaid(params: {
  cardId: string;
  paidBy: string;
  paidByName?: string;
  actorEmail: string;
  actorUid: string;
}): Promise<void> {
  const card = await getWorkCard(params.cardId);
  if (!card) throw new Error('Work card not found');
  if (!canMarkAsPaid(card)) throw new Error('Card must be approved and not already paid.');
  const cardRef = doc(db, COLLECTION, params.cardId);
  await updateDoc(cardRef, {
    status: 'paid',
    payment: {
      isPaid: true,
      paidAt: serverTimestamp(),
      paidBy: params.paidBy,
    },
  });

  const workers = card.actual?.actualWorkers ?? 0;
  const rate = card.actual?.ratePerPerson ?? 0;
  const amount = workers * rate;
  if (amount > 0) {
    const paidAt = new Date();
    await addDoc(collection(db, 'expenses'), {
      companyId: card.companyId,
      projectId: card.projectId ?? undefined,
      category: 'labour',
      description: `Labour - ${card.workTitle || card.workCategory} (${workers} × KES ${rate.toLocaleString()})`,
      amount,
      date: Timestamp.fromDate(paidAt),
      stageName: card.stageName ?? undefined,
      workCardId: params.cardId,
      paid: true,
      paidAt: serverTimestamp(),
      paidBy: params.paidBy,
      paidByName: params.paidByName ?? undefined,
      createdAt: serverTimestamp(),
    });
  }

  await createAuditLog({
    actorEmail: params.actorEmail,
    actorUid: params.actorUid,
    actionType: AUDIT_EVENTS.WORK_PAID,
    targetType: 'WORK_CARD',
    targetId: params.cardId,
  });
}

/** Fetch work cards allocated to a manager (single id). */
export async function getWorkCardsForManager(
  managerId: string
): Promise<OperationsWorkCard[]> {
  const q = query(
    collection(db, COLLECTION),
    where('allocatedManagerId', '==', managerId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>));
}

/** Fetch work cards allocated to any of the given manager ids (e.g. user.id + employee.id). */
export async function getWorkCardsForManagers(
  managerIds: string[]
): Promise<OperationsWorkCard[]> {
  if (managerIds.length === 0) return [];
  const deduped = [...new Set(managerIds)].filter(Boolean);
  if (deduped.length === 0) return [];
  if (deduped.length === 1) return getWorkCardsForManager(deduped[0]);
  const q = query(
    collection(db, COLLECTION),
    where('allocatedManagerId', 'in', deduped.slice(0, 30))
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>));
}

/** Fetch all work cards for a company (admin). */
export async function getWorkCardsForCompany(
  companyId: string
): Promise<OperationsWorkCard[]> {
  const q = query(
    collection(db, COLLECTION),
    where('companyId', '==', companyId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>));
}

/** Fetch work cards for a project (admin). */
export async function getWorkCardsForProject(
  projectId: string
): Promise<OperationsWorkCard[]> {
  const q = query(
    collection(db, COLLECTION),
    where('projectId', '==', projectId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>));
}

/** Get a single work card by id. */
export async function getWorkCard(
  cardId: string
): Promise<OperationsWorkCard | null> {
  const { getDoc } = await import('firebase/firestore');
  const d = await getDoc(doc(db, COLLECTION, cardId));
  if (!d.exists()) return null;
  return mapDoc(d.id, d.data() as Record<string, unknown>);
}

// --- Status guards (for UI and validation) ---

/** Manager can submit only when: allocated to them, status is planned or rejected (resubmit). */
export function canManagerSubmit(
  card: OperationsWorkCard,
  currentManagerIds: string | Set<string> | string[]
): boolean {
  const ids = typeof currentManagerIds === 'string'
    ? new Set([currentManagerIds])
    : Array.isArray(currentManagerIds)
      ? new Set(currentManagerIds)
      : currentManagerIds;
  if (!card.allocatedManagerId || !ids.has(card.allocatedManagerId))
    return false;
  if (card.status === 'approved' || card.status === 'paid') return false;
  if (card.status === 'submitted') return false; // wait for admin to approve/reject
  return true; // planned or rejected => can submit / resubmit
}

/** Manager or Admin can mark as paid only when status === approved && !payment.isPaid. */
export function canMarkAsPaid(card: OperationsWorkCard): boolean {
  return card.status === 'approved' && !card.payment.isPaid;
}

/** Admin can approve/reject only when status === submitted. */
export function canAdminApproveOrReject(card: OperationsWorkCard): boolean {
  return card.status === 'submitted';
}
