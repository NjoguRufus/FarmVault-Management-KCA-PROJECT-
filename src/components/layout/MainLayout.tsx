import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { TopNavbar } from './TopNavbar';
import { PaymentReminderBanner } from './PaymentReminderBanner';
import { AIChatButton } from '@/components/ai/AIChatButton';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

export function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const hasRedirectedRef = useRef<string | null>(null);

  // Memoize broker check to prevent infinite loops
  // Extract employeeRole from user object to ensure stable reference
  const employeeRole = useMemo(() => {
    return user ? ((user as any).employeeRole as string | undefined) : undefined;
  }, [user?.employeeRole]);
  
  const isBroker = useMemo(() => {
    if (!user) return false;
    return user.role === 'broker' || 
           (user.role === 'employee' && (employeeRole === 'sales-broker' || employeeRole === 'broker'));
  }, [user?.role, employeeRole]);

  // Enforce role-based access to main app sections.
  // Only redirect if we're NOT already on a role-specific route (to avoid loops)
  const redirectTarget = useMemo(() => {
    if (!user) return null;
    const path = location.pathname;

    // If already on a role-specific route, don't redirect (let the role guard handle it)
    if (path.startsWith('/manager') || path.startsWith('/broker') || path.startsWith('/driver') || path.startsWith('/admin')) {
      return null;
    }

    // Manager: only manager dashboard + operations + inventory
    if (user.role === 'manager') {
      const allowedPrefixes = ['/manager', '/operations', '/inventory'];
      const allowed = allowedPrefixes.some(
        (prefix) => path === prefix || path.startsWith(prefix + '/'),
      );
      if (!allowed) {
        return '/manager';
      }
    }

    // Broker: only broker dashboard + broker harvest-sales + expenses
    if (isBroker) {
      const allowedPrefixes = ['/broker', '/expenses'];
      const allowed = allowedPrefixes.some(
        (prefix) => path === prefix || path.startsWith(prefix + '/'),
      );
      if (!allowed) {
        return '/broker';
      }
    }

    return null;
  }, [user?.role, location.pathname, isBroker]);

  // Use useEffect to handle navigation instead of conditional rendering
  // This prevents infinite loops by only redirecting when the target actually changes
  useEffect(() => {
    // Only redirect if we have a target, it's different from current path, and we haven't redirected yet
    if (redirectTarget && redirectTarget !== location.pathname) {
      const redirectKey = `${location.pathname}->${redirectTarget}`;
      // Only redirect if we haven't already redirected from this path to this target
      if (hasRedirectedRef.current !== redirectKey) {
        hasRedirectedRef.current = redirectKey;
        navigate(redirectTarget, { replace: true });
      }
    } else if (!redirectTarget) {
      // Reset the ref when we're on a valid path (no redirect needed)
      hasRedirectedRef.current = null;
    }
  }, [redirectTarget, location.pathname, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <TopNavbar 
        sidebarCollapsed={sidebarCollapsed} 
        onSidebarToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <PaymentReminderBanner />
      
      <main
        className={cn(
          'pt-16 min-h-screen transition-all duration-300',
          // On mobile, no padding (sidebar overlays)
          // On desktop, add padding based on sidebar state
          sidebarCollapsed ? 'md:pl-16' : 'md:pl-60'
        )}
      >
        <div className="p-6">
          <Outlet />
        </div>
      </main>

      <AIChatButton />
    </div>
  );
}
