import React from 'react';
import { MoreHorizontal, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Project } from '@/types';
import { Link } from 'react-router-dom';

interface ProjectsTableProps {
  projects: Project[];
}

export function ProjectsTable({ projects }: ProjectsTableProps) {
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
    <div className="fv-card">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">Current Projects</h3>
        <Link 
          to="/projects"
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          View All
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="fv-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Crop</th>
              <th>Location</th>
              <th>Acreage</th>
              <th>Budget</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{getCropEmoji(project.cropType)}</span>
                    <div>
                      <div className="font-medium text-foreground">{project.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Started {formatDate(project.startDate)}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="capitalize">{project.cropType.replace('-', ' ')}</span>
                </td>
                <td>{project.location}</td>
                <td>{project.acreage} acres</td>
                <td>{formatCurrency(project.budget)}</td>
                <td>
                  <span className={cn('fv-badge capitalize', getStatusBadge(project.status))}>
                    {project.status}
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
        {projects.map((project) => (
          <div key={project.id} className="p-4 bg-muted/30 rounded-lg">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getCropEmoji(project.cropType)}</span>
                <div>
                  <div className="font-medium text-foreground">{project.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {project.cropType.replace('-', ' ')} • {project.location}
                  </div>
                </div>
              </div>
              <span className={cn('fv-badge capitalize', getStatusBadge(project.status))}>
                {project.status}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
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
