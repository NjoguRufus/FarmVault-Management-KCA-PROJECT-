import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { Employee } from '@/types';

interface RequireBrokerProps {
  children: React.ReactElement;
}

export function RequireBroker({ children }: RequireBrokerProps) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // If user role is directly 'broker', allow access
  if (user?.role === 'broker') {
    return children;
  }

  // If user is employee, check employee role
  if (user?.role === 'employee') {
    const { data: employees = [] } = useCollection<Employee>('employees', 'employees');
    const isBrokerEmployee = employees.some(e => e.id === user.id && e.role === 'sales-broker');
    if (isBrokerEmployee) {
      return children;
    }
  }

  return <Navigate to="/dashboard" replace />;
}
