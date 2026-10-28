export type PaymentMethod = 'Efectivo' | 'Transferencia' | 'Tarjeta' | 'Fiado';

export type PaymentStatus =
  | 'Pendiente'
  | 'Aprobado'
  | 'Rechazado'
  | 'Cancelado'
  | 'Reembolsado';

export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  cost?: number;
  stock: number;
  minStock: number;
};

export type BusinessProfile = {
  id: string;
  name: string;
  giro: string;
  city: string;
  phone: string;
  currency: string;
  logoText: string;
  logoUri: string;
  primaryColor: string;
  openHours: string;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  note: string;
};

export type Debt = {
  id: string;
  customerName: string;
  amount: number;
  status: 'Pendiente' | 'Parcial' | 'Pagada';
};

export type SaleItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type Sale = {
  id: string;
  folio: string;
  customerName?: string;
  items: SaleItem[];
  paymentMethod: PaymentMethod;
  status:
    | 'Borrador'
    | 'Pendiente de pago'
    | 'Pagada'
    | 'Fiada'
    | 'Parcial'
    | 'Cancelada'
    | 'Reembolsada'
    | 'Devuelta';
  total: number;
  createdAt: string;
};

export type Payment = {
  id: string;
  saleId: string;
  method: PaymentMethod | 'Mercado Pago Point';
  amount: number;
  status: PaymentStatus;
  reference?: string;
};

export type TicketSettings = {
  businessName: string;
  logoText: string;
  footer: string;
  showPhone: boolean;
  showAddress: boolean;
  includeMicroAppBrand: boolean;
};

export type AutomationSettings = {
  lowStockAlerts: boolean;
  debtReminders: boolean;
  dailyCutReminder: boolean;
  reminderHour: string;
};

export type BackupSettings = {
  cloudBackup: boolean;
  exportReminder: boolean;
  lastBackupAt?: string;
};

export type PointConfig = {
  provider: 'Mercado Pago Point';
  mode: 'sandbox' | 'production';
  terminalId: string;
  externalStoreId: string;
  webhookUrl: string;
  accessTokenMasked: string;
  hasAccessToken: boolean;
  accountAlias: string;
  status: 'Vinculada' | 'Pendiente' | 'Inactiva';
};

export type PointTutorialStep = {
  title: string;
  text: string;
};

export type AccountPlan = {
  userId: string;
  activePlan: 'Gratis' | 'Pro' | 'Negocio';
  isProActive: boolean;
  isBusinessActive: boolean;
  billingCycleDays: number;
  currentPeriodStartedAt?: string;
  currentPeriodEndsAt?: string;
  proPurchasedAt?: string;
  businessPurchasedAt?: string;
  autoRenew: boolean;
  daysRemaining: number;
  renewalDue: boolean;
  updatedAt: string;
};

export type BotSettings = {
  id: string;
  enabled: boolean;
  channel: string;
  pageName: string;
  connectedAccount: string;
  defaultReply: string;
  businessTone: string;
  autoDebtMessages: boolean;
  debtThreshold: number;
  reminderEveryDays: number;
  reminderHour: string;
  requireHumanReview: boolean;
  facebookAppConnected: boolean;
  pagesPermission: boolean;
  messengerPermission: boolean;
  leadsPermission: boolean;
  appConnectionStatus: 'Permisos pendientes' | 'Permisos incompletos' | 'Conectado';
  updatedAt: string;
};

export type ProTrialStatus = {
  status: 'Inactiva' | 'Activa' | 'Expirada';
  unlockedAt?: string;
  expiresAt?: string;
  daysRemaining: number;
};

export type UsageStatus = {
  today: string;
  onlineSecondsToday: number;
  currentStreakDays: number;
  requiredStreakDays: number;
  proTrial: ProTrialStatus;
  justUnlockedTrial: boolean;
};

export type Movement = {
  id: string;
  title: string;
  detail: string;
  time: string;
  type:
    | 'Venta'
    | 'Inventario'
    | 'Deuda'
    | 'Cliente'
    | 'Reserva'
    | 'Liberacion'
    | 'Devolucion'
    | 'Merma';
};

export type LinkedTerminal = {
  id: string;
  businessId: string;
  provider: 'Mercado Pago Point';
  terminalId: string;
  name: string;
  status: 'Vinculada' | 'Pendiente' | 'Inactiva';
};
