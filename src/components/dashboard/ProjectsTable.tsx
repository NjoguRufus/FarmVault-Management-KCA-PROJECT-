import React from 'react';
import { MoreHorizontal, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Project } from '@/types';
import { Link } from 'react-router-dom';

interface ProjectsTableProps {
  projects: Project[];
  compact?: boolean;
}

export function ProjectsTable({ projects, compact = false }: ProjectsTableProps) {
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

  const getStatusBadge = (status: Project['status']) => {
    const styles: Record<Project['status'], string> = {
      active: 'fv-badge--active',
      planning: 'fv-badge--info',
      completed: 'fv-badge--gold',
      archived: 'bg-muted text-muted-foreground',
    };
    return styles[status];
  };

  const formatCurrency = (amount: number) => {
    return `KES ${amount.toLocaleString()}`;
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-KE', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  return (
    <div className={cn('fv-card', compact && 'p-3 sm:p-4')}>
      <div className={cn('flex items-center justify-between', compact ? 'mb-3' : 'mb-6')}>
        <h3 className={cn('font-semibold text-foreground', compact ? 'text-sm sm:text-base' : 'text-lg')}>
          Current Projects
        </h3>
        <Link 
          to="/projects"
          className="text-xs sm:text-sm text-primary hover:underline flex items-center gap-1"
        >
          View All
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className={cn('fv-table', compact && 'text-sm')}>
          <thead>
            <tr>
              <th className={compact ? 'py-2' : ''}>Project</th>
              <th className={compact ? 'py-2' : ''}>Crop</th>
              <th className={compact ? 'py-2' : ''}>Location</th>
              <th className={compact ? 'py-2' : ''}>Acreage</th>
              <th className={compact ? 'py-2' : ''}>Budget</th>
              <th className={compact ? 'py-2' : ''}>Status</th>
              <th className={compact ? 'py-2' : ''}></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <td className={compact ? 'py-2' : ''}>
                  <div className="flex items-center gap-2">
                    <span className={compact ? 'text-lg' : 'text-xl'}>{getCropEmoji(project.cropType)}</span>
                    <div>
                      <div className={cn('font-medium text-foreground', compact && 'text-sm')}>
                        {project.name}
                      </div>
                      {!compact && (
                        <div className="text-xs text-muted-foreground">
                          Started {formatDate(project.startDate)}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className={compact ? 'py-2 text-sm' : ''}>
                  <span className="capitalize">{project.cropType.replace('-', ' ')}</span>
                </td>
                <td className={compact ? 'py-2 text-sm' : ''}>{project.location}</td>
                <td className={compact ? 'py-2 text-sm' : ''}>{project.acreage} acres</td>
                <td className={compact ? 'py-2 text-sm' : ''}>{formatCurrency(project.budget)}</td>
                <td className={compact ? 'py-2' : ''}>
                  <span className={cn('fv-badge capitalize text-xs', getStatusBadge(project.status))}>
                    {project.status}
                  </span>
                </td>
                <td className={compact ? 'py-2' : ''}>
                  <button className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                    <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-2">
        {projects.map((project) => (
          <div key={project.id} className={cn('bg-muted/30 rounded-lg', compact ? 'p-2.5' : 'p-4')}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={compact ? 'text-xl' : 'text-2xl'}>{getCropEmoji(project.cropType)}</span>
                <div>
                  <div className={cn('font-medium text-foreground', compact && 'text-sm')}>
                    {project.name}
                  </div>
                  <div className={cn('text-muted-foreground capitalize', compact ? 'text-xs' : 'text-xs')}>
                    {project.cropType.replace('-', ' ')} • {project.location}
                  </div>
                </div>
              </div>
              <span className={cn('fv-badge capitalize text-xs', getStatusBadge(project.status))}>
                {project.status}
              </span>
            </div>
            <div className={cn('grid grid-cols-2 gap-2', compact ? 'text-xs' : 'text-sm')}>
              <div>
                <span className="text-muted-foreground">Acreage:</span>
                <span className="ml-1 font-medium">{project.acreage} acres</span>
              </div>
              <div>
                <span className="text-muted-foreground">Budget:</span>
                <span className="ml-1 font-medium">{formatCurrency(project.budget)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
