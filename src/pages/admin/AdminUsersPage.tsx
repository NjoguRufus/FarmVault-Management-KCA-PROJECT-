import React from 'react';
import { Users } from 'lucide-react';
import { useCollection } from '@/hooks/useCollection';
import { User } from '@/types';

export default function AdminUsersPage() {
  const { data: users = [], isLoading } = useCollection<User>('admin-users-list', 'users');

  const nonDevelopers = users.filter(u => u.role !== 'developer');

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Users
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All non-developer users across all FarmVault tenants.
          </p>
        </div>
      </div>

      <div className="fv-card">
        {isLoading && (
          <p className="text-sm text-muted-foreground mb-4">Loading users…</p>
        )}
        <div className="hidden md:block overflow-x-auto">
          <table className="fv-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Company</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {nonDevelopers.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td className="capitalize">{u.role}</td>
                  <td>{u.companyId || 'Unassigned'}</td>
                  <td>{u.createdAt?.toLocaleDateString?.() || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

