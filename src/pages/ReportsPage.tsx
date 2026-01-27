import React from 'react';
import { Download, FileText, BarChart2, PieChart, TrendingUp } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { ExpensesPieChart } from '@/components/dashboard/ExpensesPieChart';
import { ActivityChart } from '@/components/dashboard/ActivityChart';
import { mockExpensesByCategory, mockActivityData } from '@/data/mockData';

export default function ReportsPage() {
  const { activeProject } = useProject();

  const reportTypes = [
    {
      title: 'Expenses Report',
      description: 'Detailed breakdown of all expenses by category and period',
      icon: <PieChart className="h-6 w-6" />,
      color: 'bg-primary/10 text-primary',
    },
    {
      title: 'Harvest Report',
      description: 'Summary of harvest quantities, quality grades, and yields',
      icon: <BarChart2 className="h-6 w-6" />,
      color: 'bg-fv-success/10 text-fv-success',
    },
    {
      title: 'Sales Report',
      description: 'Complete sales data including buyers, quantities, and revenue',
      icon: <TrendingUp className="h-6 w-6" />,
      color: 'bg-fv-gold-soft text-fv-olive',
    },
    {
      title: 'Operations Report',
      description: 'Timeline of all operations performed with status tracking',
      icon: <FileText className="h-6 w-6" />,
      color: 'bg-fv-info/10 text-fv-info',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeProject ? (
              <>Generate reports for <span className="font-medium">{activeProject.name}</span></>
            ) : (
              'View and export detailed reports'
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <select className="fv-select">
            <option>This Month</option>
            <option>Last Month</option>
            <option>This Quarter</option>
            <option>This Year</option>
          </select>
        </div>
      </div>

      {/* Report Types */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reportTypes.map((report) => (
          <div key={report.title} className="fv-card hover:shadow-card-hover transition-shadow cursor-pointer">
            <div className="flex items-start gap-4">
              <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${report.color}`}>
                {report.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-1">{report.title}</h3>
                <p className="text-sm text-muted-foreground">{report.description}</p>
              </div>
              <button className="fv-btn fv-btn--secondary text-sm">
                <Download className="h-4 w-4" />
                Export
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExpensesPieChart data={mockExpensesByCategory} />
        <ActivityChart data={mockActivityData} />
      </div>
    </div>
  );
}
