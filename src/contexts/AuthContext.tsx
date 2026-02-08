import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User, UserRole } from '@/types';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  switchRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        return;
      }
      const profileRef = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(profileRef);
      if (!snap.exists()) {
        // Try to load from employees (in case user doc wasn't created)
        const empQ = query(collection(db, 'employees'), where('authUserId', '==', firebaseUser.uid));
        const empSnap = await getDocs(empQ);
        const emp = empSnap.docs[0]?.data();
        if (emp) {
          const appRole = emp.role === 'operations-manager' ? 'manager' : emp.role === 'sales-broker' ? 'broker' : 'employee';
          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: emp.name || 'User',
            role: appRole,
            employeeRole: emp.role,
            companyId: emp.companyId ?? null,
            avatar: undefined,
            createdAt: new Date(),
          });
        } else {
          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || 'User',
            role: 'employee',
            employeeRole: undefined,
            companyId: null,
            avatar: undefined,
            createdAt: new Date(),
          });
        }
        return;
      }
      const data = snap.data() as any;
      const mapped: User = {
        id: firebaseUser.uid,
        email: data.email || firebaseUser.email || '',
        name: data.name || 'User',
        role: data.role || 'employee',
        employeeRole: data.employeeRole,
        companyId: data.companyId ?? null,
        avatar: data.avatar,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      };
      setUser(mapped);
    });

    return () => unsub();
  }, []);

  const login = async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    // Load user profile immediately so UI updates without waiting for onAuthStateChanged
    const profileRef = doc(db, 'users', credential.user.uid);
    const snap = await getDoc(profileRef);
    if (snap.exists()) {
      const data = snap.data() as any;
      const mapped: User = {
        id: credential.user.uid,
        email: data.email || credential.user.email || '',
        name: data.name || 'User',
        role: data.role || 'employee',
        employeeRole: data.employeeRole,
        companyId: data.companyId ?? null,
        avatar: data.avatar,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      };
      setUser(mapped);
    } else {
      // User doc missing — try employees collection (e.g. new broker/sales employee)
      const empQ = query(collection(db, 'employees'), where('authUserId', '==', credential.user.uid));
      const empSnap = await getDocs(empQ);
      const emp = empSnap.docs[0]?.data();
      if (emp) {
        const appRole = emp.role === 'operations-manager' ? 'manager' : emp.role === 'sales-broker' ? 'broker' : 'employee';
        setUser({
          id: credential.user.uid,
          email: credential.user.email || '',
          name: emp.name || 'User',
          role: appRole,
          employeeRole: emp.role,
          companyId: emp.companyId ?? null,
          avatar: undefined,
          createdAt: new Date(),
        });
      } else {
        setUser({
          id: credential.user.uid,
          email: credential.user.email || '',
          name: credential.user.displayName || 'User',
          role: 'employee',
          employeeRole: undefined,
          companyId: null,
          avatar: undefined,
          createdAt: new Date(),
        });
      }
    }
  };

  const logout = () => {
    // Sign out from Firebase and clear local user
    signOut(auth).finally(() => {
      setUser(null);
    });
  };

  const switchRole = (role: UserRole) => {
    if (user) {
      setUser({ ...user, role });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        logout,
        switchRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
