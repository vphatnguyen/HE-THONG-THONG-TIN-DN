const sql = require('msnodesqlv8');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3100';
const DB_SERVER = process.env.DB_SERVER || '.\\SQLEXPRESS';
const DB_DATABASE = process.env.DB_DATABASE || 'CosmeticsCRM_E2E_DB';
const QA_PREFIX = 'qa_e2e_';

const results = [];
let pool;
let managerToken;
let customerAToken;
let customerBToken;
let customerAId;
let customerBId;
let productId;
let upcomingProductId;
let validSurveyId;
let validQuestions = [];

function record(id, module, scenario, expected, actual, passed, severity = '') {
  results.push({ id, module, scenario, expected, actual, status: passed ? 'PASS' : 'FAIL', severity: passed ? '' : severity });
}

async function test(id, module, scenario, expected, severity, fn) {
  try {
    const actual = await fn();
    record(id, module, scenario, expected, actual, true);
  } catch (error) {
    record(id, module, scenario, expected, error.message, false, severity);
  }
}

async function api(method, path, token, body) {
  const response = await fetch(BASE_URL + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function query(text, inputs = {}) {
  const params = [];
  const statement = text.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(inputs, name)) return match;
    params.push(inputs[name]);
    return '?';
  });
  const result = await pool.promises.query(statement, params);
  return { recordset: result.first || [], recordsets: result.results || [] };
}

async function login(username, password) {
  return api('POST', '/api/auth/login', null, { username, password });
}

async function setup() {
  pool = await sql.promises.open(`Driver={ODBC Driver 18 for SQL Server};Server=${DB_SERVER};Database=${DB_DATABASE};Trusted_Connection=yes;TrustServerCertificate=yes;`);

  await query(`
    DELETE FROM SurveyAnswers WHERE survey_result_id IN (
      SELECT sr.id FROM SurveyResults sr JOIN Surveys s ON s.id = sr.survey_id WHERE s.title LIKE '${QA_PREFIX}%'
    );
    DELETE FROM SurveyResults WHERE survey_id IN (SELECT id FROM Surveys WHERE title LIKE '${QA_PREFIX}%');
    DELETE FROM SurveyRecipients WHERE survey_id IN (SELECT id FROM Surveys WHERE title LIKE '${QA_PREFIX}%');
    DELETE FROM SurveyProducts WHERE survey_id IN (SELECT id FROM Surveys WHERE title LIKE '${QA_PREFIX}%');
    DELETE FROM Questions WHERE survey_id IN (SELECT id FROM Surveys WHERE title LIKE '${QA_PREFIX}%');
    DELETE FROM Surveys WHERE title LIKE '${QA_PREFIX}%';
    IF OBJECT_ID('dbo.FeedbackAuditLog', 'U') IS NOT NULL
    DELETE FROM FeedbackAuditLog WHERE feedback_id IN (
      SELECT f.id FROM Feedbacks f JOIN Customers c ON f.customer_id = c.id JOIN Accounts a ON a.id = c.account_id WHERE a.username LIKE '${QA_PREFIX}%'
    );
    DELETE FROM Feedbacks WHERE customer_id IN (
      SELECT c.id FROM Customers c JOIN Accounts a ON a.id = c.account_id WHERE a.username LIKE '${QA_PREFIX}%'
    );
    DELETE FROM Products WHERE name LIKE '${QA_PREFIX}%';
    DELETE FROM Customers WHERE account_id IN (SELECT id FROM Accounts WHERE username LIKE '${QA_PREFIX}%');
    DELETE FROM Accounts WHERE username LIKE '${QA_PREFIX}%';
  `);

  await query(`
    INSERT INTO Accounts (username,password,full_name,email,role,status) VALUES
      ('${QA_PREFIX}manager','manager-pass',N'QA Manager','${QA_PREFIX}manager@test.local','MANAGER','ACTIVE'),
      ('${QA_PREFIX}customer_a','customer-pass',N'QA Khách A','${QA_PREFIX}a@test.local','CUSTOMER','ACTIVE'),
      ('${QA_PREFIX}customer_b','customer-pass',N'QA Khách B','${QA_PREFIX}b@test.local','CUSTOMER','ACTIVE');
    INSERT INTO Customers (account_id,age,gender,skin_type,beauty_preferences)
      SELECT id,29,N'Nu',N'Da dầu',N'Trị mụn,Dưỡng ẩm' FROM Accounts WHERE username='${QA_PREFIX}customer_a';
    INSERT INTO Customers (account_id,age,gender,skin_type,beauty_preferences)
      SELECT id,41,N'Nam',N'Da khô',N'Chống lão hóa' FROM Accounts WHERE username='${QA_PREFIX}customer_b';
    INSERT INTO Products (name,category,price,stock_quantity,launch_status)
      VALUES (N'${QA_PREFIX}official',N'Test',100000,10,'OFFICIAL'),
             (N'${QA_PREFIX}upcoming',N'Test',100000,0,'UPCOMING');
  `);

  const ids = (await query(`
    SELECT a.username,c.id AS customer_id FROM Accounts a LEFT JOIN Customers c ON c.account_id=a.id WHERE a.username LIKE '${QA_PREFIX}%';
    SELECT id,name FROM Products WHERE name LIKE '${QA_PREFIX}%';
  `)).recordsets;
  customerAId = ids[0].find(row => row.username.endsWith('customer_a')).customer_id;
  customerBId = ids[0].find(row => row.username.endsWith('customer_b')).customer_id;
  productId = ids[1].find(row => row.name.endsWith('official')).id;
  upcomingProductId = ids[1].find(row => row.name.endsWith('upcoming')).id;

  const manager = await login(`${QA_PREFIX}manager`, 'manager-pass');
  const customerA = await login(`${QA_PREFIX}customer_a`, 'customer-pass');
  const customerB = await login(`${QA_PREFIX}customer_b`, 'customer-pass');
  expect(manager.status === 200 && customerA.status === 200 && customerB.status === 200, 'Không thể đăng nhập tài khoản fixture');
  managerToken = manager.data.token;
  customerAToken = customerA.data.token;
  customerBToken = customerB.data.token;
}

async function run() {
  await setup();

  await test('AUTH-01', 'Xác thực', 'Tài khoản mẫu đăng nhập theo tài liệu', 'HTTP 200 cho admin/admin123', 'P0', async () => {
    const response = await login('admin', 'admin123');
    expect(response.status === 200, `HTTP ${response.status}: ${response.data?.error || ''}`);
    return 'Đăng nhập thành công';
  });

  await test('AUTH-02', 'Phân quyền', 'Khách hàng gọi API quản lý', 'HTTP 403', 'P0', async () => {
    const response = await api('GET', '/api/manager/analytics', customerAToken);
    expect(response.status === 403, `HTTP ${response.status}`);
    return 'HTTP 403';
  });

  await test('FB-01', 'Đánh giá', 'Gửi đánh giá hợp lệ và đọc lại từ DB', 'HTTP 201; DB lưu đúng 5 sao và Unicode', 'P1', async () => {
    const content = 'Sản phẩm rất tốt – kiểm thử Unicode tiếng Việt 🌸';
    const response = await api('POST', '/api/customer/feedbacks', customerAToken, { product_id: productId, rating: 5, content });
    expect(response.status === 201, `HTTP ${response.status}: ${response.data?.error || ''}`);
    const row = (await query('SELECT rating,content,status FROM Feedbacks WHERE customer_id=@customer AND product_id=@product', { customer: customerAId, product: productId })).recordset[0];
    expect(row && row.rating === 5 && row.content === content && row.status === 'PENDING', `DB=${JSON.stringify(row)}`);
    return JSON.stringify(row);
  });

  await test('FB-02', 'Đánh giá', 'Chống gửi trùng tuần tự', 'HTTP 409; DB chỉ có 1 dòng', 'P0', async () => {
    const response = await api('POST', '/api/customer/feedbacks', customerAToken, { product_id: productId, rating: 4, content: 'trùng' });
    const count = (await query('SELECT COUNT(*) AS n FROM Feedbacks WHERE customer_id=@customer AND product_id=@product', { customer: customerAId, product: productId })).recordset[0].n;
    expect(response.status === 409 && count === 1, `HTTP ${response.status}; count=${count}`);
    return 'HTTP 409; count=1';
  });

  await test('FB-03', 'Đánh giá', 'Điểm vượt thang 1–5', 'HTTP 400, không phát sinh dữ liệu', 'P1', async () => {
    const response = await api('POST', '/api/customer/feedbacks', customerBToken, { product_id: productId, rating: 6, content: 'invalid' });
    const count = (await query('SELECT COUNT(*) AS n FROM Feedbacks WHERE customer_id=@customer AND product_id=@product', { customer: customerBId, product: productId })).recordset[0].n;
    expect(response.status === 400 && count === 0, `HTTP ${response.status}; count=${count}; ${response.data?.error || ''}`);
    return 'HTTP 400; count=0';
  });

  await test('FB-04', 'Đánh giá', 'Sản phẩm không tồn tại', 'HTTP 404', 'P1', async () => {
    const response = await api('POST', '/api/customer/feedbacks', customerBToken, { product_id: 2147483647, rating: 4, content: 'x' });
    expect(response.status === 404, `HTTP ${response.status}`);
    return 'HTTP 404';
  });

  await test('FB-05', 'Đánh giá', 'Sản phẩm chưa kinh doanh', 'HTTP 400', 'P1', async () => {
    const response = await api('POST', '/api/customer/feedbacks', customerBToken, { product_id: upcomingProductId, rating: 4, content: 'x' });
    expect(response.status === 400, `HTTP ${response.status}`);
    return 'HTTP 400';
  });

  await test('FB-06', 'Đánh giá', 'Nội dung chỉ chứa khoảng trắng', 'Chuẩn hóa thành NULL hoặc từ chối 400', 'P2', async () => {
    const extra = await query(`INSERT INTO Products(name,category,price,launch_status) OUTPUT INSERTED.id VALUES(N'${QA_PREFIX}blank-content',N'Test',1,'OFFICIAL')`);
    const id = extra.recordset[0].id;
    const response = await api('POST', '/api/customer/feedbacks', customerAToken, { product_id: id, rating: 3, content: '   ' });
    const row = (await query('SELECT content FROM Feedbacks WHERE customer_id=@customer AND product_id=@product', { customer: customerAId, product: id })).recordset[0];
    expect(response.status === 400 || row?.content === null, `HTTP ${response.status}; DB content=${JSON.stringify(row?.content)}`);
    return response.status === 400 ? 'HTTP 400' : 'DB content=NULL';
  });

  await test('FB-07', 'Thống kê sản phẩm', 'KPI sau khi thêm đánh giá', 'Sản phẩm QA: count=1, average=5; phân bố 5★ tăng đúng', 'P1', async () => {
    const response = await api('GET', '/api/manager/analytics', managerToken);
    expect(response.status === 200, `HTTP ${response.status}`);
    const product = response.data.feedbackByProduct.find(item => Number(item.product_id) === Number(productId));
    expect(product && Number(product.count) === 1 && Number(product.average) === 5, `product=${JSON.stringify(product)}`);
    const dbTotal = (await query('SELECT COUNT(*) AS n FROM Feedbacks')).recordset[0].n;
    expect(Number(response.data.stats.totalFeedbacks) === dbTotal, `API=${response.data.stats.totalFeedbacks}; DB=${dbTotal}`);
    return `count=${product.count}; average=${product.average}; total=${dbTotal}`;
  });

  await test('FB-08', 'Thống kê sản phẩm', 'Sản phẩm chưa có đánh giá', 'API trả count=0, average=null để UI hiển thị “Chưa có đánh giá”', 'P2', async () => {
    const response = await api('GET', '/api/manager/analytics', managerToken);
    const product = response.data.feedbackByProduct.find(item => Number(item.product_id) === Number(upcomingProductId));
    expect(product && Number(product.count) === 0 && product.average === null, `product=${JSON.stringify(product)}`);
    return 'count=0; average=null';
  });

  await test('FB-09', 'Đánh giá', 'Nội dung vượt 2000 ký tự', 'HTTP 400; không lưu DB', 'P2', async () => {
    const extra = await query(`INSERT INTO Products(name,category,price,launch_status) OUTPUT INSERTED.id VALUES(N'${QA_PREFIX}long-content',N'Test',1,'OFFICIAL')`);
    const id = extra.recordset[0].id;
    const response = await api('POST', '/api/customer/feedbacks', customerBToken, { product_id: id, rating: 4, content: 'a'.repeat(2001) });
    const count = (await query('SELECT COUNT(*) AS n FROM Feedbacks WHERE customer_id=@customer AND product_id=@product', { customer: customerBId, product: id })).recordset[0].n;
    expect(response.status === 400 && count === 0, `HTTP ${response.status}; count=${count}`);
    return 'HTTP 400; count=0';
  });

  await test('FB-10', 'Đánh giá', 'Hai request đồng thời cho cùng sản phẩm', 'Một HTTP 201, một HTTP 409; DB chỉ có 1 dòng', 'P0', async () => {
    const extra = await query(`INSERT INTO Products(name,category,price,launch_status) OUTPUT INSERTED.id VALUES(N'${QA_PREFIX}concurrent',N'Test',1,'OFFICIAL')`);
    const id = extra.recordset[0].id;
    const responses = await Promise.all([
      api('POST', '/api/customer/feedbacks', customerBToken, { product_id: id, rating: 4, content: 'request A' }),
      api('POST', '/api/customer/feedbacks', customerBToken, { product_id: id, rating: 5, content: 'request B' })
    ]);
    const statuses = responses.map(item => item.status).sort();
    const count = (await query('SELECT COUNT(*) AS n FROM Feedbacks WHERE customer_id=@customer AND product_id=@product', { customer: customerBId, product: id })).recordset[0].n;
    expect(JSON.stringify(statuses) === JSON.stringify([201, 409]) && count === 1, `statuses=${statuses}; count=${count}`);
    return `statuses=${statuses.join(',')}; count=1`;
  });

  await test('FB-11', 'CSKH đánh giá', 'Phản hồi rỗng và phản hồi hợp lệ', 'Rỗng: HTTP 400; hợp lệ: REPLIED và nội dung được trim', 'P1', async () => {
    const feedback = (await query('SELECT id FROM Feedbacks WHERE customer_id=@customer AND product_id=@product', { customer: customerAId, product: productId })).recordset[0];
    const empty = await api('PUT', `/api/manager/feedbacks/${feedback.id}/reply`, managerToken, { reply_content: '   ' });
    const valid = await api('PUT', `/api/manager/feedbacks/${feedback.id}/reply`, managerToken, { reply_content: '  Cảm ơn phản hồi  ' });
    const row = (await query('SELECT status,reply_content FROM Feedbacks WHERE id=@id', { id: feedback.id })).recordset[0];
    expect(empty.status === 400 && valid.status === 200 && row.status === 'REPLIED' && row.reply_content === 'Cảm ơn phản hồi', `empty=${empty.status}; valid=${valid.status}; row=${JSON.stringify(row)}`);
    return 'HTTP 400 / HTTP 200; status=REPLIED';
  });

  await test('FB-12', 'Chỉnh sửa đánh giá', 'Khách hàng sửa đánh giá khi còn PENDING kèm ghi Audit Log', 'HTTP 200; cập nhật rating/content và lưu FeedbackAuditLog', 'P1', async () => {
    const extra = await query(`INSERT INTO Products(name,category,price,launch_status) OUTPUT INSERTED.id VALUES(N'${QA_PREFIX}fb-edit-test',N'Test',1,'OFFICIAL')`);
    const testProdId = extra.recordset[0].id;
    const postRes = await api('POST', '/api/customer/feedbacks', customerBToken, { product_id: testProdId, rating: 4, content: 'Đánh giá ban đầu' });
    expect(postRes.status === 201, `Create feedback HTTP ${postRes.status}`);

    const fbRow = (await query('SELECT id FROM Feedbacks WHERE customer_id=@customer AND product_id=@product', { customer: customerBId, product: testProdId })).recordset[0];
    const updateRes = await api('PUT', `/api/customer/feedbacks/${fbRow.id}`, customerBToken, { rating: 5, content: 'Đã sửa sau khi dùng thêm 1 tuần' });
    expect(updateRes.status === 200, `Update feedback HTTP ${updateRes.status}: ${JSON.stringify(updateRes.data)}`);

    const updatedRow = (await query('SELECT rating, content, status FROM Feedbacks WHERE id=@id', { id: fbRow.id })).recordset[0];
    expect(Number(updatedRow.rating) === 5 && updatedRow.content === 'Đã sửa sau khi dùng thêm 1 tuần', `Row=${JSON.stringify(updatedRow)}`);

    const auditRows = (await query('SELECT * FROM FeedbackAuditLog WHERE feedback_id=@id ORDER BY id DESC', { id: fbRow.id })).recordset;
    expect(auditRows.length >= 1, `Audit count=${auditRows.length}`);
    const latestAudit = auditRows[0];
    expect(Number(latestAudit.old_rating) === 4 && Number(latestAudit.new_rating) === 5, `Audit=${JSON.stringify(latestAudit)}`);

    const auditApiRes = await api('GET', `/api/customer/feedbacks/${fbRow.id}/audit-logs`, customerBToken);
    expect(auditApiRes.status === 200 && Array.isArray(auditApiRes.data) && auditApiRes.data.length >= 1, `Audit API status=${auditApiRes.status}`);
    return `HTTP 200; rating 4->5; audit log ID=${latestAudit.id}`;
  });

  await test('FB-13', 'Chỉnh sửa đánh giá', 'Chặn khách hàng sửa đánh giá khi đã được CSKH phản hồi (REPLIED)', 'HTTP 400; không cho sửa', 'P1', async () => {
    const feedback = (await query('SELECT id FROM Feedbacks WHERE customer_id=@customer AND product_id=@product', { customer: customerAId, product: productId })).recordset[0];
    const editRes = await api('PUT', `/api/customer/feedbacks/${feedback.id}`, customerAToken, { rating: 1, content: 'Cố tình sửa sau khi đã được CSKH phản hồi' });
    expect(editRes.status === 400 && (editRes.data?.error?.includes('CSKH') || editRes.data?.error?.includes('chăm sóc khách hàng')), `HTTP ${editRes.status}; error=${editRes.data?.error}`);

    const afterRow = (await query('SELECT rating, status FROM Feedbacks WHERE id=@id', { id: feedback.id })).recordset[0];
    expect(Number(afterRow.rating) === 5 && afterRow.status === 'REPLIED', `Row=${JSON.stringify(afterRow)}`);
    return `HTTP 400: ${editRes.data?.error}`;
  });

  await test('AUTH-03', 'Xác thực', 'Tài khoản bị khóa đăng nhập', 'HTTP 403', 'P0', async () => {
    const response = await login('khach006', 'customer123');
    expect(response.status === 403, `HTTP ${response.status}`);
    return 'HTTP 403';
  });

  const validSurvey = {
    title: `${QA_PREFIX}valid-survey`,
    description: 'Khảo sát E2E',
    target_product_ids: [productId],
    start_date: '2026-01-01',
    end_date: '2027-12-31',
    recipient_customer_ids: [customerAId],
    questions: [
      { question_text: 'Một lựa chọn?', question_type: 'SINGLE_CHOICE', options: ['A', 'B'] },
      { question_text: 'Nhiều lựa chọn?', question_type: 'MULTI_CHOICE', options: ['X', 'Y', 'Z'] },
      { question_text: 'Chấm điểm?', question_type: 'RATING' },
      { question_text: 'Ý kiến?', question_type: 'TEXT' }
    ]
  };

  await test('SV-01', 'Quản lý khảo sát', 'Tạo khảo sát đủ 4 loại câu hỏi', 'HTTP 201; quan hệ DB chính xác', 'P1', async () => {
    const response = await api('POST', '/api/manager/surveys', managerToken, validSurvey);
    expect(response.status === 201, `HTTP ${response.status}: ${response.data?.error || ''}`);
    validSurveyId = response.data.id;
    const detail = await api('GET', `/api/manager/surveys/${validSurveyId}`, managerToken);
    validQuestions = detail.data.questions;
    expect(validQuestions.length === 4, `questions=${validQuestions.length}`);
    expect(detail.data.target_product_ids.length === 1 && detail.data.recipient_customer_ids.length === 1, 'Sai liên kết sản phẩm/người nhận');
    return `survey=${validSurveyId}; questions=4; recipients=1`;
  });

  await test('SV-02', 'Quản lý khảo sát', 'Tiêu đề chỉ chứa khoảng trắng', 'HTTP 400; không lưu DB', 'P1', async () => {
    const response = await api('POST', '/api/manager/surveys', managerToken, { ...validSurvey, title: '   ' });
    const count = (await query("SELECT COUNT(*) AS n FROM Surveys WHERE title='   '")).recordset[0].n;
    expect(response.status === 400 && count === 0, `HTTP ${response.status}; count=${count}`);
    return 'HTTP 400; count=0';
  });

  await test('SV-03', 'Quản lý khảo sát', 'Khảo sát không có câu hỏi', 'HTTP 400; không lưu DB', 'P1', async () => {
    const title = `${QA_PREFIX}no-questions`;
    const response = await api('POST', '/api/manager/surveys', managerToken, { ...validSurvey, title, questions: [] });
    const count = (await query('SELECT COUNT(*) AS n FROM Surveys WHERE title=@title', { title })).recordset[0].n;
    expect(response.status === 400 && count === 0, `HTTP ${response.status}; count=${count}`);
    return 'HTTP 400; count=0';
  });

  await test('SV-04', 'Quản lý khảo sát', 'Câu lựa chọn không có đáp án', 'HTTP 400; không lưu DB', 'P1', async () => {
    const title = `${QA_PREFIX}no-options`;
    const response = await api('POST', '/api/manager/surveys', managerToken, { ...validSurvey, title, questions: [{ question_text: 'Thiếu đáp án', question_type: 'SINGLE_CHOICE', options: [] }] });
    const count = (await query('SELECT COUNT(*) AS n FROM Surveys WHERE title=@title', { title })).recordset[0].n;
    expect(response.status === 400 && count === 0, `HTTP ${response.status}; count=${count}`);
    return 'HTTP 400; count=0';
  });

  await test('SV-05', 'Quản lý khảo sát', 'Ngày kết thúc trước ngày bắt đầu', 'HTTP 400; không lưu DB', 'P1', async () => {
    const title = `${QA_PREFIX}bad-dates`;
    const response = await api('POST', '/api/manager/surveys', managerToken, { ...validSurvey, title, start_date: '2027-12-31', end_date: '2026-01-01' });
    const count = (await query('SELECT COUNT(*) AS n FROM Surveys WHERE title=@title', { title })).recordset[0].n;
    expect(response.status === 400 && count === 0, `HTTP ${response.status}; count=${count}`);
    return 'HTTP 400; count=0';
  });

  await test('SV-06', 'Quản lý khảo sát', 'Sản phẩm trùng lặp không tạo dữ liệu dở dang', 'HTTP 400; không lưu survey/product link', 'P0', async () => {
    const title = `${QA_PREFIX}duplicate-products`;
    const response = await api('POST', '/api/manager/surveys', managerToken, { ...validSurvey, title, target_product_ids: [productId, productId] });
    const count = (await query('SELECT COUNT(*) AS n FROM Surveys WHERE title=@title', { title })).recordset[0].n;
    expect(response.status === 400 && count === 0, `HTTP ${response.status}; persisted surveys=${count}`);
    return 'HTTP 400; persisted=0';
  });

  await test('SV-07', 'Quản lý khảo sát', 'Phát hành khảo sát', 'HTTP 200; trạng thái ACTIVE', 'P1', async () => {
    const response = await api('POST', `/api/manager/surveys/${validSurveyId}/send`, managerToken, {});
    const row = (await query('SELECT status FROM Surveys WHERE id=@id', { id: validSurveyId })).recordset[0];
    expect(response.status === 200 && row.status === 'ACTIVE', `HTTP ${response.status}; status=${row.status}`);
    return 'ACTIVE';
  });

  await test('SV-08', 'Tham gia khảo sát', 'Gửi đủ 4 loại câu trả lời', 'HTTP 201; DB có 1 result và 4 answer', 'P1', async () => {
    const byType = Object.fromEntries(validQuestions.map(question => [question.question_type, question]));
    const answers = [
      { question_id: byType.SINGLE_CHOICE.id, answer_value: 'A' },
      { question_id: byType.MULTI_CHOICE.id, answer_value: ['X', 'Z'] },
      { question_id: byType.RATING.id, answer_value: 4 },
      { question_id: byType.TEXT.id, answer_value: 'Nội dung Unicode: ổn áp 🌸' }
    ];
    const response = await api('POST', `/api/customer/surveys/${validSurveyId}/submit`, customerAToken, { answers });
    const dbRows = (await query(`SELECT sr.id, (SELECT COUNT(*) FROM SurveyAnswers sa WHERE sa.survey_result_id=sr.id) AS answer_count FROM SurveyResults sr WHERE sr.survey_id=@survey AND sr.customer_id=@customer`, { survey: validSurveyId, customer: customerAId })).recordset;
    expect(response.status === 201 && dbRows.length === 1 && dbRows[0].answer_count === 4, `HTTP ${response.status}; DB=${JSON.stringify(dbRows)}`);
    return 'HTTP 201; results=1; answers=4';
  });

  await test('SV-09', 'Tham gia khảo sát', 'Gửi lại cùng khảo sát', 'HTTP 409; vẫn chỉ 1 result', 'P0', async () => {
    const response = await api('POST', `/api/customer/surveys/${validSurveyId}/submit`, customerAToken, { answers: [] });
    const count = (await query('SELECT COUNT(*) AS n FROM SurveyResults WHERE survey_id=@survey AND customer_id=@customer', { survey: validSurveyId, customer: customerAId })).recordset[0].n;
    expect(response.status === 409 && count === 1, `HTTP ${response.status}; count=${count}`);
    return 'HTTP 409; count=1';
  });

  await test('SV-10', 'Phân tích khảo sát', 'Phân bố multi-choice dùng mẫu số người trả lời', 'X=100%, Z=100%; response rate=100%; rating avg=4.0', 'P1', async () => {
    const response = await api('GET', `/api/manager/surveys/${validSurveyId}/results`, managerToken);
    expect(response.status === 200, `HTTP ${response.status}`);
    const multi = response.data.results.find(item => item.question_type === 'MULTI_CHOICE');
    const x = multi.distribution.find(item => item.label === 'X');
    const z = multi.distribution.find(item => item.label === 'Z');
    expect(x.count === 1 && x.percent === 100 && z.count === 1 && z.percent === 100, `distribution=${JSON.stringify(multi.distribution)}`);
    expect(response.data.stats.response_rate === 100 && Number(response.data.stats.overall_avg_rating) === 4, `stats=${JSON.stringify(response.data.stats)}`);
    return `X=${x.percent}%; Z=${z.percent}%; rate=${response.data.stats.response_rate}%; avg=${response.data.stats.overall_avg_rating}`;
  });

  await test('SV-11', 'Quản lý khảo sát', 'Chỉnh sửa khảo sát đã có phản hồi phải nguyên tử', 'Hoặc cập nhật an toàn, hoặc lỗi 409 và không thay đổi dữ liệu', 'P0', async () => {
    const before = await api('GET', `/api/manager/surveys/${validSurveyId}`, managerToken);
    const response = await api('PUT', `/api/manager/surveys/${validSurveyId}`, managerToken, { ...validSurvey, title: `${QA_PREFIX}updated-after-response`, status: 'ACTIVE' });
    const after = await api('GET', `/api/manager/surveys/${validSurveyId}`, managerToken);
    const safeRejection = response.status === 409 && after.data.title === before.data.title && after.data.questions.length === before.data.questions.length;
    const safeUpdate = response.status === 200 && after.data.questions.length === 4;
    expect(safeRejection || safeUpdate, `HTTP ${response.status}; before=${before.data.title}/${before.data.questions.length}; after=${after.data.title}/${after.data.questions.length}`);
    return safeRejection ? 'HTTP 409; dữ liệu không đổi' : 'HTTP 200; liên kết câu trả lời an toàn';
  });

  await test('SV-12', 'Tham gia khảo sát', 'Không được gửi khảo sát đã đóng', 'HTTP 400/409; không tạo result', 'P0', async () => {
    const title = `${QA_PREFIX}closed`;
    const created = await api('POST', '/api/manager/surveys', managerToken, { ...validSurvey, title, recipient_customer_ids: [customerBId] });
    expect(created.status === 201, `Không tạo được fixture: ${created.status}`);
    await api('PUT', `/api/manager/surveys/${created.data.id}/status`, managerToken, { status: 'CLOSED' });
    const detail = await api('GET', `/api/manager/surveys/${created.data.id}`, managerToken);
    const answer = { question_id: detail.data.questions[0].id, answer_value: 'A' };
    const response = await api('POST', `/api/customer/surveys/${created.data.id}/submit`, customerBToken, { answers: [answer] });
    const count = (await query('SELECT COUNT(*) AS n FROM SurveyResults WHERE survey_id=@survey', { survey: created.data.id })).recordset[0].n;
    expect([400, 409].includes(response.status) && count === 0, `HTTP ${response.status}; count=${count}`);
    return `HTTP ${response.status}; count=0`;
  });

  await test('SV-13', 'Tham gia khảo sát', 'Đáp án ngoài tập lựa chọn', 'HTTP 400; không tạo result', 'P0', async () => {
    const title = `${QA_PREFIX}invalid-choice`;
    const created = await api('POST', '/api/manager/surveys', managerToken, { ...validSurvey, title, recipient_customer_ids: [customerBId] });
    expect(created.status === 201, `Không tạo được fixture: ${created.status}`);
    await api('POST', `/api/manager/surveys/${created.data.id}/send`, managerToken, {});
    const detail = await api('GET', `/api/manager/surveys/${created.data.id}`, managerToken);
    const answers = detail.data.questions.map(question => ({
      question_id: question.id,
      answer_value: question.question_type === 'SINGLE_CHOICE' ? 'KHÔNG_TỒN_TẠI' : question.question_type === 'MULTI_CHOICE' ? ['X'] : question.question_type === 'RATING' ? 4 : 'ok'
    }));
    const response = await api('POST', `/api/customer/surveys/${created.data.id}/submit`, customerBToken, { answers });
    const count = (await query('SELECT COUNT(*) AS n FROM SurveyResults WHERE survey_id=@survey', { survey: created.data.id })).recordset[0].n;
    expect(response.status === 400 && count === 0, `HTTP ${response.status}; count=${count}`);
    return 'HTTP 400; count=0';
  });

  await test('SV-14', 'Tham gia khảo sát', 'Câu trả lời tham chiếu câu hỏi khảo sát khác', 'HTTP 400; không tạo result', 'P0', async () => {
    const title = `${QA_PREFIX}foreign-question`;
    const created = await api('POST', '/api/manager/surveys', managerToken, { ...validSurvey, title, recipient_customer_ids: [customerBId] });
    expect(created.status === 201, `Không tạo được fixture: ${created.status}`);
    await api('POST', `/api/manager/surveys/${created.data.id}/send`, managerToken, {});
    const response = await api('POST', `/api/customer/surveys/${created.data.id}/submit`, customerBToken, { answers: [{ question_id: validQuestions[0].id, answer_value: 'A' }] });
    const count = (await query('SELECT COUNT(*) AS n FROM SurveyResults WHERE survey_id=@survey', { survey: created.data.id })).recordset[0].n;
    expect(response.status === 400 && count === 0, `HTTP ${response.status}; count=${count}`);
    return 'HTTP 400; count=0';
  });

  await test('SV-15', 'Tham gia khảo sát', 'Khảo sát chưa đến ngày bắt đầu', 'Không xuất hiện trong danh sách; submit HTTP 400; không tạo result', 'P1', async () => {
    const title = `${QA_PREFIX}future`;
    const created = await api('POST', '/api/manager/surveys', managerToken, { ...validSurvey, title, start_date: '2099-01-01', end_date: '2099-12-31', recipient_customer_ids: [customerBId] });
    expect(created.status === 201, `Không tạo được fixture: ${created.status}`);
    await api('POST', `/api/manager/surveys/${created.data.id}/send`, managerToken, {});
    const customerList = await api('GET', '/api/customer/surveys', customerBToken);
    const detail = await api('GET', `/api/manager/surveys/${created.data.id}`, managerToken);
    const response = await api('POST', `/api/customer/surveys/${created.data.id}/submit`, customerBToken, { answers: [{ question_id: detail.data.questions[0].id, answer_value: 'A' }] });
    const count = (await query('SELECT COUNT(*) AS n FROM SurveyResults WHERE survey_id=@survey', { survey: created.data.id })).recordset[0].n;
    expect(!customerList.data.some(item => Number(item.id) === Number(created.data.id)) && response.status === 400 && count === 0, `listed=${customerList.data.some(item => Number(item.id) === Number(created.data.id))}; HTTP ${response.status}; count=${count}`);
    return 'Không hiển thị; HTTP 400; count=0';
  });

  await test('SV-16', 'Phân quyền khảo sát', 'Khách hàng không thuộc danh sách người nhận', 'HTTP 403; không tạo result', 'P0', async () => {
    const title = `${QA_PREFIX}unassigned`;
    const created = await api('POST', '/api/manager/surveys', managerToken, { ...validSurvey, title, recipient_customer_ids: [customerAId] });
    await api('POST', `/api/manager/surveys/${created.data.id}/send`, managerToken, {});
    const detail = await api('GET', `/api/manager/surveys/${created.data.id}`, managerToken);
    const response = await api('POST', `/api/customer/surveys/${created.data.id}/submit`, customerBToken, { answers: [{ question_id: detail.data.questions[0].id, answer_value: 'A' }] });
    const count = (await query('SELECT COUNT(*) AS n FROM SurveyResults WHERE survey_id=@survey', { survey: created.data.id })).recordset[0].n;
    expect(response.status === 403 && count === 0, `HTTP ${response.status}; count=${count}`);
    return 'HTTP 403; count=0';
  });

  await test('SV-17', 'Quản lý khảo sát', 'Cập nhật trạng thái không hợp lệ', 'HTTP 400; trạng thái DB không đổi', 'P1', async () => {
    const before = (await query('SELECT status FROM Surveys WHERE id=@id', { id: validSurveyId })).recordset[0].status;
    const response = await api('PUT', `/api/manager/surveys/${validSurveyId}/status`, managerToken, { status: 'INVALID' });
    const after = (await query('SELECT status FROM Surveys WHERE id=@id', { id: validSurveyId })).recordset[0].status;
    expect(response.status === 400 && before === after, `HTTP ${response.status}; before=${before}; after=${after}`);
    return `HTTP 400; status=${after}`;
  });

  await test('SV-18', 'Quản lý khảo sát', 'Đổi người nhận sau khi đã có phản hồi', 'HTTP 409; danh sách người nhận không đổi', 'P0', async () => {
    const before = (await query('SELECT COUNT(*) AS n FROM SurveyRecipients WHERE survey_id=@id', { id: validSurveyId })).recordset[0].n;
    const response = await api('PUT', `/api/manager/surveys/${validSurveyId}/recipients`, managerToken, { customer_ids: [] });
    const after = (await query('SELECT COUNT(*) AS n FROM SurveyRecipients WHERE survey_id=@id', { id: validSurveyId })).recordset[0].n;
    expect(response.status === 409 && before === after, `HTTP ${response.status}; before=${before}; after=${after}`);
    return `HTTP 409; recipients=${after}`;
  });

  await test('SV-19', 'Tham gia khảo sát', 'Nộp khảo sát thiếu câu hỏi bắt buộc (is_required = 1)', 'HTTP 400; thông báo lỗi chỉ rõ câu hỏi bắt buộc', 'P1', async () => {
    const createRes = await api('POST', '/api/manager/surveys', managerToken, {
      title: `${QA_PREFIX}required-survey`,
      target_product_ids: [productId],
      recipient_customer_ids: [customerBId],
      questions: [
        { question_text: 'Câu 1 bắt buộc', question_type: 'TEXT', is_required: true },
        { question_text: 'Câu 2 tùy chọn', question_type: 'TEXT', is_required: false }
      ]
    });
    expect(createRes.status === 201, `Create survey HTTP ${createRes.status}`);
    const sId = createRes.data.id;
    await api('PUT', `/api/manager/surveys/${sId}/status`, managerToken, { status: 'ACTIVE' });

    const surveyData = (await api('GET', `/api/customer/surveys/${sId}`, customerBToken)).data;
    const qOptional = surveyData.questions.find(q => q.question_text === 'Câu 2 tùy chọn');

    const submitRes = await api('POST', `/api/customer/surveys/${sId}/submit`, customerBToken, {
      answers: [
        { question_id: qOptional.id, answer_value: 'Nội dung tùy chọn' }
      ]
    });
    expect(submitRes.status === 400 && submitRes.data?.error?.includes('bắt buộc'), `HTTP ${submitRes.status}; error=${submitRes.data?.error}`);
    return `HTTP 400: ${submitRes.data?.error}`;
  });

  await test('SV-20', 'Tham gia khảo sát', 'Nộp khảo sát bỏ qua câu hỏi không bắt buộc (is_required = 0)', 'HTTP 201; nộp thành công chỉ với câu bắt buộc', 'P1', async () => {
    const surveyRow = (await query(`SELECT id FROM Surveys WHERE title='${QA_PREFIX}required-survey'`)).recordset[0];
    const sId = surveyRow.id;
    const surveyData = (await api('GET', `/api/customer/surveys/${sId}`, customerBToken)).data;
    const qRequired = surveyData.questions.find(q => q.question_text === 'Câu 1 bắt buộc');

    const submitRes = await api('POST', `/api/customer/surveys/${sId}/submit`, customerBToken, {
      answers: [
        { question_id: qRequired.id, answer_value: 'Nội dung trả lời câu bắt buộc' }
      ]
    });
    expect(submitRes.status === 201, `HTTP ${submitRes.status}; msg=${submitRes.data?.message}`);

    const count = (await query('SELECT COUNT(*) AS n FROM SurveyResults WHERE survey_id=@id AND customer_id=@customer', { id: sId, customer: customerBId })).recordset[0].n;
    expect(count === 1, `DB Result count=${count}`);
    return `HTTP 201; submit thành công khi bỏ qua câu hỏi không bắt buộc`;
  });

  await test('SV-21', 'Quản lý khảo sát', 'Reorder thứ tự câu hỏi qua PUT khảo sát', 'HTTP 200; thứ tự và order_index cập nhật chuẩn xác', 'P1', async () => {
    const createRes = await api('POST', '/api/manager/surveys', managerToken, {
      title: `${QA_PREFIX}reorder-survey`,
      target_product_ids: [productId],
      recipient_customer_ids: [customerAId],
      questions: [
        { question_text: 'Câu Thứ Nhất', question_type: 'TEXT' },
        { question_text: 'Câu Thứ Hai', question_type: 'TEXT' },
        { question_text: 'Câu Thứ Ba', question_type: 'TEXT' }
      ]
    });
    expect(createRes.status === 201, `Create survey HTTP ${createRes.status}`);
    const sId = createRes.data.id;

    const updateRes = await api('PUT', `/api/manager/surveys/${sId}`, managerToken, {
      title: `${QA_PREFIX}reorder-survey`,
      target_product_ids: [productId],
      questions: [
        { question_text: 'Câu Thứ Ba', question_type: 'TEXT' },
        { question_text: 'Câu Thứ Nhất', question_type: 'TEXT' },
        { question_text: 'Câu Thứ Hai', question_type: 'TEXT' }
      ]
    });
    expect(updateRes.status === 200, `Update survey HTTP ${updateRes.status}`);

    const getRes = await api('GET', `/api/manager/surveys/${sId}`, managerToken);
    expect(getRes.status === 200, `Get survey HTTP ${getRes.status}`);
    const reorderedQuestions = getRes.data.questions;
    expect(reorderedQuestions.length === 3, `Count=${reorderedQuestions.length}`);
    expect(reorderedQuestions[0].question_text === 'Câu Thứ Ba' && reorderedQuestions[0].order_index === 1, `Q0=${JSON.stringify(reorderedQuestions[0])}`);
    expect(reorderedQuestions[1].question_text === 'Câu Thứ Nhất' && reorderedQuestions[1].order_index === 2, `Q1=${JSON.stringify(reorderedQuestions[1])}`);
    expect(reorderedQuestions[2].question_text === 'Câu Thứ Hai' && reorderedQuestions[2].order_index === 3, `Q2=${JSON.stringify(reorderedQuestions[2])}`);

    return `HTTP 200; thứ tự mới: [${reorderedQuestions.map(q => q.question_text).join(' -> ')}]`;
  });

  await test('AN-01', 'Dashboard', 'Bộ lọc thời gian tương lai tác động KPI', 'Tổng feedback và phản hồi khảo sát bằng 0', 'P1', async () => {
    const response = await api('GET', '/api/manager/analytics?from=2099-01-01&to=2099-12-31', managerToken);
    expect(response.status === 200, `HTTP ${response.status}`);
    expect(Number(response.data.stats.totalFeedbacks) === 0 && Number(response.data.stats.totalSurveyResponses) === 0, `stats=${JSON.stringify(response.data.stats)}`);
    return 'totalFeedbacks=0; totalSurveyResponses=0';
  });

  await test('AN-02', 'Dashboard', 'Đối chiếu tổng biểu đồ với dữ liệu DB', 'Tổng tuổi/da/giới tính/phân bố sao khớp truy vấn gốc', 'P1', async () => {
    const response = await api('GET', '/api/manager/analytics', managerToken);
    const dbCounts = (await query(`
      SELECT COUNT(*) AS customers, SUM(CASE WHEN age IS NOT NULL THEN 1 ELSE 0 END) AS ages,
        SUM(CASE WHEN skin_type IS NOT NULL THEN 1 ELSE 0 END) AS skins,
        SUM(CASE WHEN gender IS NOT NULL THEN 1 ELSE 0 END) AS genders FROM Customers;
      SELECT COUNT(*) AS feedbacks FROM Feedbacks;
    `)).recordsets;
    const sums = {
      ages: response.data.ageGroups.reduce((sum, item) => sum + Number(item.count), 0),
      skins: response.data.skinTypes.reduce((sum, item) => sum + Number(item.count), 0),
      genders: response.data.genderGroups.reduce((sum, item) => sum + Number(item.count), 0),
      ratings: response.data.stats.ratingDistribution.reduce((sum, item) => sum + Number(item.count), 0)
    };
    const expected = { ...dbCounts[0][0], feedbacks: dbCounts[1][0].feedbacks };
    expect(Number(response.data.stats.totalCustomers) === Number(expected.customers) && sums.ages === Number(expected.ages) && sums.skins === Number(expected.skins) && sums.genders === Number(expected.genders) && sums.ratings === Number(expected.feedbacks), `API=${JSON.stringify(sums)}; DB=${JSON.stringify(expected)}`);
    return `customers=${expected.customers}; ages=${sums.ages}; skins=${sums.skins}; genders=${sums.genders}; ratings=${sums.ratings}`;
  });

  await test('AN-03', 'Xuất báo cáo', 'Xuất CSV đánh giá theo khoảng thời gian', 'HTTP 200, content-type CSV, có BOM và tiêu đề', 'P2', async () => {
    const response = await fetch(`${BASE_URL}/api/manager/analytics/export?type=feedbacks&from=2020-01-01&to=2090-12-31`, { headers: { Authorization: `Bearer ${managerToken}` } });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const hasBom = bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
    const csv = new TextDecoder('utf-8').decode(bytes);
    expect(response.status === 200 && response.headers.get('content-type')?.includes('text/csv') && hasBom && csv.includes('Khách hàng') && csv.includes('Sản phẩm'), `HTTP ${response.status}; content-type=${response.headers.get('content-type')}; BOM=${hasBom}; prefix=${JSON.stringify(csv.slice(0, 40))}`);
    return `HTTP 200; ${csv.split('\n').length - 1} dòng dữ liệu`;
  });

  await test('AN-04', 'Dashboard', 'Khoảng ngày đảo ngược', 'HTTP 400 với thông báo rõ ràng', 'P1', async () => {
    const response = await api('GET', '/api/manager/analytics?from=2027-01-01&to=2026-01-01', managerToken);
    expect(response.status === 400 && response.data?.error, `HTTP ${response.status}; ${JSON.stringify(response.data)}`);
    return `HTTP 400: ${response.data.error}`;
  });

  await test('AN-05', 'Phân tích khảo sát', 'Lọc chiến dịch theo ngày bắt đầu khảo sát', 'Danh sách API khớp start_date trong khoảng; không dùng created_at', 'P1', async () => {
    const from = '2026-01-01';
    const to = '2026-12-31';
    const response = await api('GET', `/api/manager/analytics?from=${from}&to=${to}`, managerToken);
    const expectedIds = (await query(`
      SELECT id FROM Surveys
      WHERE COALESCE(start_date, CAST(created_at AS DATE)) >= @from
        AND COALESCE(start_date, CAST(created_at AS DATE)) <= @to
      ORDER BY id
    `, { from, to })).recordset.map(row => Number(row.id));
    const actualIds = (response.data?.surveyOverview || []).map(row => Number(row.id)).sort((a, b) => a - b);
    expect(response.status === 200 && JSON.stringify(actualIds) === JSON.stringify(expectedIds), `HTTP ${response.status}; API=${actualIds}; DB=${expectedIds}`);
    expect(actualIds.includes(Number(validSurveyId)), `Thiếu khảo sát hợp lệ ${validSurveyId}`);
    return `${actualIds.length} khảo sát; start_date nằm trong ${from}..${to}`;
  });

  await test('AN-06', 'Dashboard & Analytics', 'Tính median rating, xu hướng theo tháng và phân loại danh mục', 'stats.medianRating hợp lệ, ratingTrendByMonth và productCategories đầy đủ', 'P1', async () => {
    const response = await api('GET', '/api/manager/analytics', managerToken);
    expect(response.status === 200, `HTTP ${response.status}`);
    const { stats, ratingTrendByMonth, productCategories, feedbackByProduct } = response.data;

    expect(stats.medianRating !== undefined, `stats.medianRating undefined`);
    expect(Array.isArray(ratingTrendByMonth), `ratingTrendByMonth is not array`);
    expect(Array.isArray(productCategories), `productCategories is not array`);
    expect(feedbackByProduct.some(p => p.category !== undefined), `p.category missing in feedbackByProduct`);

    return `medianRating=${stats.medianRating}; trends=${ratingTrendByMonth.length} months; categories=[${productCategories.join(', ')}]`;
  });

  console.table(results);
  const summary = results.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, { PASS: 0, FAIL: 0 });
  console.log('E2E_SUMMARY=' + JSON.stringify({ total: results.length, ...summary }));
  console.log('E2E_RESULTS=' + JSON.stringify(results));
  if (summary.FAIL) process.exitCode = 1;
}

run()
  .catch(error => {
    console.error('E2E_FATAL=' + (error.stack || error.message));
    process.exitCode = 2;
  })
  .finally(async () => {
    if (pool) await pool.promises.close();
  });
