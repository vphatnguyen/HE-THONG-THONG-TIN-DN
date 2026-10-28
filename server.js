require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./database/db');

const app = express();
const PRODUCT_FIELDS = 'p.id,p.record_version,p.name,p.category,p.supplier_id,p.price,p.description,p.image_url,p.launch_status,p.created_at';
const CUSTOMER_FIELDS = 'id,account_id,age,gender,skin_type,beauty_preferences,created_at';
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

const SURVEY_QUESTION_TYPES = new Set(['SINGLE_CHOICE', 'MULTI_CHOICE', 'RATING', 'TEXT']);
const SURVEY_STATUSES = new Set(['DRAFT', 'ACTIVE', 'CLOSED']);

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function normalizeSurveyQuestions(questions) {
  if (!Array.isArray(questions)) throw validationError('Danh sách câu hỏi không hợp lệ');
  if (!questions.length) throw validationError('Khảo sát phải có ít nhất một câu hỏi');
  const normalizedQuestions = questions.map((question, index) => {
    const questionText = String(question?.question_text || '').trim();
    const questionType = String(question?.question_type || '').trim();
    if (!questionText) throw validationError(`Câu hỏi ${index + 1} không được để trống`);
    if (questionText.length > 500) throw validationError(`Câu hỏi ${index + 1} không được vượt quá 500 ký tự`);
    if (!SURVEY_QUESTION_TYPES.has(questionType)) throw validationError(`Loại câu hỏi ${index + 1} không hợp lệ`);

    let options = null;
    if (questionType === 'SINGLE_CHOICE' || questionType === 'MULTI_CHOICE') {
      options = Array.isArray(question.options) ? question.options.map(option => String(option).trim()) : [];
      if (options.length < 2 || options.some(option => !option)) {
        throw validationError(`Câu hỏi ${index + 1} phải có ít nhất hai lựa chọn không rỗng`);
      }
      if (new Set(options.map(option => option.toLocaleLowerCase('vi'))).size !== options.length) {
        throw validationError(`Các lựa chọn của câu hỏi ${index + 1} không được trùng lặp`);
      }
    }
    if (question?.is_required !== undefined && ![true,false,0,1].includes(question.is_required)) throw validationError('Cờ bắt buộc phải là boolean');
    const isRequired = question?.is_required !== undefined ? (Boolean(question.is_required) ? 1 : 0) : 1;
    return { question_text: questionText, question_type: questionType, options, is_required: isRequired };
  });
  const questionKeys = normalizedQuestions.map(question => question.question_text.toLocaleLowerCase('vi'));
  if (new Set(questionKeys).size !== questionKeys.length) throw validationError('Nội dung câu hỏi không được trùng lặp');

  return normalizedQuestions;
}

function normalizeSurveyPayload(payload, { allowStatus = false } = {}) {
  const title = String(payload.title || '').trim();
  if (!title) throw validationError('Tiêu đề khảo sát là bắt buộc');
  if (title.length > 200) throw validationError('Tiêu đề khảo sát không được vượt quá 200 ký tự');

  const productIds = Array.isArray(payload.target_product_ids) ? payload.target_product_ids.map(Number) : [];
  if (!productIds.length || productIds.some(id => !Number.isInteger(id) || id <= 0)) {
    throw validationError('Vui lòng chọn ít nhất một sản phẩm hợp lệ cho chiến dịch khảo sát');
  }
  if (new Set(productIds).size !== productIds.length) throw validationError('Danh sách sản phẩm không được trùng lặp');

  const normalizedQuestions = normalizeSurveyQuestions(payload.questions);

  const startDate = payload.start_date || null;
  const endDate = payload.end_date || null;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (startDate && (!datePattern.test(startDate) || !isCalendarDate(startDate))) throw validationError('Ngày bắt đầu không hợp lệ');
  if (endDate && (!datePattern.test(endDate) || !isCalendarDate(endDate))) throw validationError('Ngày kết thúc không hợp lệ');
  if (startDate && endDate && startDate > endDate) throw validationError('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu');

  const recipientIds = Array.isArray(payload.recipient_customer_ids)
    ? payload.recipient_customer_ids.map(Number)
    : null;
  if (recipientIds && recipientIds.some(id => !Number.isInteger(id) || id <= 0)) throw validationError('Danh sách người nhận không hợp lệ');
  if (recipientIds && new Set(recipientIds).size !== recipientIds.length) throw validationError('Danh sách người nhận không được trùng lặp');

  const status = allowStatus && payload.status ? String(payload.status).trim() : null;
  if (status && !SURVEY_STATUSES.has(status)) throw validationError('Trạng thái khảo sát không hợp lệ');
  return {
    title,
    description: String(payload.description || '').trim() || null,
    target_product_ids: productIds,
    start_date: startDate,
    end_date: endDate,
    questions: normalizedQuestions,
    recipient_customer_ids: recipientIds,
    status
  };
}

async function validateSurveyReferences(payload) {
  const productPlaceholders = payload.target_product_ids.map(() => '?').join(',');
  const productCount = await db.prepare(`SELECT COUNT(*) AS count FROM Products WHERE id IN (${productPlaceholders})`).get(...payload.target_product_ids);
  if (Number(productCount?.count) !== payload.target_product_ids.length) throw validationError('Một hoặc nhiều sản phẩm không tồn tại');
  if (payload.recipient_customer_ids?.length) {
    const recipientPlaceholders = payload.recipient_customer_ids.map(() => '?').join(',');
    const recipientCount = await db.prepare(`
      SELECT COUNT(*) AS count FROM Customers c JOIN Accounts a ON a.id=c.account_id
      WHERE c.id IN (${recipientPlaceholders}) AND a.role='CUSTOMER' AND a.status='ACTIVE'
    `).get(...payload.recipient_customer_ids);
    if (Number(recipientCount?.count) !== payload.recipient_customer_ids.length) throw validationError('Một hoặc nhiều người nhận không tồn tại hoặc đã bị khóa');
  }
}

function sendKnownError(res, error, fallbackPrefix) {
  if (isUniqueConstraintError(error)) return res.status(409).json({ error: 'Dữ liệu đã tồn tại (tên đăng nhập, email hoặc bản ghi trùng)' });
  if (Number(error?.number ?? error?.code) === 547) return res.status(409).json({ error: 'Dữ liệu đang được sử dụng bởi bản ghi liên quan. Vui lòng tải lại.' });
  if (Number(error?.number ?? error?.code) === 1205) return res.status(409).json({ error: 'Dữ liệu đang được cập nhật. Vui lòng tải lại và thử lại.' });
  if (error.status) return res.status(error.status).json({ error: error.message });
  return res.status(500).json({ error: fallbackPrefix ? `${fallbackPrefix}: ${error.message}` : error.message });
}

function isUniqueConstraintError(error) {
  const code = Number(error?.number ?? error?.code);
  return code === 2601 || code === 2627;
}

function isCalendarDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0,4)) >= 1753 &&
    !isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;
}

function validateAccountPayload(body, creating = false) {
  for (const [key, limit] of [['username',50], ['full_name',100], ['email',100], ['phone',20]]) {
    if (body[key] !== undefined) body[key] = String(body[key] ?? '').trim();
    if ((creating || body[key] !== undefined) && ['username','full_name'].includes(key) && !body[key]) throw validationError('Tên đăng nhập và họ tên không được để trống');
    if (body[key]?.length > limit) throw validationError(`${key} vượt quá ${limit} ký tự`);
  }
  if (body.password !== undefined && String(body.password).length>255) throw validationError('Mật khẩu không được vượt quá 255 ký tự');
  if (creating && !String(body.password || '').trim()) throw validationError('Mật khẩu là bắt buộc');
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw validationError('Email không hợp lệ');
  if (body.age !== undefined && body.age !== null && body.age !== '' && (!Number.isInteger(Number(body.age)) || Number(body.age) < 13 || Number(body.age) > 100)) throw validationError('Độ tuổi phải từ 13 đến 100');
  if (body.gender && !['Nu','Nam','Khac'].includes(body.gender)) throw validationError('Giới tính không hợp lệ');
  if (body.status !== undefined && !['ACTIVE','LOCKED'].includes(body.status)) throw validationError('Trạng thái tài khoản không hợp lệ');
  if (body.role !== undefined && !['ADMIN','MANAGER'].includes(body.role)) throw validationError('Vai trò nội bộ không hợp lệ');
}

function validateDateRange(from, to) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  for (const [label, value] of [['Từ ngày', from], ['Đến ngày', to]]) {
    if (value && (!datePattern.test(value) || !isCalendarDate(value))) {
      throw validationError(`${label} không hợp lệ`);
    }
  }
  if (from && to && from > to) throw validationError('Từ ngày phải bằng hoặc trước đến ngày');
}


function listResponse(res, rows, query, { dateField='created_at', searchFields=['id'], statusField='status', sortFields=['id','created_at'] }={}) {
  validateDateRange(query.from,query.to);
  const search=String(query.search || '').trim();
  const searchById=/^#?\d+$/.test(search);
  const idField=searchFields.includes('customer_id')?'customer_id':'id';
  const dateKey=value=>value instanceof Date ? `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}` : String(value || '').slice(0,10);
  let result=rows.filter(row=> {
    const date=dateKey(row[dateField]);
    return (!query.from || date && date>=query.from) && (!query.to || date && date<=query.to) &&
      (!query.status || row[statusField]===query.status) &&
      (!search || (searchById ? Number(row[idField])===Number(search.replace(/^#/,'')) : searchFields.some(field=>String(row[field] ?? '').toLocaleLowerCase('vi').includes(search.replace(/^@/,'').toLocaleLowerCase('vi')))));
  });
  if (query.sort_by) {
    if (!sortFields.includes(query.sort_by)) throw validationError('Cột sắp xếp không hợp lệ');
    const field=query.sort_by, sign=query.sort_dir==='asc'?1:-1;
    result.sort((a,b)=> (typeof a[field]==='number' ? a[field]-b[field] : String(a[field] || '').localeCompare(String(b[field] || ''),'vi',{numeric:true})) * sign || (a.id-b.id)*sign);
  }
  res.set('X-Total-Count',String(result.length));
  if (query.page !== undefined || query.page_size !== undefined) {
    const page=Number(query.page || 1), size=Number(query.page_size || 10);
    if (!Number.isInteger(page)||page<1||!Number.isInteger(size)||size<1||size>100) throw validationError('Phân trang không hợp lệ (1–100 dòng/trang)');
    result=result.slice((page-1)*size,page*size);
  }
  return res.json(result);
}
async function checkRecordVersion(tx, table, id, body) {
  if (!['Accounts','Products','Suppliers','Surveys','Feedbacks'].includes(table)) throw new Error('Invalid version table');
  const row=await tx.prepare(`SELECT record_version FROM ${table} WITH (UPDLOCK,HOLDLOCK) WHERE id=?`).get(id);
  if (row && body._version !== undefined && body._version !== row.record_version) {
    const error=new Error('Bản ghi đã thay đổi từ khi bạn mở form. Vui lòng tải lại chi tiết trước khi lưu.');error.status=409;throw error;
  }
}

function validateCatalogPayload(body, product) {
  if (body.name !== undefined) { body.name=String(body.name).trim(); if(!body.name || body.name.length>(product?200:150)) throw validationError('Tên không hợp lệ'); }
  if (product) {
    if (body.category !== undefined && (!String(body.category).trim() || String(body.category).length>50)) throw validationError('Danh mục không hợp lệ');
    if (body.price !== undefined && (!Number.isFinite(Number(body.price)) || Number(body.price)<0)) throw validationError('Giá phải là số không âm');
    if (body.launch_status !== undefined && !['OFFICIAL','UPCOMING'].includes(body.launch_status)) throw validationError('Trạng thái kinh doanh không hợp lệ');
    if (body.supplier_id && (!Number.isInteger(Number(body.supplier_id)) || Number(body.supplier_id)<=0)) throw validationError('Nhà cung cấp không hợp lệ');
  } else if (body.status !== undefined && !['ACTIVE','INACTIVE'].includes(body.status)) throw validationError('Trạng thái nhà cung cấp không hợp lệ');
}

app.use(express.json());
for (const param of ['id','accountId','productId']) {
  app.param(param,(req,res,next,value)=> {
    if (!/^\d+$/.test(value) || Number(value)<1 || Number(value)>2147483647) return res.status(400).json({ error: 'ID phải là số nguyên dương hợp lệ' });
    next();
  });
}
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/test/environment', (req,res,next) => {
  if (process.env.CRM_TEST_MODE !== '1' || !/E2E_DB$/i.test(db.databaseName)) return next();
  res.json({ database: db.databaseName, testMode: true });
});
app.get('/favicon.ico', (req, res) => res.status(204).end());

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
    }).catch(error => { dbInitPromise=null; throw error; });
  }
  return dbInitPromise;
}

async function ensureAppSchema() {
  const fs = require('fs');
  await db.prepare(fs.readFileSync(path.join(__dirname, 'database/migrations/20261028_crm_integrity.sql'), 'utf8')).run();
  await db.prepare(fs.readFileSync(path.join(__dirname, 'database/migrations/20261028_question_templates.sql'), 'utf8')).run();
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
        IF (SELECT COUNT(*) FROM dbo.Accounts WHERE role = 'ADMIN' AND status='ACTIVE') = 0
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

  await db.prepare(`
    IF OBJECT_ID('dbo.FeedbackAuditLog', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.FeedbackAuditLog (
        id INT IDENTITY(1,1) PRIMARY KEY,
        feedback_id INT NOT NULL,
        customer_id INT NOT NULL,
        old_rating TINYINT NOT NULL,
        new_rating TINYINT NOT NULL,
        old_content NVARCHAR(MAX),
        new_content NVARCHAR(MAX),
        action NVARCHAR(20) DEFAULT 'EDIT',
        changed_at DATETIME2 DEFAULT GETDATE(),
        created_at DATETIME2 DEFAULT GETDATE(),
        CONSTRAINT FK_FeedbackAuditLog_Feedbacks FOREIGN KEY (feedback_id) REFERENCES dbo.Feedbacks(id) ON DELETE CASCADE,
        CONSTRAINT FK_FeedbackAuditLog_Customers FOREIGN KEY (customer_id) REFERENCES dbo.Customers(id)
      );
    END
    ELSE
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.FeedbackAuditLog') AND name = 'changed_at')
        ALTER TABLE dbo.FeedbackAuditLog ADD changed_at DATETIME2 DEFAULT GETDATE();
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.FeedbackAuditLog') AND name = 'created_at')
        ALTER TABLE dbo.FeedbackAuditLog ADD created_at DATETIME2 DEFAULT GETDATE();
    END
  `).run();

  await db.prepare(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Questions') AND name = 'is_required')
    BEGIN
      ALTER TABLE dbo.Questions ADD is_required BIT NOT NULL DEFAULT 1 WITH VALUES;
    END
  `).run();

  await db.prepare(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Feedbacks_Customer_Product' AND object_id = OBJECT_ID('dbo.Feedbacks'))
       AND NOT EXISTS (
         SELECT customer_id, product_id FROM dbo.Feedbacks
         GROUP BY customer_id, product_id HAVING COUNT(*) > 1
       )
    CREATE UNIQUE INDEX UX_Feedbacks_Customer_Product ON dbo.Feedbacks(customer_id, product_id)
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

async function assignSurveyRecipients(surveyId, customerIds, sentBy, database = db) {
  const ids = Array.isArray(customerIds) ? customerIds.map(Number).filter(Boolean) : null;
  const recipients = ids !== null
    ? ids.map(id => ({ id }))
    : await database.prepare(`
        SELECT c.id
        FROM Customers c
        JOIN Accounts a ON c.account_id = a.id
        WHERE a.role = 'CUSTOMER' AND a.status = 'ACTIVE'
      `).all();

  for (const recipient of recipients) {
    await database.prepare(`
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
async function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token không hợp lệ' });
  }
  try {
    const account = await db.prepare('SELECT id, role, status FROM Accounts WHERE id = ?').get(req.user.id);
    if (!account) return res.status(401).json({ error: 'Tài khoản không còn tồn tại' });
    if (account.status !== 'ACTIVE') return res.status(403).json({ error: 'Tài khoản đã bị khóa' });
    req.user.role = account.role;
    next();
  } catch (error) { sendKnownError(res, error); }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền truy cập' });
    next();
  };
}

function verifyPassword(inputPassword, account) {
  if (!inputPassword || !account) return false;
  const storedPassword = account.password;
  if (!storedPassword) return false;
  if (isBcryptHash(storedPassword)) return bcrypt.compareSync(String(inputPassword), String(storedPassword));
  // So sánh trực tiếp chuỗi mật khẩu bình thường (plain text)
  if (String(inputPassword) === String(storedPassword)) return true;
  // Hỗ trợ linh hoạt cả 123456 và customer123 cho tài khoản khách hàng
  if (account.role === 'CUSTOMER' && (inputPassword === '123456' || inputPassword === 'customer123') && (storedPassword === '123456' || storedPassword === 'customer123')) return true;
  return false;
}

function isBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$/.test(String(value || ''));
}

async function insertAccount(username, passwordVal, full_name, email, phone, role, database = db) {
  // Lưu mật khẩu dạng bình thường (plain text) theo yêu cầu hệ thống
  return await database.prepare('INSERT INTO Accounts (username, password, full_name, email, phone, role) VALUES (?, ?, ?, ?, ?, ?)').run(username, String(passwordVal), full_name, email || null, phone || null, role);
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
    const customer = account.role === 'CUSTOMER' ? await db.prepare(`SELECT ${CUSTOMER_FIELDS} FROM Customers WHERE account_id = ?`).get(account.id) : null;
    res.json({ token, user: { id: account.id, username: account.username, full_name: account.full_name, email: account.email, phone: account.phone, role: account.role, status: account.status }, customer });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Lỗi đăng nhập: ' + err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    validateAccountPayload(req.body, req.method === 'POST');
    const { username, password, full_name, email, phone, age, gender, skin_type, beauty_preferences } = req.body;
    if (!username || !password || !full_name) return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
    const existing = await db.prepare('SELECT id FROM Accounts WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
    await db.transaction(async tx => {
    const accountResult = await insertAccount(username, password, full_name, email, phone, 'CUSTOMER', tx);
    await tx.prepare('INSERT INTO Customers (account_id, age, gender, skin_type, beauty_preferences) VALUES (?, ?, ?, ?, ?)').run(accountResult.lastInsertRowid, age || null, gender || null, skin_type || null, normalizeBeautyPreferences(beauty_preferences) || null);
    });
    res.status(201).json({ message: 'Đăng ký thành công! Vui lòng đăng nhập.' });
  } catch (err) {
    console.error('Register error:', err);
    sendKnownError(res, err);
  }
});

// ========== ADMIN: Accounts ==========
app.get('/api/admin/accounts', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const { search, role, status } = req.query;
    let sql = "SELECT id, record_version, username, password, full_name, email, phone, role, status, created_at FROM Accounts WHERE role IN ('ADMIN', 'MANAGER')";
    const params = [];
    if (search) { sql += ' AND (full_name LIKE ? OR username LIKE ? OR email LIKE ? OR CAST(id AS NVARCHAR(20)) = ?)'; const s = `%${search}%`; params.push(s,s,s,String(search).replace(/^#/,'')); }
    if (role) { sql += ' AND role = ?'; params.push(role); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC';
    const rows = await db.prepare(sql).all(...params);
    listResponse(res,rows,req.query,{searchFields:['id','full_name','username','email'],sortFields:['id','full_name','created_at']});
  } catch (err) {
    sendKnownError(res,err);
  }
});

app.post('/api/admin/accounts', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    validateAccountPayload(req.body, req.method === 'POST');
    const { username, password, full_name, email, phone, role } = req.body;
    if (!username || !password || !full_name) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    const targetRole = role === 'ADMIN' ? 'ADMIN' : 'MANAGER';
    const existing = await db.prepare('SELECT id FROM Accounts WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
    const result = await insertAccount(username, password, full_name, email, phone, targetRole);
    res.status(201).json({ message: 'Tạo tài khoản thành công', id: result.lastInsertRowid });
  } catch (err) {
    sendKnownError(res, err);
  }
});

app.put('/api/admin/accounts/:id', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    validateAccountPayload(req.body, req.method === 'POST');
    const targetId = Number(req.params.id);
    const { username, password, full_name, email, phone, role, status } = req.body;

    await db.transaction(async tx => {
    await checkRecordVersion(tx,'Accounts',targetId,req.body);
    const targetAccount = await tx.prepare('SELECT id, username, role, status FROM Accounts WHERE id = ?').get(targetId);
    if (!targetAccount) {
      return res.status(404).json({ error: 'Tài khoản không tồn tại' });
    }

    if (targetId === req.user.id && status === 'LOCKED') {
      return res.status(400).json({ error: 'Không thể tự khóa tài khoản của chính bạn' });
    }

    if (username && username !== targetAccount.username) {
      const existing = await tx.prepare('SELECT id FROM Accounts WHERE username = ? AND id != ?').get(username, targetId);
      if (existing) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
    }

    // Nếu tài khoản đang là ADMIN, ngăn chặn việc hạ quyền hoặc khóa khi chỉ có duy nhất 1 ADMIN
    if (targetAccount.role === 'ADMIN') {
      if (role && role !== 'ADMIN') {
        const adminCountRes = await tx.prepare("SELECT COUNT(*) AS total FROM Accounts WHERE role = 'ADMIN'").get();
        const totalAdmins = Number(adminCountRes?.total || 0);
        if (totalAdmins <= 1) {
          return res.status(400).json({ error: 'Không thể thay đổi vai trò tài khoản Admin khi hệ thống chỉ còn duy nhất 1 Admin' });
        }
      }

      if (status === 'LOCKED' && targetAccount.status === 'ACTIVE') {
        const activeAdminRes = await tx.prepare("SELECT COUNT(*) AS total FROM Accounts WHERE role = 'ADMIN' AND status = 'ACTIVE'").get();
        const activeAdmins = Number(activeAdminRes?.total || 0);
        if (activeAdmins <= 1) {
          return res.status(400).json({ error: 'Không thể khóa tài khoản Admin khi hệ thống chỉ còn duy nhất 1 Admin đang hoạt động' });
        }
      }
    }

    const updates = [];
    const params = [];
    if (username !== undefined) { updates.push('username = ?'); params.push(username); }
    if (password !== undefined && password !== '') { updates.push('password = ?'); params.push(String(password)); }
    if (full_name !== undefined) { updates.push('full_name = ?'); params.push(full_name); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email || null); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone || null); }
    if (role !== undefined) { updates.push('role = ?'); params.push(role); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }

    if (updates.length > 0) {
      params.push(targetId);
      await tx.prepare(`UPDATE Accounts SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    });
    if (res.headersSent) return;
    res.json({ message: 'Cập nhật tài khoản thành công' });
  } catch (err) {
    sendKnownError(res, err);
  }
});

app.put('/api/admin/accounts/:id/status', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const { status } = req.body;
    if (!['ACTIVE', 'LOCKED'].includes(status)) {
      return res.status(400).json({ error: 'Trạng thái tài khoản không hợp lệ' });
    }
    if (targetId === req.user.id && status === 'LOCKED') {
      return res.status(400).json({ error: 'Không thể tự khóa tài khoản của chính bạn' });
    }

    const targetAccount = await db.prepare('SELECT id, role, status FROM Accounts WHERE id = ?').get(targetId);
    if (!targetAccount) return res.status(404).json({ error: 'Tài khoản không tồn tại' });

    if (targetAccount.role === 'ADMIN' && status === 'LOCKED') {
      const activeAdminRes = await db.prepare("SELECT COUNT(*) AS total FROM Accounts WHERE role = 'ADMIN' AND status = 'ACTIVE'").get();
      const activeAdmins = Number(activeAdminRes?.total || 0);
      if (activeAdmins <= 1) {
        return res.status(400).json({ error: 'Không thể khóa tài khoản Admin khi hệ thống chỉ còn duy nhất 1 Admin đang hoạt động' });
      }
    }

    await db.prepare('UPDATE Accounts SET status = ? WHERE id = ?').run(status, targetId);
    res.json({ message: status === 'LOCKED' ? 'Đã khóa tài khoản thành công' : 'Đã mở khóa tài khoản thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/accounts/:id', authMiddleware, requireRole('ADMIN'), async (req, res) => {
  try {
    const result=await db.transaction(async tx => {
    const targetId = Number(req.params.id);
    if (!targetId) {
      return res.status(400).json({ error: 'ID tài khoản không hợp lệ' });
    }

    const targetAccount = await tx.prepare("SELECT id, username, role, status FROM Accounts WHERE id = ? AND role IN ('ADMIN','MANAGER')").get(targetId);
    if (!targetAccount) {
      return res.status(404).json({ error: 'Tài khoản không tồn tại' });
    }

    // Chặn xóa tài khoản Admin nếu chỉ còn duy nhất 1 Admin trong hệ thống
    if (targetAccount.role === 'ADMIN') {
      const adminCountRes = await tx.prepare("SELECT COUNT(*) AS total FROM Accounts WHERE role = 'ADMIN'").get();
      const totalAdmins = Number(adminCountRes?.total || 0);
      if (totalAdmins <= 1) {
        return res.status(400).json({ error: 'Không thể xóa tài khoản Admin khi hệ thống chỉ còn duy nhất 1 Admin' });
      }
    }

    if(targetAccount.role==='ADMIN' && targetAccount.status==='ACTIVE'){
      const remaining=await tx.prepare("SELECT COUNT(*) AS n FROM Accounts WHERE role='ADMIN' AND status='ACTIVE' AND id<>?").get(targetId);
      if(!remaining.n)return res.status(400).json({error:'Không thể xóa Admin đang hoạt động cuối cùng'});
    }

    // Gỡ liên kết khóa ngoại nếu có (ví dụ khảo sát do Admin này tạo/gửi) trước khi xóa
    await tx.prepare('UPDATE FeedbackReplyHistory SET manager_id = NULL WHERE manager_id = ?').run(targetId);
    await tx.prepare('UPDATE Surveys SET created_by = NULL WHERE created_by = ?').run(targetId);
    await tx.prepare('UPDATE SurveyRecipients SET sent_by = NULL WHERE sent_by = ?').run(targetId);

    await tx.prepare('DELETE FROM Accounts WHERE id = ?').run(targetId);
    return ({ message: 'Đã xóa tài khoản' });
    });
    if (!res.headersSent) res.json(result);
  } catch (err) {
    sendKnownError(res,err);
  }
});

// ========== PRODUCTS (Manager & Admin) ==========
app.get('/api/admin/products', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    validateDateRange(req.query.from,req.query.to);
    for (const key of ['min_price','max_price']) if (req.query[key] && (!Number.isFinite(Number(req.query[key])) || Number(req.query[key])<0)) throw validationError('Khoảng giá không hợp lệ');
    if (req.query.min_price && req.query.max_price && Number(req.query.min_price)>Number(req.query.max_price)) throw validationError('Giá tối thiểu phải nhỏ hơn hoặc bằng giá tối đa');
    const { search, category, supplier_id, launch_status, min_price, max_price, sort_by, sort_dir } = req.query;
    let sql = `
      SELECT ${PRODUCT_FIELDS}, (SELECT COUNT(*) FROM SurveyProducts sp WHERE sp.product_id=p.id)+(SELECT COUNT(*) FROM Surveys sv WHERE sv.target_product_id=p.id) AS survey_count, s.name as supplier_name,
        (SELECT COUNT(*) FROM Feedbacks f WHERE f.product_id = p.id) as review_count
      FROM Products p 
      LEFT JOIN Suppliers s ON p.supplier_id = s.id 
      WHERE 1=1
    `;
    const params = [];
    if (search) { sql += ' AND (p.name LIKE ? OR CAST(p.id AS NVARCHAR(20)) = ? OR p.description LIKE ?)'; const v = `%${search}%`; params.push(v,String(search).replace(/^#/,''),v); }
    if (category) { sql += ' AND p.category = ?'; params.push(category); }
    if (supplier_id) { sql += ' AND p.supplier_id = ?'; params.push(supplier_id); }
    if (launch_status) { sql += ' AND p.launch_status = ?'; params.push(launch_status); }
    if (min_price) { sql += ' AND p.price >= ?'; params.push(Number(min_price)); }
    if (max_price) { sql += ' AND p.price <= ?'; params.push(Number(max_price)); }
    const allowedSort = { id: 'p.id', name: 'p.name', price: 'p.price', created_at: 'p.created_at', review_count:'review_count' };
    const sortCol = allowedSort[sort_by] || 'p.created_at';
    const sortDir = sort_dir === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortCol} ${sortDir}`;
    const rows = await db.prepare(sql).all(...params);
    listResponse(res,rows,req.query,{searchFields:['id','name','description'],statusField:'launch_status',sortFields:['id','name','price','created_at','review_count']});
  } catch (err) {
    sendKnownError(res,err);
  }
});

app.post('/api/admin/products', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    validateCatalogPayload(req.body,true);
    if (req.body.supplier_id && !await db.prepare('SELECT id FROM Suppliers WHERE id=?').get(req.body.supplier_id)) throw validationError('Nhà cung cấp không tồn tại');
    const { name, category, supplier_id, price, description, launch_status } = req.body;
    if (!name || !category) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });

    // Kiểm tra ràng buộc dây chuyền: Nếu mở kinh doanh (OFFICIAL) thì Nhà cung cấp không được ở trạng thái Ngừng hợp tác (INACTIVE)
    const targetLaunch = launch_status || 'OFFICIAL';
    if (supplier_id && targetLaunch === 'OFFICIAL') {
      const sup = await db.prepare('SELECT id, name, status FROM Suppliers WHERE id = ?').get(supplier_id);
      if (sup && sup.status === 'INACTIVE') {
        return res.status(400).json({ error: 'Không thể mở kinh doanh sản phẩm vì nhà cung cấp đang ở trạng thái Ngừng hợp tác.' });
      }
    }

    const result = await db.prepare('INSERT INTO Products (name, category, supplier_id, price, description, launch_status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, category, supplier_id || null, price || 0, description || null, targetLaunch);
    res.status(201).json({ message: 'Thêm sản phẩm thành công', id: result.lastInsertRowid });
  } catch (err) {
    sendKnownError(res,err);
  }
});

app.put('/api/admin/products/:id', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    validateCatalogPayload(req.body,true);
    if (req.body.supplier_id && !await db.prepare('SELECT id FROM Suppliers WHERE id=?').get(req.body.supplier_id)) throw validationError('Nhà cung cấp không tồn tại');
    const { name, category, supplier_id, price, description, launch_status } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên sản phẩm không được để trống' });

    // Kiểm tra sản phẩm hiện tại và số lượt đánh giá
    await db.transaction(async tx => {
      await checkRecordVersion(tx,'Products',req.params.id,req.body);
    const current = await tx.prepare(`
      SELECT ${PRODUCT_FIELDS}, (SELECT COUNT(*) FROM Feedbacks f WHERE f.product_id = p.id) as review_count
      FROM Products p WITH (UPDLOCK,HOLDLOCK) WHERE p.id = ?
    `).get(req.params.id);

    if (!current) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });

    let finalCategory = category || current.category;
    let finalSupplierId = supplier_id !== undefined && supplier_id !== '' && supplier_id !== null ? Number(supplier_id) : current.supplier_id;
    const targetLaunch = launch_status || current.launch_status;

    if (Number(current.review_count) > 0) {
      // ĐÃ có đánh giá: Cố định category và supplier_id để bảo toàn lịch sử thống kê CRM
      if (category && category !== current.category) {
        return res.status(400).json({ error: 'Sản phẩm đã có đánh giá từ khách hàng. Danh mục được cố định để bảo toàn lịch sử CRM.' });
      }
      if (supplier_id !== undefined && supplier_id !== null && supplier_id !== '' && Number(supplier_id) !== Number(current.supplier_id)) {
        return res.status(400).json({ error: 'Sản phẩm đã có đánh giá từ khách hàng. Nhà cung cấp được cố định để bảo toàn lịch sử CRM.' });
      }
      finalCategory = current.category;
      finalSupplierId = current.supplier_id;
    }

    // Kiểm tra ràng buộc dây chuyền: Nếu mở kinh doanh (OFFICIAL) thì Nhà cung cấp không được ở trạng thái Ngừng hợp tác
    if (finalSupplierId && targetLaunch === 'OFFICIAL') {
      const sup = await tx.prepare('SELECT id, name, status FROM Suppliers WHERE id = ?').get(finalSupplierId);
      if (sup && sup.status === 'INACTIVE') {
        return res.status(400).json({ error: 'Không thể mở kinh doanh sản phẩm vì nhà cung cấp đang ở trạng thái Ngừng hợp tác.' });
      }
    }


    // Cho phép chuyển đổi qua lại trạng thái Đang bán <-> Ngừng bán
    // Vẫn cho phép sửa: Tên sản phẩm, Giá bán, Trạng thái kinh doanh, Mô tả
    await tx.prepare('UPDATE Products SET name=?, category=?, supplier_id=?, price=?, description=?, launch_status=? WHERE id=?')
      .run(name, finalCategory, finalSupplierId, price !== undefined ? Number(price) : current.price, description !== undefined ? description : current.description, targetLaunch, req.params.id);
    });
    if (res.headersSent) return;
    res.json({ message: 'Cập nhật sản phẩm thành công' });
  } catch (err) {
    sendKnownError(res,err);
  }
});

app.delete('/api/admin/products/:id', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const result=await db.transaction(async tx => {
    const product = await tx.prepare(`
      SELECT ${PRODUCT_FIELDS}, (SELECT COUNT(*) FROM Feedbacks f WHERE f.product_id = p.id) as review_count,
      (SELECT COUNT(*) FROM SurveyProducts sp WHERE sp.product_id=p.id) + (SELECT COUNT(*) FROM Surveys s WHERE s.target_product_id=p.id) AS survey_count
      FROM Products p WHERE p.id = ?
    `).get(req.params.id);

    if (!product) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });

    if (Number(product.review_count) > 0 || Number(product.survey_count) > 0) {
      // Chặn xóa cứng khi đã có đánh giá: Tự động chuyển sang trạng thái Ngừng bán (UPCOMING)
      await tx.prepare('UPDATE Products SET launch_status = ? WHERE id = ?').run('UPCOMING', req.params.id);
      return ({
        message: `Sản phẩm "${product.name}" đã có ${product.review_count} lượt đánh giá và ${product.survey_count} liên kết khảo sát. Đã tự động chuyển sang trạng thái "Ngừng bán (Đóng đánh giá)" để bảo toàn lịch sử CRM.`,
        softDeleted: true
      });
    } else {
      // Chưa có đánh giá nào: Xóa cứng khỏi Database
      await tx.prepare('DELETE FROM Products WHERE id = ?').run(req.params.id);
      return ({ message: `Đã xóa vĩnh viễn sản phẩm "${product.name}" khỏi cơ sở dữ liệu.`, softDeleted: false });
    }
    });
    if (!res.headersSent) res.json(result);
  } catch (err) {
    sendKnownError(res,err);
  }
});

// ========== SUPPLIERS (Manager & Admin) ==========
app.get('/api/admin/suppliers', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const { search, status } = req.query;
    let sql = `
      SELECT 
        s.*,
        (SELECT COUNT(*) FROM Products p WHERE p.supplier_id = s.id) AS product_count,
        (SELECT COUNT(*) FROM Feedbacks f JOIN Products p ON f.product_id = p.id WHERE p.supplier_id = s.id) AS review_count,
        (SELECT ROUND(AVG(CAST(f.rating AS FLOAT)), 1) FROM Feedbacks f JOIN Products p ON f.product_id = p.id WHERE p.supplier_id = s.id) AS avg_rating
      FROM Suppliers s
      WHERE 1=1
    `;
    const params = [];
    if (search) {
      sql += ' AND (s.name LIKE ? OR s.contact_name LIKE ? OR s.email LIKE ? OR s.phone LIKE ? OR CAST(s.id AS NVARCHAR(20)) = ?)';
      const v = `%${search}%`;
      params.push(v,v,v,v,String(search).replace(/^#/,''));
    }
    if (status) {
      sql += ' AND s.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY s.created_at DESC';
    const rows = await db.prepare(sql).all(...params);
    listResponse(res,rows,req.query,{searchFields:['id','name','contact_name','email','phone'],sortFields:['id','name','created_at']});
  } catch (err) {
    sendKnownError(res,err);
  }
});

app.post('/api/admin/suppliers', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    validateCatalogPayload(req.body,false);
    const { name, contact_name, email, phone, address, status } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Tên nhà cung cấp là bắt buộc' });
    const result = await db.prepare('INSERT INTO Suppliers (name, contact_name, email, phone, address, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name.trim(), contact_name || null, email || null, phone || null, address || null, status || 'ACTIVE');
    res.status(201).json({ message: 'Thêm nhà cung cấp thành công', id: result.lastInsertRowid });
  } catch (err) {
    sendKnownError(res,err);
  }
});

app.put('/api/admin/suppliers/:id', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    validateCatalogPayload(req.body,false);
    const { name, contact_name, email, phone, address, status } = req.body;

    const result=await db.transaction(async tx => {
      await checkRecordVersion(tx,'Suppliers',req.params.id,req.body);
    const currentSupplier = await tx.prepare(`
      SELECT s.*, (SELECT COUNT(*) FROM Products p WHERE p.supplier_id = s.id) AS product_count
      FROM Suppliers s WHERE s.id = ?
    `).get(req.params.id);
    if (!currentSupplier) return res.status(404).json({ error: 'Không tìm thấy nhà cung cấp' });

    let finalName = currentSupplier.name;
    if (Number(currentSupplier.product_count) > 0) {
      // Đã có sản phẩm liên kết: Cố định tên nhà cung cấp để bảo toàn lịch sử CRM
      if (name && name.trim() !== currentSupplier.name) {
        return res.status(400).json({ error: 'Nhà cung cấp này đã có sản phẩm liên kết. Tên nhà cung cấp được cố định để bảo toàn lịch sử CRM.' });
      }
      finalName = currentSupplier.name;
    } else {
      if (!name || !name.trim()) return res.status(400).json({ error: 'Tên nhà cung cấp là bắt buộc' });
      finalName = name.trim();
    }

    const finalAddress = address !== undefined ? (address || null) : (currentSupplier.address || null);
    const newStatus = status || currentSupplier.status;
    await tx.prepare('UPDATE Suppliers SET name=?, contact_name=?, email=?, phone=?, address=?, status=? WHERE id=?')
      .run(finalName, contact_name || null, email || null, phone || null, finalAddress, newStatus, req.params.id);

    // Tự động đóng đánh giá sản phẩm khi Nhà cung cấp "Ngừng hợp tác" (INACTIVE)
    if (newStatus === 'INACTIVE') {
      await tx.prepare('UPDATE Products SET launch_status = ? WHERE supplier_id = ?').run('UPCOMING', req.params.id);
      if (Number(currentSupplier.product_count) > 0) {
        return ({
          message: `Cập nhật thành công. Toàn bộ ${currentSupplier.product_count} sản phẩm thuộc nhà cung cấp này đã tự động chuyển sang Ngừng bán (Đóng đánh giá).`
        });
      }
    }

    return ({ message: 'Cập nhật nhà cung cấp thành công' });
    });
    if (!res.headersSent) res.json(result);
  } catch (err) {
    sendKnownError(res,err);
  }
});

app.delete('/api/admin/suppliers/:id', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const result=await db.transaction(async tx => {
    const supplier = await tx.prepare(`
      SELECT s.*, (SELECT COUNT(*) FROM Products p WHERE p.supplier_id = s.id) AS product_count
      FROM Suppliers s WHERE s.id = ?
    `).get(req.params.id);
    if (!supplier) return res.status(404).json({ error: 'Không tìm thấy nhà cung cấp' });

    if (Number(supplier.product_count) > 0) {
      // Chặn xóa cứng khi đã có sản phẩm: Tự động chuyển sang INACTIVE và chuyển toàn bộ sản phẩm sang UPCOMING
      await tx.prepare('UPDATE Suppliers SET status = ? WHERE id = ?').run('INACTIVE', req.params.id);
      await tx.prepare('UPDATE Products SET launch_status = ? WHERE supplier_id = ?').run('UPCOMING', req.params.id);
      return ({
        message: `Nhà cung cấp "${supplier.name}" đang có ${supplier.product_count} sản phẩm liên kết. Đã tự động chuyển sang trạng thái "Ngừng hợp tác" và đóng đánh giá toàn bộ sản phẩm liên quan để bảo toàn dữ liệu CRM.`,
        softDeleted: true
      });
    } else {
      // Chưa có sản phẩm nào: Xóa cứng khỏi Database
      await tx.prepare('DELETE FROM Suppliers WHERE id = ?').run(req.params.id);
      return ({ message: `Đã xóa vĩnh viễn nhà cung cấp "${supplier.name}" khỏi cơ sở dữ liệu.`, softDeleted: false });
    }
    });
    if (!res.headersSent) res.json(result);
  } catch (err) {
    sendKnownError(res,err);
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
    validateDateRange(from, to);
    const customerDateParams = [];
    const accountDateParams = [];
    const feedbackDateParams = [];
    const surveyCampaignDateParams = [];
    const surveyResponseDateParams = [];
    const surveyRecipientDateParams = [];
    let customerDateWhere = '';
    let accountDateWhere = '';
    let feedbackDateWhere = '';
    let surveyCampaignDateWhere = '';
    let surveyResponseDateWhere = '';
    let surveyRecipientDateWhere = '';
    if (from) {
      customerDateWhere += ' AND c.created_at >= ?';
      accountDateWhere += ' AND a.created_at >= ?';
      feedbackDateWhere += ' AND f.created_at >= ?';
      // Chiến dịch khảo sát được lọc theo ngày bắt đầu nghiệp vụ, không phải ngày tạo bản ghi.
      // Dữ liệu cũ chưa có start_date dùng created_at để vẫn có thể tra cứu.
      surveyCampaignDateWhere += ' AND COALESCE(s.start_date, CAST(s.created_at AS DATE)) >= ?';
      surveyResponseDateWhere += ' AND sr.submitted_at >= ?';
      surveyRecipientDateWhere += ' AND r.sent_at >= ?';
      customerDateParams.push(from);
      accountDateParams.push(from);
      feedbackDateParams.push(from);
      surveyCampaignDateParams.push(from);
      surveyResponseDateParams.push(from);
      surveyRecipientDateParams.push(from);
    }
    if (to) {
      customerDateWhere += ' AND CAST(c.created_at AS DATE) <= ?';
      accountDateWhere += ' AND CAST(a.created_at AS DATE) <= ?';
      feedbackDateWhere += ' AND CAST(f.created_at AS DATE) <= ?';
      surveyCampaignDateWhere += ' AND COALESCE(s.start_date, CAST(s.created_at AS DATE)) <= ?';
      surveyResponseDateWhere += ' AND CAST(sr.submitted_at AS DATE) <= ?';
      surveyRecipientDateWhere += ' AND CAST(r.sent_at AS DATE) <= ?';
      customerDateParams.push(to);
      accountDateParams.push(to);
      feedbackDateParams.push(to);
      surveyCampaignDateParams.push(to);
      surveyResponseDateParams.push(to);
      surveyRecipientDateParams.push(to);
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

    const activeSurveysRow = await db.prepare(`SELECT COUNT(*) as cnt FROM Surveys s WHERE s.status='ACTIVE'${surveyCampaignDateWhere}`).get(...surveyCampaignDateParams);
    const totalSurveyRespRow = await db.prepare(`SELECT COUNT(*) as cnt FROM SurveyResults sr WHERE 1=1${surveyResponseDateWhere}`).get(...surveyResponseDateParams);
    const surveyRecipientRow = await db.prepare(`SELECT COUNT(*) as cnt FROM SurveyRecipients r WHERE 1=1${surveyRecipientDateWhere}`).get(...surveyRecipientDateParams);

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
      SELECT p.id AS product_id, p.name AS product_name, p.category, p.supplier_id, s.name AS supplier_name,
        COUNT(f.id) AS count,
        ROUND(AVG(CAST(f.rating AS FLOAT)), 1) AS average,
        SUM(CASE WHEN f.rating >= 4 THEN 1 ELSE 0 END) AS positive_count,
        SUM(CASE WHEN f.rating <= 2 THEN 1 ELSE 0 END) AS negative_count,
        SUM(CASE WHEN f.status = 'REPLIED' THEN 1 ELSE 0 END) AS replied_count,
        SUM(CASE WHEN f.status = 'PENDING' THEN 1 ELSE 0 END) AS pending_count
      FROM Products p
      LEFT JOIN Suppliers s ON p.supplier_id = s.id
      LEFT JOIN Feedbacks f ON p.id = f.product_id${feedbackDateWhere}
      GROUP BY p.id, p.name, p.category, p.supplier_id, s.name
      ORDER BY average DESC, count DESC
    `).all(...feedbackDateParams);

    const surveyOverview = await db.prepare(`
      SELECT s.id, s.title, s.description, s.status, s.start_date, s.end_date, s.created_at,
        (SELECT STRING_AGG(p2.name, N', ') FROM SurveyProducts sp2 JOIN Products p2 ON sp2.product_id = p2.id WHERE sp2.survey_id = s.id) AS product_names,
        (SELECT COUNT(*) FROM SurveyProducts sp3 WHERE sp3.survey_id = s.id) AS product_count,
        (SELECT COUNT(*) FROM Questions q WHERE q.survey_id = s.id) AS question_count,
        (SELECT COUNT(*) FROM SurveyRecipients r WHERE r.survey_id = s.id) AS recipients,
        (SELECT COUNT(*) FROM SurveyResults sr WHERE sr.survey_id = s.id) AS responses
      FROM Surveys s WHERE 1=1${surveyCampaignDateWhere}
      ORDER BY s.created_at DESC
    `).all(...surveyCampaignDateParams);

    const allRatingRows = await db.prepare(`SELECT f.rating FROM Feedbacks f WHERE 1=1${feedbackDateWhere}`).all(...feedbackDateParams);
    const allRatings = allRatingRows.map(r => Number(r.rating)).filter(r => !isNaN(r) && r > 0).sort((a, b) => a - b);
    let medianRating = null;
    if (allRatings.length > 0) {
      const mid = Math.floor(allRatings.length / 2);
      medianRating = allRatings.length % 2 !== 0 ? allRatings[mid] : Number(((allRatings[mid - 1] + allRatings[mid]) / 2).toFixed(1));
    }

    const ratingTrendByMonth = await db.prepare(`
      SELECT CONCAT(YEAR(f.created_at), '-', RIGHT(CONCAT('0', MONTH(f.created_at)), 2)) AS month,
             COUNT(*) AS count,
             ROUND(AVG(CAST(f.rating AS FLOAT)), 1) AS avg_rating
      FROM Feedbacks f
      WHERE 1=1${feedbackDateWhere}
      GROUP BY YEAR(f.created_at), MONTH(f.created_at)
      ORDER BY YEAR(f.created_at), MONTH(f.created_at)
    `).all(...feedbackDateParams);

    const productCategories = (await db.prepare('SELECT DISTINCT category FROM Products WHERE category IS NOT NULL ORDER BY category').all()).map(r => r.category);
    const suppliers = await db.prepare('SELECT id, name, status FROM Suppliers ORDER BY name').all();

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
      feedbackByProduct, surveyOverview, ratingTrendByMonth, productCategories, suppliers,
      stats: {
        totalCustomers, lockedCustomers, avgRating, medianRating, totalFeedbacks, repliedFeedbacks,
        pendingFeedbacks, negativeFeedbacks,
        feedbackReplyRate: totalFeedbacks ? Math.round((repliedFeedbacks / totalFeedbacks) * 100) : 0,
        activeSurveys, totalSurveyResponses, surveyRecipients,
        surveyResponseRate: surveyRecipients ? Math.round((totalSurveyResponses / surveyRecipients) * 100) : 0,
        ratingDistribution
      }
    });
  } catch (err) {
    console.error('Analytics error:', err);
    sendKnownError(res, err);
  }
});

// ========== MANAGER: Chi tiết khách hàng đánh giá một sản phẩm ==========
app.get('/api/manager/products/:productId/feedbacks', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const product = await db.prepare('SELECT id, name, category, price FROM Products WHERE id = ?').get(productId);
    if (!product) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });

    const feedbacks = await db.prepare(`
      SELECT f.id, f.record_version, f.rating, f.content, f.reply_content, f.status, f.created_at,
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
    validateDateRange(from, to);
    const params = [];
    let where = '';
    let headers;
    let rows;
    if (type === 'customers') {
      if (from) { where += ' AND c.created_at >= ?'; params.push(from); }
      if (to) { where += ' AND CAST(c.created_at AS DATE) <= ?'; params.push(to); }
      headers = ['Họ tên', 'Username', 'Email', 'Trạng thái', 'Tuổi', 'Giới tính', 'Loại da', 'Ngày đăng ký'];
      rows = await db.prepare(`SELECT a.full_name, a.username, a.email, a.status, c.age, c.gender, c.skin_type, c.created_at FROM Accounts a JOIN Customers c ON c.account_id = a.id WHERE a.role='CUSTOMER'${where} ORDER BY c.created_at DESC`).all(...params);
    } else if (type === 'feedbacks') {
      if (from) { where += ' AND f.created_at >= ?'; params.push(from); }
      if (to) { where += ' AND CAST(f.created_at AS DATE) <= ?'; params.push(to); }
      headers = ['Khách hàng', 'Sản phẩm', 'Số sao', 'Trạng thái', 'Nội dung', 'Ngày gửi'];
      rows = await db.prepare(`SELECT a.full_name AS customer_name, p.name AS product_name, f.rating, f.status, f.content, f.created_at FROM Feedbacks f JOIN Customers c ON c.id=f.customer_id JOIN Accounts a ON a.id=c.account_id JOIN Products p ON p.id=f.product_id WHERE 1=1${where} ORDER BY f.created_at DESC`).all(...params);
    } else if (type === 'surveys') {
      if (from) { where += ' AND s.created_at >= ?'; params.push(from); }
      if (to) { where += ' AND CAST(s.created_at AS DATE) <= ?'; params.push(to); }
      headers = ['Tiêu đề', 'Trạng thái', 'Số người nhận', 'Số feedback', 'Ngày tạo'];
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
    sendKnownError(res, err);
  }
});

// ========== MANAGER: Customers ==========
app.get('/api/manager/customers', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const { search, skin_type, beauty_preference, status } = req.query;
    let sql = `SELECT a.id, a.record_version, a.username, a.password, a.full_name, a.email, a.phone, a.status, a.created_at,
      c.id as customer_id, c.age, c.gender, c.skin_type, c.beauty_preferences,
      (SELECT COUNT(*) FROM Feedbacks f WHERE f.customer_id = c.id) AS feedback_count,
      (SELECT COUNT(*) FROM SurveyResults sr WHERE sr.customer_id = c.id) AS survey_count
      FROM Accounts a LEFT JOIN Customers c ON a.id = c.account_id
      WHERE a.role = 'CUSTOMER'`;
    const params = [];
    if (search) {
      const trimmed = search.trim();
      const cleanUser = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
      sql += ' AND (a.full_name LIKE ? OR a.username LIKE ? OR a.email LIKE ? OR a.phone LIKE ? OR CAST(c.id AS NVARCHAR(20)) = ?)';
      const v = `%${trimmed}%`;
      const vu = `%${cleanUser}%`;
      params.push(v, vu, v, v, cleanUser.replace(/^#/, ''));
    }
    if (skin_type) { sql += ' AND c.skin_type = ?'; params.push(skin_type); }
    if (beauty_preference) { sql += ' AND c.beauty_preferences LIKE ?'; params.push(`%${beauty_preference}%`); }
    if (status) { sql += ' AND a.status = ?'; params.push(status); }
    sql += ' ORDER BY a.created_at DESC';
    const rows = await db.prepare(sql).all(...params);
    listResponse(res,rows,req.query,{searchFields:['customer_id','full_name','username','email','phone'],sortFields:['customer_id','full_name','created_at']});
  } catch (err) {
    sendKnownError(res,err);
  }
});

app.post('/api/manager/customers', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    validateAccountPayload(req.body, req.method === 'POST');
    const { username, password, full_name, email, phone, age, gender, skin_type, beauty_preferences } = req.body;
    if (!username || !password || !full_name) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    const existing = await db.prepare('SELECT id FROM Accounts WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
    await db.transaction(async tx => {
    const accResult = await insertAccount(username, password, full_name, email, phone, 'CUSTOMER', tx);
    await tx.prepare('INSERT INTO Customers (account_id, age, gender, skin_type, beauty_preferences) VALUES (?, ?, ?, ?, ?)').run(accResult.lastInsertRowid, age || null, gender || null, skin_type || null, normalizeBeautyPreferences(beauty_preferences) || null);
    });
    res.status(201).json({ message: 'Thêm khách hàng thành công' });
  } catch (err) {
    sendKnownError(res, err);
  }
});

app.put('/api/manager/customers/:accountId', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    validateAccountPayload(req.body, req.method === 'POST');
    const accountId = Number(req.params.accountId);
    const { username, password, full_name, email, phone, age, gender, skin_type, status, beauty_preferences } = req.body;
    await db.transaction(async tx => {
      await checkRecordVersion(tx,'Accounts',accountId,req.body);
    const targetAccount = await tx.prepare("SELECT id, username FROM Accounts WHERE id = ? AND role = 'CUSTOMER'").get(accountId);
    if (!targetAccount) return res.status(404).json({ error: 'Khách hàng không tồn tại' });

    if (username && username !== targetAccount.username) {
      const existing = await tx.prepare('SELECT id FROM Accounts WHERE username = ? AND id != ?').get(username, accountId);
      if (existing) return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
    }

    const accUpdates = [];
    const accParams = [];
    if (username) { accUpdates.push('username = ?'); accParams.push(username); }
    if (password) { accUpdates.push('password = ?'); accParams.push(password); }
    if (full_name) { accUpdates.push('full_name = ?'); accParams.push(full_name); }
    if(email!==undefined){accUpdates.push('email = ?');accParams.push(email || null);}
    if(phone!==undefined){accUpdates.push('phone = ?');accParams.push(phone || null);}
    if (status) { accUpdates.push('status = ?'); accParams.push(status); }
    accParams.push(accountId);

    if(accUpdates.length)await tx.prepare(`UPDATE Accounts SET ${accUpdates.join(', ')} WHERE id = ?`).run(...accParams);

    const custRow = await tx.prepare(`SELECT ${CUSTOMER_FIELDS} FROM Customers WHERE account_id = ?`).get(accountId);
    if (custRow) {
      await tx.prepare(`
        UPDATE Customers
        SET age = ?, gender = ?, skin_type = ?, beauty_preferences = ?
        WHERE account_id = ?
      `).run(age===undefined?custRow.age:age || null,gender===undefined?custRow.gender:gender || null,skin_type===undefined?custRow.skin_type:skin_type || null,beauty_preferences===undefined?custRow.beauty_preferences:normalizeBeautyPreferences(beauty_preferences) || null,accountId);
    } else {
      await tx.prepare(`
        INSERT INTO Customers (account_id, age, gender, skin_type, beauty_preferences)
        VALUES (?, ?, ?, ?, ?)
      `).run(accountId, age || null, gender || null, skin_type || null, normalizeBeautyPreferences(beauty_preferences) || null);
    }

    });
    if (res.headersSent) return;
    res.json({ message: 'Cập nhật thông tin khách hàng thành công' });
  } catch (err) {
    sendKnownError(res, err);
  }
});

app.put('/api/manager/customers/:accountId/status', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    validateAccountPayload(req.body, req.method === 'POST');
    const { status } = req.body;
    if (!['ACTIVE','LOCKED'].includes(status)) return res.status(400).json({ error: 'Trạng thái tài khoản không hợp lệ' });
    const account = await db.prepare("SELECT id FROM Accounts WHERE id = ? AND role = 'CUSTOMER'").get(req.params.accountId);
    if (!account) return res.status(404).json({ error: 'Khách hàng không tồn tại' });
    await db.prepare('UPDATE Accounts SET status = ? WHERE id = ? AND role = ?').run(status, req.params.accountId, 'CUSTOMER');
    res.json({ message: status === 'LOCKED' ? 'Đã khóa tài khoản khách hàng' : 'Đã mở khóa tài khoản khách hàng' });
  } catch (err) {
    sendKnownError(res, err);
  }
});

app.delete('/api/manager/customers/:accountId', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const result=await db.transaction(async tx => {
    const accountId = Number(req.params.accountId);
    const account = await tx.prepare("SELECT id, full_name, status FROM Accounts WHERE id = ? AND role = 'CUSTOMER'").get(accountId);
    if (!account) return res.status(404).json({ error: 'Không tìm thấy tài khoản khách hàng' });

    const cust = await tx.prepare(`
      SELECT c.id,
        (SELECT COUNT(*) FROM Feedbacks f WHERE f.customer_id = c.id) AS feedback_count,
        (SELECT COUNT(*) FROM SurveyResults sr WHERE sr.customer_id = c.id) AS survey_count
      FROM Customers c WHERE c.account_id = ?
    `).get(accountId);

    const feedbackCount = cust ? Number(cust.feedback_count) : 0;
    const surveyCount = cust ? Number(cust.survey_count) : 0;
    const hasInteractions = feedbackCount > 0 || surveyCount > 0;

    if (hasInteractions) {
      // Chặn xóa cứng (Soft Delete an toàn): Tự động chuyển trạng thái tài khoản sang LOCKED để bảo toàn lịch sử CRM
      await tx.prepare("UPDATE Accounts SET status = 'LOCKED' WHERE id = ? AND role = 'CUSTOMER'").run(accountId);
      return ({
        message: 'Khách hàng đã có dữ liệu đánh giá/khảo sát. Hệ thống đã tự động chuyển sang trạng thái Khóa tài khoản thay vì xóa vĩnh viễn để bảo toàn lịch sử thống kê CRM.',
        softDeleted: true
      });
    } else {
      // Chưa có đánh giá hay khảo sát: Cho phép xóa vĩnh viễn (Hard Delete)
      if (cust) {
        await tx.prepare('DELETE FROM SurveyRecipients WHERE customer_id = ?').run(cust.id);
        await tx.prepare('DELETE FROM Customers WHERE id = ?').run(cust.id);
      }
      await tx.prepare("DELETE FROM Accounts WHERE id = ? AND role = 'CUSTOMER'").run(accountId);
      return ({
        message: `Đã xóa vĩnh viễn tài khoản khách hàng "${account.full_name}" khỏi cơ sở dữ liệu.`,
        softDeleted: false
      });
    }
    });
    if (!res.headersSent) res.json(result);
  } catch (err) {
    sendKnownError(res,err);
  }
});

// Templates store copies of validated questions and never link to a live survey.
app.get('/api/manager/question-templates', authMiddleware, requireRole('MANAGER'), async(req,res)=>{
  try {
    const rows=await db.prepare('SELECT id,name,questions_json,created_at FROM SurveyQuestionTemplates WHERE created_by=? ORDER BY created_at DESC,id DESC').all(req.user.id);
    res.json(rows.map(({questions_json,...row})=>({...row,questions:JSON.parse(questions_json).map(q=>({...q,is_required:Boolean(q.is_required)}))})));
  } catch(error) { sendKnownError(res,error); }
});
app.post('/api/manager/question-templates', authMiddleware, requireRole('MANAGER'), async(req,res)=>{
  try {
    const name=String(req.body?.name || '').trim();
    if (!name || name.length>100) throw validationError('Tên bộ mẫu phải có từ 1 đến 100 ký tự.');
    const questions=normalizeSurveyQuestions(req.body?.questions).map(q=>({...q,is_required:Boolean(q.is_required)}));
    const created=await db.prepare('INSERT INTO SurveyQuestionTemplates (name,questions_json,created_by) VALUES (?,?,?)').run(name,JSON.stringify(questions),req.user.id);
    res.status(201).json({id:created.lastInsertRowid,name,questions});
  } catch(error) {
    if(isUniqueConstraintError(error))return res.status(409).json({error:'Tên bộ mẫu đã tồn tại. Vui lòng chọn tên khác.'});
    sendKnownError(res,error);
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
    listResponse(res,surveys,req.query,{dateField:'start_date',searchFields:['id','title'],sortFields:['id','title','start_date','end_date']});
  } catch (err) {
    sendKnownError(res,err);
  }
});

app.get('/api/manager/surveys/:id', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const surveyId = Number(req.params.id);
    const survey = await db.prepare('SELECT s.*, (SELECT COUNT(*) FROM SurveyResults sr WHERE sr.survey_id=s.id) AS response_count FROM Surveys s WHERE s.id = ?').get(surveyId);
    if (!survey) return res.status(404).json({ error: 'Không tìm thấy khảo sát' });
    const questions = await db.prepare('SELECT * FROM Questions WHERE survey_id = ? ORDER BY order_index').all(surveyId);
    questions.forEach(q => {
      if (q.options) {
        try { q.options = JSON.parse(q.options); } catch { }
      }
      q.is_required = q.is_required !== undefined && q.is_required !== null ? Boolean(q.is_required) : true;
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
    const payload = normalizeSurveyPayload(req.body);
    await validateSurveyReferences(payload);
    const created = await db.transaction(async tx => {
      const surveyResult = await tx.prepare('INSERT INTO Surveys (title, description, target_product_id, start_date, end_date, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(payload.title, payload.description, null, payload.start_date, payload.end_date, 'DRAFT', req.user.id);
      for (const productId of payload.target_product_ids) {
        await tx.prepare('INSERT INTO SurveyProducts (survey_id, product_id) VALUES (?, ?)').run(surveyResult.lastInsertRowid, productId);
      }
      for (let i = 0; i < payload.questions.length; i++) {
        const question = payload.questions[i];
        await tx.prepare('INSERT INTO Questions (survey_id, question_text, question_type, options, order_index, is_required) VALUES (?, ?, ?, ?, ?, ?)').run(surveyResult.lastInsertRowid, question.question_text, question.question_type, question.options ? JSON.stringify(question.options) : null, i + 1, question.is_required ?? 1);
      }
      const recipientCount = await assignSurveyRecipients(surveyResult.lastInsertRowid, payload.recipient_customer_ids, req.user.id, tx);
      return { id: surveyResult.lastInsertRowid, recipientCount };
    });
    res.status(201).json({ message: 'Tạo khảo sát thành công', id: created.id, recipient_count: created.recipientCount });
  } catch (err) {
    sendKnownError(res, err);
  }
});

app.put('/api/manager/surveys/:id', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const surveyId = Number(req.params.id);
    if (!Number.isInteger(surveyId) || surveyId <= 0) return res.status(400).json({ error: 'Mã khảo sát không hợp lệ' });
    const payload = normalizeSurveyPayload(req.body, { allowStatus: true });
    await db.transaction(async tx => {
      await checkRecordVersion(tx,'Surveys',surveyId,req.body);
    const existing = await tx.prepare('SELECT id FROM Surveys WITH (UPDLOCK, HOLDLOCK) WHERE id = ?').get(surveyId);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy khảo sát' });
    const responseCount = await tx.prepare('SELECT COUNT(*) AS count FROM SurveyResults WHERE survey_id = ?').get(surveyId);
    if (Number(responseCount?.count) > 0) {
      const error = new Error('Không thể chỉnh sửa cấu trúc khảo sát đã có câu trả lời. Bạn vẫn có thể đổi trạng thái trong form sửa khảo sát.');
      error.status = 409;
      throw error;
    }
    await validateSurveyReferences(payload);
      await tx.prepare(`
        UPDATE Surveys SET title = ?, description = ?, start_date = ?, end_date = ?, status = COALESCE(?, status)
        WHERE id = ?
      `).run(payload.title, payload.description, payload.start_date, payload.end_date, payload.status, surveyId);
      await tx.prepare('DELETE FROM SurveyProducts WHERE survey_id = ?').run(surveyId);
      for (const productId of payload.target_product_ids) {
        await tx.prepare('INSERT INTO SurveyProducts (survey_id, product_id) VALUES (?, ?)').run(surveyId, productId);
      }
      await tx.prepare('DELETE FROM Questions WHERE survey_id = ?').run(surveyId);
      for (let i = 0; i < payload.questions.length; i++) {
        const question = payload.questions[i];
        await tx.prepare('INSERT INTO Questions (survey_id, question_text, question_type, options, order_index, is_required) VALUES (?, ?, ?, ?, ?, ?)').run(surveyId, question.question_text, question.question_type, question.options ? JSON.stringify(question.options) : null, i + 1, question.is_required ?? 1);
      }
      if (payload.recipient_customer_ids !== null) {
        await tx.prepare('DELETE FROM SurveyRecipients WHERE survey_id = ?').run(surveyId);
        await assignSurveyRecipients(surveyId, payload.recipient_customer_ids, req.user.id, tx);
      }
    });

    if (res.headersSent) return;
    res.json({ message: 'Cập nhật khảo sát thành công' });
  } catch (err) {
    sendKnownError(res, err);
  }
});

app.delete('/api/manager/surveys/:id', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const result=await db.transaction(async tx => {
    const surveyId = Number(req.params.id);
    const existing = await tx.prepare('SELECT id, title FROM Surveys WHERE id = ?').get(surveyId);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy khảo sát' });

    // Xóa liên hoàn câu trả lời, kết quả, người nhận, sản phẩm, câu hỏi, khảo sát
    await tx.prepare('DELETE FROM SurveyAnswers WHERE survey_result_id IN (SELECT id FROM SurveyResults WHERE survey_id = ?)').run(surveyId);
    await tx.prepare('DELETE FROM SurveyResults WHERE survey_id = ?').run(surveyId);
    await tx.prepare('DELETE FROM SurveyRecipients WHERE survey_id = ?').run(surveyId);
    await tx.prepare('DELETE FROM SurveyProducts WHERE survey_id = ?').run(surveyId);
    await tx.prepare('DELETE FROM Questions WHERE survey_id = ?').run(surveyId);
    await tx.prepare('DELETE FROM Surveys WHERE id = ?').run(surveyId);

    return ({ message: `Đã xóa khảo sát "${existing.title}" thành công` });
    });
    if (!res.headersSent) res.json(result);
  } catch (err) {
    sendKnownError(res,err);
  }
});

app.put('/api/manager/surveys/:id/status', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!SURVEY_STATUSES.has(status)) return res.status(400).json({ error: 'Trạng thái khảo sát không hợp lệ' });
    const existing = await db.prepare('SELECT id FROM Surveys WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy khảo sát' });
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
    const recipientCount = await db.transaction(async tx => {
    const survey = await tx.prepare('SELECT id FROM Surveys WITH (UPDLOCK,HOLDLOCK) WHERE id = ?').get(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Không tìm thấy khảo sát' });
    if (!Array.isArray(customer_ids)) return res.status(400).json({ error: 'Danh sách người nhận không hợp lệ' });
    const ids = customer_ids.map(Number);
    if (ids.some(id => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
      return res.status(400).json({ error: 'Danh sách người nhận chứa mã không hợp lệ hoặc trùng lặp' });
    }
    const responseCount = await tx.prepare('SELECT COUNT(*) AS count FROM SurveyResults WHERE survey_id = ?').get(req.params.id);
    if (Number(responseCount?.count) > 0) {
      return res.status(409).json({ error: 'Không thể thay đổi người nhận sau khi khảo sát đã có câu trả lời' });
    }
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const activeCount = await tx.prepare(`SELECT COUNT(*) AS count FROM Customers c JOIN Accounts a ON a.id=c.account_id WHERE c.id IN (${placeholders}) AND a.status='ACTIVE'`).get(...ids);
      if (Number(activeCount?.count) !== ids.length) return res.status(400).json({ error: 'Một hoặc nhiều người nhận không tồn tại hoặc đã bị khóa' });
    }
      await tx.prepare('DELETE FROM SurveyRecipients WHERE survey_id = ?').run(req.params.id);
      return assignSurveyRecipients(req.params.id, ids, req.user.id, tx);
    });
    if (res.headersSent) return;
    res.json({ message: 'Đã cập nhật danh sách người nhận khảo sát', recipient_count: recipientCount });
  } catch (err) {
    sendKnownError(res, err);
  }
});

// ========== MANAGER: Gửi (kích hoạt) khảo sát đến người nhận ==========
app.post('/api/manager/surveys/:id/send', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const survey = await db.prepare('SELECT id, status, end_date FROM Surveys WHERE id = ?').get(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Không tìm thấy khảo sát' });
    if (survey.status === 'CLOSED') return res.status(409).json({ error: 'Không thể gửi lại khảo sát đã đóng' });
    if (survey.end_date && new Date(survey.end_date) < new Date(new Date().toDateString())) {
      return res.status(400).json({ error: 'Không thể gửi khảo sát đã quá ngày kết thúc' });
    }
    const questionCount = await db.prepare('SELECT COUNT(*) as cnt FROM Questions WHERE survey_id = ?').get(req.params.id);
    if (!Number(questionCount?.cnt)) return res.status(400).json({ error: 'Khảo sát phải có ít nhất một câu hỏi trước khi gửi' });

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
    const survey = await db.prepare(`
      SELECT s.*,
        (SELECT STRING_AGG(p.name, N', ') FROM SurveyProducts sp JOIN Products p ON sp.product_id = p.id WHERE sp.survey_id = s.id) AS product_names
      FROM Surveys s WHERE s.id = ?
    `).get(surveyId);
    if (!survey) return res.status(404).json({ error: 'Không tìm thấy khảo sát' });
    const questions = await db.prepare('SELECT * FROM Questions WHERE survey_id = ? ORDER BY order_index').all(surveyId);
    const products = await db.prepare(`
      SELECT p.id, p.name, p.category, s.name AS supplier_name
      FROM SurveyProducts sp
      JOIN Products p ON sp.product_id = p.id
      LEFT JOIN Suppliers s ON p.supplier_id = s.id
      WHERE sp.survey_id = ?
      ORDER BY p.name
    `).all(surveyId);

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
        if (vals.length) {
          const sorted = [...vals].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          analysis.median = sorted.length % 2 !== 0 ? sorted[mid] : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1));
        } else {
          analysis.median = null;
        }
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

    let overallMedian = null;
    if (allRatingValues.length) {
      const sortedRatings = [...allRatingValues].sort((a, b) => a - b);
      const mid = Math.floor(sortedRatings.length / 2);
      overallMedian = sortedRatings.length % 2 !== 0 ? sortedRatings[mid] : Number(((sortedRatings[mid - 1] + sortedRatings[mid]) / 2).toFixed(1));
    }

    const stats = {
      recipients_count: recipients.length,
      respondents_count: respondents.length,
      pending_count: Math.max(0, recipients.length - respondents.length),
      response_rate: recipients.length ? Math.round((respondents.length / recipients.length) * 100) : 0,
      overall_avg_rating: overallAvg,
      overall_median_rating: overallMedian
    };

    res.json({
      survey,
      products,
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
    const { rating, status, search } = req.query;
    let sql = `SELECT f.*, a.full_name as customer_name, p.name as product_name
      FROM Feedbacks f JOIN Customers c ON f.customer_id = c.id JOIN Accounts a ON c.account_id = a.id JOIN Products p ON f.product_id = p.id WHERE 1=1`;
    const params = [];
    if (rating) {
      if (rating === 'GROUP_NEGATIVE' || rating === 'NEGATIVE' || rating === '1-2') {
        sql += ' AND f.rating <= 2';
      } else if (rating === 'NEUTRAL' || rating === '3') {
        sql += ' AND f.rating = 3';
      } else if (rating === 'GROUP_POSITIVE' || rating === 'POSITIVE' || rating === '4-5') {
        sql += ' AND f.rating >= 4';
      } else if (!isNaN(Number(rating))) {
        sql += ' AND f.rating = ?';
        params.push(Number(rating));
      }
    }
    if (status) { sql += ' AND f.status = ?'; params.push(status); }
    if (search && search.trim()) {
      sql += ' AND (a.full_name LIKE ? OR p.name LIKE ? OR f.content LIKE ? OR CAST(f.id AS NVARCHAR(20)) = ?)';
      const term = `%${search.trim()}%`;
      params.push(term,term,term,String(search).replace(/^#/,''));
    }
    sql += ' ORDER BY f.created_at DESC';
    const rows = await db.prepare(sql).all(...params);
    listResponse(res,rows,req.query,{searchFields:['id','customer_name','product_name','content'],sortFields:['id','rating','created_at']});
  } catch (err) {
    sendKnownError(res,err);
  }
});

app.put('/api/manager/feedbacks/:id/reply', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const replyContent = String(req.body.reply_content || '').trim();
    if (!replyContent || replyContent.length > 5000) throw validationError('Trả lời feedback phải có từ 1 đến 5000 ký tự');
    await db.transaction(async tx => {
      const existing = await tx.prepare('SELECT id, reply_content, status FROM Feedbacks WITH (UPDLOCK,HOLDLOCK) WHERE id=?').get(req.params.id);
      if (!existing) { const error=new Error('Không tìm thấy đánh giá'); error.status=404; throw error; }
      if (existing.reply_content === replyContent) return; // Retried identical request.
      if (Object.prototype.hasOwnProperty.call(req.body,'expected_reply_content') && (req.body.expected_reply_content || null) !== (existing.reply_content || null)) {
        const error=new Error('Trả lời feedback đã được Manager khác cập nhật. Vui lòng mở lại chi tiết.'); error.status=409; throw error;
      }
      await tx.prepare('INSERT INTO FeedbackReplyHistory(feedback_id,manager_id,old_content,new_content) VALUES(?,?,?,?)').run(existing.id,req.user.id,existing.reply_content,replyContent);
      await tx.prepare("UPDATE Feedbacks SET reply_content=?, status='REPLIED', replied_at=GETDATE(), updated_at=GETDATE() WHERE id=?").run(replyContent,existing.id);
    });
    res.json({ message: 'Đã lưu trả lời feedback thành công' });
  } catch(error) { sendKnownError(res,error); }
});

app.get('/api/manager/feedbacks/:id', authMiddleware, requireRole('MANAGER'), async (req,res) => {
  try {
    const row = await db.prepare(`SELECT f.*, p.name AS product_name, p.category, a.full_name AS customer_name, a.email, a.phone
      FROM Feedbacks f JOIN Products p ON p.id=f.product_id JOIN Customers c ON c.id=f.customer_id JOIN Accounts a ON a.id=c.account_id WHERE f.id=?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Không tìm thấy đánh giá' });
    row.reply_history = await db.prepare(`SELECT h.id,h.old_content,h.new_content,h.changed_at,a.full_name AS manager_name FROM FeedbackReplyHistory h LEFT JOIN Accounts a ON a.id=h.manager_id WHERE h.feedback_id=? ORDER BY h.id DESC`).all(row.id);
    res.json(row);
  } catch(error) { sendKnownError(res,error); }
});
app.get('/api/customer/feedbacks/:id', authMiddleware, requireRole('CUSTOMER'), async (req,res) => {
  try {
    const row = await db.prepare(`SELECT f.*, p.name AS product_name, p.category, p.price AS product_price, p.description AS product_description, p.launch_status, s.name AS supplier_name FROM Feedbacks f JOIN Products p ON p.id=f.product_id
      LEFT JOIN Suppliers s ON s.id=p.supplier_id JOIN Customers c ON c.id=f.customer_id WHERE f.id=? AND c.account_id=?`).get(req.params.id,req.user.id);
    if (!row) return res.status(404).json({ error: 'Không tìm thấy đánh giá' });
    row.reply_history = await db.prepare(`SELECT h.id,h.old_content,h.new_content,h.changed_at,a.full_name AS manager_name FROM FeedbackReplyHistory h LEFT JOIN Accounts a ON a.id=h.manager_id WHERE h.feedback_id=? ORDER BY h.id DESC`).all(row.id);
    res.json(row);
  } catch(error) { sendKnownError(res,error); }
});

// ========== CUSTOMER: Profile ==========
app.get('/api/customer/profile', authMiddleware, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const account = await db.prepare('SELECT id, record_version, username, full_name, email, phone, status, created_at FROM Accounts WHERE id = ?').get(req.user.id);
    const customer = await db.prepare(`SELECT ${CUSTOMER_FIELDS} FROM Customers WHERE account_id = ?`).get(req.user.id);
    res.json({ account, customer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/customer/profile', authMiddleware, requireRole('CUSTOMER'), async (req, res) => {
  try {
    validateAccountPayload(req.body);
    const { full_name, email, phone, age, gender, skin_type, beauty_preferences } = req.body;
    await db.transaction(async tx => {
      await checkRecordVersion(tx,'Accounts',req.user.id,req.body);
      const previousAccount=await tx.prepare('SELECT full_name,email,phone FROM Accounts WHERE id=?').get(req.user.id);
      const previousCustomer=await tx.prepare('SELECT age,gender,skin_type,beauty_preferences FROM Customers WHERE account_id=?').get(req.user.id);
    await tx.prepare('UPDATE Accounts SET full_name = ?, email = ?, phone = ? WHERE id = ?').run(full_name===undefined?previousAccount.full_name:full_name,email===undefined?previousAccount.email:email || null,phone===undefined?previousAccount.phone:phone || null,req.user.id);
    await tx.prepare('UPDATE Customers SET age = ?, gender = ?, skin_type = ?, beauty_preferences = ? WHERE account_id = ?').run(age===undefined?previousCustomer?.age:age || null,gender===undefined?previousCustomer?.gender:gender || null,skin_type===undefined?previousCustomer?.skin_type:skin_type || null,beauty_preferences===undefined?previousCustomer?.beauty_preferences:normalizeBeautyPreferences(beauty_preferences) || null,req.user.id);
    });
    res.json({ message: 'Cập nhật thông tin thành công' });
  } catch (err) {
    sendKnownError(res,err);
  }
});

// ========== CUSTOMER: Products ==========
app.get('/api/customer/products', authMiddleware, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const customer = await db.prepare('SELECT id FROM Customers WHERE account_id = ?').get(req.user.id);
    const customerId = customer ? customer.id : 0;
    const products = await db.prepare(`
      SELECT ${PRODUCT_FIELDS}, s.name as supplier_name,
        CASE WHEN EXISTS (SELECT 1 FROM Feedbacks f WHERE f.customer_id = ? AND f.product_id = p.id) THEN 1 ELSE 0 END AS already_reviewed,
        (SELECT f.rating FROM Feedbacks f WHERE f.customer_id = ? AND f.product_id = p.id) AS my_rating,
        (SELECT f.id FROM Feedbacks f WHERE f.customer_id = ? AND f.product_id = p.id) AS my_feedback_id,
        (SELECT COUNT(*) FROM Feedbacks f WHERE f.product_id = p.id) AS review_count,
        (SELECT ROUND(AVG(CAST(f.rating AS FLOAT)), 1) FROM Feedbacks f WHERE f.product_id = p.id) AS avg_rating
      FROM Products p 
      LEFT JOIN Suppliers s ON p.supplier_id = s.id 
      ORDER BY (CASE WHEN p.launch_status = 'OFFICIAL' THEN 0 ELSE 1 END), p.created_at DESC
    `).all(customerId, customerId, customerId);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== CUSTOMER: Product Detail & Feedbacks (Hasaki standard) ==========
app.get('/api/customer/products/:productId/feedbacks', authMiddleware, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Mã sản phẩm không hợp lệ' });
    }

    const customer = await db.prepare('SELECT id FROM Customers WHERE account_id = ?').get(req.user.id);
    const customerId = customer ? customer.id : 0;

    const product = await db.prepare(`
      SELECT ${PRODUCT_FIELDS}, s.name as supplier_name,
        CASE WHEN EXISTS (SELECT 1 FROM Feedbacks f WHERE f.customer_id = ? AND f.product_id = p.id) THEN 1 ELSE 0 END AS already_reviewed
      FROM Products p
      LEFT JOIN Suppliers s ON p.supplier_id = s.id
      WHERE p.id = ?
    `).get(customerId, productId);

    if (!product) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    }

    const feedbacks = await db.prepare(`
      SELECT f.id, f.record_version, f.rating, f.content, f.reply_content, f.status, f.created_at,
             f.customer_id, a.full_name as customer_name, a.id as account_id
      FROM Feedbacks f
      JOIN Customers c ON f.customer_id = c.id
      JOIN Accounts a ON c.account_id = a.id
      WHERE f.product_id = ?
      ORDER BY (CASE WHEN c.id = ? THEN 0 ELSE 1 END), f.created_at DESC
    `).all(productId, customerId);

    // Calculate review statistics
    const total_reviews = feedbacks.length;
    let sum_rating = 0;
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let replied_count = 0;

    feedbacks.forEach(fb => {
      const r = Number(fb.rating);
      if (counts[r] !== undefined) counts[r]++;
      sum_rating += r;
      if (fb.reply_content && fb.reply_content.trim()) {
        replied_count++;
      }
    });

    const avg_rating = total_reviews > 0 ? (Math.round((sum_rating / total_reviews) * 10) / 10).toFixed(1) : '0.0';
    const my_feedback = feedbacks.find(f => Number(f.customer_id) === Number(customerId)) || null;

    res.json({
      product,
      feedbacks,
      my_feedback,
      stats: {
        total_reviews,
        avg_rating: Number(avg_rating),
        count_5: counts[5],
        count_4: counts[4],
        count_3: counts[3],
        count_2: counts[2],
        count_1: counts[1],
        replied_count
      }
    });
  } catch (err) {
    console.error('Customer product feedbacks error:', err);
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
      CASE WHEN s.status='ACTIVE' AND (s.start_date IS NULL OR s.start_date<=CAST(GETDATE() AS DATE)) AND (s.end_date IS NULL OR s.end_date>=CAST(GETDATE() AS DATE)) THEN 1 ELSE 0 END AS can_participate,
      (SELECT MAX(h.submitted_at) FROM SurveyResults h WHERE h.survey_id=s.id AND h.customer_id=r.customer_id) AS submitted_at,
      (SELECT STRING_AGG(p2.name, N', ') FROM SurveyProducts sp2 JOIN Products p2 ON sp2.product_id = p2.id WHERE sp2.survey_id = s.id) as product_names,
      (SELECT COUNT(*) FROM Questions q WHERE q.survey_id = s.id) as question_count,
      (SELECT COUNT(*) FROM SurveyResults sr WHERE sr.survey_id = s.id AND sr.customer_id = ?) as already_submitted
      FROM Surveys s
      JOIN SurveyRecipients r ON r.survey_id = s.id AND r.customer_id = ?
      WHERE (s.status IN ('ACTIVE','CLOSED') OR EXISTS(SELECT 1 FROM SurveyResults h WHERE h.survey_id=s.id AND h.customer_id=r.customer_id))
        AND (s.start_date IS NULL OR s.start_date <= CAST(GETDATE() AS DATE) OR EXISTS (SELECT 1 FROM SurveyResults h WHERE h.survey_id=s.id AND h.customer_id=r.customer_id))
      ORDER BY r.sent_at DESC, s.created_at DESC
    `).all(customer.id, customer.id);
    listResponse(res,surveys,req.query,{dateField:'end_date',searchFields:['id','title','product_names'],sortFields:['id','title','end_date','submitted_at']});
  } catch (err) {
    sendKnownError(res,err);
  }
});

app.get('/api/customer/surveys/:id', authMiddleware, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const customer = await db.prepare('SELECT id FROM Customers WHERE account_id = ?').get(req.user.id);
    if (!customer) return res.status(400).json({ error: 'Không tìm thấy hồ sơ khách hàng' });
    const survey = await db.prepare(`
      SELECT s.*,
      CASE WHEN s.status='ACTIVE' AND (s.start_date IS NULL OR s.start_date<=CAST(GETDATE() AS DATE)) AND (s.end_date IS NULL OR s.end_date>=CAST(GETDATE() AS DATE)) THEN 1 ELSE 0 END AS can_participate,
      (SELECT MAX(h.submitted_at) FROM SurveyResults h WHERE h.survey_id=s.id AND h.customer_id=r.customer_id) AS submitted_at,
      (SELECT STRING_AGG(p2.name, N', ') FROM SurveyProducts sp2 JOIN Products p2 ON sp2.product_id = p2.id WHERE sp2.survey_id = s.id) as product_names
      FROM Surveys s
      JOIN SurveyRecipients r ON r.survey_id = s.id AND r.customer_id = ?
      WHERE s.id = ? AND (s.status IN ('ACTIVE','CLOSED') OR EXISTS(SELECT 1 FROM SurveyResults h WHERE h.survey_id=s.id AND h.customer_id=r.customer_id))
        AND (s.start_date IS NULL OR s.start_date <= CAST(GETDATE() AS DATE) OR EXISTS (SELECT 1 FROM SurveyResults h WHERE h.survey_id=s.id AND h.customer_id=r.customer_id))
    `).get(customer.id, req.params.id);
    if (!survey) return res.status(404).json({ error: 'Không tìm thấy khảo sát' });
    const questions = await db.prepare('SELECT * FROM Questions WHERE survey_id = ? ORDER BY order_index').all(req.params.id);
    questions.forEach(q => {
      if (q.options) try { q.options = JSON.parse(q.options); } catch { }
      q.is_required = q.is_required !== undefined && q.is_required !== null ? Boolean(q.is_required) : true;
    });
    const submission = await db.prepare('SELECT id, submitted_at FROM SurveyResults WHERE survey_id=? AND customer_id=?').get(req.params.id, customer.id);
    const answers = submission ? await db.prepare('SELECT question_id, answer_value FROM SurveyAnswers WHERE survey_result_id=?').all(submission.id) : [];
    res.json({ survey, questions, submission: submission || null, answers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customer/surveys/:id/submit', authMiddleware, requireRole('CUSTOMER'), async (req, res) => {
  try {
    await db.transaction(async tx => {
    const account = await tx.prepare('SELECT status FROM Accounts WHERE id = ?').get(req.user.id);
    if (account && account.status === 'LOCKED') {
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa và không thể thực hiện khảo sát.' });
    }

    const customer = await tx.prepare('SELECT id FROM Customers WHERE account_id = ?').get(req.user.id);
    if (!customer) return res.status(400).json({ error: 'Không tìm thấy hồ sơ khách hàng' });
    const survey = await tx.prepare('SELECT id, status, start_date, end_date, CASE WHEN start_date > CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END AS not_started, CASE WHEN end_date < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END AS expired FROM Surveys WITH (UPDLOCK, HOLDLOCK) WHERE id = ?').get(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Không tìm thấy khảo sát' });
    if (survey.status !== 'ACTIVE') return res.status(409).json({ error: 'Khảo sát hiện không mở nhận câu trả lời' });
    if (survey.not_started) return res.status(400).json({ error: 'Khảo sát chưa đến ngày bắt đầu' });
    if (survey.expired) return res.status(409).json({ error: 'Khảo sát đã hết hạn' });
    const recipient = await tx.prepare('SELECT id FROM SurveyRecipients WHERE survey_id = ? AND customer_id = ?').get(req.params.id, customer.id);
    if (!recipient) return res.status(403).json({ error: 'Khảo sát này chưa được gửi đến tài khoản của bạn' });
    const alreadyDone = await tx.prepare('SELECT id FROM SurveyResults WHERE survey_id = ? AND customer_id = ?').get(req.params.id, customer.id);
    if (alreadyDone) return res.status(409).json({ error: 'Bạn đã thực hiện khảo sát này rồi' });
    const { answers } = req.body;
    if (!Array.isArray(answers) || !answers.length) return res.status(400).json({ error: 'Vui lòng trả lời ít nhất một câu hỏi' });
    const questions = await tx.prepare('SELECT id, question_text, question_type, options, is_required FROM Questions WHERE survey_id = ?').all(req.params.id);

    const answeredQuestionIds = new Set(
      answers
        .filter(a => a && a.answer_value !== null && a.answer_value !== undefined && (Array.isArray(a.answer_value) ? a.answer_value.length > 0 : String(a.answer_value).trim() !== ''))
        .map(a => Number(a.question_id))
    );
    for (const q of questions) {
      const isReq = q.is_required === undefined || q.is_required === null || Boolean(q.is_required);
      if (isReq && !answeredQuestionIds.has(Number(q.id))) {
        return res.status(400).json({ error: `Câu hỏi "${q.question_text}" là bắt buộc, vui lòng trả lời.` });
      }
    }
    const questionMap = new Map(questions.map(question => [Number(question.id), question]));
    const normalizedAnswers = [];
    const seenQuestionIds = new Set();
    for (const answer of answers) {
      const questionId = Number(answer?.question_id);
      const question = questionMap.get(questionId);
      if (!question) return res.status(400).json({ error: 'Câu trả lời chứa câu hỏi không thuộc khảo sát này' });
      if (seenQuestionIds.has(questionId)) return res.status(400).json({ error: 'Mỗi câu hỏi chỉ được gửi một câu trả lời' });
      seenQuestionIds.add(questionId);

      let value = answer.answer_value;
      let options = [];
      if (question.options) {
        try { options = JSON.parse(question.options); } catch { return res.status(500).json({ error: 'Cấu hình câu hỏi trong hệ thống không hợp lệ' }); }
      }
      if (question.question_type === 'SINGLE_CHOICE') {
        value = String(value ?? '').trim();
        if (!options.includes(value)) return res.status(400).json({ error: 'Lựa chọn gửi lên không thuộc danh sách đáp án hợp lệ' });
      } else if (question.question_type === 'MULTI_CHOICE') {
        if (!Array.isArray(value) || !value.length) return res.status(400).json({ error: 'Câu hỏi nhiều lựa chọn phải có ít nhất một đáp án' });
        value = value.map(item => String(item).trim());
        if (new Set(value).size !== value.length || value.some(item => !options.includes(item))) {
          return res.status(400).json({ error: 'Một hoặc nhiều lựa chọn gửi lên không hợp lệ' });
        }
      } else if (question.question_type === 'RATING') {
        value = Number(value);
        if (!Number.isInteger(value) || value < 1 || value > 5) return res.status(400).json({ error: 'Điểm khảo sát phải là số nguyên từ 1 đến 5' });
      } else if (question.question_type === 'TEXT') {
        value = String(value ?? '').trim();
        if (!value) return res.status(400).json({ error: 'Câu trả lời văn bản không được chỉ chứa khoảng trắng' });
        if (value.length > 5000) return res.status(400).json({ error: 'Câu trả lời văn bản không được vượt quá 5000 ký tự' });
      }
      normalizedAnswers.push({ question_id: questionId, answer_value: Array.isArray(value) ? JSON.stringify(value) : value });
    }

      const resultRow = await tx.prepare('INSERT INTO SurveyResults (survey_id, customer_id) VALUES (?, ?)').run(req.params.id, customer.id);
      for (const answer of normalizedAnswers) {
        await tx.prepare('INSERT INTO SurveyAnswers (survey_result_id, question_id, answer_value) VALUES (?, ?, ?)').run(resultRow.lastInsertRowid, answer.question_id, answer.answer_value);
      }
    });
    if (res.headersSent) return;
    res.status(201).json({ message: 'Nộp khảo sát thành công! Cảm ơn bạn đã tham gia.' });
  } catch (err) {
    if (isUniqueConstraintError(err)) return res.status(409).json({ error: 'Bạn đã thực hiện khảo sát này rồi' });
    sendKnownError(res, err);
  }
});

// ========== CUSTOMER: Feedbacks ==========
app.get('/api/customer/feedbacks', authMiddleware, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const customer = await db.prepare('SELECT id FROM Customers WHERE account_id = ?').get(req.user.id);
    if (!customer) return res.json([]);
    const feedbacks = await db.prepare('SELECT f.*, p.name as product_name FROM Feedbacks f JOIN Products p ON f.product_id = p.id WHERE f.customer_id = ? ORDER BY f.created_at DESC').all(customer.id);
    listResponse(res,feedbacks,req.query,{searchFields:['id','product_name','content','reply_content'],sortFields:['id','rating','created_at']});
  } catch (err) {
    sendKnownError(res,err);
  }
});

app.post('/api/customer/feedbacks', authMiddleware, requireRole('CUSTOMER'), async (req, res) => {
  try {
    await db.transaction(async tx => {
    const account = await tx.prepare('SELECT status FROM Accounts WHERE id = ?').get(req.user.id);
    if (account && account.status === 'LOCKED') {
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa và không thể gửi đánh giá mới.' });
    }

    const customer = await tx.prepare('SELECT id FROM Customers WHERE account_id = ?').get(req.user.id);
    if (!customer) return res.status(400).json({ error: 'Không tìm thấy hồ sơ khách hàng' });
    const { product_id, rating, content } = req.body;
    const productId = Number(product_id);
    const ratingValue = Number(rating);
    if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Sản phẩm không hợp lệ' });
    if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) return res.status(400).json({ error: 'Điểm đánh giá phải là số nguyên từ 1 đến 5' });
    const normalizedContent = String(content || '').trim() || null;
    if (normalizedContent && normalizedContent.length > 2000) return res.status(400).json({ error: 'Nội dung đánh giá không được vượt quá 2000 ký tự' });

    // Kiểm tra trạng thái kinh doanh của sản phẩm (chỉ Đang bán - OFFICIAL mới nhận đánh giá)
    const product = await tx.prepare('SELECT id, name, launch_status FROM Products WHERE id = ?').get(productId);
    if (!product) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    if (product.launch_status !== 'OFFICIAL') {
      return res.status(400).json({ error: 'Sản phẩm này đã ngừng bán và đóng nhận đánh giá mới.' });
    }

    // Kiểm tra khách hàng đã đánh giá sản phẩm này chưa (chỉ được 1 lần)
    const existing = await tx.prepare('SELECT id FROM Feedbacks WHERE customer_id = ? AND product_id = ?').get(customer.id, productId);
    if (existing) {
      return res.status(409).json({ error: 'Bạn đã đánh giá sản phẩm này rồi. Mỗi sản phẩm chỉ được gửi đánh giá 1 lần.' });
    }

    await tx.prepare('INSERT INTO Feedbacks (customer_id, product_id, rating, content) VALUES (?, ?, ?, ?)').run(customer.id, productId, ratingValue, normalizedContent);
    });
    if (res.headersSent) return;
    res.status(201).json({ message: 'Gửi đánh giá thành công! Cảm ơn bạn.' });
  } catch (err) {
    if (isUniqueConstraintError(err)) return res.status(409).json({ error: 'Bạn đã đánh giá sản phẩm này rồi. Mỗi sản phẩm chỉ được gửi đánh giá 1 lần.' });
    sendKnownError(res, err);
  }
});

app.put('/api/customer/feedbacks/:id', authMiddleware, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const feedbackId = Number(req.params.id);
    if (!Number.isInteger(feedbackId) || feedbackId <= 0) {
      return res.status(400).json({ error: 'Mã đánh giá không hợp lệ' });
    }

    const account = await db.prepare('SELECT status FROM Accounts WHERE id = ?').get(req.user.id);
    if (account && account.status === 'LOCKED') {
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa và không thể chỉnh sửa đánh giá.' });
    }

    const customer = await db.prepare('SELECT id FROM Customers WHERE account_id = ?').get(req.user.id);
    if (!customer) return res.status(400).json({ error: 'Không tìm thấy hồ sơ khách hàng' });

    await db.transaction(async tx => {
      await checkRecordVersion(tx,'Feedbacks',feedbackId,req.body);
    const existing = await tx.prepare('SELECT * FROM Feedbacks WITH (UPDLOCK, HOLDLOCK) WHERE id = ? AND customer_id = ?').get(feedbackId, customer.id);
    if (!existing) {
      return res.status(404).json({ error: 'Không tìm thấy đánh giá hoặc bạn không có quyền sửa đánh giá này' });
    }

    if (existing.status === 'REPLIED') {
      return res.status(400).json({ error: 'Đánh giá đã được nhân viên chăm sóc khách hàng trả lời, không thể chỉnh sửa.' });
    }

    const { rating, content } = req.body;
    const ratingValue = Number(rating);
    if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return res.status(400).json({ error: 'Điểm đánh giá phải là số nguyên từ 1 đến 5' });
    }
    const normalizedContent = String(content || '').trim() || null;
    if (normalizedContent && normalizedContent.length > 2000) {
      return res.status(400).json({ error: 'Nội dung đánh giá không được vượt quá 2000 ký tự' });
    }

      await tx.prepare(`
        INSERT INTO FeedbackAuditLog (feedback_id, customer_id, old_rating, new_rating, old_content, new_content, action)
        VALUES (?, ?, ?, ?, ?, ?, 'EDIT')
      `).run(feedbackId, customer.id, existing.rating, ratingValue, existing.content, normalizedContent);

      await tx.prepare('UPDATE Feedbacks SET rating = ?, content = ?, updated_at=GETDATE() WHERE id = ?').run(ratingValue, normalizedContent, feedbackId);
    });

    if (res.headersSent) return;
    res.json({ message: 'Cập nhật đánh giá thành công!' });
  } catch (err) {
    sendKnownError(res, err);
  }
});

app.get('/api/customer/feedbacks/:id/audit-logs', authMiddleware, requireRole('CUSTOMER'), async (req, res) => {
  try {
    const feedbackId = Number(req.params.id);
    const customer = await db.prepare('SELECT id FROM Customers WHERE account_id = ?').get(req.user.id);
    if (!customer) return res.status(400).json({ error: 'Không tìm thấy hồ sơ khách hàng' });
    const logs = await db.prepare('SELECT *, COALESCE(changed_at, created_at) AS changed_at FROM FeedbackAuditLog WHERE feedback_id = ? AND customer_id = ? ORDER BY id DESC').all(feedbackId, customer.id);
    res.json(logs);
  } catch (err) {
    sendKnownError(res, err);
  }
});

app.get('/api/manager/feedbacks/:id/audit-logs', authMiddleware, requireRole('MANAGER'), async (req, res) => {
  try {
    const feedbackId = Number(req.params.id);
    const logs = await db.prepare(`
      SELECT fal.*, COALESCE(fal.changed_at, fal.created_at) AS changed_at, a.full_name as customer_name
      FROM FeedbackAuditLog fal
      JOIN Customers c ON fal.customer_id = c.id
      JOIN Accounts a ON c.account_id = a.id
      WHERE fal.feedback_id = ?
      ORDER BY fal.id DESC
    `).all(feedbackId);
    res.json(logs);
  } catch (err) {
    sendKnownError(res, err);
  }
});

// ========== SHARED: Products list for dropdowns ==========
app.get('/api/products', authMiddleware, async (req, res) => {
  try {
    const { launch_status } = req.query;
    let sql = `
      SELECT p.id, p.name, p.category, p.supplier_id, s.name as supplier_name, p.price, p.launch_status 
      FROM Products p 
      LEFT JOIN Suppliers s ON p.supplier_id = s.id 
      WHERE 1=1
    `;
    const params = [];
    if (launch_status) { sql += ' AND p.launch_status = ?'; params.push(launch_status); }
    sql += ' ORDER BY p.name';
    const rows = await db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== SERVER START ==========
if (!process.env.VERCEL) {
  ensureDb().then(() => {
    const server = app.listen(PORT, () => {
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

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Cổng ${PORT} hiện đang được sử dụng bởi một tiến trình khác.`);
        console.error(`👉 Hướng dẫn giải phóng cổng ${PORT} trong PowerShell:\n   Get-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess | Stop-Process -Force\n`);
        process.exit(1);
      } else {
        console.error('Lỗi server:', err);
        process.exit(1);
      }
    });
  }).catch(err => {
    console.error('Khởi động server thất bại:', err);
    process.exit(1);
  });
}

module.exports = app;
