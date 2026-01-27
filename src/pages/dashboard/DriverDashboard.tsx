import React, { useMemo } from 'react';
import { Truck, MapPin, Fuel, Package, CheckCircle, Clock, X } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCollection } from '@/hooks/useCollection';
import { Delivery, Harvest, Expense } from '@/types';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { formatDate, toDate } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function DriverDashboard() {
  const { activeProject } = useProject();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const companyId = user?.companyId || '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  // Data sources
  const { data: allDeliveries = [] } = useCollection<Delivery>('deliveries', 'deliveries');
  const { data: allHarvests = [] } = useCollection<Harvest>('harvests', 'harvests');
  const { data: allExpenses = [] } = useCollection<Expense>('expenses', 'expenses');

  // Filter deliveries by driver and project
  const driverDeliveries = useMemo(() => {
    if (!activeProject) return [];
    return allDeliveries.filter(
      d => d.projectId === activeProject.id &&
      d.companyId === activeProject.companyId &&
      d.driverId === user?.id
    );
  }, [allDeliveries, activeProject, user?.id]);

  const todayDeliveries = useMemo(() => {
    return driverDeliveries.filter(delivery => {
      const deliveryDate = toDate(delivery.date);
      return deliveryDate && deliveryDate >= today && deliveryDate <= todayEnd;
    });
  }, [driverDeliveries, today, todayEnd]);

  // Calculate stats
  const tripsToday = todayDeliveries.length;
  const totalDistance = useMemo(() => {
    return todayDeliveries.reduce((sum, d) => sum + (d.distance || 0), 0);
  }, [todayDeliveries]);

  const fuelUsed = useMemo(() => {
    return todayDeliveries.reduce((sum, d) => sum + (d.fuelUsed || 0), 0);
  }, [todayDeliveries]);

  // Get current assignment (pending or in-transit)
  const currentAssignment = useMemo(() => {
    return driverDeliveries.find(
      d => d.status === 'pending' || d.status === 'in-transit'
    );
  }, [driverDeliveries]);

  // Filter fuel expenses
  const fuelExpenses = useMemo(() => {
    if (!activeProject) return [];
    return allExpenses.filter(
      e => e.projectId === activeProject.id &&
      e.companyId === activeProject.companyId &&
      e.category === 'fuel'
    );
  }, [allExpenses, activeProject]);

  const handleStartTrip = async (deliveryId: string) => {
    if (!user) return;
    try {
      const deliveryRef = doc(db, 'deliveries', deliveryId);
      await updateDoc(deliveryRef, {
        status: 'in-transit',
        startedAt: serverTimestamp(),
      });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    } catch (error) {
      console.error('Error starting trip:', error);
    }
  };

  const handleCompleteDelivery = async (deliveryId: string) => {
    if (!user) return;
    try {
      const deliveryRef = doc(db, 'deliveries', deliveryId);
      await updateDoc(deliveryRef, {
        status: 'delivered',
        completedAt: serverTimestamp(),
      });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    } catch (error) {
      console.error('Error completing delivery:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'fv-badge--warning',
      'in-transit': 'fv-badge--info',
      delivered: 'fv-badge--success',
      cancelled: 'fv-badge--destructive',
    };
    return styles[status] || 'bg-muted text-muted-foreground';
  };

  if (!activeProject) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="fv-card p-8 text-center">
          <p className="text-muted-foreground">Please select a project to view the driver dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Driver Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Logistics & delivery operations for <span className="font-medium">{activeProject.name}</span>
        </p>
      </div>

      {/* Primary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SimpleStatCard
          title="Trips Today"
          value={tripsToday}
          icon={Truck}
          iconVariant="primary"
        />
        <SimpleStatCard
          title="Total Distance"
          value={`${totalDistance} km`}
          icon={MapPin}
          iconVariant="info"
        />
        <SimpleStatCard
          title="Fuel Used"
          value={`${fuelUsed.toFixed(1)} L`}
          icon={Fuel}
          iconVariant="warning"
        />
        <SimpleStatCard
          title="Current Assignment"
          value={currentAssignment ? 'Active' : 'None'}
          icon={Package}
          iconVariant={currentAssignment ? 'success' : 'muted'}
        />
      </div>

      {/* Today's Assignments */}
      <div className="fv-card">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">Today's Assignments</h2>
        </div>
        <div className="p-4 space-y-3">
          {todayDeliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No assignments for today.
            </p>
          ) : (
            todayDeliveries.map(delivery => {
              const harvest = allHarvests.find(h => h.id === delivery.harvestId);
              return (
                <div key={delivery.id} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-foreground">
                          {delivery.from} → {delivery.to}
                        </h3>
                        <span className={cn('fv-badge text-xs', getStatusBadge(delivery.status))}>
                          {delivery.status.replace('-', ' ')}
                        </span>
                      </div>
                      {harvest && (
                        <p className="text-sm text-muted-foreground mb-1">
                          Harvest: {formatDate(harvest.date)} • {harvest.quantity} {harvest.unit}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Quantity: {delivery.quantity} {delivery.unit}
                        {delivery.distance && ` • Distance: ${delivery.distance} km`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {delivery.status === 'pending' && (
                      <Button
                        onClick={() => handleStartTrip(delivery.id)}
                        className="fv-btn fv-btn--primary"
                      >
                        <Truck className="h-4 w-4" />
                        Start Trip
                      </Button>
                    )}
                    {delivery.status === 'in-transit' && (
                      <Button
                        onClick={() => handleCompleteDelivery(delivery.id)}
                        className="fv-btn fv-btn--success"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Complete Delivery
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Delivery History */}
      <div className="fv-card">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">Delivery History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-left text-xs font-semibold text-muted-foreground">Date</th>
                <th className="p-3 text-left text-xs font-semibold text-muted-foreground">Route</th>
                <th className="p-3 text-left text-xs font-semibold text-muted-foreground">Quantity</th>
                <th className="p-3 text-left text-xs font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {driverDeliveries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">
                    No delivery history.
                  </td>
                </tr>
              ) : (
                driverDeliveries
                  .sort((a, b) => {
                    const dateA = toDate(a.date);
                    const dateB = toDate(b.date);
                    if (!dateA || !dateB) return 0;
                    return dateB.getTime() - dateA.getTime();
                  })
                  .map(delivery => (
                    <tr key={delivery.id} className="border-t">
                      <td className="p-3 text-sm">{formatDate(delivery.date)}</td>
                      <td className="p-3 text-sm">
                        {delivery.from} → {delivery.to}
                      </td>
                      <td className="p-3 text-sm">
                        {delivery.quantity} {delivery.unit}
                      </td>
                      <td className="p-3">
                        <span className={cn('fv-badge text-xs', getStatusBadge(delivery.status))}>
                          {delivery.status.replace('-', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
