/* ============================================================
   admin.js – Admin Module: Accounts, Products, Suppliers, DB Console
   ============================================================ */

// ========== ADMIN: ACCOUNTS ==========
let currentAccountsList = [];
let allAccountsList = [];

async function renderAdminAccounts() {
  setPageHeader('👥 Quản lý Tài khoản Nội bộ', 'Phân quyền và quản lý tài khoản quản trị nội bộ (Admin, Manager)',
    `<button class="btn btn-primary" onclick="openCreateAccountModal()">➕ Thêm tài khoản</button>`);
  showLoading();
  try {
    const accounts = await api('GET', '/api/admin/accounts');
    allAccountsList = accounts;
    renderAccountsTable(accounts);
  } catch (e) { toast(e.message, 'error'); }
}

function openEditAccountModalById(id) {
  const a = currentAccountsList.find(x => Number(x.id) === Number(id));
  if (a) openEditAccountModal(a);
}

const debounceFilterAccounts = debounce(filterAccounts, 150);

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
      deleteBtnHtml = `<button class="btn btn-trash btn-sm" title="Xóa tài khoản hiện tại (Bạn sẽ bị đăng xuất)" onclick="deleteAccount(${a.id},'${a.full_name.replace(/'/g, "\\'")}')"><svg class="trash-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2v2H2v2h1v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6h1V4h-4V2h-2v2H9V2H6zm7 5v9h-2V7h2zM9 2V4h6V2H9z"/></svg></button>`;
    } else {
      deleteBtnHtml = `<button class="btn btn-trash btn-sm" onclick="deleteAccount(${a.id},'${a.full_name.replace(/'/g, "\\'")}')"><svg class="trash-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2v2H2v2h1v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6h1V4h-4V2h-2v2H9V2H6zm7 5v9h-2V7h2zM9 2V4h6V2H9z"/></svg></button>`;
    }

    return `
      <tr class="row-clickable" title="💡 Nhấp đúp (Double-click) để xem và sửa thông tin" ondblclick="openEditAccountModalById(${a.id})">
        <td><span style="color:var(--text-muted)">#${a.id}</span></td>
        <td><strong>${a.full_name}</strong>${isCurrentUser ? ' <span style="font-size:10px;color:var(--text-muted)">(bạn)</span>' : ''}</td>
        <td style="color:var(--text-secondary)">${a.email || '—'}</td>
        <td style="color:var(--text-secondary)">${a.phone || '—'}</td>
        <td>${roleBadge(a.role)}</td>
        <td>${statusBadge(a.status)}</td>
        <td style="color:var(--text-muted);font-size:12px">${formatDate(a.created_at)}</td>
        <td onclick="event.stopPropagation()">
          <div style="display:flex;gap:6px">
            ${deleteBtnHtml}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderAccountsTable(accounts, searchParams = {}) {
  currentAccountsList = accounts;

  const tbody = document.getElementById('accounts-tbody');
  const countEl = document.getElementById('accounts-count');
  if (tbody && countEl) {
    tbody.innerHTML = renderAccountRowsHtml(accounts);
    countEl.textContent = `Tổng: ${accounts.length} tài khoản · 💡 Nhấp đúp (Double-click) vào một dòng để xem và sửa thông tin`;
    return;
  }

  const html = `
    <div class="filter-bar">
      <input type="text" id="acc-search" placeholder="🔍 Tìm tên, username, email..." value="${searchParams.search || ''}" oninput="debounceFilterAccounts()">
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
          <th>ID</th><th>Họ và tên</th><th>Email</th><th>Số ĐT</th>
          <th>Vai trò</th><th>Trạng thái</th><th>Ngày tạo</th><th>Hành động</th>
        </tr></thead>
        <tbody id="accounts-tbody">
          ${renderAccountRowsHtml(accounts)}
        </tbody>
      </table>
    </div>
    <p id="accounts-count" style="color:var(--text-muted);font-size:12px;margin-top:10px">Tổng: ${accounts.length} tài khoản · 💡 Nhấp đúp (Double-click) vào một dòng để xem và sửa thông tin</p>
  `;
  setPageContent(html);
}

function resetAdminAccountsFilters() {
  const s = document.getElementById('acc-search'); if (s) s.value = '';
  const r = document.getElementById('acc-role'); if (r) r.value = '';
  const st = document.getElementById('acc-status'); if (st) st.value = '';
  filterAccounts();
}

async function filterAccounts() {
  const search = document.getElementById('acc-search')?.value.trim() || '';
  const role = document.getElementById('acc-role')?.value || '';
  const status = document.getElementById('acc-status')?.value || '';
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (role) params.append('role', role);
  if (status) params.append('status', status);
  try {
    const accounts = await api('GET', `/api/admin/accounts?${params}`);
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
        <label>Mật khẩu * <span style="font-size:11px;font-weight:400;color:var(--text-muted)">(đang hiển thị)</span></label>
        <div style="display:flex;gap:6px">
          <input id="e-password" type="text" value="${escapeHtml(a.password || '')}" autocomplete="off" placeholder="Mật khẩu" style="flex:1">
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
    return `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:40px">Không tìm thấy sản phẩm nào</td></tr>`;
  }
  return products.map(p => `
    <tr>
      <td><span style="color:var(--text-muted)">#${p.id}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:22px">${getCategoryIcon(p.category)}</span>
          <div>
            <div style="font-weight:600;max-width:200px">${escapeHtml(p.name)}</div>
            <div style="font-size:11px;color:var(--text-muted)">${p.description ? escapeHtml(p.description.substring(0, 50)) + '...' : ''}</div>
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
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="openEditProductModalById(${p.id})" title="Chỉnh sửa sản phẩm">✏️</button>
          <button class="btn btn-trash btn-sm" onclick="deleteProduct(${p.id},'${p.name.replace(/'/g, "\\'")}',${Number(p.review_count) || 0})" title="${Number(p.review_count) > 0 ? 'Ngừng kinh doanh (bảo toàn đánh giá CRM)' : 'Xóa vĩnh viễn'}"><svg class="trash-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2v2H2v2h1v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6h1V4h-4V2h-2v2H9V2H6zm7 5v9h-2V7h2zM9 2V4h6V2H9z"/></svg></button>
        </div>
      </td>
    </tr>
  `).join('');
}

const debounceProductFilters = debounce(applyProductFilters, 150);

async function fetchAndRenderProducts(filters = {}) {
  productFilters = filters;
  try {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
    const products = await api('GET', `/api/admin/products?${params}`);
    const suppliers = await api('GET', '/api/admin/suppliers');
    currentProductsList = products;

    const supplierOptions = suppliers.map(s => {
      const isInactive = s.status === 'INACTIVE';
      return `<option value="${s.id}" ${filters.supplier_id == s.id ? 'selected' : ''}>${escapeHtml(s.name)}${isInactive ? ' (Ngừng hợp tác ✕)' : ''}</option>`;
    }).join('');

    const html = `
      <div class="filter-bar">
        <input type="text" id="prod-search" placeholder="🔍 Tên sản phẩm..." value="${filters.search || ''}" oninput="debounceProductFilters()">
        <select id="prod-cat" onchange="applyProductFilters()">
          <option value="">Tất cả danh mục</option>
          ${['Son môi', 'Kem dưỡng da', 'Serum', 'Kem chống nắng', 'Phấn phủ', 'Sữa rửa mặt', 'Toner', 'Mặt nạ']
        .map(c => `<option value="${c}" ${filters.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        <select id="prod-supplier" onchange="applyProductFilters()">
          <option value="">Tất cả NCC</option>${supplierOptions}
        </select>
        <select id="prod-launch" onchange="applyProductFilters()">
          <option value="">Tất cả trạng thái</option>
          <option value="OFFICIAL" ${filters.launch_status === 'OFFICIAL' ? 'selected' : ''}>✓ Đang kinh doanh (Mở đánh giá)</option>
          <option value="UPCOMING" ${filters.launch_status === 'UPCOMING' ? 'selected' : ''}>🚫 Ngừng kinh doanh (Đóng đánh giá)</option>
        </select>
        <input type="number" id="prod-minprice" placeholder="Giá từ (₫)" value="${filters.min_price || ''}" style="max-width:120px" oninput="debounceProductFilters()">
        <input type="number" id="prod-maxprice" placeholder="Đến (₫)" value="${filters.max_price || ''}" style="max-width:120px" oninput="debounceProductFilters()">
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
            <th>Giá</th><th>Trạng thái kinh doanh</th><th>Ngày tạo</th><th>Hành động</th>
          </tr></thead>
          <tbody id="products-tbody">
            ${renderProductRowsHtml(products)}
          </tbody>
        </table>
      </div>
      <p id="products-count" style="color:var(--text-muted);font-size:12px;margin-top:10px">Hiển thị ${products.length} sản phẩm</p>
    `;
    setPageContent(html);
  } catch (e) { toast(e.message, 'error'); }
}

async function applyProductFilters() {
  const filters = {
    search: document.getElementById('prod-search')?.value.trim() || '',
    category: document.getElementById('prod-cat')?.value || '',
    supplier_id: document.getElementById('prod-supplier')?.value || '',
    launch_status: document.getElementById('prod-launch')?.value || '',
    min_price: document.getElementById('prod-minprice')?.value || '',
    max_price: document.getElementById('prod-maxprice')?.value || '',
    sort_by: document.getElementById('prod-sort')?.value || 'created_at',
    sort_dir: document.getElementById('prod-sortdir')?.value || 'desc',
  };
  productFilters = filters;

  const tbody = document.getElementById('products-tbody');
  const countEl = document.getElementById('products-count');
  if (tbody && countEl) {
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
      const products = await api('GET', `/api/admin/products?${params}`);
      currentProductsList = products;
      tbody.innerHTML = renderProductRowsHtml(products);
      countEl.textContent = `Hiển thị ${products.length} sản phẩm`;
    } catch (e) { toast(e.message, 'error'); }
    return;
  }
  fetchAndRenderProducts(filters);
}

function resetProductFilters() {
  const s = document.getElementById('prod-search'); if (s) s.value = '';
  const c = document.getElementById('prod-cat'); if (c) c.value = '';
  const sup = document.getElementById('prod-supplier'); if (sup) sup.value = '';
  const l = document.getElementById('prod-launch'); if (l) l.value = '';
  const min = document.getElementById('prod-minprice'); if (min) min.value = '';
  const max = document.getElementById('prod-maxprice'); if (max) max.value = '';
  const sort = document.getElementById('prod-sort'); if (sort) sort.value = 'created_at';
  const sdir = document.getElementById('prod-sortdir'); if (sdir) sdir.value = 'desc';
  applyProductFilters();
}

async function openCreateProductModal() {
  const suppliers = await api('GET', '/api/admin/suppliers').catch(() => []);
  const catOptions = ['Son môi', 'Kem dưỡng da', 'Serum', 'Kem chống nắng', 'Phấn phủ', 'Sữa rửa mặt', 'Toner', 'Mặt nạ', 'Mascara', 'Phấn má hồng']
    .map(c => `<option value="${c}">${c}</option>`).join('');
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
    <div class="form-group"><label>Trạng thái kinh doanh</label>
      <select id="mp-launch">
        <option value="OFFICIAL">✓ Đang kinh doanh (Mở đánh giá)</option>
        <option value="UPCOMING">🚫 Ngừng kinh doanh (Đóng đánh giá)</option>
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
  const suppliers = await api('GET', '/api/admin/suppliers').catch(() => []);
  const catOptions = ['Son môi', 'Kem dưỡng da', 'Serum', 'Kem chống nắng', 'Phấn phủ', 'Sữa rửa mặt', 'Toner', 'Mặt nạ', 'Mascara', 'Phấn má hồng']
    .map(c => `<option value="${c}" ${p.category === c ? 'selected' : ''}>${c}</option>`).join('');
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
    <div class="form-group"><label>Trạng thái kinh doanh</label>
      <select id="ep-launch">
        <option value="OFFICIAL" ${p.launch_status === 'OFFICIAL' ? 'selected' : ''}>✓ Đang kinh doanh (Mở đánh giá)</option>
        <option value="UPCOMING" ${p.launch_status === 'UPCOMING' ? 'selected' : ''}>🚫 Ngừng kinh doanh (Đóng đánh giá)</option>
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
      `Sản phẩm "${name}" đã có ${count} lượt đánh giá từ khách hàng.\n\n` +
      `Để bảo toàn dữ liệu thống kê CRM, sản phẩm sẽ KHÔNG bị xóa vĩnh viễn khỏi Database mà tự động chuyển sang trạng thái "Ngừng kinh doanh (Đóng đánh giá)".\n\n` +
      `Bạn có đồng ý tiếp tục?`
    );
    if (!ok) return;
  } else {
    if (!confirm(`Sản phẩm "${name}" chưa có đánh giá nào.\n\nBạn có chắc chắn muốn xóa vĩnh viễn sản phẩm này khỏi cơ sở dữ liệu?`)) return;
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
  setPageHeader('🏪 Quản lý Nhà cung cấp', 'Quản lý đối tác nhãn hàng & theo dõi chất lượng sản phẩm qua đánh giá khách hàng',
    `<button class="btn btn-primary" onclick="openCreateSupplierModal()">➕ Thêm nhà cung cấp</button>`);
  showLoading();
  try {
    const suppliers = await api('GET', '/api/admin/suppliers');
    renderSuppliersTable(suppliers);
  } catch (e) { toast(e.message, 'error'); }
}

function openEditSupplierModalById(id) {
  const s = currentSuppliersList.find(x => Number(x.id) === Number(id));
  if (s) openEditSupplierModal(s);
}

const debounceFilterSuppliers = debounce(filterSuppliers, 150);

function renderSupplierRowsHtml(suppliers) {
  if (suppliers.length === 0) {
    return `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-muted)">Không tìm thấy nhà cung cấp nào</td></tr>`;
  }
  return suppliers.map(s => {
    const prodCount = Number(s.product_count) || 0;
    const revCount = Number(s.review_count) || 0;
    let ratingHtml = `<span style="color:var(--text-muted);font-size:12px">Chưa có đánh giá</span>`;
    if (revCount > 0 && s.avg_rating !== null && s.avg_rating !== undefined) {
      const avg = Number(s.avg_rating);
      const isLow = avg < 3.0;
      const badgeStyle = isLow 
        ? 'background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);padding:2px 8px;border-radius:12px;font-weight:600' 
        : 'color:#fbbf24;font-weight:600';
      ratingHtml = `
        <div style="display:flex;align-items:center;gap:6px">
          <span style="${badgeStyle}">${isLow ? '⚠️ ' : '⭐ '}${avg.toFixed(1)}</span>
          <span style="font-size:11px;color:var(--text-muted)">(${revCount} đánh giá)</span>
        </div>
      `;
    }

    return `
      <tr>
        <td><span style="color:var(--text-muted)">#${s.id}</span></td>
        <td>
          <strong style="color:var(--text-primary);font-size:14px">${escapeHtml(s.name)}</strong>
        </td>
        <td style="color:var(--text-secondary);font-size:13px">${s.contact_name ? escapeHtml(s.contact_name) : '—'}</td>
        <td style="color:var(--text-secondary);font-size:12px">✉️ ${escapeHtml(s.email || '—')}</td>
        <td style="font-size:12px;font-weight:500;color:var(--text-primary)">📞 ${escapeHtml(s.phone || '—')}</td>
        <td>
          <span class="tag" style="font-size:12px;background:rgba(99,102,241,0.12);color:#818cf8;border:1px solid rgba(99,102,241,0.25)">
            📦 <strong>${prodCount}</strong> sản phẩm
          </span>
        </td>
        <td>${ratingHtml}</td>
        <td>${statusBadge(s.status)}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-secondary btn-sm" onclick="openEditSupplierModalById(${s.id})" title="Chỉnh sửa nhà cung cấp">✏️</button>
            <button class="btn btn-trash btn-sm" onclick="deleteSupplier(${s.id},'${s.name.replace(/'/g, "\\'")}',${prodCount})" title="${prodCount > 0 ? 'Ngừng hợp tác (đang có sản phẩm)' : 'Xóa vĩnh viễn'}"><svg class="trash-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2v2H2v2h1v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6h1V4h-4V2h-2v2H9V2H6zm7 5v9h-2V7h2zM9 2V4h6V2H9z"/></svg></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderSuppliersTable(suppliers) {
  currentSuppliersList = suppliers;

  const tbody = document.getElementById('suppliers-tbody');
  const countEl = document.getElementById('suppliers-count');
  if (tbody && countEl) {
    tbody.innerHTML = renderSupplierRowsHtml(suppliers);
    countEl.textContent = `Hiển thị ${suppliers.length} nhà cung cấp đối tác`;
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
        <thead>
          <tr>
            <th>ID</th>
            <th>Tên nhà cung cấp</th>
            <th>Người liên hệ</th>
            <th>Email</th>
            <th>Điện thoại</th>
            <th>Sản phẩm</th>
            <th>Điểm đánh giá TB</th>
            <th>Trạng thái</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody id="suppliers-tbody">
          ${renderSupplierRowsHtml(suppliers)}
        </tbody>
      </table>
    </div>
    <p id="suppliers-count" style="color:var(--text-muted);font-size:12px;margin-top:10px">Hiển thị ${suppliers.length} nhà cung cấp đối tác</p>
  `;
  setPageContent(html);
}

function resetSupplierFilters() {
  const s = document.getElementById('sup-search'); if (s) s.value = '';
  const st = document.getElementById('sup-status'); if (st) st.value = '';
  filterSuppliers();
}

async function filterSuppliers() {
  const search = document.getElementById('sup-search')?.value.trim() || '';
  const status = document.getElementById('sup-status')?.value || '';
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (status) params.append('status', status);
  try {
    const suppliers = await api('GET', `/api/admin/suppliers?${params}`);
    renderSuppliersTable(suppliers);
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
  currentEditingSupplier = s;
  const prodCount = Number(s.product_count) || 0;
  const hasProducts = prodCount > 0;

  showModal(`✏️ Chỉnh sửa: ${escapeHtml(s.name)}`, `
    ${hasProducts ? `
      <div style="background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.3);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:16px;display:flex;align-items:flex-start;gap:10px;font-size:12px;color:#93c5fd;line-height:1.5">
        <span style="font-size:18px;line-height:1">ℹ️</span>
        <div>
          <strong>Nhà cung cấp này đang có ${prodCount} sản phẩm liên kết.</strong><br>
          <span>Tên nhà cung cấp được cố định để bảo toàn lịch sử thống kê CRM.</span>
        </div>
      </div>
    ` : ''}
    <div class="form-group">
      <label>Tên nhà cung cấp * ${hasProducts ? '<span style="color:var(--text-muted);font-weight:400">(Cố định 🔒)</span>' : ''}</label>
      <input id="es-name" value="${escapeHtml(s.name)}" ${hasProducts ? 'disabled style="opacity:0.65;cursor:not-allowed;background:rgba(15,23,42,0.6)" title="Tên nhà cung cấp được cố định do đã có sản phẩm liên kết"' : ''}>
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
  const s = currentEditingSupplier || {};
  const hasProducts = (Number(s.product_count) || 0) > 0;
  const nameInput = document.getElementById('es-name');
  const nameVal = hasProducts ? s.name : (nameInput ? nameInput.value.trim() : s.name);

  if (!nameVal) {
    toast('Tên nhà cung cấp là bắt buộc', 'warning');
    return;
  }

  try {
    const res = await api('PUT', `/api/admin/suppliers/${id}`, {
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
      `Để bảo toàn lịch sử sản phẩm và đánh giá CRM, nhà cung cấp sẽ KHÔNG bị xóa vĩnh viễn khỏi Database mà tự động chuyển sang trạng thái "Ngừng hợp tác" và toàn bộ sản phẩm liên quan sẽ chuyển sang "Ngừng kinh doanh (Đóng đánh giá)".\n\n` +
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
