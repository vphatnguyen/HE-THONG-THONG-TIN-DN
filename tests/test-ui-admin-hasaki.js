const { chromium } = require('playwright-core');
const EDGE_PATH = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE_URL = 'http://localhost:3000';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  console.log('--- STARTING PLAYWRIGHT UI VERIFICATION: ADMIN & HASAKI ---');
  const browser = await chromium.launch({
    executablePath: EDGE_PATH,
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // ==========================================
    // 1. ADMIN MODULE VERIFICATION
    // ==========================================
    console.log('\n[1] Logging in as Admin...');
    await page.click('.quick-btn.admin');
    await page.waitForSelector('#sidebar-nav');

    console.log('[2] Navigating to Admin Accounts...');
    await page.click('#nav-admin-accounts');
    await page.waitForSelector('#accounts-tbody');

    // Verify Table Headers
    const headers = await page.$$eval('.table-wrapper thead th', ths => ths.map(th => th.textContent.trim()));
    console.log('   Admin Table Headers:', headers);
    assert(headers[0] === 'ID', 'Header 0 must be ID');
    assert(headers[1] === 'USERNAME', 'Header 1 must be USERNAME');
    assert(headers[2] === 'Họ và tên', 'Header 2 must be Họ và tên');
    assert(headers[8] === 'Hành động', 'Header 8 must be Hành động');

    // Verify first row contains @username and Action buttons
    const firstRowUsername = await page.$eval('#accounts-tbody tr:first-child td:nth-child(2)', el => el.textContent.trim());
    console.log('   First row username:', firstRowUsername);
    assert(firstRowUsername.startsWith('@'), 'Username must start with @');

    // Verify action buttons exist in first row
    const firstRowButtons = await page.$$eval('#accounts-tbody tr:first-child td:nth-child(9) button', btns => btns.map(b => b.textContent.trim()));
    console.log('   First row action buttons:', firstRowButtons);
    assert(firstRowButtons.some(b => b.includes('Sửa')), 'Must have Sửa button');

    // Test Sửa Modal & Password Eye Toggle
    console.log('[3] Testing Edit Modal & Plain Password Toggle...');
    // Click edit on second row (e.g. manager1)
    await page.click('#accounts-tbody tr:nth-child(2) button:has-text("Sửa")');
    await page.waitForSelector('#e-password');

    const passTypeBefore = await page.$eval('#e-password', el => el.type);
    const passValue = await page.$eval('#e-password', el => el.value);
    console.log(`   Initial password input type: ${passTypeBefore}, value: ${passValue}`);
    assert(passTypeBefore === 'password', 'Password input should initially be type="password"');
    assert(passValue.length > 0 && !passValue.startsWith('$2a$'), 'Password value must be plain text, not bcrypt hash');

    // Click Eye button to toggle visibility
    await page.click('#e-password + button');
    const passTypeAfter = await page.$eval('#e-password', el => el.type);
    console.log(`   After clicking eye toggle, input type: ${passTypeAfter}`);
    assert(passTypeAfter === 'text', 'After clicking eye button, input type must be "text"');

    // Close modal
    await page.evaluate(() => closeModal());
    await page.waitForTimeout(300);

    // Verify Admin Accounts Pagination
    const paginationText = await page.textContent('#accounts-pagination .pagination-info');
    console.log('   Admin Accounts Pagination:', paginationText);
    assert(paginationText.includes('10 dòng/trang'), 'Admin Accounts must have 10 rows/page pagination');

    // Logout
    await page.click('.btn-logout');
    await page.waitForSelector('#login-screen');

    // ==========================================
    // 2. CUSTOMER MODULE & HASAKI REVIEWS
    // ==========================================
    console.log('\n[4] Logging in as Customer (khach001)...');
    await page.click('.quick-btn.customer');
    await page.waitForSelector('#cust-home-products-grid');

    // Verify Welcome Banner: note "Hãy cập nhật hồ sơ làm đẹp của bạn!" must be removed
    const bannerText = await page.textContent('#app');
    assert(!bannerText.includes('Hãy cập nhật hồ sơ làm đẹp của bạn!'), 'Must remove "Hãy cập nhật hồ sơ làm đẹp của bạn!"');
    console.log('✓ Verified: Beauty profile update note successfully removed from Welcome banner.');

    // Verify Product Card display (Star rating and review count beside price)
    console.log('[5] Checking Product Cards for Star Rating & Review Count...');
    const firstCardRating = await page.$eval('.product-card:first-child', el => el.innerText);
    console.log('   First product card snippet:\n', firstCardRating.split('\n').slice(0, 6).join('\n'));
    assert(firstCardRating.includes('⭐') || firstCardRating.includes('Chưa có đánh giá'), 'Product card must show average rating or review status');

    // Click on product card to open Hasaki Modal
    console.log('[6] Clicking product card to open Hasaki "Chi tiết & Đánh giá sản phẩm" Modal...');
    await page.click('.product-card:first-child');
    await page.waitForSelector('.hasaki-overview-box');

    // Verify Hasaki 3-column overview box
    console.log('[7] Verifying Hasaki 3-column Overview Box...');
    const overviewText = await page.$eval('.hasaki-overview-box', el => el.innerText);
    console.log('   Hasaki Overview Box snippet:\n', overviewText.slice(0, 180));

    // Verify filter pills
    const pills = await page.$$eval('.hasaki-pill', els => els.map(el => el.textContent.trim()));
    console.log('   Hasaki Star Filter Pills:', pills);
    assert(pills.some(p => p.includes('Tất cả')), 'Must have "Tất cả" filter pill');
    assert(pills.some(p => p.includes('5 ★')), 'Must have "5 ★" filter pill');
    assert(pills.some(p => p.includes('Có phản hồi CSKH')), 'Must have "Có phản hồi CSKH" filter pill');

    // Verify reviews container
    const reviewCards = await page.$$('.hasaki-review-card');
    console.log(`   Rendered review items: ${reviewCards.length}`);
    if (reviewCards.length > 0) {
      const firstReviewText = await page.$eval('.hasaki-review-card:first-child', el => el.innerText);
      console.log('   First review card content snippet:\n', firstReviewText);
      assert(!firstReviewText.includes('✓ Đã mua hàng'), 'Review must NOT display "✓ Đã mua hàng" badge');
    }

    // Test clicking a filter pill
    console.log('[8] Testing click on "5 ★" filter pill...');
    await page.click('.hasaki-pill:has-text("5 ★")');
    await page.waitForTimeout(300);
    const activePill = await page.$eval('.hasaki-pill.active', el => el.textContent.trim());
    console.log('   Active pill after click:', activePill);
    assert(activePill.includes('5 ★'), 'Active pill must be 5 ★');

    // Close modal
    await page.evaluate(() => closeModal());
    await page.waitForTimeout(300);

    // [9] Testing product with existing reviews (Product ID 1)
    console.log('[9] Opening Product #1 (has existing reviews and CSKH responses)...');
    await page.evaluate(() => openProductDetailModal(1));
    await page.waitForSelector('.hasaki-overview-box');

    const p1Reviews = await page.$$('.hasaki-review-card');
    console.log(`   Product #1 reviews count: ${p1Reviews.length}`);
    assert(p1Reviews.length > 0, 'Product #1 must have reviews');

    const p1ReviewSnippet = await page.$eval('.hasaki-review-card:first-child', el => el.innerText);
    console.log('   Product #1 review snippet:\n', p1ReviewSnippet);
    assert(!p1ReviewSnippet.includes('✓ Đã mua hàng'), 'Review must NOT display "✓ Đã mua hàng"');
    assert(p1ReviewSnippet.includes('★'), 'Review must display star rating');

    // Close modal cleanly
    await page.evaluate(() => closeModal());
    await page.waitForTimeout(300);

    console.log('\n======================================================');
    console.log('ALL PLAYWRIGHT UI TESTS PASSED SUCCESSFULLY! ✓');
    console.log('======================================================');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('\n❌ UI TEST FAILED:', err.message);
  process.exit(1);
});
