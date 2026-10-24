/* ============================================================
   manager.js – Manager Module: CRM Dashboard, Customers, Surveys, Feedbacks
   ============================================================ */

let chartInstances = {};
let analyticsFilterState = { from: '', to: '' };

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}
// ========== MANAGER: DASHBOARD ==========
async function renderManagerDashboard() {
  setPageHeader('📊 Dashboard CRM', 'Tổng quan & phân tích thị hiếu khách hàng làm đẹp');
  showLoading();
  try {
    const data = await api('GET', `/api/manager/analytics${analyticsQuery()}`);
    const { ageGroups, skinTypes, genderGroups, beautyPrefs, newCustomersByMonth, stats } = data;

    const html = `
      ${analyticsFilterHtml('renderManagerDashboard')}
      <div class="stats-grid stats-grid-6">
        <div class="stat-card">
          <div class="stat-icon">👩</div>
          <div class="stat-value">${stats.totalCustomers}</div>
          <div class="stat-label">Tổng khách hàng</div>
        </div>
        <div class="stat-card warning" style="border-left: 4px solid #f59e0b;">
          <div class="stat-icon">⚠️</div>
          <div class="stat-value" style="color:#d97706">
            ${stats.pendingFeedbacks}
            ${stats.negativeFeedbacks > 0 ? `<small style="font-size:11px;color:#ef4444;font-weight:700"> (${stats.negativeFeedbacks} tiêu cực)</small>` : ''}
          </div>
          <div class="stat-label">Phản hồi chờ xử lý</div>
        </div>
        <div class="stat-card gold">
          <div class="stat-icon">⭐</div>
          <div class="stat-value">${stats.avgRating || '—'}</div>
          <div class="stat-label">Điểm hài lòng TB</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">💬</div>
          <div class="stat-value" style="font-size:18px">
            ${stats.repliedFeedbacks}/${stats.totalFeedbacks} <small style="font-size:12px;color:var(--text-muted)">(${stats.feedbackReplyRate}%)</small>
          </div>
          <div class="stat-label">Phản hồi (đã trả lời)</div>
        </div>
        <div class="stat-card emerald">
          <div class="stat-icon">📋</div>
          <div class="stat-value">${stats.activeSurveys}</div>
          <div class="stat-label">Khảo sát đang mở</div>
        </div>
        <div class="stat-card purple">
          <div class="stat-icon">📝</div>
          <div class="stat-value" style="font-size:18px">
            ${stats.totalSurveyResponses}/${stats.surveyRecipients} <small style="font-size:12px;color:var(--text-muted)">(${stats.surveyResponseRate}%)</small>
          </div>
          <div class="stat-label">Lượt tham gia khảo sát</div>
        </div>
      </div>

      <div class="charts-grid-3x2">
        <div class="chart-card">
          <div class="chart-title">🎂 Phân bố Độ tuổi Khách hàng</div>
          <div class="chart-container"><canvas id="chart-age"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">👤 Giới tính</div>
          <div class="chart-container"><canvas id="chart-gender"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">🧴 Phân loại Da (Loại da phổ biến)</div>
          <div class="chart-container"><canvas id="chart-skin"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">💅 Sở thích Làm đẹp</div>
          <div class="chart-container"><canvas id="chart-prefs"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">📅 Khách hàng mới theo tháng</div>
          <div class="chart-container"><canvas id="chart-new-customers"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">⭐ Phân bố Điểm đánh giá (1★ - 5★)</div>
          <div class="chart-container"><canvas id="chart-ratings"></canvas></div>
        </div>
      </div>
    `;
    setPageContent(html);

    // Render charts
    setTimeout(() => {
      const gemPalette = ['#10b981', '#34d399', '#60a5fa', '#a855f7', '#f43f5e', '#fbbf24', '#fb923c', '#e879f9'];
      const roseGrad = ['#2d8c5e', '#3aae7b', '#6ec99e', '#a8dfc0', '#d5f0e0'];

      destroyChart('age');
      destroyChart('gender');
      destroyChart('skin');
      destroyChart('prefs');
      destroyChart('new-customers');
      destroyChart('ratings');

      // 1. Phân bố Độ tuổi Khách hàng (Doughnut - Ascending order: Dưới 18, 18-24, 25-34, 35-44, 45+)
      chartInstances['age'] = new Chart(document.getElementById('chart-age'), {
        type: 'doughnut',
        data: {
          labels: ageGroups.map(g => g.age_group),
          datasets: [{ data: ageGroups.map(g => g.count), backgroundColor: gemPalette, borderColor: 'transparent', borderWidth: 0 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 } },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const val = context.raw || 0;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = total ? Math.round((val / total) * 100) : 0;
                  return ` ${context.label}: ${val} khách (${pct}%)`;
                }
              }
            }
          }
        }
      });

      // 2. Giới tính (Doughnut - Nữ, Nam, Khác)
      chartInstances['gender'] = new Chart(document.getElementById('chart-gender'), {
        type: 'doughnut',
        data: {
          labels: genderGroups.map(g => g.gender === 'Nu' ? 'Nữ' : g.gender === 'Nam' ? 'Nam' : 'Khác'),
          datasets: [{ data: genderGroups.map(g => g.count), backgroundColor: ['#f43f5e', '#3b82f6', '#a855f7'] }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 } },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const val = context.raw || 0;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = total ? Math.round((val / total) * 100) : 0;
                  return ` ${context.label}: ${val} (${pct}%)`;
                }
              }
            }
          }
        }
      });

      // 3. Phân loại Da (Vertical Bar Chart - Integer ticks on Y-axis)
      chartInstances['skin'] = new Chart(document.getElementById('chart-skin'), {
        type: 'bar',
        data: {
          labels: skinTypes.map(s => s.skin_type),
          datasets: [{ data: skinTypes.map(s => s.count), backgroundColor: roseGrad, borderRadius: 6, borderSkipped: false }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: 'rgba(203,213,225,0.05)' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(203,213,225,0.05)' },
              ticks: { color: '#94a3b8', font: { size: 11 }, precision: 0, stepSize: 1 }
            }
          }
        }
      });

      // 4. Sở thích Làm đẹp (Horizontal Bar Chart indexAxis: 'y' - Descending order, integer ticks on X-axis)
      chartInstances['prefs'] = new Chart(document.getElementById('chart-prefs'), {
        type: 'bar',
        data: {
          labels: beautyPrefs.map(p => p.pref),
          datasets: [{
            data: beautyPrefs.map(p => p.count),
            backgroundColor: '#2d8c5e',
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              beginAtZero: true,
              grid: { color: 'rgba(203,213,225,0.05)' },
              ticks: { color: '#94a3b8', font: { size: 11 }, precision: 0, stepSize: 1 }
            },
            y: {
              grid: { color: 'rgba(203,213,225,0.05)' },
              ticks: { color: '#94a3b8', font: { size: 11 } }
            }
          }
        }
      });

      // 5. Khách hàng mới theo tháng (Line/Area Chart - Integer ticks on Y-axis)
      const monthlySeries = completeMonthlySeries(newCustomersByMonth);
      const monthlyYears = [...new Set(monthlySeries.map(item => item.month.slice(0, 4)))];
      chartInstances['new-customers'] = new Chart(document.getElementById('chart-new-customers'), {
        type: 'line',
        data: {
          labels: monthlySeries.map(x => `T${x.month.slice(5, 7)}`),
          datasets: [{
            label: 'Khách hàng mới',
            data: monthlySeries.map(x => x.count),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16,185,129,0.15)',
            pointBackgroundColor: '#10b981',
            pointBorderColor: '#ecfdf5',
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 3,
            fill: true,
            tension: 0.3,
            spanGaps: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#94a3b8' } },
            title: {
              display: monthlyYears.length > 0,
              text: `Năm: ${monthlyYears.join(', ')}`,
              color: '#94a3b8',
              font: { size: 12, weight: '600' },
              padding: { bottom: 8 }
            }
          },
          scales: {
            x: { grid: { color: 'rgba(203,213,225,0.05)' }, ticks: { color: '#94a3b8' } },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(203,213,225,0.05)' },
              ticks: { color: '#94a3b8', precision: 0, stepSize: 1 }
            }
          }
        }
      });

      // 6. Phân bố Điểm đánh giá (1★ - 5★) (Horizontal Bar Chart indexAxis: 'y' - Integer ticks on X-axis)
      const rDist = stats.ratingDistribution || [
        { stars: 5, count: 0, percent: 0 },
        { stars: 4, count: 0, percent: 0 },
        { stars: 3, count: 0, percent: 0 },
        { stars: 2, count: 0, percent: 0 },
        { stars: 1, count: 0, percent: 0 }
      ];
      chartInstances['ratings'] = new Chart(document.getElementById('chart-ratings'), {
        type: 'bar',
        data: {
          labels: ['5 sao ⭐', '4 sao ⭐', '3 sao ⭐', '2 sao ⭐', '1 sao ⭐'],
          datasets: [{
            data: rDist.map(r => r.count),
            backgroundColor: ['#10b981', '#34d399', '#fbbf24', '#fb923c', '#f43f5e'],
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const item = rDist[context.dataIndex];
                  return ` ${context.label}: ${context.raw} đánh giá (${item ? item.percent : 0}%)`;
                }
              }
            }
          },
          scales: {
            x: {
              beginAtZero: true,
              grid: { color: 'rgba(203,213,225,0.05)' },
              ticks: { color: '#94a3b8', font: { size: 11 }, precision: 0, stepSize: 1 }
            },
            y: {
              grid: { color: 'rgba(203,213,225,0.05)' },
              ticks: { color: '#94a3b8', font: { size: 11 } }
            }
          }
        }
      });
    }, 50);
  } catch (e) { toast(e.message, 'error'); }
}

function analyticsQuery() {
  const from = document.getElementById('analytics-from')?.value || analyticsFilterState.from;
  const to = document.getElementById('analytics-to')?.value || analyticsFilterState.to;
  analyticsFilterState = { from: from || '', to: to || '' };
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  return params.toString() ? `?${params}` : '';
}

function analyticsFilterHtml(targetRenderFunc = 'renderManagerDashboard') {
  return `
    <div class="filter-bar" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <label style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:6px">Từ ngày <input type="date" id="analytics-from" value="${analyticsFilterState.from}"></label>
      <label style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:6px">Đến ngày <input type="date" id="analytics-to" value="${analyticsFilterState.to}"></label>
      <button class="btn btn-primary" onclick="${targetRenderFunc}()">🔍 Áp dụng</button>

      <div class="dropdown" style="margin-left:auto">
        <button class="btn btn-secondary dropdown-toggle" onclick="toggleAnalyticsDropdown(event)" style="display:flex;align-items:center;gap:6px">
          <span>📥 Xuất dữ liệu (CSV)</span>
          <span style="font-size:10px">▾</span>
        </button>
        <div id="analytics-export-menu" class="dropdown-menu">
          <button class="dropdown-item" onclick="downloadAnalytics('customers'); closeAnalyticsDropdown();">
            <span>👩</span> <span>Khách hàng (CSV)</span>
          </button>
          <button class="dropdown-item" onclick="downloadAnalytics('feedbacks'); closeAnalyticsDropdown();">
            <span>💬</span> <span>Phản hồi (CSV)</span>
          </button>
          <button class="dropdown-item" onclick="downloadAnalytics('surveys'); closeAnalyticsDropdown();">
            <span>📋</span> <span>Khảo sát (CSV)</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function toggleAnalyticsDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('analytics-export-menu');
  if (menu) menu.classList.toggle('show');
}

function closeAnalyticsDropdown() {
  const menu = document.getElementById('analytics-export-menu');
  if (menu) menu.classList.remove('show');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    closeAnalyticsDropdown();
  }
});

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#94a3b8' } } },
    scales: {
      x: { grid: { color: 'rgba(203,213,225,0.05)' }, ticks: { color: '#94a3b8' } },
      y: { grid: { color: 'rgba(203,213,225,0.05)' }, ticks: { color: '#94a3b8', precision: 0, stepSize: 1 }, beginAtZero: true }
    }
  };
}

function completeMonthlySeries(entries) {
  const counts = new Map(
    (Array.isArray(entries) ? entries : [])
      .map(entry => {
        const match = String(entry?.month || '').match(/^(\d{4})-(\d{1,2})$/);
        return match
          ? [`${match[1]}-${match[2].padStart(2, '0')}`, Number(entry.count) || 0]
          : null;
      })
      .filter(Boolean)
  );
  if (!counts.size) return [];

  const keys = [...counts.keys()].sort();
  const [firstYear, firstMonth] = keys[0].split('-').map(Number);
  const [lastYear, lastMonth] = keys[keys.length - 1].split('-').map(Number);
  let cursor = firstYear * 12 + firstMonth - 1;
  const end = lastYear * 12 + lastMonth - 1;
  if (keys.length === 1) cursor--;

  const series = [];
  while (cursor <= end) {
    const year = Math.floor(cursor / 12);
    const monthNumber = (cursor % 12) + 1;
    const month = `${year}-${String(monthNumber).padStart(2, '0')}`;
    series.push({ month, count: counts.get(month) || 0 });
    cursor++;
  }
  return series;
}

async function downloadAnalytics(type) {
  const query = analyticsQuery();
  const button = document.querySelector(`button[onclick="downloadAnalytics('${type}')"]`);
  if (button) button.disabled = true;
  try {
    const response = await fetch(`/api/manager/analytics/export?type=${type}${query ? `&${query.slice(1)}` : ''}`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${type}-analytics.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    toast('Xuất báo cáo thành công!', 'success');
  } catch (e) {
    toast(`Không thể xuất báo cáo: ${e.message}`, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

// ========== MANAGER: PHÂN TÍCH CRM (ANALYTICS) ==========
let currentFeedbackProducts = [];
let analyticsProductTab = 'ALL';
let analyticsProductSearch = '';

async function renderManagerAnalytics() {
  setPageHeader('📈 Phân tích CRM', 'Phân tích sâu khách hàng, sở thích làm đẹp và hiệu quả chiến dịch');
  showLoading();
  try {
    const data = await api('GET', `/api/manager/analytics${analyticsQuery()}`);
    const { customerProfiles, feedbackByProduct, surveyOverview } = data;
    currentFeedbackProducts = feedbackByProduct || [];

    const standardAges = ['Dưới 18', '18-24', '25-34', '35-44', '45+'];
    const standardSkins = ['Da dầu', 'Da hỗn hợp', 'Da nhạy cảm', 'Da thường', 'Da khô'];

    const classifyAge = (age) => {
      if (age === null || age === undefined || isNaN(age)) return null;
      const a = Number(age);
      if (a < 18) return 'Dưới 18';
      if (a <= 24) return '18-24';
      if (a <= 34) return '25-34';
      if (a <= 44) return '35-44';
      return '45+';
    };

    const prefSet = new Set();
    customerProfiles.forEach(c => {
      (c.beauty_preferences || '').split(',').map(p => p.trim()).filter(Boolean).forEach(p => {
        const prefName = (p === 'Skincare cơ bản' || p === 'Chăm sóc da') ? 'Chăm sóc da (Skincare)' : p;
        prefSet.add(prefName);
      });
    });
    const standardPrefOrder = ['Chăm sóc da (Skincare)', 'Trang điểm', 'Chống lão hóa', 'Trị mụn', 'Dưỡng ẩm', 'Organic'];
    const allPrefs = [
      ...standardPrefOrder.filter(p => prefSet.has(p)),
      ...[...prefSet].filter(p => !standardPrefOrder.includes(p))
    ];
    if (allPrefs.length === 0) allPrefs.push(...standardPrefOrder);

    const ageMatrix = {};
    const skinMatrix = {};
    allPrefs.forEach(p => {
      ageMatrix[p] = {};
      skinMatrix[p] = {};
      standardAges.forEach(a => { ageMatrix[p][a] = 0; });
      standardSkins.forEach(s => { skinMatrix[p][s] = 0; });
    });

    customerProfiles.forEach(c => {
      const ag = classifyAge(c.age);
      const st = c.skin_type;
      (c.beauty_preferences || '').split(',').map(p => p.trim()).filter(Boolean).forEach(p => {
        const prefName = (p === 'Skincare cơ bản' || p === 'Chăm sóc da') ? 'Chăm sóc da (Skincare)' : p;
        if (ageMatrix[prefName] && ag && ageMatrix[prefName][ag] !== undefined) {
          ageMatrix[prefName][ag]++;
        }
        if (skinMatrix[prefName] && st && skinMatrix[prefName][st] !== undefined) {
          skinMatrix[prefName][st]++;
        }
      });
    });

    const html = `
      ${analyticsFilterHtml('renderManagerAnalytics')}

      <!-- 1. HAI BIỂU ĐỒ SỞ THÍCH: STACKED BAR CHARTS -->
      <div class="charts-grid-2col">
        <div class="chart-card">
          <div class="chart-title">🎯 Sở thích theo độ tuổi (Stacked Bar)</div>
          <div class="chart-container" style="height:260px"><canvas id="chart-pref-age"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">🧴 Sở thích theo loại da (Stacked Bar)</div>
          <div class="chart-container" style="height:260px"><canvas id="chart-pref-skin"></canvas></div>
        </div>
      </div>

      <!-- 2. KHU VỰC XẾP HẠNG & PHÂN TÍCH SẢN PHẨM THEO PHẢN HỒI -->
      <div class="card" style="margin-top:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px">
          <div class="card-title" style="margin-bottom:0">⭐ Xếp hạng & Phân tích sản phẩm theo phản hồi</div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <input type="text" id="analytics-product-search" placeholder="🔍 Tìm tên sản phẩm..."
                   value="${escapeHtml(analyticsProductSearch)}"
                   oninput="handleAnalyticsProductSearch(this.value)"
                   style="max-width:220px;padding:6px 12px;font-size:12px">
          </div>
        </div>

        <!-- Filter tabs -->
        <div class="filter-tabs">
          <button class="filter-tab-btn ${analyticsProductTab === 'ALL' ? 'active' : ''}" onclick="setAnalyticsProductTab('ALL')">
            Tất cả sản phẩm (${feedbackByProduct.length})
          </button>
          <button class="filter-tab-btn ${analyticsProductTab === 'HIGH' ? 'active' : ''}" onclick="setAnalyticsProductTab('HIGH')">
            ⭐ Đánh giá cao (≥ 4.0★)
          </button>
          <button class="filter-tab-btn ${analyticsProductTab === 'LOW' ? 'active' : ''}" onclick="setAnalyticsProductTab('LOW')">
            ⚠️ Cần chú ý (< 3.5★)
          </button>
          <button class="filter-tab-btn ${analyticsProductTab === 'UNREPLIED' ? 'active' : ''}" onclick="setAnalyticsProductTab('UNREPLIED')">
            🕐 Chưa trả lời CSKH
          </button>
        </div>

        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>SẢN PHẨM</th>
                <th>ĐIỂM TB & PHÂN BỔ</th>
                <th>SỐ PHẢN HỒI</th>
                <th>PHẢN HỒI CSKH</th>
                <th>TRẠNG THÁI CHẤT LƯỢNG</th>
                <th style="text-align:center">KHÁCH HÀNG ĐÁNH GIÁ</th>
              </tr>
            </thead>
            <tbody id="analytics-products-tbody">
              <!-- Rendered via filterAndRenderAnalyticsProducts -->
            </tbody>
          </table>
        </div>
      </div>

      <!-- 3. HIỆU QUẢ CHIẾN DỊCH KHẢO SÁT -->
      <div class="card" style="margin-top:20px">
        <div class="card-title">📋 Hiệu quả chiến dịch khảo sát</div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>KHẢO SÁT</th>
                <th>KÊNH GỬI</th>
                <th>TRẠNG THÁI</th>
                <th style="text-align:center">NGƯỜI NHẬN</th>
                <th style="text-align:center">PHẢN HỒI</th>
                <th style="min-width:140px">TỶ LỆ HOÀN THÀNH</th>
                <th>MỨC ĐỘ HÀI LÒNG (CSAT)</th>
                <th style="text-align:center">HÀNH ĐỘNG</th>
              </tr>
            </thead>
            <tbody>
              ${surveyOverview.length === 0 ? `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">Chưa có dữ liệu chiến dịch khảo sát</td></tr>` : surveyOverview.map(s => {
                const pct = s.recipients ? Math.round((s.responses / s.recipients) * 100) : 0;
                return `
                  <tr>
                    <td><strong>${escapeHtml(s.title)}</strong></td>
                    <td><span class="tag" style="font-size:11px">📱 In-App Web</span></td>
                    <td>${surveyStatusBadge(s.status)}</td>
                    <td style="text-align:center">${s.recipients || 0}</td>
                    <td style="text-align:center">${s.responses || 0}</td>
                    <td>
                      <div style="display:flex;align-items:center;gap:8px">
                        <div style="flex:1;min-width:60px;height:8px;background:rgba(203,213,225,0.2);border-radius:4px;overflow:hidden">
                          <div style="width:${Math.min(pct, 100)}%;height:100%;background:var(--green-600);border-radius:4px"></div>
                        </div>
                        <span style="font-weight:600;font-size:12px">${pct}%</span>
                      </div>
                    </td>
                    <td>
                      ${s.csat_avg ? `<span style="color:#f59e0b;font-weight:700">⭐ ${s.csat_avg}</span> <span style="font-size:11px;color:var(--text-muted)">/ 5</span>` : '<span style="color:var(--text-muted)">—</span>'}
                    </td>
                    <td style="text-align:center">
                      <button class="btn btn-secondary btn-sm" onclick="viewSurveyResults(${s.id},'${s.title.replace(/'/g, "\\'")}')">📊 Chi tiết</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    setPageContent(html);
    filterAndRenderAnalyticsProducts();

    // Render stacked charts
    setTimeout(() => {
      destroyChart('pref-age');
      destroyChart('pref-skin');

      const palette = ['#10b981', '#f43f5e', '#8b5cf6', '#fbbf24', '#3b82f6', '#ec4899', '#14b8a6', '#f97316'];

      // Chart 1: Sở thích theo độ tuổi (Stacked Bar)
      const ageDatasets = allPrefs.map((pref, i) => ({
        label: pref,
        data: standardAges.map(a => ageMatrix[pref][a] || 0),
        backgroundColor: palette[i % palette.length],
        borderRadius: 4
      }));

      chartInstances['pref-age'] = new Chart(document.getElementById('chart-pref-age'), {
        type: 'bar',
        data: {
          labels: standardAges,
          datasets: ageDatasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 }
            },
            tooltip: {
              mode: 'index',
              intersect: false
            }
          },
          scales: {
            x: {
              stacked: true,
              grid: { color: 'rgba(203,213,225,0.05)' },
              ticks: { color: '#94a3b8', font: { size: 11 } }
            },
            y: {
              stacked: true,
              beginAtZero: true,
              grid: { color: 'rgba(203,213,225,0.05)' },
              ticks: { color: '#94a3b8', font: { size: 11 }, precision: 0, stepSize: 1 }
            }
          }
        }
      });

      // Chart 2: Sở thích theo loại da (Stacked Bar)
      const skinDatasets = allPrefs.map((pref, i) => ({
        label: pref,
        data: standardSkins.map(s => skinMatrix[pref][s] || 0),
        backgroundColor: palette[i % palette.length],
        borderRadius: 4
      }));

      chartInstances['pref-skin'] = new Chart(document.getElementById('chart-pref-skin'), {
        type: 'bar',
        data: {
          labels: standardSkins,
          datasets: skinDatasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 }
            },
            tooltip: {
              mode: 'index',
              intersect: false
            }
          },
          scales: {
            x: {
              stacked: true,
              grid: { color: 'rgba(203,213,225,0.05)' },
              ticks: { color: '#94a3b8', font: { size: 11 } }
            },
            y: {
              stacked: true,
              beginAtZero: true,
              grid: { color: 'rgba(203,213,225,0.05)' },
              ticks: { color: '#94a3b8', font: { size: 11 }, precision: 0, stepSize: 1 }
            }
          }
        }
      });
    }, 50);

  } catch (e) { toast(e.message, 'error'); }
}

function setAnalyticsProductTab(tab) {
  analyticsProductTab = tab;
  document.querySelectorAll('.filter-tabs .filter-tab-btn').forEach(btn => btn.classList.remove('active'));
  const btn = event?.currentTarget;
  if (btn) btn.classList.add('active');
  filterAndRenderAnalyticsProducts();
}

function handleAnalyticsProductSearch(val) {
  analyticsProductSearch = val;
  filterAndRenderAnalyticsProducts();
}

function filterAndRenderAnalyticsProducts() {
  let list = currentFeedbackProducts || [];
  if (analyticsProductSearch) {
    const q = analyticsProductSearch.toLowerCase().trim();
    list = list.filter(p => (p.product_name || '').toLowerCase().includes(q));
  }
  if (analyticsProductTab === 'HIGH') {
    list = list.filter(p => (Number(p.average) || 0) >= 4.0);
  } else if (analyticsProductTab === 'LOW') {
    list = list.filter(p => (Number(p.average) || 0) < 3.5 && p.count > 0);
  } else if (analyticsProductTab === 'UNREPLIED') {
    list = list.filter(p => (p.pending_count || 0) > 0);
  }

  const tbody = document.getElementById('analytics-products-tbody');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">Không có sản phẩm nào phù hợp điều kiện lọc</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(p => {
    const avg = Number(p.average) || 0;
    const posRate = p.count ? Math.round(((p.positive_count || 0) / p.count) * 100) : 0;
    const replyRate = p.count ? Math.round(((p.replied_count || 0) / p.count) * 100) : 0;

    let qualityBadge = '<span class="badge" style="background:rgba(100,116,139,0.15);color:#64748b">Chưa có đánh giá</span>';
    if (p.count > 0) {
      if (avg >= 4.0) qualityBadge = '<span class="badge badge-replied">✅ Tốt</span>';
      else if (avg >= 3.0) qualityBadge = '<span class="badge badge-pending">⚡ Trung bình</span>';
      else qualityBadge = '<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;font-weight:700">⚠️ Cần kiểm tra</span>';
    }

    return `
      <tr>
        <td><strong>${escapeHtml(p.product_name)}</strong></td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-weight:700;color:#f59e0b">⭐ ${p.average || '—'}</span>
            ${p.count > 0 ? `<span style="font-size:11px;color:var(--text-muted)">(${posRate}% ≥ 4★)</span>` : ''}
          </div>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <span>${p.count} lượt</span>
            ${p.negative_count > 0 ? `<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;font-size:10px">${p.negative_count} tiêu cực</span>` : ''}
          </div>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <span>${p.replied_count || 0}/${p.count} (${replyRate}%)</span>
            ${p.pending_count > 0 ? `<span class="badge badge-pending" style="font-size:10px">${p.pending_count} chờ xử lý</span>` : ''}
          </div>
        </td>
        <td>${qualityBadge}</td>
        <td style="text-align:center">
          <button class="btn btn-secondary btn-sm" onclick="openProductReviewersModal(${p.product_id}, '${escapeHtml(p.product_name).replace(/'/g, "\\'")}')">
            👥 Xem người đánh giá
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function openProductReviewersModal(productId, productName) {
  showModal(`👥 Khách hàng đánh giá: ${escapeHtml(productName)}`, `
    <div style="text-align:center;padding:30px"><div class="spinner"></div></div>
  `, true);

  try {
    const res = await api('GET', `/api/manager/products/${productId}/feedbacks`);
    const feedbacks = res.feedbacks || [];
    if (feedbacks.length === 0) {
      document.querySelector('.modal-body').innerHTML = `
        <div class="page-empty" style="padding:40px 20px">
          <div class="empty-icon">💬</div>
          <p>Chưa có khách hàng nào đánh giá sản phẩm này.</p>
        </div>
      `;
      return;
    }

    const html = `
      <div style="margin-bottom:14px;color:var(--text-muted);font-size:13px">
        Tổng cộng <strong>${feedbacks.length}</strong> lượt phản hồi từ khách hàng cho sản phẩm này:
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;max-height:65vh;overflow-y:auto;padding-right:4px">
        ${feedbacks.map(f => {
          const ageDisplay = f.age ? `${f.age} tuổi` : 'Chưa rõ tuổi';
          const skinDisplay = f.skin_type || 'Chưa rõ loại da';
          const contact = [f.email, f.phone].filter(Boolean).join(' · ');
          const isReplied = f.status === 'REPLIED';

          return `
            <div style="border:1px solid var(--border);border-radius:var(--radius);padding:14px;background:var(--bg-card)">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:8px">
                <div>
                  <div style="display:flex;align-items:center;gap:8px">
                    <strong style="font-size:14px">${escapeHtml(f.full_name || 'Khách hàng')}</strong>
                    <span class="tag" style="font-size:11px;background:rgba(45,106,79,0.1);color:var(--green-700)">🧴 ${escapeHtml(skinDisplay)}</span>
                    <span class="tag" style="font-size:11px;background:rgba(59,130,246,0.1);color:#2563eb">🎂 ${ageDisplay}</span>
                  </div>
                  ${contact ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">📧 ${escapeHtml(contact)}</div>` : ''}
                </div>
                <div style="text-align:right">
                  <div style="font-size:14px;font-weight:700;color:#f59e0b">⭐ ${f.rating} / 5</div>
                  <div style="font-size:11px;color:var(--text-muted)">${formatDateTime(f.created_at)}</div>
                </div>
              </div>

              <div style="background:var(--bg-input);padding:10px 12px;border-radius:6px;font-size:13px;line-height:1.5;margin-bottom:8px;color:var(--text-primary)">
                ${escapeHtml(f.content || '(Không có nhận xét chi tiết)')}
              </div>

              <div style="display:flex;justify-content:space-between;align-items:center;padding-top:6px;border-top:1px dashed var(--border);flex-wrap:wrap;gap:8px">
                <div>
                  ${isReplied
                    ? `<span class="badge badge-replied">✅ Đã phản hồi CSKH</span>`
                    : `<span class="badge badge-pending" style="background:rgba(239,68,68,0.15);color:#ef4444">⚠️ Chờ xử lý</span>`
                  }
                </div>
                <div>
                  ${isReplied ? `
                    <div style="font-size:12px;color:var(--text-secondary);font-style:italic">
                      💬 "${escapeHtml(f.reply_content || '')}"
                    </div>
                  ` : `
                    <button class="btn btn-primary btn-sm" onclick="closeModal(); navigate('manager-feedbacks');">
                      💬 Đến mục Phản hồi & Đánh giá để trả lời ngay
                    </button>
                  `}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    document.querySelector('.modal-body').innerHTML = html;
  } catch (e) {
    document.querySelector('.modal-body').innerHTML = `<div style="color:var(--rose-500);padding:20px">${escapeHtml(e.message)}</div>`;
  }
}

// ========== MANAGER: CUSTOMERS ==========
let currentCustomersList = [];

async function renderManagerCustomers() {
  setPageHeader('👩 Quản lý Khách hàng', 'Thêm, sửa, xóa, khóa và theo dõi hồ sơ khách hàng',
    `<button class="btn btn-primary" onclick="openCreateCustomerModal()">➕ Thêm khách hàng</button>`);
  showLoading();
  await fetchAndRenderCustomers({});
}

async function fetchAndRenderCustomers(filters) {
  try {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
    const customers = await api('GET', `/api/manager/customers?${params}`);
    currentCustomersList = customers;

    const skinOptions = ['Da dầu', 'Da khô', 'Da hỗn hợp', 'Da nhạy cảm', 'Da thường']
      .map(s => `<option value="${s}" ${filters.skin_type === s ? 'selected' : ''}>${s}</option>`).join('');

    const html = `
      <div class="filter-bar">
        <input type="text" id="cust-search" placeholder="🔍 Tên, email, số điện thoại..." value="${filters.search || ''}">
        <select id="cust-skin"><option value="">Tất cả loại da</option>${skinOptions}</select>
        <select id="cust-status">
          <option value="">Tất cả</option>
          <option value="ACTIVE" ${filters.status === 'ACTIVE' ? 'selected' : ''}>✓ Hoạt động</option>
          <option value="LOCKED" ${filters.status === 'LOCKED' ? 'selected' : ''}>🔒 Bị khóa</option>
        </select>
        <button class="btn btn-primary" onclick="filterCustomers()">🔍 Lọc</button>
        <button class="btn btn-secondary" onclick="renderManagerCustomers()">↺ Reset</button>
      </div>

      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Khách hàng</th><th>Liên hệ</th><th>Độ tuổi</th><th>Loại da</th>
            <th>Sở thích</th><th>Trạng thái</th><th>Ngày ĐK</th><th>Hành động</th>
          </tr></thead>
          <tbody>
            ${customers.length === 0 ? `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">Không tìm thấy khách hàng</td></tr>` : customers.map(c => `
              <tr class="row-clickable" title="💡 Nhấp đúp (Double-click) để xem và sửa thông tin" ondblclick="openEditCustomerModalById(${c.id})">
                <td>
                  <div style="display:flex;align-items:center;gap:10px">
                    <div class="user-avatar" style="width:34px;height:34px;font-size:13px">${c.full_name ? c.full_name.charAt(0) : 'U'}</div>
                    <div style="font-weight:600">${escapeHtml(c.full_name)}</div>
                  </div>
                </td>
                <td style="font-size:12px;color:var(--text-secondary)">${escapeHtml(c.email || c.phone || '—')}</td>
                <td style="text-align:center">${c.age ? `<strong>${c.age}</strong> tuổi` : '—'}</td>
                <td>${c.skin_type ? `<span class="tag" style="font-size:11px">${escapeHtml(c.skin_type)}</span>` : '—'}</td>
                <td style="max-width:160px">
                  <div class="tag-list">
                    ${c.beauty_preferences ? c.beauty_preferences.split(',').slice(0, 2).map(p => `<span class="tag" style="font-size:10px">${escapeHtml(p.trim())}</span>`).join('') : '—'}
                  </div>
                </td>
                <td>${statusBadge(c.status)}</td>
                <td style="font-size:11px;color:var(--text-muted)">${formatDate(c.created_at)}</td>
                <td onclick="event.stopPropagation()">
                  <div style="display:flex;gap:6px">
                    ${c.status === 'ACTIVE'
                      ? `<button class="btn btn-warning btn-sm" title="Khóa tài khoản" onclick="toggleCustomerStatus(${c.id},'LOCKED','${c.full_name.replace(/'/g, "\\'")}')">🔒</button>`
                      : `<button class="btn btn-success btn-sm" title="Mở khóa tài khoản" onclick="toggleCustomerStatus(${c.id},'ACTIVE','${c.full_name.replace(/'/g, "\\'")}')">🔓</button>`
                    }
                    <button class="btn btn-trash btn-sm" title="Xóa khách hàng" onclick="deleteCustomer(${c.id},'${c.full_name.replace(/'/g, "\\'")}')"><svg class="trash-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2v2H2v2h1v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6h1V4h-4V2h-2v2H9V2H6zm7 5v9h-2V7h2zM9 2V4h6V2H9z"/></svg></button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p style="color:var(--text-muted);font-size:12px;margin-top:10px">Tổng: ${customers.length} khách hàng · 💡 Nhấp đúp (Double-click) vào một dòng để xem và sửa thông tin</p>
    `;
    setPageContent(html);
  } catch (e) { toast(e.message, 'error'); }
}

function filterCustomers() {
  fetchAndRenderCustomers({
    search: document.getElementById('cust-search').value.trim(),
    skin_type: document.getElementById('cust-skin').value,
    status: document.getElementById('cust-status').value,
  });
}

function openCreateCustomerModal() {
  showModal('➕ Thêm khách hàng mới', `
    <div class="form-row">
      <div class="form-group"><label>Tên đăng nhập *</label><input id="mc-username" placeholder="username" autocomplete="off"></div>
      <div class="form-group"><label>Mật khẩu *</label><input id="mc-password" type="password" placeholder="Mật khẩu" autocomplete="off"></div>
    </div>
    <div class="form-group"><label>Họ và tên *</label><input id="mc-fullname" placeholder="Họ và tên đầy đủ"></div>
    <div class="form-row">
      <div class="form-group"><label>Email</label><input id="mc-email" type="email"></div>
      <div class="form-group"><label>Số điện thoại</label><input id="mc-phone"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Độ tuổi</label><input id="mc-age" type="number" min="13" max="100"></div>
      <div class="form-group"><label>Giới tính</label>
        <select id="mc-gender"><option value="">--</option><option value="Nu">Nữ</option><option value="Nam">Nam</option><option value="Khac">Khác</option></select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Loại da</label>
        <select id="mc-skin">
          <option value="">-- Chọn loại da --</option>
          ${['Da dầu', 'Da khô', 'Da hỗn hợp', 'Da nhạy cảm', 'Da thường'].map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Sở thích làm đẹp</label>
        <select id="mc-pref">
          <option value="">-- Chọn sở thích --</option>
          ${['Trang điểm', 'Chăm sóc da', 'Chống lão hóa', 'Trị mụn', 'Dưỡng ẩm', 'Organic', 'Skincare cơ bản'].map(p => `<option value="${p}">${p}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="createCustomer()">✅ Thêm khách hàng</button>
    </div>
  `);
}

async function createCustomer() {
  try {
    await api('POST', '/api/manager/customers', {
      username: document.getElementById('mc-username').value.trim(),
      password: document.getElementById('mc-password').value,
      full_name: document.getElementById('mc-fullname').value.trim(),
      email: document.getElementById('mc-email').value.trim(),
      phone: document.getElementById('mc-phone').value.trim(),
      age: Number(document.getElementById('mc-age').value) || null,
      gender: document.getElementById('mc-gender').value || null,
      skin_type: document.getElementById('mc-skin').value || null,
      beauty_preferences: document.getElementById('mc-pref').value || null,
    });
    toast('Thêm khách hàng thành công!', 'success');
    closeModal();
    renderManagerCustomers();
  } catch (e) { toast(e.message, 'error'); }
}

function openEditCustomerModalById(id) {
  const c = currentCustomersList.find(x => Number(x.id) === Number(id));
  if (c) openEditCustomerModal(c);
}

function openEditCustomerModal(c) {
  if (typeof c === 'string') c = JSON.parse(c.replace(/&quot;/g, '"'));
  const currentPref = (c.beauty_preferences || '').split(',')[0]?.trim() || '';
  const skinTypes = ['Da dầu', 'Da khô', 'Da hỗn hợp', 'Da nhạy cảm', 'Da thường'];
  const prefOptions = ['Trang điểm', 'Chăm sóc da', 'Chống lão hóa', 'Trị mụn', 'Dưỡng ẩm', 'Organic', 'Skincare cơ bản'];

  showModal(`✏️ Xem & Sửa khách hàng: ${escapeHtml(c.full_name)}`, `
    <div class="form-row">
      <div class="form-group">
        <label>Tên đăng nhập *</label>
        <input id="ec-username" value="${escapeHtml(c.username || '')}" placeholder="username" autocomplete="off">
      </div>
      <div class="form-group">
        <label>Mật khẩu * <span style="font-size:11px;font-weight:400;color:var(--text-muted)">(đang hiển thị)</span></label>
        <div style="display:flex;gap:6px">
          <input id="ec-password" type="text" value="${escapeHtml(c.password || '')}" autocomplete="off" placeholder="Mật khẩu" style="flex:1">
          <button type="button" class="btn btn-secondary btn-sm" onclick="toggleInputVisibility('ec-password', this)" title="Ẩn/Hiện mật khẩu">👁️</button>
        </div>
      </div>
    </div>

    <div class="form-group">
      <label>Họ và tên *</label>
      <input id="ec-fullname" value="${escapeHtml(c.full_name || '')}" placeholder="Họ và tên đầy đủ">
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Email</label>
        <input id="ec-email" type="email" value="${escapeHtml(c.email || '')}" placeholder="email@example.com">
      </div>
      <div class="form-group">
        <label>Số điện thoại</label>
        <input id="ec-phone" value="${escapeHtml(c.phone || '')}" placeholder="0901234567">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Độ tuổi</label>
        <input id="ec-age" type="number" min="13" max="100" value="${c.age || ''}">
      </div>
      <div class="form-group">
        <label>Giới tính</label>
        <select id="ec-gender">
          <option value="">-- Chọn giới tính --</option>
          <option value="Nu" ${c.gender === 'Nu' ? 'selected' : ''}>Nữ</option>
          <option value="Nam" ${c.gender === 'Nam' ? 'selected' : ''}>Nam</option>
          <option value="Khac" ${c.gender === 'Khac' ? 'selected' : ''}>Khác</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Loại da</label>
        <select id="ec-skin">
          <option value="">-- Chọn loại da --</option>
          ${skinTypes.map(s => `<option value="${s}" ${c.skin_type === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Sở thích làm đẹp</label>
        <select id="ec-pref">
          <option value="">-- Chọn sở thích --</option>
          ${prefOptions.map(p => `<option value="${p}" ${currentPref === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="form-group">
      <label>Khóa / Trạng thái tài khoản</label>
      <select id="ec-status">
        <option value="ACTIVE" ${c.status === 'ACTIVE' ? 'selected' : ''}>✓ Hoạt động (Cho phép đăng nhập)</option>
        <option value="LOCKED" ${c.status === 'LOCKED' ? 'selected' : ''}>🔒 Khóa tài khoản (Ngăn đăng nhập)</option>
      </select>
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
      <button class="btn btn-primary" onclick="updateCustomer(${c.id})">💾 Lưu thay đổi</button>
    </div>
  `);
}

async function updateCustomer(accountId) {
  try {
    const payload = {
      username: document.getElementById('ec-username').value.trim(),
      password: document.getElementById('ec-password').value,
      full_name: document.getElementById('ec-fullname').value.trim(),
      email: document.getElementById('ec-email').value.trim(),
      phone: document.getElementById('ec-phone').value.trim(),
      age: Number(document.getElementById('ec-age').value) || null,
      gender: document.getElementById('ec-gender').value || null,
      skin_type: document.getElementById('ec-skin').value || null,
      beauty_preferences: document.getElementById('ec-pref').value || null,
      status: document.getElementById('ec-status').value,
    };

    if (!payload.username || !payload.full_name) {
      toast('Tên đăng nhập và họ tên không được để trống', 'error');
      return;
    }

    await api('PUT', `/api/manager/customers/${accountId}`, payload);
    toast('Cập nhật thông tin khách hàng thành công!', 'success');
    closeModal();
    renderManagerCustomers();
  } catch (e) { toast(e.message, 'error'); }
}

async function toggleCustomerStatus(accountId, newStatus, name) {
  const action = newStatus === 'LOCKED' ? 'khóa' : 'mở khóa';
  if (!confirm(`Xác nhận ${action} tài khoản của "${name}"?`)) return;
  try {
    await api('PUT', `/api/manager/customers/${accountId}/status`, { status: newStatus });
    toast(newStatus === 'LOCKED' ? `Đã khóa tài khoản ${name}` : `Đã mở khóa tài khoản ${name}`, 'success');
    renderManagerCustomers();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteCustomer(accountId, name) {
  if (!confirm(`Xác nhận xóa tài khoản khách hàng "${name}"?`)) return;
  try {
    await api('DELETE', `/api/manager/customers/${accountId}`);
    toast('Đã xóa khách hàng', 'success');
    renderManagerCustomers();
  } catch (e) { toast(e.message, 'error'); }
}

// ========== MANAGER: SURVEYS ==========
async function renderManagerSurveys() {
  setPageHeader('📋 Chiến dịch Khảo sát', 'Tạo, quản lý, chỉnh sửa và theo dõi kết quả khảo sát thị hiếu',
    `<button class="btn btn-primary" onclick="openCreateSurveyModal()">➕ Tạo khảo sát mới</button>`);
  showLoading();
  try {
    const surveys = await api('GET', '/api/manager/surveys');
    const html = `
      <div class="survey-list">
        ${surveys.length === 0 ? `<div class="page-empty"><div class="empty-icon">📋</div><p>Chưa có chiến dịch khảo sát nào</p></div>` : surveys.map(s => `
          <div class="survey-card row-clickable" title="💡 Nhấp đúp (Double-click) để sửa khảo sát" ondblclick="openEditSurveyModal(${s.id})">
            <div class="survey-icon">📋</div>
            <div class="survey-info">
              <div class="survey-title">${escapeHtml(s.title)}</div>
              <div class="survey-meta">
                ${surveyStatusBadge(s.status)}
                ${s.product_names ? `&nbsp;📦 ${escapeHtml(s.product_names)}` : ''}
                &nbsp;· 📝 ${s.question_count} câu hỏi
                &nbsp;· 📤 ${s.recipient_count || 0} người nhận
                &nbsp;· 👥 ${s.response_count} phản hồi
                ${s.start_date ? `&nbsp;· 📅 ${formatDate(s.start_date)} → ${formatDate(s.end_date)}` : ''}
              </div>
            </div>
            <div class="survey-actions" onclick="event.stopPropagation()">
              <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); viewSurveyResults(${s.id},'${s.title.replace(/'/g, "\\'")}')">📊 Kết quả</button>
              <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); manageSurveyRecipients(${s.id},'${s.title.replace(/'/g, "\\'")}')">📤 Người nhận</button>
              ${s.status === 'DRAFT' ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); sendSurvey(${s.id},'${s.title.replace(/'/g, "\\'")}')" ${s.recipient_count === 0 ? 'disabled' : ''}>📤 Gửi</button>` : ''}
              ${s.status === 'ACTIVE' ? `<button class="btn btn-warning btn-sm" onclick="event.stopPropagation(); updateSurveyStatus(${s.id},'CLOSED')">⏹️ Đóng</button>` : ''}
              ${s.status === 'CLOSED' ? `<span class="badge badge-closed">Đã đóng</span>` : ''}
              <button class="btn btn-trash btn-sm" onclick="event.stopPropagation(); deleteSurvey(${s.id},'${s.title.replace(/'/g, "\\'")}')" title="Xóa khảo sát"><svg class="trash-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2v2H2v2h1v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6h1V4h-4V2h-2v2H9V2H6zm7 5v9h-2V7h2zM9 2V4h6V2H9z"/></svg></button>
            </div>
          </div>
        `).join('')}
      </div>
      <p style="color:var(--text-muted);font-size:12px;margin-top:14px">💡 <strong>Mẹo:</strong> Nhấp đúp (Double-click) vào thẻ khảo sát để chỉnh sửa câu hỏi & thông tin; nhấn nút <strong>🗑️</strong> để xóa khảo sát.</p>
    `;
    setPageContent(html);
  } catch (e) { toast(e.message, 'error'); }
}

let editQuestionCount = 0;

async function openEditSurveyModal(id) {
  showModal('✏️ Sửa chiến dịch khảo sát', '<div class="loading-spinner"><div class="spinner"></div></div>', true);
  try {
    const [survey, products, customers] = await Promise.all([
      api('GET', `/api/manager/surveys/${id}`),
      api('GET', '/api/products').catch(() => []),
      api('GET', '/api/manager/customers?status=ACTIVE').catch(() => [])
    ]);

    const targetProductIds = new Set((survey.target_product_ids || []).map(Number));
    const prodChecks = products.map(p => `
      <label class="survey-option-label" style="font-size:12px">
        <input type="checkbox" name="esv-product" value="${p.id}" ${targetProductIds.has(Number(p.id)) ? 'checked' : ''} style="accent-color:var(--rose-500)">
        <span>${escapeHtml(p.name)} <span style="color:var(--text-muted);font-size:11px">${p.launch_status === 'UPCOMING' ? '⏳ Sắp ra mắt' : '✅ Chính thức'}</span></span>
      </label>
    `).join('');

    const recipientIds = new Set((survey.recipient_customer_ids || []).map(Number));
    const customerChecks = customers.map(c => `
      <label class="survey-option-label" style="font-size:12px">
        <input type="checkbox" name="esv-recipient" value="${c.customer_id}" ${recipientIds.has(Number(c.customer_id)) ? 'checked' : ''} style="accent-color:var(--rose-500)">
        <span>${escapeHtml(c.full_name)} <span style="color:var(--text-muted)">@${escapeHtml(c.username)}</span></span>
      </label>
    `).join('');

    const startDateVal = survey.start_date ? String(survey.start_date).slice(0, 10) : '';
    const endDateVal = survey.end_date ? String(survey.end_date).slice(0, 10) : '';

    const modalHtml = `
      <div class="form-group">
        <label>Tiêu đề khảo sát *</label>
        <input id="esv-title" value="${escapeHtml(survey.title || '')}" placeholder="Tiêu đề khảo sát">
      </div>
      
      <div class="form-group">
        <label>Sản phẩm liên quan * <span style="font-size:11px;color:var(--text-muted);font-weight:400">(chọn tối thiểu 1)</span></label>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:12px;color:var(--text-muted)">Chọn các sản phẩm cho chiến dịch khảo sát này.</span>
          <button type="button" class="btn btn-secondary btn-sm" onclick="toggleAllEditSurveyProducts()">Chọn/Bỏ tất cả</button>
        </div>
        <div style="max-height:160px;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${prodChecks || '<p style="font-size:12px;color:var(--text-muted)">Chưa có sản phẩm nào.</p>'}
        </div>
      </div>

      <div class="form-row">
        <div class="form-group"><label>Ngày bắt đầu</label><input id="esv-start" type="date" value="${startDateVal}"></div>
        <div class="form-group"><label>Ngày kết thúc</label><input id="esv-end" type="date" value="${endDateVal}"></div>
      </div>

      <div class="form-group">
        <label>Trạng thái chiến dịch</label>
        <select id="esv-status">
          <option value="DRAFT" ${survey.status === 'DRAFT' ? 'selected' : ''}>📝 Lưu nháp (DRAFT)</option>
          <option value="ACTIVE" ${survey.status === 'ACTIVE' ? 'selected' : ''}>🟢 Đang hoạt động (ACTIVE)</option>
          <option value="CLOSED" ${survey.status === 'CLOSED' ? 'selected' : ''}>🔴 Đã đóng (CLOSED)</option>
        </select>
      </div>

      <div class="form-group">
        <label>Mô tả</label>
        <textarea id="esv-desc" placeholder="Mô tả mục tiêu chiến dịch khảo sát...">${escapeHtml(survey.description || '')}</textarea>
      </div>

      <div class="form-group">
        <label>Gửi đến tài khoản khách hàng</label>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:12px;color:var(--text-muted)">Danh sách người nhận khảo sát.</span>
          <button type="button" class="btn btn-secondary btn-sm" onclick="toggleAllEditSurveyRecipients()">Chọn/Bỏ tất cả</button>
        </div>
        <div style="max-height:160px;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${customerChecks || '<p style="font-size:12px;color:var(--text-muted)">Chưa có khách hàng hoạt động.</p>'}
        </div>
      </div>

      <div style="border-top:1px solid var(--border);margin:8px 0;padding-top:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <strong style="font-size:14px">📝 Danh sách câu hỏi (${(survey.questions || []).length} câu)</strong>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addEditSurveyQuestion()">➕ Thêm câu hỏi</button>
        </div>
        <div id="edit-questions-container" style="display:flex;flex-direction:column;gap:12px"></div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Hủy</button>
        <button type="button" class="btn btn-primary" onclick="updateSurvey(${id})">💾 Lưu thay đổi</button>
      </div>
    `;

    document.getElementById('modal-body').innerHTML = modalHtml;
    editQuestionCount = 0;

    if (survey.questions && survey.questions.length > 0) {
      survey.questions.forEach(q => addEditSurveyQuestion(q));
    } else {
      addEditSurveyQuestion();
    }
  } catch (e) {
    document.getElementById('modal-body').innerHTML = `<p class="error-msg">${escapeHtml(e.message)}</p>`;
  }
}

function addEditSurveyQuestion(q = null) {
  editQuestionCount++;
  const container = document.getElementById('edit-questions-container');
  if (!container) return;
  const count = editQuestionCount;
  const qText = q ? q.question_text || '' : '';
  const qType = q ? q.question_type || 'RATING' : 'SINGLE_CHOICE';
  const qOptions = q && Array.isArray(q.options) ? q.options.join(', ') : (q && q.options ? String(q.options) : '');

  const div = document.createElement('div');
  div.id = `eq-block-${count}`;
  div.style.cssText = 'background:var(--bg-card-solid);border:1px solid var(--border);border-radius:10px;padding:14px';
  div.innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:10px">
      <input placeholder="Nội dung câu hỏi ${count}..." id="eq-text-${count}" value="${escapeHtml(qText)}" style="flex:1">
      <select id="eq-type-${count}" onchange="toggleEditOptionsField(${count})" style="width:160px">
        <option value="SINGLE_CHOICE" ${qType === 'SINGLE_CHOICE' ? 'selected' : ''}>Một lựa chọn</option>
        <option value="MULTI_CHOICE" ${qType === 'MULTI_CHOICE' ? 'selected' : ''}>Nhiều lựa chọn</option>
        <option value="RATING" ${qType === 'RATING' ? 'selected' : ''}>Đánh giá sao</option>
        <option value="TEXT" ${qType === 'TEXT' ? 'selected' : ''}>Nhập văn bản</option>
      </select>
      <button type="button" class="btn btn-danger btn-sm btn-icon" onclick="removeEditQuestion(${count})">✕</button>
    </div>
    <div id="eq-options-wrap-${count}" style="${(qType === 'RATING' || qType === 'TEXT') ? 'display:none' : 'display:block'}">
      <input placeholder="Các lựa chọn, phân tách bằng dấu phẩy. VD: Lựa chọn A, Lựa chọn B, Lựa chọn C" id="eq-options-${count}" value="${escapeHtml(qOptions)}">
    </div>
  `;
  container.appendChild(div);
}

function removeEditQuestion(n) {
  const el = document.getElementById(`eq-block-${n}`);
  if (el) el.remove();
}

function toggleEditOptionsField(n) {
  const type = document.getElementById(`eq-type-${n}`)?.value;
  const wrap = document.getElementById(`eq-options-wrap-${n}`);
  if (wrap) wrap.style.display = (type === 'RATING' || type === 'TEXT') ? 'none' : 'block';
}

function toggleAllEditSurveyRecipients() {
  const boxes = [...document.querySelectorAll('input[name="esv-recipient"]')];
  const shouldCheck = boxes.some(b => !b.checked);
  boxes.forEach(b => { b.checked = shouldCheck; });
}

function toggleAllEditSurveyProducts() {
  const boxes = [...document.querySelectorAll('input[name="esv-product"]')];
  const shouldCheck = boxes.some(b => !b.checked);
  boxes.forEach(b => { b.checked = shouldCheck; });
}

async function updateSurvey(id) {
  const questions = [];
  document.querySelectorAll('[id^="eq-block-"]').forEach((block) => {
    const n = block.id.replace('eq-block-', '');
    const text = document.getElementById(`eq-text-${n}`)?.value.trim();
    const type = document.getElementById(`eq-type-${n}`)?.value;
    const optionsRaw = document.getElementById(`eq-options-${n}`)?.value || '';
    if (!text) return;
    const options = (type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE')
      ? optionsRaw.split(',').map(o => o.trim()).filter(Boolean) : null;
    questions.push({ question_text: text, question_type: type, options });
  });

  const target_product_ids = [...document.querySelectorAll('input[name="esv-product"]:checked')]
    .map(el => Number(el.value))
    .filter(Boolean);
  if (target_product_ids.length === 0) {
    toast('Vui lòng chọn ít nhất một sản phẩm cho chiến dịch khảo sát', 'error');
    return;
  }

  const title = document.getElementById('esv-title')?.value.trim();
  if (!title) {
    toast('Tiêu đề khảo sát không được để trống', 'error');
    return;
  }

  const recipient_customer_ids = [...document.querySelectorAll('input[name="esv-recipient"]:checked')]
    .map(el => Number(el.value))
    .filter(Boolean);

  try {
    await api('PUT', `/api/manager/surveys/${id}`, {
      title,
      description: document.getElementById('esv-desc')?.value.trim() || '',
      target_product_ids,
      start_date: document.getElementById('esv-start')?.value || null,
      end_date: document.getElementById('esv-end')?.value || null,
      status: document.getElementById('esv-status')?.value || 'DRAFT',
      questions,
      recipient_customer_ids
    });

    toast('Cập nhật chiến dịch khảo sát thành công!', 'success');
    closeModal();
    renderManagerSurveys();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteSurvey(id, title) {
  if (!confirm(`Xác nhận XÓA chiến dịch khảo sát "${title}"?\n\nToàn bộ dữ liệu câu hỏi, người nhận và kết quả khảo sát sẽ bị xóa hoàn toàn.`)) return;
  try {
    const res = await api('DELETE', `/api/manager/surveys/${id}`);
    toast(res.message || 'Đã xóa khảo sát thành công!', 'success');
    renderManagerSurveys();
  } catch (e) { toast(e.message, 'error'); }
}


async function openCreateSurveyModal() {
  const products = await api('GET', '/api/products').catch(() => []);
  const customers = await api('GET', '/api/manager/customers?status=ACTIVE').catch(() => []);
  const prodChecks = products.map(p => `
    <label class="survey-option-label" style="font-size:12px">
      <input type="checkbox" name="sv-product" value="${p.id}" style="accent-color:var(--rose-500)">
      <span>${p.name} <span style="color:var(--text-muted);font-size:11px">${p.launch_status === 'UPCOMING' ? '⏳ Sắp ra mắt' : '✅ Chính thức'}</span></span>
    </label>
  `).join('');
  const customerChecks = customers.map(c => `
    <label class="survey-option-label" style="font-size:12px">
      <input type="checkbox" name="sv-recipient" value="${c.customer_id}" checked style="accent-color:var(--rose-500)">
      <span>${c.full_name} <span style="color:var(--text-muted)">@${c.username}</span></span>
    </label>
  `).join('');

  showModal('➕ Tạo chiến dịch khảo sát mới', `
    <div class="form-group"><label>Tiêu đề khảo sát *</label><input id="sv-title" placeholder="VD: Khảo sát thị hiếu Son môi Hè 2026"></div>
    <div class="form-group">
      <label>Sản phẩm liên quan * <span style="font-size:11px;color:var(--text-muted);font-weight:400">(chọn tối thiểu 1)</span></label>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:12px;color:var(--text-muted)">Chọn các sản phẩm cho chiến dịch khảo sát này.</span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="toggleAllSurveyProducts()">Chọn/Bỏ tất cả</button>
      </div>
      <div style="max-height:160px;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${prodChecks || '<p style="font-size:12px;color:var(--text-muted)">Chưa có sản phẩm nào.</p>'}
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Ngày bắt đầu</label><input id="sv-start" type="date"></div>
      <div class="form-group"><label>Ngày kết thúc</label><input id="sv-end" type="date"></div>
    </div>
    <div class="form-group"><label>Mô tả</label><textarea id="sv-desc" placeholder="Mô tả mục tiêu chiến dịch khảo sát..."></textarea></div>

    <div class="form-group">
      <label>Gửi đến tài khoản khách hàng</label>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:12px;color:var(--text-muted)">Mặc định chọn toàn bộ khách hàng đang hoạt động.</span>
        <button type="button" class="btn btn-secondary btn-sm" onclick="toggleAllSurveyRecipients()">Chọn/Bỏ tất cả</button>
      </div>
      <div style="max-height:180px;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${customerChecks || '<p style="font-size:12px;color:var(--text-muted)">Chưa có khách hàng hoạt động.</p>'}
      </div>
    </div>

    <div style="border-top:1px solid var(--border);margin:8px 0;padding-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <strong style="font-size:14px">📝 Danh sách câu hỏi</strong>
        <button class="btn btn-secondary btn-sm" onclick="addSurveyQuestion()">➕ Thêm câu hỏi</button>
      </div>
      <div id="questions-container" style="display:flex;flex-direction:column;gap:12px"></div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
      <button class="btn btn-purple" onclick="createSurvey('DRAFT')">💾 Lưu nháp</button>
      <button class="btn btn-primary" onclick="createSurvey('ACTIVE')">▶️ Tạo & Kích hoạt</button>
    </div>
  `, true);

  addSurveyQuestion();
}

let questionCount = 0;
function addSurveyQuestion() {
  questionCount++;
  const container = document.getElementById('questions-container');
  if (!container) return;
  const div = document.createElement('div');
  div.id = `q-block-${questionCount}`;
  div.style.cssText = 'background:var(--bg-card-solid);border:1px solid var(--border);border-radius:10px;padding:14px';
  div.innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:10px">
      <input placeholder="Nội dung câu hỏi ${questionCount}..." id="q-text-${questionCount}" style="flex:1">
      <select id="q-type-${questionCount}" onchange="toggleOptionsField(${questionCount})" style="width:160px">
        <option value="SINGLE_CHOICE">Một lựa chọn</option>
        <option value="MULTI_CHOICE">Nhiều lựa chọn</option>
        <option value="RATING">Đánh giá sao</option>
        <option value="TEXT">Nhập văn bản</option>
      </select>
      <button class="btn btn-danger btn-sm btn-icon" onclick="removeQuestion(${questionCount})">✕</button>
    </div>
    <div id="q-options-wrap-${questionCount}">
      <input placeholder="Các lựa chọn, phân tách bằng dấu phẩy. VD: Lựa chọn A, Lựa chọn B, Lựa chọn C" id="q-options-${questionCount}">
    </div>
  `;
  container.appendChild(div);
}

function removeQuestion(n) {
  const el = document.getElementById(`q-block-${n}`);
  if (el) el.remove();
}

function toggleOptionsField(n) {
  const type = document.getElementById(`q-type-${n}`).value;
  const wrap = document.getElementById(`q-options-wrap-${n}`);
  if (wrap) wrap.style.display = (type === 'RATING' || type === 'TEXT') ? 'none' : 'block';
}

function toggleAllSurveyRecipients() {
  const boxes = [...document.querySelectorAll('input[name="sv-recipient"]')];
  const shouldCheck = boxes.some(b => !b.checked);
  boxes.forEach(b => { b.checked = shouldCheck; });
}

function toggleAllSurveyProducts() {
  const boxes = [...document.querySelectorAll('input[name="sv-product"]')];
  const shouldCheck = boxes.some(b => !b.checked);
  boxes.forEach(b => { b.checked = shouldCheck; });
}

async function createSurvey(status) {
  const questions = [];
  document.querySelectorAll('[id^="q-block-"]').forEach((block) => {
    const n = block.id.replace('q-block-', '');
    const text = document.getElementById(`q-text-${n}`)?.value.trim();
    const type = document.getElementById(`q-type-${n}`)?.value;
    const optionsRaw = document.getElementById(`q-options-${n}`)?.value || '';
    if (!text) return;
    const options = (type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE')
      ? optionsRaw.split(',').map(o => o.trim()).filter(Boolean) : null;
    questions.push({ question_text: text, question_type: type, options });
  });

  try {
    const target_product_ids = [...document.querySelectorAll('input[name="sv-product"]:checked')]
      .map(el => Number(el.value))
      .filter(Boolean);
    if (target_product_ids.length === 0) {
      toast('Vui lòng chọn ít nhất một sản phẩm cho chiến dịch khảo sát', 'error');
      return;
    }
    const recipient_customer_ids = [...document.querySelectorAll('input[name="sv-recipient"]:checked')]
      .map(el => Number(el.value))
      .filter(Boolean);
    const result = await api('POST', '/api/manager/surveys', {
      title: document.getElementById('sv-title').value.trim(),
      description: document.getElementById('sv-desc').value.trim(),
      target_product_ids,
      start_date: document.getElementById('sv-start').value || null,
      end_date: document.getElementById('sv-end').value || null,
      questions,
      recipient_customer_ids,
    });

    if (status === 'ACTIVE') {
      await api('POST', `/api/manager/surveys/${result.id}/send`);
    }
    toast('Tạo chiến dịch khảo sát thành công!', 'success');
    questionCount = 0;
    closeModal();
    renderManagerSurveys();
  } catch (e) { toast(e.message, 'error'); }
}

async function updateSurveyStatus(id, status) {
  try {
    await api('PUT', `/api/manager/surveys/${id}/status`, { status });
    toast(`Đã cập nhật trạng thái khảo sát`, 'success');
    renderManagerSurveys();
  } catch (e) { toast(e.message, 'error'); }
}

async function sendSurvey(id, title) {
  if (!confirm(`Xác nhận GỬI khảo sát "${title}" đến người nhận?\n\nHành động này sẽ kích hoạt khảo sát và cập nhật thời gian gửi cho toàn bộ người nhận đã chọn.`)) return;
  try {
    const result = await api('POST', `/api/manager/surveys/${id}/send`);
    toast(`✅ ${result.message}`, 'success');
    renderManagerSurveys();
  } catch (e) { toast(e.message, 'error'); }
}

async function manageSurveyRecipients(id, title) {
  showModal(`📤 Người nhận: ${title}`, `<div class="loading-spinner"><div class="spinner"></div></div>`, true);
  try {
    const rows = await api('GET', `/api/manager/surveys/${id}/recipients`);
    const body = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:13px;color:var(--text-secondary)">
          Đã gửi: <strong style="color:var(--rose-300)">${rows.filter(r => Number(r.is_recipient) === 1).length}</strong> /
          ${rows.length} khách hàng
        </div>
        <button class="btn btn-secondary btn-sm" onclick="toggleModalRecipients()">Chọn/Bỏ tất cả</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:360px;overflow:auto">
        ${rows.map(r => `
          <label class="survey-option-label" style="font-size:12px;opacity:${r.status === 'LOCKED' ? 0.55 : 1}">
            <input type="checkbox" name="modal-recipient" value="${r.customer_id}" ${Number(r.is_recipient) === 1 ? 'checked' : ''} ${Number(r.already_submitted) === 1 ? 'disabled' : ''} style="accent-color:var(--rose-500)">
            <span>
              ${r.full_name} <span style="color:var(--text-muted)">@${r.username}</span>
              ${Number(r.already_submitted) === 1 ? '<span class="badge badge-active" style="margin-left:6px">Đã làm</span>' : ''}
            </span>
          </label>
        `).join('')}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
        <button class="btn btn-primary" onclick="saveSurveyRecipients(${id})">💾 Lưu người nhận</button>
      </div>
    `;
    document.getElementById('modal-body').innerHTML = body;
  } catch (e) {
    document.getElementById('modal-body').innerHTML = `<p class="error-msg">${e.message}</p>`;
  }
}

function toggleModalRecipients() {
  const boxes = [...document.querySelectorAll('input[name="modal-recipient"]:not(:disabled)')];
  const shouldCheck = boxes.some(b => !b.checked);
  boxes.forEach(b => { b.checked = shouldCheck; });
}

async function saveSurveyRecipients(id) {
  try {
    const customer_ids = [...document.querySelectorAll('input[name="modal-recipient"]:checked')]
      .map(el => Number(el.value))
      .filter(Boolean);
    const result = await api('PUT', `/api/manager/surveys/${id}/recipients`, { customer_ids });
    toast(`${result.message} (${result.recipient_count} người nhận)`, 'success');
    closeModal();
    renderManagerSurveys();
  } catch (e) { toast(e.message, 'error'); }
}

async function viewSurveyResults(id, title) {
  showModal(`📊 Kết quả: ${title}`, `<div class="loading-spinner"><div class="spinner"></div></div>`, true);
  try {
    const data = await api('GET', `/api/manager/surveys/${id}/results`);
    const { results, total_respondents } = data;

    let body = `<div style="margin-bottom:16px"><strong>👥 Tổng số người tham gia: <span style="color:var(--rose-300)">${total_respondents}</span></strong></div>`;

    results.forEach((r, i) => {
      body += `<div style="background:var(--bg-card-solid);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;margin-bottom:12px;color:var(--text-primary)">
          ${i + 1}. ${r.question_text}
          <span style="color:var(--text-muted);font-weight:400;font-size:11px">&nbsp;(${r.total_responses} phản hồi)</span>
        </div>`;

      if (r.question_type === 'RATING') {
        body += `<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
          <div style="font-size:28px;font-weight:800;background:var(--grad-gold);-webkit-background-clip:text;-webkit-text-fill-color:transparent">${r.average || '—'}</div>
          <div style="font-size:18px;color:#fbbf24">${r.average ? '★'.repeat(Math.round(r.average)) + '☆'.repeat(5 - Math.round(r.average)) : ''}</div>
          <div style="font-size:12px;color:var(--text-muted)">Điểm trung bình</div>
        </div>`;
        if (r.distribution) {
          r.distribution.forEach(d => {
            const pct = r.total_responses ? ((d.count / r.total_responses) * 100).toFixed(0) : 0;
            body += `<div class="result-bar-wrap">
              <div class="result-bar-label"><span>⭐ ${d.value} sao (${d.count})</span><span>${pct}%</span></div>
              <div class="result-bar"><div class="result-bar-fill" style="width:${pct}%;background:var(--grad-gold)"></div></div>
            </div>`;
          });
        }
      } else if (r.distribution) {
        r.distribution.forEach(d => {
          body += `<div class="result-bar-wrap">
            <div class="result-bar-label"><span>${d.label} (${d.count})</span><span>${d.percent}%</span></div>
            <div class="result-bar"><div class="result-bar-fill" style="width:${d.percent}%"></div></div>
          </div>`;
        });
      } else if (r.text_answers && r.text_answers.length > 0) {
        body += `<div style="display:flex;flex-direction:column;gap:6px">`;
        r.text_answers.forEach(ans => {
          body += `<div style="background:rgba(244,63,94,0.06);border-left:3px solid var(--rose-500);padding:8px 12px;border-radius:0 8px 8px 0;font-size:13px;color:var(--text-secondary)">"${ans}"</div>`;
        });
        body += `</div>`;
      }
      body += `</div>`;
    });

    if (results.length === 0) body += `<div class="page-empty"><div class="empty-icon">📊</div><p>Chưa có dữ liệu kết quả</p></div>`;

    document.getElementById('modal-body').innerHTML = body;
  } catch (e) {
    document.getElementById('modal-body').innerHTML = `<p class="error-msg">${e.message}</p>`;
  }
}

// ========== MANAGER: FEEDBACKS ==========
async function renderManagerFeedbacks() {
  setPageHeader('💬 Phản hồi & Đánh giá', 'Tiếp nhận và phản hồi đánh giá từ khách hàng');
  showLoading();
  await fetchAndRenderFeedbacks({});
}

async function fetchAndRenderFeedbacks(filters) {
  try {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
    const feedbacks = await api('GET', `/api/manager/feedbacks?${params}`);

    const html = `
      <div class="filter-bar">
        <select id="fb-rating">
          <option value="">Tất cả số sao</option>
          ${[5, 4, 3, 2, 1].map(n => `<option value="${n}" ${filters.rating == n ? 'selected' : ''}>⭐ ${n} sao</option>`).join('')}
        </select>
        <select id="fb-status">
          <option value="">Tất cả</option>
          <option value="PENDING" ${filters.status === 'PENDING' ? 'selected' : ''}>🕐 Chờ phản hồi</option>
          <option value="REPLIED" ${filters.status === 'REPLIED' ? 'selected' : ''}>✅ Đã phản hồi</option>
        </select>
        <button class="btn btn-primary" onclick="filterFeedbacks()">🔍 Lọc</button>
        <button class="btn btn-secondary" onclick="renderManagerFeedbacks()">↺ Reset</button>
      </div>

      <div class="feedback-list">
        ${feedbacks.length === 0 ? `<div class="page-empty"><div class="empty-icon">💬</div><p>Không có phản hồi nào</p></div>` : feedbacks.map(f => `
          <div class="feedback-card">
            <div class="feedback-header">
              <div class="feedback-meta">
                <div class="feedback-customer">👩 ${f.customer_name}</div>
                <div class="feedback-product">💄 ${f.product_name}</div>
              </div>
              <div style="display:flex;align-items:center;gap:10px">
                <div class="stars" style="color:#fbbf24">${renderStars(f.rating)}</div>
                ${f.status === 'PENDING'
        ? `<span class="badge badge-pending">🕐 Chờ phản hồi</span>`
        : `<span class="badge badge-replied">✅ Đã phản hồi</span>`}
                <span style="font-size:11px;color:var(--text-muted)">${formatDateTime(f.created_at)}</span>
              </div>
            </div>
            <p class="feedback-content">${f.content || '(Không có nội dung)'}</p>
            ${f.reply_content ? `
              <div class="feedback-reply">
                <div class="feedback-reply-label">💬 Phản hồi của bộ phận CSKH:</div>
                <div class="feedback-reply-text">${f.reply_content}</div>
              </div>
            ` : `
              <div style="display:flex;gap:8px;margin-top:8px">
                <textarea id="reply-${f.id}" placeholder="Nhập nội dung phản hồi cho khách hàng..." style="flex:1;min-height:60px"></textarea>
                <button class="btn btn-success btn-sm" onclick="replyFeedback(${f.id})">📤 Gửi</button>
              </div>
            `}
          </div>
        `).join('')}
      </div>
      <p style="color:var(--text-muted);font-size:12px;margin-top:12px">Hiển thị ${feedbacks.length} phản hồi</p>
    `;
    setPageContent(html);
  } catch (e) { toast(e.message, 'error'); }
}

function filterFeedbacks() {
  fetchAndRenderFeedbacks({
    rating: document.getElementById('fb-rating').value,
    status: document.getElementById('fb-status').value,
  });
}

async function replyFeedback(id) {
  const content = document.getElementById(`reply-${id}`)?.value.trim();
  if (!content) { toast('Vui lòng nhập nội dung phản hồi', 'error'); return; }
  try {
    await api('PUT', `/api/manager/feedbacks/${id}/reply`, { reply_content: content });
    toast('Đã gửi phản hồi thành công!', 'success');
    renderManagerFeedbacks();
  } catch (e) { toast(e.message, 'error'); }
}
