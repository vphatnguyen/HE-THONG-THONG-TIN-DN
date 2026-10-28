const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {assertTestEnvironment}=require('./test-safety');
const base=process.env.E2E_BASE_URL || 'http://localhost:3100';
const results=[];
let browser,page,acceptDialogs=false;
async function check(id,scenario,expected,fn){
  try{await fn();results.push({id,scenario,expected,actual:expected,status:'PASS'});}
  catch(error){results.push({id,scenario,expected,actual:error.message,status:'FAIL'});await page.screenshot({path:`tests/artifacts/${id}-failure.png`});}
  if (await page.locator('#modal-overlay:not(.hidden)').count()) await page.locator('.modal-close').click();
  await page.setViewportSize({width:1440,height:1000});
}
async function login(username,password){
  await page.goto(base);
  await page.evaluate(()=>logout());
  await page.locator('#login-username').fill(username);await page.locator('#login-password').fill(password);
  await page.locator('#login-btn').click();await page.locator('#app:not(.hidden)').waitFor();
}
async function navigate(route,selector){await page.locator('#nav-'+route).click();await page.locator(selector).first().waitFor();}
async function run(){
  await assertTestEnvironment(base);
  browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
  page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(7000);
  const errors=[];page.on('pageerror',error=>errors.push(error.stack || error.message));
  page.on('dialog',dialog=>acceptDialogs?dialog.accept():dialog.dismiss());
  await login('manager1','manager123');
  await check('UX01','Danh sách khách hàng','6 cột, có ID, không tự mở form sửa',async()=>{await navigate('manager-customers','#customers-tbody tr');assert.equal(await page.locator('thead th').count(),6);await page.locator('#customers-tbody tr').first().click();assert.match(await page.locator('#modal-title').textContent(),/Chi tiết/);assert.equal(await page.locator('#ec-fullname').count(),0);assert.match(await page.locator('#modal-body').textContent(),/ID khách hàng/);assert.doesNotMatch(await page.locator('#modal-body').textContent(),/ID tài khoản|Ngày tạo hồ sơ|Hạng thành viên|Điểm trung bình/);assert.match(await page.locator('#modal-body').textContent(),/Ngày tạo tài khoản/);await page.screenshot({path:'tests/artifacts/lean-customer-detail.png',fullPage:true,animations:'disabled'});});
  await check('UX02','Nút sửa không mở chi tiết','mở đúng form sửa',async()=>{await page.locator('#customers-tbody tr').first().getByRole('button',{name:'Sửa',exact:true}).click();await page.locator('#ec-fullname').waitFor();assert.match(await page.locator('#modal-title').textContent(),/Sửa/);});
  await check('UX03','Ẩn nút khóa ở danh sách khách hàng','khóa và mở khóa nằm trong form sửa',async()=>{assert.equal(await page.locator('#customers-tbody button[onclick^="toggleCustomerStatus"]').count(),0);await page.locator('#customers-tbody tr').first().getByRole('button',{name:'Sửa',exact:true}).click();await page.locator('#ec-status').waitFor();assert.deepEqual(await page.locator('#ec-status option').evaluateAll(items=>items.map(item=>item.value)),['ACTIVE','LOCKED']);});
  await check('UX04','Điều hướng chi tiết bằng bàn phím','Enter mở chi tiết',async()=>{await page.locator('#customers-tbody tr').first().focus();await page.keyboard.press('Enter');assert.match(await page.locator('#modal-title').textContent(),/Chi tiết/);});
  await check('UX05','Lọc ngày + sắp xếp + phân trang khách hàng','ngày đảo báo lỗi, reset phục hồi',async()=>{const tools=page.locator('[data-list-tools="customers"]');await tools.locator('[data-filter="from"]').fill('01/01/2099');assert.match(await page.locator('#customers-tbody').textContent(),/Không tìm thấy/);await tools.locator('[data-filter="to"]').fill('01/01/2020');assert.match(await tools.locator('[role="status"]').textContent(),/Từ ngày/);await page.locator('button[onclick="resetCustomerFilters()"]').click();await tools.locator('[data-filter="sort"]').selectOption('customer_id:asc');const ids=await page.locator('#customers-tbody tr td:first-child').allTextContents();const numbers=ids.map(t=>Number(t.replace('#','')));assert.deepEqual(numbers,[...numbers].sort((a,b)=>a-b));await page.screenshot({path:'tests/artifacts/crm-customers.png',fullPage:true,animations:'disabled'});});
  await check('UX06','Tìm khách hàng theo ID và xóa bộ lọc','đúng một bản ghi',async()=>{const id=(await page.locator('#customers-tbody tr td:first-child').first().textContent()).replace('#','');await page.locator('#cust-search').fill('#'+id);await page.waitForResponse(r=>r.url().includes('/api/manager/customers?')&&r.status()===200);await page.waitForFunction(()=>document.querySelectorAll('#customers-tbody tr').length===1);assert.match(await page.locator('#customers-tbody tr td:first-child').textContent(),new RegExp(id));await page.locator('button[onclick="resetCustomerFilters()"]').click();});
  await check('UX07','Feedback Manager danh sách/chi tiết','7 cột; nội dung và phản hồi chỉ ở chi tiết',async()=>{await navigate('manager-feedbacks','#feedback-list-container tbody tr');assert.equal(await page.locator('#feedback-list-container th').count(),7);assert.equal(await page.locator('#feedback-list-container textarea,.feedback-content').count(),0);await page.locator('#feedback-list-container tbody tr').first().click();await page.locator('#modal-body .record-details').first().waitFor();assert.match(await page.locator('#modal-body').textContent(),/Nội dung đánh giá/);await page.screenshot({path:'tests/artifacts/crm-feedback-detail.png',fullPage:true,animations:'disabled'});});
  await check('UX08','Chiến dịch danh sách/chi tiết','7 cột; không sản phẩm/mô tả ở bảng',async()=>{await navigate('manager-surveys','#manager-survey-list tbody tr');assert.equal(await page.locator('#manager-survey-list th').count(),7);await page.locator('#manager-survey-list tbody tr').first().click();await page.locator('#modal-body .record-details').first().waitFor();assert.match(await page.locator('#modal-body').textContent(),/Sản phẩm/);assert.match(await page.locator('#modal-body').textContent(),/Câu hỏi/);});
  await check('UX09','Chiến dịch lọc kết hợp','lọc ID + trạng thái + reset',async()=>{const tools=page.locator('[data-list-tools="campaigns"]');const id=await page.locator('#manager-survey-list tbody tr td:first-child').first().textContent();await tools.locator('[data-filter="search"]').fill(id);assert.equal(await page.locator('#manager-survey-list tbody tr').count(),1);await tools.locator('[data-filter="status"]').selectOption('DRAFT');await tools.locator('[data-reset]').click();assert.equal(await tools.locator('[data-filter="search"]').inputValue(),'');await page.screenshot({path:'tests/artifacts/crm-campaigns.png',fullPage:true,animations:'disabled'});});
  await check('UX24','Phản hồi tải chi tiết cũ không ghi đè bản ghi vừa mở','giữ đúng ID mới khi request cũ hoàn thành muộn',async()=>{
    await navigate('manager-feedbacks','#feedback-list-container tbody tr');
    const rows=page.locator('#feedback-list-container tbody tr');
    const first=Number((await rows.nth(0).locator('td').first().textContent()).replace('#',''));
    const second=Number((await rows.nth(1).locator('td').first().textContent()).replace('#',''));
    let held,release;const captured=new Promise(resolve=>release=resolve);
    const pattern=`**/api/manager/feedbacks/${first}`;
    await page.route(pattern,route=>{held=route;release();});
    try{
      await rows.nth(0).click();await captured;await page.locator('.modal-close').click();await rows.nth(1).click();
      await page.waitForFunction(id=>document.querySelector('#modal-body .record-details dd')?.textContent===String(id),second);
      const response=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/manager/feedbacks/${first}`);
      await held.continue();held=null;await (await response).finished();await page.evaluate(()=>new Promise(requestAnimationFrame));
      assert.equal(await page.locator('#modal-body .record-details dd').first().textContent(),String(second));
    }finally{if(held)await held.continue().catch(()=>{});await page.unroute(pattern);}
  });
  const uiReply='Phản hồi UI '+Date.now();
  await check('UX17','Lỗi API phản hồi giữ nguyên dữ liệu nhập','hiện lỗi, không đóng form, giữ nội dung',async()=>{
    await navigate('manager-feedbacks','#feedback-list-container tbody tr');
    await page.locator('#feedback-list-container tbody tr').filter({hasText:'qa_e2e_ui_product'}).click();
    await page.locator('#modal-body textarea').fill(uiReply);
    await page.route('**/api/manager/feedbacks/*/reply',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'QA API tạm lỗi'})}));
    try{await page.locator('#modal-body .detail-actions button').click();await page.locator('.toast.error').filter({hasText:'QA API tạm lỗi'}).waitFor();assert.equal(await page.locator('#modal-body textarea').inputValue(),uiReply);}
    finally{await page.unroute('**/api/manager/feedbacks/*/reply');}
  });
  await check('UX18','Manager gửi và sửa phản hồi qua UI','đã phản hồi; 2 phiên bản lịch sử',async()=>{
    await page.locator('#feedback-list-container tbody tr').filter({hasText:'qa_e2e_ui_product'}).click();
    await page.locator('#modal-body textarea').waitFor();
    const beforeHistory=await page.locator('#modal-body dt').filter({hasText:'Nội dung sau'}).count();
    await page.locator('#modal-body textarea').fill(uiReply);
    await page.locator('#modal-body .detail-actions button').click();
    await page.waitForFunction(text=>document.querySelector('#modal-body textarea')?.dataset.previous===text,uiReply);
    await page.locator('#modal-body textarea').fill(uiReply+' đã sửa');
    await page.locator('#modal-body .detail-actions button').click();
    await page.waitForFunction(text=>document.querySelector('#modal-body textarea')?.dataset.previous===text,uiReply+' đã sửa');
    assert.match(await page.locator('#modal-body').textContent(),/Lịch sử trả lời feedback/);
    assert.equal(await page.locator('#modal-body dt').filter({hasText:'Nội dung sau'}).count(),beforeHistory+2);
  });
  await login('qa_e2e_customer_a','customer-pass');
  await check('UX10','Đánh giá Customer danh sách/popup','6 cột; popup gọn, không ID/audit/lịch sử quản trị',async()=>{await navigate('customer-feedback','#customer-feedback-list tbody tr');assert.equal(await page.locator('#customer-feedback-list th').count(),6);await page.locator('#customer-feedback-list tbody tr').first().click();await page.locator('#modal-body .customer-feedback-popup').waitFor();assert.equal(await page.locator('#modal-body .record-details').count(),0);assert.match(await page.locator('#modal-body').textContent(),/Đánh giá của bạn/);assert.doesNotMatch(await page.locator('#modal-body').textContent(),/ID đánh giá|ID sản phẩm|Lịch sử chỉnh sửa|Lịch sử trả lời/);});
  await check('UX19','Customer xem trả lời Manager mới nhất','hiện trả lời đã sửa; không có nút sửa đánh giá',async()=>{await page.locator('#customer-feedback-list tbody tr').filter({hasText:'qa_e2e_ui_product'}).click();await page.locator('#modal-body .customer-feedback-popup').waitFor();assert((await page.locator('#modal-body .customer-feedback-reply').textContent()).includes(uiReply+' đã sửa'));assert.equal(await page.locator('#modal-body button').filter({hasText:'Sửa đánh giá'}).count(),0);await page.screenshot({path:'tests/artifacts/customer-feedback-popup.png',fullPage:true,animations:'disabled'});});
  await check('UX11','Customer xem khảo sát hoàn thành','xem lại câu trả lời, không nút nộp/sửa',async()=>{await navigate('customer-surveys','#customer-survey-list tbody tr');await page.locator('#survey-tab-completed').click();await page.locator('#customer-survey-list tbody tr').filter({hasText:'Đã hoàn thành'}).first().click();await page.locator('#modal-body .record-details').first().waitFor();assert.match(await page.locator('#modal-body').textContent(),/Câu trả lời đã gửi/);assert.equal(await page.locator('#modal-body button').filter({hasText:/Nộp|Làm khảo sát|Sửa/}).count(),0);await page.screenshot({path:'tests/artifacts/crm-survey-history.png',fullPage:true,animations:'disabled'});});
  await check('UX12','Customer list 375px','cuộn ngang trong bảng, trang không tràn viewport',async()=>{await page.setViewportSize({width:375,height:812});await page.waitForFunction(()=>getComputedStyle(document.querySelector('#main-content')).marginLeft==='0px');const dims=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert(dims.scroll<=dims.client+1,JSON.stringify(dims));await page.screenshot({path:'tests/artifacts/crm-surveys-mobile.png',fullPage:true,animations:'disabled'});await page.setViewportSize({width:1440,height:1000});});
  await login('admin','admin123');
  for(const [id,route,selector,field] of [['UX13','admin-accounts','#accounts-tbody','Tên đăng nhập'],['UX14','manager-products','#products-tbody','Mô tả'],['UX15','manager-suppliers','#suppliers-tbody','Địa chỉ']]) {
    if(id==='UX14')await login('manager1','manager123');
    await check(id,`CRUD ${route} danh sách/chi tiết`,'click hàng đọc, nút sửa mở form',async()=>{await navigate(route,selector+' tr');await page.locator(selector+' tr').first().click();assert.match(await page.locator('#modal-title').textContent(),/Chi tiết/);assert((await page.locator('#modal-body').textContent()).includes(field));if(id==='UX14'){const body=await page.locator('#modal-body').textContent();assert.doesNotMatch(body,/Tồn kho|OFFICIAL|UPCOMING/);assert.equal(await page.locator('#modal-body dt').filter({hasText:/^Ảnh$/}).count(),0);assert.match(body,/Đang bán|Ngừng bán/);await page.screenshot({path:'tests/artifacts/lean-product-detail.png',fullPage:true,animations:'disabled'});}await page.locator('.modal-close').click();await page.locator(selector+' tr').first().locator('td:last-child button').first().click();if(id==='UX14')await page.locator('#ep-name').waitFor();assert.match(await page.locator('#modal-title').textContent(),/Sửa|sửa/);});
  }
  await check('UX20','Manager sửa khách hàng giữ nhiều sở thích','giữ nguyên các lựa chọn khi chỉ đổi họ tên',async()=>{
    await navigate('manager-customers','#customers-tbody tr');
    await page.locator('#cust-search').fill('@qa_e2e_customer_a');
    await page.waitForFunction(()=>document.querySelectorAll('#customers-tbody tr').length===1);
    await page.locator('#customers-tbody tr button').first().click();await page.locator('#ec-fullname').waitFor();
    const before=await page.locator('#ec-pref input:checked').evaluateAll(inputs=>inputs.map(i=>i.value).sort());assert(before.length>=2);
    await page.locator('#ec-fullname').fill('QA Khách A');
    await page.locator('#modal-body button[onclick^="updateCustomer"]').click();
    await page.waitForFunction(()=>document.querySelector('#modal-overlay').classList.contains('hidden'));
    await page.locator('#cust-search').fill('@qa_e2e_customer_a');
    await page.waitForFunction(()=>document.querySelectorAll('#customers-tbody tr').length===1);
    await page.locator('#customers-tbody tr button').first().click();await page.locator('#ec-fullname').waitFor();
    assert.deepEqual(await page.locator('#ec-pref input:checked').evaluateAll(inputs=>inputs.map(i=>i.value).sort()),before);
  });
  await check('UX21','CRUD sản phẩm qua UI với dấu nháy','thêm → chi tiết → sửa → xóa đúng bản ghi',async()=>{
    const name=`QA UI ${Date.now()} "O'Reilly"`;
    await navigate('manager-products','#products-tbody tr');
    await page.locator('#header-actions button').click();await page.locator('#mp-name').fill(name);await page.locator('#mp-cat').selectOption('Serum');await page.locator('#mp-price').fill('123');await page.locator('#mp-desc').fill('Mô tả đầy đủ');
    await page.locator('#modal-body button[onclick="createProduct()"]').click();
    const row=page.locator('#products-tbody tr').filter({hasText:name});await row.waitFor();
    await row.click();assert((await page.locator('#modal-body').textContent()).includes('Mô tả đầy đủ'));await page.locator('.modal-close').click();
    await row.locator('td:last-child button').first().click();await page.locator('#ep-name').fill(name+' edited');await page.locator('#modal-body button[onclick^="updateProduct"]').click();
    const edited=page.locator('#products-tbody tr').filter({hasText:name+' edited'});await edited.waitFor();
    try{acceptDialogs=true;await edited.locator('td:last-child button').last().click();await edited.waitFor({state:'detached'});}finally{acceptDialogs=false;}
  });
  await check('UX22','CRUD nhà cung cấp qua UI','thêm → sửa liên hệ → xem chi tiết → xóa',async()=>{
    const name='QA Supplier UI '+Date.now();await navigate('manager-suppliers','#suppliers-tbody tr');await page.locator('#header-actions button').click();await page.locator('#ms-name').fill(name);await page.locator('#modal-body button[onclick="createSupplier()"]').click();
    const row=page.locator('#suppliers-tbody tr').filter({hasText:name});await row.waitFor();await row.locator('button').first().click();await page.locator('#es-contact').fill('Liên hệ QA');await page.locator('#modal-body button[onclick^="updateSupplier"]').click();await page.waitForFunction(()=>document.querySelector('#modal-overlay').classList.contains('hidden'));await row.click();assert((await page.locator('#modal-body').textContent()).includes('Liên hệ QA'));await page.locator('.modal-close').click();
    try{acceptDialogs=true;await row.locator('button').last().click();await row.waitFor({state:'detached'});}finally{acceptDialogs=false;}
  });
  await login('admin','admin123');
  await check('UX23','CRUD tài khoản nội bộ và xem mật khẩu mới','tạo/sửa/khóa/xóa; mật khẩu dạng rõ vẫn xem được',async()=>{
    const username='qa_ui_'+Date.now();await navigate('admin-accounts','#accounts-tbody tr');await page.locator('#header-actions button').click();await page.locator('#m-username').fill(username);await page.locator('#m-password').fill('qa-pass');await page.locator('#m-fullname').fill(username);await page.locator('#m-email').fill(username+'@example.test');await page.locator('#modal-body button[onclick="createAccount()"]').click();
    const row=page.locator('#accounts-tbody tr').filter({hasText:username});await row.waitFor();await row.getByRole('button',{name:/Sửa/}).click();assert.equal(await page.locator('#e-password').inputValue(),'qa-pass');await page.locator('#e-fullname').fill(username+' updated');await page.locator('#modal-body button[onclick^="updateAccount"]').click();await page.waitForFunction(()=>document.querySelector('#modal-overlay').classList.contains('hidden'));
    try{acceptDialogs=true;await row.locator('button[onclick^="toggleAdminAccountStatus"]').click();await row.getByText('Bị khóa').waitFor();await row.locator('button[onclick^="deleteAccount"]').click();await row.waitFor({state:'detached'});}finally{acceptDialogs=false;}
  });
  await login('qa_e2e_customer_a','customer-pass');
  await check('UX25','Customer xem sản phẩm theo mô hình feedback/khảo sát','không tồn kho; nhãn Đang bán/Ngừng bán; giữ điểm sao sản phẩm',async()=>{
    await navigate('customer-home','#cust-home-products-grid .product-card');
    await page.locator('#cust-home-search').fill('qa_e2e_ui_product');
    const card=page.locator('#cust-home-products-grid .product-card').filter({hasText:'qa_e2e_ui_product'});await card.click();
    await page.locator('#modal-body .hasaki-overview-box').waitFor();
    const body=await page.locator('#modal-body').textContent();assert.doesNotMatch(body,/Tồn kho|OFFICIAL|UPCOMING/);assert.match(body,/Đang bán/);assert.match(body,/5[.,]0/);assert.equal(await page.locator('#modal-body button[onclick="toggleHasakiWriteSection(true)"]').count(),0);assert.match(body,/Đánh giá đã được trả lời/);
    await page.screenshot({path:'tests/artifacts/lean-customer-product.png',fullPage:true,animations:'disabled'});
  });
  await login('admin','admin123');
  await check('UX26','Ẩn ID tài khoản ở danh sách, chi tiết và sắp xếp','giữ tên đăng nhập và thao tác CRUD',async()=>{
    await navigate('admin-accounts','#accounts-tbody tr');
    assert.equal(await page.locator('thead th').filter({hasText:/^ID$/}).count(),0);
    assert.equal(await page.locator('[data-list-tools="accounts"] option[value^="id:"]').count(),0);
    assert.equal(await page.locator('#accounts-tbody tr').first().locator('td').count(),8);
    await page.locator('#accounts-tbody tr').first().click();
    assert.equal(await page.locator('#modal-body dt').filter({hasText:/^ID/}).count(),0);
    assert.match(await page.locator('#modal-body').textContent(),/Tên đăng nhập/);
  });
  await login('manager1','manager123');
  await check('UX27','Dashboard ngày dd/mm/yyyy và ẩn CSV','đổi sang ISO khi gọi API; chặn ngày sai; reset được cả hai ô',async()=>{
    await navigate('manager-dashboard','#analytics-from');
    assert.equal(await page.locator('#analytics-from').getAttribute('placeholder'),'dd/mm/yyyy');
    assert.equal(await page.locator('button').filter({hasText:/CSV|Xuất dữ liệu/}).count(),0);
    assert.match(await page.locator('.analytics-date-help').textContent(),/ngày gửi.*ngày bắt đầu.*ngày nộp/);
    await page.locator('#analytics-from').fill('31/02/2026');
    await page.locator('button[onclick="renderManagerDashboard()"]', {hasText:'Áp dụng'}).click();
    await page.locator('.toast.error').filter({hasText:'Ngày không tồn tại'}).waitFor();
    assert.equal(await page.locator('#analytics-from').inputValue(),'31/02/2026');
    await page.locator('#analytics-from').fill('03/04/2077');await page.locator('#analytics-to').fill('03/04/2077');
    const response=page.waitForResponse(r=>r.url().includes('/api/manager/analytics?from=2077-04-03&to=2077-04-03'));
    await page.locator('button[onclick="renderManagerDashboard()"]', {hasText:'Áp dụng'}).click();assert.equal((await response).status(),200);
    await page.waitForFunction(()=>document.querySelector('#analytics-from')?.value==='03/04/2077');
    await page.locator('button[onclick^="resetAnalyticsFilter"]').click();
    await page.waitForFunction(()=>document.querySelector('#analytics-from')?.value==='' && document.querySelector('#analytics-to')?.value==='');
    await page.waitForFunction(()=>[...document.querySelectorAll('.chart-card canvas')].length>=8 && [...document.querySelectorAll('.chart-card canvas')].every(canvas=>window.Chart?.getChart(canvas)));
    await page.locator('.toast.error').filter({hasText:'Ngày không tồn tại'}).waitFor({state:'hidden'});
    await page.screenshot({path:'tests/artifacts/lean-dashboard-filters.png',fullPage:true,animations:'disabled'});
  });
  await check('UX28','Bỏ bộ lọc và nút đặt lại bị lặp','một bộ sắp xếp sản phẩm; một nút reset mỗi danh sách; không lặp bộ lọc sao',async()=>{
    for(const [route,target,reset] of [['manager-customers','#customers-tbody','resetCustomerFilters'],['manager-products','#products-tbody','resetProductFilters'],['manager-suppliers','#suppliers-tbody','resetSupplierFilters'],['manager-feedbacks','#feedback-list-container','resetManagerFeedbackFilters']]) {
      await navigate(route,target);
      assert.equal(await page.locator('[data-list-tools] [data-reset]').count(),0);
      assert.equal(await page.locator(`button[onclick="${reset}()"]`).count(),1);
      if(route==='manager-products') {assert.equal(await page.locator('[data-list-tools="products"] [data-filter="sort"]').count(),0);assert.equal(await page.locator('#prod-sort').count(),1);}
      if(route==='manager-feedbacks') {assert.equal(await page.locator('#fb-filter-tabs').count(),0);assert.equal(await page.locator('#fb-rating').count(),1);}
    }
  });
  await check('UX29','Click và Enter ở bảng phân tích sản phẩm → feedback → chi tiết','không nút xem người đánh giá; mở đúng ID feedback và form trả lời',async()=>{
    await navigate('manager-analytics','#analytics-products-tbody tr');
    assert.equal(await page.getByRole('button',{name:/Xem người đánh giá/}).count(),0);
    assert.equal(await page.locator('#analytics-products-tbody').locator('..').locator('thead th').count(),5);
    const row=page.locator('#analytics-products-tbody tr').filter({hasText:'qa_e2e_ui_product'});
    await page.locator('#analytics-product-search').fill('qa_e2e_ui_product');await row.click();
    await page.locator('#modal-body tbody tr.row-clickable').first().waitFor();
    const id=Number((await page.locator('#modal-body tbody tr td').first().textContent()).replace('#',''));
    await page.locator('#modal-body tbody tr').first().click();await page.locator('#modal-body textarea').waitFor();
    assert.equal(await page.locator('#modal-body .record-details dd').first().textContent(),String(id));
    assert.match(await page.locator('#modal-body').textContent(),/Nội dung trả lời feedback|Sửa trả lời feedback/);
    await page.locator('.modal-close').click();await row.focus();await page.keyboard.press('Enter');
    await page.locator('#modal-body tbody tr.row-clickable').first().waitFor();
  });
  await check('UX30','Click và Enter ở bảng phân tích khảo sát','không nút Chi tiết; mở kết quả đúng khảo sát',async()=>{
    await navigate('manager-analytics','#analytics-surveys-tbody tr');
    assert.equal(await page.locator('#analytics-surveys-tbody button').count(),0);
    const row=page.locator('#analytics-surveys-tbody tr').first();const title=(await row.locator('td').first().locator('div').first().textContent()).trim();
    await row.click();await page.locator('#modal-body .survey-summary-chips').waitFor();
    assert((await page.locator('#modal-title').textContent()).includes(title));
    await page.locator('.modal-close').click();await row.focus();await page.keyboard.press('Enter');await page.locator('#modal-body .survey-summary-chips').waitFor();
    await page.screenshot({path:'tests/artifacts/manager-analytics-click.png',fullPage:true,animations:'disabled'});
  });
  await check('UX31','Sửa trạng thái khảo sát đã có câu trả lời','đóng trong form sửa; giữ nguyên câu hỏi, người nhận và số kết quả',async()=>{
    await navigate('manager-surveys','#manager-survey-list tbody tr');
    assert.equal(await page.locator('#manager-survey-list button[onclick^="manageSurveyRecipients"],#manager-survey-list button[onclick^="updateSurveyStatus"]').count(),0);
    const survey=await page.evaluate(()=>currentManagerSurveysList.find(s=>Number(s.response_count)>0));assert(survey);
    const before=await page.evaluate(id=>api('GET',`/api/manager/surveys/${id}`),survey.id);
    try {
      await page.evaluate(id=>openEditSurveyModal(id),survey.id);await page.locator('#esv-status').waitFor();
      assert.equal(await page.locator('#esv-title,input[name="esv-recipient"]').count(),0);
      assert.match(await page.locator('#modal-body').textContent(),/Người nhận \(chỉ xem\)/);
      await page.locator('#esv-status').selectOption('CLOSED');await page.getByRole('button',{name:'Lưu trạng thái',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('#modal-overlay').classList.contains('hidden'));
      const after=await page.evaluate(id=>api('GET',`/api/manager/surveys/${id}`),survey.id);
      assert.equal(after.status,'CLOSED');assert.equal(after.response_count,before.response_count);
      assert.deepEqual(after.questions,before.questions);assert.deepEqual(after.recipient_customer_ids,before.recipient_customer_ids);
    } finally {await page.evaluate(({id,status})=>api('PUT',`/api/manager/surveys/${id}/status`,{status}),survey);}
  });
  await check('UX32','Người nhận và đóng khảo sát chưa có kết quả nằm trong form sửa','lưu danh sách người nhận và trạng thái bằng form; không nút riêng ngoài bảng',async()=>{
    const data=await page.evaluate(async()=>{
      const products=await api('GET','/api/products'),customers=await api('GET','/api/manager/customers?status=ACTIVE');
      const ids=customers.slice(0,2).map(c=>c.customer_id);if(ids.length<2)throw new Error('Thiếu khách fixture');
      const created=await api('POST','/api/manager/surveys',{title:'QA manager compact '+Date.now(),target_product_ids:[products.find(p=>p.launch_status==='OFFICIAL').id],recipient_customer_ids:[ids[0]],questions:[{question_text:'Câu hỏi UI',question_type:'TEXT',is_required:false}]});
      return {id:created.id,ids};
    });
    try {
      await page.evaluate(id=>openEditSurveyModal(id),data.id);await page.locator('#esv-title').waitFor();
      await page.locator(`input[name="esv-recipient"][value="${data.ids[1]}"]`).check();await page.locator('#esv-status').selectOption('CLOSED');
      await page.locator('#modal-body button[onclick^="updateSurvey("]').click();
      await page.waitForFunction(()=>document.querySelector('#modal-overlay').classList.contains('hidden'));
      const survey=await page.evaluate(id=>api('GET',`/api/manager/surveys/${id}`),data.id);
      assert.equal(survey.status,'CLOSED');assert.deepEqual(survey.recipient_customer_ids.slice().sort((a,b)=>a-b),data.ids.slice().sort((a,b)=>a-b));
    } finally {await page.evaluate(id=>api('DELETE',`/api/manager/surveys/${id}`),data.id);}
  });
  await check('UX33','Cột thao tác khách hàng cố định và nút Sửa thẳng hàng','cùng tọa độ và chiều rộng; không nút khóa; giao diện dùng Feedback',async()=>{
    await navigate('manager-customers','#customers-tbody tr');
    const boxes=await page.locator('#customers-tbody .customer-row-actions button:first-child').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return{x:r.x,width:r.width};}));
    assert(boxes.length>1);assert(boxes.every(b=>Math.abs(b.x-boxes[0].x)<1 && b.width===boxes[0].width));
    assert.equal(await page.locator('#customers-tbody button[onclick^="toggleCustomerStatus"]').count(),0);
    assert.equal(await page.locator('#customers-tbody .customer-actions-cell').first().evaluate(e=>getComputedStyle(e).position),'sticky');
    assert.match(await page.locator('#nav-manager-feedbacks').textContent(),/Feedback/);
    await page.screenshot({path:'tests/artifacts/manager-customer-actions.png',fullPage:true,animations:'disabled'});
  });
  let uiTemplateName,uiTemplateQuestions;
  await check('UX34','Lưu bộ câu hỏi có tên và nạp lại ở phiên mới','giữ 4 loại, thứ tự, lựa chọn/bắt buộc; lưu không làm mất form',async()=>{
    await navigate('manager-surveys','#manager-survey-list');await page.locator('#header-actions button').click();await page.locator('#sv-title').waitFor();
    await page.evaluate(()=>{applySurveyTemplate('BEAUTY_PREF');addSurveyQuestionWithData('Góp ý riêng','TEXT','',false);});
    uiTemplateQuestions=await page.evaluate(()=>collectCreateSurveyQuestions());uiTemplateName='QA mẫu UI <b>& '+Date.now();
    await page.getByRole('button',{name:'Lưu danh sách thành bộ mẫu',exact:true}).click();await page.locator('#sv-template-name').fill(uiTemplateName);
    await page.getByRole('button',{name:'Lưu bộ mẫu',exact:true}).click();await page.locator('#sv-template-message').filter({hasText:'Đã lưu bộ mẫu'}).waitFor();
    assert.deepEqual(await page.evaluate(()=>collectCreateSurveyQuestions()),uiTemplateQuestions);assert.equal(await page.locator('#sv-question-template b').count(),0);
    await page.locator('.modal-close').click();await login('manager1','manager123');await navigate('manager-surveys','#manager-survey-list');await page.locator('#header-actions button').click();await page.locator('#sv-question-template').waitFor();
    const id=await page.evaluate(name=>savedQuestionTemplates.find(t=>t.name===name).id,uiTemplateName);await page.locator('#sv-question-template').selectOption(String(id));
    await page.getByRole('button',{name:'Dùng bộ mẫu',exact:true}).click();assert.deepEqual(await page.evaluate(()=>collectCreateSurveyQuestions()),uiTemplateQuestions);
    await page.locator('#q-text-1').fill('Câu riêng cho chiến dịch');
    const saved=await page.evaluate(async name=>(await api('GET','/api/manager/question-templates')).find(t=>t.name===name),uiTemplateName);assert.deepEqual(saved.questions,uiTemplateQuestions);
    await page.screenshot({path:'tests/artifacts/question-template-create.png',fullPage:true,animations:'disabled'});
  });
  await check('UX35','Lỗi lưu và hủy thay câu hỏi không mất bản đang soạn','hiện lỗi tại form, giữ tên/câu hỏi; chỉ thay khi xác nhận',async()=>{
    await page.locator('#header-actions button').click();await page.locator('#sv-title').waitFor();await page.locator('#q-text-1').fill('Giữ nguyên câu đang soạn');
    await page.getByRole('button',{name:'Lưu danh sách thành bộ mẫu',exact:true}).click();await page.getByRole('button',{name:'Lưu bộ mẫu',exact:true}).click();await page.locator('#sv-template-message').filter({hasText:'Tên bộ mẫu'}).waitFor();
    assert.equal(await page.locator('#q-text-1').inputValue(),'Giữ nguyên câu đang soạn');await page.locator('#sv-template-name').fill('Mẫu đang soạn');
    await page.route('**/api/manager/question-templates',route=>route.request().method()==='POST'?route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'QA lỗi lưu mẫu'})}):route.continue());
    try {await page.getByRole('button',{name:'Lưu bộ mẫu',exact:true}).click();await page.locator('#sv-template-message').filter({hasText:'QA lỗi lưu mẫu'}).waitFor();assert.equal(await page.locator('#sv-template-name').inputValue(),'Mẫu đang soạn');assert.equal(await page.locator('#q-text-1').inputValue(),'Giữ nguyên câu đang soạn');}
    finally {await page.unroute('**/api/manager/question-templates');}
    const id=await page.evaluate(name=>savedQuestionTemplates.find(t=>t.name===name).id,uiTemplateName);await page.locator('#sv-question-template').selectOption(String(id));
    await page.getByRole('button',{name:'Dùng bộ mẫu',exact:true}).click();assert.equal(await page.locator('#q-text-1').inputValue(),'Giữ nguyên câu đang soạn');
    try {acceptDialogs=true;await page.getByRole('button',{name:'Dùng bộ mẫu',exact:true}).click();} finally {acceptDialogs=false;}
    assert.deepEqual(await page.evaluate(()=>collectCreateSurveyQuestions()),uiTemplateQuestions);
  });
  await check('UX36','Ẩn email/số điện thoại trên người nhận cả tạo và sửa','giữ chọn khách, tên, tài khoản và thông tin phân nhóm',async()=>{
    await page.locator('#header-actions button').click();await page.locator('.sv-recipient-item').first().waitFor();
    const hidden=prefix=>page.locator(`.${prefix}-recipient-item`).evaluateAll(items=>items.every(item=>{const text=item.textContent;return (!item.dataset.email || !text.includes(item.dataset.email)) && (!item.dataset.phone || !text.includes(item.dataset.phone));}));
    assert(await hidden('sv'));await page.locator('.modal-close').click();
    const id=await page.evaluate(async()=>{const products=await api('GET','/api/products');return(await api('POST','/api/manager/surveys',{title:'QA recipient compact '+Date.now(),target_product_ids:[products[0].id],questions:[{question_text:'Ý kiến',question_type:'TEXT',is_required:false}]})).id;});
    try {await page.evaluate(id=>openEditSurveyModal(id),id);await page.locator('.esv-recipient-item').first().waitFor();assert(await hidden('esv'));assert(await page.locator('input[name="esv-recipient"]').count()>0);await page.locator('.modal-close').click();}
    finally {await page.evaluate(id=>api('DELETE',`/api/manager/surveys/${id}`),id);}
  });
  await login('qa_e2e_customer_a','customer-pass');
  await check('UX37','Popup Customer chỉ hiển thị đánh giá của mình và reply; dùng được ở 375px','không API quản trị/audit; không ID/lịch sử; reply mới và sản phẩm đúng',async()=>{
    await navigate('customer-feedback','#customer-feedback-list tbody tr');const requested=[];
    const listener=r=>{if(r.url().includes('/api/'))requested.push(new URL(r.url()).pathname);};page.on('request',listener);
    try {await page.locator('#customer-feedback-list tbody tr').filter({hasText:'qa_e2e_ui_product'}).click();await page.locator('#modal-body .customer-feedback-popup').waitFor();}
    finally {page.off('request',listener);}
    assert(requested.length>0);assert(requested.every(path=>/^\/api\/customer\/feedbacks\/\d+$/.test(path)));
    assert.match(await page.locator('.customer-feedback-product h3').textContent(),/qa_e2e_ui_product/);assert((await page.locator('.customer-feedback-reply').textContent()).includes(uiReply+' đã sửa'));
    assert.equal(await page.locator('#modal-body .record-details, #modal-body textarea').count(),0);await page.setViewportSize({width:375,height:812});
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('#main-content')).marginLeft==='0px');
    const dims=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert(dims.scroll<=dims.client+1,JSON.stringify(dims));
    await page.screenshot({path:'tests/artifacts/customer-feedback-mobile.png',fullPage:true,animations:'disabled'});
  });
  await check('UX16','Lỗi JavaScript toàn bộ flow','0 pageerror',async()=>assert.deepEqual(errors,[]));
  fs.writeFileSync('tests/artifacts/crm-ui-results.json',JSON.stringify(results,null,2));
  console.table(results.map(({id,status,scenario,actual})=>({id,status,scenario,actual})));
  console.log('CRM_UI_SUMMARY='+JSON.stringify({total:results.length,PASS:results.filter(r=>r.status==='PASS').length,FAIL:results.filter(r=>r.status==='FAIL').length}));
  if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
}
run().catch(error=>{console.error(error);process.exitCode=2;}).finally(async()=>{if(browser)await browser.close();});


