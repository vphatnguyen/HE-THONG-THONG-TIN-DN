const { assertTestEnvironment } = require('./test-safety');
const { chromium } = require('playwright-core');
const sql = require('msnodesqlv8');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3100';
const EDGE_PATH = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DB_SERVER = process.env.DB_SERVER || '.\\SQLEXPRESS';
const DB_DATABASE = process.env.DB_DATABASE || 'CosmeticsCRM_E2E_DB';
const ARTIFACT_DIR = path.join(__dirname, 'artifacts');
const results = [];

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(id, scenario, expected, fn) {
  console.log(`UI_TEST_START ${id}`);
  try {
    const actual = await fn();
    results.push({ id, scenario, expected, actual, status: 'PASS' });
    console.log(`UI_TEST_PASS ${id}: ${actual}`);
  } catch (error) {
    results.push({ id, scenario, expected, actual: error.message, status: 'FAIL' });
    console.log(`UI_TEST_FAIL ${id}: ${error.message}`);
  }
}

async function request(method, route, token, body) {
  const response = await fetch(BASE_URL + route, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}

async function dbQuery(connection, statement, params = []) {
  const result = await connection.promises.query(statement, params);
  return result.first || [];
}

async function run() {
  await assertTestEnvironment(BASE_URL, DB_DATABASE);
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const pool = await sql.promises.open(`Driver={ODBC Driver 18 for SQL Server};Server=${DB_SERVER};Database=${DB_DATABASE};Trusted_Connection=yes;TrustServerCertificate=yes;`);
  const qaCustomer = (await dbQuery(pool, "SELECT c.id FROM Customers c JOIN Accounts a ON a.id=c.account_id WHERE a.username='qa_e2e_customer_a'"))[0];
  expect(qaCustomer, 'Thiếu fixture qa_e2e_customer_a; hãy chạy tests/e2e-system.js trước');

  await dbQuery(pool, `
    DELETE FROM FeedbackReplyHistory WHERE feedback_id IN (SELECT f.id FROM Feedbacks f JOIN Customers c ON c.id=f.customer_id JOIN Accounts a ON a.id=c.account_id WHERE a.username LIKE 'qa_e2e_%');
    DELETE FROM SurveyAnswers WHERE survey_result_id IN (SELECT id FROM SurveyResults WHERE survey_id IN (SELECT id FROM Surveys WHERE title='qa_e2e_ui_survey'));
    DELETE FROM SurveyResults WHERE survey_id IN (SELECT id FROM Surveys WHERE title='qa_e2e_ui_survey');
    DELETE FROM SurveyRecipients WHERE survey_id IN (SELECT id FROM Surveys WHERE title='qa_e2e_ui_survey');
    DELETE FROM SurveyProducts WHERE survey_id IN (SELECT id FROM Surveys WHERE title='qa_e2e_ui_survey');
    DELETE FROM Questions WHERE survey_id IN (SELECT id FROM Surveys WHERE title='qa_e2e_ui_survey');
    DELETE FROM Surveys WHERE title='qa_e2e_ui_survey';
    IF OBJECT_ID('dbo.FeedbackAuditLog', 'U') IS NOT NULL DELETE FROM FeedbackAuditLog WHERE feedback_id IN (SELECT id FROM Feedbacks WHERE product_id IN (SELECT id FROM Products WHERE name='qa_e2e_ui_product'));
    DELETE FROM Feedbacks WHERE product_id IN (SELECT id FROM Products WHERE name='qa_e2e_ui_product');
    DELETE FROM Products WHERE name='qa_e2e_ui_product';
    INSERT INTO Products(name,category,price,launch_status) VALUES(N'qa_e2e_ui_product',N'Test UI',123000,'OFFICIAL');
  `);
  const uiProduct = (await dbQuery(pool, "SELECT id FROM Products WHERE name='qa_e2e_ui_product'"))[0];

  const managerLogin = await request('POST', '/api/auth/login', null, { username: 'qa_e2e_manager', password: 'manager-pass' });
  expect(managerLogin.status === 200, 'Không đăng nhập được manager fixture');
  const surveyCreate = await request('POST', '/api/manager/surveys', managerLogin.data.token, {
    title: 'qa_e2e_ui_survey',
    description: 'Kiểm thử giao diện khảo sát',
    target_product_ids: [uiProduct.id],
    start_date: '2026-01-01',
    end_date: '2027-12-31',
    recipient_customer_ids: [qaCustomer.id],
    questions: [
      { question_text: 'UI một lựa chọn', question_type: 'SINGLE_CHOICE', options: ['Đồng ý', 'Không đồng ý'] },
      { question_text: 'UI nhiều lựa chọn', question_type: 'MULTI_CHOICE', options: ['Mùi hương', 'Bao bì', 'Giá'] },
      { question_text: 'UI chấm điểm', question_type: 'RATING' },
      { question_text: 'UI ý kiến', question_type: 'TEXT' }
    ]
  });
  expect(surveyCreate.status === 201, `Không tạo được khảo sát UI: HTTP ${surveyCreate.status}`);
  const surveyId = surveyCreate.data.id;
  const sent = await request('POST', `/api/manager/surveys/${surveyId}/send`, managerLogin.data.token, {});
  expect(sent.status === 200, `Không phát hành được khảo sát UI: HTTP ${sent.status}`);
  const surveyDetail = await request('GET', `/api/manager/surveys/${surveyId}`, managerLogin.data.token);
  const questionByType = Object.fromEntries(surveyDetail.data.questions.map(question => [question.question_type, question]));

  const browser = await chromium.launch({ executablePath: EDGE_PATH, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(15000);
  const consoleErrors = [];
  const requestFailures = [];
  const httpErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', requestItem => requestFailures.push(`${requestItem.method()} ${requestItem.url()}: ${requestItem.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`); });

  async function login(username, password) {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.locator('#login-username').fill(username);
    await page.locator('#login-password').fill(password);
    await page.locator('#login-form button[type="submit"]').click();
    await page.locator('#app:not(.hidden)').waitFor();
  }

  await test('UI-01', 'Đăng nhập Manager và render Dashboard', 'Dashboard hiển thị các canvas có Chart.js instance (gồm biểu đồ xu hướng mới)', async () => {
    await login('manager1', 'manager123');
    await page.locator('#chart-ratings').waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.chart-card canvas').length >= 8 && [...document.querySelectorAll('.chart-card canvas')].every(canvas => window.Chart?.getChart(canvas)));
    const chartInfo = await page.evaluate(() => [...document.querySelectorAll('.chart-card canvas')].map(canvas => ({ id: canvas.id, width: canvas.width, height: canvas.height, type: Chart.getChart(canvas)?.config.type })));
    expect(chartInfo.length >= 8 && chartInfo.every(chart => chart.width > 0 && chart.height > 0), JSON.stringify(chartInfo));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'dashboard-desktop.png'), fullPage: true });
    return chartInfo.map(chart => `${chart.id}:${chart.type}`).join(', ');
  });

  await test('UI-02', 'Bộ lọc thời gian Dashboard', 'Khoảng năm 2099 cập nhật KPI về 0 và biểu đồ vẫn render', async () => {
    await page.locator('#analytics-from').fill('01/01/2099');
    await page.locator('#analytics-to').fill('31/12/2099');
    const inputValues = await page.evaluate(() => ({ from: document.querySelector('#analytics-from').value, to: document.querySelector('#analytics-to').value }));
    const [response] = await Promise.all([
      page.waitForResponse(item => item.url().includes('/api/manager/analytics') && item.request().method() === 'GET'),
      page.locator('button[onclick="renderManagerDashboard()"]', { hasText: 'Áp dụng' }).click()
    ]);
    const payload = await response.json();
    await page.locator('.stat-card .stat-value').first().waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('.chart-card canvas')].every(canvas => window.Chart?.getChart(canvas)));
    const displayed = (await page.locator('.stat-card .stat-value').first().textContent()).trim();
    expect(Number(payload.stats.totalCustomers) === 0 && displayed === '0', `inputs=${JSON.stringify(inputValues)}; URL=${response.url()}; API=${payload.stats.totalCustomers}; UI=${displayed}`);
    return `URL=${response.url()}; Tổng khách hàng=0; 8/8 biểu đồ render lại`;
  });

  await test('UI-03', 'Trang Phân tích CRM sau khi chuyển biểu đồ', 'Không còn 2 biểu đồ sở thích; bảng sản phẩm và khảo sát vẫn có', async () => {
    await page.locator('#nav-manager-analytics').click();
    await page.getByText('Xếp hạng & Phân tích sản phẩm theo phản hồi').waitFor();
    const preferenceCanvases = await page.locator('#chart-pref-age, #chart-pref-skin').count();
    expect(preferenceCanvases === 0, `Còn ${preferenceCanvases} canvas sở thích`);
    expect(await page.locator('#analytics-products-tbody').count() === 1 && await page.locator('#analytics-surveys-tbody').count() === 1, 'Thiếu bảng phân tích');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'analytics-desktop.png'), fullPage: true });
    return 'Không trùng biểu đồ; 2 bảng dữ liệu hiện diện';
  });

  await test('UI-04', 'Bộ lọc khách hàng khi tạo khảo sát', 'Lọc đúng loại da/sở thích, giữ lựa chọn và cập nhật bộ đếm', async () => {
    await page.locator('#nav-manager-surveys').click();
    await page.getByRole('button', { name: /Tạo khảo sát mới/ }).click();
    await page.locator('#sv-recipient-skin').selectOption('Da dầu');
    const skinState = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.sv-recipient-item')];
      return {
        expected: items.filter(item => item.dataset.skin === 'Da dầu').length,
        visible: items.filter(item => !item.classList.contains('hidden')).length,
        checked: items.filter(item => item.querySelector('input').checked).length,
        mismatched: items.filter(item => !item.classList.contains('hidden') && item.dataset.skin !== 'Da dầu').length,
        counter: Number(document.querySelector('#sv-recipient-count')?.textContent)
      };
    });
    expect(skinState.expected > 0 && skinState.expected === skinState.visible && skinState.checked === skinState.counter && skinState.mismatched === 0, `skin=${JSON.stringify(skinState)}`);

    await page.locator('#sv-recipient-skin').selectOption('');
    await page.locator('#sv-recipient-pref').selectOption('Trị mụn');
    const prefState = await page.evaluate(() => {
      const target = 'trị mụn';
      const items = [...document.querySelectorAll('.sv-recipient-item')];
      const matches = item => (item.dataset.prefs || '').split(',').map(value => value.trim().toLocaleLowerCase('vi')).includes(target);
      return {
        expected: items.filter(matches).length,
        visible: items.filter(item => !item.classList.contains('hidden')).length,
        checked: items.filter(item => item.querySelector('input').checked).length,
        mismatched: items.filter(item => !item.classList.contains('hidden') && !matches(item)).length,
        counter: Number(document.querySelector('#sv-recipient-count')?.textContent)
      };
    });
    await page.evaluate(() => closeModal());
    expect(prefState.expected > 0 && prefState.expected === prefState.visible && prefState.checked === prefState.counter && prefState.mismatched === 0, `pref=${JSON.stringify(prefState)}`);
    return `Hiển thị Da dầu=${skinState.visible}; Trị mụn=${prefState.visible}; tổng đã chọn=${prefState.checked}; bộ đếm chính xác`;
  });

  await test('UI-05', 'Dashboard trên màn hình di động', 'Không tràn ngang viewport; nội dung/biểu đồ vẫn hiện', async () => {
    await page.locator('#nav-manager-dashboard').click();
    await page.locator('#chart-ratings').waitFor();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      charts: document.querySelectorAll('.chart-card canvas').length,
      overflowing: [...document.querySelectorAll('body *')]
        .filter(element => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
        .slice(0, 12)
        .map(element => ({ tag: element.tagName, id: element.id, className: String(element.className).slice(0, 80), left: Math.round(element.getBoundingClientRect().left), right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width) })),
      chain: (() => {
        const items = [];
        let element = document.querySelector('.chart-card');
        while (element) {
          const rect = element.getBoundingClientRect();
          items.push({ tag: element.tagName, id: element.id, className: String(element.className).slice(0, 80), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), padding: getComputedStyle(element).padding, margin: getComputedStyle(element).margin });
          element = element.parentElement;
        }
        return items;
      })()
    }));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'dashboard-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    expect(dimensions.scrollWidth <= dimensions.clientWidth + 1 && dimensions.charts >= 8, JSON.stringify(dimensions));
    return JSON.stringify(dimensions);
  });

  await page.evaluate(() => logout());

  await test('UI-06', 'Gửi đánh giá sản phẩm qua giao diện', 'Toast thành công, DB lưu đúng và dữ liệu còn sau reload', async () => {
    await login('qa_e2e_customer_a', 'customer-pass');
    await page.locator('#nav-customer-feedback').click();
    await page.getByRole('button', { name: /Gửi đánh giá mới/ }).click();
    await page.locator('#fb-product').selectOption(String(uiProduct.id));
    await page.locator('#fb-star-5').click();
    const content = 'Đánh giá qua giao diện E2E – rất tốt 🌸';
    await page.locator('#fb-content').fill(content);
    await page.locator('#modal-body').getByRole('button', { name: /Gửi đánh giá/ }).click();
    await page.locator('.toast.success').filter({ hasText: 'Cảm ơn bạn đã gửi đánh giá' }).waitFor();
    const row = (await dbQuery(pool, 'SELECT rating,content FROM Feedbacks WHERE product_id=? AND customer_id=?', [uiProduct.id, qaCustomer.id]))[0];
    expect(row?.rating === 5 && row?.content === content, `DB=${JSON.stringify(row)}`);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#nav-customer-feedback').click();
    await page.locator('#customer-feedback-list tbody tr').filter({hasText:'qa_e2e_ui_product'}).click();
    await page.locator('#modal-body').getByText(content,{exact:true}).waitFor();
    await page.locator('.modal-close').click();
    return `DB rating=${row.rating}; nội dung tồn tại sau reload`;
  });

  await test('UI-07', 'Validation và gửi khảo sát qua giao diện', 'Bài trống bị chặn; bài hợp lệ lưu 4 đáp án và hiển thị đã hoàn thành', async () => {
    await page.locator('#nav-customer-surveys').click();
    const card = page.locator('#customer-survey-list tbody tr').filter({ hasText: 'qa_e2e_ui_survey' });
    await card.getByRole('button', { name: /Làm khảo sát/ }).click();
    const expectedConsoleStart = consoleErrors.length;
    const expectedHttpStart = httpErrors.length;
    await page.locator('#modal-body').getByRole('button', { name: /Nộp khảo sát/ }).click();
    await page.locator('.toast.error').filter({ hasText: 'Vui lòng trả lời ít nhất một câu hỏi' }).waitFor();
    expect(await page.locator('#modal-overlay:not(.hidden)').count() === 1, 'Modal bị đóng sau lỗi validation');
    consoleErrors.splice(expectedConsoleStart);
    httpErrors.splice(expectedHttpStart);

    await page.locator(`input[name="q${questionByType.SINGLE_CHOICE.id}"][value="Đồng ý"]`).check();
    await page.locator(`input[name="q${questionByType.MULTI_CHOICE.id}"][value="Mùi hương"]`).check();
    await page.locator(`#survey-star-${questionByType.RATING.id}-4`).click();
    await page.locator(`textarea[name="q${questionByType.TEXT.id}"]`).fill('Ý kiến UI Unicode: hài lòng 🌸');
    await page.locator('#modal-body').getByRole('button', { name: /Nộp khảo sát/ }).click();
    await page.locator('.toast.success').filter({ hasText: 'Nộp khảo sát thành công' }).waitFor();
    const result = (await dbQuery(pool, `SELECT sr.id,(SELECT COUNT(*) FROM SurveyAnswers WHERE survey_result_id=sr.id) AS answer_count FROM SurveyResults sr WHERE survey_id=? AND customer_id=?`, [surveyId, qaCustomer.id]))[0];
    expect(result?.answer_count === 4, `DB=${JSON.stringify(result)}`);
    const completedCard = page.locator('#customer-survey-list tbody tr').filter({ hasText: 'qa_e2e_ui_survey' });
    await completedCard.getByText('Đã hoàn thành').waitFor();
    return `Bài trống: chặn; DB answers=${result.answer_count}; UI=Đã hoàn thành`;
  });

  await test('UI-08', 'Lỗi JavaScript và tài nguyên khi chạy E2E', 'Không có console error hoặc requestfailed', async () => {
    expect(consoleErrors.length === 0 && requestFailures.length === 0 && httpErrors.length === 0, `console=${JSON.stringify(consoleErrors)}; network=${JSON.stringify(requestFailures)}; http=${JSON.stringify(httpErrors)}`);
    return '0 console errors; 0 request failures';
  });

  console.table(results);
  const summary = results.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, { PASS: 0, FAIL: 0 });
  console.log('UI_E2E_SUMMARY=' + JSON.stringify({ total: results.length, ...summary }));
  console.log('UI_E2E_RESULTS=' + JSON.stringify(results));
  await browser.close();
  await pool.promises.close();
  if (summary.FAIL) process.exitCode = 1;
}

run().catch(error => {
  console.error('UI_E2E_FATAL=' + (error.stack || error.message));
  process.exitCode = 2;
});
