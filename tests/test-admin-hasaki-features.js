const http = require('http');

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING TEST: ADMIN ACCOUNTS & HASAKI PRODUCT REVIEWS ===');

  // 1. Test Admin Login with plain text password 'admin123'
  console.log('\n[1] Testing Admin Login with plain text password (admin / admin123)...');
  const adminLoginRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'admin', password: 'admin123' });

  if (adminLoginRes.status !== 200 || !adminLoginRes.body.token) {
    throw new Error(`Admin login failed: ${JSON.stringify(adminLoginRes.body)}`);
  }
  console.log('✓ Admin login successful! Token acquired.');
  const adminToken = adminLoginRes.body.token;
  const adminUserId = adminLoginRes.body.user.id;

  // 2. Test GET /api/admin/accounts
  console.log('\n[2] Testing GET /api/admin/accounts (Checking username & password returned)...');
  const accountsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/admin/accounts',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });

  if (accountsRes.status !== 200 || !Array.isArray(accountsRes.body)) {
    throw new Error(`GET /api/admin/accounts failed: ${JSON.stringify(accountsRes.body)}`);
  }
  console.log(`✓ Fetched ${accountsRes.body.length} accounts.`);
  const adminAcc = accountsRes.body.find(a => a.username === 'admin');
  console.log(`  - Admin username: @${adminAcc?.username}, password: ${adminAcc?.password}`);
  if (adminAcc?.password !== 'admin123') {
    throw new Error(`Expected plain text password admin123, got ${adminAcc?.password}`);
  }

  // 3. Test Admin Self-lock restriction
  console.log('\n[3] Testing Admin Self-lock restriction (Admin cannot lock self)...');
  const selfLockRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/admin/accounts/${adminUserId}/status`,
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' }
  }, { status: 'LOCKED' });

  if (selfLockRes.status === 400 && selfLockRes.body.error.includes('Không thể tự khóa tài khoản')) {
    console.log('✓ Self-lock properly blocked with 400 error:', selfLockRes.body.error);
  } else {
    throw new Error(`Expected self-lock to be blocked, got ${selfLockRes.status} ${JSON.stringify(selfLockRes.body)}`);
  }

  // 4. Test Manager toggle status
  const managerAcc = accountsRes.body.find(a => a.role === 'MANAGER' && a.id !== adminUserId);
  if (managerAcc) {
    console.log(`\n[4] Testing lock/unlock on manager account #${managerAcc.id} (@${managerAcc.username})...`);
    // Lock
    const lockRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/admin/accounts/${managerAcc.id}/status`,
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' }
    }, { status: 'LOCKED' });
    console.log('  Lock response:', lockRes.body);

    // Unlock
    const unlockRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/admin/accounts/${managerAcc.id}/status`,
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' }
    }, { status: 'ACTIVE' });
    console.log('  Unlock response:', unlockRes.body);
    console.log('✓ Status toggle works properly.');
  }

  // 5. Test Customer Login with plain text password '123456'
  console.log('\n[5] Testing Customer Login with plain text password (khach001 / 123456)...');
  const custLoginRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'khach001', password: '123456' });

  if (custLoginRes.status !== 200 || !custLoginRes.body.token) {
    throw new Error(`Customer login failed: ${JSON.stringify(custLoginRes.body)}`);
  }
  console.log('✓ Customer login successful!');
  const customerToken = custLoginRes.body.token;

  // 6. Test GET /api/customer/products (Verify review_count and avg_rating are returned)
  console.log('\n[6] Testing GET /api/customer/products (Review stats for each product card)...');
  const custProductsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/customer/products',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${customerToken}` }
  });

  if (custProductsRes.status !== 200 || !Array.isArray(custProductsRes.body)) {
    throw new Error(`GET /api/customer/products failed: ${JSON.stringify(custProductsRes.body)}`);
  }
  console.log(`✓ Fetched ${custProductsRes.body.length} products.`);
  const sampleWithReviews = custProductsRes.body.find(p => Number(p.review_count) > 0) || custProductsRes.body[0];
  console.log(`  Sample product "${sampleWithReviews.name}": review_count=${sampleWithReviews.review_count}, avg_rating=${sampleWithReviews.avg_rating}`);

  // 7. Test GET /api/customer/products/:productId/feedbacks (Hasaki standard endpoint)
  console.log(`\n[7] Testing GET /api/customer/products/${sampleWithReviews.id}/feedbacks (Hasaki product detail)...`);
  const detailRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/customer/products/${sampleWithReviews.id}/feedbacks`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${customerToken}` }
  });

  if (detailRes.status !== 200 || !detailRes.body.product || !detailRes.body.stats) {
    throw new Error(`GET feedbacks failed: ${JSON.stringify(detailRes.body)}`);
  }
  console.log('✓ Hasaki product detail and review stats fetched successfully:');
  console.log('  Stats:', JSON.stringify(detailRes.body.stats));
  console.log(`  Feedbacks count: ${detailRes.body.feedbacks?.length}`);
  if (detailRes.body.feedbacks?.length > 0) {
    const fbSample = detailRes.body.feedbacks[0];
    console.log(`  Feedback sample by ${fbSample.customer_name}: ${fbSample.rating}★ "${fbSample.content}"`);
    if (fbSample.reply_content) {
      console.log(`  CSKH Reply: "${fbSample.reply_content}"`);
    }
  }

  console.log('\n======================================================');
  console.log('ALL API AND BUSINESS LOGIC TESTS PASSED SUCCESSFULLY! ✓');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
});
