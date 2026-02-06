import React, { createContext, useContext, useState, useCallback } from 'react';
import { toast } from 'sonner';

export interface AppNotification {
  id: string;
  title: string;
  message?: string;
  read: boolean;
  createdAt: number;
  type?: 'info' | 'success' | 'warning' | 'error';
}

interface NotificationContextValue {
  notifications: AppNotification[];
  addNotification: (n: { title: string; message?: string; type?: AppNotification['type'] }) => void;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
  unreadCount: number;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const addNotification = useCallback(
    (n: { title: string; message?: string; type?: AppNotification['type'] }) => {
      const id = `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setNotifications((prev) => [
        { id, title: n.title, message: n.message, read: false, createdAt: Date.now(), type: n.type ?? 'info' },
        ...prev.slice(0, 99),
      ]);
      toast(n.title, { description: n.message, duration: 4000 });
    },
    []
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        markAsRead,
        markAllRead,
        unreadCount,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

const noop = () => {};
const emptyNotifications: AppNotification[] = [];
const defaultContext: NotificationContextValue = {
  notifications: emptyNotifications,
  addNotification: noop,
  markAsRead: noop,
  markAllRead: noop,
  unreadCount: 0,
};

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  return ctx ?? defaultContext;
}
