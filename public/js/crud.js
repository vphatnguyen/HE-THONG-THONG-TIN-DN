/* Shared list/detail presentation. Existing module services and forms remain authoritative. */
const listToolsState = {};
function viewablePassword(value) {
  return /^\$2[aby]\$\d{2}\$/.test(String(value || '')) ? '' : value || '';
}
function passwordNote(value) {
  return viewablePassword(value) ? '' : '<small>(Để trống để giữ mật khẩu cũ; mật khẩu bcrypt cũ chỉ có thể đặt lại)</small>';
}
function resetVisibleListTools(key) {
  const bar=document.querySelector(`[data-list-tools="${key}"]`);
  if (!bar) return;
  bar.querySelectorAll('input').forEach(input=>input.value='');
  bar.querySelectorAll('select').forEach(select=>select.selectedIndex=0);
  const config=Object.values(listToolsConfig).find(config=>config[0]===key);
  const sort=bar.querySelector('[data-filter=sort]');
  if(sort && config)sort.value=`${config[2]}:desc`;
}
const listToolsConfig = {
  'customers-tbody': ['customers', 'renderCustomerTablePage', 'created_at', ['customer_id','full_name','created_at']],
  'accounts-tbody': ['accounts', 'renderAccountTablePage', 'created_at', ['username','full_name','created_at']],
  'products-tbody': ['products', 'renderProductPage', 'created_at', ['id','name','price','created_at']],
  'suppliers-tbody': ['suppliers', 'renderSupplierPage', 'created_at', ['id','name','created_at']],
  'manager-survey-list': ['campaigns', 'renderManagerSurveysPage', 'start_date', ['id','title','start_date','end_date']],
  'feedback-list-container': ['manager-feedback', 'filterAndRenderFeedbacks', 'created_at', ['id','rating','created_at']],
  'customer-feedback-list': ['customer-feedback', 'handleCustomerFeedbackFilter', 'created_at', ['id','rating','created_at']],
  'customer-survey-list': ['customer-survey', 'handleCustomerSurveyFilter', 'end_date', ['id','title','end_date','submitted_at']]
};
// Display dates in Vietnamese order; API and stored filter state retain ISO dates.
function parseFilterDate(value) {
  const text=String(value || '').trim();
  if (!text) return '';
  const display=text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso=display ? `${display[3]}-${display[2]}-${display[1]}` : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Nhập ngày theo định dạng dd/mm/yyyy.');
  const date=new Date(`${iso}T00:00:00Z`);
  if (isNaN(date) || date.toISOString().slice(0,10)!==iso) throw new Error('Ngày không tồn tại. Nhập theo dd/mm/yyyy.');
  return iso;
}
function displayFilterDate(value) {
  return String(value || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');
}
function dateFilterInput(attributes, value='') {
  return `<input type="text" inputmode="numeric" placeholder="dd/mm/yyyy" maxlength="10" ${attributes} value="${escapeHtml(displayFilterDate(value))}">`;
}
function installListTools() {
  const labels = { id:'ID', customer_id:'ID khách hàng', username:'Tên đăng nhập', full_name:'Tên', name:'Tên', title:'Tên chiến dịch', price:'Giá', rating:'Số sao', created_at:'Ngày tạo', start_date:'Ngày bắt đầu', end_date:'Hạn tham gia', submitted_at:'Ngày hoàn thành' };
  Object.entries(listToolsConfig).forEach(([target, [key, callback, dateField, sorts]]) => {
    const element = document.getElementById(target);
    if (!element) return;
    const values = listToolsState[key] || {};
    const bar = document.createElement('div');
    bar.className = 'filter-bar list-tools';
    bar.dataset.listTools = key;
    bar.innerHTML = `${key === 'campaigns' ? `<input aria-label="Tìm chiến dịch" placeholder="ID hoặc tên chiến dịch" data-filter="search" value="${escapeHtml(values.search || '')}"><select aria-label="Trạng thái chiến dịch" data-filter="status"><option value="">Tất cả trạng thái</option>${['DRAFT','ACTIVE','CLOSED'].map(v=>`<option value="${v}" ${values.status === v ? 'selected' : ''}>${({DRAFT:'Bản nháp',ACTIVE:'Đang mở',CLOSED:'Đã đóng'})[v]}</option>`).join('')}</select>` : ''}
      <label>${labels[dateField]} từ ${dateFilterInput('aria-label="Từ ngày" data-filter="from"',values.from)}</label>
      <label>Đến ${dateFilterInput('aria-label="Đến ngày" data-filter="to"',values.to)}</label>
      ${key === 'products' ? '' : `<label>Sắp xếp <select aria-label="Sắp xếp" data-filter="sort">${sorts.flatMap(field=>['desc','asc'].map(dir=>`<option value="${field}:${dir}" ${(values.sort || `${dateField}:desc`) === `${field}:${dir}` ? 'selected' : ''}>${labels[field]} ${dir === 'asc' ? '↑' : '↓'}</option>`)).join('')}</select></label>`}
      ${key === 'campaigns' ? '<button class="btn btn-secondary btn-sm" type="button" data-reset>↺ Đặt lại bộ lọc</button>' : ''}<span class="filter-error" role="status"></span>`;
    bar.addEventListener('input', event => {
      if (!event.target.dataset.filter) return;
      listToolsState[key] = { ...(listToolsState[key] || {}), [event.target.dataset.filter]:event.target.value };
      window[callback](1);
    });
    const reset=bar.querySelector('[data-reset]');
    if (reset) reset.onclick = () => {
      listToolsState[key] = {};
      resetVisibleListTools(key);
      window[callback](1);
    };
    const anchor = element.closest('.table-wrapper') || element;
    anchor.before(bar);
  });
}
function refineList(rows, key, dateField = 'created_at') {
  const filter = listToolsState[key] || {};
  const error = document.querySelector(`[data-list-tools="${key}"] .filter-error`);
  let from,to;
  try {
    from=parseFilterDate(filter.from); to=parseFilterDate(filter.to);
    if (from && to && from > to) throw new Error('Từ ngày phải bằng hoặc trước đến ngày.');
    if (error) error.textContent='';
  } catch (err) { if (error) error.textContent=err.message; return []; }
  let list = rows.filter(row => {
    const date = localDateKey(row[dateField]);
    if (from && (!date || date < from)) return false;
    if (to && (!date || date > to)) return false;
    if (filter.status && row.status !== filter.status) return false;
    if (filter.search) {
      const search=filter.search.trim().replace(/^#/,'');
      if (/^\d+$/.test(search)) { if (Number(row.id)!==Number(search)) return false; }
      else if (!removeVietnameseTones(`${row.id} ${row.title}`).includes(removeVietnameseTones(search))) return false;
    }
    return true;
  });
  if (key === 'products' && !filter.sort) return list;
  const [field, direction] = (filter.sort || `${dateField}:desc`).split(':');
  return list.slice().sort((a,b) => {
    const x=a[field], y=b[field];
    const result = typeof x === 'number' && typeof y === 'number' ? x-y : String(x || '').localeCompare(String(y || ''),'vi',{numeric:true});
    return (result || Number(a.id)-Number(b.id)) * (direction === 'asc' ? 1 : -1);
  });
}
function localDateKey(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const date=new Date(value);
  if (isNaN(date)) return '';
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function detailFields(fields) {
  return `<dl class="record-details">${fields.map(([label,value])=>`<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value === null || value === undefined || value === '' ? '—' : value)}</dd></div>`).join('')}</dl>`;
}
function detailRow(handler, id) {
  return `class="row-clickable" tabindex="0" title="Nhấp để xem chi tiết" onclick="${handler}(${Number(id)})" onkeydown="if(event.target===this && (event.key==='Enter'||event.key===' ')){event.preventDefault();${handler}(${Number(id)})}"`;
}
function compactTable(headers, rows) {
  return `<div class="table-wrapper"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" class="empty-cell">Không có dữ liệu phù hợp.</td></tr>`}</tbody></table></div>`;
}
function feedbackBadge(status) {
  return `<span class="badge ${status === 'REPLIED' ? 'badge-replied':'badge-pending'}">${status === 'REPLIED' ? 'Đã trả lời':'Chờ trả lời'}</span>`;
}
function customerSurveyStatus(s) {
  return s.submitted_at || Number(s.already_submitted)>0 ? 'COMPLETED' : Number(s.can_participate) === 1 ? 'PENDING' : 'CLOSED';
}
function openCustomerDetail(id) {
  const c=currentCustomersList.find(c=>Number(c.id)===Number(id));
  if (!c) return;
  showModal('Chi tiết khách hàng', detailFields([
    ['ID khách hàng',c.customer_id],['Tên khách hàng',c.full_name],['Tên đăng nhập',c.username],['Email',c.email],['Điện thoại',c.phone],['Trạng thái',c.status],['Ngày tạo tài khoản',formatDateTime(c.created_at)],['Tuổi',c.age],['Giới tính',c.gender],['Loại da',c.skin_type],['Sở thích',c.beauty_preferences],['Đánh giá',c.feedback_count],['Khảo sát đã hoàn thành',c.survey_count]
  ]) + `<div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Đóng</button><button class="btn btn-primary" onclick="openEditCustomerModalById(${c.id})">Sửa</button></div>`,true);
}
function productStatusLabel(status) {
  return ({OFFICIAL:'Đang bán',UPCOMING:'Ngừng bán'})[status] || status;
}
function openAdminRecordDetail(type,id) {
  const configs={
    accounts:[currentAccountsList,'Tài khoản',[['Tên đăng nhập','username'],['Họ tên','full_name'],['Email','email'],['Điện thoại','phone'],['Vai trò','role'],['Trạng thái','status']],'openEditAccountModalById'],
    products:[currentProductsList,'Sản phẩm',[['ID','id'],['Tên','name'],['Danh mục','category'],['Nhà cung cấp','supplier_name'],['Giá (VND)','price'],['Mô tả','description'],['Trạng thái','launch_status'],['Đánh giá','review_count']],'openEditProductModalById'],
    suppliers:[currentSuppliersList,'Nhà cung cấp',[['ID','id'],['Tên','name'],['Người liên hệ','contact_name'],['Email','email'],['Điện thoại','phone'],['Địa chỉ','address'],['Trạng thái','status'],['Sản phẩm','product_count'],['Số đánh giá','review_count'],['Điểm trung bình','avg_rating']],'openEditSupplierModalById']
  };
  const [list,title,fields,edit]=configs[type]; const row=list.find(r=>Number(r.id)===Number(id)); if(!row)return;
  showModal(`Chi tiết ${title}`,detailFields([...fields.map(([label,key])=>[label,type==='products' && key==='launch_status' ? productStatusLabel(row[key]):row[key]]),['Ngày tạo',formatDateTime(row.created_at)]])+`<div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Đóng</button><button class="btn btn-primary" onclick="${edit}(${Number(id)})">Sửa</button></div>`,true);
}
function openAccountDetail(id){ openAdminRecordDetail('accounts',id); }
function openProductDetail(id){ openAdminRecordDetail('products',id); }
function openSupplierDetail(id){ openAdminRecordDetail('suppliers',id); }

async function openFeedbackDetail(id, manager = false) {
  if (!manager) return openCustomerFeedbackPopup(id);
  showModal('Chi tiết đánh giá','Đang tải…',true);
  const requestVersion=modalRequestVersion;
  try {
    const scope=manager ? 'manager':'customer';
    const [f,logs] = await Promise.all([api('GET',`/api/${scope}/feedbacks/${id}`),api('GET',`/api/${scope}/feedbacks/${id}/audit-logs`)]);
    if(requestVersion!==modalRequestVersion)return;
    const fields=[['ID đánh giá',f.id],['ID sản phẩm',f.product_id],['Sản phẩm',f.product_name],['Danh mục',f.category],['Số sao',`${f.rating}/5`],['Nội dung đánh giá',f.content],['Thời gian đánh giá',formatDateTime(f.created_at)],['Cập nhật gần nhất',formatDateTime(f.updated_at)],['Trạng thái',f.status === 'REPLIED' ? 'Đã trả lời':'Chờ trả lời'],['Trả lời của Manager',f.reply_content],['Thời gian trả lời',f.replied_at ? formatDateTime(f.replied_at):'Chưa ghi nhận']];
    if(manager) fields.splice(4,0,['ID khách hàng',f.customer_id],['Khách hàng',f.customer_name],['Email',f.email],['Điện thoại',f.phone]);
    let actions='';
    if(manager) actions=`<label for="reply-${f.id}">${f.status === 'PENDING'?'Nội dung trả lời feedback':'Sửa trả lời feedback đã gửi'}</label><textarea id="reply-${f.id}" data-previous="${escapeHtml(f.reply_content || '')}" maxlength="5000" placeholder="Nhập trả lời feedback…">${escapeHtml(f.reply_content || '')}</textarea><button class="btn btn-primary" onclick="replyFeedback(${f.id})">${f.status === 'PENDING'?'Gửi trả lời feedback':'Lưu trả lời feedback'}</button>`;
    if(!manager && f.status === 'PENDING') actions=`<button class="btn btn-primary" onclick="editCustomerFeedbackById(${f.id})">Sửa đánh giá</button>`;
    document.getElementById('modal-body').innerHTML=detailFields(fields)+`<h4>Lịch sử chỉnh sửa đánh giá</h4>`+ (logs.length ? logs.map(l=>detailFields([['Thời gian',formatDateTime(l.changed_at)],['Số sao cũ → mới',`${l.old_rating} → ${l.new_rating}`],['Nội dung cũ',l.old_content],['Nội dung mới',l.new_content]])).join(''):'<p>Chưa có chỉnh sửa.</p>')+`<h4>Lịch sử trả lời feedback</h4>`+(f.reply_history?.length ? f.reply_history.map(l=>detailFields([['Thời gian',formatDateTime(l.changed_at)],['Manager',l.manager_name],['Nội dung trước',l.old_content],['Nội dung sau',l.new_content]])).join(''):'<p>Chưa ghi nhận lịch sử trả lời feedback.</p>')+`<div class="detail-actions">${actions}</div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Đóng</button></div>`;
  } catch(error){ if(requestVersion!==modalRequestVersion)return; document.getElementById('modal-body').innerHTML=`<p role="alert">${escapeHtml(error.message)}</p>`; }
}
function openManagerFeedbackDetail(id){ return openFeedbackDetail(id,true); }
function openCustomerFeedbackDetail(id){ return openCustomerFeedbackPopup(id); }
function editCustomerFeedbackById(id){ const f=allCustomerFeedbacks.find(f=>Number(f.id)===Number(id)); if(f)openEditFeedbackModal(f.id,f.rating,f.content || '',f.product_name); }

async function openSurveyDetail(id, customer = false) {
  showModal('Chi tiết khảo sát','Đang tải…',true);
  const requestVersion=modalRequestVersion;
  try {
    const data=await api('GET',`/api/${customer?'customer':'manager'}/surveys/${id}`);
    if(requestVersion!==modalRequestVersion)return;
    const survey=customer ? data.survey:data;
    const summary=customer ? survey:currentManagerSurveysList.find(s=>Number(s.id)===Number(id)) || survey;
    const fields=[['ID khảo sát',survey.id],['Tên chiến dịch / biểu mẫu',survey.title],['Mô tả',survey.description],['Trạng thái',({DRAFT:'Bản nháp',ACTIVE:'Đang mở',CLOSED:'Đã đóng'})[survey.status] || survey.status],['Ngày bắt đầu',formatDate(survey.start_date)],['Ngày kết thúc',formatDate(survey.end_date)],['Ngày tạo',formatDateTime(survey.created_at)],['Sản phẩm',summary.product_names],...(customer?[]:[['Số lượt tham gia',summary.response_count]])];
    if(customer) fields.push(['Trạng thái tham gia',data.submission?'Đã hoàn thành':Number(survey.can_participate)===1?'Chưa tham gia':'Đã đóng / Hết hạn'],['Hoàn thành lúc',formatDateTime(data.submission?.submitted_at)]);
    else fields.push(['Người tạo',summary.creator_name],['Số người nhận',summary.recipient_count]);
    const answers=new Map((data.answers || []).map(a=>[Number(a.question_id),a.answer_value]));
    const questions=(data.questions || []).map((q,i)=>detailFields([[`Câu ${i+1}`,q.question_text],['Loại',({SINGLE_CHOICE:'Một lựa chọn',MULTI_CHOICE:'Nhiều lựa chọn',RATING:'Thang điểm 1–5',TEXT:'Văn bản'})[q.question_type] || q.question_type],['Bắt buộc',q.is_required?'Có':'Không'],['Lựa chọn',Array.isArray(q.options)?q.options.join(' · '):null],...(customer && data.submission ? [['Câu trả lời đã gửi',readableSurveyAnswer(answers.get(Number(q.id)),q.question_type)]]:[])])).join('');
    const action=customer ? !data.submission && Number(survey.can_participate)===1 ? `<button class="btn btn-primary" onclick="startSurvey(${Number(id)})">Làm khảo sát</button>`:'' : `<button class="btn btn-primary" onclick="openEditSurveyModal(${Number(id)})">Sửa</button>`;
    document.getElementById('modal-body').innerHTML=detailFields(fields)+`<h4>Câu hỏi${data.submission?' và câu trả lời':''}</h4>`+questions+`<div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Đóng</button>${action}</div>`;
  } catch(error){if(requestVersion!==modalRequestVersion)return;document.getElementById('modal-body').innerHTML=`<p role="alert">${escapeHtml(error.message)}</p>`;}
}
function readableSurveyAnswer(value,type) {
  if(value===undefined || value===null || value==='')return 'Không trả lời';
  if(type==='RATING')return `${value}/5`;
  if(type==='MULTI_CHOICE'){try{const items=JSON.parse(value);if(Array.isArray(items))return items.join(', ');}catch{}}
  return String(value);
}
function openManagerSurveyDetail(id){ return openSurveyDetail(id); }
function openCustomerSurveyDetail(id){ return openSurveyDetail(id,true); }
