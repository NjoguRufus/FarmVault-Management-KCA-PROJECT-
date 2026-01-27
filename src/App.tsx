import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { MainLayout } from "@/components/layout/MainLayout";
import { CompanyDashboard } from "@/pages/dashboard/CompanyDashboard";
import { DeveloperDashboard } from "@/pages/dashboard/DeveloperDashboard";
import ProjectsPage from "@/pages/ProjectsPage";
import NewProjectPage from "@/pages/NewProjectPage";
import ProjectDetailsPage from "@/pages/ProjectDetailsPage";
import ProjectPlanningPage from "@/pages/ProjectPlanningPage";
import CropStagesPage from "@/pages/CropStagesPage";
import ExpensesPage from "@/pages/ExpensesPage";
import OperationsPage from "@/pages/OperationsPage";
import InventoryPage from "@/pages/InventoryPage";
import HarvestSalesPage from "@/pages/HarvestSalesPage";
import SuppliersPage from "@/pages/SuppliersPage";
import SeasonChallengesPage from "@/pages/SeasonChallengesPage";
import EmployeesPage from "@/pages/EmployeesPage";
import ReportsPage from "@/pages/ReportsPage";
import BillingPage from "@/pages/BillingPage";
import SupportPage from "@/pages/SupportPage";
import FeedbackPage from "@/pages/FeedbackPage";
import NotFound from "./pages/NotFound";
import Index from "@/pages/Index";
import LoginPage from "@/pages/Auth/LoginPage";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RequireDeveloper } from "@/components/auth/RequireDeveloper";
import SetupCompany from "@/pages/SetupCompany";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminCompaniesPage from "@/pages/admin/AdminCompaniesPage";
import AdminUsersPage from "@/pages/admin/AdminUsersPage";
import AdminPendingUsersPage from "@/pages/admin/AdminPendingUsersPage";
import AdminAuditLogsPage from "@/pages/admin/AdminAuditLogsPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ProjectProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/setup-company" element={<SetupCompany />} />
              <Route path="/setup" element={<Navigate to="/setup-company" replace />} />

              {/* Protected app routes (company-level) */}
              <Route
                element={
                  <RequireAuth>
                    <MainLayout />
                  </RequireAuth>
                }
              >
                <Route path="/dashboard" element={<CompanyDashboard />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/projects/new" element={<NewProjectPage />} />
                <Route path="/projects/:projectId" element={<ProjectDetailsPage />} />
                <Route path="/projects/:projectId/planning" element={<ProjectPlanningPage />} />
                <Route path="/crop-stages" element={<CropStagesPage />} />
                <Route path="/expenses" element={<ExpensesPage />} />
                <Route path="/operations" element={<OperationsPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/harvest-sales" element={<HarvestSalesPage />} />
                <Route path="/suppliers" element={<SuppliersPage />} />
                <Route path="/challenges" element={<SeasonChallengesPage />} />
                <Route path="/employees" element={<EmployeesPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/billing" element={<BillingPage />} />
                <Route path="/support" element={<SupportPage />} />
                <Route path="/feedback" element={<FeedbackPage />} />
              </Route>

              {/* Developer-only routes under /admin */}
              <Route
                element={
                  <RequireDeveloper>
                    <MainLayout />
                  </RequireDeveloper>
                }
              >
                {/* Backwards-compatible redirect from old /developer path */}
                <Route path="/developer" element={<Navigate to="/admin" replace />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/companies" element={<AdminCompaniesPage />} />
                <Route path="/admin/users" element={<AdminUsersPage />} />
                <Route path="/admin/users/pending" element={<AdminPendingUsersPage />} />
                <Route path="/admin/audit-logs" element={<AdminAuditLogsPage />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ProjectProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
