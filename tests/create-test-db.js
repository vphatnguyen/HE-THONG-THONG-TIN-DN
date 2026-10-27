// Creates a new isolated test database. Refuses to reset an existing database.
const sql=require('msnodesqlv8');
const fs=require('node:fs');
const database=process.env.DB_DATABASE;
async function run(){
  if(!database || !/^CosmeticsCRM_[A-Za-z0-9_]+_E2E_DB$/.test(database))throw new Error('Chọn DB_DATABASE mới có dạng CosmeticsCRM_<name>_E2E_DB');
  const connection=await sql.promises.open(`Driver={ODBC Driver 18 for SQL Server};Server=${process.env.DB_SERVER || '.\\SQLEXPRESS'};Database=master;Trusted_Connection=yes;TrustServerCertificate=yes;`);
  try{
    const exists=(await connection.promises.query('SELECT name FROM sys.databases WHERE name=?',[database])).first;
    if(exists?.length)throw new Error('Database đã tồn tại; không tự động reset dữ liệu');
    const schema=fs.readFileSync('database/schema_sqlserver.sql','utf8').replaceAll('CosmeticsCRM_DB',database);
    for(const batch of schema.split(/^GO\s*$/mi).map(s=>s.trim()).filter(Boolean))await connection.promises.query(batch);
    console.log(`Đã tạo database test mới ${database} bằng schema UTF-8.`);
  }finally{await connection.promises.close();}
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
