import React, { useMemo, useState } from 'react';
import { Plus, Search, MoreHorizontal, Phone, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db, authEmployeeCreate } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, setDoc, updateDoc } from 'firebase/firestore';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/lib/dateUtils';
import { toast } from 'sonner';

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
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: employees = [], isLoading } = useCollection<Employee>('employees', 'employees');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<'operations-manager' | 'logistics-driver' | 'sales-broker'>('operations-manager');
  const [editDepartment, setEditDepartment] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'on-leave' | 'inactive'>('active');
  const [editSaving, setEditSaving] = useState(false);

  const ROLE_OPTIONS = [
    { value: 'operations-manager', label: 'Operations (Manager)', department: 'Operations' },
    { value: 'logistics-driver', label: 'Logistics (Driver)', department: 'Logistics' },
    { value: 'sales-broker', label: 'Sales (Broker)', department: 'Sales' },
  ] as const;

  const getRoleLabel = (value: string) =>
    ROLE_OPTIONS.find(r => r.value === value)?.label || value;

  const openEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setEditName(employee.name);
    setEditRole((employee.role as typeof editRole) || 'operations-manager');
    setEditDepartment(employee.department || '');
    setEditContact(employee.contact || '');
    setEditStatus((employee.status as typeof editStatus) || 'active');
    setEditOpen(true);
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setEditSaving(true);
    try {
      const roleConfig = ROLE_OPTIONS.find(r => r.value === editRole);
      const department = roleConfig?.department ?? editDepartment;
      const empRef = doc(db, 'employees', editingEmployee.id);
      await updateDoc(empRef, {
        name: editName,
        role: editRole,
        department,
        contact: editContact,
        status: editStatus,
      });
      const authUserId = (editingEmployee as Employee & { authUserId?: string }).authUserId;
      if (authUserId) {
        const appRole =
          editRole === 'operations-manager'
            ? 'manager'
            : editRole === 'sales-broker'
            ? 'broker'
            : 'employee';
        await updateDoc(doc(db, 'users', authUserId), {
          name: editName,
          role: appRole,
          employeeRole: editRole,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employee updated');
      setEditOpen(false);
      setEditingEmployee(null);
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? 'Failed to update employee';
      toast.error('Update failed', { description: message });
    } finally {
      setEditSaving(false);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Company admin must have companyId set (Firestore rules require it to match)
      const companyId = user?.companyId ?? null;
      if (!companyId && user?.role !== 'developer') {
        toast.error('Cannot add employee', {
          description: 'Your account is not linked to a company. Please contact support or sign in with a company admin account.',
        });
        setSaving(false);
        return;
      }

      const roleConfig = ROLE_OPTIONS.find(r => r.value === role)!;
      // Use secondary auth so the company admin stays signed in (createUserWithEmailAndPassword signs in the new user on that instance)
      const credential = await createUserWithEmailAndPassword(authEmployeeCreate, email, password);
      const uid = credential.user.uid;

      // Core employee record (for HR/operations views) — companyId must match current user's for rules
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

      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employee added successfully');
      setAddOpen(false);
      setName('');
      setRole('operations-manager');
      setDepartment('Operations');
      setContact('');
      setEmail('');
      setPassword('');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      const message = (err as { message?: string })?.message ?? '';
      if (code === 'auth/email-already-in-use') {
        toast.error('Email already in use', {
          description: 'This email is already registered. Use a different email or invite the existing user.',
        });
        return;
      }
      if (code?.startsWith('auth/')) {
        toast.error('Authentication error', {
          description: message || 'Could not create account. Please try again.',
        });
        return;
      }
      const isPermissionDenied =
        message?.includes('permission') || message?.includes('Permission') || code === 'permission-denied';
      toast.error(isPermissionDenied ? 'Permission denied' : 'Failed to add employee', {
        description: isPermissionDenied
          ? 'Your account cannot add employees for this company. Ensure you are signed in as a company admin with a linked company.'
          : message || 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  // Show only this company's employees (developers see all)
  const companyEmployees = useMemo(() => {
    if (!user?.companyId && user?.role !== 'developer') return [];
    if (user?.role === 'developer') return employees;
    return employees.filter((e) => e.companyId === user?.companyId);
  }, [employees, user?.companyId, user?.role]);

  const filteredEmployees = useMemo(
    () =>
      companyEmployees.filter((e) => {
        const matchesSearch =
          !search ||
          e.name.toLowerCase().includes(search.toLowerCase()) ||
          (e.contact && e.contact.toLowerCase().includes(search.toLowerCase()));
        const matchesRole = roleFilter === 'all' || e.role === roleFilter;
        return matchesSearch && matchesRole;
      }),
    [companyEmployees, search, roleFilter],
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
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="fv-input pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
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

        {/* View details modal */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Employee details</DialogTitle>
            </DialogHeader>
            {selectedEmployee && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-lg">
                    {selectedEmployee.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{selectedEmployee.name}</p>
                    <p className="text-sm text-muted-foreground">{getRoleLabel(selectedEmployee.role)}</p>
                  </div>
                </div>
                <dl className="grid gap-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Department</dt>
                    <dd className="font-medium">{selectedEmployee.department}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Contact</dt>
                    <dd className="font-medium">{selectedEmployee.contact || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>
                      <span className={cn('fv-badge capitalize', getStatusBadge(selectedEmployee.status))}>
                        {selectedEmployee.status.replace('-', ' ')}
                      </span>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Joined</dt>
                    <dd className="font-medium">{formatDate(selectedEmployee.joinDate, { month: 'short', day: 'numeric', year: 'numeric' })}</dd>
                  </div>
                </dl>
                <DialogFooter>
                  <button
                    type="button"
                    className="fv-btn fv-btn--secondary"
                    onClick={() => setDetailsOpen(false)}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="fv-btn fv-btn--primary"
                    onClick={() => {
                      setDetailsOpen(false);
                      openEdit(selectedEmployee);
                    }}
                  >
                    Edit employee
                  </button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit employee modal */}
        <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditingEmployee(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit employee</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateEmployee} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Full name</label>
                <input
                  className="fv-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Role</label>
                <Select
                  value={editRole}
                  onValueChange={(val) => {
                    const selected = ROLE_OPTIONS.find(r => r.value === val as typeof editRole);
                    setEditRole(val as typeof editRole);
                    if (selected) setEditDepartment(selected.department);
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
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Department</label>
                <input
                  className="fv-input"
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Contact</label>
                <input
                  className="fv-input"
                  value={editContact}
                  onChange={(e) => setEditContact(e.target.value)}
                  placeholder="+254 700 000 000"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Status</label>
                <Select value={editStatus} onValueChange={(v) => setEditStatus(v as typeof editStatus)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on-leave">On leave</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <button
                  type="button"
                  className="fv-btn fv-btn--secondary"
                  onClick={() => { setEditOpen(false); setEditingEmployee(null); }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="fv-btn fv-btn--primary"
                >
                  {editSaving ? 'Saving…' : 'Save changes'}
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
          value={companyEmployees.length}
          layout="vertical"
        />
        <SimpleStatCard
          title="Active"
          value={companyEmployees.filter(e => e.status === 'active').length}
          valueVariant="success"
          layout="vertical"
        />
        <SimpleStatCard
          title="On Leave"
          value={companyEmployees.filter(e => e.status === 'on-leave').length}
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="p-2 hover:bg-muted rounded-lg transition-colors"
                        >
                          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => {
                            setSelectedEmployee(employee);
                            setDetailsOpen(true);
                          }}
                        >
                          View details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() => openEdit(employee)}
                        >
                          Edit
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                <div className="flex items-center gap-1">
                  <span className={cn('fv-badge capitalize', getStatusBadge(employee.status))}>
                    {employee.status.replace('-', ' ')}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="p-2 hover:bg-muted rounded-lg">
                        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="cursor-pointer" onClick={() => { setSelectedEmployee(employee); setDetailsOpen(true); }}>
                        View details
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer" onClick={() => openEdit(employee)}>
                        Edit
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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
