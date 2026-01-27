import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { TopNavbar } from './TopNavbar';
import { AIChatButton } from '@/components/ai/AIChatButton';
import { cn } from '@/lib/utils';

export function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
