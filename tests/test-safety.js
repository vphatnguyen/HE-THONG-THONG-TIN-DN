const assert = require('node:assert/strict');
async function assertTestEnvironment(baseUrl, database = process.env.DB_DATABASE || 'CosmeticsCRM_E2E_DB') {
  const url = new URL(baseUrl);
  assert(['localhost','127.0.0.1','[::1]'].includes(url.hostname), 'E2E chỉ được chạy trên loopback');
  assert(/E2E_DB$/i.test(database), 'E2E yêu cầu database riêng có hậu tố E2E_DB');
  const response = await fetch(new URL('/api/test/environment',url));
  const identity = await response.json().catch(()=>null);
  assert(response.ok && identity?.testMode === true && identity.database === database, 'Server không trỏ tới database test đã chọn; khởi động với CRM_TEST_MODE=1');
}
module.exports = { assertTestEnvironment };
