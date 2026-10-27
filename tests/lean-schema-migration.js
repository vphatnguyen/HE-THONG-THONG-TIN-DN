const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=require('msnodesqlv8');
const {assertTestEnvironment}=require('./test-safety');
const database=process.env.DB_DATABASE || 'CosmeticsCRM_E2E_DB';
const base=process.env.E2E_BASE_URL || 'http://localhost:3100';
async function run(){
  await assertTestEnvironment(base,database);
  const connection=await sql.promises.open(`Driver={ODBC Driver 18 for SQL Server};Server=${process.env.DB_SERVER || '.\\SQLEXPRESS'};Database=${database};Trusted_Connection=yes;TrustServerCertificate=yes;`);
  const query=async text=>(await connection.promises.query(text)).first || [];
  try{
    // Recreate the former columns only in this verified test DB so every run
    // exercises a real upgrade, including named CHECK and generated defaults.
    await query(`
      IF COL_LENGTH('dbo.Customers','membership_tier') IS NULL
        ALTER TABLE dbo.Customers ADD membership_tier NVARCHAR(10) NOT NULL DEFAULT 'BRONZE'
          CONSTRAINT CK_Customers_tier CHECK(membership_tier IN ('BRONZE','SILVER','GOLD','PLATINUM'));
      IF COL_LENGTH('dbo.Products','stock_quantity') IS NULL
        ALTER TABLE dbo.Products ADD stock_quantity INT NOT NULL DEFAULT 0;
    `);
    const snapshot=async()=>({
      counts:await query(`SELECT 'Accounts' AS entity,COUNT(*) AS n FROM Accounts UNION ALL SELECT 'Customers',COUNT(*) FROM Customers UNION ALL SELECT 'Products',COUNT(*) FROM Products UNION ALL SELECT 'Feedbacks',COUNT(*) FROM Feedbacks UNION ALL SELECT 'Surveys',COUNT(*) FROM Surveys UNION ALL SELECT 'SurveyResults',COUNT(*) FROM SurveyResults UNION ALL SELECT 'SurveyAnswers',COUNT(*) FROM SurveyAnswers`),
      customerDates:await query('SELECT id,created_at FROM Customers ORDER BY id'),
      productRatings:await query('SELECT product_id,COUNT(*) AS n,AVG(CAST(rating AS FLOAT)) AS average FROM Feedbacks GROUP BY product_id ORDER BY product_id')
    });
    const before=await snapshot();
    const migration=fs.readFileSync('database/migrations/20261028_remove_commerce_fields.sql','utf8');
    await query(migration);
    assert.deepEqual(await snapshot(),before,'Migration must retain rows, customer dates and product ratings');
    await query(migration);
    assert.deepEqual(await snapshot(),before,'Migration must be idempotent');
    const columns=(await query("SELECT COL_LENGTH('dbo.Customers','membership_tier') AS tier,COL_LENGTH('dbo.Products','stock_quantity') AS stock,COL_LENGTH('dbo.Customers','created_at') AS profile_date"))[0];
    assert.equal(columns.tier,null);assert.equal(columns.stock,null);assert(columns.profile_date>0);
    assert.equal((await query('DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS')).length,0);
    fs.writeFileSync('tests/artifacts/lean-schema-results.json',JSON.stringify({database,status:'PASS',checks:['approved columns removed','customer created_at retained','all row counts retained','product rating statistics retained','idempotent second run','constraints checked'],counts:before.counts},null,2));
    console.log('Lean schema migration: PASS (6 checks)');
  }finally{await connection.promises.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
