import type {
  AutomationSettings,
  AccountPlan,
  BackupSettings,
  BotSettings,
  BusinessProfile,
  Customer,
  Debt,
  Movement,
  PaymentMethod,
  PointConfig,
  PointTutorialStep,
  Product,
  Sale,
  TicketSettings,
  UsageStatus,
} from '../types';

const API_BASE_URL = 'http://localhost:4001';

type BootstrapPayload = {
  businessProfile: BusinessProfile;
  products: Product[];
  customers: Customer[];
  debts: Debt[];
  sales: Sale[];
  movements: Movement[];
  ticketSettings: TicketSettings;
  automationSettings: AutomationSettings;
  backupSettings: BackupSettings;
  pointConfig: PointConfig;
  usageStatus: UsageStatus;
  accountPlan: AccountPlan;
  botSettings: BotSettings;
};

type SalePayload = {
  id?: string;
  folio?: string;
  customerName?: string;
  paymentMethod: PaymentMethod;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = `Error ${response.status}`;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const api = {
  async bootstrap() {
    return request<BootstrapPayload>('/api/bootstrap');
  },

  async saveBusinessProfile(profile: Omit<BusinessProfile, 'id'>) {
    return request<BusinessProfile>('/api/business-profile', {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
  },

  async saveProduct(product: Product) {
    return request<Product>('/api/products', {
      method: 'POST',
      body: JSON.stringify(product),
    });
  },

  async saveCustomer(customer: Customer) {
    return request<Customer>('/api/customers', {
      method: 'POST',
      body: JSON.stringify(customer),
    });
  },

  async saveDebt(debt: Debt) {
    return request<Debt>('/api/debts', {
      method: 'POST',
      body: JSON.stringify(debt),
    });
  },

  async createSale(sale: SalePayload) {
    return request<{
      sale: Sale;
      products: Product[];
      debts: Debt[];
      movements: Movement[];
    }>('/api/sales', {
      method: 'POST',
      body: JSON.stringify(sale),
    });
  },

  async exportInventoryCsv() {
    const response = await fetch(`${API_BASE_URL}/api/export/inventory.csv`);
    if (!response.ok) {
      throw new Error('No se pudo exportar el inventario.');
    }
    return response.text();
  },

  async saveTicketSettings(settings: TicketSettings) {
    return request<TicketSettings>('/api/ticket-settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  async saveAutomationSettings(settings: AutomationSettings) {
    return request<AutomationSettings>('/api/automation-settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  async saveBotSettings(settings: BotSettings) {
    return request<BotSettings>('/api/bot-settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  async saveBackupSettings(settings: Omit<BackupSettings, 'lastBackupAt'>) {
    return request<BackupSettings>('/api/backup-settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  async runBackup() {
    return request<{ ok: boolean; file: string; backupSettings: BackupSettings }>(
      '/api/backup/run',
      {
        method: 'POST',
      },
    );
  },

  async getPointTutorial() {
    return request<PointTutorialStep[]>('/api/point/tutorial');
  },

  async savePointConfig(config: {
    mode: 'sandbox' | 'production';
    terminalId: string;
    externalStoreId: string;
    webhookUrl: string;
    accessToken: string;
    accountAlias: string;
  }) {
    return request<{ config: PointConfig; errors: string[] }>('/api/point/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },

  async previewPointOrder(amount: number, folio: string) {
    return request<{
      saleStatus: string;
      inventoryPolicy: string;
      orderPayload: Record<string, unknown>;
    }>('/api/point/orders/preview', {
      method: 'POST',
      body: JSON.stringify({ amount, folio }),
    });
  },

  async trackUsage(activeSeconds: number) {
    return request<UsageStatus>('/api/usage/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ activeSeconds }),
    });
  },

};
