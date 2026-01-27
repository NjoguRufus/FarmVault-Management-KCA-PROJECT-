import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Project } from '@/types';
import { useCollection } from '@/hooks/useCollection';

interface ProjectContextType {
  projects: Project[];
  activeProject: Project | null;
  setActiveProject: (project: Project | null) => void;
  getProjectsByCompany: (companyId: string) => Project[];
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { data: projectsData = [] } = useCollection<Project>('projects', 'projects');
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  const getProjectsByCompany = (companyId: string) => {
    return projectsData.filter(p => p.companyId === companyId);
  };

  return (
    <ProjectContext.Provider
      value={{
        projects: projectsData,
        activeProject,
        setActiveProject,
        getProjectsByCompany,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
