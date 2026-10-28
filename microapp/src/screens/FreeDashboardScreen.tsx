import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  Animated,
  Image as RNImage,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ArrowLeft,
  BadgeDollarSign,
  Bell,
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Gift,
  Home,
  Image as ImageIcon,
  Info,
  Landmark,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Package,
  Plus,
  ReceiptText,
  ScanBarcode,
  Search,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Trash2,
  UserRound,
  Users,
  Wallet,
  X,
  type LucideProps,
} from 'lucide-react-native';
import type {
  AccountPlan,
  AutomationSettings,
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
import { api } from '../services/api';
import { appFonts } from '../theme/typography';
import { pickInventoryProducts, type ImportedProduct } from '../utils/inventoryImport';
import { pickImageDataUri } from '../utils/imagePicker';

type IconComponent = ComponentType<LucideProps>;
type TabKey = 'inicio' | 'ventas' | 'inventario' | 'clientes' | 'mas';
type ViewKey =
  | TabKey
  | 'addProduct'
  | 'addCustomer'
  | 'addDebt'
  | 'newSale'
  | 'productDetail'
  | 'lowStock'
  | 'businessSettings'
  | 'pointSetup'
  | 'automationSettings'
  | 'ticketSettings'
  | 'backupSettings'
  | 'plans'
  | 'botSettings'
  | 'inventoryTransfer';

type CartItem = {
  productId: string;
  quantity: number;
};

type SaleBanner = {
  folio: string;
};

type FreeDashboardScreenProps = {
  businessName: string;
  initialGiro: string;
  initialLogoUri: string;
  initialProducts: Product[];
};

const BLUE = '#075CFF';
const NAVY = '#071344';
const MUTED = '#667085';

const defaultAutomationSettings: AutomationSettings = {
  dailyCutReminder: false,
  debtReminders: false,
  lowStockAlerts: false,
  reminderHour: '18:00',
};

const defaultBackupSettings: BackupSettings = {
  cloudBackup: false,
  exportReminder: true,
};

const defaultPointConfig: PointConfig = {
  accessTokenMasked: '',
  accountAlias: '',
  externalStoreId: '',
  hasAccessToken: false,
  mode: 'sandbox',
  provider: 'Mercado Pago Point',
  status: 'Pendiente',
  terminalId: '',
  webhookUrl: '',
};

const defaultTicketSettings: TicketSettings = {
  businessName: 'Mi negocio',
  footer: 'Gracias por tu compra',
  includeMicroAppBrand: false,
  logoText: '',
  showAddress: false,
  showPhone: true,
};

const defaultUsageStatus: UsageStatus = {
  currentStreakDays: 0,
  justUnlockedTrial: false,
  onlineSecondsToday: 0,
  proTrial: {
    daysRemaining: 0,
    status: 'Inactiva',
  },
  requiredStreakDays: 15,
  today: '',
};

const defaultAccountPlan: AccountPlan = {
  activePlan: 'Negocio',
  autoRenew: true,
  billingCycleDays: 30,
  businessPurchasedAt: '',
  currentPeriodEndsAt: '',
  currentPeriodStartedAt: '',
  daysRemaining: 30,
  isBusinessActive: true,
  isProActive: false,
  renewalDue: false,
  updatedAt: '',
  userId: 'main',
};

const defaultBotSettings: BotSettings = {
  appConnectionStatus: 'Permisos pendientes',
  autoDebtMessages: false,
  businessTone: 'Claro, amable y profesional',
  channel: 'Mensajes del negocio',
  connectedAccount: '',
  debtThreshold: 300,
  defaultReply: 'Hola, gracias por escribir. Enseguida revisamos tu mensaje.',
  enabled: false,
  facebookAppConnected: false,
  id: 'main',
  leadsPermission: false,
  messengerPermission: false,
  pageName: '',
  pagesPermission: false,
  reminderEveryDays: 7,
  reminderHour: '10:00',
  requireHumanReview: true,
  updatedAt: '',
};

const includedPlanLabel = 'Gratis con Pro $99 incluido';
const businessPlanLabel = 'Negocio $199';

const tabs: Array<{ key: TabKey; label: string; icon: IconComponent }> = [
  { key: 'inicio', label: 'Inicio', icon: Home },
  { key: 'ventas', label: 'Vender', icon: ShoppingCart },
  { key: 'inventario', label: 'Inventario', icon: Box },
  { key: 'clientes', label: 'Clientes', icon: Users },
  { key: 'mas', label: 'Mas', icon: MoreHorizontal },
];

const paymentMethods: Array<{ label: PaymentMethod; icon: IconComponent }> = [
  { label: 'Efectivo', icon: Wallet },
  { label: 'Transferencia', icon: Landmark },
  { label: 'Tarjeta', icon: CreditCard },
  { label: 'Fiado', icon: UserRound },
];

const avatarColors = ['#EAF1FF', '#F3F6FF', '#EEFDF3', '#FFF3E8'];

function currency(value: number) {
  return `$${value.toLocaleString('es-MX')}`;
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1000)}`;
}

function makeSaleFolio(index: number) {
  return `V-${String(index + 1).padStart(6, '0')}`;
}

function stockStatus(product: Product) {
  if (product.stock <= 0) {
    return 'Agotado';
  }
  if (product.stock <= product.minStock) {
    return 'Bajo stock';
  }
  return 'Activo';
}

export function FreeDashboardScreen({
  businessName,
  initialGiro,
  initialLogoUri,
  initialProducts,
}: FreeDashboardScreenProps) {
  const initialProfile: BusinessProfile = {
    city: '',
    currency: 'MXN',
    giro: initialGiro || 'General',
    id: 'main',
    logoText: '',
    logoUri: initialLogoUri,
    name: businessName || 'Mi negocio',
    openHours: '',
    phone: '',
    primaryColor: BLUE,
  };
  const [activeView, setActiveView] = useState<ViewKey>('inicio');
  const [profile, setProfile] = useState<BusinessProfile>(initialProfile);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [ticketSettings, setTicketSettings] =
    useState<TicketSettings>(defaultTicketSettings);
  const [automationSettings, setAutomationSettings] =
    useState<AutomationSettings>(defaultAutomationSettings);
  const [backupSettings, setBackupSettings] =
    useState<BackupSettings>(defaultBackupSettings);
  const [pointConfig, setPointConfig] =
    useState<PointConfig>(defaultPointConfig);
  const [pointTutorial, setPointTutorial] = useState<PointTutorialStep[]>([]);
  const [usageStatus, setUsageStatus] =
    useState<UsageStatus>(defaultUsageStatus);
  const [accountPlan, setAccountPlan] =
    useState<AccountPlan>(defaultAccountPlan);
  const [botSettings, setBotSettings] =
    useState<BotSettings>(defaultBotSettings);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('Efectivo');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [notice, setNotice] = useState('');
  const [saleBanner, setSaleBanner] = useState<SaleBanner | null>(null);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timer = setTimeout(() => setNotice(''), 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let alive = true;

    const loadBackend = async () => {
      try {
        const data = await api.bootstrap();
        if (!alive) {
          return;
        }

        let nextProfile = data.businessProfile;
        if (
          (businessName &&
            businessName !== 'Mi negocio' &&
            data.businessProfile.name === 'Mi negocio') ||
          (initialGiro &&
            initialGiro !== 'General' &&
            data.businessProfile.giro === 'General') ||
          (initialLogoUri && !data.businessProfile.logoUri)
        ) {
          nextProfile = await api.saveBusinessProfile({
            ...data.businessProfile,
            giro:
              initialGiro && initialGiro !== 'General'
                ? initialGiro
                : data.businessProfile.giro,
            logoUri: initialLogoUri || data.businessProfile.logoUri,
            name: businessName || data.businessProfile.name,
          });
        }

        setProfile(nextProfile);
        setProducts(data.products.length ? data.products : initialProducts);
        setCustomers(data.customers);
        setDebts(data.debts);
        setSales(data.sales);
        setMovements(data.movements);
        setTicketSettings({
          ...data.ticketSettings,
          businessName: data.ticketSettings.businessName || nextProfile.name,
          logoText: data.ticketSettings.logoText || nextProfile.logoText,
        });
        setAutomationSettings(data.automationSettings);
        setBackupSettings(data.backupSettings);
        setPointConfig(data.pointConfig);
        setUsageStatus(data.usageStatus);
        setAccountPlan(data.accountPlan);
        setBotSettings(data.botSettings);

        if (!data.products.length && initialProducts.length) {
          initialProducts.forEach((product) => {
            void api.saveProduct(product).catch(() => undefined);
          });
        }
      } catch {
        setNotice('Backend no disponible. La app sigue en modo local.');
      }
    };

    void loadBackend();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let lastSeenAt = Date.now();

    const track = async () => {
      const currentSeenAt = Date.now();
      const documentRef = (globalThis as { document?: { hidden?: boolean } })
        .document;
      const visible =
        typeof documentRef === 'undefined' || !documentRef.hidden;
      const activeSeconds = visible
        ? Math.max(0, Math.round((currentSeenAt - lastSeenAt) / 1000))
        : 0;
      lastSeenAt = currentSeenAt;

      try {
        const status = await api.trackUsage(activeSeconds);
        if (!alive) {
          return;
        }

        setUsageStatus(status);
        if (status.justUnlockedTrial) {
          setNotice(`Tu prueba ${businessPlanLabel} de 30 dias ya esta activa.`);
        }
      } catch {
        // La app sigue funcionando aunque el tracking espere al backend.
      }
    };

    void track();
    const timer = setInterval(() => void track(), 60000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const lowProducts = products.filter((product) => stockStatus(product) !== 'Activo');
  const activeDebts = debts.filter((debt) => debt.status !== 'Pagada');
  const totalToday = sales.reduce((total, sale) => total + sale.total, 0);
  const activeTab: TabKey =
    activeView === 'newSale'
      ? 'ventas'
      : activeView === 'addProduct' || activeView === 'productDetail'
        ? 'inventario'
        : activeView === 'addCustomer' || activeView === 'addDebt'
          ? 'clientes'
          : activeView === 'lowStock'
            ? 'inventario'
          : activeView === 'businessSettings' ||
              activeView === 'pointSetup' ||
              activeView === 'automationSettings' ||
              activeView === 'ticketSettings' ||
              activeView === 'backupSettings' ||
              activeView === 'plans' ||
              activeView === 'botSettings' ||
              activeView === 'inventoryTransfer'
            ? 'mas'
            : activeView;
  const hasActiveSubscription =
    accountPlan.isProActive || accountPlan.isBusinessActive;

  const cartDetails = cart
    .map((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      if (!product) {
        return null;
      }

      return {
        product,
        quantity: item.quantity,
        subtotal: product.price * item.quantity,
      };
    })
    .filter(Boolean) as Array<{
      product: Product;
      quantity: number;
      subtotal: number;
    }>;
  const cartTotal = cartDetails.reduce((total, item) => total + item.subtotal, 0);

  const addMovement = (movement: Omit<Movement, 'id' | 'time'>) => {
    setMovements((current) => [
      {
        ...movement,
        id: makeId('mov'),
        time: 'ahora',
      },
      ...current,
    ]);
  };

  const openSale = () => {
    setActiveView('newSale');
  };

  const saveProduct = (product: Omit<Product, 'id'>) => {
    const nextProduct: Product = {
      ...product,
      id: makeId('prod'),
    };

    setProducts((current) => [nextProduct, ...current]);
    addMovement({
      title: 'Producto agregado',
      detail: `${nextProduct.name} entro con ${nextProduct.stock} unidades`,
      type: 'Inventario',
    });
    setNotice('Producto agregado al inventario.');
    setActiveView('inventario');
    void api.saveProduct(nextProduct).catch((error: Error) => {
      setNotice(`Producto local, backend pendiente: ${error.message}`);
    });
  };

  const saveImportedProducts = (importedProducts: ImportedProduct[]) => {
    const nextProducts = importedProducts.map((product) => ({
      ...product,
      id: makeId('prod'),
    }));

    setProducts((current) => [...nextProducts, ...current]);
    addMovement({
      title: 'Inventario importado',
      detail: `${nextProducts.length} productos entraron desde archivo digital`,
      type: 'Inventario',
    });
    setNotice(`${nextProducts.length} productos importados y categorizados.`);
    setActiveView('inventario');

    nextProducts.forEach((product) => {
      void api.saveProduct(product).catch((error: Error) => {
        setNotice(`Importacion local, backend pendiente: ${error.message}`);
      });
    });
  };

  const importInventory = async () => {
    try {
      saveImportedProducts(await pickInventoryProducts());
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const saveCustomer = (customer: Omit<Customer, 'id'>) => {
    const nextCustomer: Customer = {
      ...customer,
      id: makeId('cli'),
    };

    setCustomers((current) => [nextCustomer, ...current]);
    addMovement({
      title: 'Cliente agregado',
      detail: `${nextCustomer.name} ya tiene historial`,
      type: 'Cliente',
    });
    setNotice('Cliente agregado.');
    setActiveView('clientes');
    void api.saveCustomer(nextCustomer).catch((error: Error) => {
      setNotice(`Cliente local, backend pendiente: ${error.message}`);
    });
  };

  const saveDebt = (debt: Omit<Debt, 'id' | 'status'>) => {
    const nextDebt: Debt = {
      ...debt,
      id: makeId('debt'),
      status: 'Pendiente',
    };

    setDebts((current) => [nextDebt, ...current]);
    addMovement({
      title: 'Deuda registrada',
      detail: `${nextDebt.customerName} debe ${currency(nextDebt.amount)}`,
      type: 'Deuda',
    });
    setNotice('Deuda registrada.');
    setActiveView('clientes');
    void api.saveDebt(nextDebt).catch((error: Error) => {
      setNotice(`Deuda local, backend pendiente: ${error.message}`);
    });
  };

  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      setNotice(`${product.name} esta agotado.`);
      return;
    }

    setSaleBanner(null);
    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (!existing) {
        return [...current, { productId: product.id, quantity: 1 }];
      }

      return current.map((item) =>
        item.productId === product.id
          ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) }
          : item,
      );
    });
    setActiveView('newSale');
  };

  const updateQuantity = (productId: string, delta: number) => {
    const product = products.find((item) => item.id === productId);
    setCart((current) =>
      current
        .map((item) =>
          item.productId === productId
            ? {
                ...item,
                quantity: Math.min(
                  Math.max(0, item.quantity + delta),
                  product?.stock ?? item.quantity,
                ),
              }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const clearCart = () => {
    setCart([]);
    setSelectedCustomerId('');
    setSaleBanner(null);
  };

  const confirmSale = () => {
    if (!cartDetails.length) {
      setNotice('Agrega al menos un producto a la venta.');
      return;
    }

    const folio = makeSaleFolio(sales.length);
    const customer = customers.find((item) => item.id === selectedCustomerId);
    const sale: Sale = {
      id: makeId('sale'),
      folio,
      customerName: customer?.name,
      createdAt: 'hoy',
      items: cartDetails.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.quantity,
        unitPrice: item.product.price,
        subtotal: item.subtotal,
      })),
      paymentMethod,
      status: paymentMethod === 'Fiado' ? 'Fiada' : 'Pagada',
      total: cartTotal,
    };

    setSales((current) => [sale, ...current]);
    setProducts((current) =>
      current.map((product) => {
        const soldItem = cartDetails.find((item) => item.product.id === product.id);
        if (!soldItem) {
          return product;
        }

        return {
          ...product,
          stock: Math.max(0, product.stock - soldItem.quantity),
        };
      }),
    );

    if (paymentMethod === 'Fiado') {
      setDebts((current) => [
        {
          id: makeId('debt'),
          customerName: customer?.name || 'Cliente sin nombre',
          amount: cartTotal,
          status: 'Pendiente',
        },
        ...current,
      ]);
    }

    addMovement({
      title: `Venta ${folio}`,
      detail: `${cartDetails.length} productos salieron del inventario con movimiento registrado`,
      type: 'Venta',
    });
    void api
      .createSale({
        customerName: customer?.name,
        folio,
        id: sale.id,
        items: cartDetails.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
        })),
        paymentMethod,
      })
      .then((result) => {
        setProducts(result.products);
        setDebts(result.debts);
        setMovements(result.movements);
      })
      .catch((error: Error) => {
        setNotice(`Venta local, backend pendiente: ${error.message}`);
      });
    setSaleBanner({ folio });
    setCart([]);
    setSelectedCustomerId('');
    setPaymentMethod('Efectivo');
  };

  const exportInventory = async () => {
    try {
      const csv = await api.exportInventoryCsv();
      if (typeof document !== 'undefined') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'inventario-microapp.csv';
        link.click();
        URL.revokeObjectURL(url);
      }
      setNotice('Inventario exportado en CSV desde SQLite.');
    } catch (error) {
      setNotice(`No se pudo exportar: ${(error as Error).message}`);
    }
  };

  const openPointSetup = async () => {
    setActiveView('pointSetup');
    if (pointTutorial.length) {
      return;
    }

    try {
      setPointTutorial(await api.getPointTutorial());
    } catch {
      setPointTutorial([
        {
          title: 'Configura la terminal',
          text: 'Necesitas Terminal ID, access token en backend y webhook publico.',
        },
      ]);
    }
  };

  const saveBusinessProfile = async (
    nextProfile: Omit<BusinessProfile, 'id'>,
  ) => {
    const optimisticProfile: BusinessProfile = {
      ...nextProfile,
      id: profile.id,
    };
    setProfile(optimisticProfile);
    setTicketSettings((current) => ({
      ...current,
      businessName: nextProfile.name,
      logoText: nextProfile.logoText,
    }));

    try {
      const saved = await api.saveBusinessProfile(nextProfile);
      setProfile(saved);
      setNotice('Personalizacion del negocio guardada.');
      setActiveView('mas');
    } catch (error) {
      setNotice(`Guardado local, backend pendiente: ${(error as Error).message}`);
    }
  };

  const saveTickets = async (settings: TicketSettings) => {
    setTicketSettings(settings);
    try {
      setTicketSettings(await api.saveTicketSettings(settings));
      setNotice('Ticket personalizado guardado.');
      setActiveView('mas');
    } catch (error) {
      setNotice(`Ticket local, backend pendiente: ${(error as Error).message}`);
    }
  };

  const saveAutomations = async (settings: AutomationSettings) => {
    setAutomationSettings(settings);
    try {
      setAutomationSettings(await api.saveAutomationSettings(settings));
      setNotice('Alertas guardadas.');
      setActiveView('mas');
    } catch (error) {
      setNotice(`Alertas locales, backend pendiente: ${(error as Error).message}`);
    }
  };

  const saveBot = async (settings: BotSettings) => {
    setBotSettings(settings);
    try {
      setBotSettings(await api.saveBotSettings(settings));
      setNotice('Bot del negocio guardado.');
      setActiveView('mas');
    } catch (error) {
      setNotice(`Bot local, backend pendiente: ${(error as Error).message}`);
    }
  };

  const saveBackup = async (settings: Omit<BackupSettings, 'lastBackupAt'>) => {
    setBackupSettings((current) => ({
      ...current,
      ...settings,
    }));
    try {
      setBackupSettings(await api.saveBackupSettings(settings));
      setNotice('Configuracion de respaldo guardada.');
    } catch (error) {
      setNotice(`Respaldo local, backend pendiente: ${(error as Error).message}`);
    }
  };

  const runBackup = async () => {
    try {
      const result = await api.runBackup();
      setBackupSettings(result.backupSettings);
      setNotice('Respaldo SQLite verificado en disco.');
    } catch (error) {
      setNotice(`No se pudo respaldar: ${(error as Error).message}`);
    }
  };

  const savePoint = async (config: {
    mode: 'sandbox' | 'production';
    terminalId: string;
    externalStoreId: string;
    webhookUrl: string;
    accessToken: string;
    accountAlias: string;
  }) => {
    try {
      const result = await api.savePointConfig(config);
      setPointConfig(result.config);
      setNotice(
        result.errors.length
          ? result.errors[0]
          : 'Mercado Pago Point quedo vinculado en backend.',
      );
    } catch (error) {
      setNotice(`Point no se pudo guardar: ${(error as Error).message}`);
    }
  };

  const previewPointOrder = async () => {
    try {
      await api.previewPointOrder(49, 'V-PRUEBA');
      setNotice('Prueba lista: la venta quedaria pendiente hasta webhook.');
    } catch (error) {
      setNotice(`Falta configurar Point: ${(error as Error).message}`);
    }
  };

  const content = useMemo(() => {
    if (activeView === 'newSale') {
      return (
        <SaleRegisterView
          cartDetails={cartDetails}
          cartTotal={cartTotal}
          customers={customers}
          onAddProduct={addToCart}
          onBack={() => setActiveView('inicio')}
          onClearCart={clearCart}
          onConfirm={confirmSale}
          onPointPress={() =>
            accountPlan.isBusinessActive
              ? void openPointSetup()
              : setNotice(`${businessPlanLabel} prepara Mercado Pago Point con orden, webhook y terminal vinculada.`)
          }
          onScanPress={() =>
            setNotice(
              accountPlan.isBusinessActive
                ? 'Escaner en preparacion. Por ahora usa el buscador.'
                : `${businessPlanLabel} desbloquea escaner por camara. Por ahora usa el buscador.`,
            )
          }
          onPaymentChange={setPaymentMethod}
          onQuantityChange={updateQuantity}
          paymentMethod={paymentMethod}
          pointEnabled={accountPlan.isBusinessActive}
          products={products}
          saleBanner={saleBanner}
          selectedCustomerId={selectedCustomerId}
          setSelectedCustomerId={setSelectedCustomerId}
        />
      );
    }

    if (activeView === 'addProduct') {
      return (
        <ProductFormView
          onBack={() => setActiveView('inventario')}
          onSave={saveProduct}
          products={products}
        />
      );
    }

    if (activeView === 'productDetail' && selectedProduct) {
      return (
        <ProductDetailView
          onBack={() => setActiveView('inventario')}
          onProPress={() => setActiveView('plans')}
          onSell={() => addToCart(selectedProduct)}
          product={selectedProduct}
          showUpgrade={!accountPlan.isBusinessActive}
        />
      );
    }

    if (activeView === 'addCustomer') {
      return (
        <CustomerFormView
          onBack={() => setActiveView('clientes')}
          onSave={saveCustomer}
        />
      );
    }

    if (activeView === 'addDebt') {
      return (
        <DebtFormView
          customers={customers}
          onBack={() => setActiveView('clientes')}
          onSave={saveDebt}
        />
      );
    }

    if (activeView === 'businessSettings') {
      return (
        <BusinessSettingsView
          onBack={() => setActiveView('mas')}
          onSave={saveBusinessProfile}
          profile={profile}
        />
      );
    }

    if (activeView === 'pointSetup') {
      return (
        <PointSetupView
          config={pointConfig}
          onBack={() => setActiveView('mas')}
          onPreviewOrder={previewPointOrder}
          onSave={savePoint}
          steps={pointTutorial}
        />
      );
    }

    if (activeView === 'automationSettings') {
      return (
        <AutomationSettingsView
          onBack={() => setActiveView('mas')}
          onSave={saveAutomations}
          settings={automationSettings}
        />
      );
    }

    if (activeView === 'ticketSettings') {
      return (
        <TicketSettingsView
          onBack={() => setActiveView('mas')}
          onSave={saveTickets}
          profile={profile}
          settings={ticketSettings}
        />
      );
    }

    if (activeView === 'botSettings') {
      return (
        <BotSettingsView
          accountPlan={accountPlan}
          onBack={() => setActiveView('mas')}
          onSave={saveBot}
          settings={botSettings}
        />
      );
    }

    if (activeView === 'backupSettings') {
      return (
        <BackupSettingsView
          onBack={() => setActiveView('mas')}
          onRunBackup={runBackup}
          onSave={saveBackup}
          settings={backupSettings}
        />
      );
    }

    if (activeView === 'inventoryTransfer') {
      return (
        <InventoryTransferView
          onBack={() => setActiveView('mas')}
          onExport={() => void exportInventory()}
          onImport={() => void importInventory()}
        />
      );
    }

    if (activeView === 'ventas') {
      return (
        <SalesView
          onNewSale={openSale}
          sales={sales}
          totalToday={totalToday}
        />
      );
    }

    if (activeView === 'inventario' || activeView === 'lowStock') {
      return (
        <InventoryView
          lowOnly={activeView === 'lowStock'}
          onAddProduct={() => setActiveView('addProduct')}
          onProductPress={(product) => {
            setSelectedProduct(product);
            setActiveView('productDetail');
          }}
          products={products}
        />
      );
    }

    if (activeView === 'clientes') {
      return (
        <ClientsView
          customers={customers}
          debts={debts}
          onAddCustomer={() => setActiveView('addCustomer')}
          onAddDebt={() => setActiveView('addDebt')}
          onProPress={() => setActiveView('plans')}
          showUpgrade={!hasActiveSubscription}
        />
      );
    }

    if (activeView === 'plans') {
      return (
        <PlansView
          accountPlan={accountPlan}
          onBack={() => setActiveView('mas')}
          onBusinessPlan={() =>
            setNotice(`${businessPlanLabel} queda preparado para catalogo, empleados, permisos y Mercado Pago.`)
          }
        />
      );
    }

    if (activeView === 'mas') {
      return (
        <MoreView
          onAlerts={() => setActiveView('automationSettings')}
          onBackup={() => setActiveView('backupSettings')}
          onBot={() => setActiveView('botSettings')}
          onBusiness={() => setActiveView('businessSettings')}
          onConnectPoint={openPointSetup}
          onInventoryTransfer={() => setActiveView('inventoryTransfer')}
          onPlan={() => setActiveView('plans')}
          onTickets={() => setActiveView('ticketSettings')}
          plan={accountPlan}
          pointStatus={pointConfig.status}
        />
      );
    }

    return (
      <HomeView
        activeDebts={activeDebts.length}
        businessName={profile.name}
        logoUri={profile.logoUri}
        lowProducts={lowProducts.length}
        onAddProduct={() => setActiveView('addProduct')}
        onBellPress={() => setActiveView('automationSettings')}
        onLowStockPress={() => setActiveView('lowStock')}
        onNewSale={openSale}
        onPlanPress={() => setActiveView('plans')}
        onSalesPress={() => setActiveView('ventas')}
        onCustomersPress={() => setActiveView('clientes')}
        productsCount={products.length}
        salesCount={sales.length}
        totalToday={totalToday}
        usageStatus={usageStatus}
        hasActiveSubscription={hasActiveSubscription}
      />
    );
  }, [
    activeDebts.length,
    activeView,
    businessName,
    cartDetails,
    cartTotal,
    customers,
    debts,
    lowProducts.length,
    paymentMethod,
    profile,
    pointConfig,
    pointTutorial,
    products,
    saleBanner,
    sales,
    selectedCustomerId,
    selectedProduct,
    ticketSettings,
    automationSettings,
    backupSettings,
    accountPlan,
    botSettings,
    totalToday,
    usageStatus,
  ]);

  const isPointSetup = activeView === 'pointSetup';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.shell}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            isPointSetup && styles.fullScreenScrollContent,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scroller}
        >
          {content}
        </ScrollView>

        {!!notice && (
          <View
            style={[
              styles.globalNotice,
              isPointSetup && styles.globalNoticeFullScreen,
            ]}
          >
            <CheckCircle2 size={18} color="#129A46" strokeWidth={2.6} />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}

        {activeView === 'inventario' && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setActiveView('addProduct')}
            style={({ pressed }) => [
              styles.floatingAdd,
              pressed && styles.pressed,
            ]}
          >
            <Plus size={34} color="#FFFFFF" strokeWidth={2.3} />
          </Pressable>
        )}

        {!isPointSetup && (
          <View style={styles.bottomNav}>
            {tabs.map((tab) => (
              <NavButton
                active={activeTab === tab.key}
                icon={tab.icon}
                key={tab.key}
                label={tab.label}
                onPress={() => setActiveView(tab.key)}
              />
            ))}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function HomeView({
  activeDebts,
  businessName,
  hasActiveSubscription,
  logoUri,
  lowProducts,
  onAddProduct,
  onBellPress,
  onCustomersPress,
  onLowStockPress,
  onNewSale,
  onPlanPress,
  onSalesPress,
  productsCount,
  salesCount,
  totalToday,
  usageStatus,
}: {
  activeDebts: number;
  businessName: string;
  hasActiveSubscription: boolean;
  logoUri: string;
  lowProducts: number;
  onAddProduct: () => void;
  onBellPress: () => void;
  onCustomersPress: () => void;
  onLowStockPress: () => void;
  onNewSale: () => void;
  onPlanPress: () => void;
  onSalesPress: () => void;
  productsCount: number;
  salesCount: number;
  totalToday: number;
  usageStatus: UsageStatus;
}) {
  return (
    <>
      <View style={styles.dashboardHeader}>
        <View style={styles.dashboardIdentity}>
          <View style={styles.dashboardLogo}>
            {logoUri ? (
              <RNImage source={{ uri: logoUri }} style={styles.dashboardLogoImage} />
            ) : (
              <Store size={22} color={BLUE} strokeWidth={2.4} />
            )}
          </View>
          <View style={styles.dashboardTitleCopy}>
            <Text style={styles.headerEyebrow}>Buenos dias,</Text>
            <Text style={styles.headerTitle}>{businessName}</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onBellPress}
          style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]}
        >
          <Bell size={21} color={NAVY} strokeWidth={2.4} />
        </Pressable>
      </View>

      <View style={styles.metricGrid}>
        <MetricCard
          icon={BadgeDollarSign}
          label="Ventas de hoy"
          onPress={onSalesPress}
          tone="blue"
          value={currency(totalToday)}
        />
        <MetricCard
          icon={Package}
          label="Productos bajos"
          onPress={onLowStockPress}
          tone="orange"
          value={`${lowProducts}`}
        />
        <MetricCard
          icon={UserRound}
          label="Clientes con deuda"
          onPress={onCustomersPress}
          tone="green"
          value={`${activeDebts}`}
        />
        <MetricCard
          extra="ilimitados"
          icon={Box}
          label="Productos activos"
          onPress={onPlanPress}
          tone="violet"
          value={`${productsCount}`}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onNewSale}
        style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
      >
        <ShoppingCart size={22} color="#FFFFFF" strokeWidth={2.6} />
        <Text style={styles.ctaButtonText}>Nueva venta</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={onAddProduct}
        style={({ pressed }) => [
          styles.outlineAction,
          pressed && styles.pressed,
        ]}
      >
        <Plus size={21} color={BLUE} strokeWidth={2.5} />
        <Text style={styles.outlineActionText}>Agregar producto</Text>
      </Pressable>

      {!hasActiveSubscription && (
        <>
          <UsageRewardCard usageStatus={usageStatus} />
          <ProCard
            badge="NEGOCIO"
            linkText="Ver plan Negocio >"
            onPress={onPlanPress}
            title="Automatiza tu negocio"
            text="Activa catalogo, empleados, permisos, WhatsApp y Mercado Pago."
          />
        </>
      )}

      {salesCount > 0 && (
        <View style={styles.slimCard}>
          <Text style={styles.slimTitle}>Hoy ya tienes sistema</Text>
          <Text style={styles.slimText}>
            Tus ventas generan folio, ticket y movimiento de inventario.
          </Text>
        </View>
      )}
    </>
  );
}

function UsageRewardCard({ usageStatus }: { usageStatus: UsageStatus }) {
  const activeTrial = usageStatus.proTrial.status === 'Activa';
  const progress = Math.min(
    100,
    (usageStatus.currentStreakDays / usageStatus.requiredStreakDays) * 100,
  );

  return (
    <View style={styles.usageRewardCard}>
      <View style={styles.usageRewardIcon}>
        <Gift
          size={22}
          color={activeTrial ? '#129A46' : BLUE}
          strokeWidth={2.5}
        />
      </View>
      <View style={styles.usageRewardCopy}>
        <Text style={styles.usageRewardTitle}>
          {activeTrial ? `Prueba ${businessPlanLabel} activa` : `Racha para probar ${businessPlanLabel}`}
        </Text>
        <Text style={styles.usageRewardText}>
          {activeTrial
            ? `${usageStatus.proTrial.daysRemaining} dias restantes del plan Negocio.`
            : `${usageStatus.currentStreakDays}/${usageStatus.requiredStreakDays} dias seguidos para liberar automatizaciones.`}
        </Text>
        {!activeTrial && (
          <View style={styles.usageProgressTrack}>
            <View
              style={[styles.usageProgressFill, { width: `${progress}%` }]}
            />
          </View>
        )}
      </View>
    </View>
  );
}

function MetricCard({
  extra,
  icon: Icon,
  label,
  onPress,
  tone,
  value,
}: {
  extra?: string;
  icon: IconComponent;
  label: string;
  onPress: () => void;
  tone: 'blue' | 'orange' | 'green' | 'violet';
  value: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.metricCard, pressed && styles.pressed]}
    >
      <View style={[styles.metricIcon, styles[`${tone}Soft`]]}>
        <Icon
          size={19}
          color={
            tone === 'blue'
              ? BLUE
              : tone === 'orange'
                ? '#F97316'
                : tone === 'green'
                  ? '#129A46'
                  : '#4237FF'
          }
          strokeWidth={2.5}
        />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {!!extra && <Text style={styles.metricExtra}>{extra}</Text>}
      <Text style={styles.metricLink}>
        {tone === 'green' ? 'Ver clientes' : tone === 'violet' ? 'Ver plan' : 'Ver detalle'}{' '}
        <Text style={styles.metricArrow}>&gt;</Text>
      </Text>
    </Pressable>
  );
}

function InventoryView({
  lowOnly,
  onAddProduct,
  onProductPress,
  products,
}: {
  lowOnly?: boolean;
  onAddProduct: () => void;
  onProductPress: (product: Product) => void;
  products: Product[];
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [showFilters, setShowFilters] = useState(true);
  const visibleProducts = lowOnly
    ? products.filter((product) => stockStatus(product) !== 'Activo')
    : products;
  const categories = [
    'Todos',
    ...Array.from(new Set(visibleProducts.map((p) => p.category))),
  ];
  const filteredProducts = visibleProducts.filter((product) => {
    const matchesQuery = product.name
      .toLowerCase()
      .includes(query.trim().toLowerCase());
    const matchesCategory = category === 'Todos' || product.category === category;
    return matchesQuery && matchesCategory;
  });

  return (
    <>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>
          {lowOnly ? 'Stock bajo' : 'Inventario'}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowFilters((current) => !current)}
          style={({ pressed }) => [
            styles.iconButton,
            !showFilters && styles.iconButtonMuted,
            pressed && styles.pressed,
          ]}
        >
          <SlidersHorizontal size={20} color={NAVY} strokeWidth={2.4} />
        </Pressable>
      </View>

      <SearchBox
        onChangeText={setQuery}
        placeholder="Buscar producto"
        value={query}
      />

      {showFilters && (
        <View style={styles.filterRow}>
          {categories.map((item) => (
            <Pressable
              accessibilityRole="button"
              key={item}
              onPress={() => setCategory(item)}
              style={[
                styles.filterChip,
                item === category && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  item === category && styles.filterChipTextActive,
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.inventoryProgress}>
        <View style={styles.inventoryProgressTop}>
          <Box size={19} color={NAVY} strokeWidth={2.4} />
          <Text style={styles.inventoryProgressText}>
            {lowOnly
              ? `${visibleProducts.length} productos requieren atencion`
              : `${products.length} productos activos - inventario ilimitado incluido`}
          </Text>
          <Info size={18} color={MUTED} strokeWidth={2.4} />
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: lowOnly ? `${Math.min(visibleProducts.length * 12, 100)}%` : '100%' },
            ]}
          />
        </View>
      </View>

      {filteredProducts.length ? (
        filteredProducts.map((product, index) => (
          <ProductListCard
            index={index}
            key={product.id}
            onPress={() => onProductPress(product)}
            product={product}
          />
        ))
      ) : (
        <EmptyStateCard
          action="Agregar producto"
          onAction={onAddProduct}
          text={
            lowOnly
              ? 'Todo tu inventario esta dentro del nivel minimo configurado.'
              : 'Agrega productos reales para empezar a controlar ventas e inventario.'
          }
          title={lowOnly ? 'Sin productos bajos' : 'Todavia no tienes productos'}
        />
      )}
    </>
  );
}

function ProductListCard({
  index,
  onPress,
  product,
}: {
  index: number;
  onPress: () => void;
  product: Product;
}) {
  const status = stockStatus(product);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.productCard,
        pressed && styles.pressed,
      ]}
    >
      <ProductThumb index={index} />
      <View style={styles.productCardBody}>
        <Text style={styles.productCardTitle}>{product.name}</Text>
        <View style={styles.productFacts}>
          <View>
            <Text style={styles.productFactLabel}>Stock</Text>
            <Text
              style={[
                styles.productStock,
                status !== 'Activo' && styles.productStockWarning,
              ]}
            >
              {product.stock}
            </Text>
          </View>
          <View>
            <Text style={styles.productFactLabel}>Precio</Text>
            <Text style={styles.productPrice}>{currency(product.price)}</Text>
          </View>
        </View>
        {status !== 'Activo' && (
          <View style={styles.lowStockChip}>
            <Text style={styles.lowStockText}>{status}</Text>
          </View>
        )}
      </View>
      <ChevronRight size={20} color={MUTED} strokeWidth={2.4} />
    </Pressable>
  );
}

function SaleRegisterView({
  cartDetails,
  cartTotal,
  customers,
  onAddProduct,
  onBack,
  onClearCart,
  onConfirm,
  onPointPress,
  onPaymentChange,
  onQuantityChange,
  onScanPress,
  paymentMethod,
  pointEnabled,
  products,
  saleBanner,
  selectedCustomerId,
  setSelectedCustomerId,
}: {
  cartDetails: Array<{ product: Product; quantity: number; subtotal: number }>;
  cartTotal: number;
  customers: Customer[];
  onAddProduct: (product: Product) => void;
  onBack: () => void;
  onClearCart: () => void;
  onConfirm: () => void;
  onPointPress: () => void;
  onPaymentChange: (method: PaymentMethod) => void;
  onQuantityChange: (productId: string, delta: number) => void;
  onScanPress: () => void;
  paymentMethod: PaymentMethod;
  pointEnabled: boolean;
  products: Product[];
  saleBanner: SaleBanner | null;
  selectedCustomerId: string;
  setSelectedCustomerId: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [stockMenuOpen, setStockMenuOpen] = useState(false);
  const cleanQuery = query.trim().toLowerCase();
  const searchResult = cleanQuery
    ? products
        .filter((product) => product.name.toLowerCase().includes(cleanQuery))
        .slice(0, 1)
    : [];
  const stockPreview = products
    .filter((product) => product.stock > 0)
    .slice(0, 3);

  return (
    <>
      <View style={styles.saleHeader}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={styles.backIconButton}
        >
          <ArrowLeft size={24} color={NAVY} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.saleTitle}>Nueva venta</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.saleSearchRow}>
        <SearchBox
          onChangeText={setQuery}
          placeholder="Buscar producto"
          value={query}
        />
        <Pressable
          accessibilityRole="button"
          onPress={onScanPress}
          style={({ pressed }) => [styles.scanButton, pressed && styles.pressed]}
        >
          <ScanBarcode size={22} color={NAVY} strokeWidth={2.3} />
        </Pressable>
      </View>

      {cleanQuery ? (
        searchResult.length ? (
          searchResult.map((product, index) => (
            <SaleProductCard
              index={index}
              key={product.id}
              onPress={() => onAddProduct(product)}
              product={product}
            />
          ))
        ) : (
          <EmptyStateCard
            text="No encontramos ese producto. Revisa el nombre o agregalo al inventario."
            title="Sin coincidencias"
          />
        )
      ) : products.length ? (
        <View style={styles.stockMenuCard}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setStockMenuOpen((current) => !current)}
            style={styles.stockMenuHeader}
          >
            <View style={styles.stockMenuIcon}>
              <Box size={21} color={BLUE} strokeWidth={2.4} />
            </View>
            <View style={styles.stockMenuCopy}>
              <Text style={styles.stockMenuTitle}>Stock disponible</Text>
              <Text style={styles.stockMenuText}>
                Busca por nombre o abre una vista corta del inventario.
              </Text>
            </View>
            <ChevronRight
              size={20}
              color={MUTED}
              strokeWidth={2.4}
              style={stockMenuOpen && styles.stockMenuChevronOpen}
            />
          </Pressable>
          {stockMenuOpen && (
            <View style={styles.stockMenuList}>
              {stockPreview.map((product, index) => (
                <SaleProductCard
                  index={index}
                  key={product.id}
                  onPress={() => onAddProduct(product)}
                  product={product}
                />
              ))}
              {products.length > stockPreview.length && (
                <Text style={styles.stockMenuHint}>
                  Escribe en el buscador para encontrar el resto del inventario.
                </Text>
              )}
            </View>
          )}
        </View>
      ) : (
        <EmptyStateCard
          text="Agrega productos al inventario para poder venderlos aqui."
          title="Sin productos para vender"
        />
      )}

      <View style={styles.cartCard}>
        <View style={styles.cartHeader}>
          <Text style={styles.cartTitle}>
            Tu venta ({cartDetails.length} productos)
          </Text>
          <Pressable accessibilityRole="button" onPress={onClearCart}>
            <Trash2 size={19} color={MUTED} strokeWidth={2.4} />
          </Pressable>
        </View>
        {cartDetails.length ? (
          cartDetails.map((item) => (
            <View key={item.product.id} style={styles.cartLine}>
              <View style={styles.cartLineLeft}>
                <Text style={styles.cartLineName}>
                  {item.quantity} x {item.product.name}
                </Text>
                <View style={styles.qtyControls}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onQuantityChange(item.product.id, -1)}
                    style={styles.qtyButton}
                  >
                    <Text style={styles.qtyButtonText}>-</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onQuantityChange(item.product.id, 1)}
                    style={styles.qtyButton}
                  >
                    <Text style={styles.qtyButtonText}>+</Text>
                  </Pressable>
                </View>
              </View>
              <Text style={styles.cartLineTotal}>{currency(item.subtotal)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyCartText}>
            Toca productos para agregarlos a la venta.
          </Text>
        )}
        <View style={styles.cartDivider} />
        <View style={styles.cartTotalRow}>
          <Text style={styles.subtotalText}>Subtotal</Text>
          <Text style={styles.subtotalText}>{currency(cartTotal)}</Text>
        </View>
        <View style={styles.cartTotalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{currency(cartTotal)}</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Metodo de pago</Text>
      <View style={styles.paymentRow}>
        {paymentMethods.map(({ icon: Icon, label }) => {
          const active = paymentMethod === label;
          return (
            <Pressable
              accessibilityRole="button"
              key={label}
              onPress={() => onPaymentChange(label)}
              style={[styles.paymentChip, active && styles.paymentChipActive]}
            >
              <Icon
                size={22}
                color={active ? BLUE : NAVY}
                strokeWidth={2.3}
              />
              <Text
                style={[
                  styles.paymentChipText,
                  active && styles.paymentChipTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onPointPress}
        style={({ pressed }) => [
          styles.pointCard,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.pointIcon}>
          <CreditCard size={23} color={BLUE} strokeWidth={2.4} />
        </View>
        <View style={styles.pointBody}>
          <View style={styles.pointTitleRow}>
            <Text style={styles.pointTitle}>Mercado Pago Point</Text>
            {!pointEnabled && (
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>NEGOCIO</Text>
              </View>
            )}
          </View>
          <Text style={styles.pointText}>
            {pointEnabled
              ? 'Configura terminal, webhook y backend para cobrar desde MicroApp.'
              : 'Crea venta pendiente, manda el total a la terminal y descuenta inventario cuando el pago quede aprobado.'}
          </Text>
        </View>
        {pointEnabled ? (
          <ChevronRight size={18} color={MUTED} strokeWidth={2.4} />
        ) : (
          <LockKeyhole size={18} color={MUTED} strokeWidth={2.4} />
        )}
      </Pressable>

      {!!customers.length && (
        <>
          <Text style={styles.sectionLabel}>Cliente opcional</Text>
          <View style={styles.clientChipRow}>
            {customers.map((customer) => (
              <Pressable
                accessibilityRole="button"
                key={customer.id}
                onPress={() => setSelectedCustomerId(customer.id)}
                style={[
                  styles.clientChip,
                  selectedCustomerId === customer.id && styles.clientChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.clientChipText,
                    selectedCustomerId === customer.id &&
                      styles.clientChipTextActive,
                  ]}
                >
                  {customer.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {!!saleBanner && (
        <View style={styles.successBanner}>
          <View style={styles.successIcon}>
            <Check size={19} color="#FFFFFF" strokeWidth={3} />
          </View>
          <View style={styles.successBannerCopy}>
            <Text style={styles.successBannerTitle}>Venta registrada</Text>
            <Text style={styles.successBannerText}>
              Ticket {saleBanner.folio} creado
            </Text>
          </View>
          <X size={20} color="#14532D" strokeWidth={2.3} />
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={onConfirm}
        style={({ pressed }) => [
          styles.chargeButton,
          !cartDetails.length && styles.chargeButtonDisabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.chargeButtonText}>Cobrar {currency(cartTotal)}</Text>
      </Pressable>
    </>
  );
}

function SaleProductCard({
  index,
  onPress,
  product,
}: {
  index: number;
  onPress: () => void;
  product: Product;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.saleProductCard,
        pressed && styles.pressed,
      ]}
    >
      <ProductThumb index={index} small />
      <View style={styles.saleProductBody}>
        <Text style={styles.saleProductName}>{product.name}</Text>
        <Text style={styles.saleProductPrice}>{currency(product.price)}</Text>
      </View>
      <View style={styles.addCircle}>
        <Plus size={22} color={BLUE} strokeWidth={2.2} />
      </View>
    </Pressable>
  );
}

function SalesView({
  onNewSale,
  sales,
  totalToday,
}: {
  onNewSale: () => void;
  sales: Sale[];
  totalToday: number;
}) {
  return (
    <>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Ventas</Text>
        <Text style={styles.headerAmount}>{currency(totalToday)}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onNewSale}
        style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
      >
        <ShoppingCart size={22} color="#FFFFFF" strokeWidth={2.6} />
        <Text style={styles.ctaButtonText}>Nueva venta</Text>
      </Pressable>
      {sales.length ? (
        sales.map((sale) => <SaleTicketCard key={sale.id} sale={sale} />)
      ) : (
        <EmptyStateCard
          action="Nueva venta"
          onAction={onNewSale}
          text="Tu dia aun no tiene ventas registradas."
          title="Caja lista"
        />
      )}
    </>
  );
}

function ProductDetailView({
  onBack,
  onProPress,
  onSell,
  product,
  showUpgrade,
}: {
  onBack: () => void;
  onProPress: () => void;
  onSell: () => void;
  product: Product;
  showUpgrade: boolean;
}) {
  return (
    <>
      <HeaderBack label="Producto" onBack={onBack} />
      <View style={styles.detailCard}>
        <ProductThumb index={0} large />
        <Text style={styles.detailTitle}>{product.name}</Text>
        <InfoRow label="Stock actual" value={`${product.stock}`} />
        <InfoRow label="Precio venta" value={currency(product.price)} />
        <InfoRow label="Costo" value={product.cost ? currency(product.cost) : 'Opcional'} />
        <InfoRow label="Estado" value={stockStatus(product)} />
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onSell}
        style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
      >
        <ShoppingCart size={22} color="#FFFFFF" strokeWidth={2.6} />
        <Text style={styles.ctaButtonText}>Registrar venta</Text>
      </Pressable>
      {showUpgrade && (
        <ProCard
          badge="NEGOCIO"
          linkText="Ver automatizaciones >"
          onPress={onProPress}
          title="Compras y proveedores"
          text="Controla entradas de mercancia, proveedor, costo y movimientos avanzados."
        />
      )}
    </>
  );
}

function ProductFormView({
  onBack,
  onSave,
  products,
}: {
  onBack: () => void;
  onSave: (product: Omit<Product, 'id'>) => void;
  products: Product[];
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [category, setCategory] = useState('');
  const [cost, setCost] = useState('');
  const [message, setMessage] = useState('');
  const categories = Array.from(
    new Set(products.map((product) => product.category).filter(Boolean)),
  );

  const save = () => {
    const cleanName = name.trim();
    const parsedPrice = Number(price.replace(/[^0-9.]/g, ''));
    const parsedStock = Number(stock.replace(/[^0-9]/g, ''));
    const parsedCost = Number(cost.replace(/[^0-9.]/g, ''));

    if (!cleanName || parsedPrice <= 0 || Number.isNaN(parsedStock)) {
      setMessage('Nombre, precio y cantidad son obligatorios.');
      return;
    }

    onSave({
      name: cleanName,
      category: category.trim() || 'General',
      cost: parsedCost || undefined,
      minStock: 3,
      price: parsedPrice,
      stock: parsedStock,
    });
  };

  return (
    <>
      <HeaderBack label="Agregar producto" onBack={onBack} />
      <View style={styles.formCard}>
        <Field label="Nombre" onChangeText={setName} value={name} />
        <Field keyboardType="numeric" label="Precio de venta" onChangeText={setPrice} value={price} />
        <Field keyboardType="numeric" label="Cantidad actual" onChangeText={setStock} value={stock} />
        {!!categories.length && (
          <View style={styles.categoryPicker}>
            <Text style={styles.fieldLabel}>Categorias guardadas</Text>
            <View style={styles.categoryChipRow}>
              {categories.map((item) => (
                <Pressable
                  accessibilityRole="button"
                  key={item}
                  onPress={() => setCategory(item)}
                  style={[
                    styles.categoryChip,
                    category === item && styles.categoryChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      category === item && styles.categoryChipTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        <Field label="Categoria" onChangeText={setCategory} value={category} />
        <Field keyboardType="numeric" label="Costo opcional" onChangeText={setCost} value={cost} />
        {!!message && <Text style={styles.formMessage}>{message}</Text>}
        <Pressable
          accessibilityRole="button"
          onPress={save}
          style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
        >
          <Check size={21} color="#FFFFFF" strokeWidth={2.8} />
          <Text style={styles.ctaButtonText}>Guardar producto</Text>
        </Pressable>
      </View>
    </>
  );
}

function ClientsView({
  customers,
  debts,
  onAddCustomer,
  onAddDebt,
  onProPress,
  showUpgrade,
}: {
  customers: Customer[];
  debts: Debt[];
  onAddCustomer: () => void;
  onAddDebt: () => void;
  onProPress: () => void;
  showUpgrade: boolean;
}) {
  return (
    <>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Clientes</Text>
        <Text style={styles.headerAmount}>{customers.length} clientes</Text>
      </View>
      <View style={styles.twoButtonRow}>
        <Pressable
          accessibilityRole="button"
          onPress={onAddCustomer}
          style={({ pressed }) => [
            styles.halfOutlineButton,
            pressed && styles.pressed,
          ]}
        >
          <Plus size={19} color={BLUE} strokeWidth={2.5} />
          <Text style={styles.halfOutlineText}>Cliente</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onAddDebt}
          style={({ pressed }) => [
            styles.halfOutlineButton,
            pressed && styles.pressed,
          ]}
        >
          <ReceiptText size={19} color={BLUE} strokeWidth={2.5} />
          <Text style={styles.halfOutlineText}>Fiado</Text>
        </Pressable>
      </View>
      {customers.length ? (
        customers.map((customer) => {
          const debtAmount = debts
            .filter((debt) => debt.customerName === customer.name)
            .reduce((total, debt) => total + debt.amount, 0);

          return (
            <View key={customer.id} style={styles.customerCard}>
              <View style={styles.customerAvatar}>
                <UserRound size={22} color="#129A46" strokeWidth={2.4} />
              </View>
              <View style={styles.customerBody}>
                <Text style={styles.customerName}>{customer.name}</Text>
                <Text style={styles.customerMeta}>
                  {customer.phone || 'Sin telefono'}
                </Text>
                {!!customer.note && (
                  <Text style={styles.customerNote}>{customer.note}</Text>
                )}
              </View>
              <Text
                style={[
                  styles.customerDebt,
                  debtAmount > 0 && styles.customerDebtWarning,
                ]}
              >
                {debtAmount ? currency(debtAmount) : 'Sin deuda'}
              </Text>
            </View>
          );
        })
      ) : (
        <EmptyStateCard
          action="Agregar cliente"
          onAction={onAddCustomer}
          text="Guarda tus clientes frecuentes y revisa sus fiados."
          title="Aun no tienes clientes"
        />
      )}
      {showUpgrade && (
        <ProCard
          badge="NEGOCIO"
          linkText="Ver plan Negocio >"
          onPress={onProPress}
          title="Cobranza por WhatsApp"
          text="Genera recordatorios, agenda pagos y coordina clientes con menos friccion."
        />
      )}
    </>
  );
}

function CustomerFormView({
  onBack,
  onSave,
}: {
  onBack: () => void;
  onSave: (customer: Omit<Customer, 'id'>) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');

  const save = () => {
    if (!name.trim()) {
      setMessage('Escribe el nombre del cliente.');
      return;
    }
    onSave({ name: name.trim(), note: note.trim(), phone: phone.trim() });
  };

  return (
    <>
      <HeaderBack label="Agregar cliente" onBack={onBack} />
      <View style={styles.formCard}>
        <Field label="Nombre" onChangeText={setName} value={name} />
        <Field keyboardType="phone-pad" label="Telefono" onChangeText={setPhone} value={phone} />
        <Field label="Notas" onChangeText={setNote} value={note} />
        {!!message && <Text style={styles.formMessage}>{message}</Text>}
        <Pressable
          accessibilityRole="button"
          onPress={save}
          style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
        >
          <Check size={21} color="#FFFFFF" strokeWidth={2.8} />
          <Text style={styles.ctaButtonText}>Guardar cliente</Text>
        </Pressable>
      </View>
    </>
  );
}

function DebtFormView({
  customers,
  onBack,
  onSave,
}: {
  customers: Customer[];
  onBack: () => void;
  onSave: (debt: Omit<Debt, 'id' | 'status'>) => void;
}) {
  const [customerName, setCustomerName] = useState(customers[0]?.name || '');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');

  const save = () => {
    const parsedAmount = Number(amount.replace(/[^0-9.]/g, ''));
    if (!customerName.trim() || parsedAmount <= 0) {
      setMessage('Escribe cliente y monto.');
      return;
    }

    onSave({ amount: parsedAmount, customerName: customerName.trim() });
  };

  return (
    <>
      <HeaderBack label="Registrar fiado" onBack={onBack} />
      <View style={styles.formCard}>
        <Field label="Cliente" onChangeText={setCustomerName} value={customerName} />
        <Field keyboardType="numeric" label="Monto pendiente" onChangeText={setAmount} value={amount} />
        {!!message && <Text style={styles.formMessage}>{message}</Text>}
        <Pressable
          accessibilityRole="button"
          onPress={save}
          style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
        >
          <Check size={21} color="#FFFFFF" strokeWidth={2.8} />
          <Text style={styles.ctaButtonText}>Guardar deuda</Text>
        </Pressable>
      </View>
    </>
  );
}

function BusinessSettingsView({
  onBack,
  onSave,
  profile,
}: {
  onBack: () => void;
  onSave: (profile: Omit<BusinessProfile, 'id'>) => void;
  profile: BusinessProfile;
}) {
  const [name, setName] = useState(profile.name);
  const [giro, setGiro] = useState(profile.giro);
  const [city, setCity] = useState(profile.city);
  const [phone, setPhone] = useState(profile.phone);
  const [currency, setCurrency] = useState(profile.currency);
  const [logoText, setLogoText] = useState(profile.logoText);
  const [logoUri, setLogoUri] = useState(profile.logoUri);
  const [openHours, setOpenHours] = useState(profile.openHours);
  const [message, setMessage] = useState('');

  const choosePhoto = async () => {
    try {
      setLogoUri(await pickImageDataUri());
      setMessage('Foto agregada. Guarda el negocio para aplicarla.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const save = () => {
    if (!name.trim()) {
      setMessage('El negocio necesita nombre.');
      return;
    }

    onSave({
      city: city.trim(),
      currency: currency.trim() || 'MXN',
      giro: giro.trim() || 'General',
      logoText: logoText.trim(),
      logoUri,
      name: name.trim(),
      openHours: openHours.trim(),
      phone: phone.trim(),
      primaryColor: profile.primaryColor || BLUE,
    });
  };

  return (
    <>
      <HeaderBack label="Personalizar negocio" onBack={onBack} />
      <View style={styles.settingsIntro}>
        <View style={styles.settingsIcon}>
          <Store size={24} color={BLUE} strokeWidth={2.4} />
        </View>
        <View style={styles.settingsIntroCopy}>
          <Text style={styles.settingsIntroTitle}>Haz que se sienta tu sistema</Text>
          <Text style={styles.settingsIntroText}>
            Estos datos alimentan el panel, tickets y configuracion comercial.
          </Text>
        </View>
      </View>
      <View style={styles.formCard}>
        <View style={styles.logoEditorRow}>
          <View style={styles.logoEditorPreview}>
            {logoUri ? (
              <RNImage source={{ uri: logoUri }} style={styles.logoEditorImage} />
            ) : (
              <ImageIcon size={28} color={BLUE} strokeWidth={2.4} />
            )}
          </View>
          <View style={styles.logoEditorCopy}>
            <Text style={styles.logoEditorTitle}>Foto del negocio</Text>
            <Text style={styles.logoEditorText}>
              Se vera en el perfil y despues en tickets/catalogo.
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={choosePhoto}
          style={({ pressed }) => [
            styles.outlineAction,
            pressed && styles.pressed,
          ]}
        >
          <ImageIcon size={20} color={BLUE} strokeWidth={2.4} />
          <Text style={styles.outlineActionText}>
            {logoUri ? 'Cambiar foto' : 'Anadir foto'}
          </Text>
        </Pressable>
        <Field label="Nombre del negocio" onChangeText={setName} value={name} />
        <Field label="Giro" onChangeText={setGiro} value={giro} />
        <Field label="Ciudad" onChangeText={setCity} value={city} />
        <Field keyboardType="phone-pad" label="Telefono" onChangeText={setPhone} value={phone} />
        <Field label="Moneda" onChangeText={setCurrency} value={currency} />
        <Field label="Texto de logo" onChangeText={setLogoText} value={logoText} />
        <Field label="Horario" onChangeText={setOpenHours} value={openHours} />
        {!!message && <Text style={styles.formMessage}>{message}</Text>}
        <Pressable
          accessibilityRole="button"
          onPress={save}
          style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
        >
          <Check size={21} color="#FFFFFF" strokeWidth={2.8} />
          <Text style={styles.ctaButtonText}>Guardar negocio</Text>
        </Pressable>
      </View>
    </>
  );
}

function PointSetupView({
  config,
  onBack,
  onPreviewOrder,
  onSave,
  steps,
}: {
  config: PointConfig;
  onBack: () => void;
  onPreviewOrder: () => void;
  onSave: (config: {
    mode: 'sandbox' | 'production';
    terminalId: string;
    externalStoreId: string;
    webhookUrl: string;
    accessToken: string;
    accountAlias: string;
  }) => void;
  steps: PointTutorialStep[];
}) {
  const tutorialSteps =
    steps.length > 0
      ? steps
      : [
          {
            title: 'Prepara Mercado Pago Point',
            text: 'Necesitas Terminal ID, webhook y access token guardado en backend.',
          },
        ];
  const [step, setStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<boolean[]>(
    () => new Array(6).fill(false),
  );
  const [mode, setMode] = useState<PointConfig['mode']>(config.mode);
  const [terminalId, setTerminalId] = useState(config.terminalId);
  const [externalStoreId, setExternalStoreId] = useState(config.externalStoreId);
  const [webhookUrl, setWebhookUrl] = useState(config.webhookUrl);
  const [accessToken, setAccessToken] = useState('');
  const [accountAlias, setAccountAlias] = useState(config.accountAlias);
  const fade = useRef(new Animated.Value(1)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const wizardTabs = [
    'Cuenta',
    'Terminal',
    'Backend',
    'Webhook',
    'Flujo',
    'Prueba',
  ];
  const activeStep = tutorialSteps[step] || tutorialSteps[0];

  const animateToStep = (nextStep: number) => {
    if (nextStep === step) {
      return;
    }

    const direction = nextStep > step ? 1 : -1;
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 0,
        duration: 130,
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: -24 * direction,
        duration: 130,
        useNativeDriver: true,
      }),
    ]).start();

    setTimeout(() => {
      setStep(nextStep);
      slide.setValue(24 * direction);
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(slide, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }, 140);
  };

  const save = () => {
    onSave({
      accessToken,
      accountAlias,
      externalStoreId,
      mode,
      terminalId,
      webhookUrl,
    });
  };

  const completeStep = () => {
    setCompletedSteps((current) =>
      current.map((complete, index) => (index === step ? true : complete)),
    );

    if (step < wizardTabs.length - 1) {
      animateToStep(step + 1);
      return;
    }

    save();
  };

  const renderStepBody = () => {
    if (step === 0) {
      return (
        <>
          <Text style={styles.pointFieldHint}>
            Elige si estas probando o si ya vas a cobrar en produccion.
          </Text>
          <View style={styles.segmentedRow}>
            {(['sandbox', 'production'] as const).map((item) => (
              <Pressable
                accessibilityRole="button"
                key={item}
                onPress={() => setMode(item)}
                style={[
                  styles.segmentedButton,
                  mode === item && styles.segmentedButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentedButtonText,
                    mode === item && styles.segmentedButtonTextActive,
                  ]}
                >
                  {item === 'sandbox' ? 'Prueba' : 'Produccion'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Field label="Alias de cuenta" onChangeText={setAccountAlias} value={accountAlias} />
        </>
      );
    }

    if (step === 1) {
      return (
        <>
          <Text style={styles.pointFieldHint}>
            Copia estos datos desde Mercado Pago Developers o desde la terminal
            configurada como POS.
          </Text>
          <Field label="Terminal ID" onChangeText={setTerminalId} value={terminalId} />
          <Field label="External Store ID" onChangeText={setExternalStoreId} value={externalStoreId} />
        </>
      );
    }

    if (step === 2) {
      return (
        <>
          <Text style={styles.pointFieldHint}>
            El access token se envia al backend y no debe guardarse en el
            telefono. Si ya existe uno, puedes dejarlo vacio.
          </Text>
          <Field
            label={
              config.hasAccessToken
                ? `Access token (${config.accessTokenMasked})`
                : 'Access token'
            }
            onChangeText={setAccessToken}
            secureTextEntry
            value={accessToken}
          />
          <InfoRow
            label="Token actual"
            value={config.hasAccessToken ? 'Guardado en backend' : 'Pendiente'}
          />
        </>
      );
    }

    if (step === 3) {
      return (
        <>
          <Text style={styles.pointFieldHint}>
            Mercado Pago avisara aqui si la orden fue aprobada, cancelada,
            fallida o expirada.
          </Text>
          <Field label="Webhook publico" onChangeText={setWebhookUrl} value={webhookUrl} />
          <Pressable
            accessibilityRole="button"
            onPress={() => setWebhookUrl('http://localhost:4001/webhooks/mercado-pago')}
            style={({ pressed }) => [
              styles.pointMiniAction,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.pointMiniActionText}>
              Usar webhook local de prueba
            </Text>
          </Pressable>
        </>
      );
    }

    if (step === 4) {
      return (
        <View style={styles.pointFlowList}>
          <FlowStep label="1" text="MicroApp crea venta pendiente de pago." />
          <FlowStep label="2" text="El backend manda la orden a la terminal." />
          <FlowStep label="3" text="El inventario queda reservado, no descontado." />
          <FlowStep label="4" text="El webhook aprobado convierte la reserva en venta." />
        </View>
      );
    }

    return (
      <>
        <Text style={styles.pointFieldHint}>
          Guarda la configuracion y prueba una orden pequena antes de usar
          produccion.
        </Text>
        <InfoRow label="Estado" value={config.status} />
        <InfoRow label="Terminal" value={terminalId || 'Pendiente'} />
        <InfoRow label="Webhook" value={webhookUrl ? 'Configurado' : 'Pendiente'} />
        <Pressable
          accessibilityRole="button"
          onPress={onPreviewOrder}
          style={({ pressed }) => [styles.outlineAction, pressed && styles.pressed]}
        >
          <CreditCard size={20} color={BLUE} strokeWidth={2.4} />
          <Text style={styles.outlineActionText}>Probar orden de $49</Text>
        </Pressable>
      </>
    );
  };

  return (
    <View style={styles.pointWizardScreen}>
      <View style={styles.pointWizardHeader}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={styles.backIconButton}
        >
          <ArrowLeft size={24} color={NAVY} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.pointWizardHeaderCopy}>
          <Text style={styles.pointWizardTitle}>Mercado Pago Point</Text>
          <Text style={styles.pointWizardStatus}>Estado: {config.status}</Text>
        </View>
        <View style={styles.pointWizardMark}>
          <CreditCard size={22} color={BLUE} strokeWidth={2.5} />
        </View>
      </View>

      <View style={styles.pointTabRow}>
        {wizardTabs.map((tab, index) => {
          const active = index === step;
          const complete = completedSteps[index];
          return (
            <Pressable
              accessibilityRole="button"
              key={tab}
              onPress={() => animateToStep(index)}
              style={[
                styles.pointTab,
                active && styles.pointTabActive,
                complete && styles.pointTabComplete,
              ]}
            >
              <Text
                style={[
                  styles.pointTabNumber,
                  active && styles.pointTabNumberActive,
                  complete && styles.pointTabNumberComplete,
                ]}
              >
                {complete ? 'OK' : index + 1}
              </Text>
              <Text
                style={[
                  styles.pointTabText,
                  active && styles.pointTabTextActive,
                ]}
              >
                {tab}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.pointProgressTrack}>
        <View
          style={[
            styles.pointProgressFill,
            { width: `${((step + 1) / wizardTabs.length) * 100}%` },
          ]}
        />
      </View>

      <Animated.View
        style={[
          styles.pointStepPanel,
          {
            opacity: fade,
            transform: [{ translateX: slide }],
          },
        ]}
      >
        <Text style={styles.tutorialStepCount}>
          Paso {step + 1} de {wizardTabs.length}
        </Text>
        <Text style={styles.tutorialTitle}>{activeStep.title}</Text>
        <Text style={styles.tutorialText}>{activeStep.text}</Text>
        {renderStepBody()}
      </Animated.View>

      <View style={styles.pointWizardActions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => animateToStep(Math.max(0, step - 1))}
          style={({ pressed }) => [
            styles.pointSecondaryAction,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.pointSecondaryActionText}>Paso anterior</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={completeStep}
          style={({ pressed }) => [
            styles.pointPrimaryAction,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.pointPrimaryActionText}>
            {step === wizardTabs.length - 1
              ? 'Guardar configuracion'
              : 'Completar paso'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function FlowStep({ label, text }: { label: string; text: string }) {
  return (
    <View style={styles.pointFlowStep}>
      <View style={styles.pointFlowBadge}>
        <Text style={styles.pointFlowBadgeText}>{label}</Text>
      </View>
      <Text style={styles.pointFlowText}>{text}</Text>
    </View>
  );
}

function AutomationSettingsView({
  onBack,
  onSave,
  settings,
}: {
  onBack: () => void;
  onSave: (settings: AutomationSettings) => void;
  settings: AutomationSettings;
}) {
  const [lowStockAlerts, setLowStockAlerts] = useState(settings.lowStockAlerts);
  const [debtReminders, setDebtReminders] = useState(settings.debtReminders);
  const [dailyCutReminder, setDailyCutReminder] = useState(settings.dailyCutReminder);
  const [reminderHour, setReminderHour] = useState(settings.reminderHour);

  return (
    <>
      <HeaderBack label="Alertas" onBack={onBack} />
      <View style={styles.formCard}>
        <ToggleSetting
          active={lowStockAlerts}
          onPress={() => setLowStockAlerts((current) => !current)}
          text="Avisa cuando un producto llegue a su minimo."
          title="Inventario bajo"
        />
        <ToggleSetting
          active={debtReminders}
          onPress={() => setDebtReminders((current) => !current)}
          text="Prepara recordatorios de cobranza para WhatsApp."
          title="Fiados y cobranza"
        />
        <ToggleSetting
          active={dailyCutReminder}
          onPress={() => setDailyCutReminder((current) => !current)}
          text="Recuerda revisar caja y ventas al cerrar."
          title="Corte del dia"
        />
        <Field label="Hora de recordatorio" onChangeText={setReminderHour} value={reminderHour} />
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            onSave({
              dailyCutReminder,
              debtReminders,
              lowStockAlerts,
              reminderHour,
            })
          }
          style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
        >
          <Check size={21} color="#FFFFFF" strokeWidth={2.8} />
          <Text style={styles.ctaButtonText}>Guardar alertas</Text>
        </Pressable>
      </View>
    </>
  );
}

function TicketSettingsView({
  onBack,
  onSave,
  profile,
  settings,
}: {
  onBack: () => void;
  onSave: (settings: TicketSettings) => void;
  profile: BusinessProfile;
  settings: TicketSettings;
}) {
  const [businessName, setBusinessName] = useState(
    settings.businessName || profile.name,
  );
  const [logoText, setLogoText] = useState(settings.logoText || profile.logoText);
  const [footer, setFooter] = useState(settings.footer);
  const [showPhone, setShowPhone] = useState(settings.showPhone);
  const [showAddress, setShowAddress] = useState(settings.showAddress);
  const [includeMicroAppBrand, setIncludeMicroAppBrand] = useState(
    settings.includeMicroAppBrand,
  );

  return (
    <>
      <HeaderBack label="Tickets" onBack={onBack} />
      <View style={styles.ticketPreviewCard}>
        <Text style={styles.ticketPreviewLogo}>{logoText || businessName}</Text>
        <Text style={styles.ticketPreviewTitle}>Ticket V-000024</Text>
        <Text style={styles.ticketPreviewLine}>2 x Producto - $49</Text>
        <Text style={styles.ticketPreviewTotal}>Total $49</Text>
        <Text style={styles.ticketPreviewFooter}>{footer}</Text>
        {includeMicroAppBrand && (
          <Text style={styles.ticketPreviewBrand}>Creado con MicroApp</Text>
        )}
      </View>
      <View style={styles.formCard}>
        <Field label="Nombre en ticket" onChangeText={setBusinessName} value={businessName} />
        <Field label="Texto de logo" onChangeText={setLogoText} value={logoText} />
        <Field label="Mensaje final" onChangeText={setFooter} value={footer} />
        <ToggleSetting
          active={showPhone}
          onPress={() => setShowPhone((current) => !current)}
          text="Muestra telefono del negocio si esta guardado."
          title="Mostrar telefono"
        />
        <ToggleSetting
          active={showAddress}
          onPress={() => setShowAddress((current) => !current)}
          text="Muestra ciudad/direccion cuando exista."
          title="Mostrar direccion"
        />
        <ToggleSetting
          active={includeMicroAppBrand}
          onPress={() => setIncludeMicroAppBrand((current) => !current)}
          text="Puedes dejar el ticket limpio o mostrar que fue creado con MicroApp."
          title="Marca MicroApp"
        />
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            onSave({
              businessName,
              footer,
              includeMicroAppBrand,
              logoText,
              showAddress,
              showPhone,
            })
          }
          style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
        >
          <Check size={21} color="#FFFFFF" strokeWidth={2.8} />
          <Text style={styles.ctaButtonText}>Guardar ticket</Text>
        </Pressable>
      </View>
    </>
  );
}

function InventoryTransferView({
  onBack,
  onExport,
  onImport,
}: {
  onBack: () => void;
  onExport: () => void;
  onImport: () => void;
}) {
  return (
    <>
      <HeaderBack label="Inventario digital" onBack={onBack} />
      <View style={styles.settingsIntro}>
        <View style={styles.settingsIcon}>
          <ReceiptText size={24} color={BLUE} strokeWidth={2.4} />
        </View>
        <View style={styles.settingsIntroCopy}>
          <Text style={styles.settingsIntroTitle}>Importa o exporta productos</Text>
          <Text style={styles.settingsIntroText}>
            Lee CSV, Excel o Word si el archivo tiene productos claros. El bot
            interno acomoda categorias automaticamente.
          </Text>
        </View>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.settingsSectionTitle}>Formato recomendado</Text>
        <InfoRow label="Columna 1" value="Producto" />
        <InfoRow label="Columna 2" value="Precio" />
        <InfoRow label="Columna 3" value="Cantidad" />
        <InfoRow label="Opcional" value="Categoria / costo" />
        <View style={styles.importHintCard}>
          <Text style={styles.importHintTitle}>Bot interno de categorias</Text>
          <Text style={styles.importHintText}>
            Frutas y verduras van a Alimentos; Coca Cola o Fresca a Refrescos;
            cerveza a Cerveza; cloro, jabon o detergente a Limpieza. Si no esta
            claro, queda en General.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onImport}
          style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
        >
          <Plus size={21} color="#FFFFFF" strokeWidth={2.8} />
          <Text style={styles.ctaButtonText}>Importar archivo</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onExport}
          style={({ pressed }) => [styles.outlineAction, pressed && styles.pressed]}
        >
          <ReceiptText size={20} color={BLUE} strokeWidth={2.4} />
          <Text style={styles.outlineActionText}>Exportar CSV</Text>
        </Pressable>
      </View>
    </>
  );
}

function BotSettingsView({
  accountPlan,
  onBack,
  onSave,
  settings,
}: {
  accountPlan: AccountPlan;
  onBack: () => void;
  onSave: (settings: BotSettings) => void;
  settings: BotSettings;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [pageName, setPageName] = useState(settings.pageName);
  const [connectedAccount, setConnectedAccount] = useState(settings.connectedAccount);
  const [defaultReply, setDefaultReply] = useState(settings.defaultReply);
  const [businessTone, setBusinessTone] = useState(settings.businessTone);
  const [autoDebtMessages, setAutoDebtMessages] = useState(
    settings.autoDebtMessages,
  );
  const [debtThreshold, setDebtThreshold] = useState(
    String(settings.debtThreshold || 300),
  );
  const [reminderEveryDays, setReminderEveryDays] = useState(
    String(settings.reminderEveryDays || 7),
  );
  const [reminderHour, setReminderHour] = useState(settings.reminderHour);
  const [requireHumanReview, setRequireHumanReview] = useState(
    settings.requireHumanReview,
  );
  const [facebookAppConnected, setFacebookAppConnected] = useState(
    settings.facebookAppConnected,
  );
  const [pagesPermission, setPagesPermission] = useState(
    settings.pagesPermission,
  );
  const [messengerPermission, setMessengerPermission] = useState(
    settings.messengerPermission,
  );
  const [leadsPermission, setLeadsPermission] = useState(
    settings.leadsPermission,
  );
  const [message, setMessage] = useState('');
  const businessEnabled = accountPlan.isBusinessActive;
  const status =
    facebookAppConnected && pagesPermission && messengerPermission
      ? 'Conectado'
      : facebookAppConnected || pagesPermission || messengerPermission || leadsPermission
        ? 'Permisos incompletos'
        : 'Permisos pendientes';

  const save = () => {
    if (!businessEnabled) {
      setMessage('Activa Negocio para conectar el bot.');
      return;
    }

    onSave({
      appConnectionStatus: status,
      autoDebtMessages,
      businessTone,
      channel: settings.channel,
      connectedAccount,
      debtThreshold: Number(debtThreshold.replace(/[^0-9.]/g, '')) || 0,
      defaultReply,
      enabled,
      facebookAppConnected,
      id: settings.id,
      leadsPermission,
      messengerPermission,
      pageName,
      pagesPermission,
      reminderEveryDays:
        Number(reminderEveryDays.replace(/[^0-9]/g, '')) || 7,
      reminderHour,
      requireHumanReview,
      updatedAt: settings.updatedAt,
    });
  };

  return (
    <>
      <HeaderBack label="Configura tu bot" onBack={onBack} />
      <View style={styles.settingsIntro}>
        <View style={styles.settingsIcon}>
          <Users size={24} color={BLUE} strokeWidth={2.4} />
        </View>
        <View style={styles.settingsIntroCopy}>
          <Text style={styles.settingsIntroTitle}>Bot interno del negocio</Text>
          <Text style={styles.settingsIntroText}>
            Define tono, permisos y recordatorios automaticos sin guardar tokens
            sensibles en el celular. Despues se conectara a canales externos.
          </Text>
        </View>
      </View>

      <View style={styles.botStatusCard}>
        <Text style={styles.planStatusLabel}>Estado</Text>
        <Text style={styles.planStatusTitle}>{status}</Text>
        <Text style={styles.planStatusText}>
          Plan Negocio: {businessEnabled ? 'activo' : 'inactivo'} | Renovacion
          en {accountPlan.daysRemaining} dias
        </Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.settingsSectionTitle}>Permisos de conexion futura</Text>
        <ToggleSetting
          active={facebookAppConnected}
          onPress={() => setFacebookAppConnected((current) => !current)}
          text="Autoriza que MicroApp se conecte con la app/cuenta del negocio."
          title="Conectar app"
        />
        <ToggleSetting
          active={pagesPermission}
          onPress={() => setPagesPermission((current) => !current)}
          text="Permite leer la pagina o perfil comercial vinculado."
          title="Permiso de pagina"
        />
        <ToggleSetting
          active={messengerPermission}
          onPress={() => setMessengerPermission((current) => !current)}
          text="Permite preparar respuestas para mensajes entrantes."
          title="Permiso de mensajes"
        />
        <ToggleSetting
          active={leadsPermission}
          onPress={() => setLeadsPermission((current) => !current)}
          text="Permite registrar contactos que lleguen por mensajes."
          title="Permiso de contactos"
        />

        <Field label="Pagina o perfil" onChangeText={setPageName} value={pageName} />
        <Field
          label="Cuenta conectada"
          onChangeText={setConnectedAccount}
          value={connectedAccount}
        />

        <Text style={styles.fieldLabel}>Como debe contestar</Text>
        <TextInput
          multiline
          onChangeText={setBusinessTone}
          placeholder="Ej. Responde amable, corto, con precios claros y pide telefono si quieren apartar."
          placeholderTextColor="#98A2B3"
          selectionColor={BLUE}
          style={[styles.fieldInput, styles.botTextArea]}
          value={businessTone}
        />
        <Text style={styles.fieldLabel}>Respuesta base</Text>
        <TextInput
          multiline
          onChangeText={setDefaultReply}
          placeholder="Mensaje inicial para clientes."
          placeholderTextColor="#98A2B3"
          selectionColor={BLUE}
          style={[styles.fieldInput, styles.botTextArea]}
          value={defaultReply}
        />

        <ToggleSetting
          active={enabled}
          onPress={() => setEnabled((current) => !current)}
          text="Cuando este activo, el bot queda listo para responder segun tus reglas."
          title="Activar bot"
        />
        <ToggleSetting
          active={requireHumanReview}
          onPress={() => setRequireHumanReview((current) => !current)}
          text="Revisa respuestas antes de enviarlas cuando el caso sea delicado."
          title="Revision humana"
        />

        <Text style={styles.settingsSectionTitle}>Mensajes por saldo</Text>
        <ToggleSetting
          active={autoDebtMessages}
          onPress={() => setAutoDebtMessages((current) => !current)}
          text="Programa recordatorios para clientes que superen cierto saldo."
          title="Cobranza automatica"
        />
        <Field
          keyboardType="numeric"
          label="Enviar si debe mas de"
          onChangeText={setDebtThreshold}
          value={debtThreshold}
        />
        <Field
          keyboardType="numeric"
          label="Repetir cada X dias"
          onChangeText={setReminderEveryDays}
          value={reminderEveryDays}
        />
        <Field label="Hora de envio" onChangeText={setReminderHour} value={reminderHour} />

        {!!message && <Text style={styles.formMessage}>{message}</Text>}
        <Pressable
          accessibilityRole="button"
          onPress={save}
          style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
        >
          <Check size={21} color="#FFFFFF" strokeWidth={2.8} />
          <Text style={styles.ctaButtonText}>Guardar bot</Text>
        </Pressable>
      </View>
    </>
  );
}

function BackupSettingsView({
  onBack,
  onRunBackup,
  onSave,
  settings,
}: {
  onBack: () => void;
  onRunBackup: () => void;
  onSave: (settings: Omit<BackupSettings, 'lastBackupAt'>) => void;
  settings: BackupSettings;
}) {
  const [cloudBackup, setCloudBackup] = useState(settings.cloudBackup);
  const [exportReminder, setExportReminder] = useState(settings.exportReminder);

  return (
    <>
      <HeaderBack label="Respaldo" onBack={onBack} />
      <View style={styles.settingsIntro}>
        <View style={styles.settingsIcon}>
          <ShieldCheck size={24} color={BLUE} strokeWidth={2.4} />
        </View>
        <View style={styles.settingsIntroCopy}>
          <Text style={styles.settingsIntroTitle}>Tus datos son tuyos</Text>
          <Text style={styles.settingsIntroText}>
            SQLite guarda la informacion local del backend y permite exportar.
          </Text>
        </View>
      </View>
      <View style={styles.formCard}>
        <ToggleSetting
          active={cloudBackup}
          onPress={() => setCloudBackup((current) => !current)}
          text="Preparado para nube cuando activemos cuentas reales."
          title="Respaldo en nube"
        />
        <ToggleSetting
          active={exportReminder}
          onPress={() => setExportReminder((current) => !current)}
          text="Recuerda descargar una copia mensual."
          title="Recordar exportacion"
        />
        <InfoRow
          label="Ultimo respaldo"
          value={settings.lastBackupAt ? 'Guardado' : 'Pendiente'}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => onSave({ cloudBackup, exportReminder })}
          style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
        >
          <Check size={21} color="#FFFFFF" strokeWidth={2.8} />
          <Text style={styles.ctaButtonText}>Guardar respaldo</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onRunBackup}
          style={({ pressed }) => [styles.outlineAction, pressed && styles.pressed]}
        >
          <ShieldCheck size={20} color={BLUE} strokeWidth={2.4} />
          <Text style={styles.outlineActionText}>Verificar SQLite</Text>
        </Pressable>
      </View>
    </>
  );
}

function MoreView({
  onAlerts,
  onBackup,
  onBot,
  onBusiness,
  onConnectPoint,
  onInventoryTransfer,
  onPlan,
  onTickets,
  plan,
  pointStatus,
}: {
  onAlerts: () => void;
  onBackup: () => void;
  onBot: () => void;
  onBusiness: () => void;
  onConnectPoint: () => void;
  onInventoryTransfer: () => void;
  onPlan: () => void;
  onTickets: () => void;
  plan: AccountPlan;
  pointStatus: PointConfig['status'];
}) {
  const businessActive = plan.isBusinessActive;

  return (
    <>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Mas</Text>
        <Menu size={23} color={NAVY} strokeWidth={2.4} />
      </View>
      <View style={styles.planStatusCard}>
        <Text style={styles.planStatusLabel}>Plan actual</Text>
        <Text style={styles.planStatusTitle}>
          {businessActive ? businessPlanLabel : includedPlanLabel}
        </Text>
        <Text style={styles.planStatusText}>
          {businessActive
            ? `${plan.daysRemaining} dias para renovar. Pro: ${plan.isProActive ? 'true' : 'false'} | Negocio: ${plan.isBusinessActive ? 'true' : 'false'}`
            : 'Funciones Pro incluidas gratis. Negocio queda como upgrade mensual.'}
        </Text>
      </View>
      <MoreRow
        icon={Store}
        label="Personalizar negocio"
        onPress={onBusiness}
        text="Logo, giro, ciudad, moneda y horario"
      />
      <MoreRow
        icon={ReceiptText}
        label="Importar / exportar inventario"
        onPress={onInventoryTransfer}
        text="CSV, Excel o Word con categorias automaticas"
      />
      <MoreRow
        icon={CreditCard}
        label="Vincular Mercado Pago Point"
        locked={!businessActive}
        onPress={onConnectPoint}
        text={
          pointStatus === 'Vinculada'
            ? 'Terminal vinculada, lista para ordenes Negocio'
            : businessActive
              ? 'Terminal, webhook y backend'
              : 'Plan Negocio: terminal, webhook y backend'
        }
      />
      <MoreRow
        icon={Users}
        label="Configura tu bot"
        onPress={onBot}
        text="Bot interno: respuestas, permisos y mensajes por saldo"
      />
      <MoreRow
        icon={Bell}
        label="Alertas automaticas"
        onPress={onAlerts}
        text="Incluidas para controlar stock y cierre"
      />
      <MoreRow
        icon={LockKeyhole}
        label="Tickets personalizados"
        onPress={onTickets}
        text="Sin marca obligatoria, logo y datos del negocio"
      />
      <MoreRow
        icon={ShieldCheck}
        label="Respaldo"
        onPress={onBackup}
        text="Tus datos son tuyos y podras exportarlos"
      />
      {businessActive && (
        <View style={styles.businessIncludedCard}>
          <Text style={styles.businessIncludedTitle}>Incluido en Negocio</Text>
          <PlanFeature text="Catalogo digital y pedidos por mensajes" />
          <PlanFeature text="Empleados, permisos y multi-dispositivo" />
          <PlanFeature text="Agenda, proveedores, compras y codigo de barras" />
          <PlanFeature text="Bot conectado a canales externos y cobranza automatica" />
        </View>
      )}
      {!businessActive && (
        <ProCard
          badge="NEGOCIO"
          linkText="Ver plan Negocio >"
          onPress={onPlan}
          title="Automatizacion y equipo"
          text="Catalogo, WhatsApp, empleados, permisos, agenda y Mercado Pago."
        />
      )}
    </>
  );
}

function PlansView({
  accountPlan,
  onBack,
  onBusinessPlan,
}: {
  accountPlan: AccountPlan;
  onBack: () => void;
  onBusinessPlan: () => void;
}) {
  return (
    <>
      <HeaderBack label="Planes" onBack={onBack} />
      <View style={styles.planStatusCard}>
        <Text style={styles.planStatusLabel}>Cuenta actual</Text>
        <Text style={styles.planStatusTitle}>{accountPlan.activePlan}</Text>
        <Text style={styles.planStatusText}>
          Pro: {accountPlan.isProActive ? 'true' : 'false'} | Negocio:{' '}
          {accountPlan.isBusinessActive ? 'true' : 'false'} | Renovacion en{' '}
          {accountPlan.daysRemaining} dias
        </Text>
      </View>
      <View style={styles.planHeroCard}>
        <Text style={styles.planBadge}>Incluido ahora</Text>
        <Text style={styles.planTitle}>Gratis</Text>
        <Text style={styles.planPrice}>{includedPlanLabel}</Text>
        <Text style={styles.planText}>
          Esta version gratis ya incluye lo necesario para usar MicroApp diario
          sin sentirla como demo.
        </Text>
        <PlanFeature text="Productos, ventas, clientes y deudas ilimitadas" />
        <PlanFeature text="Historial completo, reportes basicos y corte diario" />
        <PlanFeature text="Alertas de stock, tickets sin marca obligatoria y exportaciones" />
        <PlanFeature text="Respaldo preparado para cuentas reales" />
      </View>

      <View style={styles.planUpgradeCard}>
        <Text style={styles.planBadge}>Siguiente salto</Text>
        <Text style={styles.planTitle}>{businessPlanLabel}</Text>
        <Text style={styles.planPrice}>Automatizacion, equipo y ventas conectadas</Text>
        <Text style={styles.planText}>
          Para negocios que ya venden diario y quieren ahorrar tiempo, controlar
          empleados y vender mejor por WhatsApp.
        </Text>
        <PlanFeature text="Catalogo digital con link publico" />
        <PlanFeature text="Recordatorios de cobranza por WhatsApp" />
        <PlanFeature text="Empleados, permisos, multi-dispositivo y agenda" />
        <PlanFeature text="Compras, proveedores, codigo de barras y Mercado Pago" />
        <Pressable
          accessibilityRole="button"
          onPress={onBusinessPlan}
          style={({ pressed }) => [
            styles.planUpgradeButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.planUpgradeButtonText}>Preparar plan Negocio</Text>
        </Pressable>
      </View>
    </>
  );
}

function PlanFeature({ text }: { text: string }) {
  return (
    <View style={styles.planFeatureRow}>
      <CheckCircle2 size={18} color="#129A46" strokeWidth={2.6} />
      <Text style={styles.planFeatureText}>{text}</Text>
    </View>
  );
}

function SearchBox({
  onChangeText,
  placeholder,
  value,
}: {
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View style={styles.searchBox}>
      <Search size={20} color={MUTED} strokeWidth={2.4} />
      <TextInput
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#98A2B3"
        selectionColor={BLUE}
        style={styles.searchInput}
        value={value}
      />
    </View>
  );
}

function ProductThumb({
  index,
  large,
  small,
}: {
  index: number;
  large?: boolean;
  small?: boolean;
}) {
  return (
    <View
      style={[
        styles.productThumb,
        { backgroundColor: avatarColors[index % avatarColors.length] },
        small && styles.productThumbSmall,
        large && styles.productThumbLarge,
      ]}
    >
      <Package
        size={large ? 42 : small ? 24 : 30}
        color={index % 2 === 0 ? BLUE : NAVY}
        strokeWidth={2.2}
      />
    </View>
  );
}

function HeaderBack({
  label,
  onBack,
}: {
  label: string;
  onBack: () => void;
}) {
  return (
    <View style={styles.saleHeader}>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={styles.backIconButton}
      >
        <ArrowLeft size={24} color={NAVY} strokeWidth={2.4} />
      </Pressable>
      <Text style={styles.saleTitle}>{label}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function Field({
  keyboardType,
  label,
  onChangeText,
  secureTextEntry,
  value,
}: {
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
  label: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  value: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor="#98A2B3"
        secureTextEntry={secureTextEntry}
        selectionColor={BLUE}
        style={styles.fieldInput}
        value={value}
      />
    </View>
  );
}

function ToggleSetting({
  active,
  onPress,
  text,
  title,
}: {
  active: boolean;
  onPress: () => void;
  text: string;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}
    >
      <View style={[styles.toggleTrack, active && styles.toggleTrackActive]}>
        <View style={[styles.toggleThumb, active && styles.toggleThumbActive]} />
      </View>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleText}>{text}</Text>
      </View>
    </Pressable>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function SaleTicketCard({ sale }: { sale: Sale }) {
  return (
    <View style={styles.ticketCard}>
      <View style={styles.ticketTop}>
        <Text style={styles.ticketFolio}>{sale.folio}</Text>
        <Text style={styles.ticketStatus}>{sale.status}</Text>
      </View>
      {sale.items.map((item) => (
        <Text key={`${sale.id}-${item.productId}`} style={styles.ticketLine}>
          {item.quantity} x {item.productName} - {currency(item.subtotal)}
        </Text>
      ))}
      <View style={styles.cartDivider} />
      <Text style={styles.ticketTotal}>Total {currency(sale.total)}</Text>
    </View>
  );
}

function EmptyStateCard({
  action,
  onAction,
  text,
  title,
}: {
  action?: string;
  onAction?: () => void;
  text: string;
  title: string;
}) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
      {!!action && !!onAction && (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [
            styles.emptyButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.emptyButtonText}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

function ProCard({
  badge = 'PLAN',
  linkText = 'Ver detalles >',
  onPress,
  text,
  title,
}: {
  badge?: string;
  linkText?: string;
  onPress: () => void;
  text: string;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.proCard, pressed && styles.pressed]}
    >
      <View style={styles.proIcon}>
        <LockKeyhole size={25} color={NAVY} strokeWidth={2.4} />
      </View>
      <View style={styles.proCopy}>
        <View style={styles.proTitleRow}>
          <Text style={styles.proTitle}>{title}</Text>
          <View style={styles.proBadge}>
            <Text style={styles.proBadgeText}>{badge}</Text>
          </View>
        </View>
        <Text style={styles.proText}>{text}</Text>
        <Text style={styles.proLink}>{linkText}</Text>
      </View>
    </Pressable>
  );
}

function MoreRow({
  icon: Icon,
  label,
  locked,
  onPress,
  text,
}: {
  icon: IconComponent;
  label: string;
  locked?: boolean;
  onPress?: () => void;
  text: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.moreRow, pressed && styles.pressed]}
    >
      <View style={[styles.moreIcon, locked && styles.moreIconLocked]}>
        <Icon
          size={21}
          color={locked ? '#F97316' : BLUE}
          strokeWidth={2.4}
        />
      </View>
      <View style={styles.moreBody}>
        <Text style={styles.moreLabel}>{label}</Text>
        <Text style={styles.moreText}>{text}</Text>
      </View>
      <ChevronRight size={19} color={MUTED} strokeWidth={2.3} />
    </Pressable>
  );
}

function NavButton({
  active,
  icon: Icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: IconComponent;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
    >
      <Icon
        size={21}
        color={active ? BLUE : '#667085'}
        strokeWidth={active ? 2.8 : 2.2}
      />
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  shell: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    flex: 1,
    maxWidth: 430,
    position: 'relative',
    width: '100%',
  },
  scroller: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 104,
    paddingHorizontal: 14,
    paddingTop: 18,
  },
  fullScreenScrollContent: {
    flexGrow: 1,
    paddingBottom: 18,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  dashboardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  dashboardIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    paddingRight: 10,
  },
  dashboardLogo: {
    alignItems: 'center',
    backgroundColor: '#EAF1FF',
    borderRadius: 8,
    height: 46,
    justifyContent: 'center',
    marginRight: 11,
    overflow: 'hidden',
    width: 46,
  },
  dashboardLogoImage: {
    height: '100%',
    width: '100%',
  },
  dashboardTitleCopy: {
    flex: 1,
  },
  headerEyebrow: {
    color: NAVY,
    fontSize: 17,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
  },
  headerTitle: {
    color: NAVY,
    fontSize: 29,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    lineHeight: 32,
  },
  bellButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  globalNotice: {
    alignItems: 'center',
    backgroundColor: '#ECFDF3',
    borderColor: '#ABEFC6',
    borderRadius: 8,
    borderWidth: 1,
    bottom: 86,
    flexDirection: 'row',
    left: 14,
    minHeight: 44,
    paddingHorizontal: 12,
    position: 'absolute',
    right: 14,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    zIndex: 20,
  },
  globalNoticeFullScreen: {
    bottom: 18,
  },
  noticeText: {
    color: '#067647',
    flex: 1,
    fontSize: 13,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    marginLeft: 8,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAECF0',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 168,
    padding: 16,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    width: '48.7%',
  },
  metricIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    marginBottom: 16,
    width: 42,
  },
  blueSoft: {
    backgroundColor: '#EAF1FF',
  },
  orangeSoft: {
    backgroundColor: '#FFF3E8',
  },
  greenSoft: {
    backgroundColor: '#EAF8EF',
  },
  violetSoft: {
    backgroundColor: '#F0EEFF',
  },
  metricLabel: {
    color: NAVY,
    fontSize: 13,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    lineHeight: 18,
  },
  metricValue: {
    color: NAVY,
    fontSize: 32,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginTop: 8,
  },
  metricExtra: {
    color: BLUE,
    fontSize: 12,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginTop: -2,
  },
  metricLink: {
    color: BLUE,
    fontSize: 12,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    marginTop: 'auto',
  },
  metricArrow: {
    fontSize: 17,
  },
  ctaButton: {
    alignItems: 'center',
    backgroundColor: BLUE,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 58,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    marginLeft: 10,
  },
  outlineAction: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 56,
  },
  outlineActionText: {
    color: BLUE,
    fontSize: 15,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    marginLeft: 9,
  },
  usageRewardCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#EAECF0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 14,
    padding: 14,
  },
  usageRewardIcon: {
    alignItems: 'center',
    backgroundColor: '#EAF1FF',
    borderRadius: 8,
    height: 46,
    justifyContent: 'center',
    marginRight: 12,
    width: 46,
  },
  usageRewardCopy: {
    flex: 1,
  },
  usageRewardTitle: {
    color: NAVY,
    fontFamily: appFonts.bold,
    fontSize: 15,
    letterSpacing: 0,
  },
  usageRewardText: {
    color: MUTED,
    fontFamily: appFonts.medium,
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 17,
    marginTop: 4,
  },
  usageProgressTrack: {
    backgroundColor: '#EAECF0',
    borderRadius: 8,
    height: 7,
    marginTop: 10,
    overflow: 'hidden',
  },
  usageProgressFill: {
    backgroundColor: BLUE,
    borderRadius: 8,
    height: 7,
  },
  proCard: {
    alignItems: 'flex-start',
    backgroundColor: '#F3F8FF',
    borderColor: '#CFE0FF',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 18,
    padding: 18,
  },
  proIcon: {
    alignItems: 'center',
    backgroundColor: '#EAF1FF',
    borderRadius: 8,
    height: 54,
    justifyContent: 'center',
    marginRight: 16,
    width: 54,
  },
  proCopy: {
    flex: 1,
  },
  proTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  proTitle: {
    color: NAVY,
    fontSize: 16,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  proBadge: {
    backgroundColor: '#EAF1FF',
    borderColor: '#A9C7FF',
    borderRadius: 6,
    borderWidth: 1,
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  proBadgeText: {
    color: BLUE,
    fontSize: 10,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  proText: {
    color: '#344054',
    fontSize: 12,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
    lineHeight: 18,
    marginTop: 8,
  },
  proLink: {
    color: BLUE,
    fontSize: 12,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginTop: 12,
  },
  planHeroCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D6E4FF',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 18,
  },
  planStatusCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D6E4FF',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
  },
  botStatusCard: {
    backgroundColor: '#F8FBFF',
    borderColor: '#BFD5FF',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
  },
  planStatusLabel: {
    color: BLUE,
    fontSize: 11,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  planStatusTitle: {
    color: NAVY,
    fontSize: 20,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginTop: 4,
  },
  planStatusText: {
    color: '#475467',
    fontSize: 12,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
    lineHeight: 18,
    marginTop: 6,
  },
  businessIncludedCard: {
    backgroundColor: '#F8FBFF',
    borderColor: '#BFD5FF',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  businessIncludedTitle: {
    color: NAVY,
    fontSize: 15,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginBottom: 4,
  },
  planUpgradeCard: {
    backgroundColor: '#F8FBFF',
    borderColor: '#BFD5FF',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 18,
  },
  planBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EAF1FF',
    borderColor: '#A9C7FF',
    borderRadius: 6,
    borderWidth: 1,
    color: BLUE,
    fontSize: 11,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginBottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
  planTitle: {
    color: NAVY,
    fontSize: 24,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  planPrice: {
    color: BLUE,
    fontSize: 14,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginTop: 4,
  },
  planText: {
    color: '#475467',
    fontSize: 14,
    fontFamily: appFonts.regular,
    letterSpacing: 0,
    lineHeight: 21,
    marginBottom: 12,
    marginTop: 10,
  },
  planFeatureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 9,
  },
  planFeatureText: {
    color: NAVY,
    flex: 1,
    fontSize: 13,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
    lineHeight: 19,
    marginLeft: 9,
  },
  planUpgradeButton: {
    alignItems: 'center',
    backgroundColor: BLUE,
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 50,
  },
  planUpgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  slimCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAECF0',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  slimTitle: {
    color: NAVY,
    fontSize: 15,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  slimText: {
    color: MUTED,
    fontSize: 12,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
    lineHeight: 17,
    marginTop: 5,
  },
  pageHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  pageTitle: {
    color: NAVY,
    fontSize: 28,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  headerAmount: {
    color: BLUE,
    fontSize: 18,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  iconButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  iconButtonMuted: {
    opacity: 0.45,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  searchInput: {
    color: NAVY,
    flex: 1,
    fontSize: 14,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
    marginLeft: 10,
    minWidth: 0,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 14,
  },
  filterChip: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 39,
    paddingHorizontal: 15,
  },
  filterChipActive: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },
  filterChipText: {
    color: NAVY,
    fontSize: 12,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  inventoryProgress: {
    marginBottom: 14,
    marginTop: 18,
  },
  inventoryProgressTop: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 10,
  },
  inventoryProgressText: {
    color: NAVY,
    flex: 1,
    fontSize: 14,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    marginLeft: 10,
  },
  progressTrack: {
    backgroundColor: '#EAECF0',
    borderRadius: 8,
    height: 8,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: BLUE,
    borderRadius: 8,
    height: 8,
  },
  productCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#EAECF0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 12,
    minHeight: 112,
    padding: 14,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
  },
  productThumb: {
    alignItems: 'center',
    borderRadius: 8,
    height: 70,
    justifyContent: 'center',
    marginRight: 14,
    width: 70,
  },
  productThumbSmall: {
    height: 54,
    width: 54,
  },
  productThumbLarge: {
    alignSelf: 'center',
    height: 110,
    marginBottom: 14,
    marginRight: 0,
    width: 110,
  },
  productCardBody: {
    flex: 1,
  },
  productCardTitle: {
    color: NAVY,
    fontSize: 16,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginBottom: 10,
  },
  productFacts: {
    flexDirection: 'row',
    gap: 34,
  },
  productFactLabel: {
    color: MUTED,
    fontSize: 12,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
  },
  productStock: {
    color: BLUE,
    fontSize: 17,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginTop: 1,
  },
  productStockWarning: {
    color: '#F97316',
  },
  productPrice: {
    color: NAVY,
    fontSize: 17,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginTop: 1,
  },
  lowStockChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF3E8',
    borderRadius: 6,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  lowStockText: {
    color: '#C2410C',
    fontSize: 11,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  saleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backIconButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  saleTitle: {
    color: NAVY,
    fontSize: 20,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  headerSpacer: {
    width: 42,
  },
  saleSearchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  scanButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
    borderRadius: 8,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  stockMenuCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAECF0',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  stockMenuHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 78,
    paddingHorizontal: 14,
  },
  stockMenuIcon: {
    alignItems: 'center',
    backgroundColor: '#EAF1FF',
    borderRadius: 8,
    height: 46,
    justifyContent: 'center',
    marginRight: 12,
    width: 46,
  },
  stockMenuCopy: {
    flex: 1,
  },
  stockMenuTitle: {
    color: NAVY,
    fontFamily: appFonts.bold,
    fontSize: 15,
    letterSpacing: 0,
  },
  stockMenuText: {
    color: MUTED,
    fontFamily: appFonts.medium,
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 17,
    marginTop: 4,
  },
  stockMenuChevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  stockMenuList: {
    borderTopColor: '#EAECF0',
    borderTopWidth: 1,
    padding: 10,
    paddingBottom: 2,
  },
  stockMenuHint: {
    color: MUTED,
    fontFamily: appFonts.medium,
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 17,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  saleProductCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#EAECF0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 8,
    minHeight: 76,
    paddingHorizontal: 12,
  },
  saleProductBody: {
    flex: 1,
    marginLeft: 12,
  },
  saleProductName: {
    color: NAVY,
    fontSize: 15,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  saleProductPrice: {
    color: NAVY,
    fontSize: 14,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginTop: 5,
  },
  addCircle: {
    alignItems: 'center',
    borderColor: BLUE,
    borderRadius: 18,
    borderWidth: 1.5,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  cartCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAECF0',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 16,
  },
  cartHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cartTitle: {
    color: NAVY,
    fontSize: 15,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  cartLine: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cartLineLeft: {
    flex: 1,
  },
  cartLineName: {
    color: NAVY,
    fontSize: 14,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
  },
  qtyControls: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 7,
  },
  qtyButton: {
    alignItems: 'center',
    backgroundColor: '#F3F8FF',
    borderRadius: 6,
    height: 24,
    justifyContent: 'center',
    width: 28,
  },
  qtyButtonText: {
    color: BLUE,
    fontSize: 16,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    lineHeight: 18,
  },
  cartLineTotal: {
    color: NAVY,
    fontSize: 16,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginLeft: 12,
  },
  emptyCartText: {
    color: MUTED,
    fontSize: 13,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
    lineHeight: 18,
  },
  cartDivider: {
    backgroundColor: '#EAECF0',
    height: 1,
    marginVertical: 12,
  },
  cartTotalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  subtotalText: {
    color: NAVY,
    fontSize: 13,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
  },
  totalLabel: {
    color: NAVY,
    fontSize: 20,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  totalValue: {
    color: NAVY,
    fontSize: 27,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  sectionLabel: {
    color: NAVY,
    fontSize: 14,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    marginBottom: 8,
    marginTop: 14,
  },
  paymentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  paymentChip: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 74,
  },
  paymentChipActive: {
    backgroundColor: '#F3F8FF',
    borderColor: BLUE,
  },
  paymentChipText: {
    color: NAVY,
    fontSize: 11,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    marginTop: 7,
  },
  paymentChipTextActive: {
    color: BLUE,
  },
  pointCard: {
    alignItems: 'center',
    backgroundColor: '#F3F8FF',
    borderColor: '#CFE0FF',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 10,
    minHeight: 92,
    padding: 14,
  },
  pointIcon: {
    alignItems: 'center',
    backgroundColor: '#EAF1FF',
    borderRadius: 8,
    height: 46,
    justifyContent: 'center',
    marginRight: 12,
    width: 46,
  },
  pointBody: {
    flex: 1,
  },
  pointTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  pointTitle: {
    color: NAVY,
    fontFamily: appFonts.semiBold,
    fontSize: 14,
    letterSpacing: 0,
  },
  pointText: {
    color: '#344054',
    fontFamily: appFonts.regular,
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 17,
    marginTop: 6,
  },
  pointWizardScreen: {
    flex: 1,
    minHeight: 820,
    paddingBottom: 16,
    paddingHorizontal: 14,
    paddingTop: 18,
  },
  pointWizardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 16,
  },
  pointWizardHeaderCopy: {
    flex: 1,
    marginLeft: 4,
  },
  pointWizardTitle: {
    color: NAVY,
    fontFamily: appFonts.bold,
    fontSize: 22,
    letterSpacing: 0,
  },
  pointWizardStatus: {
    color: MUTED,
    fontFamily: appFonts.medium,
    fontSize: 12,
    letterSpacing: 0,
    marginTop: 3,
  },
  pointWizardMark: {
    alignItems: 'center',
    backgroundColor: '#EAF1FF',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  pointTabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  pointTab: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 42,
    paddingHorizontal: 9,
    width: '31.8%',
  },
  pointTabActive: {
    backgroundColor: '#F3F8FF',
    borderColor: BLUE,
  },
  pointTabComplete: {
    borderColor: '#17B26A',
  },
  pointTabNumber: {
    color: MUTED,
    fontFamily: appFonts.bold,
    fontSize: 12,
    letterSpacing: 0,
    marginRight: 6,
  },
  pointTabNumberActive: {
    color: BLUE,
  },
  pointTabNumberComplete: {
    color: '#129A46',
  },
  pointTabText: {
    color: NAVY,
    flex: 1,
    fontFamily: appFonts.semiBold,
    fontSize: 11,
    letterSpacing: 0,
  },
  pointTabTextActive: {
    color: BLUE,
  },
  pointProgressTrack: {
    backgroundColor: '#EAECF0',
    borderRadius: 8,
    height: 8,
    marginBottom: 14,
    overflow: 'hidden',
  },
  pointProgressFill: {
    backgroundColor: BLUE,
    borderRadius: 8,
    height: 8,
  },
  pointStepPanel: {
    backgroundColor: '#F3F8FF',
    borderColor: '#CFE0FF',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 440,
    padding: 18,
  },
  pointFieldHint: {
    color: '#344054',
    fontFamily: appFonts.medium,
    fontSize: 13,
    letterSpacing: 0,
    lineHeight: 19,
    marginBottom: 14,
    marginTop: 14,
  },
  pointMiniAction: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  pointMiniActionText: {
    color: BLUE,
    fontFamily: appFonts.semiBold,
    fontSize: 13,
    letterSpacing: 0,
  },
  pointFlowList: {
    gap: 10,
    marginTop: 16,
  },
  pointFlowStep: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: 12,
  },
  pointFlowBadge: {
    alignItems: 'center',
    backgroundColor: '#EAF1FF',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    marginRight: 10,
    width: 34,
  },
  pointFlowBadgeText: {
    color: BLUE,
    fontFamily: appFonts.bold,
    fontSize: 13,
    letterSpacing: 0,
  },
  pointFlowText: {
    color: NAVY,
    flex: 1,
    fontFamily: appFonts.semiBold,
    fontSize: 13,
    letterSpacing: 0,
    lineHeight: 18,
  },
  pointWizardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  pointSecondaryAction: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
  },
  pointSecondaryActionText: {
    color: NAVY,
    fontFamily: appFonts.semiBold,
    fontSize: 14,
    letterSpacing: 0,
  },
  pointPrimaryAction: {
    alignItems: 'center',
    backgroundColor: BLUE,
    borderRadius: 8,
    flex: 1.25,
    justifyContent: 'center',
    minHeight: 56,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
  },
  pointPrimaryActionText: {
    color: '#FFFFFF',
    fontFamily: appFonts.semiBold,
    fontSize: 14,
    letterSpacing: 0,
  },
  clientChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  clientChip: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  clientChipActive: {
    backgroundColor: '#F3F8FF',
    borderColor: BLUE,
  },
  clientChipText: {
    color: NAVY,
    fontSize: 12,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
  },
  clientChipTextActive: {
    color: BLUE,
  },
  successBanner: {
    alignItems: 'center',
    backgroundColor: '#ECFDF3',
    borderColor: '#ABEFC6',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 14,
    minHeight: 64,
    paddingHorizontal: 14,
  },
  successIcon: {
    alignItems: 'center',
    backgroundColor: '#17B26A',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    marginRight: 12,
    width: 36,
  },
  successBannerCopy: {
    flex: 1,
  },
  successBannerTitle: {
    color: '#14532D',
    fontSize: 15,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  successBannerText: {
    color: '#14532D',
    fontSize: 12,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
    marginTop: 2,
  },
  chargeButton: {
    alignItems: 'center',
    backgroundColor: BLUE,
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 58,
  },
  chargeButtonDisabled: {
    opacity: 0.55,
  },
  chargeButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAECF0',
    borderRadius: 8,
    borderWidth: 1,
    padding: 18,
  },
  detailTitle: {
    color: NAVY,
    fontSize: 24,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginBottom: 14,
    textAlign: 'center',
  },
  infoRow: {
    alignItems: 'center',
    borderTopColor: '#EAECF0',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
  },
  infoLabel: {
    color: MUTED,
    fontSize: 13,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
  },
  infoValue: {
    color: NAVY,
    fontSize: 14,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAECF0',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  logoEditorRow: {
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 12,
    padding: 12,
  },
  logoEditorPreview: {
    alignItems: 'center',
    backgroundColor: '#EAF1FF',
    borderRadius: 8,
    height: 58,
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
    width: 58,
  },
  logoEditorImage: {
    height: '100%',
    width: '100%',
  },
  logoEditorCopy: {
    flex: 1,
  },
  logoEditorTitle: {
    color: NAVY,
    fontSize: 14,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  logoEditorText: {
    color: MUTED,
    fontSize: 12,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
    lineHeight: 17,
    marginTop: 4,
  },
  fieldGroup: {
    marginBottom: 13,
  },
  fieldLabel: {
    color: NAVY,
    fontSize: 13,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginBottom: 7,
  },
  fieldInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
    borderRadius: 8,
    borderWidth: 1,
    color: NAVY,
    fontSize: 15,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
    minHeight: 52,
    paddingHorizontal: 13,
  },
  botTextArea: {
    minHeight: 92,
    paddingTop: 13,
    textAlignVertical: 'top',
  },
  formMessage: {
    color: '#C2410C',
    fontSize: 12,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    marginTop: 2,
  },
  categoryPicker: {
    marginBottom: 12,
  },
  categoryChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  categoryChipActive: {
    backgroundColor: '#EAF1FF',
    borderColor: BLUE,
  },
  categoryChipText: {
    color: NAVY,
    fontSize: 12,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
  },
  categoryChipTextActive: {
    color: BLUE,
  },
  importHintCard: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 14,
    padding: 12,
  },
  importHintTitle: {
    color: NAVY,
    fontSize: 14,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  importHintText: {
    color: '#475467',
    fontSize: 12,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
    lineHeight: 18,
    marginTop: 5,
  },
  settingsIntro: {
    alignItems: 'center',
    backgroundColor: '#F3F8FF',
    borderColor: '#CFE0FF',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 14,
    padding: 14,
  },
  settingsIcon: {
    alignItems: 'center',
    backgroundColor: '#EAF1FF',
    borderRadius: 8,
    height: 46,
    justifyContent: 'center',
    marginRight: 12,
    width: 46,
  },
  settingsIntroCopy: {
    flex: 1,
  },
  settingsIntroTitle: {
    color: NAVY,
    fontFamily: appFonts.bold,
    fontSize: 15,
    letterSpacing: 0,
  },
  settingsIntroText: {
    color: '#344054',
    fontFamily: appFonts.medium,
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 18,
    marginTop: 4,
  },
  settingsSectionTitle: {
    color: NAVY,
    fontFamily: appFonts.bold,
    fontSize: 16,
    letterSpacing: 0,
    marginBottom: 12,
  },
  pointSetupHero: {
    backgroundColor: '#F3F8FF',
    borderColor: '#CFE0FF',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16,
  },
  pointSetupTop: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 14,
  },
  tutorialProgress: {
    backgroundColor: '#DCEBFF',
    borderRadius: 8,
    height: 8,
    overflow: 'hidden',
  },
  tutorialProgressFill: {
    backgroundColor: BLUE,
    borderRadius: 8,
    height: 8,
  },
  tutorialStepCount: {
    color: BLUE,
    fontFamily: appFonts.bold,
    fontSize: 12,
    letterSpacing: 0,
    marginTop: 12,
  },
  tutorialTitle: {
    color: NAVY,
    fontFamily: appFonts.bold,
    fontSize: 18,
    letterSpacing: 0,
    marginTop: 5,
  },
  tutorialText: {
    color: '#344054',
    fontFamily: appFonts.medium,
    fontSize: 13,
    letterSpacing: 0,
    lineHeight: 19,
    marginTop: 6,
  },
  tutorialButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  tutorialButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  tutorialButtonPrimary: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },
  tutorialButtonText: {
    color: NAVY,
    fontFamily: appFonts.semiBold,
    fontSize: 13,
    letterSpacing: 0,
  },
  tutorialButtonPrimaryText: {
    color: '#FFFFFF',
    fontFamily: appFonts.semiBold,
    fontSize: 13,
    letterSpacing: 0,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  segmentedButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  segmentedButtonActive: {
    backgroundColor: '#F3F8FF',
    borderColor: BLUE,
  },
  segmentedButtonText: {
    color: NAVY,
    fontFamily: appFonts.semiBold,
    fontSize: 13,
    letterSpacing: 0,
  },
  segmentedButtonTextActive: {
    color: BLUE,
  },
  toggleRow: {
    alignItems: 'center',
    borderBottomColor: '#EAECF0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 72,
  },
  toggleTrack: {
    backgroundColor: '#D0D5DD',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    marginRight: 12,
    paddingHorizontal: 3,
    width: 48,
  },
  toggleTrackActive: {
    backgroundColor: BLUE,
  },
  toggleThumb: {
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    height: 22,
    width: 22,
  },
  toggleThumbActive: {
    marginLeft: 20,
  },
  toggleCopy: {
    flex: 1,
  },
  toggleTitle: {
    color: NAVY,
    fontFamily: appFonts.bold,
    fontSize: 14,
    letterSpacing: 0,
  },
  toggleText: {
    color: MUTED,
    fontFamily: appFonts.medium,
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: 17,
    marginTop: 3,
  },
  ticketPreviewCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAECF0',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
  },
  ticketPreviewLogo: {
    color: NAVY,
    fontFamily: appFonts.bold,
    fontSize: 17,
    letterSpacing: 0,
    marginBottom: 10,
  },
  ticketPreviewTitle: {
    color: BLUE,
    fontFamily: appFonts.bold,
    fontSize: 14,
    letterSpacing: 0,
  },
  ticketPreviewLine: {
    color: NAVY,
    fontFamily: appFonts.medium,
    fontSize: 13,
    letterSpacing: 0,
    marginTop: 8,
  },
  ticketPreviewTotal: {
    color: NAVY,
    fontFamily: appFonts.bold,
    fontSize: 18,
    letterSpacing: 0,
    marginTop: 10,
  },
  ticketPreviewFooter: {
    color: MUTED,
    fontFamily: appFonts.medium,
    fontSize: 12,
    letterSpacing: 0,
    marginTop: 10,
  },
  ticketPreviewBrand: {
    color: BLUE,
    fontFamily: appFonts.bold,
    fontSize: 11,
    letterSpacing: 0,
    marginTop: 8,
  },
  twoButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  halfOutlineButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D0D5DD',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 52,
  },
  halfOutlineText: {
    color: BLUE,
    fontSize: 14,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
    marginLeft: 8,
  },
  customerCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#EAECF0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 10,
    minHeight: 88,
    padding: 13,
  },
  customerAvatar: {
    alignItems: 'center',
    backgroundColor: '#EAF8EF',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    marginRight: 12,
    width: 48,
  },
  customerBody: {
    flex: 1,
  },
  customerName: {
    color: NAVY,
    fontSize: 15,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  customerMeta: {
    color: MUTED,
    fontSize: 12,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
    marginTop: 3,
  },
  customerNote: {
    color: MUTED,
    fontSize: 12,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
    marginTop: 5,
  },
  customerDebt: {
    color: MUTED,
    fontSize: 12,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
    marginLeft: 10,
  },
  customerDebtWarning: {
    color: '#F97316',
  },
  moreRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#EAECF0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 10,
    minHeight: 76,
    paddingHorizontal: 14,
  },
  moreIcon: {
    alignItems: 'center',
    backgroundColor: '#EAF1FF',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    marginRight: 12,
    width: 44,
  },
  moreIconLocked: {
    backgroundColor: '#FFF3E8',
  },
  moreBody: {
    flex: 1,
  },
  moreLabel: {
    color: NAVY,
    fontSize: 15,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  moreText: {
    color: MUTED,
    fontSize: 12,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
    lineHeight: 17,
    marginTop: 4,
  },
  ticketCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAECF0',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 14,
  },
  ticketTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  ticketFolio: {
    color: NAVY,
    fontSize: 16,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  ticketStatus: {
    color: '#129A46',
    fontSize: 12,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  ticketLine: {
    color: NAVY,
    fontSize: 13,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
    marginTop: 5,
  },
  ticketTotal: {
    color: NAVY,
    fontSize: 17,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  emptyCard: {
    alignItems: 'flex-start',
    backgroundColor: '#F9FAFB',
    borderColor: '#EAECF0',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 16,
  },
  emptyTitle: {
    color: NAVY,
    fontSize: 17,
    fontFamily: appFonts.bold,
    letterSpacing: 0,
  },
  emptyText: {
    color: MUTED,
    fontSize: 13,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
    lineHeight: 19,
    marginTop: 6,
  },
  emptyButton: {
    backgroundColor: BLUE,
    borderRadius: 8,
    marginTop: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: appFonts.semiBold,
    letterSpacing: 0,
  },
  floatingAdd: {
    alignItems: 'center',
    backgroundColor: BLUE,
    borderRadius: 28,
    bottom: 88,
    height: 58,
    justifyContent: 'center',
    position: 'absolute',
    right: 18,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.26,
    shadowRadius: 18,
    width: 58,
    zIndex: 3,
  },
  bottomNav: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopColor: '#EAECF0',
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    height: 76,
    justifyContent: 'space-around',
    left: 0,
    paddingBottom: 6,
    paddingHorizontal: 6,
    position: 'absolute',
    right: 0,
  },
  navButton: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 58,
  },
  navLabel: {
    color: '#667085',
    fontSize: 10,
    fontFamily: appFonts.medium,
    letterSpacing: 0,
    marginTop: 5,
  },
  navLabelActive: {
    color: BLUE,
    fontFamily: appFonts.bold,
  },
  pressed: {
    opacity: 0.72,
  },
});
