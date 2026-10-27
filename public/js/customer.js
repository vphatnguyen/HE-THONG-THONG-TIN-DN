let customerProfileVersion;
/* ============================================================
   customer.js – Customer Module: Home, Surveys, Feedback, Profile
   ============================================================ */

// ========== CUSTOMER: HOME ==========
let allCustomerHomeProducts = [];
let filteredCustomerHomeProducts = [];
let customerHomePage = 1;
const CUSTOMER_HOME_PAGE_SIZE = 12;

async function renderCustomerHome() {
  const requestedPage=state.currentPage;
  setPageHeader('🏠 Trang chủ', `Chào mừng trở lại, ${state.user.full_name}! 🌸`);
  showLoading();
  try {
    const [profile, products, surveys] = await Promise.all([
      api('GET', '/api/customer/profile'),
      api('GET', '/api/customer/products'),
      api('GET', '/api/customer/surveys'),
    ]);
    const { customer } = profile;
    allCustomerHomeProducts = products || [];
    const upcomingProducts = allCustomerHomeProducts.filter(p => p.launch_status === 'UPCOMING');
    const pendingSurveys = surveys.filter(s => Number(s.already_submitted)===0 && Number(s.can_participate)===1);

    // Extract dynamic & default categories
    const dynamicCats = Array.from(new Set(allCustomerHomeProducts.map(p => p.category).filter(Boolean)));
    const presetCats = ['Sữa rửa mặt', 'Toner', 'Son môi', 'Serum', 'Kem chống nắng', 'Mặt nạ', 'Kem dưỡng da', 'Phấn phủ'];
    const allCategories = Array.from(new Set([...dynamicCats, ...presetCats])).sort();

    const categoryOptions = allCategories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

    const html = `
      <!-- Welcome Banner -->
      <div style="background:linear-gradient(135deg,rgba(244,63,94,0.15),rgba(168,85,247,0.1));border:1px solid rgba(244,63,94,0.2);border-radius:var(--radius-xl);padding:24px 28px;margin-bottom:24px;position:relative;overflow:hidden">
        <div style="position:absolute;right:20px;top:50%;transform:translateY(-50%);font-size:80px;opacity:0.15">🌸</div>
        <div style="position:relative">
          <h2 style="font-size:22px;font-weight:800;margin-bottom:4px">Chào mừng, ${state.user.full_name}! 👋</h2>
          ${pendingSurveys.length > 0 ? `
            <p style="color:var(--rose-400,#e11d48);font-size:14px;font-weight:600;margin-top:6px">
              📋 <span style="font-weight:700">${pendingSurveys.length}</span> bài khảo sát đang chờ bạn thực hiện!
            </p>
          ` : ''}
        </div>
      </div>

      <!-- Quick Stats -->
      <div class="stats-grid" style="margin-bottom:24px">
        <div class="stat-card">
          <div class="stat-icon">📋</div>
          <div class="stat-value">${pendingSurveys.length}</div>
          <div class="stat-label">Khảo sát chờ làm</div>
        </div>
        <div class="stat-card emerald">
          <div class="stat-icon">🧴</div>
          <div class="stat-value">${allCustomerHomeProducts.filter(p => p.launch_status === 'OFFICIAL').length}</div>
          <div class="stat-label">Sản phẩm đang bán</div>
        </div>
        <div class="stat-card purple">
          <div class="stat-icon">🚫</div>
          <div class="stat-value">${upcomingProducts.length}</div>
          <div class="stat-label">Sản phẩm ngừng bán</div>
        </div>
      </div>

      <!-- Active Surveys Quick Access -->
      ${pendingSurveys.length > 0 ? `
        <div style="margin-bottom:28px">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:16px">📋 Khảo sát đang chờ bạn</h3>
          <div class="survey-list">
            ${pendingSurveys.slice(0, 3).map(s => `
              <div class="survey-card">
                <div class="survey-icon">📋</div>
                <div class="survey-info">
                  <div class="survey-title">${escapeHtml(s.title)}</div>
                  <div class="survey-meta">${s.product_names ? `📦 ${escapeHtml(s.product_names)} · ` : ''}📝 ${s.question_count} câu hỏi · ${surveyStatusBadge(s.status)}</div>
                </div>
                <div class="survey-actions">
                  <button class="btn btn-primary btn-sm" onclick="startSurvey(${s.id})">Làm ngay ▶️</button>
                </div>
              </div>
            `).join('')}
          </div>
          ${pendingSurveys.length > 3 ? `<p style="text-align:center;margin-top:10px"><a href="#" onclick="navigate('customer-surveys')">Xem tất cả ${pendingSurveys.length} khảo sát →</a></p>` : ''}
        </div>
      ` : ''}

      <!-- Products Browse Section with Live Filters & Pagination -->
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <h3 style="font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px">
            💄 Khám phá sản phẩm
            <span id="cust-home-count-badge" class="badge badge-active" style="font-size:12px;font-weight:600"></span>
          </h3>
        </div>

        <!-- Filter Bar: Search, Category, Launch Status, Review Status, Sort, Reset -->
        <div class="filter-bar" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:18px">
          <input type="text" id="cust-home-search" placeholder="🔍 Tìm tên sản phẩm..." oninput="debounceCustomerHomeFilter()" style="min-width:200px;flex:1">
          <select id="cust-home-cat" onchange="handleCustomerHomeFilter()" style="min-width:145px">
            <option value="">Tất cả danh mục</option>
            ${categoryOptions}
          </select>
          <select id="cust-home-status" onchange="handleCustomerHomeFilter()" style="min-width:155px">
            <option value="">Tất cả trạng thái bán</option>
            <option value="OFFICIAL">Đang bán</option>
            <option value="UPCOMING">Ngừng bán</option>
          </select>
          <select id="cust-home-review" onchange="handleCustomerHomeFilter()" style="min-width:165px">
            <option value="">Tất cả trạng thái đánh giá</option>
            <option value="NOT_REVIEWED">Chưa đánh giá</option>
            <option value="REVIEWED">Đã đánh giá</option>
          </select>
          <select id="cust-home-sort" onchange="handleCustomerHomeFilter()" style="min-width:140px">
            <option value="LATEST">Mới nhất</option>
            <option value="PRICE_ASC">Giá tăng dần</option>
            <option value="PRICE_DESC">Giá giảm dần</option>
          </select>
          <button type="button" class="btn btn-secondary" onclick="resetCustomerHomeFilter()" title="Đặt lại bộ lọc" style="white-space:nowrap">↺ Đặt lại</button>
        </div>

        <!-- Product Grid -->
        <div id="cust-home-products-grid" class="products-grid"></div>
        <!-- Pagination Bar -->
        <div id="cust-home-products-pagination" style="margin-top:20px"></div>
      </div>
    `;
    if (requestedPage!==state.currentPage) return;
    setPageContent(html);
    handleCustomerHomeFilter();
  } catch (e) { toast(e.message, 'error'); }
}

function handleCustomerHomeFilter() {
  const kw = (document.getElementById('cust-home-search')?.value || '').trim().toLowerCase();
  const cat = document.getElementById('cust-home-cat')?.value || '';
  const status = document.getElementById('cust-home-status')?.value || '';
  const review = document.getElementById('cust-home-review')?.value || '';
  const sort = document.getElementById('cust-home-sort')?.value || 'LATEST';

  filteredCustomerHomeProducts = allCustomerHomeProducts.filter(p => {
    if (kw && !(p.name || '').toLowerCase().includes(kw)) return false;
    if (cat && p.category !== cat) return false;
    if (status && p.launch_status !== status) return false;
    if (review) {
      if (review === 'REVIEWED' && !p.already_reviewed) return false;
      if (review === 'NOT_REVIEWED' && p.already_reviewed) return false;
    }
    return true;
  });

  // Sort
  if (sort === 'PRICE_ASC') {
    filteredCustomerHomeProducts.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
  } else if (sort === 'PRICE_DESC') {
    filteredCustomerHomeProducts.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
  } else {
    // LATEST: Default sort by id desc, but prioritize OFFICIAL first
    filteredCustomerHomeProducts.sort((a, b) => {
      if (a.launch_status === 'OFFICIAL' && b.launch_status !== 'OFFICIAL') return -1;
      if (a.launch_status !== 'OFFICIAL' && b.launch_status === 'OFFICIAL') return 1;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
  }

  customerHomePage = 1;
  renderCustomerHomePage(1);
}

const debounceCustomerHomeFilter = debounce(handleCustomerHomeFilter, 150);

function resetCustomerHomeFilter() {
  const searchInput = document.getElementById('cust-home-search');
  if (searchInput) searchInput.value = '';
  const catSelect = document.getElementById('cust-home-cat');
  if (catSelect) catSelect.value = '';
  const statusSelect = document.getElementById('cust-home-status');
  if (statusSelect) statusSelect.value = '';
  const reviewSelect = document.getElementById('cust-home-review');
  if (reviewSelect) reviewSelect.value = '';
  const sortSelect = document.getElementById('cust-home-sort');
  if (sortSelect) sortSelect.value = 'LATEST';
  handleCustomerHomeFilter();
}

function renderCustomerHomePage(page) {
  customerHomePage = page;
  const gridEl = document.getElementById('cust-home-products-grid');
  const pagEl = document.getElementById('cust-home-products-pagination');
  const countBadge = document.getElementById('cust-home-count-badge');

  const total = filteredCustomerHomeProducts.length;
  if (countBadge) {
    countBadge.textContent = total === allCustomerHomeProducts.length 
      ? `${total} sản phẩm` 
      : `${total} / ${allCustomerHomeProducts.length} sản phẩm`;
  }

  const start = (page - 1) * CUSTOMER_HOME_PAGE_SIZE;
  const pageItems = filteredCustomerHomeProducts.slice(start, start + CUSTOMER_HOME_PAGE_SIZE);

  if (gridEl) {
    if (total === 0) {
      gridEl.innerHTML = `
        <div class="page-empty" style="grid-column:1/-1;padding:40px 20px">
          <div class="empty-icon">🔍</div>
          <p>Không tìm thấy sản phẩm nào phù hợp với bộ lọc</p>
          <button class="btn btn-secondary btn-sm" onclick="resetCustomerHomeFilter()" style="margin-top:12px">↺ Đặt lại bộ lọc</button>
        </div>
      `;
    } else {
      gridEl.innerHTML = pageItems.map(p => {
        const isDiscontinued = p.launch_status === 'UPCOMING';
        const reviewCount = Number(p.review_count) || 0;
        const avgRating = Number(p.avg_rating) || 0;

        let actionBtn = '';
        if (isDiscontinued) {
          actionBtn = `<button class="btn btn-secondary btn-sm" style="width:100%;font-size:11.5px;opacity:0.85" onclick="openProductDetailModal(${p.id});event.stopPropagation()">🔍 Chi tiết & Đánh giá</button>`;
        } else if (p.already_reviewed) {
          actionBtn = `<button class="btn btn-secondary btn-sm" style="width:100%;font-size:11.5px;color:#214e34;font-weight:600;border-color:rgba(33,78,52,0.3)" onclick="openProductDetailModal(${p.id});event.stopPropagation()">⭐ Đã đánh giá (Xem/Sửa)</button>`;
        } else {
          actionBtn = `<button class="btn btn-primary btn-sm" style="width:100%;font-size:11.5px" onclick="openProductDetailModal(${p.id});event.stopPropagation()">💬 Xem & Viết đánh giá</button>`;
        }

        return `
          <div class="product-card" onclick="openProductDetailModal(${p.id})" style="cursor:pointer" title="Nhấp để xem chi tiết & đánh giá sản phẩm">
            <div class="product-card-img">${getCategoryIcon(p.category)}</div>
            <div class="product-card-body">
              <div class="product-card-cat">${escapeHtml(p.category || 'Mỹ phẩm')}</div>
              <div class="product-card-name">${escapeHtml(p.name)}</div>
              ${isDiscontinued ? `<div style="margin:4px 0">${launchBadge('UPCOMING')}</div>` : ''}
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px;flex-wrap:wrap">
                <div class="product-card-price" style="margin:0">${p.price ? formatCurrency(p.price) : 'Chưa định giá'}</div>
                <div style="font-size:12px">
                  ${reviewCount > 0 
                    ? `<span style="color:#d97706;font-weight:700">⭐ ${avgRating.toFixed(1)}</span> <span style="color:var(--text-muted);font-size:11.5px">(${reviewCount} đánh giá)</span>`
                    : `<span style="color:var(--text-muted);font-size:11.5px">Chưa có đánh giá</span>`
                  }
                </div>
              </div>
              <div style="margin-top:10px">
                ${actionBtn}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  if (pagEl) {
    pagEl.innerHTML = renderPaginationBar({
      totalItems: total,
      pageSize: CUSTOMER_HOME_PAGE_SIZE,
      currentPage: page,
      onPageChangeFnName: 'renderCustomerHomePage'
    });
  }
}


// ========== CUSTOMER: SURVEYS ==========
let customerSurveyCurrentPage = 1;
const CUSTOMER_SURVEY_PAGE_SIZE = 10;
let allCustomerSurveys = [];
let filteredCustomerSurveys = [];
let customerSurveyFilterTab = 'ALL';

async function renderCustomerSurveys() {
  const requestedPage=state.currentPage;
  setPageHeader('📋 Bài khảo sát của tôi', 'Tham gia khảo sát để giúp chúng tôi cải thiện sản phẩm');
  showLoading();
  try {
    const surveys = await api('GET', '/api/customer/surveys');
    allCustomerSurveys = surveys || [];
    customerSurveyFilterTab = 'ALL';
    customerSurveyCurrentPage = 1;

    // Counts
    const allCount = allCustomerSurveys.length;
    const pendingCount = allCustomerSurveys.filter(s => customerSurveyStatus(s)==='PENDING').length;
    const completedCount = allCustomerSurveys.filter(s => Number(s.already_submitted) > 0).length;
    const closedCount = allCustomerSurveys.filter(s => customerSurveyStatus(s)==='CLOSED').length;

    const html = `
      <!-- Search & Reactive Quick Filter Bar -->
      <div class="filter-bar" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:18px">
        <input type="text" id="cust-survey-search" placeholder="🔍 ID, tên khảo sát hoặc sản phẩm..." oninput="debounceCustomerSurveyFilter()" style="min-width:260px;flex:1">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap" id="cust-survey-pills-group">
          <button type="button" class="filter-pill ${customerSurveyFilterTab === 'ALL' ? 'active' : ''}" onclick="setCustomerSurveyTab('ALL')" id="survey-tab-all">Tất cả (${allCount})</button>
          <button type="button" class="filter-pill ${customerSurveyFilterTab === 'PENDING' ? 'active' : ''}" onclick="setCustomerSurveyTab('PENDING')" id="survey-tab-pending">⏳ Chờ thực hiện (${pendingCount})</button>
          <button type="button" class="filter-pill ${customerSurveyFilterTab === 'COMPLETED' ? 'active' : ''}" onclick="setCustomerSurveyTab('COMPLETED')" id="survey-tab-completed">✅ Đã hoàn thành (${completedCount})</button>
          <button type="button" class="filter-pill ${customerSurveyFilterTab === 'CLOSED' ? 'active' : ''}" onclick="setCustomerSurveyTab('CLOSED')" id="survey-tab-closed">🔒 Đã đóng / Hết hạn (${closedCount})</button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="resetCustomerSurveyFilters()" title="Đặt lại bộ lọc" style="white-space:nowrap">↺ Đặt lại</button>
      </div>

      <div id="customer-survey-list" class="survey-list"></div>
      <div id="customer-survey-pagination" style="margin-top:20px"></div>
    `;
    if (requestedPage!==state.currentPage) return;
    setPageContent(html);
    handleCustomerSurveyFilter();
  } catch (e) { toast(e.message, 'error'); }
}

function setCustomerSurveyTab(tab) {
  customerSurveyFilterTab = tab;
  ['all', 'pending', 'completed', 'closed'].forEach(t => {
    const el = document.getElementById(`survey-tab-${t}`);
    if (el) {
      if (t === tab.toLowerCase()) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    }
  });
  customerSurveyCurrentPage = 1;
  handleCustomerSurveyFilter();
}

function handleCustomerSurveyFilter() {
  const kw = (document.getElementById('cust-survey-search')?.value || '').trim().toLowerCase();

  filteredCustomerSurveys = allCustomerSurveys.filter(s => {
    // Quick filter tab
    if (customerSurveyFilterTab === 'PENDING') {
      if (customerSurveyStatus(s)!=='PENDING') return false;
    } else if (customerSurveyFilterTab === 'COMPLETED') {
      if (!s.already_submitted || Number(s.already_submitted) === 0) return false;
    } else if (customerSurveyFilterTab === 'CLOSED') {
      if (customerSurveyStatus(s)!=='CLOSED') return false;
    }

    // Keyword search
    if (kw) {
      const title = (s.title || '').toLowerCase();
      const pNames = (s.product_names || '').toLowerCase();
      const desc = (s.description || '').toLowerCase();
      if (/^#?\d+$/.test(kw) && Number(s.id)!==Number(kw.replace(/^#/,''))) return false;
      if (!String(s.id).includes(kw.replace(/^#/,'')) && !title.includes(kw) && !pNames.includes(kw) && !desc.includes(kw)) return false;
    }
    return true;
  });

  filteredCustomerSurveys=refineList(filteredCustomerSurveys,'customer-survey','end_date');
  customerSurveyCurrentPage = 1;
  renderCustomerSurveysPage(1);
}

const debounceCustomerSurveyFilter = debounce(handleCustomerSurveyFilter, 150);

function resetCustomerSurveyFilters() {
  listToolsState['customer-survey']={};
  resetVisibleListTools('customer-survey');
  const searchInput = document.getElementById('cust-survey-search');
  if (searchInput) searchInput.value = '';
  setCustomerSurveyTab('ALL');
}

function renderCustomerSurveysPage(page=1) {
  const list=filteredCustomerSurveys;
  customerSurveyCurrentPage=Math.max(1,Math.min(page,Math.ceil(list.length/CUSTOMER_SURVEY_PAGE_SIZE)||1));
  const el=document.getElementById('customer-survey-list'); if(!el)return;
  el.innerHTML=compactTable(['ID','Khảo sát','Trạng thái tham gia','Hạn tham gia','Hoàn thành lúc','Thao tác'],list.slice((customerSurveyCurrentPage-1)*CUSTOMER_SURVEY_PAGE_SIZE,customerSurveyCurrentPage*CUSTOMER_SURVEY_PAGE_SIZE).map(s=>`<tr ${detailRow('openCustomerSurveyDetail',s.id)}><td>#${s.id}</td><td>${escapeHtml(s.title)}</td><td>${customerSurveyStatus(s)==='COMPLETED'?'Đã hoàn thành':customerSurveyStatus(s)==='PENDING'?'Chưa tham gia':'Đã đóng / Hết hạn'}</td><td>${formatDate(s.end_date)}</td><td>${formatDateTime(s.submitted_at)}</td><td class="row-actions" onclick="event.stopPropagation()">${customerSurveyStatus(s)==='PENDING'?`<button class="btn btn-primary btn-sm" onclick="startSurvey(${s.id})">Làm khảo sát</button>`:'—'}</td></tr>`).join(''));
  document.getElementById('customer-survey-pagination').innerHTML=renderPaginationBar({totalItems:list.length,pageSize:CUSTOMER_SURVEY_PAGE_SIZE,currentPage:customerSurveyCurrentPage,onPageChangeFnName:'renderCustomerSurveysPage'});
}


async function startSurvey(id) {
  showModal('📋 Khảo sát', `<div class="loading-spinner"><div class="spinner"></div></div>`, true);
  try {
    const data = await api('GET', `/api/customer/surveys/${id}`);
    const { survey, questions } = data;
    if (data.submission || Number(survey.can_participate)!==1) { await openCustomerSurveyDetail(id); return; }
    const modalTitle = document.getElementById('modal-title');
    if (modalTitle) modalTitle.textContent = `📋 ${survey.title}`;

    let body = `
      <div style="background:rgba(244,63,94,0.08);border:1px solid rgba(244,63,94,0.15);border-radius:10px;padding:14px;margin-bottom:16px">
        <p style="font-size:13px;color:var(--text-secondary)">${escapeHtml(survey.description || 'Cảm ơn bạn đã tham gia khảo sát!')}</p>
        ${survey.product_names ? `<p style="font-size:12px;color:var(--text-muted);margin-top:4px">📦 Sản phẩm: <strong>${escapeHtml(survey.product_names)}</strong></p>` : ''}
      </div>
      <form id="survey-form">
    `;

    questions.forEach((q, i) => {
      const cleanedQText = (q.question_text || '').trim().replace(/^((câu\s*\d+[\.:\s]*|\d+[\.\):\s]+)+)/i, '').trim();
      const isReq = q.is_required !== false;
      const reqBadge = isReq ? `<span class="req-star" title="Bắt buộc trả lời">*</span>` : `<span class="opt-badge">(Không bắt buộc)</span>`;
      body += `<div style="background:var(--bg-card-solid);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px">
        <div style="font-size:13px;font-weight:600;margin-bottom:12px;line-height:1.5">${i + 1}. ${escapeHtml(cleanedQText)} ${reqBadge}</div>`;

      if (q.question_type === 'SINGLE_CHOICE' && Array.isArray(q.options)) {
        body += `<div style="display:flex;flex-direction:column;gap:8px">`;
        q.options.forEach((opt) => {
          const safeOpt = escapeHtml(opt);
          body += `<label class="survey-option-label">
            <input type="radio" name="q${q.id}" value="${safeOpt}" style="accent-color:var(--rose-500)">
            <span>${escapeHtml(opt)}</span>
          </label>`;
        });
        body += `</div>`;
      } else if (q.question_type === 'MULTI_CHOICE' && Array.isArray(q.options)) {
        body += `<div style="display:flex;flex-direction:column;gap:8px">`;
        q.options.forEach(opt => {
          const safeOpt = escapeHtml(opt);
          body += `<label class="survey-option-label">
            <input type="checkbox" name="q${q.id}" value="${safeOpt}" style="accent-color:var(--rose-500)">
            <span>${escapeHtml(opt)}</span>
          </label>`;
        });
        body += `</div>`;
      } else if (q.question_type === 'RATING') {
        body += `
          <div style="display:flex;align-items:center;gap:12px;padding:6px 0">
            <div style="display:flex;gap:6px" onmouseleave="resetSurveyStar(${q.id})">
              ${[1, 2, 3, 4, 5].map(s => `
                <span id="survey-star-${q.id}-${s}" 
                      style="cursor:pointer;font-size:32px;color:#94a3b8;transition:all 0.15s ease;user-select:none;display:inline-block" 
                      title="${s} sao"
                      onmouseover="hoverSurveyStar(${q.id}, ${s})"
                      onclick="selectSurveyStar(${q.id}, ${s})">★</span>
                <input type="radio" name="q${q.id}" value="${s}" style="display:none">
              `).join('')}
            </div>
            <input type="hidden" id="rating-val-q${q.id}" value="">
            <span id="survey-star-text-${q.id}" style="font-size:13px;color:var(--rose-300);font-weight:600;min-width:140px"></span>
          </div>
        `;
      } else if (q.question_type === 'TEXT') {
        body += `<textarea name="q${q.id}" placeholder="Chia sẻ ý kiến của bạn..." style="width:100%;min-height:80px"></textarea>`;
      }
      body += `</div>`;
    });

    body += `
      </form>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
        <button class="btn btn-primary" onclick="submitSurvey(${id})">📤 Nộp khảo sát</button>
      </div>
    `;

    document.getElementById('modal-body').innerHTML = body;
  } catch (e) {
    document.getElementById('modal-body').innerHTML = `<p class="error-msg">${escapeHtml(e.message)}</p>`;
  }
}

function selectSurveyStar(qid, val) {
  const radio = document.querySelector(`input[name="q${qid}"][value="${val}"]`);
  if (radio) radio.checked = true;
  const ratingInput = document.getElementById(`rating-val-q${qid}`);
  if (ratingInput) ratingInput.value = val;
  updateSurveyStarsUI(qid, val);
}

function hoverSurveyStar(qid, val) {
  updateSurveyStarsUI(qid, val);
}

function resetSurveyStar(qid) {
  const ratingInput = document.getElementById(`rating-val-q${qid}`);
  const currentVal = ratingInput ? Number(ratingInput.value) || 0 : 0;
  updateSurveyStarsUI(qid, currentVal);
}

function updateSurveyStarsUI(qid, val) {
  const labels = ['', '1 sao - Rất kém', '2 sao - Chưa tốt', '3 sao - Bình thường', '4 sao - Hài lòng', '5 sao - Rất tuyệt vời! ⭐'];
  for (let s = 1; s <= 5; s++) {
    const starEl = document.getElementById(`survey-star-${qid}-${s}`);
    if (starEl) {
      if (s <= val) {
        starEl.style.color = '#fbbf24';
        starEl.style.textShadow = '0 0 12px rgba(251, 191, 36, 0.6)';
        starEl.style.transform = 'scale(1.15)';
      } else {
        starEl.style.color = '#94a3b8';
        starEl.style.textShadow = 'none';
        starEl.style.transform = 'scale(1)';
      }
    }
  }
  const textEl = document.getElementById(`survey-star-text-${qid}`);
  if (textEl) {
    textEl.textContent = labels[val] || '';
  }
}

async function submitSurvey(surveyId) {
  const form = document.getElementById('survey-form');
  if (!form) return;

  const answers = [];
  const allNames = new Set([...form.querySelectorAll('[name]')].map(el => el.getAttribute('name')));

  allNames.forEach(name => {
    const qid = parseInt(name.replace('q', ''));
    const inputs = form.querySelectorAll(`[name="${name}"]`);

    if (inputs.length === 0) return;
    const type = inputs[0].type;

    if (type === 'radio') {
      const checked = form.querySelector(`[name="${name}"]:checked`);
      if (checked) answers.push({ question_id: qid, answer_value: checked.value });
    } else if (type === 'checkbox') {
      const vals = [...form.querySelectorAll(`[name="${name}"]:checked`)].map(el => el.value);
      if (vals.length > 0) answers.push({ question_id: qid, answer_value: vals });
    } else if (type === 'textarea' || inputs[0].tagName === 'TEXTAREA') {
      const val = inputs[0].value.trim();
      if (val) answers.push({ question_id: qid, answer_value: val });
    }
  });

  // Also handle textarea elements with name attribute
  form.querySelectorAll('textarea[name]').forEach(ta => {
    if (ta.value.trim()) {
      const qid = parseInt(ta.name.replace('q', ''));
      if (!answers.find(a => a.question_id === qid)) {
        answers.push({ question_id: qid, answer_value: ta.value.trim() });
      }
    }
  });

  try {
    const result = await api('POST', `/api/customer/surveys/${surveyId}/submit`, { answers });
    closeModal();
    toast(result.message, 'success');
    navigate('customer-surveys');
  } catch (e) { toast(e.message, 'error'); }
}

// ========== CUSTOMER: FEEDBACK ==========
let customerFeedbackCurrentPage = 1;
const CUSTOMER_FEEDBACK_PAGE_SIZE = 10;
let allCustomerFeedbacks = [];
let filteredCustomerFeedbacks = [];

async function renderCustomerFeedback() {
  const requestedPage=state.currentPage;
  setPageHeader('💬 Đánh giá của tôi', 'Quản lý đánh giá sản phẩm bạn đã gửi',
    `<button class="btn btn-primary" onclick="openNewFeedbackModal()">➕ Gửi đánh giá mới</button>`);
  showLoading();
  try {
    const feedbacks = await api('GET', '/api/customer/feedbacks');
    allCustomerFeedbacks = feedbacks || [];
    customerFeedbackCurrentPage = 1;

    const html = `
      <!-- Live Search & Reactive Filter Bar -->
      <div class="filter-bar" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:18px">
        <input type="text" id="cust-fb-search" placeholder="🔍 ID, tên sản phẩm hoặc nội dung..." oninput="debounceCustomerFeedbackFilter()" style="min-width:240px;flex:1">
        <select id="cust-fb-rating" onchange="handleCustomerFeedbackFilter()" style="min-width:170px">
          <option value="">Tất cả số sao</option>
          <option value="POSITIVE">⭐ Tích cực (4-5★)</option>
          <option value="5">5 sao ⭐⭐⭐⭐⭐</option>
          <option value="4">4 sao ⭐⭐⭐⭐</option>
          <option value="3">3 sao ⭐⭐⭐</option>
          <option value="NEGATIVE">⚠️ Tiêu cực (1-2★)</option>
          <option value="2">2 sao ⭐⭐</option>
          <option value="1">1 sao ⭐</option>
        </select>
        <select id="cust-fb-status" onchange="handleCustomerFeedbackFilter()" style="min-width:170px">
          <option value="">Tất cả trạng thái</option>
          <option value="PENDING">⏳ Chờ phản hồi</option>
          <option value="REPLIED">✅ Đã có phản hồi từ CSKH</option>
        </select>
        <button type="button" class="btn btn-secondary" onclick="resetCustomerFeedbackFilters()" title="Đặt lại bộ lọc" style="white-space:nowrap">↺ Đặt lại</button>
      </div>

      <div id="customer-feedback-list" class="feedback-list"></div>
      <div id="customer-feedback-pagination" style="margin-top:20px"></div>
    `;
    if (requestedPage!==state.currentPage) return;
    setPageContent(html);
    handleCustomerFeedbackFilter();
  } catch (e) { toast(e.message, 'error'); }
}

function handleCustomerFeedbackFilter() {
  const kw = (document.getElementById('cust-fb-search')?.value || '').trim().toLowerCase();
  const ratingVal = document.getElementById('cust-fb-rating')?.value || '';
  const statusVal = document.getElementById('cust-fb-status')?.value || '';

  filteredCustomerFeedbacks = allCustomerFeedbacks.filter(f => {
    if (kw) {
      const pName = (f.product_name || '').toLowerCase();
      const content = (f.content || '').toLowerCase();
      const reply = (f.reply_content || '').toLowerCase();
      if (/^#?\d+$/.test(kw) && Number(f.id)!==Number(kw.replace(/^#/,''))) return false;
      if (!String(f.id).includes(kw.replace(/^#/,'')) && !pName.includes(kw) && !content.includes(kw) && !reply.includes(kw)) return false;
    }
    if (ratingVal) {
      const r = Number(f.rating);
      if (ratingVal === 'POSITIVE' && r < 4) return false;
      if (ratingVal === 'NEGATIVE' && r > 2) return false;
      if (['1', '2', '3', '4', '5'].includes(ratingVal) && r !== Number(ratingVal)) return false;
    }
    if (statusVal) {
      if (statusVal === 'REPLIED' && f.status !== 'REPLIED') return false;
      if (statusVal === 'PENDING' && f.status === 'REPLIED') return false;
    }
    return true;
  });

  filteredCustomerFeedbacks=refineList(filteredCustomerFeedbacks,'customer-feedback');
  customerFeedbackCurrentPage = 1;
  renderCustomerFeedbackPage(1);
}

const debounceCustomerFeedbackFilter = debounce(handleCustomerFeedbackFilter, 150);

function resetCustomerFeedbackFilters() {
  listToolsState['customer-feedback']={};
  resetVisibleListTools('customer-feedback');
  const searchInput = document.getElementById('cust-fb-search');
  if (searchInput) searchInput.value = '';
  const ratingSelect = document.getElementById('cust-fb-rating');
  if (ratingSelect) ratingSelect.value = '';
  const statusSelect = document.getElementById('cust-fb-status');
  if (statusSelect) statusSelect.value = '';
  handleCustomerFeedbackFilter();
}

function renderCustomerFeedbackPage(page=1) {
  const list=filteredCustomerFeedbacks;
  customerFeedbackCurrentPage=Math.max(1,Math.min(page,Math.ceil(list.length/CUSTOMER_FEEDBACK_PAGE_SIZE)||1));
  const el=document.getElementById('customer-feedback-list'); if(!el)return;
  el.innerHTML=compactTable(['ID','Sản phẩm','Số sao','Trạng thái','Thời gian','Thao tác'],list.slice((customerFeedbackCurrentPage-1)*CUSTOMER_FEEDBACK_PAGE_SIZE,customerFeedbackCurrentPage*CUSTOMER_FEEDBACK_PAGE_SIZE).map(f=>`<tr ${detailRow('openCustomerFeedbackDetail',f.id)}><td>#${f.id}</td><td>${escapeHtml(f.product_name)}</td><td>${f.rating}/5 ★</td><td>${feedbackBadge(f.status)}</td><td>${formatDateTime(f.created_at)}</td><td class="row-actions" onclick="event.stopPropagation()">${f.status==='PENDING'?`<button class="btn btn-secondary btn-sm" onclick="editCustomerFeedbackById(${f.id})">Sửa</button>`:'—'}</td></tr>`).join(''));
  document.getElementById('customer-feedback-pagination').innerHTML=renderPaginationBar({totalItems:list.length,pageSize:CUSTOMER_FEEDBACK_PAGE_SIZE,currentPage:customerFeedbackCurrentPage,onPageChangeFnName:'renderCustomerFeedbackPage'});
}


let editFeedbackSelectedRating = 5;

function openEditFeedbackModal(feedbackId, currentRating, currentContent, productName) {
  editFeedbackSelectedRating = currentRating || 5;
  const modalHtml = `
    <div style="background:rgba(244,63,94,0.06);border:1px solid rgba(244,63,94,0.15);border-radius:10px;padding:12px 16px;margin-bottom:14px">
      <div style="font-weight:600;font-size:14px">💄 ${escapeHtml(productName)}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Bạn có thể tùy ý sửa đánh giá khi chưa có phản hồi từ nhân viên CSKH.</div>
    </div>

    <div class="form-group">
      <label>Điểm đánh giá *</label>
      <div style="display:flex;align-items:center;gap:12px;padding:6px 0">
        <div style="display:flex;gap:6px" onmouseleave="resetEditFeedbackStar()">
          ${[1, 2, 3, 4, 5].map(n => `
            <span id="efb-star-${n}"
                  style="cursor:pointer;font-size:32px;color:${n <= editFeedbackSelectedRating ? '#fbbf24' : '#475569'};transition:color 0.15s;user-select:none"
                  onmouseover="hoverEditFeedbackStar(${n})"
                  onclick="setEditFeedbackStar(${n})">★</span>
          `).join('')}
        </div>
        <span id="efb-star-text" style="font-size:13px;color:var(--rose-300);font-weight:600">
          ${renderEditFeedbackRatingText(editFeedbackSelectedRating)}
        </span>
      </div>
      <input type="hidden" id="efb-rating" value="${editFeedbackSelectedRating}">
    </div>

    <div class="form-group">
      <label>Nội dung đánh giá</label>
      <textarea id="efb-content" placeholder="Chia sẻ trải nghiệm của bạn về sản phẩm này..." style="min-height:90px">${escapeHtml(currentContent || '')}</textarea>
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="submitEditFeedback(${feedbackId})">💾 Lưu thay đổi</button>
    </div>
  `;

  showModal('✏️ Chỉnh sửa đánh giá', modalHtml, true);
}

function renderEditFeedbackRatingText(rating) {
  const texts = ['', '1 sao - Rất tệ', '2 sao - Chưa hài lòng', '3 sao - Bình thường', '4 sao - Tốt', '5 sao - Tuyệt vời!'];
  return texts[rating] || '';
}

function setEditFeedbackStar(rating) {
  editFeedbackSelectedRating = rating;
  const input = document.getElementById('efb-rating');
  if (input) input.value = rating;
  updateEditFeedbackStarsUI(rating);
}

function hoverEditFeedbackStar(val) {
  updateEditFeedbackStarsUI(val);
}

function resetEditFeedbackStar() {
  updateEditFeedbackStarsUI(editFeedbackSelectedRating);
}

function updateEditFeedbackStarsUI(val) {
  for (let i = 1; i <= 5; i++) {
    const star = document.getElementById(`efb-star-${i}`);
    if (star) star.style.color = i <= val ? '#fbbf24' : '#475569';
  }
  const textEl = document.getElementById('efb-star-text');
  if (textEl) textEl.textContent = renderEditFeedbackRatingText(val);
}

async function submitEditFeedback(feedbackId) {
  const rating = Number(document.getElementById('efb-rating')?.value);
  const content = document.getElementById('efb-content')?.value.trim();

  if (!rating || rating < 1 || rating > 5) {
    toast('Vui lòng chọn số sao đánh giá (1-5 sao)', 'error');
    return;
  }

  try {
    await api('PUT', `/api/customer/feedbacks/${feedbackId}`, {
      _version:allCustomerFeedbacks.find(f=>Number(f.id)===Number(feedbackId))?.record_version, rating, content });
    toast('Cập nhật đánh giá thành công!', 'success');
    closeModal();
    renderCustomerFeedback();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function openNewFeedbackModal() {
  const products = await api('GET', '/api/customer/products').catch(() => []);
  const official = products.filter(p => p.launch_status === 'OFFICIAL');
  const availableCount = official.filter(p => !p.already_reviewed).length;
  const options = official.map(p => `
    <option value="${p.id}" ${p.already_reviewed ? 'disabled style="color:var(--text-muted)"' : ''}>
      ${p.name} ${p.already_reviewed ? '(✅ Đã đánh giá)' : ''}
    </option>
  `).join('');

  showModal('💬 Gửi đánh giá sản phẩm', `
    <div class="form-group">
      <label>Chọn sản phẩm * <span style="font-size:11px;color:var(--text-muted);font-weight:400">(mỗi sản phẩm chỉ đánh giá 1 lần)</span></label>
      <select id="fb-product">
        <option value="">-- Chọn sản phẩm ${availableCount > 0 ? `(${availableCount} sản phẩm chưa đánh giá)` : ''} --</option>
        ${options}
      </select>
    </div>
    <div class="form-group">
      <label>Đánh giá của bạn *</label>
      <div style="display:flex;align-items:center;gap:14px;padding:6px 0">
        <div style="display:flex;gap:8px" onmouseleave="resetFeedbackStar()">
          ${[1, 2, 3, 4, 5].map(n => `
            <span id="fb-star-${n}" 
                  style="cursor:pointer;font-size:36px;color:#94a3b8;transition:all 0.15s ease;user-select:none;display:inline-block" 
                  title="${n} sao"
                  onmouseover="hoverFeedbackStar(${n})"
                  onclick="setFeedbackStar(${n})">★</span>
          `).join('')}
        </div>
        <input type="hidden" id="fb-rating" value="">
        <span id="fb-star-desc" style="font-size:13px;color:var(--rose-300);font-weight:600"></span>
      </div>
    </div>
    <div class="form-group">
      <label>Nội dung đánh giá</label>
      <textarea id="fb-content" placeholder="Chia sẻ trải nghiệm của bạn về sản phẩm..."></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="submitFeedback()">📤 Gửi đánh giá</button>
    </div>
  `);
}

async function openFeedbackModal(productId, productName) {
  openProductDetailModal(productId);
}

// ========== HASAKI-STYLE PRODUCT DETAIL & REVIEW SYSTEM ==========
let currentHasakiProduct = null;
let currentHasakiFeedbacks = [];
let currentHasakiStats = {};
let currentHasakiMyFeedback = null;
let hasakiFilterStar = 'ALL'; // 'ALL', '5', '4', '3', '2', '1', 'REPLIED'
let hasakiSortBy = 'LATEST'; // 'LATEST', 'RATING_DESC', 'RATING_ASC'
let hasakiPage = 1;
const HASAKI_PAGE_SIZE = 5;
let isWritingReviewOpen = false;
let hasakiSelectedRating = 5;

function getHasakiRatingLabel(r) {
  const map = {
    5: 'Rất hài lòng',
    4: 'Hài lòng',
    3: 'Bình thường',
    2: 'Không hài lòng',
    1: 'Rất tệ'
  };
  return map[Number(r)] || 'Hài lòng';
}

function renderStarsHtml(avgRating, size = 18) {
  const avg = Math.min(Math.max(0, Number(avgRating) || 0), 5);
  let starsHtml = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= Math.floor(avg)) {
      starsHtml += '★';
    } else if (i - avg <= 0.5) {
      starsHtml += '★';
    } else {
      starsHtml += '☆';
    }
  }
  return `<span style="color:#f59e0b;font-size:${size}px;letter-spacing:1px">${starsHtml}</span>`;
}

async function openProductDetailModal(productId) {
  showModal('🧴 Chi tiết & Đánh giá sản phẩm', `
    <div style="text-align:center;padding:50px 20px">
      <div class="spinner"></div>
      <p style="color:var(--text-muted);margin-top:14px;font-size:13px">Đang tải thông tin sản phẩm và đánh giá khách hàng...</p>
    </div>
  `, true);

  const modalEl = document.getElementById('modal');
  if (modalEl) modalEl.style.maxWidth = '880px';

  try {
    const data = await api('GET', `/api/customer/products/${productId}/feedbacks`);
    currentHasakiProduct = data.product;
    currentHasakiFeedbacks = data.feedbacks || [];
    currentHasakiStats = data.stats || {
      total_reviews: 0,
      avg_rating: 0,
      count_5: 0,
      count_4: 0,
      count_3: 0,
      count_2: 0,
      count_1: 0,
      replied_count: 0
    };
    currentHasakiMyFeedback = data.my_feedback || null;
    hasakiFilterStar = 'ALL';
    hasakiSortBy = 'LATEST';
    hasakiPage = 1;
    isWritingReviewOpen = false;
    hasakiSelectedRating = currentHasakiMyFeedback ? Number(currentHasakiMyFeedback.rating) : 5;

    renderHasakiModalContent();
  } catch (e) {
    toast(e.message, 'error');
    closeModal();
  }
}

function renderHasakiModalContent() {
  const p = currentHasakiProduct;
  const stats = currentHasakiStats;
  const myFb = currentHasakiMyFeedback;
  if (!p) return;

  const isOfficial = p.launch_status === 'OFFICIAL';

  // 1. CTA Button HTML
  let ctaBtnHtml = '';
  if (myFb?.status === 'REPLIED') {
    ctaBtnHtml = `<span class="badge badge-replied">Đánh giá đã được phản hồi</span>`;
  } else if (!isOfficial) {
    ctaBtnHtml = `<span class="badge badge-locked" style="padding:7px 14px;font-size:12px;font-weight:700">🚫 Đã đóng nhận đánh giá mới</span>`;
  } else if (myFb) {
    ctaBtnHtml = `<button type="button" class="btn btn-warning btn-sm" style="font-weight:700;padding:8px 16px;box-shadow:0 3px 10px rgba(245,158,11,0.25)" onclick="toggleHasakiWriteSection(true)">✏️ Sửa đánh giá của bạn</button>`;
  } else {
    ctaBtnHtml = `<button type="button" class="hasaki-btn-write" onclick="toggleHasakiWriteSection(false)">Viết đánh giá</button>`;
  }

  // Filter pills
  const pills = [
    { key: 'ALL', label: `Tất cả (${stats.total_reviews})` },
    { key: '5', label: `5 ★ (${stats.count_5 || 0})` },
    { key: '4', label: `4 ★ (${stats.count_4 || 0})` },
    { key: '3', label: `3 ★ (${stats.count_3 || 0})` },
    { key: '2', label: `2 ★ (${stats.count_2 || 0})` },
    { key: '1', label: `1 ★ (${stats.count_1 || 0})` },
    { key: 'REPLIED', label: `Có phản hồi CSKH (${stats.replied_count || 0})` }
  ];

  const pillsHtml = pills.map(item => `
    <button type="button" class="hasaki-pill ${hasakiFilterStar === item.key ? 'active' : ''}" onclick="setHasakiFilter('${item.key}')">
      ${item.label}
    </button>
  `).join('');

  const html = `
    <!-- 1. Header Box: Thông tin tóm tắt sản phẩm -->
    <div style="display:flex;gap:18px;align-items:flex-start;padding-bottom:18px;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <div style="width:88px;height:88px;border-radius:12px;background:linear-gradient(135deg,rgba(244,63,94,0.1),rgba(168,85,247,0.1));display:flex;align-items:center;justify-content:center;font-size:42px;flex-shrink:0;border:1px solid var(--border)">
        ${getCategoryIcon(p.category)}
      </div>
      <div style="flex:1;min-width:250px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
          <span class="badge" style="background:rgba(33,78,52,0.1);color:#214e34;font-weight:600;font-size:11.5px">${escapeHtml(p.category || 'Mỹ phẩm')}</span>
          ${p.supplier_name ? `<span class="badge" style="background:rgba(100,116,139,0.12);color:var(--text-secondary);font-size:11.5px">🏢 ${escapeHtml(p.supplier_name)}</span>` : ''}
          ${isOfficial ? '<span class="badge badge-active">✓ Đang bán</span>' : '<span class="badge badge-locked">🚫 Ngừng bán</span>'}
        </div>
        <h2 style="font-size:19px;font-weight:800;color:var(--text-primary);margin-bottom:6px;line-height:1.4">${escapeHtml(p.name)}</h2>
        <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap">
          <span style="font-size:22px;font-weight:800;color:#e85a2a">${p.price ? formatCurrency(p.price) : 'Chưa định giá'}</span>
        </div>
        ${p.description ? `<p style="font-size:13px;color:var(--text-secondary);margin-top:6px;line-height:1.4">${escapeHtml(p.description)}</p>` : ''}
      </div>
    </div>

    <!-- 2. Khu vực Đánh giá: Khung Tổng quan Đánh giá (Header Box) 3 cột chuẩn Hasaki -->
    <div style="margin-top:18px">
      <h3 style="font-size:16px;font-weight:800;color:var(--text-primary);margin-bottom:12px;display:flex;align-items:center;gap:8px">
        💬 Đánh giá (${stats.total_reviews})
      </h3>

      <div class="hasaki-overview-box">
        <!-- Cột trái: Điểm trung bình -->
        <div style="text-align:center;border-right:1px solid var(--border);padding-right:14px">
          <div style="font-size:38px;font-weight:900;color:#ff6600;line-height:1;margin-bottom:4px">
            ${stats.total_reviews > 0 ? Number(stats.avg_rating).toFixed(1) : '0.0'}
          </div>
          <div style="margin-bottom:4px">
            ${renderStarsHtml(stats.avg_rating, 17)}
          </div>
          <div style="font-size:12px;color:var(--text-muted);font-weight:600">
            ${stats.total_reviews} đánh giá
          </div>
        </div>

        <!-- Cột giữa: Bộ lọc Quick Filter Pills theo số sao -->
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-content:center">
          ${pillsHtml}
        </div>

        <!-- Cột phải: Kêu gọi hành động -->
        <div style="text-align:center;border-left:1px solid var(--border);padding-left:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.4">
            Chia sẻ nhận xét của bạn về sản phẩm này
          </div>
          ${ctaBtnHtml}
        </div>
      </div>
    </div>

    <!-- 3. Khu vực Nhập / Sửa Đánh giá (Inline Form) -->
    <div id="hasaki-write-section" style="${isWritingReviewOpen ? 'display:block;' : 'display:none;'}margin-top:16px;background:rgba(232,90,42,0.04);border:1.5px dashed rgba(232,90,42,0.35);border-radius:12px;padding:16px 20px">
      <div style="font-weight:700;font-size:14px;color:#e85a2a;margin-bottom:10px">
        ${myFb ? '✏️ Chỉnh sửa đánh giá của bạn' : '✍️ Viết đánh giá cho sản phẩm này'}
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label style="font-size:12.5px;font-weight:600;margin-bottom:4px;display:block">Đánh giá mức độ hài lòng *</label>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="display:flex;gap:6px" onmouseleave="resetHasakiStarPreview()">
            ${[1, 2, 3, 4, 5].map(star => `
              <span id="hstar-${star}" style="cursor:pointer;font-size:30px;color:${star <= hasakiSelectedRating ? '#fbbf24' : '#94a3b8'};transition:transform 0.15s,color 0.15s;user-select:none"
                    onmouseover="previewHasakiStar(${star})"
                    onclick="setHasakiStar(${star})">★</span>
            `).join('')}
          </div>
          <span id="hstar-text" style="font-size:13px;font-weight:700;color:#e85a2a">
            ${getHasakiRatingLabel(hasakiSelectedRating)}
          </span>
        </div>
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label style="font-size:12.5px;font-weight:600;margin-bottom:4px;display:block">Nội dung nhận xét</label>
        <textarea id="hasaki-review-content" placeholder="Chia sẻ trải nghiệm thực tế về công dụng, mùi hương, kết cấu..." style="width:100%;min-height:85px;padding:10px;font-size:13px;border-radius:8px;border:1px solid var(--border)">${escapeHtml(myFb ? (myFb.content || '') : '')}</textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-secondary btn-sm" onclick="toggleHasakiWriteSection(false)">Đóng</button>
        <button type="button" class="hasaki-btn-write" style="padding:6px 18px" onclick="submitHasakiReview()">${myFb ? '💾 Lưu thay đổi' : '📤 Gửi đánh giá'}</button>
      </div>
    </div>

    <!-- 4. Thanh Sắp xếp & Phân trang danh sách đánh giá -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin:18px 0 10px 0;padding-bottom:10px;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:10px">
      <div style="font-size:13.5px;font-weight:700;color:var(--text-primary)">
        <span id="hasaki-filtered-count">0</span> đánh giá cho sản phẩm này
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <label for="hasaki-sort-select" style="font-size:12px;color:var(--text-muted);white-space:nowrap">Sắp xếp theo:</label>
        <select id="hasaki-sort-select" onchange="changeHasakiSort(this.value)" style="height:32px;font-size:12px;padding:2px 10px;border-radius:6px">
          <option value="LATEST" ${hasakiSortBy === 'LATEST' ? 'selected' : ''}>Ngày đánh giá mới nhất</option>
          <option value="RATING_DESC" ${hasakiSortBy === 'RATING_DESC' ? 'selected' : ''}>Số sao cao nhất</option>
          <option value="RATING_ASC" ${hasakiSortBy === 'RATING_ASC' ? 'selected' : ''}>Số sao thấp nhất</option>
        </select>
      </div>
    </div>

    <!-- 5. Danh sách từng lượt Đánh giá của Khách hàng (Review Items) -->
    <div id="hasaki-reviews-container"></div>

    <!-- 6. Cụm nút phân trang nhỏ gọn (< 1 2 3 >) -->
    <div id="hasaki-pagination-container" style="margin-top:16px;display:flex;justify-content:center"></div>
  `;

  document.getElementById('modal-body').innerHTML = html;
  renderHasakiReviewsList();
}

function renderHasakiReviewsList() {
  const container = document.getElementById('hasaki-reviews-container');
  const countEl = document.getElementById('hasaki-filtered-count');
  const paginationEl = document.getElementById('hasaki-pagination-container');
  if (!container) return;

  const currentUserId = state?.user?.id ? Number(state.user.id) : null;

  // Filter
  let filtered = currentHasakiFeedbacks.filter(f => {
    if (hasakiFilterStar === 'REPLIED') {
      return Boolean(f.reply_content && f.reply_content.trim());
    }
    if (['1', '2', '3', '4', '5'].includes(hasakiFilterStar)) {
      return Number(f.rating) === Number(hasakiFilterStar);
    }
    return true; // 'ALL'
  });

  // Sort
  if (hasakiSortBy === 'RATING_DESC') {
    filtered.sort((a, b) => Number(b.rating) - Number(a.rating));
  } else if (hasakiSortBy === 'RATING_ASC') {
    filtered.sort((a, b) => Number(a.rating) - Number(b.rating));
  } else {
    // LATEST
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  if (countEl) countEl.textContent = filtered.length;

  const total = filtered.length;
  const maxPage = Math.max(1, Math.ceil(total / HASAKI_PAGE_SIZE));
  if (hasakiPage > maxPage) hasakiPage = maxPage;

  const start = (hasakiPage - 1) * HASAKI_PAGE_SIZE;
  const pagedList = filtered.slice(start, start + HASAKI_PAGE_SIZE);

  if (total === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:34px 16px;color:var(--text-muted)">
        <div style="font-size:36px;margin-bottom:8px">💬</div>
        <p style="font-size:13.5px">Chưa có đánh giá nào phù hợp với bộ lọc này</p>
      </div>
    `;
    if (paginationEl) paginationEl.innerHTML = '';
    return;
  }

  container.innerHTML = pagedList.map(f => {
    const isCurrentUserReview = currentUserId && Number(f.account_id) === currentUserId;

    return `
      <div class="hasaki-review-card">
        <!-- Dòng 1: Tên khách hàng + (Bạn) + Nút Sửa -->
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-weight:700;font-size:13.5px;color:var(--text-primary)">
            ${escapeHtml(f.customer_name || 'Khách hàng')}
          </span>
          ${isCurrentUserReview ? `
            <span class="badge" style="background:rgba(232,90,42,0.12);color:#e85a2a;font-size:11px;font-weight:700">(Bạn)</span>
            ${f.status === 'PENDING' ? `<button type="button" class="btn btn-warning btn-sm" style="font-size:10.5px;padding:2px 7px;line-height:1" onclick="toggleHasakiWriteSection(true)">✏️ Sửa</button>` : ''}
          ` : ''}
        </div>

        <!-- Dòng 2: Badge số sao màu cam (ví dụ: 5★) + Nhãn mức độ hài lòng | Thời gian đánh giá -->
        <div style="display:flex;align-items:center;gap:8px;margin:2px 0">
          <span class="hasaki-star-badge">${f.rating}★</span>
          <span style="font-size:12.5px;font-weight:600;color:var(--text-primary)">
            ${getHasakiRatingLabel(f.rating)}
          </span>
          <span style="color:var(--text-muted);font-size:12px">|</span>
          <span style="color:var(--text-muted);font-size:12px">
            ${formatDate(f.created_at)}
          </span>
        </div>

        <!-- Dòng 3: Tên sản phẩm màu xám nhạt -->
        <div style="font-size:12px;color:var(--text-muted);margin:2px 0">
          Phân loại: ${escapeHtml(currentHasakiProduct.category || 'Mỹ phẩm chính hãng')}
        </div>

        <!-- Dòng 4: Nội dung nhận xét của khách hàng -->
        <div style="font-size:13.5px;line-height:1.55;color:var(--text-primary);margin-top:2px">
          ${escapeHtml(f.content || '(Khách hàng không để lại nhận xét bằng chữ)')}
        </div>

        <!-- Khối Phản hồi của Hasaki CSKH (Nếu đã được CSKH trả lời) -->
        ${f.reply_content ? `
          <div class="hasaki-cskh-box">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span class="hasaki-cskh-tag">Hasaki</span>
              <span style="font-size:12px;font-weight:700;color:#214e34">Chăm sóc khách hàng</span>
            </div>
            <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.5">
              ${escapeHtml(f.reply_content)}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // Small compact pagination (< 1 2 3 >)
  if (paginationEl) {
    if (maxPage <= 1) {
      paginationEl.innerHTML = '';
    } else {
      let pageBtns = '';
      for (let p = 1; p <= maxPage; p++) {
        pageBtns += `
          <button type="button" class="pagination-btn ${p === hasakiPage ? 'active' : ''}" style="${p === hasakiPage ? 'background:#e85a2a!important;border-color:#e85a2a!important;color:#fff!important;' : ''}" onclick="setHasakiPage(${p})">${p}</button>
        `;
      }
      paginationEl.innerHTML = `
        <div class="pagination-controls" style="margin-top:4px">
          <button type="button" class="pagination-btn" ${hasakiPage <= 1 ? 'disabled' : ''} onclick="setHasakiPage(${hasakiPage - 1})" title="Trang trước">&lt;</button>
          ${pageBtns}
          <button type="button" class="pagination-btn" ${hasakiPage >= maxPage ? 'disabled' : ''} onclick="setHasakiPage(${hasakiPage + 1})" title="Trang sau">&gt;</button>
        </div>
      `;
    }
  }
}

function setHasakiFilter(filterKey) {
  hasakiFilterStar = filterKey;
  hasakiPage = 1;
  renderHasakiModalContent();
}

function changeHasakiSort(sortVal) {
  hasakiSortBy = sortVal;
  hasakiPage = 1;
  renderHasakiReviewsList();
}

function setHasakiPage(page) {
  hasakiPage = page;
  renderHasakiReviewsList();
}

function toggleHasakiWriteSection(isEdit = false) {
  if (currentHasakiMyFeedback?.status === 'REPLIED') {
    toast('Đánh giá đã được phản hồi, không thể chỉnh sửa.', 'error');
    return;
  }
  isWritingReviewOpen = !isWritingReviewOpen;
  const section = document.getElementById('hasaki-write-section');
  if (section) {
    section.style.display = isWritingReviewOpen ? 'block' : 'none';
    if (isWritingReviewOpen) {
      if (currentHasakiMyFeedback) {
        hasakiSelectedRating = Number(currentHasakiMyFeedback.rating) || 5;
        const ta = document.getElementById('hasaki-review-content');
        if (ta) ta.value = currentHasakiMyFeedback.content || '';
      } else {
        hasakiSelectedRating = 5;
      }
      updateHasakiStarUI(hasakiSelectedRating);
      section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

function previewHasakiStar(val) {
  updateHasakiStarUI(val);
}

function resetHasakiStarPreview() {
  updateHasakiStarUI(hasakiSelectedRating);
}

function setHasakiStar(val) {
  hasakiSelectedRating = val;
  updateHasakiStarUI(val);
}

function updateHasakiStarUI(val) {
  for (let s = 1; s <= 5; s++) {
    const starEl = document.getElementById(`hstar-${s}`);
    if (starEl) {
      starEl.style.color = s <= val ? '#fbbf24' : '#94a3b8';
      starEl.style.transform = s <= val ? 'scale(1.1)' : 'scale(1)';
    }
  }
  const textEl = document.getElementById('hstar-text');
  if (textEl) {
    textEl.textContent = getHasakiRatingLabel(val);
  }
}

async function submitHasakiReview() {
  if (!currentHasakiProduct) return;
  const rating = hasakiSelectedRating;
  const content = (document.getElementById('hasaki-review-content')?.value || '').trim();

  if (!rating || rating < 1 || rating > 5) {
    toast('Vui lòng chọn số sao đánh giá (1-5 sao)', 'error');
    return;
  }

  try {
    if (currentHasakiMyFeedback && currentHasakiMyFeedback.id) {
      await api('PUT', `/api/customer/feedbacks/${currentHasakiMyFeedback.id}`, { _version:currentHasakiMyFeedback.record_version, rating, content });
      toast('Đã cập nhật đánh giá của bạn thành công!', 'success');
    } else {
      await api('POST', '/api/customer/feedbacks', {
        product_id: currentHasakiProduct.id,
        rating,
        content
      });
      toast('Cảm ơn bạn đã gửi đánh giá cho sản phẩm!', 'success');
    }

    // Refresh modal data
    const data = await api('GET', `/api/customer/products/${currentHasakiProduct.id}/feedbacks`);
    currentHasakiProduct = data.product;
    currentHasakiFeedbacks = data.feedbacks || [];
    currentHasakiStats = data.stats || {};
    currentHasakiMyFeedback = data.my_feedback || null;
    isWritingReviewOpen = false;
    renderHasakiModalContent();

    // Also refresh background products list so product card displays updated stars and review count
    const updatedProducts = await api('GET', '/api/customer/products').catch(() => null);
    if (updatedProducts) {
      allCustomerHomeProducts = updatedProducts;
      handleCustomerHomeFilter();
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

function setFeedbackStar(rating) {
  document.getElementById('fb-rating').value = rating;
  updateFeedbackStarsUI(rating);
}

function hoverFeedbackStar(val) {
  updateFeedbackStarsUI(val);
}

function resetFeedbackStar() {
  const currentVal = Number(document.getElementById('fb-rating')?.value) || 0;
  updateFeedbackStarsUI(currentVal);
}

function updateFeedbackStarsUI(val) {
  const labels = ['', '1 sao - Rất không hài lòng', '2 sao - Chưa hài lòng', '3 sao - Bình thường', '4 sao - Hài lòng', '5 sao - Rất hài lòng! ⭐'];
  for (let i = 1; i <= 5; i++) {
    const lbl = document.getElementById(`fb-star-${i}`);
    if (lbl) {
      if (i <= val) {
        lbl.style.color = '#fbbf24';
        lbl.style.textShadow = '0 0 12px rgba(251, 191, 36, 0.6)';
        lbl.style.transform = 'scale(1.18)';
      } else {
        lbl.style.color = '#94a3b8';
        lbl.style.textShadow = 'none';
        lbl.style.transform = 'scale(1)';
      }
    }
  }
  const desc = document.getElementById('fb-star-desc');
  if (desc) {
    desc.textContent = labels[val] || '';
  }
}

async function submitFeedback() {
  const product_id = document.getElementById('fb-product').value;
  const rating = document.getElementById('fb-rating').value;
  const content = document.getElementById('fb-content').value.trim();
  if (!product_id || !rating) { toast('Vui lòng chọn sản phẩm và đánh giá số sao', 'error'); return; }
  try {
    await api('POST', '/api/customer/feedbacks', { product_id: Number(product_id), rating: Number(rating), content });
    toast('Cảm ơn bạn đã gửi đánh giá! 🌸', 'success');
    closeModal();
    if (state.currentPage === 'customer-feedback') {
      renderCustomerFeedback();
    } else {
      navigate('customer-feedback');
    }
  } catch (e) { toast(e.message, 'error'); }
}

// ========== CUSTOMER: PROFILE ==========
async function renderCustomerProfile() {
  const requestedPage=state.currentPage;
  setPageHeader('👤 Hồ sơ cá nhân', 'Quản lý thông tin và sở thích làm đẹp của bạn');
  showLoading();
  try {
    const { account, customer } = await api('GET', '/api/customer/profile');
    customerProfileVersion=account.record_version;
    const skinOptions = ['Da dầu', 'Da khô', 'Da hỗn hợp', 'Da nhạy cảm', 'Da thường'];
    const beautyPrefsOptions = BEAUTY_PREFERENCE_OPTIONS;

    const currentPrefs = (customer?.beauty_preferences || '').split(',').map(p => p.trim()).filter(Boolean);

    const html = `
      <div style="max-width:640px;margin:0 auto">
        <!-- Profile Header -->
        <div style="background:linear-gradient(135deg,rgba(244,63,94,0.1),rgba(168,85,247,0.1));border:1px solid var(--border);border-radius:var(--radius-xl);padding:28px;margin-bottom:24px;text-align:center">
          <div style="width:80px;height:80px;background:var(--grad-rose);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:800;color:white;margin:0 auto 14px;box-shadow:var(--glow-rose)">
            ${escapeHtml(account.full_name.charAt(0).toUpperCase())}
          </div>
          <h2 style="font-size:20px;font-weight:800">${escapeHtml(account.full_name)}</h2>
          <p style="color:var(--text-muted);font-size:13px">@${escapeHtml(account.username)}</p>
          <div style="margin-top:10px;display:flex;justify-content:center;gap:8px">
            ${roleBadge(state.user.role)}
            ${statusBadge(account.status)}
          </div>
        </div>

        <!-- Edit Form -->
        <div class="card">
          <div class="card-title">✏️ Chỉnh sửa thông tin</div>
          <form id="profile-form" style="display:flex;flex-direction:column;gap:14px">
            <div class="form-group"><label>Họ và tên</label><input id="p-fullname" value="${escapeHtml(account.full_name)}"></div>
            <div class="form-row">
              <div class="form-group"><label>Email</label><input id="p-email" type="email" value="${escapeHtml(account.email || '')}"></div>
              <div class="form-group"><label>Số điện thoại</label><input id="p-phone" value="${escapeHtml(account.phone || '')}"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Độ tuổi</label><input id="p-age" type="number" min="13" max="100" value="${customer?.age || ''}"></div>
              <div class="form-group"><label>Giới tính</label>
                <select id="p-gender">
                  <option value="">-- Chọn --</option>
                  <option value="Nu" ${customer?.gender === 'Nu' ? 'selected' : ''}>Nữ</option>
                  <option value="Nam" ${customer?.gender === 'Nam' ? 'selected' : ''}>Nam</option>
                  <option value="Khac" ${customer?.gender === 'Khac' ? 'selected' : ''}>Khác</option>
                </select>
              </div>
            </div>
            <div class="form-group"><label>Loại da</label>
              <select id="p-skin">
                <option value="">-- Chọn loại da --</option>
                ${skinOptions.map(s => `<option value="${s}" ${customer?.skin_type === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Sở thích làm đẹp</label>
              <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
                ${beautyPrefsOptions.map(pref => `
                  <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 12px;border-radius:20px;border:1px solid ${currentPrefs.includes(pref) ? 'var(--rose-400)' : 'var(--border)'};background:${currentPrefs.includes(pref) ? 'rgba(244,63,94,0.12)' : 'transparent'};font-size:12px;transition:all 0.2s" id="pref-label-${pref.replace(/\s/g, '_')}" onclick="togglePref(this,'${pref}')">
                    <input type="checkbox" name="prefs" value="${pref}" ${currentPrefs.includes(pref) ? 'checked' : ''} style="display:none">
                    ${pref}
                  </label>
                `).join('')}
              </div>
            </div>
            <button type="button" class="btn btn-primary" onclick="saveProfile()">💾 Lưu thay đổi</button>
          </form>
        </div>

        <!-- Account Info -->
        <div class="card" style="margin-top:20px">
          <div class="card-title">🔒 Thông tin tài khoản</div>
          <table style="width:100%">
            <tr><td style="padding:8px 0;color:#475569;font-weight:500;font-size:13px;width:40%">Tên đăng nhập</td><td style="font-weight:600">@${escapeHtml(account.username)}</td></tr>
            <tr><td style="padding:8px 0;color:#475569;font-weight:500;font-size:13px">Ngày tạo tài khoản</td><td style="font-weight:600">${formatDate(account.created_at)}</td></tr>
          </table>
        </div>
      </div>
    `;
    if (requestedPage!==state.currentPage) return;
    setPageContent(html);
  } catch (e) { toast(e.message, 'error'); }
}

function togglePref(label, pref) {
  const checkbox = label.querySelector('input[type="checkbox"]');
  const isChecked = checkbox.checked;
  if (isChecked) {
    label.style.borderColor = 'var(--border)';
    label.style.background = 'transparent';
  } else {
    label.style.borderColor = 'var(--rose-400)';
    label.style.background = 'rgba(244,63,94,0.12)';
  }
  checkbox.checked = !isChecked;
}

async function saveProfile() {
  const prefs = [...document.querySelectorAll('input[name="prefs"]:checked')].map(el => el.value).join(',');
  try {
    await api('PUT', '/api/customer/profile', {
      _version:customerProfileVersion,
      full_name: document.getElementById('p-fullname').value.trim(),
      email: document.getElementById('p-email').value.trim(),
      phone: document.getElementById('p-phone').value.trim(),
      age: Number(document.getElementById('p-age').value) || null,
      gender: document.getElementById('p-gender').value || null,
      skin_type: document.getElementById('p-skin').value || null,
      beauty_preferences: prefs || null,
    });
    // Update display name in sidebar
    state.user.full_name = document.getElementById('p-fullname').value.trim();
    localStorage.setItem('crm_user', JSON.stringify(state.user));
    document.getElementById('sidebar-user-name').textContent = state.user.full_name;
    toast('Cập nhật hồ sơ thành công! 🌸', 'success');
  } catch (e) { toast(e.message, 'error'); }
}
