require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cosmetics_crm_secret_2026';
const BEAUTY_PREFERENCES = new Set(['Trang điểm', 'Chăm sóc da (Skincare)', 'Chống lão hóa', 'Trị mụn', 'Dưỡng ẩm', 'Organic']);
const BEAUTY_PREFERENCE_ALIASES = {
  'Dưỡng da': 'Dưỡng ẩm',
  'Chăm sóc da': 'Chăm sóc da (Skincare)',
  'Skincare cơ bản': 'Chăm sóc da (Skincare)',
  'Chăm sóc da (Skincare)': 'Chăm sóc da (Skincare)'
};

function normalizeBeautyPreferences(value) {
  return [...new Set(String(value || '').split(',').map(item => BEAUTY_PREFERENCE_ALIASES[item.trim()] || item.trim()).filter(item => BEAUTY_PREFERENCES.has(item)))].join(',');
}


app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Đảm bảo CSDL được kết nối trước khi xử lý request
let dbInitPromise = null;
let appSchemaReady = false;
function ensureDb() {
  if (!dbInitPromise) {
    dbInitPromise = db.init().then(async () => {
      if (!appSchemaReady) {
        await ensureAppSchema();
        appSchemaReady = true;
      }
      return db;
    });
  }
  return dbInitPromise;
}

async function ensureAppSchema() {
  await db.prepare(`
    IF OBJECT_ID('dbo.SurveyRecipients', 'U') IS NULL
    CREATE TABLE dbo.SurveyRecipients (
      id INT IDENTITY(1,1) PRIMARY KEY,
      survey_id INT NOT NULL,
      customer_id INT NOT NULL,
      sent_by INT,
      sent_at DATETIME2 DEFAULT GETDATE(),
      CONSTRAINT FK_SurveyRecipients_Surveys FOREIGN KEY (survey_id) REFERENCES dbo.Surveys(id) ON DELETE CASCADE,
      CONSTRAINT FK_SurveyRecipients_Customers FOREIGN KEY (customer_id) REFERENCES dbo.Customers(id),
      CONSTRAINT FK_SurveyRecipients_Accounts FOREIGN KEY (sent_by) REFERENCES dbo.Accounts(id),
      CONSTRAINT UQ_SurveyRecipients UNIQUE (survey_id, customer_id)
    )
  `).run();

  // Tạo bảng liên kết nhiều-nhiều giữa Surveys và Products
  await db.prepare(`
    IF OBJECT_ID('dbo.SurveyProducts', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.SurveyProducts (
        id INT IDENTITY(1,1) PRIMARY KEY,
        survey_id INT NOT NULL,
        product_id INT NOT NULL,
        CONSTRAINT FK_SurveyProducts_Surveys FOREIGN KEY (survey_id) REFERENCES dbo.Surveys(id) ON DELETE CASCADE,
        CONSTRAINT FK_SurveyProducts_Products FOREIGN KEY (product_id) REFERENCES dbo.Products(id),
        CONSTRAINT UQ_SurveyProducts UNIQUE (survey_id, product_id)
      );
      -- Di chuyển dữ liệu cũ từ target_product_id sang bảng mới
      INSERT INTO dbo.SurveyProducts (survey_id, product_id)
      SELECT id, target_product_id FROM dbo.Surveys WHERE target_product_id IS NOT NULL;
    END
  `).run();

  await db.prepare(`
    CREATE OR ALTER TRIGGER dbo.trg_PreventDeleteLastAdmin
    ON dbo.Accounts
    AFTER DELETE
    AS
    BEGIN
      SET NOCOUNT ON;
      IF EXISTS (SELECT 1 FROM deleted WHERE role = 'ADMIN')
      BEGIN
        IF (SELECT COUNT(*) FROM dbo.Accounts WHERE role = 'ADMIN') = 0
        BEGIN
          RAISERROR (N'Không thể xóa tài khoản Admin khi hệ thống chỉ có duy nhất 1 Admin.', 16, 1);
          ROLLBACK TRANSACTION;
          RETURN;
        END
      END
    END
  `).run();

  await db.prepare(`
    CREATE OR ALTER TRIGGER dbo.trg_PreventDemoteLastAdmin
    ON dbo.Accounts
    AFTER UPDATE
    AS
    BEGIN
      SET NOCOUNT ON;
      IF UPDATE(role) OR UPDATE(status)
      BEGIN
        IF (SELECT COUNT(*) FROM dbo.Accounts WHERE role = 'ADMIN' AND status = 'ACTIVE') = 0
        BEGIN
          RAISERROR (N'Hệ thống phải có ít nhất 1 tài khoản Admin đang hoạt động (ACTIVE).', 16, 1);
          ROLLBACK TRANSACTION;
          RETURN;
        END
      END
    END
  `).run();
}

function buildSqlServerBackupScript(type, filename) {
  const backupDir = 'C:\\CosmeticsCRM_Backup';
  if (type === 'DIFFERENTIAL') {
    return `BACKUP DATABASE ${db.databaseName}\nTO DISK = N'${backupDir}\\${filename}.bak'\nWITH DIFFERENTIAL, INIT, NAME = N'Differential Backup - CosmeticsCRM', STATS = 10;`;
  }
  return `BACKUP DATABASE ${db.databaseName}\nTO DISK = N'${backupDir}\\${filename}.bak'\nWITH INIT, NAME = N'Full Backup - CosmeticsCRM', STATS = 10;`;
}

function buildSqlServerRestoreScript(fullFile, diffFile) {
  return `USE master;\nALTER DATABASE ${db.databaseName} SET SINGLE_USER WITH ROLLBACK IMMEDIATE;\nRESTORE DATABASE ${db.databaseName}\nFROM DISK = N'C:\\CosmeticsCRM_Backup\\${fullFile}.bak'\nWITH NORECOVERY, REPLACE, STATS = 10;\nRESTORE DATABASE ${db.databaseName}\nFROM DISK = N'C:\\CosmeticsCRM_Backup\\${diffFile}.bak'\nWITH RECOVERY, STATS = 10;\nALTER DATABASE ${db.databaseName} SET MULTI_USER;`;
}

async function assignSurveyRecipients(surveyId, customerIds, sentBy) {
  const ids = Array.isArray(customerIds) ? customerIds.map(Number).filter(Boolean) : [];
  const recipients = ids.length > 0
    ? ids.map(id => ({ id }))
    : await db.prepare(`
        SELECT c.id
        FROM Customers c
        JOIN Accounts a ON c.account_id = a.id
        WHERE a.role = 'CUSTOMER' AND a.status = 'ACTIVE'
      `).all();

  for (const recipient of recipients) {
    await db.prepare(`
      IF NOT EXISTS (SELECT 1 FROM SurveyRecipients WHERE survey_id = ? AND customer_id = ?)
      INSERT INTO SurveyRecipients (survey_id, customer_id, sent_by) VALUES (?, ?, ?)
    `).run(surveyId, recipient.id, surveyId, recipient.id, sentBy);
  }
  return recipients.length;
}

app.use(async (req, res, next) => {
  try {
    await ensureDb();
    next();
  } catch (err) {
    console.error('Lỗi khởi tạo CSDL:', err);
    res.status(500).json({ error: 'Khởi tạo CSDL thất bại: ' + err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== MIDDLEWARE: Xác thực JWT ==========
function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token không hợp lệ' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền truy cập' });
    next();
  };
}

// Hàm kiểm tra mật khẩu dạng văn bản thuần (plain text)
function verifyPassword(inputPassword, account) {
  if (!inputPassword || !account) return false;
  const storedPassword = account.password;
  if (!storedPassword) return false;
  return String(inputPassword) === String(storedPassword);
}

async function insertAccount(username, passwordVal, full_name, email, phone, role) {
  return await db.prepare('INSERT INTO Accounts (username, password, full_name, email, phone, role) VALUES (?, ?, ?, ?, ?, ?)').run(username, passwordVal, full_name, email || null, phone || null, role);
}

// ========== AUTH ==========
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const account = await db.prepare('SELECT * FROM Accounts WHERE username = ?').get(username);
    if (!account || !verifyPassword(password, account))
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    if (account.status === 'LOCKED')
      return res.status(403).json({ error: 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.' });

    const token = jwt.sign({ id: account.id, username: account.username, role: account.role, full_name: account.full_name }, JWT_SECRET, { expiresIn: '24h' });
    const customer = account.role === 'CUSTOMER' ? await db.prepare('SELECT * FROM Customers WHERE account_id = ?').get(account.id) : null;
    res.json({ token, user: { id: account.id, username: account.username, full_name: account.full_name, email: account.email, phone: account.phone, role: account.role, status: account.status }, customer });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Lỗi đăng nhập: ' + err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, full_name, email, phone, age, gender, skin_type, beauty_preferences } = req.body;
    if (!username || !password || !full_name) return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
    const existing = await db.prepare('SELECT id FROM Accounts WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
    const accountResult = await insertAccount(username, password, full_name, email, phone, 'CUSTOMER');
    await db.prepare('INSERT INTO Customers (account_id, age, gender, skin_type, beauty_preferences) VALUES (?, ?, ?, ?, ?)').run(accountResult.lastInsertRowid, age || null, gender || null, skin_type || null, normalizeBeautyPreferences(beauty_preferences) || null);
    res.status(201).json({ message: 'Đăng ký thành công! Vui lòng đăng nhập.' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Lỗi đăng ký: ' + err.message });
  }
});

// ========== ADMIN: Accounts ==========
app.get('/api/admin/accounts', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const { search, role, status } = req.query;
    let sql = "SELECT id, username, password, full_name, email, phone, role, status, created_at FROM Accounts WHERE role IN ('ADMIN', 'MANAGER')";
    const params = [];
    if (search) { sql += ' AND (full_name LIKE ? OR username LIKE ? OR email LIKE ?)'; const s = `%${search}%`; params.push(s, s, s); }
    if (role) { sql += ' AND role = ?'; params.push(role); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC';
    const rows = await db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/accounts', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const { username, password, full_name, email, phone, role } = req.body;
    if (!username || !password || !full_name) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    const targetRole = role === 'ADMIN' ? 'ADMIN' : 'MANAGER';
    const existing = await db.prepare('SELECT id FROM Accounts WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
    const result = await insertAccount(username, password, full_name, email, phone, targetRole);
    res.status(201).json({ message: 'Tạo tài khoản thành công', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/accounts/:id', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const { username, password, full_name, email, phone, role, status } = req.body;

    const targetAccount = await db.prepare('SELECT id, username, role, status FROM Accounts WHERE id = ?').get(targetId);
    if (!targetAccount) {
      return res.status(404).json({ error: 'Tài khoản không tồn tại' });
    }

    if (username && username !== targetAccount.username) {
      const existing = await db.prepare('SELECT id FROM Accounts WHERE username = ? AND id != ?').get(username, targetId);
      if (existing) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
    }

    // Nếu tài khoản đang là ADMIN, ngăn chặn việc hạ quyền hoặc khóa khi chỉ có duy nhất 1 ADMIN
    if (targetAccount.role === 'ADMIN') {
      if (role && role !== 'ADMIN') {
        const adminCountRes = await db.prepare("SELECT COUNT(*) AS total FROM Accounts WHERE role = 'ADMIN'").get();
        const totalAdmins = Number(adminCountRes?.total || 0);
        if (totalAdmins <= 1) {
          return res.status(400).json({ error: 'Không thể thay đổi vai trò tài khoản Admin khi hệ thống chỉ còn duy nhất 1 Admin' });
        }
      }

      if (status === 'LOCKED' && targetAccount.status === 'ACTIVE') {
        const activeAdminRes = await db.prepare("SELECT COUNT(*) AS total FROM Accounts WHERE role = 'ADMIN' AND status = 'ACTIVE'").get();
        const activeAdmins = Number(activeAdminRes?.total || 0);
        if (activeAdmins <= 1) {
          return res.status(400).json({ error: 'Không thể khóa tài khoản Admin khi hệ thống chỉ còn duy nhất 1 Admin đang hoạt động' });
        }
      }
    }

    const updates = [];
    const params = [];
    if (username) { updates.push('username = ?'); params.push(username); }
    if (password) { updates.push('password = ?'); params.push(password); }
    if (full_name) { updates.push('full_name = ?'); params.push(full_name); }
    updates.push('email = ?'); params.push(email || null);
    updates.push('phone = ?'); params.push(phone || null);
    if (role) { updates.push('role = ?'); params.push(role); }
    if (status) { updates.push('status = ?'); params.push(status); }

    params.push(targetId);
    await db.prepare(`UPDATE Accounts SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ message: 'Cập nhật tài khoản thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/accounts/:id', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (!targetId) {
      return res.status(400).json({ error: 'ID tài khoản không hợp lệ' });
    }

    const targetAccount = await db.prepare('SELECT id, username, role FROM Accounts WHERE id = ?').get(targetId);
    if (!targetAccount) {
      return res.status(404).json({ error: 'Tài khoản không tồn tại' });
    }

    // Chặn xóa tài khoản Admin nếu chỉ còn duy nhất 1 Admin trong hệ thống
    if (targetAccount.role === 'ADMIN') {
      const adminCountRes = await db.prepare("SELECT COUNT(*) AS total FROM Accounts WHERE role = 'ADMIN'").get();
      const totalAdmins = Number(adminCountRes?.total || 0);
      if (totalAdmins <= 1) {
        return res.status(400).json({ error: 'Không thể xóa tài khoản Admin khi hệ thống chỉ còn duy nhất 1 Admin' });
      }
    }

    // Gỡ liên kết khóa ngoại nếu có (ví dụ khảo sát do Admin này tạo/gửi) trước khi xóa
    await db.prepare('UPDATE Surveys SET created_by = NULL WHERE created_by = ?').run(targetId);
    await db.prepare('UPDATE SurveyRecipients SET sent_by = NULL WHERE sent_by = ?').run(targetId);

    await db.prepare('DELETE FROM Accounts WHERE id = ?').run(targetId);
    res.json({ message: 'Đã xóa tài khoản' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== PRODUCTS (Manager & Admin) ==========
app.get('/api/admin/products', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { search, category, supplier_id, launch_status, min_price, max_price, sort_by, sort_dir } = req.query;
    let sql = `SELECT p.*, s.name as supplier_name FROM Products p LEFT JOIN Suppliers s ON p.supplier_id = s.id WHERE 1=1`;
    const params = [];
    if (search) { sql += ' AND (p.name LIKE ? OR p.description LIKE ?)'; const v = `%${search}%`; params.push(v, v); }
    if (category) { sql += ' AND p.category = ?'; params.push(category); }
    if (supplier_id) { sql += ' AND p.supplier_id = ?'; params.push(supplier_id); }
    if (launch_status) { sql += ' AND p.launch_status = ?'; params.push(launch_status); }
    if (min_price) { sql += ' AND p.price >= ?'; params.push(Number(min_price)); }
    if (max_price) { sql += ' AND p.price <= ?'; params.push(Number(max_price)); }
    const allowedSort = { name: 'p.name', price: 'p.price', created_at: 'p.created_at', stock_quantity: 'p.stock_quantity' };
    const sortCol = allowedSort[sort_by] || 'p.created_at';
    const sortDir = sort_dir === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortCol} ${sortDir}`;
    const rows = await db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/products', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { name, category, supplier_id, price, stock_quantity, description, launch_status } = req.body;
    if (!name || !category) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    const result = await db.prepare('INSERT INTO Products (name, category, supplier_id, price, stock_quantity, description, launch_status) VALUES (?, ?, ?, ?, ?, ?, ?)').run(name, category, supplier_id || null, price || 0, stock_quantity || 0, description || null, launch_status || 'OFFICIAL');
    res.status(201).json({ message: 'Thêm sản phẩm thành công', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/products/:id', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { name, category, supplier_id, price, stock_quantity, description, launch_status } = req.body;
    await db.prepare('UPDATE Products SET name=?, category=?, supplier_id=?, price=?, stock_quantity=?, description=?, launch_status=? WHERE id=?').run(name, category, supplier_id || null, price, stock_quantity, description, launch_status, req.params.id);
    res.json({ message: 'Cập nhật sản phẩm thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/products/:id', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    await db.prepare('DELETE FROM Products WHERE id = ?').run(req.params.id);
    res.json({ message: 'Đã xóa sản phẩm' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== SUPPLIERS (Manager & Admin) ==========
app.get('/api/admin/suppliers', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { search, status } = req.query;
    let sql = 'SELECT * FROM Suppliers WHERE 1=1';
    const params = [];
    if (search) { sql += ' AND (name LIKE ? OR contact_name LIKE ? OR email LIKE ?)'; const v = `%${search}%`; params.push(v, v, v); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC';
    const rows = await db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/suppliers', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { name, contact_name, email, phone, address, status } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên nhà cung cấp là bắt buộc' });
    const result = await db.prepare('INSERT INTO Suppliers (name, contact_name, email, phone, address, status) VALUES (?, ?, ?, ?, ?, ?)').run(name, contact_name || null, email || null, phone || null, address || null, status || 'ACTIVE');
    res.status(201).json({ message: 'Thêm nhà cung cấp thành công', id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/suppliers/:id', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { name, contact_name, email, phone, address, status } = req.body;
    await db.prepare('UPDATE Suppliers SET name=?, contact_name=?, email=?, phone=?, address=?, status=? WHERE id=?').run(name, contact_name, email, phone, address, status, req.params.id);
    res.json({ message: 'Cập nhật nhà cung cấp thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/suppliers/:id', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    await db.prepare('DELETE FROM Suppliers WHERE id = ?').run(req.params.id);
    res.json({ message: 'Đã xóa nhà cung cấp' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== ADMIN: SQL Server Backup / Restore ==========
app.get('/api/admin/database/info', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  res.json({
    engine: db.engine,
    database: db.databaseName,
    backup_dir: 'C:\\CosmeticsCRM_Backup'
  });
});

app.post('/api/admin/database/backup', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const type = req.body.type === 'DIFFERENTIAL' ? 'DIFFERENTIAL' : 'FULL';
    const defaultName = `CosmeticsCRM_${type}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const filename = String(req.body.filename || defaultName).replace(/[^a-zA-Z0-9_-]/g, '_');
    const script = buildSqlServerBackupScript(type, filename);
    try {
      await db.prepare("EXEC master.dbo.xp_create_subdir N'C:\\CosmeticsCRM_Backup'").run();
    } catch {
      // SQL Server may disable xp_create_subdir; backup will still work if the folder already exists.
    }
    await db.prepare(script).run();
    res.json({
      message: type === 'DIFFERENTIAL' ? 'Đã sao lưu Differential Backup thành công' : 'Đã sao lưu Full Backup thành công',
      filename: `${filename}.bak`,
      path: `C:\\CosmeticsCRM_Backup\\${filename}.bak`,
      script
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/database/restore-script', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  const fullFile = String(req.body.full_file || 'CosmeticsCRM_FULL_YYYYMMDD').replace(/\.bak$/i, '');
  const diffFile = String(req.body.diff_file || 'CosmeticsCRM_DIFF_YYYYMMDD').replace(/\.bak$/i, '');
  const fs = require('fs');
  const backupDir = 'C:\\CosmeticsCRM_Backup';
  const fullPath = path.join(backupDir, `${fullFile}.bak`);
  const diffPath = path.join(backupDir, `${diffFile}.bak`);
  const script = buildSqlServerRestoreScript(fullFile, diffFile);
  res.json({
    message: 'Script phục hồi đã sẵn sàng. Chạy script này trong SSMS với quyền quản trị SQL Server.',
    script,
    verification: {
      full_backup_exists: fs.existsSync(fullPath),
      differential_backup_exists: fs.existsSync(diffPath),
      full_path: fullPath,
      diff_path: diffPath
    }
  });
});

// ========== ADMIN: List existing backup files ==========
app.get('/api/admin/database/backups', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const fs = require('fs');
    const backupDir = 'C:\\CosmeticsCRM_Backup';
    let list = [];
    if (fs.existsSync(backupDir)) {
      list = fs.readdirSync(backupDir)
        .filter(f => f.toLowerCase().endsWith('.bak'))
        .map(f => {
          const stat = fs.statSync(path.join(backupDir, f));
          return { name: f, size: stat.size, created_at: stat.mtime };
        })
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    res.json({ backup_dir: backupDir, backups: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== MANAGER: Dashboard Analytics ==========
app.get('/api/manager/analytics', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const { from, to } = req.query;
    const customerDateParams = [];
    const accountDateParams = [];
    const feedbackDateParams = [];
    const surveyDateParams = [];
    let customerDateWhere = '';
    let accountDateWhere = '';
    let feedbackDateWhere = '';
    let surveyDateWhere = '';
    if (from) {
      customerDateWhere += ' AND c.created_at >= ?';
      accountDateWhere += ' AND a.created_at >= ?';
      feedbackDateWhere += ' AND f.created_at >= ?';
      surveyDateWhere += ' AND s.created_at >= ?';
      customerDateParams.push(from);
      accountDateParams.push(from);
      feedbackDateParams.push(from);
      surveyDateParams.push(from);
    }
    if (to) {
      const toExclusive = `${to}T23:59:59.997`;
      customerDateWhere += ' AND c.created_at <= ?';
      accountDateWhere += ' AND a.created_at <= ?';
      feedbackDateWhere += ' AND f.created_at <= ?';
      surveyDateWhere += ' AND s.created_at <= ?';
      customerDateParams.push(toExclusive);
      accountDateParams.push(toExclusive);
      feedbackDateParams.push(toExclusive);
      surveyDateParams.push(toExclusive);
    }

    const rawAgeGroups = await db.prepare(`
      SELECT
        CASE
          WHEN age < 18 THEN N'Dưới 18'
          WHEN age BETWEEN 18 AND 24 THEN N'18-24'
          WHEN age BETWEEN 25 AND 34 THEN N'25-34'
          WHEN age BETWEEN 35 AND 44 THEN N'35-44'
          ELSE N'45+'
        END AS age_group,
        COUNT(*) as count
      FROM Customers c
      WHERE c.age IS NOT NULL${customerDateWhere}
      GROUP BY
        CASE
          WHEN age < 18 THEN N'Dưới 18'
          WHEN age BETWEEN 18 AND 24 THEN N'18-24'
          WHEN age BETWEEN 25 AND 34 THEN N'25-34'
          WHEN age BETWEEN 35 AND 44 THEN N'35-44'
          ELSE N'45+'
        END
    `).all(...customerDateParams);

    const standardAgeLabels = ['Dưới 18', '18-24', '25-34', '35-44', '45+'];
    const ageMap = Object.fromEntries(standardAgeLabels.map(l => [l, 0]));
    rawAgeGroups.forEach(r => { if (ageMap[r.age_group] !== undefined) ageMap[r.age_group] = Number(r.count); });
    const ageGroups = standardAgeLabels.map(age_group => ({ age_group, count: ageMap[age_group] }));

    const skinTypes = await db.prepare(`SELECT c.skin_type, COUNT(*) as count FROM Customers c WHERE c.skin_type IS NOT NULL${customerDateWhere} GROUP BY c.skin_type ORDER BY count DESC`).all(...customerDateParams);
    const genderGroups = await db.prepare(`SELECT c.gender, COUNT(*) as count FROM Customers c WHERE c.gender IS NOT NULL${customerDateWhere} GROUP BY c.gender ORDER BY count DESC`).all(...customerDateParams);
    const customerProfiles = (await db.prepare(`SELECT c.age, c.skin_type, c.beauty_preferences FROM Customers c WHERE c.beauty_preferences IS NOT NULL${customerDateWhere}`).all(...customerDateParams))
      .map(profile => ({ ...profile, beauty_preferences: normalizeBeautyPreferences(profile.beauty_preferences) }));
    const newCustomersByMonth = await db.prepare(`
      SELECT CONCAT(YEAR(a.created_at), '-', RIGHT(CONCAT('0', MONTH(a.created_at)), 2)) AS month, COUNT(*) AS count
      FROM Customers c
      INNER JOIN Accounts a ON a.id = c.account_id
      WHERE a.role = 'CUSTOMER'${accountDateWhere}
      GROUP BY YEAR(a.created_at), MONTH(a.created_at)
      ORDER BY YEAR(a.created_at), MONTH(a.created_at)
    `).all(...accountDateParams);

    // Process beauty preferences (sorted descending)
    const allPrefs = customerProfiles;
    const prefCount = {};
    allPrefs.forEach(row => {
      if (row.beauty_preferences) {
        row.beauty_preferences.split(',').forEach(p => {
          const key = p.trim();
          if (key && BEAUTY_PREFERENCES.has(key)) {
            prefCount[key] = (prefCount[key] || 0) + 1;
          }
        });
      }
    });
    const beautyPrefs = Object.entries(prefCount).map(([pref, count]) => ({ pref, count })).sort((a, b) => b.count - a.count);

    const totalCustRow = await db.prepare(`SELECT COUNT(*) as cnt FROM Customers c WHERE 1=1${customerDateWhere}`).get(...customerDateParams);
    const lockedCustRow = await db.prepare(`SELECT COUNT(*) as cnt FROM Accounts a JOIN Customers c ON c.account_id = a.id WHERE a.role='CUSTOMER' AND a.status='LOCKED'${customerDateWhere}`).get(...customerDateParams);
    const avgRatingRow = await db.prepare(`SELECT ROUND(AVG(CAST(f.rating AS FLOAT)), 1) as avg FROM Feedbacks f WHERE 1=1${feedbackDateWhere}`).get(...feedbackDateParams);
    const totalFeedbacksRow = await db.prepare(`SELECT COUNT(*) as cnt FROM Feedbacks f WHERE 1=1${feedbackDateWhere}`).get(...feedbackDateParams);
    const repliedFeedbacksRow = await db.prepare(`SELECT COUNT(*) as cnt FROM Feedbacks f WHERE f.status='REPLIED'${feedbackDateWhere}`).get(...feedbackDateParams);
    const pendingFeedbacksRow = await db.prepare(`SELECT COUNT(*) as cnt FROM Feedbacks f WHERE f.status='PENDING'${feedbackDateWhere}`).get(...feedbackDateParams);
    const negativeFeedbacksRow = await db.prepare(`SELECT COUNT(*) as cnt FROM Feedbacks f WHERE f.rating <= 2${feedbackDateWhere}`).get(...feedbackDateParams);

    const activeSurveysRow = await db.prepare(`SELECT COUNT(*) as cnt FROM Surveys s WHERE s.status='ACTIVE'${surveyDateWhere}`).get(...surveyDateParams);
    const totalSurveyRespRow = await db.prepare(`SELECT COUNT(*) as cnt FROM SurveyResults sr JOIN Surveys s ON s.id = sr.survey_id WHERE 1=1${surveyDateWhere.replaceAll('s.created_at', 'sr.submitted_at')}`).get(...surveyDateParams);
    const surveyRecipientRow = await db.prepare(`SELECT COUNT(*) as cnt FROM SurveyRecipients r JOIN Surveys s ON s.id = r.survey_id WHERE 1=1${surveyDateWhere.replaceAll('s.created_at', 'r.sent_at')}`).get(...surveyDateParams);

    const totalFeedbacks = totalFeedbacksRow?.cnt || 0;
    const ratingDistRows = await db.prepare(`
      SELECT rating, COUNT(*) as count 
      FROM Feedbacks f 
      WHERE 1=1${feedbackDateWhere}
      GROUP BY rating
    `).all(...feedbackDateParams);
    const ratingDistribution = [5, 4, 3, 2, 1].map(stars => {
      const found = ratingDistRows.find(r => Number(r.rating) === stars);
      const count = found ? Number(found.count) : 0;
      const percent = totalFeedbacks ? Math.round((count / totalFeedbacks) * 100) : 0;
      return { stars, count, percent };
    });

    const feedbackByProduct = await db.prepare(`
      SELECT p.id AS product_id, p.name AS product_name,
        COUNT(f.id) AS count,
        ROUND(AVG(CAST(f.rating AS FLOAT)), 1) AS average,
        SUM(CASE WHEN f.rating >= 4 THEN 1 ELSE 0 END) AS positive_count,
        SUM(CASE WHEN f.rating <= 2 THEN 1 ELSE 0 END) AS negative_count,
        SUM(CASE WHEN f.status = 'REPLIED' THEN 1 ELSE 0 END) AS replied_count,
        SUM(CASE WHEN f.status = 'PENDING' THEN 1 ELSE 0 END) AS pending_count
      FROM Products p
      JOIN Feedbacks f ON p.id = f.product_id
      WHERE 1=1${feedbackDateWhere}
      GROUP BY p.id, p.name
      ORDER BY average DESC, count DESC
    `).all(...feedbackDateParams);

    const surveyOverview = await db.prepare(`
      SELECT s.id, s.title, s.status, s.created_at,
        (SELECT COUNT(*) FROM SurveyRecipients r WHERE r.survey_id = s.id) AS recipients,
        (SELECT COUNT(*) FROM SurveyResults sr WHERE sr.survey_id = s.id) AS responses,
        (
          SELECT ROUND(AVG(CAST(sa.answer_value AS FLOAT)), 1)
          FROM SurveyAnswers sa
          JOIN SurveyResults sr2 ON sr2.id = sa.survey_result_id
          JOIN Questions q ON q.id = sa.question_id
          WHERE sr2.survey_id = s.id AND q.question_type = 'RATING' AND ISNUMERIC(sa.answer_value) = 1
        ) AS csat_avg
      FROM Surveys s WHERE 1=1${surveyDateWhere}
      ORDER BY s.created_at DESC
    `).all(...surveyDateParams);

    const totalCustomers = totalCustRow?.cnt || 0;
    const lockedCustomers = lockedCustRow?.cnt || 0;
    const avgRating = avgRatingRow?.avg || 0;
    const repliedFeedbacks = repliedFeedbacksRow?.cnt || 0;
    const pendingFeedbacks = pendingFeedbacksRow?.cnt || 0;
    const negativeFeedbacks = negativeFeedbacksRow?.cnt || 0;
    const activeSurveys = activeSurveysRow?.cnt || 0;
    const totalSurveyResponses = totalSurveyRespRow?.cnt || 0;
    const surveyRecipients = surveyRecipientRow?.cnt || 0;

    res.json({
      ageGroups, skinTypes, genderGroups, beautyPrefs, customerProfiles, newCustomersByMonth,
      feedbackByProduct, surveyOverview,
      stats: {
        totalCustomers, lockedCustomers, avgRating, totalFeedbacks, repliedFeedbacks,
        pendingFeedbacks, negativeFeedbacks,
        feedbackReplyRate: totalFeedbacks ? Math.round((repliedFeedbacks / totalFeedbacks) * 100) : 0,
        activeSurveys, totalSurveyResponses, surveyRecipients,
        surveyResponseRate: surveyRecipients ? Math.round((totalSurveyResponses / surveyRecipients) * 100) : 0,
        ratingDistribution
      }
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== MANAGER: Chi tiết khách hàng đánh giá một sản phẩm ==========
app.get('/api/manager/products/:productId/feedbacks', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const product = await db.prepare('SELECT id, name, category, price FROM Products WHERE id = ?').get(productId);
    if (!product) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });

    const feedbacks = await db.prepare(`
      SELECT f.id, f.rating, f.content, f.reply_content, f.status, f.created_at,
        a.id AS account_id, a.full_name, a.email, a.phone,
        c.id AS customer_id, c.age, c.gender, c.skin_type, c.beauty_preferences
      FROM Feedbacks f
      JOIN Customers c ON f.customer_id = c.id
      JOIN Accounts a ON c.account_id = a.id
      WHERE f.product_id = ?
      ORDER BY f.created_at DESC
    `).all(productId);

    res.json({ product, feedbacks });
  } catch (err) {
    console.error('Product feedbacks error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/manager/analytics/export', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const { type, from, to } = req.query;
    const params = [];
    let where = '';
    let headers;
    let rows;
    if (type === 'customers') {
      if (from) { where += ' AND c.created_at >= ?'; params.push(from); }
      if (to) { where += ' AND c.created_at <= ?'; params.push(`${to}T23:59:59.997`); }
      headers = ['Họ tên', 'Username', 'Email', 'Trạng thái', 'Tuổi', 'Giới tính', 'Loại da', 'Ngày đăng ký'];
      rows = await db.prepare(`SELECT a.full_name, a.username, a.email, a.status, c.age, c.gender, c.skin_type, c.created_at FROM Accounts a JOIN Customers c ON c.account_id = a.id WHERE a.role='CUSTOMER'${where} ORDER BY c.created_at DESC`).all(...params);
    } else if (type === 'feedbacks') {
      if (from) { where += ' AND f.created_at >= ?'; params.push(from); }
      if (to) { where += ' AND f.created_at <= ?'; params.push(`${to}T23:59:59.997`); }
      headers = ['Khách hàng', 'Sản phẩm', 'Số sao', 'Trạng thái', 'Nội dung', 'Ngày gửi'];
      rows = await db.prepare(`SELECT a.full_name AS customer_name, p.name AS product_name, f.rating, f.status, f.content, f.created_at FROM Feedbacks f JOIN Customers c ON c.id=f.customer_id JOIN Accounts a ON a.id=c.account_id JOIN Products p ON p.id=f.product_id WHERE 1=1${where} ORDER BY f.created_at DESC`).all(...params);
    } else if (type === 'surveys') {
      if (from) { where += ' AND s.created_at >= ?'; params.push(from); }
      if (to) { where += ' AND s.created_at <= ?'; params.push(`${to}T23:59:59.997`); }
      headers = ['Tiêu đề', 'Trạng thái', 'Số người nhận', 'Số phản hồi', 'Ngày tạo'];
      rows = await db.prepare(`SELECT s.title, s.status, (SELECT COUNT(*) FROM SurveyRecipients r WHERE r.survey_id=s.id) AS recipients, (SELECT COUNT(*) FROM SurveyResults sr WHERE sr.survey_id=s.id) AS responses, s.created_at FROM Surveys s WHERE 1=1${where} ORDER BY s.created_at DESC`).all(...params);
    } else {
      return res.status(400).json({ error: 'Loại báo cáo không hợp lệ' });
    }
    const escapeCsv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [headers, ...rows.map(row => headers.map((_, index) => escapeCsv(Object.values(row)[index])))].map(line => line.join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-analytics.csv"`);
    res.send('\uFEFF' + csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== MANAGER: Customers ==========
app.get('/api/manager/customers', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const { search, skin_type, status } = req.query;
    let sql = `SELECT a.id, a.username, a.password, a.full_name, a.email, a.phone, a.status, a.created_at,
      c.id as customer_id, c.age, c.gender, c.skin_type, c.beauty_preferences
      FROM Accounts a LEFT JOIN Customers c ON a.id = c.account_id
      WHERE a.role = 'CUSTOMER'`;
    const params = [];
    if (search) { sql += ' AND (a.full_name LIKE ? OR a.username LIKE ? OR a.phone LIKE ?)'; const v = `%${search}%`; params.push(v, v, v); }
    if (skin_type) { sql += ' AND c.skin_type = ?'; params.push(skin_type); }
    if (status) { sql += ' AND a.status = ?'; params.push(status); }
    sql += ' ORDER BY a.created_at DESC';
    const rows = await db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/manager/customers', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const { username, password, full_name, email, phone, age, gender, skin_type, beauty_preferences } = req.body;
    if (!username || !password || !full_name) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    const existing = await db.prepare('SELECT id FROM Accounts WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
    const accResult = await insertAccount(username, password, full_name, email, phone, 'CUSTOMER');
    await db.prepare('INSERT INTO Customers (account_id, age, gender, skin_type, beauty_preferences) VALUES (?, ?, ?, ?, ?)').run(accResult.lastInsertRowid, age || null, gender || null, skin_type || null, normalizeBeautyPreferences(beauty_preferences) || null);
    res.status(201).json({ message: 'Thêm khách hàng thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/manager/customers/:accountId', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const accountId = Number(req.params.accountId);
    const { username, password, full_name, email, phone, age, gender, skin_type, status, beauty_preferences } = req.body;
    const targetAccount = await db.prepare("SELECT id, username FROM Accounts WHERE id = ? AND role = 'CUSTOMER'").get(accountId);
    if (!targetAccount) return res.status(404).json({ error: 'Khách hàng không tồn tại' });

    if (username && username !== targetAccount.username) {
      const existing = await db.prepare('SELECT id FROM Accounts WHERE username = ? AND id != ?').get(username, accountId);
      if (existing) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
    }

    const accUpdates = [];
    const accParams = [];
    if (username) { accUpdates.push('username = ?'); accParams.push(username); }
    if (password) { accUpdates.push('password = ?'); accParams.push(password); }
    if (full_name) { accUpdates.push('full_name = ?'); accParams.push(full_name); }
    accUpdates.push('email = ?'); accParams.push(email || null);
    accUpdates.push('phone = ?'); accParams.push(phone || null);
    if (status) { accUpdates.push('status = ?'); accParams.push(status); }
    accParams.push(accountId);

    await db.prepare(`UPDATE Accounts SET ${accUpdates.join(', ')} WHERE id = ?`).run(...accParams);

    const custRow = await db.prepare('SELECT id FROM Customers WHERE account_id = ?').get(accountId);
    if (custRow) {
      await db.prepare(`
        UPDATE Customers
        SET age = ?, gender = ?, skin_type = ?, beauty_preferences = ?
        WHERE account_id = ?
      `).run(age || null, gender || null, skin_type || null, normalizeBeautyPreferences(beauty_preferences) || null, accountId);
    } else {
      await db.prepare(`
        INSERT INTO Customers (account_id, age, gender, skin_type, beauty_preferences)
        VALUES (?, ?, ?, ?, ?)
      `).run(accountId, age || null, gender || null, skin_type || null, normalizeBeautyPreferences(beauty_preferences) || null);
    }

    res.json({ message: 'Cập nhật thông tin khách hàng thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/manager/customers/:accountId/status', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const { status } = req.body;
    await db.prepare('UPDATE Accounts SET status = ? WHERE id = ? AND role = ?').run(status, req.params.accountId, 'CUSTOMER');
    res.json({ message: status === 'LOCKED' ? 'Đã khóa tài khoản khách hàng' : 'Đã mở khóa tài khoản khách hàng' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/manager/customers/:accountId', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const accountId = Number(req.params.accountId);
    // Xóa liên hoàn dữ liệu liên quan đến khách hàng trước
    const cust = await db.prepare('SELECT id FROM Customers WHERE account_id = ?').get(accountId);
    if (cust) {
      await db.prepare('DELETE FROM SurveyAnswers WHERE survey_result_id IN (SELECT id FROM SurveyResults WHERE customer_id = ?)').run(cust.id);
      await db.prepare('DELETE FROM SurveyResults WHERE customer_id = ?').run(cust.id);
      await db.prepare('DELETE FROM SurveyRecipients WHERE customer_id = ?').run(cust.id);
      await db.prepare('DELETE FROM Feedbacks WHERE customer_id = ?').run(cust.id);
      await db.prepare('DELETE FROM Customers WHERE id = ?').run(cust.id);
    }
    await db.prepare("DELETE FROM Accounts WHERE id = ? AND role = 'CUSTOMER'").run(accountId);
    res.json({ message: 'Đã xóa khách hàng thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== MANAGER: Surveys ==========
app.get('/api/manager/surveys', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const surveys = await db.prepare(`
      SELECT s.*,
      (SELECT STRING_AGG(p2.name, N', ') FROM SurveyProducts sp2 JOIN Products p2 ON sp2.product_id = p2.id WHERE sp2.survey_id = s.id) as product_names,
      a.full_name as creator_name,
      (SELECT COUNT(*) FROM SurveyResults sr WHERE sr.survey_id = s.id) as response_count,
      (SELECT COUNT(*) FROM Questions q WHERE q.survey_id = s.id) as question_count,
      (SELECT COUNT(*) FROM SurveyRecipients r WHERE r.survey_id = s.id) as recipient_count
      FROM Surveys s
      LEFT JOIN Accounts a ON s.created_by = a.id
      ORDER BY s.created_at DESC
    `).all();
    res.json(surveys);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/manager/surveys/:id', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const surveyId = Number(req.params.id);
    const survey = await db.prepare('SELECT * FROM Surveys WHERE id = ?').get(surveyId);
    if (!survey) return res.status(404).json({ error: 'Không tìm thấy khảo sát' });
    const questions = await db.prepare('SELECT * FROM Questions WHERE survey_id = ? ORDER BY order_index').all(surveyId);
    questions.forEach(q => {
      if (q.options) {
        try { q.options = JSON.parse(q.options); } catch {}
      }
    });
    const targetProducts = await db.prepare('SELECT product_id FROM SurveyProducts WHERE survey_id = ?').all(surveyId);
    const recipientRows = await db.prepare('SELECT customer_id FROM SurveyRecipients WHERE survey_id = ?').all(surveyId);
    res.json({
      ...survey,
      target_product_ids: targetProducts.map(p => p.product_id),
      recipient_customer_ids: recipientRows.map(r => r.customer_id),
      questions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/manager/surveys', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const { title, description, target_product_ids, start_date, end_date, questions, recipient_customer_ids } = req.body;
    if (!title) return res.status(400).json({ error: 'Tiêu đề khảo sát là bắt buộc' });
    if (!target_product_ids || !Array.isArray(target_product_ids) || target_product_ids.length === 0) {
      return res.status(400).json({ error: 'Vui lòng chọn ít nhất một sản phẩm cho chiến dịch khảo sát' });
    }
    const surveyResult = await db.prepare('INSERT INTO Surveys (title, description, target_product_id, start_date, end_date, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(title, description || null, null, start_date || null, end_date || null, 'DRAFT', req.user.id);
    // Lưu danh sách sản phẩm vào bảng SurveyProducts
    for (const productId of target_product_ids) {
      await db.prepare('INSERT INTO SurveyProducts (survey_id, product_id) VALUES (?, ?)').run(surveyResult.lastInsertRowid, productId);
    }
    if (questions && questions.length > 0) {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await db.prepare('INSERT INTO Questions (survey_id, question_text, question_type, options, order_index) VALUES (?, ?, ?, ?, ?)').run(surveyResult.lastInsertRowid, q.question_text, q.question_type, q.options ? JSON.stringify(q.options) : null, i + 1);
      }
    }
    const recipientCount = await assignSurveyRecipients(surveyResult.lastInsertRowid, recipient_customer_ids, req.user.id);
    res.status(201).json({ message: 'Tạo khảo sát thành công', id: surveyResult.lastInsertRowid, recipient_count: recipientCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/manager/surveys/:id', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const surveyId = Number(req.params.id);
    const { title, description, target_product_ids, start_date, end_date, status, questions, recipient_customer_ids } = req.body;
    if (!title) return res.status(400).json({ error: 'Tiêu đề khảo sát là bắt buộc' });
    if (!target_product_ids || !Array.isArray(target_product_ids) || target_product_ids.length === 0) {
      return res.status(400).json({ error: 'Vui lòng chọn ít nhất một sản phẩm' });
    }

    const existing = await db.prepare('SELECT id FROM Surveys WHERE id = ?').get(surveyId);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy khảo sát' });

    // Cập nhật Surveys
    await db.prepare(`
      UPDATE Surveys 
      SET title = ?, description = ?, start_date = ?, end_date = ?, status = COALESCE(?, status)
      WHERE id = ?
    `).run(title, description || null, start_date || null, end_date || null, status || null, surveyId);

    // Cập nhật SurveyProducts
    await db.prepare('DELETE FROM SurveyProducts WHERE survey_id = ?').run(surveyId);
    for (const pid of target_product_ids) {
      await db.prepare('INSERT INTO SurveyProducts (survey_id, product_id) VALUES (?, ?)').run(surveyId, pid);
    }

    // Cập nhật Questions nếu có
    if (questions && Array.isArray(questions)) {
      await db.prepare('DELETE FROM Questions WHERE survey_id = ?').run(surveyId);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await db.prepare('INSERT INTO Questions (survey_id, question_text, question_type, options, order_index) VALUES (?, ?, ?, ?, ?)').run(surveyId, q.question_text, q.question_type, q.options ? JSON.stringify(q.options) : null, i + 1);
      }
    }

    // Cập nhật người nhận nếu có
    if (recipient_customer_ids && Array.isArray(recipient_customer_ids)) {
      await db.prepare('DELETE FROM SurveyRecipients WHERE survey_id = ?').run(surveyId);
      await assignSurveyRecipients(surveyId, recipient_customer_ids, req.user.id);
    }

    res.json({ message: 'Cập nhật khảo sát thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/manager/surveys/:id', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const surveyId = Number(req.params.id);
    const existing = await db.prepare('SELECT id, title FROM Surveys WHERE id = ?').get(surveyId);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy khảo sát' });

    // Xóa liên hoàn câu trả lời, kết quả, người nhận, sản phẩm, câu hỏi, khảo sát
    await db.prepare('DELETE FROM SurveyAnswers WHERE survey_result_id IN (SELECT id FROM SurveyResults WHERE survey_id = ?)').run(surveyId);
    await db.prepare('DELETE FROM SurveyResults WHERE survey_id = ?').run(surveyId);
    await db.prepare('DELETE FROM SurveyRecipients WHERE survey_id = ?').run(surveyId);
    await db.prepare('DELETE FROM SurveyProducts WHERE survey_id = ?').run(surveyId);
    await db.prepare('DELETE FROM Questions WHERE survey_id = ?').run(surveyId);
    await db.prepare('DELETE FROM Surveys WHERE id = ?').run(surveyId);

    res.json({ message: `Đã xóa khảo sát "${existing.title}" thành công` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/manager/surveys/:id/status', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const { status } = req.body;
    await db.prepare('UPDATE Surveys SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ message: `Đã cập nhật trạng thái khảo sát thành ${status}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/manager/surveys/:id/recipients', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT c.id as customer_id, a.full_name, a.username, a.email, a.phone, a.status,
        CASE WHEN r.id IS NULL THEN 0 ELSE 1 END as is_recipient,
        CASE WHEN sr.id IS NULL THEN 0 ELSE 1 END as already_submitted,
        r.sent_at
      FROM Customers c
      JOIN Accounts a ON c.account_id = a.id
      LEFT JOIN SurveyRecipients r ON r.customer_id = c.id AND r.survey_id = ?
      LEFT JOIN SurveyResults sr ON sr.customer_id = c.id AND sr.survey_id = ?
      WHERE a.role = 'CUSTOMER'
      ORDER BY is_recipient DESC, a.full_name
    `).all(req.params.id, req.params.id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/manager/surveys/:id/recipients', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const { customer_ids } = req.body;
    await db.prepare('DELETE FROM SurveyRecipients WHERE survey_id = ?').run(req.params.id);
    const recipientCount = await assignSurveyRecipients(req.params.id, customer_ids, req.user.id);
    res.json({ message: 'Đã cập nhật danh sách người nhận khảo sát', recipient_count: recipientCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== MANAGER: Gửi (kích hoạt) khảo sát đến người nhận ==========
app.post('/api/manager/surveys/:id/send', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const survey = await db.prepare('SELECT id, status FROM Surveys WHERE id = ?').get(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Không tìm thấy khảo sát' });

    const countRow = await db.prepare('SELECT COUNT(*) as cnt FROM SurveyRecipients WHERE survey_id = ?').get(req.params.id);
    const recipientCount = countRow?.cnt || 0;
    if (recipientCount === 0) return res.status(400).json({ error: 'Chưa có người nhận nào. Vui lòng chọn người nhận trước khi gửi khảo sát.' });

    // Đánh dấu thời điểm thực sự gửi và kích hoạt khảo sát để khách hàng nhận thấy
    await db.prepare('UPDATE SurveyRecipients SET sent_at = GETDATE(), sent_by = ? WHERE survey_id = ?').run(req.user.id, req.params.id);
    await db.prepare('UPDATE Surveys SET status = ? WHERE id = ?').run('ACTIVE', req.params.id);

    res.json({
      message: `Đã gửi khảo sát đến ${recipientCount} người nhận`,
      recipient_count: recipientCount,
      survey_id: survey.id,
      old_status: survey.status,
      new_status: 'ACTIVE'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/manager/surveys/:id/results', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const surveyId = Number(req.params.id);
    const survey = await db.prepare('SELECT * FROM Surveys WHERE id = ?').get(surveyId);
    if (!survey) return res.status(404).json({ error: 'Không tìm thấy khảo sát' });
    const questions = await db.prepare('SELECT * FROM Questions WHERE survey_id = ? ORDER BY order_index').all(surveyId);

    // Lấy toàn bộ câu trả lời kèm thông tin khách hàng và tài khoản
    const allAnswers = await db.prepare(`
      SELECT 
        sa.id AS answer_id,
        sa.question_id,
        sa.answer_value,
        sr.id AS survey_result_id,
        sr.customer_id,
        sr.submitted_at,
        a.full_name,
        a.username,
        a.email,
        a.phone,
        c.skin_type,
        c.age,
        c.gender
      FROM SurveyAnswers sa
      JOIN SurveyResults sr ON sa.survey_result_id = sr.id
      JOIN Customers c ON sr.customer_id = c.id
      JOIN Accounts a ON c.account_id = a.id
      WHERE sr.survey_id = ?
      ORDER BY sr.submitted_at DESC
    `).all(surveyId);

    // Lấy danh sách toàn bộ người nhận khảo sát
    const allRecipients = await db.prepare(`
      SELECT 
        c.id AS customer_id,
        a.full_name,
        a.username,
        a.email,
        a.phone,
        c.skin_type,
        c.age,
        c.gender,
        r.sent_at,
        CASE WHEN sr.id IS NULL THEN 0 ELSE 1 END AS already_submitted,
        sr.submitted_at
      FROM SurveyRecipients r
      JOIN Customers c ON r.customer_id = c.id
      JOIN Accounts a ON c.account_id = a.id
      LEFT JOIN SurveyResults sr ON sr.customer_id = c.id AND sr.survey_id = r.survey_id
      WHERE r.survey_id = ?
      ORDER BY already_submitted DESC, a.full_name ASC
    `).all(surveyId);

    // Phân tích từng câu hỏi (TAB 1)
    const results = [];
    for (const q of questions) {
      const qAnswers = allAnswers.filter(a => Number(a.question_id) === Number(q.id));
      const analysis = {
        question_id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        total_responses: qAnswers.length
      };

      if (q.question_type === 'RATING') {
        const vals = qAnswers.map(a => Number(a.answer_value)).filter(v => !isNaN(v));
        analysis.average = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
        // Đảo thứ tự: 5 sao -> 1 sao kèm danh sách người đánh giá (drilldown)
        analysis.distribution = [5, 4, 3, 2, 1].map(stars => {
          const reviewers = qAnswers
            .filter(a => Number(a.answer_value) === stars)
            .map(a => ({
              customer_id: a.customer_id,
              full_name: a.full_name,
              email: a.email,
              phone: a.phone,
              skin_type: a.skin_type,
              age: a.age,
              gender: a.gender,
              submitted_at: a.submitted_at
            }));
          const count = reviewers.length;
          const percent = qAnswers.length ? Math.round((count / qAnswers.length) * 100) : 0;
          return { value: stars, count, percent, reviewers };
        });
      } else if (q.question_type === 'SINGLE_CHOICE' || q.question_type === 'MULTI_CHOICE') {
        const counts = {};
        const choiceReviewers = {};
        qAnswers.forEach(a => {
          let selectedValues = [];
          try {
            const parsed = JSON.parse(a.answer_value);
            selectedValues = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            selectedValues = [a.answer_value];
          }
          selectedValues.forEach(val => {
            const key = String(val).trim();
            if (key) {
              counts[key] = (counts[key] || 0) + 1;
              if (!choiceReviewers[key]) choiceReviewers[key] = [];
              choiceReviewers[key].push({
                customer_id: a.customer_id,
                full_name: a.full_name,
                email: a.email,
                phone: a.phone,
                skin_type: a.skin_type,
                age: a.age,
                gender: a.gender,
                submitted_at: a.submitted_at
              });
            }
          });
        });
        analysis.distribution = Object.entries(counts).map(([label, count]) => ({
          label,
          count,
          percent: qAnswers.length ? Math.round((count / qAnswers.length) * 100) : 0,
          reviewers: choiceReviewers[label] || []
        }));
      } else {
        // TEXT question
        analysis.text_answers = qAnswers
          .filter(a => a.answer_value && String(a.answer_value).trim())
          .map(a => ({
            text: a.answer_value,
            customer_id: a.customer_id,
            full_name: a.full_name,
            email: a.email,
            phone: a.phone,
            skin_type: a.skin_type,
            age: a.age,
            gender: a.gender,
            submitted_at: a.submitted_at
          }));
      }
      results.push(analysis);
    }

    // Danh sách cá nhân đã trả lời khảo sát (TAB 2)
    const respondentsMap = new Map();
    allAnswers.forEach(a => {
      if (!respondentsMap.has(a.customer_id)) {
        respondentsMap.set(a.customer_id, {
          customer_id: a.customer_id,
          full_name: a.full_name,
          username: a.username,
          email: a.email,
          phone: a.phone,
          skin_type: a.skin_type,
          age: a.age,
          gender: a.gender,
          submitted_at: a.submitted_at,
          answers: [],
          rating_values: []
        });
      }
      const item = respondentsMap.get(a.customer_id);
      const qu = questions.find(q => Number(q.id) === Number(a.question_id));
      item.answers.push({
        question_id: a.question_id,
        question_text: qu ? qu.question_text : `Câu hỏi #${a.question_id}`,
        question_type: qu ? qu.question_type : 'UNKNOWN',
        answer_value: a.answer_value
      });
      if (qu && qu.question_type === 'RATING') {
        const num = Number(a.answer_value);
        if (!isNaN(num)) item.rating_values.push(num);
      }
    });

    const respondents = [...respondentsMap.values()].map(r => {
      const avg = r.rating_values.length
        ? (r.rating_values.reduce((x, y) => x + y, 0) / r.rating_values.length).toFixed(1)
        : null;
      let cskh_status = 'NORMAL';
      if (avg !== null) {
        if (Number(avg) < 3.5) cskh_status = 'CARE_NEEDED';
        else if (Number(avg) >= 4.0) cskh_status = 'SATISFIED';
      }
      return {
        ...r,
        avg_rating: avg,
        cskh_status
      };
    });

    // Danh sách người nhận (TAB 3)
    const recipients = allRecipients.map(r => ({
      customer_id: r.customer_id,
      full_name: r.full_name,
      username: r.username,
      email: r.email,
      phone: r.phone,
      skin_type: r.skin_type,
      age: r.age,
      gender: r.gender,
      channel: '📱 In-App Web',
      already_submitted: r.already_submitted,
      sent_at: r.sent_at,
      submitted_at: r.submitted_at
    }));

    // Thống kê nhanh (4 chỉ số đầu Modal)
    const allRatingValues = allAnswers
      .filter(a => {
        const qu = questions.find(q => Number(q.id) === Number(a.question_id));
        return qu && qu.question_type === 'RATING' && !isNaN(Number(a.answer_value));
      })
      .map(a => Number(a.answer_value));

    const overallAvg = allRatingValues.length
      ? (allRatingValues.reduce((a, b) => a + b, 0) / allRatingValues.length).toFixed(1)
      : null;

    const stats = {
      recipients_count: recipients.length,
      respondents_count: respondents.length,
      pending_count: Math.max(0, recipients.length - respondents.length),
      response_rate: recipients.length ? Math.round((respondents.length / recipients.length) * 100) : 0,
      overall_avg_rating: overallAvg
    };

    res.json({
      survey,
      stats,
      results,
      respondents,
      recipients,
      total_respondents: respondents.length
    });
  } catch (err) {
    console.error('Survey results error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== MANAGER: Gửi nhắc nhở khảo sát ==========
app.post('/api/manager/surveys/:id/remind', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const surveyId = Number(req.params.id);
    const { customer_id, remind_all } = req.body;
    const survey = await db.prepare('SELECT id, title FROM Surveys WHERE id = ?').get(surveyId);
    if (!survey) return res.status(404).json({ error: 'Không tìm thấy khảo sát' });

    if (remind_all) {
      const unsubmitted = await db.prepare(`
        SELECT r.customer_id, a.full_name
        FROM SurveyRecipients r
        JOIN Customers c ON r.customer_id = c.id
        JOIN Accounts a ON c.account_id = a.id
        LEFT JOIN SurveyResults sr ON sr.customer_id = c.id AND sr.survey_id = r.survey_id
        WHERE r.survey_id = ? AND sr.id IS NULL
      `).all(surveyId);

      return res.json({
        success: true,
        message: `Đã gửi lời nhắc thành công đến toàn bộ ${unsubmitted.length} khách hàng chưa tham gia!`,
        reminded_count: unsubmitted.length
      });
    }

    if (customer_id) {
      const cust = await db.prepare(`
        SELECT a.full_name
        FROM Customers c
        JOIN Accounts a ON c.account_id = a.id
        WHERE c.id = ?
      `).get(customer_id);

      return res.json({
        success: true,
        message: `Đã gửi lời nhắc khảo sát tới khách hàng "${cust?.full_name || 'được chọn'}"!`,
        customer_id
      });
    }

    res.status(400).json({ error: 'Vui lòng chọn khách hàng hoặc chọn nhắc tất cả' });
  } catch (err) {
    console.error('Survey remind error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== MANAGER: Feedbacks ==========
app.get('/api/manager/feedbacks', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const { rating, status } = req.query;
    let sql = `SELECT f.*, a.full_name as customer_name, p.name as product_name
      FROM Feedbacks f JOIN Customers c ON f.customer_id = c.id JOIN Accounts a ON c.account_id = a.id JOIN Products p ON f.product_id = p.id WHERE 1=1`;
    const params = [];
    if (rating) { sql += ' AND f.rating = ?'; params.push(Number(rating)); }
    if (status) { sql += ' AND f.status = ?'; params.push(status); }
    sql += ' ORDER BY f.created_at DESC';
    const rows = await db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/manager/feedbacks/:id/reply', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const { reply_content } = req.body;
    await db.prepare("UPDATE Feedbacks SET reply_content = ?, status = 'REPLIED' WHERE id = ?").run(reply_content, req.params.id);
    res.json({ message: 'Đã phản hồi thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== CUSTOMER: Profile ==========
app.get('/api/customer/profile', authMiddleware, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const account = await db.prepare('SELECT id, username, full_name, email, phone, status, created_at FROM Accounts WHERE id = ?').get(req.user.id);
    const customer = await db.prepare('SELECT * FROM Customers WHERE account_id = ?').get(req.user.id);
    res.json({ account, customer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/customer/profile', authMiddleware, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const { full_name, email, phone, age, gender, skin_type, beauty_preferences } = req.body;
    await db.prepare('UPDATE Accounts SET full_name = ?, email = ?, phone = ? WHERE id = ?').run(full_name, email, phone, req.user.id);
    await db.prepare('UPDATE Customers SET age = ?, gender = ?, skin_type = ?, beauty_preferences = ? WHERE account_id = ?').run(age || null, gender || null, skin_type || null, normalizeBeautyPreferences(beauty_preferences) || null, req.user.id);
    res.json({ message: 'Cập nhật thông tin thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== CUSTOMER: Products ==========
app.get('/api/customer/products', authMiddleware, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const customer = await db.prepare('SELECT id FROM Customers WHERE account_id = ?').get(req.user.id);
    const customerId = customer ? customer.id : 0;
    const products = await db.prepare(`
      SELECT p.*, s.name as supplier_name,
        CASE WHEN EXISTS (SELECT 1 FROM Feedbacks f WHERE f.customer_id = ? AND f.product_id = p.id) THEN 1 ELSE 0 END AS already_reviewed
      FROM Products p 
      LEFT JOIN Suppliers s ON p.supplier_id = s.id 
      ORDER BY p.launch_status DESC, p.created_at DESC
    `).all(customerId);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== CUSTOMER: Surveys ==========
app.get('/api/customer/surveys', authMiddleware, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const customer = await db.prepare('SELECT id FROM Customers WHERE account_id = ?').get(req.user.id);
    if (!customer) return res.json([]);
    const surveys = await db.prepare(`
      SELECT s.*,
      (SELECT STRING_AGG(p2.name, N', ') FROM SurveyProducts sp2 JOIN Products p2 ON sp2.product_id = p2.id WHERE sp2.survey_id = s.id) as product_names,
      (SELECT COUNT(*) FROM Questions q WHERE q.survey_id = s.id) as question_count,
      (SELECT COUNT(*) FROM SurveyResults sr WHERE sr.survey_id = s.id AND sr.customer_id = ?) as already_submitted
      FROM Surveys s
      JOIN SurveyRecipients r ON r.survey_id = s.id AND r.customer_id = ?
      WHERE s.status = 'ACTIVE'
      ORDER BY r.sent_at DESC, s.created_at DESC
    `).all(customer.id, customer.id);
    res.json(surveys);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customer/surveys/:id', authMiddleware, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const customer = await db.prepare('SELECT id FROM Customers WHERE account_id = ?').get(req.user.id);
    if (!customer) return res.status(400).json({ error: 'Không tìm thấy hồ sơ khách hàng' });
    const survey = await db.prepare(`
      SELECT s.*,
      (SELECT STRING_AGG(p2.name, N', ') FROM SurveyProducts sp2 JOIN Products p2 ON sp2.product_id = p2.id WHERE sp2.survey_id = s.id) as product_names
      FROM Surveys s
      JOIN SurveyRecipients r ON r.survey_id = s.id AND r.customer_id = ?
      WHERE s.id = ? AND s.status = 'ACTIVE'
    `).get(customer.id, req.params.id);
    if (!survey) return res.status(404).json({ error: 'Không tìm thấy khảo sát' });
    const questions = await db.prepare('SELECT * FROM Questions WHERE survey_id = ? ORDER BY order_index').all(req.params.id);
    questions.forEach(q => { if (q.options) try { q.options = JSON.parse(q.options); } catch { } });
    res.json({ survey, questions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customer/surveys/:id/submit', authMiddleware, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const customer = await db.prepare('SELECT id FROM Customers WHERE account_id = ?').get(req.user.id);
    if (!customer) return res.status(400).json({ error: 'Không tìm thấy hồ sơ khách hàng' });
    const recipient = await db.prepare('SELECT id FROM SurveyRecipients WHERE survey_id = ? AND customer_id = ?').get(req.params.id, customer.id);
    if (!recipient) return res.status(403).json({ error: 'Khảo sát này chưa được gửi đến tài khoản của bạn' });
    const alreadyDone = await db.prepare('SELECT id FROM SurveyResults WHERE survey_id = ? AND customer_id = ?').get(req.params.id, customer.id);
    if (alreadyDone) return res.status(409).json({ error: 'Bạn đã thực hiện khảo sát này rồi' });
    const resultRow = await db.prepare('INSERT INTO SurveyResults (survey_id, customer_id) VALUES (?, ?)').run(req.params.id, customer.id);
    const { answers } = req.body;
    if (answers && answers.length > 0) {
      for (const a of answers) {
        await db.prepare('INSERT INTO SurveyAnswers (survey_result_id, question_id, answer_value) VALUES (?, ?, ?)').run(resultRow.lastInsertRowid, a.question_id, Array.isArray(a.answer_value) ? JSON.stringify(a.answer_value) : a.answer_value);
      }
    }
    res.status(201).json({ message: 'Nộp khảo sát thành công! Cảm ơn bạn đã tham gia.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== CUSTOMER: Feedbacks ==========
app.get('/api/customer/feedbacks', authMiddleware, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const customer = await db.prepare('SELECT id FROM Customers WHERE account_id = ?').get(req.user.id);
    if (!customer) return res.json([]);
    const feedbacks = await db.prepare('SELECT f.*, p.name as product_name FROM Feedbacks f JOIN Products p ON f.product_id = p.id WHERE f.customer_id = ? ORDER BY f.created_at DESC').all(customer.id);
    res.json(feedbacks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customer/feedbacks', authMiddleware, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const customer = await db.prepare('SELECT id FROM Customers WHERE account_id = ?').get(req.user.id);
    if (!customer) return res.status(400).json({ error: 'Không tìm thấy hồ sơ khách hàng' });
    const { product_id, rating, content } = req.body;
    if (!product_id || !rating) return res.status(400).json({ error: 'Thiếu thông tin sản phẩm hoặc đánh giá' });
    
    // Kiểm tra khách hàng đã đánh giá sản phẩm này chưa (chỉ được 1 lần)
    const existing = await db.prepare('SELECT id FROM Feedbacks WHERE customer_id = ? AND product_id = ?').get(customer.id, product_id);
    if (existing) {
      return res.status(409).json({ error: 'Bạn đã đánh giá sản phẩm này rồi. Mỗi sản phẩm chỉ được gửi đánh giá 1 lần.' });
    }

    await db.prepare('INSERT INTO Feedbacks (customer_id, product_id, rating, content) VALUES (?, ?, ?, ?)').run(customer.id, product_id, rating, content || null);
    res.status(201).json({ message: 'Gửi đánh giá thành công! Cảm ơn bạn.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== SHARED: Products list for dropdowns ==========
app.get('/api/products', authMiddleware, async (req, res) => {
  try {
    const { launch_status } = req.query;
    let sql = 'SELECT id, name, category, price, launch_status FROM Products WHERE 1=1';
    const params = [];
    if (launch_status) { sql += ' AND launch_status = ?'; params.push(launch_status); }
    sql += ' ORDER BY name';
    const rows = await db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== SERVER START ==========
if (!process.env.VERCEL) {
  ensureDb().then(() => {
    app.listen(PORT, () => {
      console.log('');
      console.log('╔══════════════════════════════════════════════════════════╗');
      console.log('║   🌸  HỆ THỐNG CRM - QUẢN LÝ CỬA HÀNG MỸ PHẨM  🌸    ║');
      console.log('╠══════════════════════════════════════════════════════════╣');
      console.log(`║   🚀  Server đang chạy: http://localhost:${PORT}          ║`);
      console.log(`║   🗄️   Database: Microsoft SQL Server Local (${db.databaseName}) ║`);
      console.log('╠══════════════════════════════════════════════════════════╣');
      console.log('║   TÀI KHOẢN DEMO:                                       ║');
      console.log('║   👑  Admin:    admin / admin123                         ║');
      console.log('║   📊  Manager:  manager1 / manager123                   ║');
      console.log('║   🛍️  Customer:  khach001 / customer123                 ║');
      console.log('╚══════════════════════════════════════════════════════════╝');
      console.log('');
    });
  }).catch(err => {
    console.error('Khởi động server thất bại:', err);
    process.exit(1);
  });
}

module.exports = app;
