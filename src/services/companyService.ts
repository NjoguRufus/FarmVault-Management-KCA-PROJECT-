import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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

