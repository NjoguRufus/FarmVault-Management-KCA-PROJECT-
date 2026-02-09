// FarmVault Type Definitions

export type CropType = 'tomatoes' | 'french-beans' | 'capsicum' | 'maize' | 'watermelons' | 'rice';

export type UserRole = 'developer' | 'company-admin' | 'manager' | 'broker' | 'employee';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  // Optional fine-grained employee role, e.g. 'operations-manager', 'sales-broker', 'logistics-driver'
  employeeRole?: string;
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
  /** Custom work types (e.g. "Pruning", "Staking") added by the company */
  customWorkTypes?: string[];
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
  /** When false, project doc exists but stages are still being created; show "Creating project..." on list. */
  setupComplete?: boolean;
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
  | 'other'
  // Broker market expense categories
  | 'space'
  | 'watchman'
  | 'ropes'
  | 'carton'
  | 'offloading_labour'
  | 'onloading_labour'
  | 'broker_payment';

export interface Expense {
  id: string;
  companyId: string;
  projectId?: string;
  cropType?: CropType;
  harvestId?: string; // For broker expenses linked to a harvest

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

  /** When expense was created from a work card (mark as paid) */
  workCardId?: string;

  // Payment / reconciliation
  paid?: boolean;
  paidAt?: Date;
  paidBy?: string;
  paidByName?: string;

  createdAt: Date;
}

export const BROKER_EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'space', label: 'Crates Space' },
  { value: 'watchman', label: 'Watchman' },
  { value: 'ropes', label: 'Ropes' },
  { value: 'carton', label: 'Carton' },
  { value: 'offloading_labour', label: 'Offloading Labour' },
  { value: 'onloading_labour', label: 'Onloading Labour' },
  { value: 'broker_payment', label: 'Broker Payment' },
  { value: 'other', label: 'Other' },
];

export type InventoryCategory =
  | 'fertilizer'
  | 'chemical'
  | 'fuel'
  | 'diesel'
  | 'materials'
  | 'sacks'
  | 'ropes'
  | 'wooden-crates'
  | 'seeds';

/** Chemical: box (with units per box) or single products */
export type ChemicalPackagingType = 'box' | 'single';

/** Fuel sub-type when category is fuel */
export type FuelType = 'diesel' | 'petrol';

export interface InventoryCategoryItem {
  id: string;
  name: string;
  companyId: string;
  createdAt: Date;
}

export interface InventoryItem {
  id: string;
  companyId: string;

  name: string;
  category: InventoryCategory;

  quantity: number;
  unit: string;
  pricePerUnit?: number;

  // --- Chemical: packaging and total units ---
  /** When category is chemical: 'box' or 'single' */
  packagingType?: ChemicalPackagingType;
  /** When chemical and box: bottles/packets per box. Total units = quantity * unitsPerBox */
  unitsPerBox?: number;

  // --- Fuel: diesel/petrol, containers (mtungi), litres ---
  /** When category is fuel: diesel or petrol */
  fuelType?: FuelType;
  /** Number of containers (mtungi) */
  containers?: number;
  /** Litres (optional) */
  litres?: number;

  // --- Fertilizer: bags, kgs optional ---
  /** When category is fertilizer: primary quantity in bags */
  bags?: number;
  /** Optional weight in kg */
  kgs?: number;

  // --- Wooden crates (boxes): big or small ---
  /** When category is wooden-crates: box size for harvest/display */
  boxSize?: 'big' | 'small';

  // Legacy scope fields kept for backwards compatibility.
  // New items should use `cropTypes` instead.
  scope?: 'project' | 'crop' | 'all';
  cropType?: CropType | 'all';
  cropTypes?: CropType[];

  supplierId?: string;
  supplierName?: string;
  /** Date when item was picked up from supplier (e.g. for seeds) */
  pickupDate?: string;
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
  // Optional high-level work type, e.g. Spraying, Fertilizer application, etc.
  workType?: string;

  numberOfPeople: number;
  ratePerPerson?: number;
  totalPrice?: number; // Auto-calculated: numberOfPeople * ratePerPerson

  employeeId?: string; // Primary employee assigned (for backward compatibility)
  employeeIds?: string[]; // Multiple employees assigned to manage and deliver this work
  employeeName?: string; // Denormalized for easier display (comma-separated if multiple)

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
  // Free-text description of inputs used (spraying, fertilizer application, etc.)
  inputsUsed?: string;
  /** When work type is Watering: number of containers used */
  wateringContainersUsed?: number;
  /** When work type is Tying of crops: whether they used ropes or sacks */
  tyingUsedType?: 'ropes' | 'sacks';
  changeReason?: string; // Reason for changing work mid-way

  managerId?: string;
  managerName?: string; // Denormalized manager name for easier display
  adminName?: string;

  paid?: boolean;
  paidAt?: Date;
  paidBy?: string;
  // Admin/manager coordination metadata
  origin?: 'admin' | 'manager'; // Legacy: who created this log (new flow keeps a single log)
  parentWorkLogId?: string; // Legacy: for older manager logs that used a child document
  managerSubmissionStatus?: 'pending' | 'approved' | 'rejected';
  managerSubmittedAt?: Date;
  // Manager-submitted values for confirmation (do NOT change admin's original plan fields)
  managerSubmittedNumberOfPeople?: number;
  managerSubmittedRatePerPerson?: number;
  managerSubmittedTotalPrice?: number;
  managerSubmittedNotes?: string;
  managerSubmittedInputsUsed?: string;
  managerSubmittedWorkType?: string;
  approvedBy?: string;
  approvedByName?: string;

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

  source: 'workLog' | 'manual-adjustment' | 'workCard';
  workLogId?: string;
  workCardId?: string;
  /** Manager assigned (when source is workCard). */
  managerName?: string;

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

  // Destination of this harvest: sold directly from farm or sent to market
  destination?: 'farm' | 'market';

  // Farm-side pricing metadata (optional)
  farmPricingMode?: 'perUnit' | 'total';
  // Unit used for farm pricing: crate types or kg
  farmPriceUnitType?: 'crate-big' | 'crate-small' | 'kg';
  farmUnitPrice?: number;
  farmTotalPrice?: number;

  // Market-side metadata
  marketName?: string;
  brokerId?: string;
  brokerName?: string;
  // Transport to market (can be more than one lorry)
  lorryPlate?: string;
  lorryPlates?: string[];
  driverId?: string;
  driverName?: string;
}

export interface Sale {
  id: string;
  projectId: string;
  companyId: string;
  cropType: CropType;
  harvestId: string;
  buyerName: string;
  quantity: number;
  // Optional unit for the quantity, e.g. "kg", "crate-big", "crate-small"
  unit?: string;
  unitPrice: number;
  totalAmount: number;
  date: Date;
  status: 'pending' | 'partial' | 'completed' | 'cancelled';
  brokerId?: string; // ID of the broker who made the sale
  amountPaid?: number; // When status is 'partial', amount already paid (remainder = totalAmount - amountPaid)
}

export interface Supplier {
  id: string;
  companyId: string;
  name: string;
  contact: string;
  email?: string;
  /** Single category (legacy); use categories when present */
  category?: string;
  /** Multiple categories this supplier can provide */
  categories?: string[];
  rating: number;
  status: 'active' | 'inactive';
  /** Short notes for future reference (review section) */
  reviewNotes?: string;
}

export interface Employee {
  id: string;
  companyId: string;
  name: string;
  role: string; // e.g., 'operations-manager', 'logistics-driver', 'sales-broker', 'truck_driver'
  department: string;
  contact: string;
  status: 'active' | 'on-leave' | 'inactive';
  joinDate: Date;
}

export interface Delivery {
  id: string;
  projectId: string;
  companyId: string;
  harvestId: string;
  driverId?: string; // Employee ID of the driver
  from: string; // Origin location
  to: string; // Destination location
  quantity: number;
  unit: string;
  status: 'pending' | 'in-transit' | 'delivered' | 'cancelled';
  distance?: number; // Distance in km
  fuelUsed?: number; // Fuel used in liters
  startedAt?: Date;
  completedAt?: Date;
  date: Date;
  notes?: string;
  createdAt: Date;
}

export type ChallengeType = 'weather' | 'pests' | 'diseases' | 'prices' | 'labor' | 'equipment' | 'other';

export interface SeasonChallenge {
  id: string;
  projectId: string;
  companyId: string;
  cropType: CropType;
  title: string;
  description: string;
  challengeType?: ChallengeType; // Type of challenge (weather, pests, prices, etc.)
  stageIndex?: number; // Link to crop stage
  stageName?: string; // Denormalized stage name
  severity: 'low' | 'medium' | 'high';
  status: 'identified' | 'mitigating' | 'resolved';
  dateIdentified: Date;
  dateResolved?: Date;
  // Detailed resolution information
  whatWasDone?: string; // What actions were taken to resolve
  itemsUsed?: Array<{
    // Either inventoryItemId (if exists in inventory) or itemName (if needs to be purchased)
    inventoryItemId?: string;
    itemName: string; // Name of the item (required)
    category: InventoryCategory; // Category of the item
    quantity: number;
    unit: string;
    needsPurchase?: boolean; // True if item doesn't exist in inventory
  }>;
  plan2IfFails?: string; // Backup plan if current solution fails
  createdAt?: Date;
  updatedAt?: Date;
}

// Items that need to be purchased (derived from challenges)
export interface NeededItem {
  id: string;
  companyId: string;
  projectId?: string;
  itemName: string;
  category: InventoryCategory;
  quantity: number;
  unit: string;
  sourceChallengeId?: string; // ID of the challenge that created this need
  sourceChallengeTitle?: string; // Denormalized challenge title
  status: 'pending' | 'ordered' | 'received';
  createdAt: Date;
  updatedAt?: Date;
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

// --- Code Red (urgent developer–admin communication, e.g. data recovery) ---

export type CodeRedStatus = 'open' | 'resolved';

export interface CodeRedRequest {
  id: string;
  companyId: string;
  companyName: string;
  requestedBy: string;   // userId
  requestedByName: string;
  requestedByEmail: string;
  message: string;
  status: CodeRedStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CodeRedMessage {
  id: string;
  from: string;       // userId
  fromName: string;
  fromRole: string;   // 'developer' | 'company-admin' etc.
  body: string;
  createdAt: Date;
}

// --- Operations Work Cards (Admin creates, Manager submits execution only) ---

export type WorkCardStatus = 'planned' | 'submitted' | 'approved' | 'rejected' | 'paid';

export interface WorkCardPlanned {
  date: Date | unknown;
  workers: number;
  inputs?: string;
  fuel?: string;
  chemicals?: string;
  fertilizer?: string;
  estimatedCost?: number;
}

export interface WorkCardActual {
  submitted: boolean;
  managerId?: string;
  managerName?: string;
  actualDate?: Date | unknown;
  actualWorkers?: number;
  /** Price per person (KES). Total labour = actualWorkers * ratePerPerson; expense created when marked as paid. */
  ratePerPerson?: number;
  actualInputsUsed?: string;
  actualFuelUsed?: string;
  actualChemicalsUsed?: string;
  actualFertilizerUsed?: string;
  notes?: string;
  /** For inventory deduction on approve: item and quantities used (one resource per card) */
  actualResourceItemId?: string;
  actualResourceQuantity?: number;
  actualResourceQuantitySecondary?: number;
  submittedAt?: Date | unknown;
  /** Optional: version history entries for resubmissions */
  actualHistory?: Array<{
    actualWorkers?: number;
    actualInputsUsed?: string;
    actualFuelUsed?: string;
    actualChemicalsUsed?: string;
    actualFertilizerUsed?: string;
    notes?: string;
    submittedAt: Date | unknown;
  }>;
}

export interface WorkCardPayment {
  isPaid: boolean;
  paidAt?: Date | unknown;
  paidBy?: string;
}

export interface OperationsWorkCard {
  id: string;
  companyId: string;
  projectId: string;
  stageId: string;
  stageName?: string;
  workTitle: string;
  workCategory: string;

  planned: WorkCardPlanned;
  actual: WorkCardActual;
  payment: WorkCardPayment;
  status: WorkCardStatus;

  allocatedManagerId: string | null;
  createdByAdminId: string;
  createdAt: Date | unknown;
  /** Set when status = approved */
  approvedBy?: string;
  approvedAt?: Date | unknown;
  /** Set when status = rejected */
  rejectionReason?: string;
}
