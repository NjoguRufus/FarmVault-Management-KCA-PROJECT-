import { collection, getDocs, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface AuditLogDoc {
  id: string;
  createdAt: Date;
  actorEmail: string;
  actorUid: string;
  actionType: string;
  targetType: 'COMPANY' | 'USER' | 'EMPLOYEE' | string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (v && typeof (v as Timestamp).toDate === 'function') return (v as Timestamp).toDate();
  if (typeof v === 'string') return new Date(v);
  return new Date();
}

/** Fetch audit logs (sorted by createdAt desc in memory to avoid requiring a Firestore index). */
export async function getAuditLogs(maxResults: number = 200): Promise<AuditLogDoc[]> {
  const ref = collection(db, 'auditLogs');
  const snap = await getDocs(ref);
  const list = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      createdAt: toDate(data.createdAt),
      actorEmail: data.actorEmail ?? '',
      actorUid: data.actorUid ?? '',
      actionType: data.actionType ?? '',
      targetType: data.targetType ?? '',
      targetId: data.targetId ?? '',
      metadata: data.metadata,
    } as AuditLogDoc;
  });
  list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return list.slice(0, maxResults);
}

/** Record an audit log entry (developer only). Use for testing or from developer actions. */
export async function createAuditLog(params: {
  actorEmail: string;
  actorUid: string;
  actionType: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const ref = await addDoc(collection(db, 'auditLogs'), {
    actorEmail: params.actorEmail,
    actorUid: params.actorUid,
    actionType: params.actionType,
    targetType: params.targetType,
    targetId: params.targetId,
    metadata: params.metadata ?? null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
