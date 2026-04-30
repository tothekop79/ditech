export type StoreRegion = 'BANGKOK' | 'UPC';
export type PlanReadiness = 'PENDING' | 'NOT_READY' | 'READY' | 'ON_HOLD';
export type PlanStatus = 'DRAFT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface Customer { id: string; customerCode: string; customerName: string; }
export interface Department { id: string; departmentCode: string; departmentName: string; }
export interface Team { id: string; name: string; region: StoreRegion; dailyCap: number; telegramChatId?: string; }

export interface InstallationPlan {
  id: string;
  customerId: string;
  customer: Customer;
  departmentId: string;
  department: Department;
  storeName: string;
  storeRegion: StoreRegion;
  province?: string;
  description: string;
  sensorCount: number;
  durationDays: number;
  readiness: PlanReadiness;
  detail?: string;
  scheduledDate?: string;
  completedDate?: string;
  planStatus: PlanStatus;
  teamId?: string;
  team?: Team;
  createdAt: string;
  updatedAt: string;
}

export interface CapacityData {
  date: string;
  bkkUsed: number; bkkCap: number;
  upcUsed: number; upcCap: number;
  total: number; totalCap: number;
  overflow: boolean;
}

export interface ConflictTeamOverload { type: 'team-overload'; date: string; teamId: string; teamName: string; plans: { id: string; storeName: string }[]; }
export interface ConflictRegionOverload { type: 'region-overload'; date: string; region: string; used: number; cap: number; }
export interface ConflictNotReady { type: 'not-ready-soon'; plan: { id: string; storeName: string; scheduledDate: string; detail?: string; readiness: string }; daysUntil: number; }
export interface ConflictNoTeam { type: 'no-team'; plan: { id: string; storeName: string; scheduledDate: string; province?: string }; }
export type Conflict = ConflictTeamOverload | ConflictRegionOverload | ConflictNotReady | ConflictNoTeam;

export interface NotificationRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: string;
  triggerTime?: string;
  triggerDay?: string;
  triggerCondition?: string;
  daysAhead?: number;
  recipients: string[];
}

export interface NotificationLog {
  id: string;
  recipient: string;
  body: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  sentAt?: string;
  errorMessage?: string;
  createdAt: string;
  rule?: { name: string };
}
