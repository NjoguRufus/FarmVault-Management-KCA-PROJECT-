import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface RequireManagerProps {
  children: React.ReactElement;
}

export function RequireManager({ children }: RequireManagerProps) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const isManagerPlatformRole = user?.role === 'manager';
  const isManagerEmployeeRole =
    user?.employeeRole === 'manager' || user?.employeeRole === 'operations-manager';

  if (!isManagerPlatformRole && !isManagerEmployeeRole) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
