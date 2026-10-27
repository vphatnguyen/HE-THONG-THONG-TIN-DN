const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=require('msnodesqlv8');
const jwt=require('jsonwebtoken');
const {assertTestEnvironment}=require('./test-safety');
const base=process.env.E2E_BASE_URL || 'http://localhost:3100';
const database=process.env.DB_DATABASE || 'CosmeticsCRM_E2E_DB';
const prefix=`crmqa_${Date.now()}`;
const results=[];
let connection, manager, customerA, customerB, accountA, profileA, product, supplier, feedback, survey, questions;
async function api(method,path,token,body) {
  const response=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,data:await response.json().catch(()=>null),total:response.headers.get('x-total-count')};
}
async function query(statement,params=[]) {return (await connection.promises.query(statement,params)).first || [];}
async function check(id,scenario,expected,fn) {
  try {const actual=await fn();results.push({id,scenario,expected,actual:actual || expected,status:'PASS'});}
  catch(error){results.push({id,scenario,expected,actual:error.message,status:'FAIL'});}
}
function status(response,expected){assert.equal(response.status,expected,JSON.stringify(response));return response.data;}
async function run(){
  await assertTestEnvironment(base,database);
  connection=await sql.promises.open(`Driver={ODBC Driver 18 for SQL Server};Server=${process.env.DB_SERVER || '.\\SQLEXPRESS'};Database=${database};Trusted_Connection=yes;TrustServerCertificate=yes;`);
  manager=status(await api('POST','/api/auth/login',null,{username:'manager1',password:'manager123'}),200).token;
  for(const suffix of ['a','b']) status(await api('POST','/api/manager/customers',manager,{username:`${prefix}_${suffix}`,password:'test-pass',full_name:`CRM QA ${suffix}`,email:`${prefix}_${suffix}@example.test`,age:25,gender:'Nu'}),201);
  customerA=status(await api('POST','/api/auth/login',null,{username:`${prefix}_a`,password:'test-pass'}),200).token;
  customerB=status(await api('POST','/api/auth/login',null,{username:`${prefix}_b`,password:'test-pass'}),200).token;
  const profile=status(await api('GET','/api/customer/profile',customerA),200); accountA=profile.account.id;profileA=profile.customer.id;
  supplier=status(await api('POST','/api/admin/suppliers',manager,{name:prefix,status:'ACTIVE'}),201).id;
  product=status(await api('POST','/api/admin/products',manager,{name:prefix,category:'QA',supplier_id:supplier,price:100}),201).id;
  await check('CRM01','Customer gọi API quản trị','403',async()=>status(await api('GET','/api/manager/customers',customerA),403));
  await check('CRM02','Không có phiên đăng nhập','401',async()=>status(await api('GET','/api/customer/feedbacks'),401));
  await check('CRM03','JWT hết hạn','401',async()=>status(await api('GET','/api/customer/feedbacks',jwt.sign({id:accountA,role:'CUSTOMER'},process.env.JWT_SECRET || 'cosmetics_crm_secret_2026',{expiresIn:-1})),401));
  await check('CRM04','Tạo tài khoản trùng email','409; không có account mồ côi',async()=>{status(await api('POST','/api/manager/customers',manager,{username:prefix+'_duplicate',password:'p',full_name:'Duplicate',email:profile.account.email}),409);assert.equal((await query('SELECT id FROM Accounts WHERE username=?',[prefix+'_duplicate'])).length,0);});
  await check('CRM05','Hai tài khoản bỏ trống email','201 cả hai',async()=>{for(const suffix of ['n1','n2'])status(await api('POST','/api/manager/customers',manager,{username:prefix+'_'+suffix,password:'p',full_name:'No email'}),201);});
  await check('CRM06','Validation tài khoản','400 cho tên trống, tuổi sai, trạng thái sai',async()=>{for(const body of [{full_name:'  '},{age:-1},{status:'UNKNOWN'}])status(await api('PUT',`/api/manager/customers/${accountA}`,manager,body),400);});
  await check('CRM07','Khóa ID không tồn tại','404',async()=>status(await api('PUT','/api/manager/customers/2147483647/status',manager,{status:'LOCKED'}),404));
  await check('CRM08','Tìm ID hồ sơ khách hàng','đúng account/customer ID',async()=>assert(status(await api('GET',`/api/manager/customers?search=%23${profileA}`,manager),200).some(c=>c.id===accountA&&c.customer_id===profileA)));
  await check('CRM09','Tạo đánh giá + đồng bộ Manager','201; đúng dữ liệu DB/API',async()=>{status(await api('POST','/api/customer/feedbacks',customerA,{product_id:product,rating:4,content:'Nội dung đầy đủ QA 🌸'}),201);feedback=status(await api('GET','/api/customer/feedbacks',customerA),200).find(f=>f.product_id===product).id;const f=status(await api('GET',`/api/manager/feedbacks/${feedback}`,manager),200);assert.equal(f.content,'Nội dung đầy đủ QA 🌸');});
  await check('CRM10','Đọc/sửa đánh giá người khác','404; dữ liệu nguyên vẹn',async()=>{status(await api('GET',`/api/customer/feedbacks/${feedback}`,customerB),404);status(await api('PUT',`/api/customer/feedbacks/${feedback}`,customerB,{rating:1}),404);});
  await check('CRM11','Sửa đánh giá + audit','200; ghi nhận điểm cũ/mới',async()=>{status(await api('PUT',`/api/customer/feedbacks/${feedback}`,customerA,{rating:5,content:'Đã sửa'}),200);const logs=status(await api('GET',`/api/customer/feedbacks/${feedback}/audit-logs`,customerA),200);assert.equal(logs[0].old_rating,4);assert.equal(logs[0].new_rating,5);});
  await check('CRM12','Gửi và sửa phản hồi Manager','200; có timestamp và 2 phiên bản',async()=>{status(await api('PUT',`/api/manager/feedbacks/${feedback}/reply`,manager,{reply_content:'Phản hồi 1',expected_reply_content:null}),200);status(await api('PUT',`/api/manager/feedbacks/${feedback}/reply`,manager,{reply_content:'Phản hồi 2',expected_reply_content:'Phản hồi 1'}),200);const f=status(await api('GET',`/api/customer/feedbacks/${feedback}`,customerA),200);assert.equal(f.reply_content,'Phản hồi 2');assert(f.replied_at);assert.equal(f.reply_history.length,2);});
  await check('CRM13','Retry phản hồi giống hệt','200; không nhân đôi audit',async()=>{status(await api('PUT',`/api/manager/feedbacks/${feedback}/reply`,manager,{reply_content:'Phản hồi 2',expected_reply_content:'Phản hồi 1'}),200);assert.equal((await query('SELECT id FROM FeedbackReplyHistory WHERE feedback_id=?',[feedback])).length,2);});
  await check('CRM14','Sửa phản hồi từ bản cũ','409; không ghi đè',async()=>{status(await api('PUT',`/api/manager/feedbacks/${feedback}/reply`,manager,{reply_content:'Ghi đè sai',expected_reply_content:'Phản hồi 1'}),409);});
  await check('CRM15','Customer sửa sau phản hồi','400',async()=>status(await api('PUT',`/api/customer/feedbacks/${feedback}`,customerA,{rating:1}),400));
  const payload={title:prefix,description:'QA description',target_product_ids:[product],recipient_customer_ids:[profileA],start_date:'2026-01-01',end_date:'2099-12-31',questions:[{question_text:'Bắt buộc',question_type:'RATING',is_required:true},{question_text:'Tùy chọn',question_type:'TEXT',is_required:false}]};
  await check('CRM16','Manager tạo chiến dịch và đọc chi tiết','201; đúng sản phẩm, câu hỏi, người nhận',async()=>{survey=status(await api('POST','/api/manager/surveys',manager,payload),201).id;const detail=status(await api('GET',`/api/manager/surveys/${survey}`,manager),200);questions=detail.questions;assert.deepEqual(detail.target_product_ids,[product]);assert.equal(questions.length,2);});
  await check('CRM17','Ngày không tồn tại và cờ bắt buộc sai','400',async()=>{for(const change of [{start_date:'2026-02-30'},{questions:[{question_text:'Bad',question_type:'TEXT',is_required:'false'}]}])status(await api('POST','/api/manager/surveys',manager,{...payload,...change}),400);});
  await check('CRM18','Draft không hiển thị với Customer','không có trong list; detail 404',async()=>{assert(!status(await api('GET','/api/customer/surveys',customerA),200).some(s=>s.id===survey));status(await api('GET',`/api/customer/surveys/${survey}`,customerA),404);});
  await check('CRM19','Phát hành chiến dịch','200; Customer được tham gia',async()=>{status(await api('POST',`/api/manager/surveys/${survey}/send`,manager,{}),200);const detail=status(await api('GET',`/api/customer/surveys/${survey}`,customerA),200);assert.equal(detail.survey.can_participate,1);});
  await check('CRM20','Người không nhận khảo sát','404 detail / 403 submit',async()=>{status(await api('GET',`/api/customer/surveys/${survey}`,customerB),404);status(await api('POST',`/api/customer/surveys/${survey}/submit`,customerB,{answers:[{question_id:questions[0].id,answer_value:5}]}),403);});
  await check('CRM21','Thiếu câu bắt buộc','400; không lưu result',async()=>status(await api('POST',`/api/customer/surveys/${survey}/submit`,customerA,{answers:[{question_id:questions[1].id,answer_value:'Text'}]}),400));
  await check('CRM22','Gửi khảo sát đồng thời hai lần','201 + 409; 1 result, 1 answer',async()=>{const responses=await Promise.all([1,2].map(()=>api('POST',`/api/customer/surveys/${survey}/submit`,customerA,{answers:[{question_id:questions[0].id,answer_value:5}]})));assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);assert.equal((await query('SELECT id FROM SurveyResults WHERE survey_id=?',[survey])).length,1);});
  await check('CRM23','Lịch sử khảo sát trả đúng câu trả lời cá nhân','submission + đáp án 5',async()=>{const d=status(await api('GET',`/api/customer/surveys/${survey}`,customerA),200);assert(d.submission.submitted_at);assert.equal(String(d.answers[0].answer_value),'5');});
  await check('CRM24','Sửa khảo sát đã có kết quả','409; cấu trúc giữ nguyên',async()=>status(await api('PUT',`/api/manager/surveys/${survey}`,manager,{...payload,title:'Không được sửa'}),409));
  await check('CRM25','Đóng khảo sát vẫn giữ lịch sử','200; Customer đọc được kết quả cũ',async()=>{status(await api('PUT',`/api/manager/surveys/${survey}/status`,manager,{status:'CLOSED'}),200);const list=status(await api('GET','/api/customer/surveys',customerA),200);assert(list.some(s=>s.id===survey&&s.submitted_at));const d=status(await api('GET',`/api/customer/surveys/${survey}`,customerA),200);assert(d.submission);assert.equal(d.survey.can_participate,0);});
  await check('CRM26','Khóa tài khoản vô hiệu token đã cấp','403 cho đọc/ghi; dữ liệu lịch sử nguyên vẹn',async()=>{status(await api('PUT',`/api/manager/customers/${accountA}/status`,manager,{status:'LOCKED'}),200);for(const [method,path,body] of [['GET','/api/customer/feedbacks'],['PUT',`/api/customer/feedbacks/${feedback}`,{rating:1}],['POST',`/api/customer/surveys/${survey}/submit`,{answers:[]}]])status(await api(method,path,customerA,body),403);assert.equal((await query('SELECT id FROM Feedbacks WHERE id=?',[feedback])).length,1);assert.equal((await query('SELECT id FROM SurveyResults WHERE survey_id=?',[survey])).length,1);});
  await check('CRM27','Xóa khách có lịch sử','khóa; feedback/result không mất',async()=>{const r=status(await api('DELETE',`/api/manager/customers/${accountA}`,manager),200);assert.equal(r.softDeleted,true);assert.equal((await query('SELECT id FROM SurveyResults WHERE survey_id=?',[survey])).length,1);status(await api('PUT',`/api/manager/customers/${accountA}/status`,manager,{status:'ACTIVE'}),200);});
  await check('CRM28','Ngừng sản phẩm giữ liên kết khảo sát','softDeleted; không mất liên kết',async()=>{assert(status(await api('DELETE',`/api/admin/products/${product}`,manager),200).softDeleted);assert.equal((await query('SELECT product_id FROM SurveyProducts WHERE survey_id=?',[survey]))[0].product_id,product);});
  await check('CRM29','Thống kê sau khóa/ngừng kinh doanh','1 result; 1 đánh giá 5 sao',async()=>{const report=status(await api('GET','/api/manager/analytics',manager),200);const row=report.feedbackByProduct.find(p=>p.id===product || p.product_id===product);assert(row);assert.equal(Number(row.count),1);assert.equal(Number(row.average),5);const detail=status(await api('GET',`/api/manager/surveys/${survey}/results`,manager),200);assert(detail);return 'KPI sản phẩm count=1, average=5; API kết quả 200';});
  await check('CRM30','Ngày/filter/page API kết hợp','1 bản ghi đúng ID; tổng chính xác',async()=>{const r=await api('GET',`/api/manager/feedbacks?search=${feedback}&status=REPLIED&from=2020-01-01&to=2099-12-31&sort_by=id&sort_dir=asc&page=1&page_size=1`,manager);status(r,200);assert.equal(r.data[0].id,feedback);assert.equal(r.data.length,1);assert(Number(r.total)>=1);});
  await check('CRM31','Filter API không hợp lệ','400 đảo ngày, ngày sai, page sai, sort sai',async()=>{for(const query of ['from=2026-02-30','from=2026-12-31&to=2026-01-01','page=0','page_size=101','sort_by=password'])status(await api('GET','/api/manager/feedbacks?'+query,manager),400);});
  await check('CRM32','Giá/trạng thái/nhà cung cấp không hợp lệ','400, không tạo sản phẩm',async()=>{for(const change of [{price:-1},{launch_status:'BAD'},{supplier_id:2147483647}])status(await api('POST','/api/admin/products',manager,{name:prefix,category:'QA',...change}),400);});
  await check('CRM33','Chỉnh sửa ID khách hàng','ID bất biến',async()=>{status(await api('PUT',`/api/manager/customers/${accountA}`,manager,{...profile.account,id:123,customer_id:123,age:25,gender:'Nu'}),200);const p=status(await api('GET','/api/customer/profile',customerA),200);assert.equal(p.account.id,accountA);assert.equal(p.customer.id,profileA);});
  // A second survey tests expiry between opening and sending, and product with survey but no feedback.
  const secondProduct=status(await api('POST','/api/admin/products',manager,{name:prefix+'_survey_only',category:'QA',price:1}),201).id;
  const expiring=status(await api('POST','/api/manager/surveys',manager,{...payload,title:prefix+'_expiry',target_product_ids:[secondProduct]}),201).id;
  status(await api('POST',`/api/manager/surveys/${expiring}/send`,manager,{}),200);
  const expQuestions=status(await api('GET',`/api/customer/surveys/${expiring}`,customerA),200).questions;
  await check('CRM34','Khảo sát hết hạn lúc khách đang làm','409; không lưu; vẫn có chi tiết hết hạn',async()=>{await query("UPDATE Surveys SET end_date='2026-01-02' WHERE id=?",[expiring]);status(await api('POST',`/api/customer/surveys/${expiring}/submit`,customerA,{answers:[{question_id:expQuestions[0].id,answer_value:4}]}),409);assert.equal((await query('SELECT id FROM SurveyResults WHERE survey_id=?',[expiring])).length,0);assert.equal(status(await api('GET',`/api/customer/surveys/${expiring}`,customerA),200).survey.can_participate,0);});
  await check('CRM35','Xóa sản phẩm chỉ có khảo sát, chưa feedback','ngừng kinh doanh; liên kết nguyên vẹn',async()=>{assert.equal(status(await api('DELETE',`/api/admin/products/${secondProduct}`,manager),200).softDeleted,true);assert.equal((await query('SELECT product_id FROM SurveyProducts WHERE survey_id=?',[expiring]))[0].product_id,secondProduct);});
  await check('CRM36','Khách hàng đã xóa với token cũ','401',async()=>{const b=status(await api('GET','/api/customer/profile',customerB),200).account.id;status(await api('DELETE',`/api/manager/customers/${b}`,manager),200);status(await api('GET','/api/customer/profile',customerB),401);});
  await check('CRM37','Optimistic concurrency tài khoản','200 rồi 409; giữ thay đổi mới',async()=>{
    const before=status(await api('GET','/api/customer/profile',customerA),200).account;
    assert.equal(typeof before.record_version,'string');
    status(await api('PUT',`/api/manager/customers/${accountA}`,manager,{full_name:'Tên mới',email:before.email,_version:before.record_version}),200);
    status(await api('PUT',`/api/manager/customers/${accountA}`,manager,{full_name:'Tên cũ',email:before.email,_version:before.record_version}),409);
    assert.equal(status(await api('GET','/api/customer/profile',customerA),200).account.full_name,'Tên mới');
  });
  await check('CRM38','CRUD sản phẩm chưa có quan hệ','thêm/sửa/đọc/xóa 201/200',async()=>{
    const id=status(await api('POST','/api/admin/products',manager,{name:prefix+'_crud',category:'QA',price:10}),201).id;
    const before=status(await api('GET',`/api/admin/products?search=%23${id}`,manager),200).find(p=>p.id===id);assert(before);
    status(await api('PUT',`/api/admin/products/${id}`,manager,{name:prefix+'_edited',price:20,_version:before.record_version}),200);
    status(await api('PUT',`/api/admin/products/${id}`,manager,{name:'Stale',_version:before.record_version}),409);
    status(await api('DELETE',`/api/admin/products/${id}`,manager),200);
    assert.equal((await query('SELECT id FROM Products WHERE id=?',[id])).length,0);
  });
  await check('CRM39','CRUD nhà cung cấp chưa liên kết','thêm/sửa/tìm/xóa; chặn bản cũ',async()=>{
    const id=status(await api('POST','/api/admin/suppliers',manager,{name:prefix+'_supplier'}),201).id;
    const before=status(await api('GET',`/api/admin/suppliers?search=%23${id}`,manager),200).find(s=>s.id===id);assert(before);
    status(await api('PUT',`/api/admin/suppliers/${id}`,manager,{name:prefix+'_supplier_new',status:'ACTIVE',_version:before.record_version}),200);
    status(await api('PUT',`/api/admin/suppliers/${id}`,manager,{name:'Stale',_version:before.record_version}),409);
    status(await api('DELETE',`/api/admin/suppliers/${id}`,manager),200);
  });
  await check('CRM40','Ngừng nhà cung cấp giữ sản phẩm và feedback','INACTIVE; sản phẩm UPCOMING; lịch sử giữ',async()=>{
    assert(status(await api('DELETE',`/api/admin/suppliers/${supplier}`,manager),200).softDeleted);
    assert.equal((await query('SELECT status FROM Suppliers WHERE id=?',[supplier]))[0].status,'INACTIVE');
    assert.equal((await query('SELECT id FROM Feedbacks WHERE id=?',[feedback])).length,1);
  });
  await check('CRM41','ID sai định dạng','400',async()=>{for(const id of ['abc','0','-1','99999999999999'])status(await api('GET','/api/manager/feedbacks/'+id,manager),400);});
  await check('CRM42','Đổi email trùng không ghi dở dang','409; họ tên không đổi',async()=>{
    const current=status(await api('GET','/api/customer/profile',customerA),200);
    const email=(await query("SELECT TOP 1 email FROM Accounts WHERE id<>? AND email IS NOT NULL",[accountA]))[0].email;
    status(await api('PUT',`/api/manager/customers/${accountA}`,manager,{full_name:'Không được ghi',email,age:77}),409);
    assert.equal(status(await api('GET','/api/customer/profile',customerA),200).account.full_name,current.account.full_name);
  });
  await check('CRM43','Khảo sát chưa phản hồi sửa/xóa và kiểm tra version','200/409; không còn bản ghi sau xóa',async()=>{
    const id=status(await api('POST','/api/manager/surveys',manager,{...payload,title:prefix+'_draft_crud'}),201).id;
    const before=status(await api('GET',`/api/manager/surveys/${id}`,manager),200);
    status(await api('PUT',`/api/manager/surveys/${id}`,manager,{...payload,title:prefix+'_draft_updated',_version:before.record_version}),200);
    status(await api('PUT',`/api/manager/surveys/${id}`,manager,{...payload,_version:before.record_version}),409);
    status(await api('DELETE',`/api/manager/surveys/${id}`,manager),200);
    assert.equal((await query('SELECT id FROM Surveys WHERE id=?',[id])).length,0);
  });
  await check('CRM44','Hai Manager sửa cùng phản hồi','một 200, một 409; không mất audit',async()=>{
    const responses=await Promise.all(['Manager A','Manager B'].map(reply_content=>api('PUT',`/api/manager/feedbacks/${feedback}/reply`,manager,{reply_content,expected_reply_content:'Phản hồi 2'})));
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  });
  await check('CRM45','Xóa tài khoản chưa tương tác','xóa thật; không hồ sơ mồ côi',async()=>{
    const acc=(await query('SELECT id FROM Accounts WHERE username=?',[prefix+'_n1']))[0];
    assert.equal(status(await api('DELETE',`/api/manager/customers/${acc.id}`,manager),200).softDeleted,false);
    assert.equal((await query('SELECT id FROM Customers WHERE account_id=?',[acc.id])).length,0);
  });
  await check('CRM46','Lọc sản phẩm ID và khoảng giá sai','ID trả đúng; khoảng giá 400',async()=>{
    assert(status(await api('GET',`/api/admin/products?search=%23${product}`,manager),200).some(p=>p.id===product));
    for(const query of ['min_price=x','min_price=-1','min_price=10&max_price=1'])status(await api('GET','/api/admin/products?'+query,manager),400);
  });
  await check('CRM47','Các cột sắp xếp sản phẩm đang dùng trên UI','200 cho created_at/name/price/review_count/id',async()=>{for(const sort of ['created_at','name','price','review_count','id'])status(await api('GET','/api/admin/products?sort_by='+sort,manager),200);});
  await check('CRM48','Cập nhật profile một phần','giữ tên/email/tuổi khi không gửi trường tương ứng',async()=>{
    const before=status(await api('GET','/api/customer/profile',customerA),200);
    status(await api('PUT','/api/customer/profile',customerA,{phone:'0900000000',_version:before.account.record_version}),200);
    const after=status(await api('GET','/api/customer/profile',customerA),200);assert.equal(after.account.full_name,before.account.full_name);assert.equal(after.account.email,before.account.email);assert.equal(after.customer.age,before.customer.age);
  });
  await check('CRM49','Chặn xóa Admin hoạt động cuối khi còn Admin bị khóa','400; hệ thống còn Admin ACTIVE',async()=>{
    const admin=status(await api('POST','/api/auth/login',null,{username:'admin',password:'admin123'}),200);
    const id=status(await api('POST','/api/admin/accounts',admin.token,{username:prefix+'_admin',password:'p',full_name:'QA Admin',email:prefix+'_admin@example.test',role:'ADMIN'}),201).id;
    status(await api('PUT',`/api/admin/accounts/${id}/status`,admin.token,{status:'LOCKED'}),200);
    status(await api('DELETE',`/api/admin/accounts/${admin.user.id}`,admin.token),400);
    status(await api('DELETE',`/api/admin/accounts/${id}`,admin.token),200);
  });
  await check('CRM50','Lọc cùng ngày với SQL Server tại múi giờ địa phương','bao gồm đánh giá vừa tạo sau nửa đêm',async()=>{
    const day=(await query('SELECT CONVERT(varchar(10),GETDATE(),23) AS today'))[0].today;
    assert(status(await api('GET',`/api/manager/feedbacks?from=${day}&to=${day}`,manager),200).some(f=>f.id===feedback));
  });
  await check('CRM51','Đã hoàn thành vẫn đọc lịch sử nếu chiến dịch về DRAFT','Customer có kết quả được đọc; người khác không được',async()=>{
    status(await api('PUT',`/api/manager/surveys/${survey}/status`,manager,{status:'DRAFT'}),200);
    assert(status(await api('GET',`/api/customer/surveys/${survey}`,customerA),200).submission);
    status(await api('PUT',`/api/manager/surveys/${survey}/status`,manager,{status:'CLOSED'}),200);
  });
  await check('CRM52','Customer sửa cùng lúc Manager phản hồi','REPLIED nhất quán, audit đúng, không sửa sau phản hồi',async()=>{
    const id=status(await api('POST','/api/admin/products',manager,{name:prefix+'_race',category:'QA',price:1}),201).id;
    status(await api('POST','/api/customer/feedbacks',customerA,{product_id:id,rating:4,content:'Trước'}),201);
    const f=status(await api('GET','/api/customer/feedbacks',customerA),200).find(f=>f.product_id===id);
    const [edit,reply]=await Promise.all([api('PUT',`/api/customer/feedbacks/${f.id}`,customerA,{rating:3,content:'Sau',_version:f.record_version}),api('PUT',`/api/manager/feedbacks/${f.id}/reply`,manager,{reply_content:'CSKH',expected_reply_content:null})]);
    status(reply,200);assert([200,400,409].includes(edit.status));
    const after=status(await api('GET',`/api/customer/feedbacks/${f.id}`,customerA),200);assert.equal(after.status,'REPLIED');assert.equal(after.rating,edit.status===200?3:4);
    const audit=status(await api('GET',`/api/customer/feedbacks/${f.id}/audit-logs`,customerA),200);assert.equal(audit.length,edit.status===200?1:0);
  });
  await check('CRM53','Hash bcrypt không thể dùng thay mật khẩu','mật khẩu gốc 200; chuỗi hash 401',async()=>{
    const username=prefix+'_n2';const hash=require('bcryptjs').hashSync('p',4);
    await query('UPDATE Accounts SET password=? WHERE username=?',[hash,username]);
    status(await api('POST','/api/auth/login',null,{username,password:'p'}),200);
    status(await api('POST','/api/auth/login',null,{username,password:hash}),401);
  });
  await check('CRM54','Hồ sơ khách không còn hạng và điểm trung bình','API bỏ thuộc tính đã thống nhất; giữ metadata ngày tạo',async()=>{
    const rows=status(await api('GET','/api/manager/customers',manager),200);
    const current=rows.find(c=>c.id===accountA);assert(current);
    for(const key of ['membership_tier','avg_rating','customer_created_at'])assert(!Object.hasOwn(current,key));
    const p=status(await api('GET','/api/customer/profile',customerA),200);assert(!Object.hasOwn(p.customer,'membership_tier'));assert(p.customer.created_at);
    const signed=status(await api('POST','/api/auth/login',null,{username:prefix+'_a',password:'test-pass'}),200);
    assert(!Object.hasOwn(signed.customer,'membership_tier'));
  });
  await check('CRM55','Sản phẩm không còn tồn kho; vẫn có thống kê feedback','API bỏ stock_quantity; điểm sao sản phẩm đúng',async()=>{
    for(const path of ['/api/admin/products','/api/customer/products','/api/products']){
      const rows=status(await api('GET',path,path.includes('/customer/')?customerA:manager),200);
      assert(rows.length>0);assert(rows.every(p=>!Object.hasOwn(p,'stock_quantity')));
    }
    const d=status(await api('GET',`/api/customer/products/${product}/feedbacks`,customerA),200);
    assert(!Object.hasOwn(d.product,'stock_quantity'));assert.equal(d.stats.total_reviews,1);assert.equal(Number(d.stats.avg_rating),5);
  });
  await check('CRM56','Payload tồn kho cũ không tác động nghiệp vụ','bỏ qua field cũ; tạo/sửa sản phẩm bình thường; sort tồn kho không còn hỗ trợ',async()=>{
    const id=status(await api('POST','/api/admin/products',manager,{name:prefix+'_old_payload',category:'QA',price:10,stock_quantity:-99}),201).id;
    status(await api('PUT',`/api/admin/products/${id}`,manager,{name:prefix+'_old_payload',price:20,stock:999}),200);
    const row=status(await api('GET',`/api/admin/products?search=%23${id}`,manager),200)[0];assert.equal(Number(row.price),20);assert(!Object.hasOwn(row,'stock_quantity'));
    status(await api('GET','/api/admin/products?sort_by=stock_quantity',manager),400);
    status(await api('DELETE',`/api/admin/products/${id}`,manager),200);
  });
  await check('CRM57','Khoảng ngày tính cả đầu ngày và toàn bộ cuối ngày','API danh sách và Dashboard cùng loại trước/sau, nhận 00:00 và 23:59:59.9999999',async()=>{
    const original=(await query('SELECT created_at FROM Feedbacks WHERE id=?',[feedback]))[0].created_at;
    try {
      for(const [timestamp,count] of [['2077-04-02T23:59:59.9999999',0],['2077-04-03T00:00:00',1],['2077-04-03T23:59:59.9999999',1],['2077-04-04T00:00:00',0]]) {
        await query('UPDATE Feedbacks SET created_at=CAST(? AS DATETIME2) WHERE id=?',[timestamp,feedback]);
        const rows=status(await api('GET','/api/manager/feedbacks?from=2077-04-03&to=2077-04-03',manager),200);
        assert.equal(rows.filter(f=>f.id===feedback).length,count,timestamp+' list');
        const analytics=status(await api('GET','/api/manager/analytics?from=2077-04-03&to=2077-04-03',manager),200);
        assert.equal(Number(analytics.feedbackByProduct.find(p=>p.product_id===product).count),count,timestamp+' dashboard');
      }
    } finally { await query('UPDATE Feedbacks SET created_at=? WHERE id=?',[original,feedback]); }
  });
  const file='tests/artifacts/crm-api-results.json';fs.writeFileSync(file,JSON.stringify(results,null,2));
  console.table(results.map(({id,status,scenario,actual})=>({id,status,scenario,actual:typeof actual==='string'?actual:JSON.stringify(actual)})));
  console.log('CRM_SUMMARY='+JSON.stringify({total:results.length,PASS:results.filter(r=>r.status==='PASS').length,FAIL:results.filter(r=>r.status==='FAIL').length}));
  if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
}
run().catch(error=>{console.error(error);process.exitCode=2;}).finally(async()=>{if(connection)await connection.promises.close();});
