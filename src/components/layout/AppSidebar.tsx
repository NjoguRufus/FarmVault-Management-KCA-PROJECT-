import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  Layers,
  Receipt,
  Wrench,
  Package,
  TrendingUp,
  Users,
  Truck,
  AlertTriangle,
  FileText,
  CreditCard,
  HelpCircle,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const companyNavItems = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'My Dashboard', href: '/employee-dashboard', icon: LayoutDashboard, employeeOnly: true },
  { title: 'Projects', href: '/projects', icon: FolderKanban },
  { title: 'Crop Stages', href: '/crop-stages', icon: Layers },
  { title: 'Expenses', href: '/expenses', icon: Receipt },
  { title: 'Operations', href: '/operations', icon: Wrench },
  { title: 'Inventory', href: '/inventory', icon: Package },
  { title: 'Harvest & Sales', href: '/harvest-sales', icon: TrendingUp },
  { title: 'Suppliers', href: '/suppliers', icon: Truck },
  { title: 'Season Challenges', href: '/challenges', icon: AlertTriangle },
  { title: 'Employees', href: '/employees', icon: Users },
  { title: 'Reports', href: '/reports', icon: FileText },
  { title: 'Billing & Subscription', href: '/billing', icon: CreditCard },
  { title: 'Support', href: '/support', icon: HelpCircle },
  { title: 'Feedback', href: '/feedback', icon: MessageSquare },
];

const developerNavItems = [
  { title: 'Admin Home', href: '/admin', icon: LayoutDashboard },
  { title: 'Companies', href: '/admin/companies', icon: Building2 },
  { title: 'Users', href: '/admin/users', icon: Users },
  { title: 'Pending Users', href: '/admin/users/pending', icon: Users },
  { title: 'Audit Logs', href: '/admin/audit-logs', icon: FileText },
];

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const location = useLocation();
  const { user } = useAuth();

  const baseNavItems = user?.role === 'developer' ? developerNavItems : companyNavItems;
  
  // Filter nav items based on user role
  const navItems = baseNavItems.filter(item => {
    // Show employee-only items only for employees
    if ((item as any).employeeOnly) {
      return user?.role === 'employee';
    }
    // Hide employee dashboard for non-employees
    if (item.href === '/employee-dashboard' && user?.role !== 'employee') {
      return false;
    }
    return true;
  });

  return (
    <>
      {/* Mobile overlay when sidebar is open */}
      {!collapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden transition-opacity duration-300"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen transition-all duration-300 fv-sidebar',
          // On mobile: overlay behavior - slide in/out
          // On desktop: always visible, just changes width
          collapsed 
            ? 'w-16 -translate-x-full md:translate-x-0' 
            : 'w-60 translate-x-0'
        )}
        style={{
          boxShadow: 'var(--shadow-sidebar)',
        }}
      >
      {/* Logo Section */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-sidebar-border/30">
        <div className="flex items-center gap-3">
          <img
            src="/Logo/FarmVault_Logo dark mode.png"
            alt="FarmVault logo"
            className="h-8 w-auto rounded-md object-contain bg-sidebar-primary/10 p-1"
          />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-sidebar-foreground">FarmVault</span>
              <span className="text-xs text-sidebar-muted">Management</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 scrollbar-thin">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-primary'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                  )}
                >
                  <Icon className={cn('h-5 w-5 shrink-0', isActive && 'text-sidebar-primary')} />
                  {!collapsed && <span>{item.title}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Section */}
      {!collapsed && user && (
        <div className="border-t border-sidebar-border/30 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground font-medium text-sm">
              {user.name.charAt(0)}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-sidebar-foreground">{user.name}</span>
              <span className="text-xs text-sidebar-muted capitalize">{user.role.replace('-', ' ')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Collapse Toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full bg-card border border-border shadow-sm hover:bg-muted transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 text-foreground" />
        ) : (
          <ChevronLeft className="h-4 w-4 text-foreground" />
        )}
      </button>
    </aside>
    </>
  );
}
