import React, { useState } from 'react';
import { Check, CreditCard, Crown, Zap, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCompany, updateCompany } from '@/services/companyService';

export default function BillingPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const companyId = user?.companyId ?? null;
  const [switchingPlan, setSwitchingPlan] = useState<string | null>(null);

  const { data: company } = useQuery({
    queryKey: ['company-billing', companyId],
    enabled: !!companyId,
    queryFn: () => getCompany(companyId!),
  });

  const currentPlan = (company?.plan ?? company?.subscriptionPlan ?? 'professional') as string;

  const handleSwitchPlan = async (planValue: string) => {
    if (!companyId || planValue === currentPlan) return;
    setSwitchingPlan(planValue);
    try {
      await updateCompany(companyId, { plan: planValue });
      await queryClient.invalidateQueries({ queryKey: ['company-billing', companyId] });
    } finally {
      setSwitchingPlan(null);
    }
  };

  const plans = [
    {
      name: 'Starter',
      value: 'starter',
      price: 'KES 2,500',
      period: '/month',
      description: 'Perfect for small farms getting started',
      features: [
        'Up to 5 projects',
        'Up to 10 users',
        'Basic reporting',
        'Email support',
        '5GB storage',
      ],
      popular: false,
    },
    {
      name: 'Professional',
      value: 'professional',
      price: 'KES 7,500',
      period: '/month',
      description: 'Ideal for growing agricultural businesses',
      features: [
        'Up to 20 projects',
        'Up to 50 users',
        'Advanced analytics',
        'Priority support',
        '25GB storage',
        'API access',
        'Custom reports',
      ],
      popular: true,
    },
    {
      name: 'Enterprise',
      value: 'enterprise',
      price: 'KES 15,000',
      period: '/month',
      description: 'For large-scale farm operations',
      features: [
        'Unlimited projects',
        'Unlimited users',
        'AI-powered insights',
        '24/7 phone support',
        '100GB storage',
        'Custom integrations',
        'Dedicated account manager',
        'SLA guarantee',
      ],
      popular: false,
    },
  ];

  const currentPlanData = plans.find((p) => p.value === currentPlan) ?? plans[1];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing & Subscription</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your subscription and billing preferences
          </p>
        </div>
      </div>

      {/* Current Plan Summary */}
      <div className="fv-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-fv-gold-soft">
              <Crown className="h-7 w-7 text-fv-olive" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{currentPlanData.name} Plan</h3>
              <p className="text-sm text-muted-foreground">Your next billing date is March 1, 2024</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{currentPlanData.price}<span className="text-sm font-normal text-muted-foreground">{currentPlanData.period}</span></p>
            <button className="text-sm text-primary hover:underline mt-1">View invoice history</button>
          </div>
        </div>
      </div>

      {/* Plan Selection */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = plan.value === currentPlan;
            const isLoading = switchingPlan === plan.value;
            return (
              <div
                key={plan.value}
                className={cn(
                  'fv-card relative',
                  plan.popular && 'ring-2 ring-fv-gold'
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="fv-badge fv-badge--gold">
                      <Zap className="h-3 w-3 mr-1" />
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="text-center mb-6 pt-2">
                  <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                  <div className="mt-4">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-fv-success shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  className={cn(
                    'w-full fv-btn',
                    isCurrent
                      ? 'bg-muted text-muted-foreground cursor-default'
                      : plan.popular
                        ? 'fv-btn--primary'
                        : 'fv-btn--secondary'
                  )}
                  disabled={isCurrent || !!switchingPlan}
                  onClick={() => handleSwitchPlan(plan.value)}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isCurrent ? (
                    'Current Plan'
                  ) : (
                    'Upgrade'
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment Method */}
      <div className="fv-card">
        <h3 className="text-lg font-semibold mb-4">Payment Method</h3>
        <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">•••• •••• •••• 4242</p>
              <p className="text-sm text-muted-foreground">Expires 12/25</p>
            </div>
          </div>
          <button className="text-sm text-primary hover:underline">Update</button>
        </div>
      </div>
    </div>
  );
}
