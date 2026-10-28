let editingAccountVersion, editingSupplierVersion;
/* ============================================================
   admin.js – Admin Module: Accounts, Products, Suppliers, DB Console
   ============================================================ */

// ========== ADMIN: ACCOUNTS ==========
let currentAccountsList = [];
let allAccountsList = [];

async function renderAdminAccounts() {
  const requestedPage=state.currentPage;
  setPageHeader('👥 Quản lý Tài khoản Nội bộ', 'Phân quyền và quản lý tài khoản quản trị nội bộ (Admin, Manager)',
    `<button class="btn btn-primary" onclick="openCreateAccountModal()">➕ Thêm tài khoản</button>`);
  showLoading();
  try {
    const accounts = await api('GET', '/api/admin/accounts');
    allAccountsList = accounts;
    if (requestedPage!==state.currentPage) return;
    renderAccountsTable(accounts);
  } catch (e) { toast(e.message, 'error'); }
}

function openEditAccountModalById(id) {
  const a = currentAccountsList.find(x => Number(x.id) === Number(id));
  if (a) openEditAccountModal(a);
}

const debounceFilterAccounts = debounce(filterAccounts, 150);

let adminAccountPage = 1;
const ADMIN_ACCOUNT_PAGE_SIZE = 10;

function renderAccountRowsHtml(accounts) {
  const currentUserId = state?.user?.id ? Number(state.user.id) : null;
  const totalAdmins = allAccountsList.length
    ? allAccountsList.filter(x => x.role === 'ADMIN').length
    : accounts.filter(x => x.role === 'ADMIN').length;

  if (accounts.length === 0) {
    return `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:40px">Không tìm thấy tài khoản nào</td></tr>`;
  }

  return accounts.map(a => {
    const isCurrentUser = currentUserId && Number(a.id) === currentUserId;
    const isOnlyAdmin = a.role === 'ADMIN' && totalAdmins <= 1;

    let deleteBtnHtml = '';
    if (isOnlyAdmin) {
      deleteBtnHtml = `<button class="btn btn-trash btn-sm" style="opacity:0.4;cursor:not-allowed;" title="Không thể xóa tài khoản Admin duy nhất trong hệ thống" onclick="toast('Không thể xóa tài khoản Admin khi hệ thống chỉ còn duy nhất 1 Admin!', 'error')"><svg class="trash-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2v2H2v2h1v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6h1V4h-4V2h-2v2H9V2H6zm7 5v9h-2V7h2zM9 2V4h6V2H9z"/></svg></button>`;
    } else if (isCurrentUser) {
      deleteBtnHtml = `<button class="btn btn-trash btn-sm" title="Xóa tài khoản hiện tại (Bạn sẽ bị đăng xuất)" onclick="deleteAccount(${a.id},${escapeHtml(JSON.stringify(a.full_name))})"><svg class="trash-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2v2H2v2h1v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6h1V4h-4V2h-2v2H9V2H6zm7 5v9h-2V7h2zM9 2V4h6V2H9z"/></svg></button>`;
    } else {
      deleteBtnHtml = `<button class="btn btn-trash btn-sm" title="Xóa tài khoản" onclick="deleteAccount(${a.id},${escapeHtml(JSON.stringify(a.full_name))})"><svg class="trash-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2v2H2v2h1v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6h1V4h-4V2h-2v2H9V2H6zm7 5v9h-2V7h2zM9 2V4h6V2H9z"/></svg></button>`;
    }

    let lockBtnHtml = '';
    if (isCurrentUser) {
      lockBtnHtml = `<button class="btn btn-sm" style="background:#64748b;color:#fff;border:none;opacity:0.4;cursor:not-allowed;" disabled title="Không thể tự khóa tài khoản của chính bạn">🔒</button>`;
    } else if (isOnlyAdmin && a.status === 'ACTIVE') {
      lockBtnHtml = `<button class="btn btn-sm" style="background:#64748b;color:#fff;border:none;opacity:0.4;cursor:not-allowed;" disabled title="Không thể khóa tài khoản Admin duy nhất trong hệ thống">🔒</button>`;
    } else if (a.status === 'ACTIVE') {
      lockBtnHtml = `<button class="btn btn-sm" style="background:#214e34;color:#fff;border:none;padding:4px 8px;" onclick="toggleAdminAccountStatus(${a.id},'LOCKED',${escapeHtml(JSON.stringify(a.full_name))})" title="Khóa tài khoản">🔒</button>`;
    } else {
      lockBtnHtml = `<button class="btn btn-sm" style="background:#214e34;color:#fff;border:none;padding:4px 8px;" onclick="toggleAdminAccountStatus(${a.id},'ACTIVE',${escapeHtml(JSON.stringify(a.full_name))})" title="Mở khóa tài khoản">🔓</button>`;
    }

    return `
      <tr class="row-clickable" title="Nhấp để xem chi tiết" tabindex="0" onclick="openAccountDetail(${a.id})" onkeydown="if(event.target===this && event.key==='Enter')openAccountDetail(${a.id})">
        <td><strong style="color:var(--rose-400,#214e34);font-family:monospace;font-size:13px">@${escapeHtml(a.username || '')}</strong></td>
        <td><strong>${escapeHtml(a.full_name)}</strong>${isCurrentUser ? ' <span style="font-size:10px;color:var(--text-muted)">(Bạn)</span>' : ''}</td>
        <td style="color:var(--text-secondary)">${escapeHtml(a.email || '—')}</td>
        <td style="color:var(--text-secondary)">${escapeHtml(a.phone || '—')}</td>
        <td>${roleBadge(a.role)}</td>
        <td>${statusBadge(a.status)}</td>
        <td style="color:var(--text-muted);font-size:12px">${formatDate(a.created_at)}</td>
        <td onclick="event.stopPropagation()">
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn btn-warning btn-sm" onclick="openEditAccountModalById(${a.id})" title="Chỉnh sửa tài khoản">✏️ Sửa</button>
            ${lockBtnHtml}
            ${deleteBtnHtml}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderAccountTablePage(page = 1) {
  const refined=refineList(currentAccountsList,'accounts');
  const total = refined.length;
  const maxPage = Math.max(1, Math.ceil(total / ADMIN_ACCOUNT_PAGE_SIZE));
  if (page > maxPage) page = maxPage;
  adminAccountPage = page;

  const start = (adminAccountPage - 1) * ADMIN_ACCOUNT_PAGE_SIZE;
  const pagedList = refined.slice(start, start + ADMIN_ACCOUNT_PAGE_SIZE);

  const tbody = document.getElementById('accounts-tbody');
  const countEl = document.getElementById('accounts-count');
  const paginationEl = document.getElementById('accounts-pagination');

  if (tbody) {
    tbody.innerHTML = renderAccountRowsHtml(pagedList);
  }
  if (countEl) {
    countEl.textContent = `Tổng: ${total} tài khoản · 💡 Nhấp vào một dòng để xem chi tiết`;
  }
  if (paginationEl) {
    paginationEl.innerHTML = renderPaginationBar({
      totalItems: total,
      pageSize: ADMIN_ACCOUNT_PAGE_SIZE,
      currentPage: adminAccountPage,
      onPageChangeFnName: 'renderAccountTablePage'
    });
  }
}

function renderAccountsTable(accounts, searchParams = {}) {
  currentAccountsList = accounts;
  adminAccountPage = 1;

  const html = `
    <div class="filter-bar">
      <input type="text" id="acc-search" placeholder="🔍 Tìm tên, username, email..." value="${escapeHtml(searchParams.search || '')}" oninput="debounceFilterAccounts()">
      <select id="acc-role" onchange="filterAccounts()">
        <option value="">Tất cả vai trò nội bộ</option>
        <option value="ADMIN" ${searchParams.role === 'ADMIN' ? 'selected' : ''}>👑 Admin</option>
        <option value="MANAGER" ${searchParams.role === 'MANAGER' ? 'selected' : ''}>📊 Manager</option>
      </select>

      <select id="acc-status" onchange="filterAccounts()">
        <option value="">Tất cả trạng thái</option>
        <option value="ACTIVE" ${searchParams.status === 'ACTIVE' ? 'selected' : ''}>Hoạt động</option>
        <option value="LOCKED" ${searchParams.status === 'LOCKED' ? 'selected' : ''}>Bị khóa</option>
      </select>
      <button class="btn btn-secondary" onclick="resetAdminAccountsFilters()">↺ Reset</button>
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>USERNAME</th><th>Họ và tên</th><th>Email</th><th>Số ĐT</th>
          <th>Vai trò</th><th>Trạng thái</th><th>Ngày tạo</th><th>Hành động</th>
        </tr></thead>
        <tbody id="accounts-tbody"></tbody>
      </table>
    </div>
    <div id="accounts-pagination" style="margin-top:16px"></div>
    <p id="accounts-count" style="color:var(--text-muted);font-size:12px;margin-top:10px"></p>
  `;
  setPageContent(html);
  renderAccountTablePage(1);
}

async function toggleAdminAccountStatus(id, newStatus, name) {
  const action = newStatus === 'LOCKED' ? 'khóa' : 'mở khóa';
  if (!confirm(`Xác nhận ${action} tài khoản nội bộ của "${name}"?`)) return;
  try {
    await api('PUT', `/api/admin/accounts/${id}/status`, { status: newStatus });
    toast(newStatus === 'LOCKED' ? `Đã khóa tài khoản "${name}"` : `Đã mở khóa tài khoản "${name}"`, 'success');
    const accounts = await api('GET', '/api/admin/accounts');
    allAccountsList = accounts;
    currentAccountsList = accounts;
    renderAccountTablePage(adminAccountPage);
  } catch (e) { toast(e.message, 'error'); }
}

function resetAdminAccountsFilters() {
  listToolsState['accounts']={};
  resetVisibleListTools('accounts');
  const s = document.getElementById('acc-search'); if (s) s.value = '';
  const r = document.getElementById('acc-role'); if (r) r.value = '';
  const st = document.getElementById('acc-status'); if (st) st.value = '';
  filterAccounts();
}

let filterAccountsSequence=0;
async function filterAccounts() {
  const sequence=++filterAccountsSequence;
  const search = document.getElementById('acc-search')?.value.trim() || '';
  const role = document.getElementById('acc-role')?.value || '';
  const status = document.getElementById('acc-status')?.value || '';
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (role) params.append('role', role);
  if (status) params.append('status', status);
  try {
    const accounts = await api('GET', `/api/admin/accounts?${params}`);
    if(sequence!==filterAccountsSequence)return;
    renderAccountsTable(accounts, { search, role, status });
  } catch (e) { toast(e.message, 'error'); }
}

function openCreateAccountModal() {
  showModal('➕ Tạo tài khoản quản trị nội bộ', `
    <div class="form-row">
      <div class="form-group"><label>Tên đăng nhập *</label><input id="m-username" placeholder="username"></div>
      <div class="form-group"><label>Mật khẩu *</label><input id="m-password" type="password" placeholder="Mật khẩu"></div>
    </div>
    <div class="form-group"><label>Họ và tên *</label><input id="m-fullname" placeholder="Họ và tên đầy đủ"></div>
    <div class="form-row">
      <div class="form-group"><label>Email</label><input id="m-email" type="email" placeholder="email@example.com"></div>
      <div class="form-group"><label>Số điện thoại</label><input id="m-phone" placeholder="0901234567"></div>
    </div>
    <div class="form-group"><label>Phân quyền nội bộ</label>
      <select id="m-role">
        <option value="MANAGER">📊 Manager</option>
        <option value="ADMIN">👑 Admin</option>
      </select>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="createAccount()">✅ Tạo tài khoản</button>
    </div>
  `);
}

async function createAccount() {
  try {
    await api('POST', '/api/admin/accounts', {
      username: document.getElementById('m-username').value.trim(),
      password: document.getElementById('m-password').value,
      full_name: document.getElementById('m-fullname').value.trim(),
      email: document.getElementById('m-email').value.trim(),
      phone: document.getElementById('m-phone').value.trim(),
      role: document.getElementById('m-role').value,
    });
    toast('Tạo tài khoản thành công!', 'success');
    closeModal();
    renderAdminAccounts();
  } catch (e) { toast(e.message, 'error'); }
}

function openEditAccountModal(a) {
  editingAccountVersion=a.record_version;
  if (typeof a === 'string') a = JSON.parse(a.replace(/&quot;/g, '"'));
  const totalAdmins = allAccountsList.length
    ? allAccountsList.filter(x => x.role === 'ADMIN').length
    : currentAccountsList.filter(x => x.role === 'ADMIN').length;
  const isOnlyAdmin = (a.role === 'ADMIN' && totalAdmins <= 1);
  const isCurrentUser = state?.user && Number(a.id) === Number(state.user.id);

  showModal(`✏️ Xem & Sửa tài khoản: ${a.full_name}`, `
    ${isOnlyAdmin ? `
      <div style="background:rgba(239, 68, 68, 0.1);border:1px solid rgba(239, 68, 68, 0.3);color:#f87171;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:16px;line-height:1.5">
        ⚠️ <strong>Lưu ý:</strong> Đây là tài khoản <strong>Admin duy nhất</strong> trong hệ thống. Không thể chuyển sang vai trò khác hoặc khóa tài khoản này để bảo đảm quyền quản trị.
      </div>
    ` : ''}
    <div class="form-row">
      <div class="form-group"><label>Tên đăng nhập *</label><input id="e-username" value="${escapeHtml(a.username || '')}" autocomplete="off"></div>
      <div class="form-group">
        <label>Mật khẩu ${passwordNote(a.password)}</label>
        <div style="display:flex;gap:6px">
          <input id="e-password" type="password" value="${escapeHtml(viewablePassword(a.password))}" autocomplete="off" placeholder="Để trống để giữ mật khẩu cũ" style="flex:1">
          <button type="button" class="btn btn-secondary btn-sm" onclick="toggleInputVisibility('e-password', this)" title="Ẩn/Hiện mật khẩu">👁️</button>
        </div>
      </div>
    </div>
    <div class="form-group"><label>Họ và tên *</label><input id="e-fullname" value="${escapeHtml(a.full_name || '')}"></div>
    <div class="form-row">
      <div class="form-group"><label>Email</label><input id="e-email" type="email" value="${escapeHtml(a.email || '')}"></div>
      <div class="form-group"><label>Số điện thoại</label><input id="e-phone" value="${escapeHtml(a.phone || '')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Phân quyền nội bộ</label>
        <select id="e-role" ${isOnlyAdmin ? 'disabled title="Không thể đổi vai trò của Admin duy nhất"' : ''}>
          <option value="MANAGER" ${a.role === 'MANAGER' ? 'selected' : ''}>📊 Manager</option>
          <option value="ADMIN" ${a.role === 'ADMIN' ? 'selected' : ''}>👑 Admin</option>
        </select>
      </div>
      <div class="form-group">
        <label>Khóa / Trạng thái</label>
        <select id="e-status" ${isOnlyAdmin ? 'disabled title="Không thể khóa tài khoản của Admin duy nhất"' : ''}>
          <option value="ACTIVE" ${a.status === 'ACTIVE' ? 'selected' : ''}>✓ Hoạt động</option>
          <option value="LOCKED" ${a.status === 'LOCKED' ? 'selected' : ''}>🔒 Khóa tài khoản</option>
        </select>
      </div>
    </div>
    ${isCurrentUser ? `<p style="font-size:12px;color:var(--text-muted);margin-top:4px">ℹ️ Đây là tài khoản bạn đang đăng nhập. Nếu đổi vai trò hoặc khóa, bạn sẽ bị đăng xuất.</p>` : ''}
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="updateAccount(${a.id})">💾 Lưu thay đổi</button>
    </div>
  `);
}

async function updateAccount(id) {
  try {
    const roleEl = document.getElementById('e-role');
    const statusEl = document.getElementById('e-status');
    const acc = currentAccountsList.find(x => Number(x.id) === Number(id));
    const role = roleEl && !roleEl.disabled ? roleEl.value : (acc ? acc.role : 'ADMIN');
    const status = statusEl && !statusEl.disabled ? statusEl.value : (acc ? acc.status : 'ACTIVE');
    const payload = {
      _version:editingAccountVersion,
      username: document.getElementById('e-username').value.trim(),
      password: document.getElementById('e-password').value,
      full_name: document.getElementById('e-fullname').value.trim(),
      email: document.getElementById('e-email').value.trim(),
      phone: document.getElementById('e-phone').value.trim(),
      role,
      status,
    };
    if (!payload.username || !payload.full_name) {
      toast('Tên đăng nhập và họ tên không được để trống', 'error');
      return;
    }

    await api('PUT', `/api/admin/accounts/${id}`, payload);
    toast('Cập nhật tài khoản thành công!', 'success');
    closeModal();
    renderAdminAccounts();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteAccount(id, name) {
  const isCurrentUser = state?.user && Number(id) === Number(state.user.id);
  const acc = currentAccountsList.find(x => Number(x.id) === Number(id));
  const totalAdmins = allAccountsList.length
    ? allAccountsList.filter(x => x.role === 'ADMIN').length
    : currentAccountsList.filter(x => x.role === 'ADMIN').length;

  if (acc && acc.role === 'ADMIN' && totalAdmins <= 1) {
    toast('Không thể xóa tài khoản Admin khi hệ thống chỉ còn duy nhất 1 Admin!', 'error');
    return;
  }

  const confirmMsg = isCurrentUser
    ? `CẢNH BÁO: Bạn đang thực hiện xóa chính tài khoản "${name}" đang đăng nhập! Hệ thống sẽ xóa vĩnh viễn và tự động đăng xuất ngay sau đó. Bạn có chắc chắn muốn tiếp tục?`
    : `Xác nhận xóa tài khoản "${name}"? Hành động này không thể hoàn tác.`;

  if (!confirm(confirmMsg)) return;

  try {
    await api('DELETE', `/api/admin/accounts/${id}`);
    if (isCurrentUser) {
      toast('Tài khoản của bạn đã được xóa thành công. Đang đăng xuất...', 'info');
      setTimeout(() => {
        logout();
      }, 1000);
    } else {
      toast('Đã xóa tài khoản', 'success');
      renderAdminAccounts();
    }
  } catch (e) { toast(e.message, 'error'); }
}

// ========== MANAGER: CATEGORIES ==========
let currentCategoriesList = [];
let currentEditingCategory = null;
let categoryPage = 1;
const CATEGORY_PAGE_SIZE = 10;

async function renderManagerCategories() {
  const requestedPage = state.currentPage;
  setPageHeader('🏷️ Quản lý Danh mục', 'Quản lý loại sản phẩm; đổi tên vẫn giữ nguyên liên kết sản phẩm và lịch sử đánh giá',
    `<button class="btn btn-primary" onclick="openCreateCategoryModal()">➕ Thêm danh mục</button>`);
  showLoading();
  try {
    const categories = await api('GET', '/api/admin/categories');
    if (requestedPage !== state.currentPage) return;
    currentCategoriesList = categories || [];
    setPageContent(`
      <div class="filter-bar">
        <input type="text" id="category-search" placeholder="🔍 Tên hoặc mô tả danh mục..." oninput="debounceCategoryFilters()">
        <select id="category-status" onchange="filterCategories()">
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">✓ Đang sử dụng</option>
          <option value="INACTIVE">✕ Ngừng sử dụng</option>
        </select>
        <button class="btn btn-secondary" onclick="resetCategoryFilters()">↺ Reset</button>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>ID</th><th>Tên danh mục</th><th>Mô tả</th><th>Sản phẩm</th><th>Đánh giá</th><th>Trạng thái</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead>
          <tbody id="categories-tbody"></tbody>
        </table>
      </div>
      <div id="categories-pagination"></div>
    `);
    renderCategoryPage(1);
  } catch (e) { toast(e.message, 'error'); }
}

function renderCategoryRows(categories) {
  return categories.map(category => `
    <tr>
      <td><span style="color:var(--text-muted)">#${category.id}</span></td>
      <td><strong>${escapeHtml(category.name)}</strong></td>
      <td style="max-width:320px;color:var(--text-secondary);font-size:12px">${escapeHtml(category.description || '—')}</td>
      <td><span class="tag">${Number(category.product_count) || 0} sản phẩm</span></td>
      <td style="color:var(--text-secondary)">💬 ${Number(category.review_count) || 0}</td>
      <td>${statusBadge(category.status)}</td>
      <td style="color:var(--text-muted);font-size:12px">${formatDate(category.created_at)}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="openEditCategoryModalById(${category.id})">Sửa</button>
          <button class="btn btn-trash btn-sm" onclick="deleteCategory(${category.id},${escapeHtml(JSON.stringify(category.name))},${Number(category.product_count) || 0})">${Number(category.product_count) > 0 ? 'Ngừng dùng' : 'Xóa'}</button>
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="8" class="empty-cell">Không tìm thấy danh mục</td></tr>';
}

function renderCategoryPage(page) {
  categoryPage = page;
  const tbody = document.getElementById('categories-tbody');
  const pagination = document.getElementById('categories-pagination');
  if (!tbody) return;
  const total = currentCategoriesList.length;
  const maxPage = Math.max(1, Math.ceil(total / CATEGORY_PAGE_SIZE));
  categoryPage = Math.min(categoryPage, maxPage);
  const start = (categoryPage - 1) * CATEGORY_PAGE_SIZE;
  tbody.innerHTML = renderCategoryRows(currentCategoriesList.slice(start, start + CATEGORY_PAGE_SIZE));
  if (pagination) pagination.innerHTML = renderPaginationBar({
    totalItems: total,
    pageSize: CATEGORY_PAGE_SIZE,
    currentPage: categoryPage,
    onPageChangeFnName: 'renderCategoryPage'
  });
}

const debounceCategoryFilters = debounce(filterCategories, 150);
let categoryFilterSequence = 0;
async function filterCategories() {
  const sequence = ++categoryFilterSequence;
  const params = new URLSearchParams();
  const search = document.getElementById('category-search')?.value.trim();
  const status = document.getElementById('category-status')?.value;
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  try {
    const categories = await api('GET', `/api/admin/categories?${params}`);
    if (sequence !== categoryFilterSequence) return;
    currentCategoriesList = categories || [];
    renderCategoryPage(1);
  } catch (e) { toast(e.message, 'error'); }
}

function resetCategoryFilters() {
  const search = document.getElementById('category-search');
  const status = document.getElementById('category-status');
  if (search) search.value = '';
  if (status) status.value = '';
  filterCategories();
}

function openCreateCategoryModal() {
  showModal('➕ Thêm danh mục mới', `
    <div class="form-group"><label>Tên danh mục *</label><input id="mc-name" maxlength="50" placeholder="Ví dụ: Chăm sóc tóc"></div>
    <div class="form-group"><label>Mô tả</label><textarea id="mc-description" maxlength="500" placeholder="Mô tả ngắn về loại sản phẩm"></textarea></div>
    <div class="form-group"><label>Trạng thái</label><select id="mc-status"><option value="ACTIVE">✓ Đang sử dụng</option><option value="INACTIVE">✕ Ngừng sử dụng</option></select></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Hủy</button><button class="btn btn-primary" onclick="createCategory()">✅ Thêm danh mục</button></div>
  `);
}

async function createCategory() {
  const name = document.getElementById('mc-name').value.trim();
  if (!name) return toast('Tên danh mục là bắt buộc', 'warning');
  try {
    await api('POST', '/api/admin/categories', {
      name,
      description: document.getElementById('mc-description').value.trim(),
      status: document.getElementById('mc-status').value
    });
    toast('Thêm danh mục thành công!', 'success');
    closeModal();
    renderManagerCategories();
  } catch (e) { toast(e.message, 'error'); }
}

function openEditCategoryModalById(id) {
  const category = currentCategoriesList.find(item => Number(item.id) === Number(id));
  if (!category) return;
  currentEditingCategory = category;
  showModal(`✏️ Chỉnh sửa: ${escapeHtml(category.name)}`, `
    ${Number(category.product_count) > 0 ? `<div style="background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.3);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:16px;font-size:12px;color:#93c5fd;line-height:1.5">Danh mục đang có <strong>${category.product_count} sản phẩm</strong>. Bạn vẫn có thể đổi tên; SQL Server giữ nguyên liên kết và lịch sử đánh giá.</div>` : ''}
    <div class="form-group"><label>Tên danh mục *</label><input id="ec-name" maxlength="50" value="${escapeHtml(category.name)}"></div>
    <div class="form-group"><label>Mô tả</label><textarea id="ec-description" maxlength="500">${escapeHtml(category.description || '')}</textarea></div>
    <div class="form-group"><label>Trạng thái</label><select id="ec-status"><option value="ACTIVE" ${category.status === 'ACTIVE' ? 'selected' : ''}>✓ Đang sử dụng</option><option value="INACTIVE" ${category.status === 'INACTIVE' ? 'selected' : ''}>✕ Ngừng sử dụng</option></select></div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">Hủy</button><button class="btn btn-primary" onclick="updateCategory(${category.id})">💾 Lưu thay đổi</button></div>
  `);
}

async function updateCategory(id) {
  const name = document.getElementById('ec-name').value.trim();
  if (!name) return toast('Tên danh mục là bắt buộc', 'warning');
  try {
    const result = await api('PUT', `/api/admin/categories/${id}`, {
      _version: currentEditingCategory?.record_version,
      name,
      description: document.getElementById('ec-description').value.trim(),
      status: document.getElementById('ec-status').value
    });
    toast(result.message || 'Cập nhật danh mục thành công!', 'success');
    closeModal();
    renderManagerCategories();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteCategory(id, name, productCount) {
  const count = Number(productCount) || 0;
  const message = count > 0
    ? `Danh mục "${name}" đang có ${count} sản phẩm nên không thể xóa. Hệ thống sẽ chuyển danh mục sang "Ngừng sử dụng" và giữ nguyên mọi liên kết. Bạn có đồng ý?`
    : `Xác nhận xóa vĩnh viễn danh mục "${name}"?`;
  if (!confirm(message)) return;
  try {
    const result = await api('DELETE', `/api/admin/categories/${id}`);
    toast(result.message || 'Đã xử lý danh mục', 'success');
    renderManagerCategories();
  } catch (e) { toast(e.message, 'error'); }
}

function categoryOptions(categories, selected = '', activeOnly = false) {
  return (categories || [])
    .filter(category => !activeOnly || category.status === 'ACTIVE' || category.name === selected)
    .map(category => `<option value="${escapeHtml(category.name)}" ${category.name === selected ? 'selected' : ''} ${activeOnly && category.status === 'INACTIVE' && category.name !== selected ? 'disabled' : ''}>${escapeHtml(category.name)}${category.status === 'INACTIVE' ? ' (Ngừng sử dụng ✕)' : ''}</option>`)
    .join('');
}

// ========== ADMIN: PRODUCTS ==========
let productFilters = {};

async function renderAdminProducts() {
  setPageHeader('💄 Quản lý Sản phẩm', 'Tìm kiếm nâng cao, sắp xếp và quản lý danh mục mỹ phẩm',
    `<button class="btn btn-primary" onclick="openCreateProductModal()">➕ Thêm sản phẩm</button>`);
  showLoading();
  await fetchAndRenderProducts({});
}

let currentProductsList = [];
let currentEditingProduct = null;

function openEditProductModalById(id) {
  const p = currentProductsList.find(x => Number(x.id) === Number(id));
  if (p) openEditProductModal(p);
}

function renderProductRowsHtml(products) {
  if (products.length === 0) {
    return '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:40px">Không tìm thấy sản phẩm nào</td></tr>';
  }
  return products.map(p => `
    <tr ${detailRow('openProductDetail',p.id)}>
      <td><span style="color:var(--text-muted)">#${p.id}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:22px">${getCategoryIcon(p.category)}</span>
          <div>
            <div style="font-weight:600;max-width:200px">${escapeHtml(p.name)}</div>

          </div>
        </div>
      </td>
      <td><span class="tag">${escapeHtml(p.category)}</span></td>
      <td style="color:var(--text-secondary);font-size:12px">${p.supplier_name ? escapeHtml(p.supplier_name) : '—'}</td>
      <td><strong style="color:var(--rose-300)">${formatCurrency(p.price)}</strong></td>
      <td>
        <div>
          ${launchBadge(p.launch_status)}
          ${p.review_count > 0
            ? `<div style="font-size:11px;color:#93c5fd;margin-top:3px;font-weight:500">💬 ${p.review_count} đánh giá</div>`
            : `<div style="font-size:11px;color:var(--text-muted);margin-top:3px">Chưa có đánh giá</div>`}
        </div>
      </td>
      <td style="color:var(--text-muted);font-size:12px">${formatDate(p.created_at)}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="openEditProductModalById(${p.id})" title="Chỉnh sửa sản phẩm">✏️</button>
          <button class="btn btn-trash btn-sm" onclick="deleteProduct(${p.id},${escapeHtml(JSON.stringify(p.name))},${(Number(p.review_count) || 0)+(Number(p.survey_count) || 0)})" title="${(Number(p.review_count)+Number(p.survey_count)) > 0 ? 'Ngừng bán (bảo toàn đánh giá CRM)' : 'Xóa vĩnh viễn'}"><svg class="trash-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2v2H2v2h1v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6h1V4h-4V2h-2v2H9V2H6zm7 5v9h-2V7h2zM9 2V4h6V2H9z"/></svg></button>
        </div>
      </td>
    </tr>
  `).join('');
}

const ADMIN_PRODUCT_PAGE_SIZE = 10;
let adminProductPage = 1;

function renderProductPage(page) {
  adminProductPage = page;
  const tbody = document.getElementById('products-tbody');
  const paginationEl = document.getElementById('products-pagination');
  if (!tbody) return;

  const refined=refineList(currentProductsList,'products');
  const total = refined.length;
  const maxPage = Math.max(1, Math.ceil(total / ADMIN_PRODUCT_PAGE_SIZE));
  if (adminProductPage > maxPage) adminProductPage = maxPage;
  const start = (adminProductPage - 1) * ADMIN_PRODUCT_PAGE_SIZE;
  const pagedList = refined.slice(start, start + ADMIN_PRODUCT_PAGE_SIZE);

  tbody.innerHTML = renderProductRowsHtml(pagedList);

  if (paginationEl) {
    paginationEl.innerHTML = renderPaginationBar({
      totalItems: total,
      pageSize: ADMIN_PRODUCT_PAGE_SIZE,
      currentPage: adminProductPage,
      onPageChangeFnName: 'renderProductPage'
    });
  }
}

const debounceProductFilters = debounce(applyProductFilters, 150);
const debounceProductPriceFilters = debounce(applyProductPriceFilters, 300);

function parseThousandPrice(value) {
  const text=String(value ?? '').trim();
  if (!text) return '';
  let amount;
  if (/^(?:\d+|\d{1,3}(?:\.\d{3})+)\s*[đ₫]$/i.test(text)) {
    amount=Number(text.replace(/[.\sđ₫]/gi,''));
  } else if (/^\d+(?:,\d{1,3})?$/.test(text)) {
    amount=Math.round(Number(text.replace(',','.'))*1000);
  } else {
    throw new Error('Nhập giá theo nghìn, ví dụ 150 = 150.000đ.');
  }
  if (!Number.isSafeInteger(amount) || amount<0) throw new Error('Giá nhập vượt phạm vi cho phép.');
  return String(amount);
}
function displayProductPrice(value) {
  return value === '' || value === null || value === undefined ? '' : Number(value).toLocaleString('vi-VN')+'đ';
}
function editProductPriceInput(input) {
  try {
    const amount=parseThousandPrice(input.value);
    input.value=amount === '' ? '' : String(Number(amount)/1000).replace('.',',');
    input.setCustomValidity('');
  } catch (_) { /* Preserve invalid text so it can be corrected. */ }
}
function formatProductPriceInput(input) {
  try {
    input.value=displayProductPrice(parseThousandPrice(input.value));
    input.setCustomValidity('');
  } catch(error) { input.setCustomValidity(error.message); }
}
function applyProductPriceFilters() {
  const min=document.getElementById('prod-minprice');
  const max=document.getElementById('prod-maxprice');
  if (!min || !max) return;
  try {
    const min_price=parseThousandPrice(min.value), max_price=parseThousandPrice(max.value);
    if (min_price !== '' && max_price !== '' && Number(min_price)>Number(max_price)) throw new Error('Giá từ phải nhỏ hơn hoặc bằng giá đến.');
    if (document.activeElement!==min) min.value=displayProductPrice(min_price);
    if (document.activeElement!==max) max.value=displayProductPrice(max_price);
    min.setCustomValidity(''); max.setCustomValidity('');
    productFilters={...productFilters,min_price,max_price};
    applyProductFilters();
  } catch(error) { toast(error.message,'error'); }
}

async function fetchAndRenderProducts(filters = {}) {
  const requestedPage=state.currentPage;
  productFilters = filters;
  try {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
    const products = await api('GET', `/api/admin/products?${params}`);
    const suppliers = await api('GET', '/api/admin/suppliers');
    const categories = await api('GET', '/api/admin/categories');
    currentProductsList = products || [];

    const supplierOptions = suppliers.map(s => {
      const isInactive = s.status === 'INACTIVE';
      return `<option value="${s.id}" ${filters.supplier_id == s.id ? 'selected' : ''}>${escapeHtml(s.name)}${isInactive ? ' (Ngừng hợp tác ✕)' : ''}</option>`;
    }).join('');

    const html = `
      <div class="filter-bar">
        <input type="text" id="prod-search" placeholder="🔍 Tên sản phẩm..." value="${escapeHtml(filters.search || '')}" oninput="debounceProductFilters()">
        <select id="prod-cat" onchange="applyProductFilters()">
          <option value="">Tất cả danh mục</option>
          ${categoryOptions(categories, filters.category)}
        </select>
        <select id="prod-supplier" onchange="applyProductFilters()">
          <option value="">Tất cả NCC</option>${supplierOptions}
        </select>
        <select id="prod-launch" onchange="applyProductFilters()">
          <option value="">Tất cả trạng thái</option>
          <option value="OFFICIAL" ${filters.launch_status === 'OFFICIAL' ? 'selected' : ''}>✓ Đang bán (Mở đánh giá)</option>
          <option value="UPCOMING" ${filters.launch_status === 'UPCOMING' ? 'selected' : ''}>🚫 Ngừng bán (Đóng đánh giá)</option>
        </select>
        <div class="product-price-filter" role="group" aria-label="Khoảng giá">
          <div class="product-price-controls">
            <input type="text" inputmode="decimal" id="prod-minprice" aria-label="Giá từ" aria-describedby="prod-price-help" placeholder="Giá từ" value="${displayProductPrice(filters.min_price)}" onfocus="editProductPriceInput(this)" onblur="formatProductPriceInput(this)" oninput="this.setCustomValidity('');debounceProductPriceFilters()">
            <span>–</span>
            <input type="text" inputmode="decimal" id="prod-maxprice" aria-label="Giá đến" aria-describedby="prod-price-help" placeholder="Giá đến" value="${displayProductPrice(filters.max_price)}" onfocus="editProductPriceInput(this)" onblur="formatProductPriceInput(this)" oninput="this.setCustomValidity('');debounceProductPriceFilters()">
          </div>
          <small id="prod-price-help">Nhập theo nghìn: 150 = 150.000đ.</small>
        </div>
        <select id="prod-sort" onchange="applyProductFilters()">
          <option value="created_at" ${filters.sort_by === 'created_at' ? 'selected' : ''}>Mới nhất</option>
          <option value="price" ${filters.sort_by === 'price' ? 'selected' : ''}>Theo giá</option>
          <option value="name" ${filters.sort_by === 'name' ? 'selected' : ''}>Theo tên A-Z</option>
          <option value="review_count" ${filters.sort_by === 'review_count' ? 'selected' : ''}>Theo đánh giá</option>
        </select>
        <select id="prod-sortdir" onchange="applyProductFilters()">
          <option value="desc" ${filters.sort_dir === 'desc' ? 'selected' : ''}>▼ Giảm dần</option>
          <option value="asc" ${filters.sort_dir === 'asc' ? 'selected' : ''}>▲ Tăng dần</option>
        </select>
        <button class="btn btn-secondary" onclick="resetProductFilters()">↺ Reset</button>
      </div>

      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>ID</th><th>Sản phẩm</th><th>Danh mục</th><th>Nhà cung cấp</th>
            <th>Giá</th><th>Trạng thái bán</th><th>Ngày tạo</th><th>Hành động</th>
          </tr></thead>
          <tbody id="products-tbody"></tbody>
        </table>
      </div>
      <div id="products-pagination"></div>
    `;
    if (requestedPage!==state.currentPage) return;
    setPageContent(html);
    renderProductPage(1);
  } catch (e) { toast(e.message, 'error'); }
}

let applyProductFiltersSequence=0;
async function applyProductFilters() {
  const sequence=++applyProductFiltersSequence;
  const filters = {
    search: document.getElementById('prod-search')?.value.trim() || '',
    category: document.getElementById('prod-cat')?.value || '',
    supplier_id: document.getElementById('prod-supplier')?.value || '',
    launch_status: document.getElementById('prod-launch')?.value || '',
    min_price: productFilters.min_price ?? '',
    max_price: productFilters.max_price ?? '',
    sort_by: document.getElementById('prod-sort')?.value || 'created_at',
    sort_dir: document.getElementById('prod-sortdir')?.value || 'desc',
  };
  productFilters = filters;

  const tbody = document.getElementById('products-tbody');
  if (tbody) {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
      const products = await api('GET', `/api/admin/products?${params}`);
    if(sequence!==applyProductFiltersSequence)return;
      currentProductsList = products || [];
      renderProductPage(1);
    } catch (e) { toast(e.message, 'error'); }
    return;
  }
  fetchAndRenderProducts(filters);
}

function resetProductFilters() {
  listToolsState['products']={};
  resetVisibleListTools('products');
  const s = document.getElementById('prod-search'); if (s) s.value = '';
  const c = document.getElementById('prod-cat'); if (c) c.value = '';
  const sup = document.getElementById('prod-supplier'); if (sup) sup.value = '';
  const l = document.getElementById('prod-launch'); if (l) l.value = '';
  const min = document.getElementById('prod-minprice'); if (min) min.value = '';
  const max = document.getElementById('prod-maxprice'); if (max) max.value = '';
  [min,max].forEach(input=>input?.setCustomValidity(''));
  productFilters={...productFilters,min_price:'',max_price:''};
  const sort = document.getElementById('prod-sort'); if (sort) sort.value = 'created_at';
  const sdir = document.getElementById('prod-sortdir'); if (sdir) sdir.value = 'desc';
  applyProductFilters();
}

async function openCreateProductModal() {
  const [suppliers, categories] = await Promise.all([
    api('GET', '/api/admin/suppliers').catch(() => []),
    api('GET', '/api/admin/categories').catch(() => [])
  ]);
  const catOptions = categoryOptions(categories, '', true);
  const supOptions = suppliers.map(s => {
    const isInactive = s.status === 'INACTIVE';
    return `<option value="${s.id}" ${isInactive ? 'disabled style="color:var(--text-muted);background:rgba(15,23,42,0.8)"' : ''}>
      ${escapeHtml(s.name)}${isInactive ? ' (Ngừng hợp tác ✕)' : ''}
    </option>`;
  }).join('');

  showModal('➕ Thêm sản phẩm mới', `
    <div class="form-group"><label>Tên sản phẩm *</label><input id="mp-name" placeholder="Tên sản phẩm đầy đủ"></div>
    <div class="form-row">
      <div class="form-group"><label>Danh mục *</label><select id="mp-cat"><option value="">-- Chọn --</option>${catOptions}</select></div>
      <div class="form-group"><label>Nhà cung cấp</label><select id="mp-supplier"><option value="">-- Chọn NCC --</option>${supOptions}</select></div>
    </div>
    <div class="form-group"><label>Giá bán (₫)</label><input id="mp-price" type="number" placeholder="0" min="0"></div>
    <div class="form-group"><label>Trạng thái bán</label>
      <select id="mp-launch">
        <option value="OFFICIAL">✓ Đang bán (Mở đánh giá)</option>
        <option value="UPCOMING">🚫 Ngừng bán (Đóng đánh giá)</option>
      </select>
    </div>
    <div class="form-group"><label>Mô tả sản phẩm</label><textarea id="mp-desc" placeholder="Mô tả chi tiết sản phẩm..."></textarea></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="createProduct()">✅ Thêm sản phẩm</button>
    </div>
  `);
}

async function createProduct() {
  const nameVal = document.getElementById('mp-name').value.trim();
  const catVal = document.getElementById('mp-cat').value;
  if (!nameVal || !catVal) {
    toast('Vui lòng nhập tên sản phẩm và chọn danh mục', 'warning');
    return;
  }

  try {
    await api('POST', '/api/admin/products', {
      name: nameVal,
      category: catVal,
      supplier_id: document.getElementById('mp-supplier').value || null,
      price: Number(document.getElementById('mp-price').value) || 0,
      launch_status: document.getElementById('mp-launch').value,
      description: document.getElementById('mp-desc').value.trim(),
    });
    toast('Thêm sản phẩm thành công!', 'success');
    closeModal();
    fetchAndRenderProducts(productFilters);
  } catch (e) { toast(e.message, 'error'); }
}

async function openEditProductModal(p) {
  currentEditingProduct = p;
  const [suppliers, categories] = await Promise.all([
    api('GET', '/api/admin/suppliers').catch(() => []),
    api('GET', '/api/admin/categories').catch(() => [])
  ]);
  const catOptions = categoryOptions(categories, p.category, true);
  const supOptions = suppliers.map(s => {
    const isInactive = s.status === 'INACTIVE';
    const isCurrent = Number(p.supplier_id) === Number(s.id);
    const disabledAttr = (isInactive && !isCurrent) ? 'disabled style="color:var(--text-muted);background:rgba(15,23,42,0.8)"' : '';
    return `<option value="${s.id}" ${isCurrent ? 'selected' : ''} ${disabledAttr}>
      ${escapeHtml(s.name)}${isInactive ? ' (Ngừng hợp tác ✕)' : ''}
    </option>`;
  }).join('');
  const hasReviews = Number(p.review_count) > 0;

  showModal(`✏️ Chỉnh sửa: ${escapeHtml(p.name)}`, `
    ${hasReviews ? `
      <div style="background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.3);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:16px;display:flex;align-items:flex-start;gap:10px;font-size:12px;color:#93c5fd;line-height:1.5">
        <span style="font-size:18px;line-height:1">ℹ️</span>
        <div>
          <strong>Sản phẩm này đã có ${p.review_count} đánh giá từ khách hàng.</strong><br>
          <span>Danh mục và Nhà cung cấp được cố định để bảo toàn lịch sử thống kê CRM.</span>
        </div>
      </div>
    ` : ''}
    <div class="form-group"><label>Tên sản phẩm *</label><input id="ep-name" value="${escapeHtml(p.name)}"></div>
    <div class="form-row">
      <div class="form-group">
        <label>Danh mục ${hasReviews ? '<span style="color:var(--text-muted);font-weight:400">(Cố định 🔒)</span>' : '*'}</label>
        <select id="ep-cat" ${hasReviews ? 'disabled style="opacity:0.65;cursor:not-allowed;background:rgba(15,23,42,0.6)" title="Danh mục được cố định do đã có đánh giá CRM"' : ''}>
          ${catOptions}
        </select>
      </div>
      <div class="form-group">
        <label>Nhà cung cấp ${hasReviews ? '<span style="color:var(--text-muted);font-weight:400">(Cố định 🔒)</span>' : ''}</label>
        <select id="ep-supplier" ${hasReviews ? 'disabled style="opacity:0.65;cursor:not-allowed;background:rgba(15,23,42,0.6)" title="Nhà cung cấp được cố định do đã có đánh giá CRM"' : ''}>
          <option value="">-- Chọn --</option>${supOptions}
        </select>
      </div>
    </div>
    <div class="form-group"><label>Giá bán (₫)</label><input id="ep-price" type="number" value="${p.price}" min="0"></div>
    <div class="form-group"><label>Trạng thái bán</label>
      <select id="ep-launch">
        <option value="OFFICIAL" ${p.launch_status === 'OFFICIAL' ? 'selected' : ''}>✓ Đang bán (Mở đánh giá)</option>
        <option value="UPCOMING" ${p.launch_status === 'UPCOMING' ? 'selected' : ''}>🚫 Ngừng bán (Đóng đánh giá)</option>
      </select>
    </div>
    <div class="form-group"><label>Mô tả</label><textarea id="ep-desc">${escapeHtml(p.description || '')}</textarea></div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="updateProduct(${p.id})">💾 Lưu thay đổi</button>
    </div>
  `);
}

async function updateProduct(id) {
  const p = currentEditingProduct || {};
  const hasReviews = Number(p.review_count) > 0;
  const nameVal = document.getElementById('ep-name').value.trim();
  if (!nameVal) {
    toast('Tên sản phẩm không được để trống', 'warning');
    return;
  }
  const catEl = document.getElementById('ep-cat');
  const supEl = document.getElementById('ep-supplier');

  try {
    await api('PUT', `/api/admin/products/${id}`, {
      _version:currentEditingProduct?.record_version,
      name: nameVal,
      category: hasReviews ? p.category : (catEl ? catEl.value : p.category),
      supplier_id: hasReviews ? (p.supplier_id || null) : (supEl && supEl.value ? Number(supEl.value) : null),
      price: Number(document.getElementById('ep-price').value) || 0,
      launch_status: document.getElementById('ep-launch').value,
      description: document.getElementById('ep-desc').value.trim(),
    });
    toast('Cập nhật sản phẩm thành công!', 'success');
    closeModal();
    fetchAndRenderProducts(productFilters);
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteProduct(id, name, reviewCount) {
  const count = Number(reviewCount) || 0;
  if (count > 0) {
    const ok = confirm(
      `Sản phẩm "${name}" đã có ${count} lượt đánh giá hoặc liên kết khảo sát.\n\n` +
      `Để bảo toàn dữ liệu thống kê CRM, sản phẩm sẽ KHÔNG bị xóa vĩnh viễn khỏi Database mà tự động chuyển sang trạng thái "Ngừng bán (Đóng đánh giá)".\n\n` +
      `Bạn có đồng ý tiếp tục?`
    );
    if (!ok) return;
  } else {
    if (!confirm(`Sản phẩm "${name}" chưa có đánh giá hoặc liên kết khảo sát nào.\n\nBạn có chắc chắn muốn xóa vĩnh viễn sản phẩm này khỏi cơ sở dữ liệu?`)) return;
  }

  try {
    const res = await api('DELETE', `/api/admin/products/${id}`);
    toast(res.message || 'Đã xử lý sản phẩm', 'success');
    fetchAndRenderProducts(productFilters);
  } catch (e) { toast(e.message, 'error'); }
}

// ========== ADMIN: SUPPLIERS ==========
let currentSuppliersList = [];
let currentEditingSupplier = null;

async function renderAdminSuppliers() {
  const requestedPage=state.currentPage;
  setPageHeader('🏪 Quản lý Nhà cung cấp', 'Quản lý đối tác nhãn hàng & theo dõi chất lượng sản phẩm qua đánh giá khách hàng',
    `<button class="btn btn-primary" onclick="openCreateSupplierModal()">➕ Thêm nhà cung cấp</button>`);
  showLoading();
  try {
    const suppliers = await api('GET', '/api/admin/suppliers');
    if (requestedPage!==state.currentPage) return;
    renderSuppliersTable(suppliers);
  } catch (e) { toast(e.message, 'error'); }
}

function openEditSupplierModalById(id) {
  const s = currentSuppliersList.find(x => Number(x.id) === Number(id));
  if (s) openEditSupplierModal(s);
}

const debounceFilterSuppliers = debounce(filterSuppliers, 150);

function renderSupplierRowsHtml(suppliers) {
  return suppliers.map(s=>`<tr ${detailRow('openSupplierDetail',s.id)}><td>#${s.id}</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.email || s.phone || '—')}</td><td>${statusBadge(s.status)}</td><td>${formatDate(s.created_at)}</td><td class="row-actions" onclick="event.stopPropagation()"><button class="btn btn-secondary btn-sm" onclick="openEditSupplierModalById(${s.id})">Sửa</button><button class="btn btn-trash btn-sm" onclick="deleteSupplier(${s.id},${escapeHtml(JSON.stringify(s.name))},${Number(s.product_count)||0})">${Number(s.product_count)>0?'Ngừng hợp tác':'Xóa'}</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty-cell">Không tìm thấy nhà cung cấp</td></tr>';
}

const ADMIN_SUPPLIER_PAGE_SIZE = 10;
let adminSupplierPage = 1;

function renderSupplierPage(page) {
  adminSupplierPage = page;
  const tbody = document.getElementById('suppliers-tbody');
  const paginationEl = document.getElementById('suppliers-pagination');
  if (!tbody) return;

  const refined=refineList(currentSuppliersList,'suppliers');
  const total = refined.length;
  const maxPage = Math.max(1, Math.ceil(total / ADMIN_SUPPLIER_PAGE_SIZE));
  if (adminSupplierPage > maxPage) adminSupplierPage = maxPage;
  const start = (adminSupplierPage - 1) * ADMIN_SUPPLIER_PAGE_SIZE;
  const pagedList = refined.slice(start, start + ADMIN_SUPPLIER_PAGE_SIZE);

  tbody.innerHTML = renderSupplierRowsHtml(pagedList);

  if (paginationEl) {
    paginationEl.innerHTML = renderPaginationBar({
      totalItems: total,
      pageSize: ADMIN_SUPPLIER_PAGE_SIZE,
      currentPage: adminSupplierPage,
      onPageChangeFnName: 'renderSupplierPage'
    });
  }
}

function renderSuppliersTable(suppliers) {
  currentSuppliersList = suppliers || [];

  const tbody = document.getElementById('suppliers-tbody');
  if (tbody) {
    renderSupplierPage(1);
    return;
  }

  const html = `
    <div class="filter-bar">
      <input type="text" id="sup-search" placeholder="🔍 Tên, người liên hệ, email, SĐT..." oninput="debounceFilterSuppliers()">
      <select id="sup-status" onchange="filterSuppliers()">
        <option value="">Tất cả trạng thái</option>
        <option value="ACTIVE">✓ Đang hợp tác</option>
        <option value="INACTIVE">✕ Ngừng hợp tác</option>
      </select>
      <button class="btn btn-secondary" onclick="resetSupplierFilters()">↺ Reset</button>
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr><th>ID</th><th>Nhà cung cấp</th><th>Liên hệ</th><th>Trạng thái</th><th>Ngày tạo</th><th>Thao tác</th></tr></thead>
        <tbody id="suppliers-tbody"></tbody>
      </table>
    </div>
    <div id="suppliers-pagination"></div>
  `;
  setPageContent(html);
  renderSupplierPage(1);
}

function resetSupplierFilters() {
  listToolsState['suppliers']={};
  resetVisibleListTools('suppliers');
  const s = document.getElementById('sup-search'); if (s) s.value = '';
  const st = document.getElementById('sup-status'); if (st) st.value = '';
  filterSuppliers();
}

let filterSuppliersSequence=0;
async function filterSuppliers() {
  const sequence=++filterSuppliersSequence;
  const search = document.getElementById('sup-search')?.value.trim() || '';
  const status = document.getElementById('sup-status')?.value || '';
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (status) params.append('status', status);
  try {
    const suppliers = await api('GET', `/api/admin/suppliers?${params}`);
    if(sequence!==filterSuppliersSequence)return;
    currentSuppliersList = suppliers || [];
    renderSupplierPage(1);
  } catch (e) { toast(e.message, 'error'); }
}

function openCreateSupplierModal() {
  showModal('➕ Thêm nhà cung cấp mới', `
    <div class="form-group"><label>Tên nhà cung cấp *</label><input id="ms-name" placeholder="Tên công ty / thương hiệu đối tác"></div>
    <div class="form-row">
      <div class="form-group"><label>Người liên hệ</label><input id="ms-contact" placeholder="Họ và tên đại diện"></div>
      <div class="form-group"><label>Điện thoại</label><input id="ms-phone" placeholder="028xxxxxxx"></div>
    </div>
    <div class="form-group"><label>Email</label><input id="ms-email" type="email" placeholder="contact@supplier.com"></div>
    <div class="form-group"><label>Trạng thái</label>
      <select id="ms-status">
        <option value="ACTIVE">✓ Đang hợp tác</option>
        <option value="INACTIVE">✕ Ngừng hợp tác</option>
      </select>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="createSupplier()">✅ Thêm nhà cung cấp</button>
    </div>
  `);
}

async function createSupplier() {
  const nameVal = document.getElementById('ms-name').value.trim();
  if (!nameVal) {
    toast('Tên nhà cung cấp là bắt buộc', 'warning');
    return;
  }

  try {
    await api('POST', '/api/admin/suppliers', {
      name: nameVal,
      contact_name: document.getElementById('ms-contact').value.trim(),
      phone: document.getElementById('ms-phone').value.trim(),
      email: document.getElementById('ms-email').value.trim(),
      status: document.getElementById('ms-status').value,
    });
    toast('Thêm nhà cung cấp thành công!', 'success');
    closeModal();
    renderAdminSuppliers();
  } catch (e) { toast(e.message, 'error'); }
}

function openEditSupplierModal(s) {
  editingSupplierVersion=s.record_version;
  currentEditingSupplier = s;
  const prodCount = Number(s.product_count) || 0;
  const hasProducts = prodCount > 0;

  showModal(`✏️ Chỉnh sửa: ${escapeHtml(s.name)}`, `
    ${hasProducts ? `
      <div style="background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.3);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:16px;display:flex;align-items:flex-start;gap:10px;font-size:12px;color:#93c5fd;line-height:1.5">
        <span style="font-size:18px;line-height:1">ℹ️</span>
        <div>
          <strong>Nhà cung cấp này đang có ${prodCount} sản phẩm liên kết.</strong><br>
          <span>Bạn vẫn có thể đổi tên hoặc thông tin liên hệ; mã nhà cung cấp và các liên kết lịch sử không thay đổi.</span>
        </div>
      </div>
    ` : ''}
    <div class="form-group">
      <label>Tên nhà cung cấp *</label>
      <input id="es-name" value="${escapeHtml(s.name)}">
    </div>
    <div class="form-row">
      <div class="form-group"><label>Người liên hệ</label><input id="es-contact" value="${escapeHtml(s.contact_name || '')}"></div>
      <div class="form-group"><label>Điện thoại</label><input id="es-phone" value="${escapeHtml(s.phone || '')}"></div>
    </div>
    <div class="form-group"><label>Email</label><input id="es-email" type="email" value="${escapeHtml(s.email || '')}"></div>
    <div class="form-group"><label>Trạng thái</label>
      <select id="es-status">
        <option value="ACTIVE" ${s.status === 'ACTIVE' ? 'selected' : ''}>✓ Đang hợp tác</option>
        <option value="INACTIVE" ${s.status === 'INACTIVE' ? 'selected' : ''}>✕ Ngừng hợp tác</option>
      </select>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="updateSupplier(${s.id})">💾 Lưu thay đổi</button>
    </div>
  `);
}

async function updateSupplier(id) {
  const nameInput = document.getElementById('es-name');
  const nameVal = nameInput ? nameInput.value.trim() : '';

  if (!nameVal) {
    toast('Tên nhà cung cấp là bắt buộc', 'warning');
    return;
  }

  try {
    const res = await api('PUT', `/api/admin/suppliers/${id}`, {
      _version:editingSupplierVersion,
      name: nameVal,
      contact_name: document.getElementById('es-contact').value.trim(),
      phone: document.getElementById('es-phone').value.trim(),
      email: document.getElementById('es-email').value.trim(),
      status: document.getElementById('es-status').value,
    });
    toast(res.message || 'Cập nhật thành công!', 'success');
    closeModal();
    renderAdminSuppliers();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteSupplier(id, name, productCount) {
  const count = Number(productCount) || 0;
  if (count > 0) {
    const ok = confirm(
      `Nhà cung cấp "${name}" đang có ${count} sản phẩm liên kết.\n\n` +
      `Để bảo toàn lịch sử sản phẩm và đánh giá CRM, nhà cung cấp sẽ KHÔNG bị xóa vĩnh viễn khỏi Database mà tự động chuyển sang trạng thái "Ngừng hợp tác" và toàn bộ sản phẩm liên quan sẽ chuyển sang "Ngừng bán (Đóng đánh giá)".\n\n` +
      `Bạn có đồng ý tiếp tục?`
    );
    if (!ok) return;
  } else {
    if (!confirm(`Xác nhận xóa vĩnh viễn nhà cung cấp "${name}" khỏi cơ sở dữ liệu?`)) return;
  }

  try {
    const res = await api('DELETE', `/api/admin/suppliers/${id}`);
    toast(res.message || 'Đã xử lý nhà cung cấp', 'success');
    renderAdminSuppliers();
  } catch (e) { toast(e.message, 'error'); }
}

// ========== ADMIN: DATABASE BACKUP/RESTORE CONSOLE ==========
function renderAdminDatabase() {
  setPageHeader('🗄️ Quản lý Cơ sở dữ liệu', 'Phương án sao lưu & phục hồi CSDL hệ thống CRM');

  const html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
      <div class="stat-card purple">
        <div class="stat-icon">🛡️</div>
        <div class="stat-value">ONLINE</div>
        <div class="stat-label">Trạng thái CSDL</div>
      </div>
      <div class="stat-card gold">
        <div class="stat-icon">📦</div>
        <div class="stat-value">SQL Server</div>
        <div class="stat-label">Engine đang sử dụng</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
      <!-- Full Backup Panel -->
      <div class="card">
        <div class="card-title">🗃️ Full Backup</div>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Tạo bản sao lưu toàn bộ cơ sở dữ liệu. Nên thực hiện định kỳ hàng tuần.</p>
        <div class="form-group" style="margin-bottom:14px">
          <label>Tên file backup</label>
          <input id="backup-filename" value="CosmeticsCRM_FULL_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}" placeholder="Tên file">
        </div>
        <button class="btn btn-primary btn-full" onclick="runFullBackup()">🔒 Thực hiện Full Backup</button>
      </div>

      <!-- Differential Backup Panel -->
      <div class="card">
        <div class="card-title">📝 Differential Backup</div>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Sao lưu các thay đổi phát sinh từ lần Full Backup gần nhất. Thực hiện hàng ngày.</p>
        <div class="form-group" style="margin-bottom:14px">
          <label>Tên file differential</label>
          <input id="diff-filename" value="CosmeticsCRM_DIFF_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}" placeholder="Tên file">
        </div>
        <button class="btn btn-purple btn-full" onclick="runDiffBackup()">📊 Thực hiện Differential Backup</button>
      </div>
    </div>

    <!-- Restore Panel -->
    <div class="card" style="margin-bottom:24px">
      <div class="card-title">♻️ Phục hồi CSDL (Restore)</div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
        Sinh script phục hồi SQL Server: Full Backup (NORECOVERY) → Differential Backup (RECOVERY).
      </p>
      <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:10px;padding:14px;margin-bottom:16px">
        <p style="font-size:13px;color:#f87171;font-weight:600">⚠️ Kịch bản Test Giả lập Sự cố</p>
        <ol style="font-size:12px;color:var(--text-secondary);padding-left:20px;margin-top:8px;line-height:2">
          <li>Chạy Full Backup trước khi có sự cố</li>
          <li>Chạy Differential Backup sau khi có dữ liệu phát sinh</li>
          <li>Khi cần phục hồi, dùng script restore trong SSMS với quyền quản trị</li>
          <li>Restore Full Backup bằng NORECOVERY</li>
          <li>Restore Differential Backup bằng RECOVERY và kiểm tra dữ liệu</li>
        </ol>
      </div>
      <div class="form-row">
        <div class="form-group"><label>File Full Backup</label><input id="restore-full-file" value="CosmeticsCRM_FULL_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}"></div>
        <div class="form-group"><label>File Differential Backup</label><input id="restore-diff-file" value="CosmeticsCRM_DIFF_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}"></div>
      </div>
      <button class="btn btn-warning btn-full" onclick="generateRestoreScript()">🚨 Tạo Script Restore</button>
    </div>

    <!-- Existing Backups List -->
    <div class="card" style="margin-bottom:24px">
      <div class="card-title" style="display:flex;align-items:center;justify-content:space-between">
        <span>📁 File Sao lưu hiện có</span>
        <button class="btn btn-secondary btn-sm" onclick="loadBackupFiles()" style="font-size:11px">🔄 Làm mới</button>
      </div>
      <div id="backup-files-list">
        <div class="loading-spinner"><div class="spinner"></div></div>
      </div>
    </div>

    <!-- Console Output -->
    <div class="card">
      <div class="card-title" style="display:flex;align-items:center;justify-content:space-between">
        <span>💻 Console Output</span>
        <button class="btn btn-trash btn-sm" onclick="clearConsole()"><svg class="trash-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="margin-right:4px"><path d="M6 2v2H2v2h1v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6h1V4h-4V2h-2v2H9V2H6zm7 5v9h-2V7h2zM9 2V4h6V2H9z"/></svg> Xóa console</button>
      </div>
      <div class="db-console">
        <div class="db-console-output" id="db-console-output">
          <div class="db-console-line-info">-- BeautyCRM Database Management Console</div>
          <div class="db-console-line-info">-- Database: CosmeticsCRM_DB | Engine: Microsoft SQL Server Local</div>
          <div class="db-console-line-info">-- Sẵn sàng nhận lệnh...</div>
          <div>&nbsp;</div>
        </div>
      </div>
    </div>

    <!-- SQL Server Script Info -->
    <div class="card" style="margin-top:20px">
      <div class="card-title">📄 Script SQL Server cho Báo cáo</div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
        Các file SQL chuẩn Microsoft SQL Server đã được tạo sẵn để sử dụng trong báo cáo:
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:10px;padding:14px">
          <p style="font-size:13px;font-weight:700;color:#60a5fa;margin-bottom:6px">📋 schema_sqlserver.sql</p>
          <p style="font-size:12px;color:var(--text-muted)">Tạo CSDL, các bảng CRM, ràng buộc, index và dữ liệu mẫu hoàn chỉnh</p>
        </div>
        <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:10px;padding:14px">
          <p style="font-size:13px;font-weight:700;color:#34d399;margin-bottom:6px">🔒 backup_restore.sql</p>
          <p style="font-size:12px;color:var(--text-muted)">Full Backup, Differential Backup & kịch bản test phục hồi bảng Feedbacks</p>
        </div>
      </div>
    </div>
  `;
  setPageContent(html);
  loadBackupFiles();
}

// ========== ADMIN: BACKUP FILES LIST ==========
async function loadBackupFiles() {
  const el = document.getElementById('backup-files-list');
  if (!el) return;
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const data = await api('GET', '/api/admin/database/backups');
    if (!data.backups || data.backups.length === 0) {
      el.innerHTML = `<p style="font-size:12px;color:var(--text-muted)">Chưa có file backup nào trong thư mục <code style="color:var(--rose-300)">${data.backup_dir}</code>. Hãy thực hiện Full Backup trước.</p>`;
      return;
    }
    el.innerHTML = `
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Thư mục: <code>${data.backup_dir}</code></p>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="text-align:left">
          <th style="font-size:11px;color:var(--text-muted);padding:4px 0">Tên file</th>
          <th style="font-size:11px;color:var(--text-muted);padding:4px 0">Dung lượng</th>
          <th style="font-size:11px;color:var(--text-muted);padding:4px 0">Ngày tạo</th>
        </tr></thead>
        <tbody>
          ${data.backups.map(b => `
            <tr>
              <td style="font-size:12px;padding:4px 0"><code style="color:var(--rose-300)">${b.name}</code></td>
              <td style="font-size:12px;color:var(--text-secondary)">${(b.size / 1024).toFixed(1)} KB</td>
              <td style="font-size:12px;color:var(--text-muted)">${formatDateTime(b.created_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    el.innerHTML = `<p class="error-msg" style="margin:0">${e.message}</p>`;
  }
}

// ========== ADMIN: DATABASE BACKUP/RESTORE CONSOLE ==========
function dbLog(msg, type = 'success') {
  const out = document.getElementById('db-console-output');
  if (!out) return;
  const div = document.createElement('div');
  div.className = `db-console-line-${type}`;
  div.textContent = `[${new Date().toLocaleTimeString('vi-VN')}] ${msg}`;
  out.appendChild(div);
  out.scrollTop = out.scrollHeight;
}

function clearConsole() {
  const out = document.getElementById('db-console-output');
  if (out) out.innerHTML = '<div class="db-console-line-info">-- Console đã được xóa.</div>';
}

async function runFullBackup() {
  const filename = document.getElementById('backup-filename').value || 'CosmeticsCRM_FULL';
  dbLog('=== BẮT ĐẦU FULL BACKUP ===', 'info');
  try {
    const result = await api('POST', '/api/admin/database/backup', { type: 'FULL', filename });
    dbLog(result.script, 'info');
    dbLog(`FULL BACKUP THÀNH CÔNG: ${result.path}`, 'success');
    toast('Full Backup hoàn thành!', 'success');
  } catch (e) {
    dbLog(`LỖI FULL BACKUP: ${e.message}`, 'error');
    toast(e.message, 'error');
  }
}

async function runDiffBackup() {
  const filename = document.getElementById('diff-filename').value || 'CosmeticsCRM_DIFF';
  dbLog('=== BẮT ĐẦU DIFFERENTIAL BACKUP ===', 'info');
  try {
    const result = await api('POST', '/api/admin/database/backup', { type: 'DIFFERENTIAL', filename });
    dbLog(result.script, 'info');
    dbLog(`DIFFERENTIAL BACKUP THÀNH CÔNG: ${result.path}`, 'success');
    toast('Differential Backup hoàn thành!', 'success');
  } catch (e) {
    dbLog(`LỖI DIFFERENTIAL BACKUP: ${e.message}`, 'error');
    toast(e.message, 'error');
  }
}

async function generateRestoreScript() {
  try {
    const result = await api('POST', '/api/admin/database/restore-script', {
      full_file: document.getElementById('restore-full-file').value,
      diff_file: document.getElementById('restore-diff-file').value,
    });
    dbLog('=== SCRIPT RESTORE SQL SERVER ===', 'info');
    result.script.split('\n').forEach(line => dbLog(line, 'warning'));
    toast('Đã tạo script Restore trong console', 'success');
  } catch (e) {
    dbLog(`LỖI TẠO SCRIPT RESTORE: ${e.message}`, 'error');
    toast(e.message, 'error');
  }
}
