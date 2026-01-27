import React from 'react';
import { Plus, Search, Filter, MoreHorizontal } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Project } from '@/types';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '@/lib/dateUtils';

export default function ProjectsPage() {
  const { user } = useAuth();
  const { projects, setActiveProject } = useProject();
  const navigate = useNavigate();

  const visibleProjects = user ? projects.filter(p => p.companyId === user.companyId) : [];

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

  const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage all your agricultural projects
          </p>
        </div>
        <button
          className="fv-btn fv-btn--primary"
          onClick={() => navigate('/projects/new')}
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search projects..."
            className="fv-input pl-10"
          />
        </div>
        <div className="flex gap-2">
          <select className="fv-select">
            <option value="">All Crops</option>
            <option value="tomatoes">Tomatoes</option>
            <option value="french-beans">French Beans</option>
            <option value="capsicum">Capsicum</option>
            <option value="maize">Maize</option>
            <option value="watermelons">Watermelons</option>
            <option value="rice">Rice</option>
          </select>
          <select className="fv-select">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="planning">Planning</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleProjects.map((project) => (
          <div
            key={project.id}
            className="fv-card hover:shadow-card-hover transition-shadow flex flex-col justify-between cursor-pointer"
            onClick={() => {
              setActiveProject(project);
              navigate(`/projects/${project.id}`);
            }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{getCropEmoji(project.cropType)}</span>
                <div>
                  <h3 className="font-semibold text-foreground">{project.name}</h3>
                  <p className="text-xs text-muted-foreground capitalize">
                    {project.cropType.replace('-', ' ')}
                  </p>
                </div>
              </div>
              <span className={cn('fv-badge capitalize', getStatusBadge(project.status))}>
                {project.status}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Location</span>
                <span className="font-medium">{project.location}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Acreage</span>
                <span className="font-medium">{project.acreage} acres</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Budget</span>
                <span className="font-medium">{formatCurrency(project.budget)}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">
                  Started {formatDate(project.startDate)}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveProject(project);
                    navigate(`/projects/${project.id}`);
                  }}
                >
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
