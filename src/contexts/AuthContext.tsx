import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User, UserRole } from '@/types';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
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
        setUser(null);
        return;
      }
      const data = snap.data() as any;
      const mapped: User = {
        id: firebaseUser.uid,
        email: data.email || firebaseUser.email || '',
        name: data.name || 'User',
        role: data.role || 'employee',
        companyId: data.companyId ?? null,
        avatar: data.avatar,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      };
      setUser(mapped);
    });

    return () => unsub();
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will populate user + profile
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
