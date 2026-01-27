import {
  collection,
  addDoc,
  serverTimestamp,
  writeBatch,
  doc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { WorkLog, Expense, ExpenseCategory } from '@/types';

type CreateWorkLogInput = Omit<WorkLog, 'id' | 'createdAt'>;

export async function createWorkLog(input: CreateWorkLogInput) {
  const payload = {
    ...input,
    createdAt: serverTimestamp(),
    date: input.date instanceof Date ? input.date : new Date(input.date),
  };
  await addDoc(collection(db, 'workLogs'), payload);
}

interface SyncLabourExpensesOptions {
  companyId: string;
  projectId: string;
  date: Date;
  paidByUserId: string;
  paidByName?: string;
}

export async function syncTodaysLabourExpenses({
  companyId,
  projectId,
  date,
  paidByUserId,
  paidByName,
}: SyncLabourExpensesOptions) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const q = query(
    collection(db, 'workLogs'),
    where('companyId', '==', companyId),
    where('projectId', '==', projectId),
    where('date', '>=', startOfDay),
    where('date', '<=', endOfDay),
    where('ratePerPerson', '>', 0),
    where('paid', '!=', true),
  );

  const snap = await getDocs(q);
  if (snap.empty) return { createdCount: 0 };

  const batch = writeBatch(db);
  let createdCount = 0;

  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as any as WorkLog;
    const amount = (data.numberOfPeople || 0) * (data.ratePerPerson || 0);
    if (!amount) return;

    const expenseRef = doc(collection(db, 'expenses'));
    const expense: Omit<Expense, 'id'> = {
      companyId: data.companyId,
      projectId: data.projectId,
      cropType: data.cropType,
      category: 'labour' as ExpenseCategory,
      description: `Labour - ${data.workCategory} on ${new Date(data.date).toLocaleDateString()}`,
      amount,
      date: data.date,
      stageIndex: data.stageIndex,
      stageName: data.stageName,
      syncedFromWorkLogId: data.id,
      synced: true,
      paid: true,
      paidAt: new Date(),
      paidBy: paidByUserId,
      paidByName,
      createdAt: new Date(),
    };

    batch.set(expenseRef, {
      ...expense,
      date: expense.date,
      createdAt: serverTimestamp(),
      paidAt: serverTimestamp(),
    });

    batch.update(doc(db, 'workLogs', docSnap.id), {
      paid: true,
      paidAt: serverTimestamp(),
      paidBy: paidByUserId,
    });

    createdCount += 1;
  });

  await batch.commit();
  return { createdCount };
}

