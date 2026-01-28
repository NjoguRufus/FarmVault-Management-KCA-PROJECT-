import React, { useState } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { TopNavbar } from './TopNavbar';
import { AIChatButton } from '@/components/ai/AIChatButton';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

export function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  // Enforce role-based access to main app sections.
  if (user) {
    const path = location.pathname;

    // Manager: only manager dashboard + operations + inventory
    if (user.role === 'manager') {
      const allowedPrefixes = ['/manager', '/operations', '/inventory'];
      const allowed = allowedPrefixes.some(
        (prefix) => path === prefix || path.startsWith(prefix + '/'),
      );
      if (!allowed) {
        return <Navigate to="/manager" replace />;
      }
    }

    // Broker: only broker dashboard + harvest & sales + expenses
    if (user.role === 'broker') {
      const allowedPrefixes = ['/broker', '/harvest-sales', '/expenses'];
      const allowed = allowedPrefixes.some(
        (prefix) => path === prefix || path.startsWith(prefix + '/'),
      );
      if (!allowed) {
        return <Navigate to="/broker" replace />;
      }
    }
  }

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
