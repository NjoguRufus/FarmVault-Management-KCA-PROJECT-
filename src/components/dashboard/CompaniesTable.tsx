import React from 'react';
import { MoreHorizontal, ExternalLink, LayoutList, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Company } from '@/types';
import { Link } from 'react-router-dom';

export type CompaniesViewMode = 'list' | 'card';

interface CompaniesTableProps {
  companies: Company[];
  viewMode?: CompaniesViewMode;
  onViewModeChange?: (mode: CompaniesViewMode) => void;
  onCompanyClick?: (company: Company) => void;
  showViewAll?: boolean;
}

export function CompaniesTable({
  companies,
  viewMode = 'list',
  onViewModeChange,
  onCompanyClick,
  showViewAll = true,
}: CompaniesTableProps) {
  const getStatusBadge = (status: Company['status'] | undefined) => {
    const styles: Record<Company['status'], string> = {
      active: 'fv-badge--active',
      pending: 'fv-badge--warning',
      inactive: 'bg-muted text-muted-foreground',
    };
    return styles[status ?? 'pending'];
  };

  const getPlanBadge = (plan: Company['plan'] | undefined) => {
    const styles: Record<Company['plan'], string> = {
      enterprise: 'fv-badge--gold',
      professional: 'fv-badge--info',
      starter: 'bg-muted text-muted-foreground',
    };
    return styles[plan ?? 'starter'];
  };

  const formatCurrency = (amount: number | undefined) => {
    const safe = typeof amount === 'number' ? amount : 0;
    return `KES ${safe.toLocaleString()}`;
  };

  const isClickable = !!onCompanyClick;
  const rowOrCardProps = (company: Company) =>
    isClickable
      ? {
          role: 'button' as const,
          onClick: () => onCompanyClick(company),
          className: 'cursor-pointer hover:bg-muted/50',
        }
      : {};

  return (
    <div className="fv-card">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-foreground">Registered Companies</h3>
        <div className="flex items-center gap-2">
          {onViewModeChange && (
            <div className="flex rounded-lg border border-border p-0.5">
              <button
                type="button"
                onClick={() => onViewModeChange('list')}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  viewMode === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
                title="List view"
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('card')}
                className={cn(
                  'p-2 rounded-md transition-colors',
                  viewMode === 'card' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
                title="Card view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          )}
          {showViewAll && (
            <Link
              to="/admin/companies"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View All
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      {/* List view */}
      <div className={cn(viewMode === 'list' ? 'block' : 'hidden', 'overflow-x-auto')}>
        <table className="fv-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Users</th>
              <th>Projects</th>
              <th>Revenue</th>
              <th>Plan</th>
              <th>Status</th>
              {!isClickable && <th></th>}
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id} {...rowOrCardProps(company)}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold">
                      {company.name.charAt(0)}
                    </div>
                    <span className="font-medium text-foreground">{company.name}</span>
                  </div>
                </td>
                <td>{company.userCount ?? 0}</td>
                <td>{company.projectCount ?? 0}</td>
                <td>{formatCurrency(company.revenue)}</td>
                <td>
                  <span className={cn('fv-badge capitalize', getPlanBadge(company.plan))}>
                    {company.plan}
                  </span>
                </td>
                <td>
                  <span className={cn('fv-badge capitalize', getStatusBadge(company.status))}>
                    {company.status}
                  </span>
                </td>
                {!isClickable && (
                  <td>
                    <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Card view */}
      <div className={cn(viewMode === 'card' ? 'block' : 'hidden')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {companies.map((company) => (
            <div
              key={company.id}
              className="p-4 bg-muted/30 rounded-lg transition-colors"
              {...rowOrCardProps(company)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold">
                    {company.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{company.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {(company.userCount ?? 0)} users • {(company.projectCount ?? 0)} projects
                    </div>
                  </div>
                </div>
                <span className={cn('fv-badge capitalize', getStatusBadge(company.status))}>
                  {company.status}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className={cn('fv-badge capitalize', getPlanBadge(company.plan))}>
                  {company.plan}
                </span>
                <span className="font-medium">{formatCurrency(company.revenue)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
