import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

const CODE_RED_COLLECTION = 'codeRed';

export interface CodeRedRequestData {
  id: string;
  companyId: string;
  companyName: string;
  requestedBy: string;
  requestedByName: string;
  requestedByEmail: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface CodeRedMessageData {
  id: string;
  from: string;
  fromName: string;
  fromRole: string;
  body: string;
  createdAt: Timestamp | null;
}

/** Create a new Code Red request (company admin). */
export async function createCodeRed(
  companyId: string,
  companyName: string,
  userId: string,
  userName: string,
  userEmail: string,
  message: string
): Promise<string> {
  const ref = await addDoc(collection(db, CODE_RED_COLLECTION), {
    companyId,
    companyName,
    requestedBy: userId,
    requestedByName: userName,
    requestedByEmail: userEmail,
    message,
    status: 'open',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** List all Code Red requests (developer). */
export async function listAllCodeReds(): Promise<CodeRedRequestData[]> {
  const q = query(
    collection(db, CODE_RED_COLLECTION),
    orderBy('updatedAt', 'desc'),
    limit(100)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt ?? null,
    updatedAt: d.data().updatedAt ?? null,
  })) as CodeRedRequestData[];
}

/** List Code Red requests for one company (company admin). */
export async function listCodeRedsForCompany(companyId: string): Promise<CodeRedRequestData[]> {
  const q = query(
    collection(db, CODE_RED_COLLECTION),
    where('companyId', '==', companyId),
    orderBy('updatedAt', 'desc'),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt ?? null,
    updatedAt: d.data().updatedAt ?? null,
  })) as CodeRedRequestData[];
}

/** Get a single Code Red request. */
export async function getCodeRed(requestId: string): Promise<CodeRedRequestData | null> {
  const ref = doc(db, CODE_RED_COLLECTION, requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    ...data,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  } as CodeRedRequestData;
}

/** Add a message to a Code Red thread. */
export async function addCodeRedMessage(
  requestId: string,
  from: string,
  fromName: string,
  fromRole: string,
  body: string
): Promise<string> {
  const messagesRef = collection(db, CODE_RED_COLLECTION, requestId, 'messages');
  const ref = await addDoc(messagesRef, {
    from,
    fromName,
    fromRole,
    body,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, CODE_RED_COLLECTION, requestId), { updatedAt: serverTimestamp() }, { merge: true });
  return ref.id;
}

/** List messages in a Code Red thread. */
export async function listCodeRedMessages(requestId: string): Promise<CodeRedMessageData[]> {
  const q = query(
    collection(db, CODE_RED_COLLECTION, requestId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(200)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt ?? null,
  })) as CodeRedMessageData[];
}

/** Update Code Red status (e.g. mark resolved). */
export async function updateCodeRedStatus(
  requestId: string,
  status: 'open' | 'resolved'
): Promise<void> {
  await setDoc(
    doc(db, CODE_RED_COLLECTION, requestId),
    { status, updatedAt: serverTimestamp() },
    { merge: true }
  );
}
