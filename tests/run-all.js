const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const {assertTestEnvironment}=require('./test-safety');
const suites=[
  ['lean-schema',['tests/lean-schema-migration.js'],'lean-schema.log'],
  ['unit',['--test','tests/list-tools.test.js'],'unit.log'],
  ['api-existing',['tests/e2e-system.js'],'api-regression.log'],
  ['api-crm',['tests/crm-regression.js'],'crm-api.log'],
  ['ui-existing',['tests/ui-e2e.js'],'ui-regression.log'],
  ['ui-crm',['tests/crm-ui-regression.js'],'crm-ui.log'],
  ['pagination-filters',['tests/test-pagination-filters.js'],'pagination.log'],
  ['admin-api',['tests/test-admin-hasaki-features.js'],'admin-api.log'],
  ['admin-ui',['tests/test-ui-admin-hasaki.js'],'admin-ui.log']
];
async function run(){
  const base=process.env.E2E_BASE_URL || 'http://localhost:3100';
  const database=process.env.DB_DATABASE || 'CosmeticsCRM_E2E_DB';
  await assertTestEnvironment(base,database);
  const manifest={date:new Date().toISOString(),base,database,suites:[]};
  fs.mkdirSync('tests/artifacts',{recursive:true});
  for(const [name,args,log] of suites){
    const result=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,env:process.env});
    fs.writeFileSync('tests/artifacts/'+log,(result.stdout || '')+(result.stderr || ''));
    const status=result.status===0?'PASS':'FAIL';
    manifest.suites.push({name,args,status,exitCode:result.status,log});console.log(`${name}: ${status}`);
  }
  fs.writeFileSync('tests/artifacts/test-manifest.json',JSON.stringify(manifest,null,2));
  if(manifest.suites.some(s=>s.status==='FAIL'))process.exitCode=1;
}
run().catch(error=>{console.error(error);process.exitCode=2;});
