import React from 'react';
import { Clock } from 'lucide-react';
import { useCollection } from '@/hooks/useCollection';
import { User } from '@/types';

export default function AdminPendingUsersPage() {
  const { data: users = [], isLoading } = useCollection<User>('admin-pending-users', 'users');

  const pendingUsers = users.filter(
    (u) => u.role !== 'developer' && !u.companyId
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Pending Users
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Users without an assigned company. Assign them to a tenant or disable access.
          </p>
        </div>
      </div>

      <div className="fv-card">
        {isLoading && (
          <p className="text-sm text-muted-foreground mb-4">Loading pending users…</p>
        )}
        <div className="hidden md:block overflow-x-auto">
          <table className="fv-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendingUsers.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td className="capitalize">{u.role}</td>
                  <td>{u.createdAt?.toLocaleDateString?.() || '-'}</td>
                  <td>
                    <button className="fv-btn fv-btn--secondary text-xs h-8 px-3">
                      Assign to company
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

