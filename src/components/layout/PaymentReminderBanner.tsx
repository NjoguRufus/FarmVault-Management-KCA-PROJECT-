import React from 'react';
import { CreditCard, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { getCompany, clearPaymentReminder } from '@/services/companyService';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';

export function PaymentReminderBanner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const companyId = user?.companyId ?? null;
  const isDeveloper = user?.role === 'developer';

  const { data: company, isLoading } = useQuery({
    queryKey: ['company-payment-reminder', companyId],
    enabled: !!companyId && !isDeveloper,
    queryFn: () => getCompany(companyId!),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const [dismissing, setDismissing] = React.useState(false);

  const handleDismiss = async () => {
    if (!companyId || !user?.id) return;
    setDismissing(true);
    try {
      await clearPaymentReminder(companyId, user.id);
      await queryClient.invalidateQueries({ queryKey: ['company-payment-reminder', companyId] });
    } finally {
      setDismissing(false);
    }
  };

  const reminderActive = company?.paymentReminderActive === true || company?.paymentReminderActive === 'true';
  if (isLoading || !company || !reminderActive) return null;

  let nextPayment: string | null = null;
  if (company.nextPaymentAt) {
    const t = company.nextPaymentAt as { toDate?: () => Date; seconds?: number };
    if (typeof t.toDate === 'function') nextPayment = format(t.toDate(), 'PP');
    else if (typeof t.seconds === 'number') nextPayment = format(new Date(t.seconds * 1000), 'PP');
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-full max-w-sm animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className="rounded-xl border border-amber-500/40 bg-card shadow-lg p-4 flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20">
          <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Payment reminder</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Please update your payment to continue with full access.
            {nextPayment && <span className="block mt-0.5 font-medium text-amber-700 dark:text-amber-300">Due: {nextPayment}</span>}
          </p>
          <button
            type="button"
            disabled={dismissing}
            onClick={handleDismiss}
            className="mt-2 text-xs font-medium text-primary hover:underline"
          >
            {dismissing ? 'Updating…' : "I've paid / Dismiss"}
          </button>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
