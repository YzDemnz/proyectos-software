const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'microapp.sqlite');

let SQL;
let db;

async function openDatabase() {
  if (db) {
    return db;
  }

  SQL = await initSqlJs();
  fs.mkdirSync(dataDir, { recursive: true });

  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  migrate();
  persist();
  return db;
}

function migrate() {
  db.run(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS business_profile (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      giro TEXT NOT NULL DEFAULT 'General',
      city TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'MXN',
      logo_text TEXT NOT NULL DEFAULT '',
      logo_uri TEXT NOT NULL DEFAULT '',
      primary_color TEXT NOT NULL DEFAULT '#075CFF',
      open_hours TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'Dueno',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plan_subscriptions (
      user_id TEXT PRIMARY KEY,
      is_pro_active INTEGER NOT NULL DEFAULT 0,
      is_business_active INTEGER NOT NULL DEFAULT 0,
      active_plan TEXT NOT NULL DEFAULT 'Gratis',
      billing_cycle_days INTEGER NOT NULL DEFAULT 30,
      current_period_started_at TEXT,
      current_period_ends_at TEXT,
      pro_purchased_at TEXT,
      business_purchased_at TEXT,
      auto_renew INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      price REAL NOT NULL,
      cost REAL,
      stock INTEGER NOT NULL,
      min_stock INTEGER NOT NULL DEFAULT 3,
      status TEXT NOT NULL DEFAULT 'Activo',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS debts (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      folio TEXT NOT NULL UNIQUE,
      customer_name TEXT,
      payment_method TEXT NOT NULL,
      status TEXT NOT NULL,
      total REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      method TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      reference TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id)
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      sale_id TEXT,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ticket_settings (
      id TEXT PRIMARY KEY,
      business_name TEXT NOT NULL DEFAULT '',
      logo_text TEXT NOT NULL DEFAULT '',
      footer TEXT NOT NULL DEFAULT 'Gracias por tu compra',
      show_phone INTEGER NOT NULL DEFAULT 1,
      show_address INTEGER NOT NULL DEFAULT 0,
      include_microapp_brand INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS automation_settings (
      id TEXT PRIMARY KEY,
      low_stock_alerts INTEGER NOT NULL DEFAULT 0,
      debt_reminders INTEGER NOT NULL DEFAULT 0,
      daily_cut_reminder INTEGER NOT NULL DEFAULT 0,
      reminder_hour TEXT NOT NULL DEFAULT '18:00',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backup_settings (
      id TEXT PRIMARY KEY,
      cloud_backup INTEGER NOT NULL DEFAULT 0,
      export_reminder INTEGER NOT NULL DEFAULT 1,
      last_backup_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS point_config (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'Mercado Pago Point',
      mode TEXT NOT NULL DEFAULT 'sandbox',
      terminal_id TEXT NOT NULL DEFAULT '',
      external_store_id TEXT NOT NULL DEFAULT '',
      webhook_url TEXT NOT NULL DEFAULT '',
      access_token TEXT NOT NULL DEFAULT '',
      account_alias TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Pendiente',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS export_jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      file_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      event_type TEXT NOT NULL,
      external_id TEXT,
      payload TEXT NOT NULL,
      processed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_activity (
      usage_date TEXT PRIMARY KEY,
      online_seconds INTEGER NOT NULL DEFAULT 0,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pro_trials (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'Inactiva',
      unlocked_at TEXT,
      expires_at TEXT,
      reason TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bot_settings (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      channel TEXT NOT NULL DEFAULT 'Facebook / Messenger',
      page_name TEXT NOT NULL DEFAULT '',
      connected_account TEXT NOT NULL DEFAULT '',
      default_reply TEXT NOT NULL DEFAULT '',
      business_tone TEXT NOT NULL DEFAULT 'Claro, amable y profesional',
      auto_debt_messages INTEGER NOT NULL DEFAULT 0,
      debt_threshold REAL NOT NULL DEFAULT 300,
      reminder_every_days INTEGER NOT NULL DEFAULT 7,
      reminder_hour TEXT NOT NULL DEFAULT '10:00',
      require_human_review INTEGER NOT NULL DEFAULT 1,
      facebook_app_connected INTEGER NOT NULL DEFAULT 0,
      pages_permission INTEGER NOT NULL DEFAULT 0,
      messenger_permission INTEGER NOT NULL DEFAULT 0,
      leads_permission INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Permisos pendientes',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bot_message_logs (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      channel TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL,
      scheduled_for TEXT,
      created_at TEXT NOT NULL
    );
  `);

  ensureColumn('business_profile', 'logo_uri', "TEXT NOT NULL DEFAULT ''");
  seedDefaults();
}

function ensureColumn(tableName, columnName, definition) {
  const existing = all(`PRAGMA table_info(${tableName})`);
  if (existing.some((column) => column.name === columnName)) {
    return;
  }

  db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function seedDefaults() {
  const now = new Date().toISOString();
  run(
    `INSERT OR IGNORE INTO business_profile
      (id, name, giro, city, phone, currency, logo_text, logo_uri, primary_color, open_hours, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['main', 'Mi negocio', 'General', '', '', 'MXN', '', '', '#075CFF', '', now],
    false,
  );
  run(
    `INSERT OR IGNORE INTO users
      (id, name, email, phone, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['main', 'Administrador MicroApp', '', '', 'Dueno', now, now],
    false,
  );
  const periodEndsAt = new Date(Date.now() + 30 * 86400000).toISOString();
  run(
    `INSERT OR IGNORE INTO plan_subscriptions
      (user_id, is_pro_active, is_business_active, active_plan, billing_cycle_days,
       current_period_started_at, current_period_ends_at, pro_purchased_at,
       business_purchased_at, auto_renew, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['main', 0, 1, 'Negocio', 30, now, periodEndsAt, null, now, 1, now],
    false,
  );
  run(
    `INSERT OR IGNORE INTO ticket_settings
      (id, business_name, logo_text, footer, show_phone, show_address, include_microapp_brand, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['main', 'Mi negocio', '', 'Gracias por tu compra', 1, 0, 0, now],
    false,
  );
  run(
    `INSERT OR IGNORE INTO automation_settings
      (id, low_stock_alerts, debt_reminders, daily_cut_reminder, reminder_hour, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['main', 0, 0, 0, '18:00', now],
    false,
  );
  run(
    `INSERT OR IGNORE INTO backup_settings
      (id, cloud_backup, export_reminder, last_backup_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['main', 0, 1, null, now],
    false,
  );
  run(
    `INSERT OR IGNORE INTO point_config
      (id, provider, mode, terminal_id, external_store_id, webhook_url, access_token, account_alias, status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['main', 'Mercado Pago Point', 'sandbox', '', '', '', '', '', 'Pendiente', now],
    false,
  );
  run(
    `INSERT OR IGNORE INTO pro_trials
      (id, status, unlocked_at, expires_at, reason, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['main', 'Inactiva', null, null, '', now],
    false,
  );
  run(
    `INSERT OR IGNORE INTO bot_settings
      (id, enabled, channel, page_name, connected_account, default_reply,
       business_tone, auto_debt_messages, debt_threshold, reminder_every_days,
       reminder_hour, require_human_review, facebook_app_connected,
       pages_permission, messenger_permission, leads_permission, status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'main',
      0,
      'Mensajes del negocio',
      '',
      '',
      'Hola, gracias por escribir. Enseguida revisamos tu mensaje.',
      'Claro, amable y profesional',
      0,
      300,
      7,
      '10:00',
      1,
      0,
      0,
      0,
      0,
      'Permisos pendientes',
      now,
    ],
    false,
  );
}

function persist() {
  if (!db) {
    return;
  }
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function get(sql, params = []) {
  const rows = all(sql, params);
  return rows[0] || null;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  const rows = [];
  try {
    stmt.bind(params);
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    return rows;
  } finally {
    stmt.free();
  }
}

function run(sql, params = [], shouldPersist = true) {
  db.run(sql, params);
  if (shouldPersist) {
    persist();
  }
}

function transaction(work) {
  db.run('BEGIN TRANSACTION');
  try {
    const result = work();
    db.run('COMMIT');
    persist();
    return result;
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

function nextSaleFolio() {
  const row = get('SELECT COUNT(*) AS count FROM sales');
  return `V-${String((row?.count || 0) + 1).padStart(6, '0')}`;
}

function databasePath() {
  return dbPath;
}

module.exports = {
  all,
  databasePath,
  get,
  makeId,
  nextSaleFolio,
  openDatabase,
  persist,
  run,
  transaction,
};
