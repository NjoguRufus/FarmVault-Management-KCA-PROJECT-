import { collection, addDoc, getDocs, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type InventoryAuditActionType = 'RESTOCK' | 'DEDUCT' | 'DELETE' | 'ADD_ITEM' | 'ADD_NEEDED';

export interface InventoryAuditLogDoc {
  id: string;
  companyId: string;
  actorUid: string;
  actorEmail: string;
  actorName?: string;
  actionType: InventoryAuditActionType;
  targetType: 'INVENTORY_ITEM' | 'NEEDED_ITEM';
  targetId: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (v && typeof (v as Timestamp).toDate === 'function') return (v as Timestamp).toDate();
  if (typeof v === 'string') return new Date(v);
  return new Date();
}

/** Create an inventory audit log entry (who did what, when). */
export async function createInventoryAuditLog(params: {
  companyId: string;
  actorUid: string;
  actorEmail: string;
  actorName?: string;
  actionType: InventoryAuditActionType;
  targetId: string;
  targetType?: 'INVENTORY_ITEM' | 'NEEDED_ITEM';
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'inventoryAuditLogs'), {
    companyId: params.companyId,
    actorUid: params.actorUid,
    actorEmail: params.actorEmail,
    actorName: params.actorName ?? null,
    actionType: params.actionType,
    targetType: params.targetType ?? 'INVENTORY_ITEM',
    targetId: params.targetId,
    metadata: params.metadata ?? null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Fetch inventory audit logs (for admin). Sorted by createdAt desc. */
export async function getInventoryAuditLogs(maxResults: number = 200): Promise<InventoryAuditLogDoc[]> {
  const ref = collection(db, 'inventoryAuditLogs');
  const snap = await getDocs(ref);
  const list = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      companyId: data.companyId ?? '',
      actorUid: data.actorUid ?? '',
      actorEmail: data.actorEmail ?? '',
      actorName: data.actorName,
      actionType: data.actionType ?? '',
      targetType: data.targetType ?? 'INVENTORY_ITEM',
      targetId: data.targetId ?? '',
      metadata: data.metadata,
      createdAt: toDate(data.createdAt),
    } as InventoryAuditLogDoc;
  });
  list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return list.slice(0, maxResults);
}
