import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface PlatformExpenseDoc {
  id: string;
  category: string;
  amount: number;
  date: string; // YYYY-MM-DD
  description?: string;
  createdAt?: unknown;
}

const COLLECTION = 'platformExpenses';

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const t = v as { toDate?: () => Date; seconds?: number };
  if (typeof t.toDate === 'function') return t.toDate();
  if (typeof t.seconds === 'number') return new Date(t.seconds * 1000);
  return null;
}

export async function getPlatformExpenses(): Promise<PlatformExpenseDoc[]> {
  const q = query(
    collection(db, COLLECTION),
    orderBy('date', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      category: data.category ?? '',
      amount: Number(data.amount) || 0,
      date: data.date ?? '',
      description: data.description ?? '',
      createdAt: data.createdAt,
    } as PlatformExpenseDoc;
  });
}

export async function addPlatformExpense(data: {
  category: string;
  amount: number;
  date: string;
  description?: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    category: data.category,
    amount: data.amount,
    date: data.date,
    description: data.description ?? '',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePlatformExpense(
  id: string,
  data: { category?: string; amount?: number; date?: string; description?: string }
): Promise<void> {
  const ref = doc(db, COLLECTION, id);
  const updates: Record<string, unknown> = {};
  if (data.category !== undefined) updates.category = data.category;
  if (data.amount !== undefined) updates.amount = data.amount;
  if (data.date !== undefined) updates.date = data.date;
  if (data.description !== undefined) updates.description = data.description;
  if (Object.keys(updates).length === 0) return;
  await updateDoc(ref, updates);
}

export async function deletePlatformExpense(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

/** Get expenses grouped by month (YYYY-MM) for the last 12 months. */
export function groupExpensesByMonth(expenses: PlatformExpenseDoc[]): Map<string, number> {
  const byMonth = new Map<string, number>();
  expenses.forEach((e) => {
    if (!e.date) return;
    const month = e.date.slice(0, 7); // YYYY-MM
    byMonth.set(month, (byMonth.get(month) ?? 0) + e.amount);
  });
  return byMonth;
}

/** Get expenses grouped by category. */
export function groupExpensesByCategory(expenses: PlatformExpenseDoc[]): { category: string; amount: number }[] {
  const byCat = new Map<string, number>();
  expenses.forEach((e) => {
    const cat = e.category || 'Other';
    byCat.set(cat, (byCat.get(cat) ?? 0) + e.amount);
  });
  return Array.from(byCat.entries()).map(([category, amount]) => ({ category, amount }));
}
