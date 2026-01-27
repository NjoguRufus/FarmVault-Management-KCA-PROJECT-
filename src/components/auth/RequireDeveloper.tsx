import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface RequireDeveloperProps {
  children: React.ReactElement;
}

export function RequireDeveloper({ children }: RequireDeveloperProps) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (user?.role !== 'developer') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

