const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {assertTestEnvironment}=require('./test-safety');
const base=process.env.E2E_BASE_URL || 'http://localhost:3101';
const results=[];
let browser,page;
async function check(id,scenario,fn) {
  try {await fn();results.push({id,scenario,status:'PASS'});}
  catch(error) {results.push({id,scenario,status:'FAIL',error:error.message,inputs:await page.locator('#prod-minprice,#prod-maxprice').evaluateAll(inputs=>inputs.map(input=>({value:input.value,error:input.validationMessage}))),toasts:await page.locator('.toast').allTextContents()});}
}
async function run() {
  await assertTestEnvironment(base);
  browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
  page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(7000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let requests=[];
  page.on('request',request=>{const url=new URL(request.url());if(url.pathname==='/api/admin/products')requests.push(url);});
  async function login(username,password,route) {
    await page.goto(base);await page.evaluate(()=>logout());
    await page.locator('#login-username').fill(username);await page.locator('#login-password').fill(password);
    await page.locator('#login-btn').click();await page.locator('#app:not(.hidden)').waitFor();
    await page.locator('#nav-'+route).click();await page.locator('#prod-minprice').waitFor();
  }
  async function changeAndWait(action) {
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/admin/products');
    await action();const received=await response;assert.equal(received.status(),200);
    const rows=await received.json();
    await page.waitForFunction(ids=>JSON.stringify(currentProductsList.map(p=>p.id))===JSON.stringify(ids),rows.map(p=>p.id));
    return {url:new URL(received.url()),rows};
  }
  await login('manager1','manager123','manager-products');
  const original=await page.evaluate(()=>currentProductsList);
  await check('PRICE01','Nhập theo nghìn tự lọc; rời ô hiển thị 150.000đ; không có nút Lọc giá',async()=>{
    const result=await changeAndWait(async()=>{await page.locator('#prod-minprice').fill('150');await page.locator('#prod-maxprice').fill('500');await page.locator('#prod-sort').focus();});
    assert.equal(result.url.searchParams.get('min_price'),'150000');assert.equal(result.url.searchParams.get('max_price'),'500000');
    assert.equal(await page.locator('#prod-minprice').inputValue(),'150.000đ');assert.equal(await page.locator('#prod-maxprice').inputValue(),'500.000đ');
    assert.equal(await page.getByRole('button',{name:'Lọc giá',exact:true}).count(),0);
  });
  await check('PRICE02','Kết quả API đúng khoảng giá VND; không nhân nghìn lần nữa khi sửa',async()=>{
    const expected=original.filter(p=>p.price!==null && Number(p.price)>=150000 && Number(p.price)<=500000).map(p=>p.id).sort((a,b)=>a-b);
    assert.deepEqual(await page.evaluate(()=>currentProductsList.map(p=>p.id).sort((a,b)=>a-b)),expected);
    await page.screenshot({path:'tests/artifacts/product-price-filter.png',fullPage:true,animations:'disabled'});
    await page.locator('#prod-minprice').focus();assert.equal(await page.locator('#prod-minprice').inputValue(),'150');
    const result=await changeAndWait(()=>page.locator('#prod-minprice').fill('200'));
    assert.equal(result.url.searchParams.get('min_price'),'200000');assert.equal(await page.locator('#prod-minprice').inputValue(),'200');
    await page.locator('#prod-sort').focus();assert.equal(await page.locator('#prod-minprice').inputValue(),'200.000đ');
  });
  await check('PRICE03','Kết hợp sắp xếp giữ đúng khoảng giá đang lọc',async()=>{
    const result=await changeAndWait(()=>page.locator('#prod-sort').selectOption('price'));
    assert.equal(result.url.searchParams.get('min_price'),'200000');assert.equal(result.url.searchParams.get('max_price'),'500000');
  });
  await check('PRICE04','Giá sai/khoảng đảo không gọi API; xóa giá và Reset bỏ điều kiện',async()=>{
    for(const value of ['abc','-1','999999999999999999999','600']) {
      requests=[];await page.locator('#prod-minprice').fill(value);
      await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,400)));
      await page.locator('.toast.error').last().waitFor();assert.equal(requests.length,0);
    }
    const cleared=await changeAndWait(async()=>{
      await page.locator('#prod-minprice').focus();await page.locator('#prod-minprice').fill('');
      await page.locator('#prod-maxprice').focus();await page.locator('#prod-maxprice').fill('');
    });
    assert(!cleared.url.searchParams.has('min_price'));assert(!cleared.url.searchParams.has('max_price'));
    const zero=await changeAndWait(async()=>{await page.locator('#prod-minprice').fill('0');await page.locator('#prod-maxprice').fill('150');});
    assert.equal(zero.url.searchParams.get('min_price'),'0');assert.equal(zero.url.searchParams.get('max_price'),'150000');
    const reset=await changeAndWait(()=>page.locator('button[onclick="resetProductFilters()"]').click());
    assert(!reset.url.searchParams.has('min_price'));assert(!reset.url.searchParams.has('max_price'));
    assert.equal(await page.locator('#prod-minprice').inputValue(),'');assert.equal(await page.locator('#prod-maxprice').inputValue(),'');
  });
  await check('PRICE05','Bộ lọc tự động dùng được ở 375px; không lỗi JavaScript',async()=>{
    await changeAndWait(async()=>{await page.locator('#prod-minprice').fill('150');await page.locator('#prod-sort').focus();});
    await page.setViewportSize({width:375,height:812});
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('#main-content')).marginLeft==='0px');
    assert(await page.locator('#prod-minprice').isVisible());assert.equal(await page.getByRole('button',{name:'Lọc giá',exact:true}).count(),0);
    const dims=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    assert(dims.scroll<=dims.client+1,JSON.stringify(dims));assert.deepEqual(errors,[]);
    await page.screenshot({path:'tests/artifacts/product-price-mobile.png',fullPage:true,animations:'disabled'});
  });
  fs.writeFileSync('tests/artifacts/product-price-results.json',JSON.stringify(results,null,2));
  console.table(results);if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
}
run().catch(error=>{console.error(error);process.exitCode=2;}).finally(async()=>{if(browser)await browser.close();});
