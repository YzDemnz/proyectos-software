const express = require('express');
const cors = require('cors');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const helmet = require('helmet');
const rateLimitModule = require('express-rate-limit');
const {
  all,
  databasePath,
  get,
  makeId,
  nextSaleFolio,
  openDatabase,
  run,
  transaction,
} = require('./database');

const rateLimit = rateLimitModule.rateLimit || rateLimitModule;
const PORT = Number(process.env.MICROAPP_BACKEND_PORT || 4001);
const API_LIMIT_PER_MINUTE = Number(process.env.MICROAPP_API_LIMIT_PER_MINUTE || 120);
const SECURITY_LIMIT_PER_MINUTE = Number(
  process.env.MICROAPP_SECURITY_LIMIT_PER_MINUTE || 10,
);
const WEBHOOK_LIMIT_PER_MINUTE = Number(
  process.env.MICROAPP_WEBHOOK_LIMIT_PER_MINUTE || 60,
);
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:19006',
  'http://127.0.0.1:19006',
];
const SECURITY_ADMIN_PATH = path.join(__dirname, 'data', 'security-admin.json');
const PBKDF2_ITERATIONS = 310000;

function now() {
  return new Date().toISOString();
}

function bool(value) {
  return value ? 1 : 0;
}

function asBool(value) {
  return Boolean(value);
}

function readSecurityAdmin() {
  if (
    process.env.MICROAPP_SECURITY_ADMIN_USER &&
    process.env.MICROAPP_SECURITY_ADMIN_PASSWORD_HASH &&
    process.env.MICROAPP_SECURITY_ADMIN_SALT
  ) {
    return {
      createdAt: process.env.MICROAPP_SECURITY_ADMIN_CREATED_AT || '',
      iterations: Number(
        process.env.MICROAPP_SECURITY_ADMIN_ITERATIONS || PBKDF2_ITERATIONS,
      ),
      passwordHash: process.env.MICROAPP_SECURITY_ADMIN_PASSWORD_HASH,
      salt: process.env.MICROAPP_SECURITY_ADMIN_SALT,
      username: process.env.MICROAPP_SECURITY_ADMIN_USER,
    };
  }

  if (!fs.existsSync(SECURITY_ADMIN_PATH)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(SECURITY_ADMIN_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function hashAdminPassword(password, salt, iterations = PBKDF2_ITERATIONS) {
  return crypto
    .pbkdf2Sync(String(password), String(salt), iterations, 32, 'sha256')
    .toString('base64url');
}

function timingSafeTextEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseBasicAuth(req) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Basic ')) {
    return null;
  }

  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
      return null;
    }

    return {
      password: decoded.slice(separatorIndex + 1),
      username: decoded.slice(0, separatorIndex),
    };
  } catch {
    return null;
  }
}

function hasSecurityAccess(req) {
  const admin = readSecurityAdmin();
  const credentials = parseBasicAuth(req);
  if (!admin || !credentials) {
    return false;
  }

  const passwordHash = hashAdminPassword(
    credentials.password,
    admin.salt,
    admin.iterations,
  );

  return (
    timingSafeTextEqual(credentials.username, admin.username) &&
    timingSafeTextEqual(passwordHash, admin.passwordHash)
  );
}

function requireSecurityAdmin(req, res, next) {
  if (hasSecurityAccess(req)) {
    next();
    return;
  }

  res
    .status(401)
    .set('WWW-Authenticate', 'Basic realm="MicroApp Security"')
    .json({
      error: 'Cuenta de administrador requerida.',
    });
}

function allowedOrigins() {
  const configured = process.env.MICROAPP_ALLOWED_ORIGINS;
  if (!configured) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function encryptionKey() {
  const secret =
    process.env.MICROAPP_SECRET_KEY ||
    'microapp-local-dev-secret-change-before-production';
  return crypto.createHash('sha256').update(secret).digest();
}

function isEncryptedSecret(value) {
  return typeof value === 'string' && value.startsWith('enc:v1:');
}

function encryptSecret(value) {
  if (!value || isEncryptedSecret(value)) {
    return value || '';
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(value), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    'enc:v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

function decryptSecret(value) {
  if (!value) {
    return '';
  }
  if (!isEncryptedSecret(value)) {
    return value;
  }

  const [, version, ivText, tagText, encryptedText] = value.split(':');
  if (version !== 'v1' || !ivText || !tagText || !encryptedText) {
    return '';
  }

  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(ivText, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

function cleanMoney(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function dayKey(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function shiftDay(dateKey, delta) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function cleanLogoUri(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  if (text.length > 850000) {
    throw new Error('La foto es demasiado grande. Usa una imagen menor a 600 KB.');
  }
  if (/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(text)) {
    return text;
  }
  if (/^https?:\/\//i.test(text)) {
    return text;
  }

  throw new Error('La foto debe ser una imagen valida.');
}

function cleanText(value, maxLength = 240) {
  return String(value || '').trim().slice(0, maxLength);
}

function cleanHour(value) {
  const text = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : '10:00';
}

function cleanBotSettingsPayload(payload = {}) {
  const connected = Boolean(payload.facebookAppConnected);
  const pagesPermission = Boolean(payload.pagesPermission);
  const messengerPermission = Boolean(payload.messengerPermission);
  const leadsPermission = Boolean(payload.leadsPermission);
  const status =
    connected && pagesPermission && messengerPermission
      ? 'Conectado'
      : connected || pagesPermission || messengerPermission || leadsPermission
        ? 'Permisos incompletos'
        : 'Permisos pendientes';

  return {
    autoDebtMessages: Boolean(payload.autoDebtMessages),
    businessTone: cleanText(payload.businessTone, 180) || 'Claro, amable y profesional',
    channel: cleanText(payload.channel, 60) || 'Mensajes del negocio',
    connectedAccount: cleanText(payload.connectedAccount, 120),
    debtThreshold: cleanMoney(payload.debtThreshold || 0),
    defaultReply:
      cleanText(payload.defaultReply, 500) ||
      'Hola, gracias por escribir. Enseguida revisamos tu mensaje.',
    enabled: Boolean(payload.enabled),
    facebookAppConnected: connected,
    leadsPermission,
    messengerPermission,
    pageName: cleanText(payload.pageName, 120),
    pagesPermission,
    reminderEveryDays: Math.max(1, Math.min(cleanInt(payload.reminderEveryDays || 7), 30)),
    reminderHour: cleanHour(payload.reminderHour),
    requireHumanReview: payload.requireHumanReview !== false,
    status,
  };
}

function toProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price,
    cost: row.cost ?? undefined,
    stock: row.stock,
    minStock: row.min_stock,
  };
}

function toCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    note: row.note,
  };
}

function toDebt(row) {
  return {
    id: row.id,
    customerName: row.customer_name,
    amount: row.amount,
    status: row.status,
  };
}

function toSale(row) {
  const items = all(
    `SELECT product_id, product_name, quantity, unit_price, subtotal
       FROM sale_items
      WHERE sale_id = ?
      ORDER BY rowid ASC`,
    [row.id],
  );

  return {
    id: row.id,
    folio: row.folio,
    customerName: row.customer_name || undefined,
    items: items.map((item) => ({
      productId: item.product_id,
      productName: item.product_name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      subtotal: item.subtotal,
    })),
    paymentMethod: row.payment_method,
    status: row.status,
    total: row.total,
    createdAt: row.created_at,
  };
}

function toMovement(row) {
  return {
    id: row.id,
    title: row.title,
    detail: row.detail,
    time: row.created_at,
    type: row.type,
  };
}

function toBusinessProfile(row) {
  return {
    id: row.id,
    name: row.name,
    giro: row.giro,
    city: row.city,
    phone: row.phone,
    currency: row.currency,
    logoText: row.logo_text,
    logoUri: row.logo_uri || '',
    primaryColor: row.primary_color,
    openHours: row.open_hours,
  };
}

function toTicketSettings(row) {
  return {
    businessName: row.business_name,
    logoText: row.logo_text,
    footer: row.footer,
    showPhone: asBool(row.show_phone),
    showAddress: asBool(row.show_address),
    includeMicroAppBrand: asBool(row.include_microapp_brand),
  };
}

function toAutomationSettings(row) {
  return {
    lowStockAlerts: asBool(row.low_stock_alerts),
    debtReminders: asBool(row.debt_reminders),
    dailyCutReminder: asBool(row.daily_cut_reminder),
    reminderHour: row.reminder_hour,
  };
}

function toBackupSettings(row) {
  return {
    cloudBackup: asBool(row.cloud_backup),
    exportReminder: asBool(row.export_reminder),
    lastBackupAt: row.last_backup_at || undefined,
  };
}

function maskToken(token) {
  if (!token) {
    return '';
  }
  if (token.length <= 10) {
    return '********';
  }
  return `${token.slice(0, 5)}...${token.slice(-4)}`;
}

function toPointConfig(row) {
  const accessToken = decryptSecret(row.access_token);
  return {
    provider: row.provider,
    mode: row.mode,
    terminalId: row.terminal_id,
    externalStoreId: row.external_store_id,
    webhookUrl: row.webhook_url,
    accessTokenMasked: maskToken(accessToken),
    hasAccessToken: Boolean(accessToken),
    accountAlias: row.account_alias,
    status: row.status,
  };
}

function normalizePlanSubscription(row) {
  const subscription =
    row ||
    get('SELECT * FROM plan_subscriptions WHERE user_id = ?', ['main']);
  const periodEndsAt = subscription?.current_period_ends_at || null;
  const expired = Boolean(periodEndsAt && new Date(periodEndsAt) <= new Date());
  let isProActive = asBool(subscription?.is_pro_active);
  let isBusinessActive = asBool(subscription?.is_business_active);
  let activePlan = subscription?.active_plan || 'Gratis';

  if (expired && (isProActive || isBusinessActive)) {
    isProActive = false;
    isBusinessActive = false;
    activePlan = 'Gratis';
    run(
      `UPDATE plan_subscriptions
          SET is_pro_active = ?, is_business_active = ?, active_plan = ?, updated_at = ?
        WHERE user_id = ?`,
      [0, 0, activePlan, now(), subscription.user_id],
    );
  } else if (isBusinessActive) {
    activePlan = 'Negocio';
  } else if (isProActive) {
    activePlan = 'Pro';
  } else {
    activePlan = 'Gratis';
  }

  const daysRemaining =
    !expired && periodEndsAt && activePlan !== 'Gratis'
      ? Math.max(
          0,
          Math.ceil((new Date(periodEndsAt).getTime() - Date.now()) / 86400000),
        )
      : 0;

  return {
    activePlan,
    autoRenew: asBool(subscription?.auto_renew),
    billingCycleDays: Number(subscription?.billing_cycle_days || 30),
    businessPurchasedAt: subscription?.business_purchased_at || undefined,
    currentPeriodEndsAt: periodEndsAt || undefined,
    currentPeriodStartedAt: subscription?.current_period_started_at || undefined,
    daysRemaining,
    isBusinessActive,
    isProActive,
    proPurchasedAt: subscription?.pro_purchased_at || undefined,
    renewalDue: activePlan !== 'Gratis' && daysRemaining <= 0,
    updatedAt: subscription?.updated_at || now(),
    userId: subscription?.user_id || 'main',
  };
}

function toBotSettings(row) {
  const connected = asBool(row.facebook_app_connected);
  const pages = asBool(row.pages_permission);
  const messenger = asBool(row.messenger_permission);
  const leads = asBool(row.leads_permission);
  const status =
    connected && pages && messenger
      ? 'Conectado'
      : connected || pages || messenger || leads
        ? 'Permisos incompletos'
        : 'Permisos pendientes';

  return {
    appConnectionStatus: status,
    autoDebtMessages: asBool(row.auto_debt_messages),
    businessTone: row.business_tone,
    channel:
      row.channel === 'Facebook / Messenger' ? 'Mensajes del negocio' : row.channel,
    connectedAccount: row.connected_account,
    debtThreshold: Number(row.debt_threshold || 0),
    defaultReply: row.default_reply,
    enabled: asBool(row.enabled),
    facebookAppConnected: connected,
    id: row.id,
    leadsPermission: leads,
    messengerPermission: messenger,
    pageName: row.page_name,
    pagesPermission: pages,
    reminderEveryDays: Number(row.reminder_every_days || 7),
    reminderHour: row.reminder_hour,
    requireHumanReview: asBool(row.require_human_review),
    updatedAt: row.updated_at,
  };
}

function securityStatus() {
  return {
    httpHeaders: {
      enabled: true,
      provider: 'helmet',
    },
    cors: {
      enabled: true,
      allowedOrigins: allowedOrigins(),
    },
    rateLimit: {
      enabled: true,
      apiRequestsPerMinute: API_LIMIT_PER_MINUTE,
      securityRequestsPerMinute: SECURITY_LIMIT_PER_MINUTE,
      webhookRequestsPerMinute: WEBHOOK_LIMIT_PER_MINUTE,
    },
    secretStorage: {
      pointAccessTokenEncrypted: true,
      envSecretConfigured: Boolean(process.env.MICROAPP_SECRET_KEY),
      tokenLeavesBackend: false,
    },
    database: {
      engine: 'SQLite con sql.js',
      localPath: databasePath(),
      ignoredByGit: true,
    },
    mercadoPago: {
      tokenMaskedInApp: true,
      webhookEndpoint: '/webhooks/mercado-pago',
      inventoryPolicy:
        'Reservar stock al cobrar y descontar definitivo solo con pago aprobado.',
    },
    securityAdmin: {
      configured: Boolean(readSecurityAdmin()),
      credentialFile: SECURITY_ADMIN_PATH,
      username: readSecurityAdmin()?.username || '',
    },
    usageTracking: {
      enabled: true,
      trialPlan: 'Negocio $199',
      requiredStreakDays: 15,
      trialDays: 30,
    },
    plans: {
      monthlyCycleDays: 30,
      planFlagsInDatabase: ['is_pro_active', 'is_business_active'],
    },
    bot: {
      settingsStored: true,
      externalTokensStored: false,
      requiresPlatformPermissions: true,
    },
  };
}

function normalizeTrial(row) {
  const trial = row || {
    status: 'Inactiva',
    unlocked_at: null,
    expires_at: null,
  };
  const expiresAt = trial.expires_at || null;
  let status = trial.status || 'Inactiva';

  if (status === 'Activa' && expiresAt && new Date(expiresAt) <= new Date()) {
    status = 'Expirada';
    run(
      `UPDATE pro_trials
          SET status = ?, updated_at = ?
        WHERE id = ?`,
      [status, now(), 'main'],
    );
  }

  const daysRemaining =
    status === 'Activa' && expiresAt
      ? Math.max(
          0,
          Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000),
        )
      : 0;

  return {
    daysRemaining,
    expiresAt: expiresAt || undefined,
    status,
    unlockedAt: trial.unlocked_at || undefined,
  };
}

function currentStreakDays(today = dayKey()) {
  const rows = all(
    'SELECT usage_date FROM usage_activity WHERE online_seconds > 0 ORDER BY usage_date DESC',
  );
  const activeDays = new Set(rows.map((row) => row.usage_date));
  let cursor = today;
  let streak = 0;

  while (activeDays.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }

  return streak;
}

function usageStatus({ justUnlockedTrial = false } = {}) {
  const today = dayKey();
  const todayRow = get('SELECT * FROM usage_activity WHERE usage_date = ?', [
    today,
  ]);
  const trialRow = get('SELECT * FROM pro_trials WHERE id = ?', ['main']);

  return {
    currentStreakDays: currentStreakDays(today),
    justUnlockedTrial,
    onlineSecondsToday: Number(todayRow?.online_seconds || 0),
    proTrial: normalizeTrial(trialRow),
    requiredStreakDays: 15,
    today,
  };
}

function recordUsage(activeSeconds) {
  const today = dayKey();
  const timestamp = now();
  const seconds = Math.min(cleanInt(activeSeconds || 0), 300);

  run(
    `INSERT OR IGNORE INTO usage_activity
      (usage_date, online_seconds, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?)`,
    [today, 0, timestamp, timestamp],
  );

  run(
    `UPDATE usage_activity
        SET online_seconds = online_seconds + ?, last_seen_at = ?
      WHERE usage_date = ?`,
    [seconds, timestamp, today],
  );

  const streak = currentStreakDays(today);
  const trial = normalizeTrial(get('SELECT * FROM pro_trials WHERE id = ?', ['main']));
  let justUnlockedTrial = false;

  if (streak >= 15 && trial.status === 'Inactiva' && !trial.unlockedAt) {
    const unlockedAt = new Date();
    const expiresAt = addDays(unlockedAt, 30);
    run(
      `UPDATE pro_trials
          SET status = ?, unlocked_at = ?, expires_at = ?, reason = ?, updated_at = ?
        WHERE id = ?`,
      [
        'Activa',
        unlockedAt.toISOString(),
        expiresAt.toISOString(),
        '15 dias seguidos de uso para prueba Negocio',
        timestamp,
        'main',
      ],
    );
    justUnlockedTrial = true;
  }

  return usageStatus({ justUnlockedTrial });
}

function pointTutorial() {
  return [
    {
      title: 'Prepara tu cuenta',
      text: 'Usa una cuenta de Mercado Pago del negocio y confirma que la terminal Point ya este activa.',
    },
    {
      title: 'Configura la terminal en modo integrado',
      text: 'En Mercado Pago Developers registra la terminal para usarla desde un sistema POS.',
    },
    {
      title: 'Copia el Terminal ID',
      text: 'Ese identificador le dice a MicroApp a que terminal debe mandar la orden.',
    },
    {
      title: 'Conecta el backend',
      text: 'Guarda el access token solo en el servidor. El telefono nunca debe conservar secretos de Mercado Pago.',
    },
    {
      title: 'Activa webhooks',
      text: 'Cuando Mercado Pago confirme la orden, MicroApp cambia la venta de pendiente a pagada y baja inventario.',
    },
    {
      title: 'Haz una prueba',
      text: 'Primero usa sandbox. Cuando el flujo funcione, cambia a produccion y prueba con una venta pequena.',
    },
  ];
}

function buildPointOrderPreview({ amount, folio, terminalId, externalStoreId }) {
  return {
    type: 'point',
    external_reference: folio,
    total_amount: String(amount),
    transactions: {
      payments: [
        {
          amount: String(amount),
        },
      ],
    },
    config: {
      point: {
        terminal_id: terminalId,
        external_store_id: externalStoreId || undefined,
        print_on_terminal: true,
      },
    },
  };
}

function validatePointConfig(input) {
  const errors = [];
  if (!input.terminalId || input.terminalId.trim().length < 4) {
    errors.push('Agrega el Terminal ID de tu Point.');
  }
  if (!input.webhookUrl || !/^https?:\/\//.test(input.webhookUrl)) {
    errors.push('Agrega una URL publica de webhook que empiece con http o https.');
  }
  if (!input.accessToken || input.accessToken.trim().length < 15) {
    errors.push('Guarda un access token en el backend, no en el telefono.');
  }
  return errors;
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function createApp() {
  await openDatabase();

  const app = express();
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins().includes(origin)) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
    }),
  );
  app.use(
    '/api',
    rateLimit({
      legacyHeaders: false,
      limit: API_LIMIT_PER_MINUTE,
      message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un minuto.' },
      standardHeaders: 'draft-8',
      windowMs: 60 * 1000,
    }),
  );
  app.use(
    '/api/security',
    rateLimit({
      legacyHeaders: false,
      limit: SECURITY_LIMIT_PER_MINUTE,
      message: { error: 'Demasiados intentos de seguridad. Espera un minuto.' },
      standardHeaders: 'draft-8',
      windowMs: 60 * 1000,
    }),
  );
  app.use(
    '/webhooks',
    rateLimit({
      legacyHeaders: false,
      limit: WEBHOOK_LIMIT_PER_MINUTE,
      message: { error: 'Demasiados eventos recibidos. Intenta de nuevo en un minuto.' },
      standardHeaders: 'draft-8',
      windowMs: 60 * 1000,
    }),
  );
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      database: databasePath(),
      time: now(),
    });
  });

  app.get('/api/bootstrap', (_req, res) => {
    res.json({
      businessProfile: toBusinessProfile(get('SELECT * FROM business_profile WHERE id = ?', ['main'])),
      products: all('SELECT * FROM products ORDER BY created_at DESC').map(toProduct),
      customers: all('SELECT * FROM customers ORDER BY created_at DESC').map(toCustomer),
      debts: all('SELECT * FROM debts ORDER BY created_at DESC').map(toDebt),
      sales: all('SELECT * FROM sales ORDER BY created_at DESC').map(toSale),
      movements: all('SELECT * FROM inventory_movements ORDER BY created_at DESC LIMIT 50').map(toMovement),
      ticketSettings: toTicketSettings(get('SELECT * FROM ticket_settings WHERE id = ?', ['main'])),
      automationSettings: toAutomationSettings(get('SELECT * FROM automation_settings WHERE id = ?', ['main'])),
      backupSettings: toBackupSettings(get('SELECT * FROM backup_settings WHERE id = ?', ['main'])),
      pointConfig: toPointConfig(get('SELECT * FROM point_config WHERE id = ?', ['main'])),
      usageStatus: usageStatus(),
      accountPlan: normalizePlanSubscription(get('SELECT * FROM plan_subscriptions WHERE user_id = ?', ['main'])),
      botSettings: toBotSettings(get('SELECT * FROM bot_settings WHERE id = ?', ['main'])),
    });
  });

  app.get('/api/security/status', requireSecurityAdmin, (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(securityStatus());
  });

  app.get('/api/business-profile', (_req, res) => {
    res.json(toBusinessProfile(get('SELECT * FROM business_profile WHERE id = ?', ['main'])));
  });

  app.put('/api/business-profile', (req, res) => {
    const payload = req.body || {};
    let profile;
    try {
      profile = {
        name: String(payload.name || 'Mi negocio').trim() || 'Mi negocio',
        giro: String(payload.giro || 'General').trim() || 'General',
        city: String(payload.city || '').trim(),
        phone: String(payload.phone || '').trim(),
        currency: String(payload.currency || 'MXN').trim() || 'MXN',
        logoText: String(payload.logoText || '').trim(),
        logoUri: cleanLogoUri(payload.logoUri),
        primaryColor: String(payload.primaryColor || '#075CFF').trim() || '#075CFF',
        openHours: String(payload.openHours || '').trim(),
      };
    } catch (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    run(
      `UPDATE business_profile
          SET name = ?, giro = ?, city = ?, phone = ?, currency = ?,
              logo_text = ?, logo_uri = ?, primary_color = ?, open_hours = ?, updated_at = ?
        WHERE id = ?`,
      [
        profile.name,
        profile.giro,
        profile.city,
        profile.phone,
        profile.currency,
        profile.logoText,
        profile.logoUri,
        profile.primaryColor,
        profile.openHours,
        now(),
        'main',
      ],
    );

    run(
      `UPDATE ticket_settings
          SET business_name = ?, logo_text = ?, updated_at = ?
        WHERE id = ?`,
      [profile.name, profile.logoText, now(), 'main'],
    );

    res.json(toBusinessProfile(get('SELECT * FROM business_profile WHERE id = ?', ['main'])));
  });

  app.post('/api/usage/heartbeat', (req, res) => {
    res.json(recordUsage(req.body?.activeSeconds));
  });

  app.get('/api/products', (_req, res) => {
    res.json(all('SELECT * FROM products ORDER BY created_at DESC').map(toProduct));
  });

  app.post('/api/products', (req, res) => {
    const payload = req.body || {};
    const product = {
      id: payload.id || makeId('prod'),
      name: String(payload.name || '').trim(),
      category: String(payload.category || 'General').trim() || 'General',
      price: cleanMoney(payload.price),
      cost: payload.cost === undefined ? null : cleanMoney(payload.cost),
      stock: cleanInt(payload.stock),
      minStock: cleanInt(payload.minStock ?? 3),
    };

    if (!product.name || product.price <= 0) {
      res.status(400).json({ error: 'Nombre y precio son obligatorios.' });
      return;
    }

    transaction(() => {
      run(
        `INSERT OR REPLACE INTO products
          (id, name, category, price, cost, stock, min_stock, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product.id,
          product.name,
          product.category,
          product.price,
          product.cost,
          product.stock,
          product.minStock,
          'Activo',
          now(),
          now(),
        ],
        false,
      );
      run(
        `INSERT INTO inventory_movements
          (id, product_id, title, detail, type, quantity, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          makeId('mov'),
          product.id,
          'Producto agregado',
          `${product.name} entro con ${product.stock} unidades`,
          'Inventario',
          product.stock,
          now(),
        ],
        false,
      );
    });

    res.status(201).json(product);
  });

  app.post('/api/customers', (req, res) => {
    const payload = req.body || {};
    const customer = {
      id: payload.id || makeId('cli'),
      name: String(payload.name || '').trim(),
      phone: String(payload.phone || '').trim(),
      note: String(payload.note || '').trim(),
    };

    if (!customer.name) {
      res.status(400).json({ error: 'El cliente necesita nombre.' });
      return;
    }

    run(
      `INSERT OR REPLACE INTO customers
        (id, name, phone, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [customer.id, customer.name, customer.phone, customer.note, now(), now()],
    );

    res.status(201).json(customer);
  });

  app.post('/api/debts', (req, res) => {
    const payload = req.body || {};
    const debt = {
      id: payload.id || makeId('debt'),
      customerName: String(payload.customerName || '').trim(),
      amount: cleanMoney(payload.amount),
      status: payload.status || 'Pendiente',
    };

    if (!debt.customerName || debt.amount <= 0) {
      res.status(400).json({ error: 'La deuda necesita cliente y monto.' });
      return;
    }

    transaction(() => {
      run(
        `INSERT OR REPLACE INTO debts
          (id, customer_name, amount, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [debt.id, debt.customerName, debt.amount, debt.status, now(), now()],
        false,
      );
      run(
        `INSERT INTO inventory_movements
          (id, title, detail, type, quantity, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          makeId('mov'),
          'Deuda registrada',
          `${debt.customerName} debe $${debt.amount}`,
          'Deuda',
          0,
          now(),
        ],
        false,
      );
    });

    res.status(201).json(debt);
  });

  app.post('/api/sales', (req, res) => {
    const payload = req.body || {};
    const items = Array.isArray(payload.items) ? payload.items : [];

    if (!items.length) {
      res.status(400).json({ error: 'La venta necesita productos.' });
      return;
    }

    try {
      const sale = transaction(() => {
        const folio = payload.folio || nextSaleFolio();
        const saleId = payload.id || makeId('sale');
        let total = 0;
        const saleItems = [];

        for (const item of items) {
          const product = get('SELECT * FROM products WHERE id = ?', [item.productId]);
          if (!product) {
            throw new Error(`Producto no encontrado: ${item.productId}`);
          }

          const quantity = cleanInt(item.quantity);
          if (quantity <= 0 || product.stock < quantity) {
            throw new Error(`Stock insuficiente para ${product.name}`);
          }

          const subtotal = product.price * quantity;
          total += subtotal;
          saleItems.push({
            id: makeId('item'),
            product,
            quantity,
            subtotal,
          });
        }

        const paymentMethod = payload.paymentMethod || 'Efectivo';
        const status = paymentMethod === 'Fiado' ? 'Fiada' : 'Pagada';

        run(
          `INSERT INTO sales
            (id, folio, customer_name, payment_method, status, total, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            saleId,
            folio,
            payload.customerName || null,
            paymentMethod,
            status,
            total,
            now(),
          ],
          false,
        );

        for (const item of saleItems) {
          run(
            `INSERT INTO sale_items
              (id, sale_id, product_id, product_name, quantity, unit_price, subtotal)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              item.id,
              saleId,
              item.product.id,
              item.product.name,
              item.quantity,
              item.product.price,
              item.subtotal,
            ],
            false,
          );
          run(
            `UPDATE products
                SET stock = stock - ?, updated_at = ?
              WHERE id = ?`,
            [item.quantity, now(), item.product.id],
            false,
          );
          run(
            `INSERT INTO inventory_movements
              (id, product_id, sale_id, title, detail, type, quantity, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              makeId('mov'),
              item.product.id,
              saleId,
              `Venta ${folio}`,
              `${item.quantity} x ${item.product.name} salio del inventario`,
              'Venta',
              -item.quantity,
              now(),
            ],
            false,
          );
        }

        run(
          `INSERT INTO payments
            (id, sale_id, method, amount, status, reference, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            makeId('pay'),
            saleId,
            paymentMethod,
            total,
            status === 'Pagada' ? 'Aprobado' : 'Pendiente',
            null,
            now(),
          ],
          false,
        );

        if (paymentMethod === 'Fiado') {
          run(
            `INSERT INTO debts
              (id, customer_name, amount, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              makeId('debt'),
              payload.customerName || 'Cliente sin nombre',
              total,
              'Pendiente',
              now(),
              now(),
            ],
            false,
          );
        }

        return toSale(get('SELECT * FROM sales WHERE id = ?', [saleId]));
      });

      res.status(201).json({
        sale,
        products: all('SELECT * FROM products ORDER BY created_at DESC').map(toProduct),
        debts: all('SELECT * FROM debts ORDER BY created_at DESC').map(toDebt),
        movements: all('SELECT * FROM inventory_movements ORDER BY created_at DESC LIMIT 50').map(toMovement),
      });
    } catch (error) {
      res.status(409).json({ error: error.message });
    }
  });

  app.get('/api/export/inventory.csv', (_req, res) => {
    const rows = all('SELECT * FROM products ORDER BY name ASC');
    const header = ['id', 'nombre', 'categoria', 'precio', 'costo', 'stock', 'alerta_minima'];
    const csv = [
      header.join(','),
      ...rows.map((row) =>
        [
          row.id,
          row.name,
          row.category,
          row.price,
          row.cost ?? '',
          row.stock,
          row.min_stock,
        ].map(csvEscape).join(','),
      ),
    ].join('\n');

    run(
      `INSERT INTO export_jobs (id, type, status, file_name, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [makeId('exp'), 'inventory', 'Completado', 'inventario-microapp.csv', now()],
    );

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('inventario-microapp.csv');
    res.send(csv);
  });

  app.get('/api/ticket-settings', (_req, res) => {
    res.json(toTicketSettings(get('SELECT * FROM ticket_settings WHERE id = ?', ['main'])));
  });

  app.put('/api/ticket-settings', (req, res) => {
    const payload = req.body || {};
    run(
      `UPDATE ticket_settings
          SET business_name = ?, logo_text = ?, footer = ?, show_phone = ?,
              show_address = ?, include_microapp_brand = ?, updated_at = ?
        WHERE id = ?`,
      [
        String(payload.businessName || '').trim(),
        String(payload.logoText || '').trim(),
        String(payload.footer || '').trim() || 'Gracias por tu compra',
        bool(payload.showPhone),
        bool(payload.showAddress),
        bool(payload.includeMicroAppBrand),
        now(),
        'main',
      ],
    );
    res.json(toTicketSettings(get('SELECT * FROM ticket_settings WHERE id = ?', ['main'])));
  });

  app.get('/api/account-plan', (_req, res) => {
    res.json(
      normalizePlanSubscription(
        get('SELECT * FROM plan_subscriptions WHERE user_id = ?', ['main']),
      ),
    );
  });

  app.put('/api/account-plan', requireSecurityAdmin, (req, res) => {
    const plan = String(req.body?.activePlan || 'Gratis');
    const normalizedPlan =
      plan === 'Negocio' || plan === 'Business'
        ? 'Negocio'
        : plan === 'Pro'
          ? 'Pro'
          : 'Gratis';
    const timestamp = now();
    const periodEndsAt =
      normalizedPlan === 'Gratis'
        ? null
        : new Date(Date.now() + 30 * 86400000).toISOString();

    run(
      `UPDATE plan_subscriptions
          SET is_pro_active = ?, is_business_active = ?, active_plan = ?,
              billing_cycle_days = ?, current_period_started_at = ?,
              current_period_ends_at = ?,
              pro_purchased_at = CASE WHEN ? = 'Pro' THEN ? ELSE pro_purchased_at END,
              business_purchased_at = CASE WHEN ? = 'Negocio' THEN ? ELSE business_purchased_at END,
              auto_renew = ?, updated_at = ?
        WHERE user_id = ?`,
      [
        normalizedPlan === 'Pro' ? 1 : 0,
        normalizedPlan === 'Negocio' ? 1 : 0,
        normalizedPlan,
        30,
        normalizedPlan === 'Gratis' ? null : timestamp,
        periodEndsAt,
        normalizedPlan,
        timestamp,
        normalizedPlan,
        timestamp,
        bool(req.body?.autoRenew !== false),
        timestamp,
        'main',
      ],
    );

    res.json(
      normalizePlanSubscription(
        get('SELECT * FROM plan_subscriptions WHERE user_id = ?', ['main']),
      ),
    );
  });

  app.get('/api/bot-settings', (_req, res) => {
    res.json(toBotSettings(get('SELECT * FROM bot_settings WHERE id = ?', ['main'])));
  });

  app.put('/api/bot-settings', (req, res) => {
    const settings = cleanBotSettingsPayload(req.body || {});

    run(
      `UPDATE bot_settings
          SET enabled = ?, channel = ?, page_name = ?, connected_account = ?,
              default_reply = ?, business_tone = ?, auto_debt_messages = ?,
              debt_threshold = ?, reminder_every_days = ?, reminder_hour = ?,
              require_human_review = ?, facebook_app_connected = ?,
              pages_permission = ?, messenger_permission = ?, leads_permission = ?,
              status = ?, updated_at = ?
        WHERE id = ?`,
      [
        bool(settings.enabled),
        settings.channel,
        settings.pageName,
        settings.connectedAccount,
        settings.defaultReply,
        settings.businessTone,
        bool(settings.autoDebtMessages),
        settings.debtThreshold,
        settings.reminderEveryDays,
        settings.reminderHour,
        bool(settings.requireHumanReview),
        bool(settings.facebookAppConnected),
        bool(settings.pagesPermission),
        bool(settings.messengerPermission),
        bool(settings.leadsPermission),
        settings.status,
        now(),
        'main',
      ],
    );

    res.json(toBotSettings(get('SELECT * FROM bot_settings WHERE id = ?', ['main'])));
  });

  app.get('/api/automation-settings', (_req, res) => {
    res.json(toAutomationSettings(get('SELECT * FROM automation_settings WHERE id = ?', ['main'])));
  });

  app.put('/api/automation-settings', (req, res) => {
    const payload = req.body || {};
    run(
      `UPDATE automation_settings
          SET low_stock_alerts = ?, debt_reminders = ?, daily_cut_reminder = ?,
              reminder_hour = ?, updated_at = ?
        WHERE id = ?`,
      [
        bool(payload.lowStockAlerts),
        bool(payload.debtReminders),
        bool(payload.dailyCutReminder),
        String(payload.reminderHour || '18:00').trim() || '18:00',
        now(),
        'main',
      ],
    );
    res.json(toAutomationSettings(get('SELECT * FROM automation_settings WHERE id = ?', ['main'])));
  });

  app.get('/api/backup-settings', (_req, res) => {
    res.json(toBackupSettings(get('SELECT * FROM backup_settings WHERE id = ?', ['main'])));
  });

  app.put('/api/backup-settings', (req, res) => {
    const payload = req.body || {};
    run(
      `UPDATE backup_settings
          SET cloud_backup = ?, export_reminder = ?, updated_at = ?
        WHERE id = ?`,
      [bool(payload.cloudBackup), bool(payload.exportReminder), now(), 'main'],
    );
    res.json(toBackupSettings(get('SELECT * FROM backup_settings WHERE id = ?', ['main'])));
  });

  app.post('/api/backup/run', (_req, res) => {
    const timestamp = now();
    run(
      `UPDATE backup_settings
          SET last_backup_at = ?, updated_at = ?
        WHERE id = ?`,
      [timestamp, timestamp, 'main'],
    );
    res.json({
      ok: true,
      file: databasePath(),
      backupSettings: toBackupSettings(get('SELECT * FROM backup_settings WHERE id = ?', ['main'])),
    });
  });

  app.get('/api/point/tutorial', (_req, res) => {
    res.json(pointTutorial());
  });

  app.get('/api/point/config', (_req, res) => {
    res.json(toPointConfig(get('SELECT * FROM point_config WHERE id = ?', ['main'])));
  });

  app.put('/api/point/config', (req, res) => {
    const payload = req.body || {};
    const current = get('SELECT * FROM point_config WHERE id = ?', ['main']);
    const currentAccessToken = decryptSecret(current.access_token);
    const accessToken =
      typeof payload.accessToken === 'string' && payload.accessToken.trim()
        ? payload.accessToken.trim()
        : currentAccessToken;

    const config = {
      mode: payload.mode === 'production' ? 'production' : 'sandbox',
      terminalId: String(payload.terminalId || '').trim(),
      externalStoreId: String(payload.externalStoreId || '').trim(),
      webhookUrl: String(payload.webhookUrl || '').trim(),
      accessToken,
      accountAlias: String(payload.accountAlias || '').trim(),
    };
    const errors = validatePointConfig(config);
    const status = errors.length ? 'Pendiente' : 'Vinculada';

    run(
      `UPDATE point_config
          SET mode = ?, terminal_id = ?, external_store_id = ?, webhook_url = ?,
              access_token = ?, account_alias = ?, status = ?, updated_at = ?
        WHERE id = ?`,
      [
        config.mode,
        config.terminalId,
        config.externalStoreId,
        config.webhookUrl,
        encryptSecret(config.accessToken),
        config.accountAlias,
        status,
        now(),
        'main',
      ],
    );

    res.json({
      config: toPointConfig(get('SELECT * FROM point_config WHERE id = ?', ['main'])),
      errors,
    });
  });

  app.post('/api/point/validate-config', (req, res) => {
    const payload = req.body || {};
    const current = get('SELECT * FROM point_config WHERE id = ?', ['main']);
    const errors = validatePointConfig({
      terminalId: payload.terminalId ?? current.terminal_id,
      webhookUrl: payload.webhookUrl ?? current.webhook_url,
      accessToken: payload.accessToken || decryptSecret(current.access_token),
    });
    res.json({
      ok: errors.length === 0,
      errors,
    });
  });

  app.post('/api/point/orders/preview', (req, res) => {
    const config = get('SELECT * FROM point_config WHERE id = ?', ['main']);
    const amount = cleanMoney(req.body?.amount || 0);
    const folio = req.body?.folio || nextSaleFolio();

    if (amount <= 0) {
      res.status(400).json({ error: 'La orden necesita un total mayor a cero.' });
      return;
    }

    if (config.status !== 'Vinculada') {
      res.status(409).json({
        error: 'Configura Terminal ID, webhook y access token antes de mandar ordenes.',
        config: toPointConfig(config),
      });
      return;
    }

    res.json({
      saleStatus: 'Pendiente de pago',
      inventoryPolicy: 'Reservar stock; descontar definitivo solo con webhook aprobado.',
      orderPayload: buildPointOrderPreview({
        amount,
        folio,
        terminalId: config.terminal_id,
        externalStoreId: config.external_store_id,
      }),
    });
  });

  app.post('/webhooks/mercado-pago', (req, res) => {
    const payload = req.body || {};
    const eventType =
      payload.type ||
      payload.action ||
      payload.status ||
      payload.topic ||
      'unknown';
    const externalId =
      payload?.data?.id ||
      payload?.resource ||
      payload?.id ||
      payload?.external_reference ||
      null;

    run(
      `INSERT INTO webhook_events
        (id, provider, event_type, external_id, payload, processed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        makeId('wh'),
        'Mercado Pago',
        String(eventType),
        externalId ? String(externalId) : null,
        JSON.stringify(payload),
        now(),
        now(),
      ],
    );

    res.json({
      ok: true,
      received: eventType,
      nextAction:
        'Cuando tengamos order_id vinculado a venta, este webhook confirmara pago y descontara inventario reservado.',
    });
  });

  app.get('/api/webhook-events', (_req, res) => {
    res.json(
      all(
        `SELECT id, provider, event_type, external_id, created_at
           FROM webhook_events
          ORDER BY created_at DESC
          LIMIT 25`,
      ),
    );
  });

  return app;
}

if (require.main === module) {
  createApp()
    .then((app) => {
      app.listen(PORT, () => {
        console.log(`MicroApp backend escuchando en http://localhost:${PORT}`);
        console.log(`SQLite: ${databasePath()}`);
      });
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { createApp };
