import React from 'react';
import { Bell, Search, ChevronDown, Settings, LogOut, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TopNavbarProps {
  sidebarCollapsed: boolean;
}

export function TopNavbar({ sidebarCollapsed }: TopNavbarProps) {
  const { user, logout } = useAuth();
  const { projects, activeProject, setActiveProject } = useProject();

  const companyProjects = user ? projects.filter(p => p.companyId === user.companyId) : [];

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
        sidebarCollapsed ? 'left-16' : 'left-60'
      )}
    >
      <div className="flex h-full items-center justify-between px-6">
        {/* Left: Project Selector */}
        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm hover:bg-muted transition-colors">
              {activeProject ? (
                <>
                  <span className="text-lg">{getCropEmoji(activeProject.cropType)}</span>
                  <span className="font-medium">{activeProject.name}</span>
                  <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
                    {activeProject.status}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Select Project</span>
              )}
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
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
          <button className="relative flex h-10 w-10 items-center justify-center rounded-lg hover:bg-muted transition-colors">
            <Bell className="h-5 w-5 text-muted-foreground" />
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-fv-gold" />
          </button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-medium text-sm">
                {user?.name.charAt(0)}
              </div>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium">{user?.name}</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {user?.role.replace('-', ' ')}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground hidden md:block" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                Settings
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
