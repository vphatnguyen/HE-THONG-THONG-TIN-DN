const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const EDGE_PATH = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function run() {
  console.log('--- STARTING VERIFICATION: PAGINATION & REACTIVE LIVE FILTERS ---');
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: EDGE_PATH,
      headless: true
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);

    // ==========================================
    // 1. MANAGER MODULE VERIFICATION
    // ==========================================
    console.log('[1] Logging in as Manager (manager1)...');
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Click demo Manager quick-login button
    await page.click('.quick-btn.manager');
    await page.waitForSelector('#sidebar-user-name');
    console.log('   Logged in successfully.');

    // --- Product Management Pagination & Filters ---
    console.log('[2] Testing Product Management (Manager)...');
    await page.click('#nav-manager-products');
    await page.waitForSelector('#products-tbody tr');

    const prodPaginationText = await page.textContent('#products-pagination .pagination-info');
    console.log('   Product Pagination Info:', prodPaginationText);
    assert(prodPaginationText.includes('10 dòng/trang'), 'Product pagination must state 10 dòng/trang');

    // Check active button color
    const activeBtnStyle = await page.$eval('#products-pagination .pagination-btn.active', el => {
      const computed = window.getComputedStyle(el);
      return { bg: computed.backgroundColor, color: computed.color };
    });
    console.log('   Active pagination button style:', activeBtnStyle);
    assert(activeBtnStyle.bg === 'rgb(33, 78, 52)', 'Active pagination button background must be #214e34 (rgb(33, 78, 52))');

    // Test Live Search (input event, no Lọc button)
    const initialRowsCount = await page.$$eval('#products-tbody tr', rows => rows.length);
    console.log(`   Initial products row count: ${initialRowsCount}`);
    
    // Type search
    await page.fill('#prod-search', 'Son');
    await page.waitForTimeout(300); // debounce
    const filteredRowsCount = await page.$$eval('#products-tbody tr', rows => rows.length);
    console.log(`   Filtered products row count for 'Son': ${filteredRowsCount}`);
    const filteredInfo = await page.textContent('#products-pagination .pagination-info');
    console.log('   Updated Pagination Info after search:', filteredInfo);
    assert(filteredRowsCount > 0 && filteredRowsCount <= initialRowsCount, 'Products should be filtered');

    // Reset filters
    await page.click('button[onclick="resetProductFilters()"]');
    await page.waitForTimeout(300);
    const resetRowsCount = await page.$$eval('#products-tbody tr', rows => rows.length);
    assert(resetRowsCount === initialRowsCount, 'Reset should restore all products');
    console.log('   Product Management passed!');

    // --- Supplier Management Pagination & Filters ---
    console.log('[3] Testing Supplier Management (Manager)...');
    await page.click('#nav-manager-suppliers');
    await page.waitForSelector('#suppliers-tbody tr');

    const supPaginationText = await page.textContent('#suppliers-pagination .pagination-info');
    console.log('   Supplier Pagination Info:', supPaginationText);
    assert(supPaginationText.includes('10 dòng/trang'), 'Supplier pagination must state 10 dòng/trang');

    // Test live search on suppliers
    await page.fill('#sup-search', 'Cosmetic');
    await page.waitForTimeout(300);
    const supFilteredInfo = await page.textContent('#suppliers-pagination .pagination-info');
    console.log('   Supplier filtered pagination info:', supFilteredInfo);

    // Reset
    await page.click('button[onclick="resetSupplierFilters()"]');
    await page.waitForTimeout(300);
    console.log('   Supplier Management passed!');

    // --- Manager Survey & Customer & Feedback Page Sizes ---
    console.log('[4] Testing Manager Surveys, Customers, Feedbacks...');
    await page.click('#nav-manager-surveys');
    await page.waitForSelector('#manager-survey-list');
    const surveyPagInfo = await page.textContent('#manager-survey-pagination .pagination-info');
    console.log('   Manager Survey Pagination Info:', surveyPagInfo);
    assert(surveyPagInfo.includes('10 dòng/trang'), 'Survey pagination must state 10 dòng/trang');

    // --- Manager Customers Columns & Live Filter Verification ---
    await page.click('#nav-manager-customers');
    await page.waitForSelector('#customers-tbody');
    const custPagInfo = await page.textContent('#customers-pagination .pagination-info');
    console.log('   Manager Customer Pagination Info:', custPagInfo);
    assert(custPagInfo.includes('10 dòng/trang'), 'Customer pagination must state 10 dòng/trang');

    // Verify 8 columns in table header
    const headers = await page.$$eval('table thead th', ths => ths.map(t => t.textContent.trim()));
    console.log('   Customer Table Headers:', headers);
    assert(headers.length === 8, `Must have exactly 8 headers, found ${headers.length}`);
    assert(headers[0] === 'Khách hàng', 'Col 1 must be Khách hàng');
    assert(headers[1] === 'Tên tài khoản', 'Col 2 must be Tên tài khoản');
    assert(headers[2] === 'Email', 'Col 3 must be Email');
    assert(headers[3] === 'Số điện thoại', 'Col 4 must be Số điện thoại');
    assert(headers[4] === 'Tương tác CRM', 'Col 5 must be Tương tác CRM');
    assert(headers[5] === 'Trạng thái', 'Col 6 must be Trạng thái');
    assert(headers[6] === 'Ngày tạo TK', 'Col 7 must be Ngày tạo TK');
    assert(headers[7] === 'Hành động', 'Col 8 must be Hành động');

    // Verify deleted columns are gone
    assert(!headers.includes('Độ tuổi'), 'Độ tuổi must be removed from table headers');
    assert(!headers.includes('Loại da'), 'Loại da must be removed from table headers');
    assert(!headers.includes('Sở thích'), 'Sở thích must be removed from table headers');
    assert(!headers.includes('Liên hệ'), 'Liên hệ must be renamed to Email');

    // Verify avatar styling
    const avatarColor = await page.$eval('.customer-avatar', el => {
      const computed = window.getComputedStyle(el);
      return computed.color;
    });
    console.log('   Customer avatar letter color:', avatarColor);
    assert(avatarColor === 'rgb(33, 78, 52)', 'Customer avatar letter color must be #214e34 (rgb(33, 78, 52))');

    // Verify data-skin and data-interest attributes
    const hasDataAttrs = await page.$eval('#customers-tbody tr', row => row.hasAttribute('data-skin') && row.hasAttribute('data-interest'));
    assert(hasDataAttrs, 'Customer table row must retain data-skin and data-interest attributes');

    // Test live search by username (@khach001)
    await page.fill('#cust-search', '@khach001');
    await page.waitForTimeout(300);
    const searchUserCount = await page.$$eval('#customers-tbody tr', rows => rows.length);
    console.log(`   Customers found for search '@khach001': ${searchUserCount}`);
    assert(searchUserCount === 1, 'Search for @khach001 should find exactly 1 customer');

    // Test reset
    await page.click('button:has-text("Đặt lại")');
    await page.waitForTimeout(300);

    await page.click('#nav-manager-feedbacks');
    await page.waitForSelector('#feedback-list-container');
    const fbPagInfo = await page.textContent('#feedback-pagination .pagination-info');
    console.log('   Manager Feedback Pagination Info:', fbPagInfo);
    assert(fbPagInfo.includes('10 dòng/trang'), 'Feedback pagination must state 10 dòng/trang');

    // Logout
    await page.click('.btn-logout');
    await page.waitForSelector('#login-screen');

    // ==========================================
    // 2. CUSTOMER MODULE VERIFICATION
    // ==========================================
    console.log('[5] Logging in as Customer (khach001)...');
    await page.click('.quick-btn.customer');
    await page.waitForSelector('#sidebar-user-name');
    console.log('   Customer logged in successfully.');

    // --- Customer Home ---
    console.log('[6] Testing Customer Home Products Grid, Live Search & Filters...');
    await page.waitForSelector('#cust-home-products-grid');

    // Ensure NO "Lọc" button
    const homeFilterButtons = await page.$$eval('.filter-bar button', btns => btns.map(b => b.textContent.trim()));
    console.log('   Filter bar buttons on Customer Home:', homeFilterButtons);
    assert(!homeFilterButtons.some(t => t.includes('Lọc')), 'Must NOT have a "Lọc" button on Customer Home');
    assert(homeFilterButtons.some(t => t.includes('Đặt lại')), 'Must have a "↺ Đặt lại" button');

    // Verify pagination
    const homePagText = await page.textContent('#cust-home-products-pagination .pagination-info');
    console.log('   Customer Home Pagination Info:', homePagText);
    assert(homePagText.includes('12 dòng/trang'), 'Customer home products grid pagination must be 12 items/page');

    // Live search on customer home
    await page.fill('#cust-home-search', 'Son');
    await page.waitForTimeout(300);
    const searchCards = await page.$$eval('#cust-home-products-grid .product-card', cards => cards.length);
    console.log(`   Customer products matching 'Son': ${searchCards}`);
    assert(searchCards > 0, 'Customer search should find items');

    // Test Status dropdown (Ngừng kinh doanh)
    await page.fill('#cust-home-search', '');
    await page.selectOption('#cust-home-status', 'UPCOMING');
    await page.waitForTimeout(300);
    const upcomingCount = await page.$$eval('#cust-home-products-grid .product-card', cards => cards.length);
    console.log(`   Discontinued products displayed: ${upcomingCount}`);
    if (upcomingCount > 0) {
      const hasDiscontinuedBadge = await page.$eval('#cust-home-products-grid .product-card', el => el.textContent.includes('Ngừng kinh doanh'));
      assert(hasDiscontinuedBadge, 'Discontinued product must display "Ngừng kinh doanh" badge');
    }

    // Reset button
    await page.click('button:has-text("Đặt lại")');
    await page.waitForTimeout(300);
    const resetPagText = await page.textContent('#cust-home-products-pagination .pagination-info');
    console.log('   Customer Home restored pagination info:', resetPagText);

    // --- Customer Surveys ---
    console.log('[7] Testing Customer Surveys Search, Quick Filter Pills & Pagination...');
    await page.click('#nav-customer-surveys');
    await page.waitForSelector('#customer-survey-list');

    // Verify quick filter pills
    const pillTexts = await page.$$eval('#cust-survey-pills-group .filter-pill', pills => pills.map(p => p.textContent.trim()));
    console.log('   Customer survey filter pills:', pillTexts);
    assert(pillTexts.length === 4, 'Must have 4 Quick Filter Pills');
    assert(pillTexts.some(p => p.includes('Tất cả')), 'Must have "Tất cả" pill');
    assert(pillTexts.some(p => p.includes('Chờ thực hiện')), 'Must have "Chờ thực hiện" pill');
    assert(pillTexts.some(p => p.includes('Đã hoàn thành')), 'Must have "Đã hoàn thành" pill');
    assert(pillTexts.some(p => p.includes('Đã đóng')), 'Must have "Đã đóng" pill');

    // Verify NO "Lọc" button
    const surveyFilterButtons = await page.$$eval('.filter-bar button', btns => btns.map(b => b.textContent.trim()));
    assert(!surveyFilterButtons.some(t => t === 'Lọc' || t === '🔍 Lọc'), 'Must NOT have a "Lọc" button on Surveys');

    // Check pagination bar
    const surveyCustPag = await page.textContent('#customer-survey-pagination .pagination-info');
    console.log('   Customer Survey Pagination Info:', surveyCustPag);
    assert(surveyCustPag.includes('10 dòng/trang'), 'Customer surveys pagination must state 10 dòng/trang');

    // Test clicking completed pill
    await page.click('#survey-tab-completed');
    await page.waitForTimeout(300);
    const activePill = await page.$eval('#survey-tab-completed', el => el.classList.contains('active'));
    assert(activePill, 'Completed pill should be active');

    // Reset
    await page.click('button:has-text("Đặt lại")');
    await page.waitForTimeout(300);
    const allPillActive = await page.$eval('#survey-tab-all', el => el.classList.contains('active'));
    assert(allPillActive, '"Tất cả" pill should be active after reset');

    // --- Customer Feedback ---
    console.log('[8] Testing Customer Feedback Search, Filters & Pagination...');
    await page.click('#nav-customer-feedback');
    await page.waitForSelector('#customer-feedback-list');

    // Verify filter elements
    await page.waitForSelector('#cust-fb-search');
    await page.waitForSelector('#cust-fb-rating');
    await page.waitForSelector('#cust-fb-status');

    // Verify NO "Lọc" button
    const fbFilterButtons = await page.$$eval('.filter-bar button', btns => btns.map(b => b.textContent.trim()));
    console.log('   Customer Feedback filter bar buttons:', fbFilterButtons);
    assert(!fbFilterButtons.some(t => t === 'Lọc' || t === '🔍 Lọc'), 'Must NOT have a "Lọc" button on Customer Feedback');

    const fbPaginationText = await page.textContent('#customer-feedback-pagination .pagination-info');
    console.log('   Customer Feedback Pagination Info:', fbPaginationText);
    assert(fbPaginationText.includes('10 dòng/trang'), 'Customer feedback pagination must state 10 dòng/trang');

    // Test rating dropdown
    await page.selectOption('#cust-fb-rating', 'POSITIVE');
    await page.waitForTimeout(300);
    const posFilteredInfo = await page.textContent('#customer-feedback-pagination .pagination-info');
    console.log('   Customer Feedback after Positive filter:', posFilteredInfo);

    // Test reset button
    await page.click('button:has-text("Đặt lại")');
    await page.waitForTimeout(300);
    const fbRestoredInfo = await page.textContent('#customer-feedback-pagination .pagination-info');
    console.log('   Customer Feedback restored info:', fbRestoredInfo);

    // --- Customer Profile: Account Info Text Color ---
    console.log('[9] Testing Customer Profile Account Info Labels Color...');
    await page.click('#nav-customer-profile');
    await page.waitForSelector('.card-title:has-text("Thông tin tài khoản")');
    const labelColor = await page.$eval('td:has-text("Tên đăng nhập")', el => {
      return window.getComputedStyle(el).color;
    });
    console.log('   Label color in Account Info table:', labelColor);
    assert(labelColor === 'rgb(71, 85, 105)', 'Label color must be #475569 (rgb(71, 85, 105))');

    console.log('\n======================================================');
    console.log('✅ ALL VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

run();
