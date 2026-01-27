// FarmVault Type Definitions

export type CropType = 'tomatoes' | 'french-beans' | 'capsicum' | 'maize' | 'watermelons' | 'rice';

export type UserRole = 'developer' | 'company-admin' | 'manager' | 'broker' | 'employee';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string | null;
  avatar?: string;
  createdAt: Date;
}

export interface Company {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'pending';
  plan: 'starter' | 'professional' | 'enterprise';
  userCount: number;
  projectCount: number;
  revenue: number;
  createdAt: Date;
}

export interface Project {
  id: string;
  name: string;
  companyId: string;
  cropType: CropType;
  status: 'planning' | 'active' | 'completed' | 'archived';
  startDate: Date;
  endDate?: Date;
  location: string;
  acreage: number;
  budget: number;
  createdAt: Date;
  plantingDate?: Date;
  startingStageIndex?: number;
  // Optional planning metadata
  seedVariety?: string;
  planNotes?: string;
  planning?: {
    seed?: {
      name: string;
      variety?: string;
      supplier?: string;
      batchNumber?: string;
    };
    expectedChallenges?: {
      id: string;
      description: string;
      addedAt: Date;
      addedBy: string;
    }[];
    planHistory?: {
      field: string;
      oldValue: any;
      newValue: any;
      reason: string;
      changedAt: Date;
      changedBy: string;
    }[];
  };
}

export interface CropStage {
  id: string;
  projectId: string;
  companyId: string;
  cropType: CropType;
  // Generated stage name and index from cropStageConfig
  stageName: string;
  stageIndex: number;
  startDate?: Date;
  endDate?: Date;
  status: 'pending' | 'in-progress' | 'completed';
  notes?: string;
  recalculated?: boolean;
  recalculatedAt?: Date;
  recalculationReason?: string;
}

// --- Core Operational / Financial / Inventory Models ---

export type ExpenseCategory =
  | 'labour'
  | 'fertilizer'
  | 'chemical'
  | 'fuel'
  | 'other';

export interface Expense {
  id: string;
  companyId: string;
  projectId?: string;
  cropType?: CropType;

  category: ExpenseCategory;
  description: string;
  amount: number;
  date: Date;

  // Stage linkage for analytics
  stageIndex?: number;
  stageName?: string;

  // Work log sync metadata
  syncedFromWorkLogId?: string;
  synced?: boolean;

  // Payment / reconciliation
  paid?: boolean;
  paidAt?: Date;
  paidBy?: string;
  paidByName?: string;

  createdAt: Date;
}

export type InventoryCategory = 'fertilizer' | 'chemical' | 'diesel' | 'materials';

export interface InventoryItem {
  id: string;
  companyId: string;

  name: string;
  category: InventoryCategory;

  quantity: number;
  unit: string;
  pricePerUnit?: number;

   // Scope: which crops/projects this item is intended for
  // 'project'  -> only for a specific project/season
  // 'crop'     -> for all projects of a given crop
  // 'all'      -> any crop/project (general stock)
  scope?: 'project' | 'crop' | 'all';
  // Either a specific crop type or 'all' for general-purpose stock
  cropType?: CropType | 'all';

  supplierId?: string;
  // Optional denormalised supplier name for UI
  supplierName?: string;

  // Threshold for low stock alerts (default to 10 if undefined)
  minThreshold?: number;

  lastUpdated: Date;
  createdAt?: Date;
}

export interface WorkLog {
  id: string;
  projectId: string;
  companyId: string;
  cropType: CropType;

  stageIndex: number;
  stageName: string;

  date: Date;
  workCategory: string;

  numberOfPeople: number;
  ratePerPerson?: number;

  chemicals?: {
    inventoryItemId: string;
    quantity: number;
    unit: string;
    drumsSprayed?: number;
  };

  fertilizer?: {
    inventoryItemId: string;
    quantity: number;
    unit: string;
  };

  fuel?: {
    inventoryItemId: string;
    quantity: number;
    unit: string;
  };

  notes?: string;

  managerId?: string;
  adminName?: string;

  paid?: boolean;
  paidAt?: Date;
  paidBy?: string;

  createdAt: Date;
}

export interface InventoryUsage {
  id: string;
  companyId: string;
  projectId: string;

  inventoryItemId: string;
  category: InventoryCategory;

  quantity: number;
  unit: string;

  source: 'workLog' | 'manual-adjustment';
  workLogId?: string;

  stageIndex?: number;
  stageName?: string;

  date: Date;
  createdAt: Date;
}

export interface InventoryPurchase {
  id: string;
  companyId: string;

  inventoryItemId: string;
  quantityAdded: number;
  unit: string;

  totalCost: number;
  pricePerUnit?: number;

  projectId?: string;

  date: Date;
  expenseId?: string;

  createdAt: Date;
}

export interface Harvest {
  id: string;
  projectId: string;
  companyId: string;
  cropType: CropType;
  date: Date;
  quantity: number;
  unit: string;
  quality: 'A' | 'B' | 'C';
  notes?: string;
}

export interface Sale {
  id: string;
  projectId: string;
  companyId: string;
  cropType: CropType;
  harvestId: string;
  buyerName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  date: Date;
  status: 'pending' | 'completed' | 'cancelled';
}

export interface Supplier {
  id: string;
  companyId: string;
  name: string;
  contact: string;
  email?: string;
  category: string;
  rating: number;
  status: 'active' | 'inactive';
}

export interface Employee {
  id: string;
  companyId: string;
  name: string;
  role: string;
  department: string;
  contact: string;
  status: 'active' | 'on-leave' | 'inactive';
  joinDate: Date;
}

export interface SeasonChallenge {
  id: string;
  projectId: string;
  companyId: string;
  cropType: CropType;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  status: 'identified' | 'mitigating' | 'resolved';
  dateIdentified: Date;
  dateResolved?: Date;
}

export interface DashboardStats {
  totalExpenses: number;
  totalHarvest: number;
  totalSales: number;
  netBalance: number;
  activeProjects: number;
  pendingOperations: number;
}

export interface NavItem {
  title: string;
  href: string;
  icon: string;
  badge?: string | number;
}
