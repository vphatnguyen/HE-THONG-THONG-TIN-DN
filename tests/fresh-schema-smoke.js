// Smoke-test an explicitly selected test database with the current application.
const assert=require('node:assert/strict');
const {once}=require('node:events');
const fs=require('node:fs');
if(!/^CosmeticsCRM_[A-Za-z0-9_]+_E2E_DB$/.test(process.env.DB_DATABASE || ''))throw new Error('Select an isolated CRM E2E database');
process.env.VERCEL='1';
process.env.CRM_TEST_MODE='1';
const app=require('../server');
const db=require('../database/db');
async function run(){
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const base=`http://127.0.0.1:${server.address().port}`;
    const request=async(route,token,body)=>{
      const response=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
      const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;
    };
    const manager=await request('/api/auth/login',null,{username:'manager1',password:'manager123'});
    const products=await request('/api/admin/products',manager.token);
    assert(products.length>0);assert(products.every(p=>!Object.hasOwn(p,'stock_quantity')));
    const customers=await request('/api/manager/customers',manager.token);
    assert(customers.length>0);assert(customers.every(c=>!Object.hasOwn(c,'membership_tier')&&!Object.hasOwn(c,'avg_rating')));
    const customer=await request('/api/auth/login',null,{username:'khach001',password:'123456'});
    assert(customer.customer.created_at);assert(!Object.hasOwn(customer.customer,'membership_tier'));
    fs.writeFileSync('tests/artifacts/fresh-schema-results.json',JSON.stringify({database:process.env.DB_DATABASE,status:'PASS',products:products.length,customers:customers.length,checks:['schema initializes successfully','product API without inventory','customer API without tiers or average','customer metadata retained']},null,2));
    console.log('Fresh schema application smoke: PASS');
  }finally{await new Promise(resolve=>server.close(resolve));await db.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
