import React from 'react';
import { Bell, Search, ChevronDown, Settings, LogOut, User, Menu, HelpCircle, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { cn, getDisplayRole } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';

interface TopNavbarProps {
  sidebarCollapsed: boolean;
  onSidebarToggle?: () => void;
}

export function TopNavbar({ sidebarCollapsed, onSidebarToggle }: TopNavbarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { projects, activeProject, setActiveProject } = useProject();
  const { notifications, markAsRead, markAllRead, unreadCount } = useNotifications();

  const companyProjects = user ? projects.filter(p => p.companyId === user.companyId) : [];

  const empRole = (user as any)?.employeeRole;
  const isBroker = Boolean(
    user &&
    (user.role === 'broker' || (user.role === 'employee' && (empRole === 'sales-broker' || empRole === 'broker')))
  );

  const getCropEmoji = (cropType: string) => {
    const emojis: Record<string, string> = {
      tomatoes: '🍅',
      'french-beans': '🫛',
      capsicum: '🌶️',
      maize: '🌽',
      watermelons: '🍉',
      rice: '🌾',
    };
    return emojis[cropType] || '🌱';
  };

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-30 h-16 bg-card border-b border-border transition-all duration-300',
        // On mobile, navbar spans full width (sidebar overlays)
        // On desktop, adjust based on sidebar state
        'left-0 md:left-16 md:left-60',
        sidebarCollapsed ? 'md:left-16' : 'md:left-60'
      )}
    >
      <div className="flex h-full items-center justify-between px-4 sm:px-6">
        {/* Left: Mobile Menu + Logo + Project Selector */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Mobile Menu Button */}
          <button
            onClick={onSidebarToggle}
            className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted transition-colors"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5 text-foreground" />
          </button>
          {/* Mobile Logo */}
          <img
            src="/Logo/FarmVault_Logo dark mode.png"
            alt="FarmVault logo"
            className="h-8 w-auto rounded-md object-contain bg-sidebar-primary/10 p-1 md:hidden"
          />
          {isBroker ? (
            <div className="flex items-center gap-1.5 sm:gap-2 rounded-lg border border-border bg-background px-2 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm">
              <span className="text-base sm:text-lg">🍅</span>
              <span className="font-medium">Tomatoes</span>
            </div>
          ) : (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 sm:gap-2 rounded-lg border border-border bg-background px-2 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm hover:bg-muted transition-colors">
              {activeProject ? (
                <>
                  <span className="text-base sm:text-lg">{getCropEmoji(activeProject.cropType)}</span>
                  <span className="font-medium hidden sm:inline">{activeProject.name}</span>
                  <span className="font-medium sm:hidden max-w-[80px] truncate">{activeProject.name}</span>
                  <span className="hidden sm:inline text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
                    {activeProject.status}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground text-xs sm:text-sm">Select Project</span>
              )}
              <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>Switch Project</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {companyProjects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => setActiveProject(project)}
                  className={cn(
                    'flex items-center gap-3 cursor-pointer',
                    activeProject?.id === project.id && 'bg-muted'
                  )}
                >
                  <span className="text-lg">{getCropEmoji(project.cropType)}</span>
                  <div className="flex flex-col">
                    <span className="font-medium">{project.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">
                      {project.cropType.replace('-', ' ')} • {project.location}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>

        {/* Center: Search */}
        <div className="hidden md:flex items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              className="fv-input pl-10 w-64"
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger className="relative flex h-10 w-10 items-center justify-center rounded-lg hover:bg-muted transition-colors">
              <Bell className="h-5 w-5 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 max-h-[70vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-2 py-1.5">
                <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="text-xs text-primary hover:underline"
                  >
                    <CheckCheck className="h-3.5 w-3.5 inline mr-0.5" />
                    Mark all read
                  </button>
                )}
              </div>
              <DropdownMenuSeparator />
              <div className="overflow-y-auto flex-1 min-h-0">
                {notifications.length === 0 ? (
                  <p className="px-2 py-4 text-sm text-muted-foreground text-center">No notifications yet.</p>
                ) : (
                  notifications.map((n) => (
                    <DropdownMenuItem
                      key={n.id}
                      className={cn(
                        'flex flex-col items-start gap-0.5 cursor-pointer py-3',
                        !n.read && 'bg-muted/50'
                      )}
                      onClick={() => markAsRead(n.id)}
                    >
                      <span className="font-medium text-sm text-foreground">{n.title}</span>
                      {n.message && (
                        <span className="text-xs text-muted-foreground line-clamp-2">{n.message}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-medium text-sm">
                {user?.name.charAt(0)}
              </div>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium">{user?.name}</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {user ? getDisplayRole(user) : ''}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground hidden md:block" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/billing')}>
                <User className="mr-2 h-4 w-4" />
                Profile & Billing
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => navigate('/support')}>
                <HelpCircle className="mr-2 h-4 w-4" />
                Support
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
