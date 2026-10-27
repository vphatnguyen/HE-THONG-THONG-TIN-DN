const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function context(filter={}) {
  const ctx=vm.createContext({document:{querySelector:()=>null},removeVietnameseTones:s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase()});
  vm.runInContext(fs.readFileSync('public/js/crud.js','utf8'),ctx);
  ctx.filter=filter;vm.runInContext('listToolsState.test=filter',ctx);return ctx;
}
const rows=[{id:12,title:'Dưỡng da',status:'ACTIVE',created_at:'2026-10-28T23:59:59'},{id:2,title:'Son',status:'CLOSED',created_at:'2026-10-01T00:00:00'},{id:3,title:'Kem',status:'ACTIVE',created_at:null}];
function refine(filter,items=rows){const ctx=context(filter);ctx.rows=items;return JSON.parse(vm.runInContext('JSON.stringify(refineList(rows,"test"))',ctx));}
test('combined inclusive date/status/search filters',()=>assert.deepEqual(refine({from:'2026-10-28',to:'2026-10-28',status:'ACTIVE',search:'duong'}).map(r=>r.id),[12]));
test('reversed range produces empty result',()=>assert.deepEqual(refine({from:'2026-10-29',to:'2026-10-01'}),[]));
test('missing dates excluded only when a date constraint exists',()=>{assert.equal(refine({}).length,3);assert.equal(refine({from:'2020-01-01'}).length,2);});
test('ID search accepts hash prefix',()=>assert.deepEqual(refine({search:'#12'}).map(r=>r.id),[12]));
test('ID search never matches a different ID containing the same digits',()=>assert.deepEqual(refine({search:'#12'},[...rows,{id:112,title:'Other'}]).map(r=>r.id),[12]));
test('numeric sort orders IDs numerically without mutating source',()=>{assert.deepEqual(refine({sort:'id:asc'}).map(r=>r.id),[2,3,12]);assert.equal(rows[0].id,12);});
test('deterministic ties fall back to ID',()=>assert.deepEqual(refine({sort:'status:asc'}).map(r=>r.id),[3,12,2]));
test('completed survey stays completed after closure',()=>assert.equal(vm.runInContext("customerSurveyStatus({status:'CLOSED',can_participate:0,already_submitted:1})",context()),'COMPLETED'));
test('expired active survey cannot be shown as available',()=>assert.equal(vm.runInContext("customerSurveyStatus({status:'ACTIVE',can_participate:0,already_submitted:0})",context()),'CLOSED'));
test('available survey is pending',()=>assert.equal(vm.runInContext('customerSurveyStatus({can_participate:1})',context()),'PENDING'));
test('empty data handled',()=>assert.deepEqual(refine({},[]),[]));
test('date-only values retain their calendar date',()=>assert.equal(vm.runInContext("localDateKey('2026-10-28')",context()),'2026-10-28'));
test('ISO timestamps are filtered by the displayed local calendar date',()=>{
  const value=new Date(2026,9,28,0,30).toISOString();
  assert.equal(refine({from:'2026-10-28',to:'2026-10-28'},[{id:1,created_at:value}]).length,1);
});
test('test harness rejects production database before any fetch',async()=>{
  const {assertTestEnvironment}=require('./test-safety');
  await assert.rejects(assertTestEnvironment('http://localhost:3100','CosmeticsCRM_DB'),/database riêng/);
  await assert.rejects(assertTestEnvironment('https://production.example','CosmeticsCRM_E2E_DB'),/loopback/);
});

test('product status labels retain API codes and show agreed language',()=>{const ctx=context();assert.equal(vm.runInContext("productStatusLabel('OFFICIAL')",ctx),'Đang bán');assert.equal(vm.runInContext("productStatusLabel('UPCOMING')",ctx),'Ngừng bán');});

test('Vietnamese date order parses unambiguously and retains leap days',()=>{
  const ctx=context();
  assert.equal(vm.runInContext("parseFilterDate('03/04/2026')",ctx),'2026-04-03');
  assert.equal(vm.runInContext("parseFilterDate('29/02/2028')",ctx),'2028-02-29');
  assert.equal(vm.runInContext("displayFilterDate('2026-04-03')",ctx),'03/04/2026');
});
test('invalid calendar dates and incomplete dates are rejected',()=>{
  const ctx=context();
  for(const value of ['29/02/2026','31/04/2026','01/13/2026','1/2/','abc']) {
    ctx.value=value;assert.throws(()=>vm.runInContext('parseFilterDate(value)',ctx));
    assert.deepEqual(refine({from:value}),[]);
  }
});
test('displayed date ranges compare calendar dates across month and year boundaries',()=>{
  const items=['2026-12-30T23:59:59','2026-12-31T00:00:00','2027-01-01T23:59:59.999','2027-01-02T00:00:00'].map((created_at,id)=>({id,created_at}));
  assert.deepEqual(refine({from:'31/12/2026',to:'01/01/2027'},items).map(r=>r.id),[2,1]);
  assert.deepEqual(refine({from:'02/01/2027',to:'31/12/2026'},items),[]);
});
