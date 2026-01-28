import React, { useMemo, useState } from 'react';
import { Plus, Search, MoreHorizontal, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { useCollection } from '@/hooks/useCollection';
import { Employee } from '@/types';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/lib/dateUtils';

export default function EmployeesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'fv-badge--active',
      'on-leave': 'fv-badge--warning',
      inactive: 'bg-muted text-muted-foreground',
    };
    return styles[status] || 'bg-muted text-muted-foreground';
  };

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'operations-manager' | 'logistics-driver' | 'sales-broker'>(
    'operations-manager',
  );
  const [department, setDepartment] = useState('Operations');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const { data: employees = [], isLoading } = useCollection<Employee>('employees', 'employees');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const ROLE_OPTIONS = [
    { value: 'operations-manager', label: 'Operations (Manager)', department: 'Operations' },
    { value: 'logistics-driver', label: 'Logistics (Driver)', department: 'Logistics' },
    { value: 'sales-broker', label: 'Sales (Broker)', department: 'Sales' },
  ] as const;

  const getRoleLabel = (value: string) =>
    ROLE_OPTIONS.find(r => r.value === value)?.label || value;

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const roleConfig = ROLE_OPTIONS.find(r => r.value === role)!;
      const companyId = user?.companyId || 'company-1';
      // Create auth user for the employee
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = credential.user.uid;

      // Core employee record (for HR/operations views)
      await addDoc(collection(db, 'employees'), {
        name,
        role,
        department: roleConfig.department,
        contact,
        status: 'active',
        companyId,
        joinDate: serverTimestamp(),
        createdAt: serverTimestamp(),
        authUserId: uid,
      });

      // Map employee role to top-level app role for routing/guards
      // - operations-manager -> manager dashboard
      // - sales-broker      -> broker dashboard
      // - logistics-driver  -> employee (checked separately for driver dashboard)
      const appRole =
        role === 'operations-manager'
          ? 'manager'
          : role === 'sales-broker'
          ? 'broker'
          : 'employee';

      // User profile used for login + role-based dashboards
      await setDoc(doc(db, 'users', uid), {
        email,
        name,
        role: appRole,
        employeeRole: role,
        companyId,
        createdAt: serverTimestamp(),
      });
      
      // Invalidate queries to refresh data immediately
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      
      setAddOpen(false);
      setName('');
      setRole('operations-manager');
      setDepartment('Operations');
      setContact('');
      setEmail('');
      setPassword('');
    } finally {
      setSaving(false);
    }
  };

  const filteredEmployees = useMemo(
    () =>
      employees.filter((e) => {
        const matchesSearch =
          !search ||
          e.name.toLowerCase().includes(search.toLowerCase()) ||
          e.contact.toLowerCase().includes(search.toLowerCase());
        const matchesRole = roleFilter === 'all' || e.role === roleFilter;
        return matchesSearch && matchesRole;
      }),
    [employees, search, roleFilter],
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Employees</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your team members
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <button className="fv-btn fv-btn--primary">
              <Plus className="h-4 w-4" />
              Add Employee
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Employee</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddEmployee} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Full name</label>
                <input
                  className="fv-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Role</label>
              <Select
                value={role}
                onValueChange={(val) => {
                  const selected = ROLE_OPTIONS.find(r => r.value === val as typeof role);
                  setRole(val as typeof role);
                  if (selected) {
                    setDepartment(selected.department);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
                </div>
              {/* Department is derived from role; no manual input */}
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Email (for login)</label>
                <input
                  type="email"
                  className="fv-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="employee@farmvault.com"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  Initial password
                  <span className="block text-xs text-muted-foreground">
                    Set a password for this employee to use when logging in. It won&apos;t be visible after saving, so share it securely now.
                  </span>
                </label>
                <input
                  type="password"
                  className="fv-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Contact</label>
                <input
                  className="fv-input"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="+254 700 000 000"
                />
              </div>
              <DialogFooter>
                <button
                  type="button"
                  className="fv-btn fv-btn--secondary"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="fv-btn fv-btn--primary"
                >
                  {saving ? 'Saving…' : 'Save Employee'}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
        <SimpleStatCard
          title="Total Employees"
          value={employees.length}
          layout="vertical"
        />
        <SimpleStatCard
          title="Active"
          value={employees.filter(e => e.status === 'active').length}
          valueVariant="success"
          layout="vertical"
        />
        <SimpleStatCard
          title="On Leave"
          value={employees.filter(e => e.status === 'on-leave').length}
          valueVariant="warning"
          layout="vertical"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search employees..."
            className="fv-input pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ROLE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Employees Table */}
      <div className="fv-card">
        <div className="hidden md:block overflow-x-auto">
          <table className="fv-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th>Department</th>
                <th>Contact</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="text-sm text-muted-foreground">
                    Loading employees…
                  </td>
                </tr>
              )}
              {filteredEmployees.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                        {employee.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">{employee.name}</span>
                        <p className="text-xs text-muted-foreground">
                          Joined {formatDate(employee.joinDate, { month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>{getRoleLabel(employee.role)}</td>
                  <td>{employee.department}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{employee.contact}</span>
                    </div>
                  </td>
                  <td>
                    <span className={cn('fv-badge capitalize', getStatusBadge(employee.status))}>
                      {employee.status.replace('-', ' ')}
                    </span>
                  </td>
                  <td>
                    <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-3">
          {filteredEmployees.map((employee) => (
            <div key={employee.id} className="p-4 bg-muted/30 rounded-lg">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                    {employee.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{employee.name}</p>
                    <p className="text-xs text-muted-foreground">{getRoleLabel(employee.role)}</p>
                  </div>
                </div>
                <span className={cn('fv-badge capitalize', getStatusBadge(employee.status))}>
                  {employee.status.replace('-', ' ')}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                {employee.department} • {employee.contact}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
