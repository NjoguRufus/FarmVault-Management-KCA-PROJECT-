import { addDoc, collection, doc, getDoc, getDocs, query, where, serverTimestamp, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface CompanyDoc {
  id: string;
  name?: string;
  email?: string;
  status?: string;
  plan?: string;
  userCount?: number;
  projectCount?: number;
  revenue?: number;
  createdAt?: unknown;
  nextPaymentAt?: Timestamp | null;
  paymentReminderActive?: boolean;
  paymentReminderSetAt?: Timestamp | null;
  paymentReminderDismissedAt?: Timestamp | null;
  paymentReminderDismissedBy?: string | null;
  subscriptionPlan?: string;
  [key: string]: unknown;
}

export async function getCompany(companyId: string): Promise<CompanyDoc | null> {
  const snap = await getDoc(doc(db, 'companies', companyId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CompanyDoc;
}

export async function setPaymentReminder(companyId: string, nextPaymentAt?: Date): Promise<void> {
  const ref = doc(db, 'companies', companyId);
  await updateDoc(ref, {
    paymentReminderActive: true,
    paymentReminderSetAt: serverTimestamp(),
    ...(nextPaymentAt && { nextPaymentAt: Timestamp.fromDate(nextPaymentAt) }),
  });
}

export async function clearPaymentReminder(companyId: string, dismissedByUserId?: string): Promise<void> {
  const updates: Record<string, unknown> = { paymentReminderActive: false };
  if (dismissedByUserId) {
    updates.paymentReminderDismissedAt = serverTimestamp();
    updates.paymentReminderDismissedBy = dismissedByUserId;
  }
  await updateDoc(doc(db, 'companies', companyId), updates);
}

export async function setCompanyNextPayment(companyId: string, nextPaymentAt: Date): Promise<void> {
  await updateDoc(doc(db, 'companies', companyId), {
    nextPaymentAt: Timestamp.fromDate(nextPaymentAt),
  });
}

export async function updateCompany(
  companyId: string,
  data: { name?: string; email?: string; plan?: string; status?: string }
): Promise<void> {
  const ref = doc(db, 'companies', companyId);
  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.email !== undefined) updates.email = data.email;
  if (data.plan !== undefined) updates.plan = data.plan;
  if (data.status !== undefined) updates.status = data.status;
  if (Object.keys(updates).length === 0) return;
  await updateDoc(ref, updates);
}

export async function createCompany(name: string, email: string) {
  const ref = await addDoc(collection(db, 'companies'), {
    name,
    email,
    createdAt: serverTimestamp(),
    status: 'active',
    subscriptionPlan: 'trial',
    plan: 'starter',
    userCount: 1,
    projectCount: 0,
    revenue: 0,
  });

  return ref.id;
}

export async function createCompanyUserProfile(params: {
  uid: string;
  companyId: string;
  name: string;
  email: string;
}) {
  const { uid, companyId, name, email } = params;

  await setDoc(doc(db, 'users', uid), {
    companyId,
    name,
    email,
    role: 'company_admin',
    createdAt: serverTimestamp(),
  });
}

