/* ============================================================
   manager.js – Manager Module: CRM Dashboard, Customers, Surveys, Feedbacks
   ============================================================ */

let chartInstances = {};
let analyticsFilterState = { from: '', to: '' };

function normalizeBeautyPreferenceLabel(preference) {
  const value = String(preference || '').trim();
  return (value === 'Skincare cơ bản' || value === 'Chăm sóc da')
    ? 'Chăm sóc da (Skincare)'
    : value;
}

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

function buildPreferenceAnalysis(customerProfiles = []) {
  const ageGroups = ['Dưới 18', '18-24', '25-34', '35-44', '45+'];
  const standardSkins = ['Da dầu', 'Da hỗn hợp', 'Da nhạy cảm', 'Da thường', 'Da khô'];
  const skinCounts = Object.fromEntries(standardSkins.map(skin => [skin, 0]));

  customerProfiles.forEach(customer => {
    if (customer.skin_type && skinCounts[customer.skin_type] !== undefined) skinCounts[customer.skin_type]++;
  });
  const skinTypes = [...standardSkins].sort((a, b) => skinCounts[b] - skinCounts[a]);
  const classifyAge = age => {
    if (age === null || age === undefined || isNaN(age)) return null;
    const value = Number(age);
    if (value < 18) return 'Dưới 18';
    if (value <= 24) return '18-24';
    if (value <= 34) return '25-34';
    if (value <= 44) return '35-44';
    return '45+';
  };
  const preferenceSet = new Set();
  customerProfiles.forEach(customer => {
    (customer.beauty_preferences || '').split(',').map(item => item.trim()).filter(Boolean)
      .forEach(item => preferenceSet.add(normalizeBeautyPreferenceLabel(item)));
  });
  const standardOrder = ['Chăm sóc da (Skincare)', 'Trang điểm', 'Chống lão hóa', 'Trị mụn', 'Dưỡng ẩm', 'Organic'];
  const preferences = [
    ...standardOrder.filter(item => preferenceSet.has(item)),
    ...[...preferenceSet].filter(item => !standardOrder.includes(item))
  ];
  if (!preferences.length) preferences.push(...standardOrder);

  const byAge = {};
  const bySkin = {};
  preferences.forEach(preference => {
    byAge[preference] = Object.fromEntries(ageGroups.map(group => [group, 0]));
    bySkin[preference] = Object.fromEntries(skinTypes.map(skin => [skin, 0]));
  });
  customerProfiles.forEach(customer => {
    const ageGroup = classifyAge(customer.age);
    const skinType = customer.skin_type;
    (customer.beauty_preferences || '').split(',').map(item => item.trim()).filter(Boolean).forEach(item => {
      const preference = normalizeBeautyPreferenceLabel(item);
      if (byAge[preference] && ageGroup && byAge[preference][ageGroup] !== undefined) byAge[preference][ageGroup]++;
      if (bySkin[preference] && skinType && bySkin[preference][skinType] !== undefined) bySkin[preference][skinType]++;
    });
  });
  return { ageGroups, skinTypes, preferences, byAge, bySkin };
}

function renderPreferenceAnalysisCharts(analysis) {
  const { ageGroups, skinTypes, preferences, byAge, bySkin } = analysis;
  const palette = ['#10b981', '#f43f5e', '#8b5cf6', '#fbbf24', '#3b82f6', '#ec4899', '#14b8a6', '#f97316'];
  const createChart = (id, labels, matrix) => {
    destroyChart(id);
    const canvas = document.getElementById(`chart-${id}`);
    if (!canvas) return;
    chartInstances[id] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: preferences.map((preference, index) => ({
          label: preference,
          data: labels.map(label => matrix[preference][label] || 0),
          backgroundColor: palette[index % palette.length],
          borderRadius: 4,
          maxBarThickness: 55
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 } },
          tooltip: {
            mode: 'index',
            intersect: false,
            filter: tooltipItem => tooltipItem.raw > 0,
            callbacks: {
              footer: tooltipItems => 'Tổng cộng: ' + (tooltipItems || []).reduce((sum, item) => sum + (Number(item.raw) || 0), 0) + ' lượt sở thích'
            }
          }
        },
        scales: {
          x: { stacked: true, grid: { color: 'rgba(203,213,225,0.05)' }, ticks: { color: '#94a3b8', font: { size: 11 } } },
          y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(203,213,225,0.05)' }, ticks: { color: '#94a3b8', font: { size: 11 }, precision: 0, stepSize: 1 } }
        }
      }
    });
  };
  createChart('pref-age', ageGroups, byAge);
  createChart('pref-skin', skinTypes, bySkin);
}

// ========== MANAGER: DASHBOARD ==========
async function renderManagerDashboard() {
  setPageHeader('📊 Dashboard CRM', 'Tổng quan & phân tích thị hiếu khách hàng làm đẹp');
  const query = analyticsQuery();
  showLoading();
  try {
    const data = await api('GET', `/api/manager/analytics${query}`);
    const { ageGroups, skinTypes, genderGroups, beautyPrefs, newCustomersByMonth, customerProfiles, stats } = data;
    const preferenceAnalysis = buildPreferenceAnalysis(customerProfiles);

    const html = `
      ${analyticsFilterHtml('renderManagerDashboard')}
      <div class="stats-grid stats-grid-6">
        <div class="stat-card">
          <div class="stat-icon">👩</div>
          <div class="stat-value">${stats.totalCustomers}</div>
          <div class="stat-label">Tổng khách hàng</div>
        </div>
        <div class="stat-card warning clickable" style="border-left: 4px solid #f59e0b;" 
             onclick="navigateToReplyFeedbacks({ tab: 'PENDING' })" 
             title="Nhấp để xem danh sách phản hồi chờ xử lý">
          <div class="stat-icon">⚠️</div>
          <div class="stat-value" style="color:#d97706; display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px;">
            <span title="Chờ phản hồi">${stats.pendingFeedbacks}</span>
            ${stats.negativeFeedbacks > 0 ? `
              <small class="badge-interactive" style="font-size:11px;color:#ef4444;font-weight:700;padding:2px 8px;border-radius:12px;background:rgba(239,68,68,0.12)" 
                     onclick="event.stopPropagation(); navigateToReplyFeedbacks({ tab: 'NEGATIVE' })" 
                     title="Nhấp để lọc phản hồi tiêu cực (1-2★)">
                (${stats.negativeFeedbacks} tiêu cực)
              </small>` : ''}
          </div>
          <div class="stat-label">Phản hồi chờ xử lý</div>
        </div>
        <div class="stat-card gold">
          <div class="stat-icon">⭐</div>
          <div class="stat-value">${(stats.avgRating !== null && stats.avgRating !== undefined && !isNaN(Number(stats.avgRating)) && Number(stats.avgRating) > 0) ? Number(stats.avgRating).toFixed(1) : (stats.avgRating || '—')}</div>
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

      <div class="charts-grid-2col" style="margin-top:20px">
        <div class="chart-card">
          <div class="chart-title">🎯 Sở thích theo độ tuổi</div>
          <div class="chart-container" style="height:260px"><canvas id="chart-pref-age"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">🧴 Sở thích theo loại da</div>
          <div class="chart-container" style="height:260px"><canvas id="chart-pref-skin"></canvas></div>
        </div>
      </div>

      <div class="chart-card" style="margin-top:20px">
        <div class="chart-title">📈 Xu hướng điểm đánh giá theo thời gian (Rating Trend)</div>
        <div class="chart-container" style="height:240px"><canvas id="chart-rating-trend"></canvas></div>
      </div>
    `;
    setPageContent(html);

    // Render charts
    setTimeout(() => {
      const gemPalette = ['#10b981', '#34d399', '#60a5fa', '#a855f7', '#f43f5e', '#fbbf24', '#fb923c', '#e879f9'];
      const agePalette = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];
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
          datasets: [{ data: ageGroups.map(g => g.count), backgroundColor: agePalette, borderColor: 'transparent', borderWidth: 0 }]
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
      // Biểu đồ xu hướng điểm đánh giá theo thời gian
      const trendEl = document.getElementById('chart-rating-trend');
      if (trendEl) {
        destroyChart('rating-trend');
        const trendData = (data.ratingTrendByMonth && data.ratingTrendByMonth.length > 0)
          ? data.ratingTrendByMonth
          : [{ month: 'Chưa có dữ liệu', avg_rating: 0, count: 0 }];
        chartInstances['rating-trend'] = new Chart(trendEl, {
          type: 'line',
          data: {
            labels: trendData.map(m => m.month),
            datasets: [
              {
                label: 'Điểm đánh giá TB (★)',
                data: trendData.map(m => m.avg_rating),
                borderColor: '#fbbf24',
                backgroundColor: 'rgba(251, 191, 36, 0.15)',
                borderWidth: 2,
                pointBackgroundColor: '#fbbf24',
                pointRadius: 4,
                fill: true,
                tension: 0.35,
                yAxisID: 'y'
              },
              {
                label: 'Số lượt đánh giá',
                data: data.ratingTrendByMonth.map(m => m.count),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderDash: [4, 4],
                borderWidth: 2,
                pointBackgroundColor: '#10b981',
                pointRadius: 3,
                fill: false,
                tension: 0.2,
                yAxisID: 'y1'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { labels: { color: '#94a3b8', font: { size: 11 } } },
              tooltip: {
                callbacks: {
                  label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw}`
                }
              }
            },
            scales: {
              y: {
                min: 0,
                max: 5,
                grid: { color: 'rgba(203,213,225,0.05)' },
                ticks: { color: '#fbbf24', font: { size: 11 } },
                title: { display: true, text: 'Điểm TB (★)', color: '#fbbf24', font: { size: 10 } }
              },
              y1: {
                position: 'right',
                beginAtZero: true,
                grid: { drawOnChartArea: false },
                ticks: { color: '#10b981', font: { size: 11 }, precision: 0 },
                title: { display: true, text: 'Số lượng', color: '#10b981', font: { size: 10 } }
              },
              x: {
                grid: { color: 'rgba(203,213,225,0.05)' },
                ticks: { color: '#94a3b8', font: { size: 11 } }
              }
            }
          }
        });
      }

      renderPreferenceAnalysisCharts(preferenceAnalysis);
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
      <label style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:6px">Từ ngày <input type="date" id="analytics-from" value="${analyticsFilterState.from}" onchange="${targetRenderFunc}()"></label>
      <label style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:6px">Đến ngày <input type="date" id="analytics-to" value="${analyticsFilterState.to}" onchange="${targetRenderFunc}()"></label>
      <button class="btn btn-primary" onclick="${targetRenderFunc}()">🔍 Áp dụng</button>
      <button class="btn btn-secondary" onclick="resetAnalyticsFilter('${targetRenderFunc}')" title="Xóa bộ lọc ngày về mặc định">↺ Đặt lại</button>

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

function resetAnalyticsFilter(targetRenderFunc = 'renderManagerDashboard') {
  analyticsFilterState = { from: '', to: '' };
  const fromEl = document.getElementById('analytics-from');
  const toEl = document.getElementById('analytics-to');
  if (fromEl) fromEl.value = '';
  if (toEl) toEl.value = '';
  if (targetRenderFunc === 'renderManagerAnalytics' && typeof renderManagerAnalytics === 'function') {
    renderManagerAnalytics();
  } else if (typeof renderManagerDashboard === 'function') {
    renderManagerDashboard();
  }
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
let analyticsProductCategory = '';
let analyticsProductSupplier = '';
let analyticsProductSort = 'COUNT_DESC';
let analyticsProductPage = 1;
const ANALYTICS_PRODUCT_PAGE_SIZE = 5;
let currentSurveyOverview = [];
let analyticsSurveySearch = '';
let analyticsSurveyStatus = 'ALL';

function formatSurveyDuration(startDate, endDate) {
  function toDateStr(d) {
    if (!d) return null;
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return null;
    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const year = dt.getFullYear();
    return `${day}/${month}/${year}`;
  }

  const sStr = toDateStr(startDate);
  const eStr = toDateStr(endDate);

  let isExpired = false;
  if (endDate) {
    const endDt = new Date(endDate);
    endDt.setHours(23, 59, 59, 999);
    if (new Date() > endDt) {
      isExpired = true;
    }
  }

  let text = '';
  if (!sStr && !eStr) {
    text = '<span style="color:var(--text-muted)">Không giới hạn</span>';
  } else if (sStr && eStr) {
    text = `${sStr} - ${eStr}`;
  } else if (sStr) {
    text = `Từ ${sStr}`;
  } else {
    text = `Đến ${eStr}`;
  }

  if (isExpired) {
    text += ` <span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;font-size:10px;padding:2px 6px;margin-left:4px">Hết hạn</span>`;
  }
  return text;
}

async function renderManagerAnalytics() {
  setPageHeader('📈 Phân tích đánh giá & khảo sát', 'Phân tích sâu khách hàng, sở thích làm đẹp và hiệu quả chiến dịch');
  const query = analyticsQuery();
  showLoading();
  try {
    const data = await api('GET', `/api/manager/analytics${query}`);
    const { feedbackByProduct, surveyOverview } = data;
    currentFeedbackProducts = feedbackByProduct || [];
    currentSurveyOverview = surveyOverview || [];

    // Counts cho 5 tab phân tích sản phẩm
    const countAll = feedbackByProduct.length;
    const countHigh = feedbackByProduct.filter(p => p.count > 0 && (Number(p.average) || 0) >= 4.0).length;
    const countNeutral = feedbackByProduct.filter(p => p.count > 0 && (Number(p.average) || 0) >= 3.0 && (Number(p.average) || 0) < 4.0).length;
    const countLow = feedbackByProduct.filter(p => p.count > 0 && (Number(p.average) || 0) < 3.0).length;
    const countUnreplied = feedbackByProduct.filter(p => (p.pending_count || 0) > 0).length;

    const supplierOptions = (data.suppliers || []).map(s => {
      const isInactive = s.status === 'INACTIVE';
      return `<option value="${s.id}" ${analyticsProductSupplier == s.id ? 'selected' : ''}>${escapeHtml(s.name)}${isInactive ? ' (Ngừng hợp tác ✕)' : ''}</option>`;
    }).join('');

    const html = `
      ${analyticsFilterHtml('renderManagerAnalytics')}

      <!-- KHU VỰC XẾP HẠNG & PHÂN TÍCH SẢN PHẨM THEO PHẢN HỒI -->
      <div class="card" style="margin-top:20px">
        <div class="table-card-header">
          <div class="card-title" style="margin-bottom:0">⭐ Xếp hạng & Phân tích sản phẩm theo phản hồi</div>
          <div class="table-toolbar-right" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <input type="text" id="analytics-product-search" placeholder="🔍 Tìm tên sản phẩm..."
                   value="${escapeHtml(analyticsProductSearch)}"
                   oninput="handleAnalyticsProductSearch(this.value)">
            <select id="analytics-product-category" onchange="handleAnalyticsProductCategory(this.value)">
              <option value="">Tất cả danh mục</option>
              ${(data.productCategories || []).map(c => `<option value="${escapeHtml(c)}" ${analyticsProductCategory === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
            <select id="analytics-product-supplier" onchange="handleAnalyticsProductSupplier(this.value)">
              <option value="">Tất cả NCC</option>
              ${supplierOptions}
            </select>
            <select id="analytics-product-sort" onchange="handleAnalyticsProductSort(this.value)">
              <option value="COUNT_DESC" ${analyticsProductSort === 'COUNT_DESC' ? 'selected' : ''}>Nhiều phản hồi nhất</option>
              <option value="RATING_DESC" ${analyticsProductSort === 'RATING_DESC' ? 'selected' : ''}>Điểm cao nhất</option>
              <option value="RATING_ASC" ${analyticsProductSort === 'RATING_ASC' ? 'selected' : ''}>Điểm thấp nhất</option>
            </select>
            <button class="btn btn-secondary" onclick="resetAnalyticsProductFilters()" title="Đặt lại bộ lọc sản phẩm">↺ Reset</button>
          </div>
        </div>

        <!-- Filter tabs -->
        <div class="filter-tabs" id="analytics-product-filter-tabs" style="margin-top:12px;margin-bottom:14px">
          <button id="pill-analytics-all" class="filter-tab-btn ${analyticsProductTab === 'ALL' ? 'active' : ''}" onclick="setAnalyticsProductTab('ALL', event)">
            Tất cả sản phẩm (<span id="count-analytics-all">${countAll}</span>)
          </button>
          <button id="pill-analytics-high" class="filter-tab-btn ${analyticsProductTab === 'HIGH' ? 'active' : ''}" onclick="setAnalyticsProductTab('HIGH', event)">
            ⭐ Đánh giá cao (≥ 4.0★) (<span id="count-analytics-high">${countHigh}</span>)
          </button>
          <button id="pill-analytics-neutral" class="filter-tab-btn ${analyticsProductTab === 'NEUTRAL' ? 'active' : ''}" onclick="setAnalyticsProductTab('NEUTRAL', event)">
            😐 Trung bình / Trung lập (3.0★ - 3.9★) (<span id="count-analytics-neutral">${countNeutral}</span>)
          </button>
          <button id="pill-analytics-low" class="filter-tab-btn ${analyticsProductTab === 'LOW' ? 'active' : ''}" onclick="setAnalyticsProductTab('LOW', event)">
            ⚠️ Sản phẩm cần chú ý (< 3.0★) (<span id="count-analytics-low">${countLow}</span>)
          </button>
          <button id="pill-analytics-unreplied" class="filter-tab-btn ${analyticsProductTab === 'UNREPLIED' ? 'active' : ''}" onclick="setAnalyticsProductTab('UNREPLIED', event)">
            ⏳ Chưa trả lời CSKH (<span id="count-analytics-unreplied">${countUnreplied}</span>)
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
        <div id="analytics-products-pagination"></div>
      </div>

      <!-- HIỆU QUẢ CHIẾN DỊCH KHẢO SÁT -->
      <div class="card" style="margin-top:20px">
        <div class="table-card-header">
          <div class="card-title" style="margin-bottom:0">📋 Hiệu quả chiến dịch khảo sát</div>
          <div class="table-toolbar-right">
            <input type="text" id="analytics-survey-search" placeholder="🔍 Tìm tên khảo sát..."
                   value="${escapeHtml(analyticsSurveySearch)}"
                   oninput="handleAnalyticsSurveySearch(this.value)">
            <select id="analytics-survey-status" onchange="handleAnalyticsSurveyStatus(this.value)">
              <option value="ALL" ${analyticsSurveyStatus === 'ALL' ? 'selected' : ''}>Tất cả trạng thái</option>
              <option value="ACTIVE" ${analyticsSurveyStatus === 'ACTIVE' ? 'selected' : ''}>Đang mở</option>
              <option value="CLOSED" ${analyticsSurveyStatus === 'CLOSED' ? 'selected' : ''}>Đã đóng</option>
            </select>
            <button class="btn btn-secondary btn-sm" onclick="resetAnalyticsSurveyFilters()" title="Đặt lại bộ lọc khảo sát">↺ Đặt lại</button>
          </div>
        </div>

        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>KHẢO SÁT</th>
                <th>SẢN PHẨM LIÊN QUAN</th>
                <th>THỜI GIAN</th>
                <th style="text-align:center">QUY MÔ</th>
                <th>TRẠNG THÁI</th>
                <th style="text-align:center">NGƯỜI NHẬN</th>
                <th style="text-align:center">PHẢN HỒI</th>
                <th style="min-width:140px">TỶ LỆ HOÀN THÀNH</th>
                <th style="text-align:center">HÀNH ĐỘNG</th>
              </tr>
            </thead>
            <tbody id="analytics-surveys-tbody">
              <!-- Rendered via filterAndRenderSurveyOverview -->
            </tbody>
          </table>
        </div>
      </div>
    `;

    setPageContent(html);
    filterAndRenderAnalyticsProducts();
    filterAndRenderSurveyOverview();

  } catch (e) { toast(e.message, 'error'); }
}

function setAnalyticsProductTab(tab, event) {
  analyticsProductTab = tab;
  analyticsProductPage = 1;
  const container = event?.currentTarget?.closest('.filter-tabs');
  if (container) {
    container.querySelectorAll('.filter-tab-btn').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');
  }
  filterAndRenderAnalyticsProducts();
}

function handleAnalyticsProductSearch(val) {
  analyticsProductSearch = val;
  analyticsProductPage = 1;
  filterAndRenderAnalyticsProducts();
}

function handleAnalyticsProductSupplier(val) {
  analyticsProductSupplier = val;
  analyticsProductPage = 1;
  filterAndRenderAnalyticsProducts();
}

function handleAnalyticsProductSort(val) {
  analyticsProductSort = val;
  analyticsProductPage = 1;
  filterAndRenderAnalyticsProducts();
}

function applyAnalyticsProductFilters() {
  const searchEl = document.getElementById('analytics-product-search');
  const catEl = document.getElementById('analytics-product-category');
  const supEl = document.getElementById('analytics-product-supplier');
  const sortEl = document.getElementById('analytics-product-sort');
  if (searchEl) analyticsProductSearch = searchEl.value.trim();
  if (catEl) analyticsProductCategory = catEl.value;
  if (supEl) analyticsProductSupplier = supEl.value;
  if (sortEl) analyticsProductSort = sortEl.value;
  analyticsProductPage = 1;
  filterAndRenderAnalyticsProducts();
}

function resetAnalyticsProductFilters() {
  analyticsProductSearch = '';
  analyticsProductCategory = '';
  analyticsProductSupplier = '';
  analyticsProductSort = 'COUNT_DESC';
  analyticsProductTab = 'ALL';
  analyticsProductPage = 1;

  const searchEl = document.getElementById('analytics-product-search');
  const catEl = document.getElementById('analytics-product-category');
  const supEl = document.getElementById('analytics-product-supplier');
  const sortEl = document.getElementById('analytics-product-sort');
  if (searchEl) searchEl.value = '';
  if (catEl) catEl.value = '';
  if (supEl) supEl.value = '';
  if (sortEl) sortEl.value = 'COUNT_DESC';

  const productTabs = document.getElementById('analytics-product-filter-tabs') || document.querySelector('.card .filter-tabs');
  if (productTabs) {
    productTabs.querySelectorAll('.filter-tab-btn').forEach((btn, idx) => {
      if (idx === 0) btn.classList.add('active');
      else btn.classList.remove('active');
    });
  }

  filterAndRenderAnalyticsProducts();
}

function handleAnalyticsSurveySearch(val) {
  analyticsSurveySearch = val;
  filterAndRenderSurveyOverview();
}

function handleAnalyticsSurveyStatus(val) {
  analyticsSurveyStatus = val;
  filterAndRenderSurveyOverview();
}

function resetAnalyticsSurveyFilters() {
  analyticsSurveySearch = '';
  analyticsSurveyStatus = 'ALL';
  const searchEl = document.getElementById('analytics-survey-search');
  const statusEl = document.getElementById('analytics-survey-status');
  if (searchEl) searchEl.value = '';
  if (statusEl) statusEl.value = 'ALL';
  filterAndRenderSurveyOverview();
}

function filterAndRenderSurveyOverview() {
  let list = currentSurveyOverview || [];
  if (analyticsSurveySearch) {
    const q = analyticsSurveySearch.toLowerCase().trim();
    list = list.filter(s => (s.title || '').toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q));
  }
  if (analyticsSurveyStatus === 'ACTIVE') {
    list = list.filter(s => s.status === 'ACTIVE');
  } else if (analyticsSurveyStatus === 'CLOSED') {
    list = list.filter(s => s.status === 'CLOSED');
  }

  const tbody = document.getElementById('analytics-surveys-tbody');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-muted)">Không có chiến dịch khảo sát nào phù hợp điều kiện lọc</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(s => {
    const pct = s.recipients ? Math.round((s.responses / s.recipients) * 100) : 0;
    const remaining = Math.max(0, (s.recipients || 0) - (s.responses || 0));

    const pCount = s.product_count !== undefined && s.product_count !== null
      ? Number(s.product_count)
      : (s.product_names ? s.product_names.split(',').map(n => n.trim()).filter(Boolean).length : 0);

    let prodBadgesHtml = '<span style="color:var(--text-muted);font-size:12px">Toàn bộ</span>';
    if (pCount > 0) {
      prodBadgesHtml = `<span class="badge" style="background:rgba(59,130,246,0.12);color:#2563eb;font-size:12px;padding:4px 10px;font-weight:600;border:1px solid rgba(59,130,246,0.25);border-radius:6px;display:inline-flex;align-items:center;gap:4px" title="${escapeHtml(s.product_names || '')}">📦 ${pCount} sản phẩm</span>`;
    }

    return `
      <tr>
        <td>
          <div style="font-weight:700;color:var(--text-primary);font-size:13px">${escapeHtml(s.title)}</div>
          ${s.description ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;max-width:240px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(s.description)}</div>` : ''}
        </td>
        <td>${prodBadgesHtml}</td>
        <td>
          <div style="font-size:12px;white-space:nowrap">${formatSurveyDuration(s.start_date, s.end_date)}</div>
        </td>
        <td style="text-align:center">
          <span class="badge" style="background:rgba(139,92,246,0.12);color:#8b5cf6;font-size:11px;padding:3px 8px;font-weight:600">📝 ${s.question_count || 0} câu hỏi</span>
        </td>
        <td>${surveyStatusBadge(s.status)}</td>
        <td style="text-align:center;font-weight:600">${s.recipients || 0}</td>
        <td style="text-align:center">
          <div style="font-weight:700;font-size:13px">${s.responses || 0} đã làm</div>
          <div style="font-size:11px;color:var(--text-muted)">${remaining} chờ</div>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;min-width:65px;height:8px;background:rgba(203,213,225,0.2);border-radius:4px;overflow:hidden">
              <div style="width:${Math.min(pct, 100)}%;height:100%;background:var(--green-600);border-radius:4px"></div>
            </div>
            <span style="font-weight:600;font-size:12px">${pct}%</span>
          </div>
        </td>
        <td style="text-align:center">
          <button class="btn btn-secondary btn-sm" onclick="viewSurveyResults(${s.id},'${escapeHtml(s.title).replace(/'/g, "\\'")}')">📊 Chi tiết</button>
        </td>
      </tr>
    `;
  }).join('');
}

function handleAnalyticsProductCategory(val) {
  analyticsProductCategory = val;
  analyticsProductPage = 1;
  filterAndRenderAnalyticsProducts();
}

function setAnalyticsProductPage(page) {
  analyticsProductPage = page;
  filterAndRenderAnalyticsProducts();
}

function filterAndRenderAnalyticsProducts() {
  let baseList = currentFeedbackProducts || [];
  if (analyticsProductSearch) {
    const q = analyticsProductSearch.toLowerCase().trim();
    baseList = baseList.filter(p => (p.product_name || '').toLowerCase().includes(q));
  }
  if (analyticsProductCategory) {
    baseList = baseList.filter(p => p.category === analyticsProductCategory);
  }
  if (analyticsProductSupplier) {
    baseList = baseList.filter(p => String(p.supplier_id) === String(analyticsProductSupplier));
  }

  // Cập nhật số đếm trên 5 tab Quick Filter Pills dựa theo kết quả tìm kiếm + danh mục + nhà cung cấp
  const countAll = baseList.length;
  const countHigh = baseList.filter(p => p.count > 0 && (Number(p.average) || 0) >= 4.0).length;
  const countNeutral = baseList.filter(p => p.count > 0 && (Number(p.average) || 0) >= 3.0 && (Number(p.average) || 0) < 4.0).length;
  const countLow = baseList.filter(p => p.count > 0 && (Number(p.average) || 0) < 3.0).length;
  const countUnreplied = baseList.filter(p => (p.pending_count || 0) > 0).length;

  const countAllEl = document.getElementById('count-analytics-all');
  if (countAllEl) countAllEl.textContent = countAll;
  const countHighEl = document.getElementById('count-analytics-high');
  if (countHighEl) countHighEl.textContent = countHigh;
  const countNeutralEl = document.getElementById('count-analytics-neutral');
  if (countNeutralEl) countNeutralEl.textContent = countNeutral;
  const countLowEl = document.getElementById('count-analytics-low');
  if (countLowEl) countLowEl.textContent = countLow;
  const countUnrepliedEl = document.getElementById('count-analytics-unreplied');
  if (countUnrepliedEl) countUnrepliedEl.textContent = countUnreplied;

  let list = baseList;
  if (analyticsProductTab === 'HIGH') {
    list = list.filter(p => p.count > 0 && (Number(p.average) || 0) >= 4.0);
  } else if (analyticsProductTab === 'NEUTRAL') {
    list = list.filter(p => p.count > 0 && (Number(p.average) || 0) >= 3.0 && (Number(p.average) || 0) < 4.0);
  } else if (analyticsProductTab === 'LOW') {
    list = list.filter(p => p.count > 0 && (Number(p.average) || 0) < 3.0);
  } else if (analyticsProductTab === 'UNREPLIED') {
    list = list.filter(p => (p.pending_count || 0) > 0);
  }

  // Sắp xếp
  if (analyticsProductSort === 'COUNT_DESC') {
    list.sort((a, b) => (b.count || 0) - (a.count || 0) || (Number(b.average) || 0) - (Number(a.average) || 0));
  } else if (analyticsProductSort === 'RATING_DESC') {
    list.sort((a, b) => (Number(b.average) || 0) - (Number(a.average) || 0) || (b.count || 0) - (a.count || 0));
  } else if (analyticsProductSort === 'RATING_ASC') {
    list.sort((a, b) => (Number(a.average) || 0) - (Number(b.average) || 0) || (a.count || 0) - (b.count || 0));
  }

  const tbody = document.getElementById('analytics-products-tbody');
  const paginationEl = document.getElementById('analytics-products-pagination');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">Không có sản phẩm nào phù hợp điều kiện lọc</td></tr>`;
    if (paginationEl) paginationEl.innerHTML = '';
    return;
  }

  const total = list.length;
  const maxPage = Math.max(1, Math.ceil(total / ANALYTICS_PRODUCT_PAGE_SIZE));
  if (analyticsProductPage > maxPage) analyticsProductPage = maxPage;
  const start = (analyticsProductPage - 1) * ANALYTICS_PRODUCT_PAGE_SIZE;
  const pagedList = list.slice(start, start + ANALYTICS_PRODUCT_PAGE_SIZE);

  tbody.innerHTML = pagedList.map(p => {
    const avg = Number(p.average) || 0;
    const posRate = p.count ? Math.round(((p.positive_count || 0) / p.count) * 100) : 0;
    const replyRate = p.count ? Math.round(((p.replied_count || 0) / p.count) * 100) : 0;

    let qualityBadge = '<span class="badge" style="background:rgba(100,116,139,0.15);color:#64748b">Chưa có đánh giá</span>';
    if (p.count > 0) {
      if (avg >= 4.0) qualityBadge = '<span class="badge badge-replied">✅ Tốt</span>';
      else if (avg >= 3.0) qualityBadge = '<span class="badge badge-pending">⚡ Trung bình</span>';
      else qualityBadge = '<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;font-weight:700">⚠️ Cần kiểm tra</span>';
    }

    const catPart = p.category ? `🏷️ ${escapeHtml(p.category)}` : '';
    const supPart = p.supplier_name ? `🏢 ${escapeHtml(p.supplier_name)}` : '';
    const metaLine = [catPart, supPart].filter(Boolean).join(' • ');

    return `
      <tr>
        <td>
          <strong style="color:var(--text-primary)">${escapeHtml(p.product_name)}</strong>
          ${metaLine ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${metaLine}</div>` : ''}
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-weight:700;color:#f59e0b">⭐ ${p.average || '—'}</span>
            ${p.count > 0 ? `<span style="font-size:11px;color:var(--text-muted)">(${posRate}% ≥ 4★)</span>` : ''}
          </div>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <span>${p.count} lượt</span>
            ${p.negative_count > 0 ? `<span class="badge badge-interactive" style="background:rgba(239,68,68,0.15);color:#ef4444;font-size:10px;cursor:pointer" onclick="navigateToReplyFeedbacks({ tab: 'NEGATIVE', search: '${escapeHtml(p.product_name).replace(/'/g, "\\'")}' })" title="Xem ${p.negative_count} phản hồi tiêu cực (1-2★) của sản phẩm này">${p.negative_count} tiêu cực ↗</span>` : ''}
          </div>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <span>${p.replied_count || 0}/${p.count} (${replyRate}%)</span>
            ${p.pending_count > 0 ? `<span class="badge badge-pending badge-interactive" style="font-size:10px;cursor:pointer" onclick="navigateToReplyFeedbacks({ tab: 'PENDING', search: '${escapeHtml(p.product_name).replace(/'/g, "\\'")}' })" title="Xem ${p.pending_count} phản hồi chờ xử lý của sản phẩm này">${p.pending_count} chờ xử lý ↗</span>` : ''}
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

  if (paginationEl) {
    paginationEl.innerHTML = renderPaginationBar({
      totalItems: total,
      pageSize: ANALYTICS_PRODUCT_PAGE_SIZE,
      currentPage: analyticsProductPage,
      onPageChangeFnName: 'setAnalyticsProductPage'
    });
  }
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
let managerCustomerPage = 1;
const MANAGER_CUSTOMER_PAGE_SIZE = 10;

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
    currentCustomersList = customers || [];
    managerCustomerPage = 1;

    const skinOptions = ['Da dầu', 'Da khô', 'Da hỗn hợp', 'Da nhạy cảm', 'Da thường']
      .map(s => `<option value="${s}" ${filters.skin_type === s ? 'selected' : ''}>${s}</option>`).join('');

    const prefOptions = BEAUTY_PREFERENCE_OPTIONS
      .map(p => `<option value="${p}" ${filters.beauty_preference === p ? 'selected' : ''}>${p}</option>`).join('');

    const html = `
      <div class="filter-bar">
        <input type="text" id="cust-search" placeholder="🔍 Tên, email, số điện thoại, tài khoản..." value="${filters.search || ''}" oninput="debounceFilterCustomers()">
        <select id="cust-skin" onchange="filterCustomers()">
          <option value="">Tất cả loại da</option>
          ${skinOptions}
        </select>
        <select id="cust-pref" onchange="filterCustomers()">
          <option value="">Tất cả sở thích</option>
          ${prefOptions}
        </select>
        <select id="cust-status" onchange="filterCustomers()">
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE" ${filters.status === 'ACTIVE' ? 'selected' : ''}>✓ Hoạt động</option>
          <option value="LOCKED" ${filters.status === 'LOCKED' ? 'selected' : ''}>🔒 Đã khóa</option>
        </select>
        <button class="btn btn-secondary" onclick="resetCustomerFilters()">↺ Đặt lại</button>
      </div>

      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Khách hàng</th>
            <th>Tên tài khoản</th>
            <th>Email</th>
            <th>Số điện thoại</th>
            <th>Tương tác CRM</th>
            <th>Trạng thái</th>
            <th>Ngày tạo TK</th>
            <th>Hành động</th>
          </tr></thead>
          <tbody id="customers-tbody"></tbody>
        </table>
      </div>
      <div id="customers-pagination"></div>
      <p id="customers-count" style="color:var(--text-muted);font-size:12px;margin-top:10px">Tổng: ${customers.length} khách hàng · 💡 Nhấp đúp (Double-click) vào một dòng để xem và sửa thông tin</p>
    `;
    setPageContent(html);
    renderCustomerTablePage(1);
  } catch (e) { toast(e.message, 'error'); }
}

function renderCustomerTablePage(page) {
  managerCustomerPage = page;
  const tbody = document.getElementById('customers-tbody');
  const paginationEl = document.getElementById('customers-pagination');
  if (!tbody) return;

  const total = currentCustomersList.length;
  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">Không tìm thấy khách hàng</td></tr>`;
    if (paginationEl) paginationEl.innerHTML = '';
    return;
  }

  const maxPage = Math.max(1, Math.ceil(total / MANAGER_CUSTOMER_PAGE_SIZE));
  if (managerCustomerPage > maxPage) managerCustomerPage = maxPage;
  const start = (managerCustomerPage - 1) * MANAGER_CUSTOMER_PAGE_SIZE;
  const pagedList = currentCustomersList.slice(start, start + MANAGER_CUSTOMER_PAGE_SIZE);

  tbody.innerHTML = pagedList.map(c => {
    const fbCount = Number(c.feedback_count) || 0;
    const svCount = Number(c.survey_count) || 0;
    const interactionCount = fbCount + svCount;

    let interactionHtml = `<span style="color:var(--text-muted);font-size:12px">Chưa có tương tác</span>`;
    if (interactionCount > 0) {
      interactionHtml = `
        <div>
          ${fbCount > 0 ? `
            <div style="display:flex;align-items:center;gap:4px">
              <span style="color:#fbbf24;font-weight:600">⭐ ${c.avg_rating !== null && c.avg_rating !== undefined ? Number(c.avg_rating).toFixed(1) : '—'}</span>
              <span style="font-size:11px;color:var(--text-muted)">(${fbCount} đánh giá)</span>
            </div>
          ` : ''}
          ${svCount > 0 ? `
            <div style="font-size:11px;color:#a78bfa;margin-top:2px;font-weight:500">📋 ${svCount} khảo sát</div>
          ` : ''}
        </div>
      `;
    }

    return `
      <tr class="row-clickable" title="💡 Nhấp đúp (Double-click) để xem và sửa thông tin" ondblclick="openEditCustomerModalById(${c.id})" data-skin="${escapeHtml(c.skin_type || '')}" data-interest="${escapeHtml(c.beauty_preferences || '')}">
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="customer-avatar">${c.full_name ? c.full_name.charAt(0).toUpperCase() : 'U'}</div>
            <div style="font-weight:600;color:var(--text-primary)">${escapeHtml(c.full_name || '—')}</div>
          </div>
        </td>
        <td>
          <span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:6px;background:rgba(33,78,52,0.08);color:#214e34;border:1px solid rgba(33,78,52,0.22);font-family:monospace;font-size:12px;font-weight:600">
            @${escapeHtml(c.username || 'user')}
          </span>
        </td>
        <td style="font-size:12.5px;color:var(--text-secondary)">${escapeHtml(c.email || '—')}</td>
        <td style="font-size:12.5px;font-weight:500;color:var(--text-primary)">${escapeHtml(c.phone || '—')}</td>
        <td>${interactionHtml}</td>
        <td>${statusBadge(c.status)}</td>
        <td style="font-size:11.5px;color:var(--text-muted)">${formatDate(c.created_at)}</td>
        <td onclick="event.stopPropagation()">
          <div style="display:flex;gap:6px">
            ${c.status === 'ACTIVE'
              ? `<button class="btn btn-warning btn-sm" title="Khóa tài khoản" onclick="toggleCustomerStatus(${c.id},'LOCKED','${c.full_name.replace(/'/g, "\\'")}')">🔒</button>`
              : `<button class="btn btn-success btn-sm" title="Mở khóa tài khoản" onclick="toggleCustomerStatus(${c.id},'ACTIVE','${c.full_name.replace(/'/g, "\\'")}')">🔓</button>`
            }
            <button class="btn btn-trash btn-sm" title="${interactionCount > 0 ? 'Khóa tài khoản (bảo toàn lịch sử CRM)' : 'Xóa vĩnh viễn'}" onclick="deleteCustomer(${c.id},'${c.full_name.replace(/'/g, "\\'")}',${interactionCount})"><svg class="trash-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2v2H2v2h1v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6h1V4h-4V2h-2v2H9V2H6zm7 5v9h-2V7h2zM9 2V4h6V2H9z"/></svg></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  if (paginationEl) {
    paginationEl.innerHTML = renderPaginationBar({
      totalItems: total,
      pageSize: MANAGER_CUSTOMER_PAGE_SIZE,
      currentPage: managerCustomerPage,
      onPageChangeFnName: 'renderCustomerTablePage'
    });
  }
}

const debounceFilterCustomers = debounce(filterCustomers, 150);

async function filterCustomers() {
  const search = document.getElementById('cust-search')?.value.trim() || '';
  const skin_type = document.getElementById('cust-skin')?.value || '';
  const beauty_preference = document.getElementById('cust-pref')?.value || '';
  const status = document.getElementById('cust-status')?.value || '';

  const tbody = document.getElementById('customers-tbody');
  const countEl = document.getElementById('customers-count');
  if (tbody && countEl) {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (skin_type) params.append('skin_type', skin_type);
      if (beauty_preference) params.append('beauty_preference', beauty_preference);
      if (status) params.append('status', status);
      const customers = await api('GET', `/api/manager/customers?${params}`);
      currentCustomersList = customers || [];
      renderCustomerTablePage(1);
      countEl.textContent = `Tổng: ${currentCustomersList.length} khách hàng · 💡 Nhấp đúp (Double-click) vào một dòng để xem và sửa thông tin`;
    } catch (e) { toast(e.message, 'error'); }
    return;
  }
  fetchAndRenderCustomers({ search, skin_type, beauty_preference, status });
}

function resetCustomerFilters() {
  const s = document.getElementById('cust-search'); if (s) s.value = '';
  const sk = document.getElementById('cust-skin'); if (sk) sk.value = '';
  const pr = document.getElementById('cust-pref'); if (pr) pr.value = '';
  const st = document.getElementById('cust-status'); if (st) st.value = '';
  filterCustomers();
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
          ${BEAUTY_PREFERENCE_OPTIONS.map(p => `<option value="${p}">${p}</option>`).join('')}
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
  const prefOptions = BEAUTY_PREFERENCE_OPTIONS;
  const fbCount = Number(c.feedback_count) || 0;
  const svCount = Number(c.survey_count) || 0;
  const hasInteractions = fbCount > 0 || svCount > 0;

  showModal(`✏️ Xem & Sửa khách hàng: ${escapeHtml(c.full_name)}`, `
    ${hasInteractions ? `
      <div style="background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.3);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:16px;display:flex;align-items:flex-start;gap:10px;font-size:12px;color:#93c5fd;line-height:1.5">
        <span style="font-size:18px;line-height:1">ℹ️</span>
        <div>
          <strong>Khách hàng này đã có ${fbCount} đánh giá sản phẩm và ${svCount} phản hồi khảo sát trong hệ thống CRM.</strong>
        </div>
      </div>
    ` : ''}
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

async function deleteCustomer(accountId, name, interactionCount) {
  const count = Number(interactionCount) || 0;
  if (count > 0) {
    const ok = confirm(
      `Khách hàng "${name}" đã có dữ liệu đánh giá/khảo sát CRM.\n\n` +
      `Để bảo toàn dữ liệu thống kê CRM, tài khoản sẽ KHÔNG bị xóa vĩnh viễn khỏi Database mà tự động chuyển sang trạng thái "Khóa tài khoản".\n\n` +
      `Bạn có đồng ý tiếp tục?`
    );
    if (!ok) return;
  } else {
    if (!confirm(`Xác nhận xóa vĩnh viễn tài khoản khách hàng "${name}" khỏi cơ sở dữ liệu?`)) return;
  }

  try {
    const res = await api('DELETE', `/api/manager/customers/${accountId}`);
    toast(res.message || 'Đã xử lý tài khoản khách hàng', 'success');
    renderManagerCustomers();
  } catch (e) { toast(e.message, 'error'); }
}

// ========== MANAGER: SURVEYS ==========
let currentManagerSurveysList = [];
let managerSurveyPage = 1;
const MANAGER_SURVEY_PAGE_SIZE = 10;

async function renderManagerSurveys() {
  setPageHeader('📋 Chiến dịch Khảo sát', 'Tạo, quản lý, chỉnh sửa và theo dõi kết quả khảo sát thị hiếu',
    `<button class="btn btn-primary" onclick="openCreateSurveyModal()">➕ Tạo khảo sát mới</button>`);
  showLoading();
  try {
    const surveys = await api('GET', '/api/manager/surveys');
    currentManagerSurveysList = surveys || [];
    managerSurveyPage = 1;

    const html = `
      <div id="manager-survey-list" class="survey-list"></div>
      <div id="manager-survey-pagination"></div>
      <p style="color:var(--text-muted);font-size:12px;margin-top:14px">Tổng: ${currentManagerSurveysList.length} khảo sát · 💡 <strong>Mẹo:</strong> Nhấp đúp (Double-click) vào thẻ khảo sát để chỉnh sửa câu hỏi & thông tin; nhấn nút <strong>🗑️</strong> để xóa khảo sát.</p>
    `;
    setPageContent(html);
    renderManagerSurveysPage(1);
  } catch (e) { toast(e.message, 'error'); }
}

function renderManagerSurveysPage(page) {
  managerSurveyPage = page;
  const container = document.getElementById('manager-survey-list');
  const paginationEl = document.getElementById('manager-survey-pagination');
  if (!container) return;

  const total = currentManagerSurveysList.length;
  if (total === 0) {
    container.innerHTML = `<div class="page-empty"><div class="empty-icon">📋</div><p>Chưa có chiến dịch khảo sát nào</p></div>`;
    if (paginationEl) paginationEl.innerHTML = '';
    return;
  }

  const maxPage = Math.max(1, Math.ceil(total / MANAGER_SURVEY_PAGE_SIZE));
  if (managerSurveyPage > maxPage) managerSurveyPage = maxPage;
  const start = (managerSurveyPage - 1) * MANAGER_SURVEY_PAGE_SIZE;
  const pagedList = currentManagerSurveysList.slice(start, start + MANAGER_SURVEY_PAGE_SIZE);

  container.innerHTML = pagedList.map(s => `
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
  `).join('');

  if (paginationEl) {
    paginationEl.innerHTML = renderPaginationBar({
      totalItems: total,
      pageSize: MANAGER_SURVEY_PAGE_SIZE,
      currentPage: managerSurveyPage,
      onPageChangeFnName: 'renderManagerSurveysPage'
    });
  }
}

let editQuestionCount = 0;

async function openEditSurveyModal(id) {
  showModal('✏️ Sửa chiến dịch khảo sát', '<div class="loading-spinner"><div class="spinner"></div></div>', true);
  const modalEl = document.getElementById('modal');
  if (modalEl) modalEl.style.maxWidth = '850px';

  try {
    const [survey, products, customers, suppliers] = await Promise.all([
      api('GET', `/api/manager/surveys/${id}`),
      api('GET', '/api/products').catch(() => []),
      api('GET', '/api/manager/customers?status=ACTIVE').catch(() => []),
      api('GET', '/api/admin/suppliers').catch(() => [])
    ]);

    const targetProductIds = new Set((survey.target_product_ids || []).map(Number));
    const recipientIds = new Set((survey.recipient_customer_ids || []).map(Number));

    // Đẩy sản phẩm "Đang kinh doanh" lên đầu
    const sortedProducts = [...products].sort((a, b) => {
      if (a.launch_status === 'OFFICIAL' && b.launch_status !== 'OFFICIAL') return -1;
      if (a.launch_status !== 'OFFICIAL' && b.launch_status === 'OFFICIAL') return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    const productCategories = Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort();
    const supplierOptions = (suppliers && suppliers.length > 0)
      ? suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}${s.status === 'INACTIVE' ? ' (Ngừng hợp tác ✕)' : ''}</option>`).join('')
      : Array.from(new Map(products.filter(p => p.supplier_id).map(p => [p.supplier_id, p.supplier_name])).entries())
          .map(([sid, name]) => `<option value="${sid}">${escapeHtml(name)}</option>`).join('');

    const prodChecks = sortedProducts.map(p => {
      const isOfficial = p.launch_status === 'OFFICIAL';
      const isChecked = targetProductIds.has(Number(p.id));
      const unaccented = typeof removeVietnameseTones === 'function' ? removeVietnameseTones(p.name || '') : (p.name || '').toLowerCase();
      return `
        <label class="survey-option-label esv-product-item"
               data-name="${escapeHtml((p.name || '').toLowerCase())}"
               data-name-unaccented="${escapeHtml(unaccented)}"
               data-cat="${escapeHtml(p.category || '')}"
               data-supplier="${escapeHtml(String(p.supplier_id || ''))}"
               data-official="${isOfficial ? '1' : '0'}"
               style="font-size:12px;cursor:pointer;display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);transition:background 0.15s">
          <input type="checkbox" name="esv-product" value="${p.id}" ${isChecked ? 'checked' : ''} data-official="${isOfficial ? '1' : '0'}" style="accent-color:var(--rose-500);margin-top:2px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;color:var(--text-primary);display:flex;align-items:center;justify-content:space-between;gap:4px">
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
              <span style="font-size:10px;font-weight:600;white-space:nowrap;color:${isOfficial ? '#10b981' : '#94a3b8'}">${isOfficial ? '✓ Đang KD' : '🚫 Ngừng KD'}</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              🏷️ ${escapeHtml(p.category || 'Khác')}${p.supplier_name ? ` • 🏢 ${escapeHtml(p.supplier_name)}` : ''}
            </div>
          </div>
        </label>
      `;
    }).join('');

    const customerChecks = customers.map(c => {
      const isChecked = recipientIds.has(Number(c.customer_id));
      const skinText = c.skin_type || 'Chưa rõ da';
      const normalizedPrefs = (c.beauty_preferences || '')
        .split(',')
        .map(normalizeBeautyPreferenceLabel)
        .filter(Boolean);
      const prefText = normalizedPrefs[0] || '—';
      const unaccented = typeof removeVietnameseTones === 'function' ? removeVietnameseTones(c.full_name || '') : (c.full_name || '').toLowerCase();
      return `
        <label class="survey-option-label esv-recipient-item"
               data-skin="${escapeHtml(c.skin_type || '')}"
               data-prefs="${escapeHtml(normalizedPrefs.join(','))}"
               data-name="${escapeHtml((c.full_name || '').toLowerCase())}"
               data-name-unaccented="${escapeHtml(unaccented)}"
               data-username="${escapeHtml((c.username || '').toLowerCase())}"
               data-email="${escapeHtml((c.email || '').toLowerCase())}"
               data-phone="${escapeHtml((c.phone || '').toLowerCase())}"
               style="font-size:12px;cursor:pointer;display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);transition:background 0.15s">
          <input type="checkbox" name="esv-recipient" value="${c.customer_id}" ${isChecked ? 'checked' : ''} onchange="updateSurveyRecipientCount('esv')" style="accent-color:var(--rose-500);margin-top:2px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
              <strong style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-primary)" title="${escapeHtml(c.full_name)}">${escapeHtml(c.full_name)}</strong>
              <span style="color:var(--text-muted);font-size:11px;white-space:nowrap">@${escapeHtml(c.username)}</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${c.email ? `📧 ${escapeHtml(c.email)}` : ''}${c.phone ? ` • 📞 ${escapeHtml(c.phone)}` : ''}
            </div>
            <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">
              <span class="badge" style="background:rgba(45,106,79,0.12);color:var(--green-700);font-size:10px;padding:1px 6px;font-weight:600">
                🧴 ${escapeHtml(skinText)}
              </span>
              ${prefText !== '—' ? `<span class="badge" style="background:rgba(244,63,94,0.1);color:#f43f5e;font-size:10px;padding:1px 6px;font-weight:600">💅 ${escapeHtml(prefText)}</span>` : ''}
            </div>
          </div>
        </label>
      `;
    }).join('');

    const initialRecipientCheckedCount = customers.filter(c => recipientIds.has(Number(c.customer_id))).length;
    const startDateVal = survey.start_date ? String(survey.start_date).slice(0, 10) : '';
    const endDateVal = survey.end_date ? String(survey.end_date).slice(0, 10) : '';

    const modalHtml = `
      <div class="form-group">
        <label>Tiêu đề khảo sát *</label>
        <input id="esv-title" value="${escapeHtml(survey.title || '')}" placeholder="Tiêu đề khảo sát">
      </div>
      
      <div class="form-group">
        <label>Sản phẩm liên quan * <span style="font-size:11px;color:var(--text-muted);font-weight:400">(chọn tối thiểu 1)</span></label>
        
        <!-- THANH BỘ LỌC SẢN PHẨM (ĐỒNG BỘ STYLE QUẢN LÝ SẢN PHẨM) -->
        <div class="filter-bar modal-filter-bar">
          <input type="text" id="esv-prod-search" placeholder="🔍 Tên sản phẩm..." oninput="filterSurveyProducts('esv')">
          <select id="esv-prod-cat" onchange="filterSurveyProducts('esv')">
            <option value="">Tất cả danh mục</option>
            ${productCategories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
          </select>
          <select id="esv-prod-supplier" onchange="filterSurveyProducts('esv')">
            <option value="">Tất cả NCC</option>
            ${supplierOptions}
          </select>
          <button type="button" class="btn btn-secondary" onclick="resetSurveyProductFilters('esv')">↺ Reset</button>
          <button type="button" class="btn btn-secondary btn-sm btn-toggle-all" onclick="toggleAllSurveyProducts('esv')">Chọn/Bỏ tất cả</button>
        </div>

        <div style="max-height:180px;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:2px">
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
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:4px">
          <label style="margin-bottom:0">Gửi đến tài khoản khách hàng</label>
          <span id="esv-recipient-status-text" style="font-size:12px;color:var(--text-muted)">Đang hiển thị <strong id="esv-recipient-visible-count" style="color:var(--text-primary)">${customers.length}</strong> khách hàng (Đã chọn <strong id="esv-recipient-count" style="color:var(--text-primary)">${initialRecipientCheckedCount}</strong>/${customers.length} khách hàng đang hoạt động)</span>
        </div>

        <!-- THANH BỘ LỌC KHÁCH HÀNG (ĐỒNG BỘ STYLE QUẢN LÝ KHÁCH HÀNG) -->
        <div class="filter-bar modal-filter-bar">
          <input type="text" id="esv-recipient-search" placeholder="🔍 Tên, email, số điện thoại..." oninput="filterSurveyRecipients('esv')">
          <select id="esv-recipient-skin" onchange="filterSurveyRecipients('esv')">
            <option value="">Tất cả loại da</option>
            <option value="Da dầu">Da dầu</option>
            <option value="Da khô">Da khô</option>
            <option value="Da hỗn hợp">Da hỗn hợp</option>
            <option value="Da nhạy cảm">Da nhạy cảm</option>
            <option value="Da thường">Da thường</option>
          </select>
          <select id="esv-recipient-pref" onchange="filterSurveyRecipients('esv')">
            <option value="">Tất cả sở thích</option>
            <option value="Trị mụn">Trị mụn</option>
            <option value="Dưỡng ẩm">Dưỡng ẩm</option>
            <option value="Chống lão hóa">Chống lão hóa</option>
            <option value="Trang điểm">Trang điểm</option>
            <option value="Chăm sóc da (Skincare)">Chăm sóc da (Skincare)</option>
            <option value="Organic">Organic</option>
          </select>
          <button type="button" class="btn btn-secondary" onclick="resetSurveyRecipientFilters('esv')">↺ Reset</button>
          <button type="button" class="btn btn-secondary btn-sm btn-toggle-all" onclick="toggleAllSurveyRecipients('esv')">Chọn/Bỏ tất cả</button>
        </div>

        <!-- Hidden select for automated test backward-compatibility -->
        <select id="esv-recipient-segment" style="display:none" onchange="filterSurveyRecipientsBySegment(this.value, 'esv')">
          <option value="ALL">ALL</option>
          <option value="SKIN:Da dầu">SKIN:Da dầu</option>
          <option value="SKIN:Da khô">SKIN:Da khô</option>
          <option value="SKIN:Da hỗn hợp">SKIN:Da hỗn hợp</option>
          <option value="SKIN:Da nhạy cảm">SKIN:Da nhạy cảm</option>
          <option value="SKIN:Da thường">SKIN:Da thường</option>
          <option value="PREF:Chăm sóc da (Skincare)">PREF:Chăm sóc da (Skincare)</option>
          <option value="PREF:Trang điểm">PREF:Trang điểm</option>
          <option value="PREF:Chống lão hóa">PREF:Chống lão hóa</option>
          <option value="PREF:Trị mụn">PREF:Trị mụn</option>
          <option value="PREF:Dưỡng ẩm">PREF:Dưỡng ẩm</option>
          <option value="PREF:Organic">PREF:Organic</option>
        </select>

        <div style="max-height:180px;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:2px">
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

function moveQuestionBlock(btn, direction) {
  const block = btn.closest('.question-block');
  if (!block) return;
  if (direction === -1 && block.previousElementSibling) {
    block.parentNode.insertBefore(block, block.previousElementSibling);
  } else if (direction === 1 && block.nextElementSibling) {
    block.parentNode.insertBefore(block.nextElementSibling, block);
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
  const isReq = q ? (q.is_required !== false && q.is_required !== 0) : true;

  const div = document.createElement('div');
  div.id = `eq-block-${count}`;
  div.className = 'question-block';
  div.style.cssText = 'background:var(--bg-card-solid);border:1px solid var(--border);border-radius:10px;padding:14px;position:relative';
  div.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
      <div style="display:flex;gap:3px;align-items:center">
        <button type="button" class="question-reorder-btn" title="Chuyển câu hỏi lên trên" onclick="moveQuestionBlock(this, -1)">⬆️</button>
        <button type="button" class="question-reorder-btn" title="Chuyển câu hỏi xuống dưới" onclick="moveQuestionBlock(this, 1)">⬇️</button>
      </div>
      <input placeholder="Nội dung câu hỏi ${count}..." id="eq-text-${count}" value="${escapeHtml(qText)}" style="flex:1">
      <select id="eq-type-${count}" onchange="toggleEditOptionsField(${count})" style="width:150px">
        <option value="SINGLE_CHOICE" ${qType === 'SINGLE_CHOICE' ? 'selected' : ''}>Một lựa chọn</option>
        <option value="MULTI_CHOICE" ${qType === 'MULTI_CHOICE' ? 'selected' : ''}>Nhiều lựa chọn</option>
        <option value="RATING" ${qType === 'RATING' ? 'selected' : ''}>Đánh giá sao</option>
        <option value="TEXT" ${qType === 'TEXT' ? 'selected' : ''}>Nhập văn bản</option>
      </select>
      <label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--text-secondary);cursor:pointer;white-space:nowrap;user-select:none">
        <input type="checkbox" id="eq-req-${count}" ${isReq ? 'checked' : ''} style="accent-color:var(--rose-500)">
        <span>Bắt buộc</span>
      </label>
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
  toggleAllSurveyRecipients('esv');
}

function toggleAllEditSurveyProducts() {
  toggleAllSurveyProducts('esv');
}

async function updateSurvey(id) {
  const questions = [];
  document.querySelectorAll('[id^="eq-block-"]').forEach((block) => {
    const n = block.id.replace('eq-block-', '');
    const text = document.getElementById(`eq-text-${n}`)?.value.trim();
    const type = document.getElementById(`eq-type-${n}`)?.value;
    const optionsRaw = document.getElementById(`eq-options-${n}`)?.value || '';
    const isRequired = document.getElementById(`eq-req-${n}`)?.checked !== false;
    if (!text) return;
    const options = (type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE')
      ? optionsRaw.split(',').map(o => o.trim()).filter(Boolean) : null;
    questions.push({ question_text: text, question_type: type, options, is_required: isRequired });
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
  const [products, customers, suppliers] = await Promise.all([
    api('GET', '/api/products').catch(() => []),
    api('GET', '/api/manager/customers?status=ACTIVE').catch(() => []),
    api('GET', '/api/admin/suppliers').catch(() => [])
  ]);

  // Đẩy sản phẩm "Đang kinh doanh" lên đầu
  const sortedProducts = [...products].sort((a, b) => {
    if (a.launch_status === 'OFFICIAL' && b.launch_status !== 'OFFICIAL') return -1;
    if (a.launch_status !== 'OFFICIAL' && b.launch_status === 'OFFICIAL') return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  const productCategories = Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort();
  const supplierOptions = (suppliers && suppliers.length > 0)
    ? suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}${s.status === 'INACTIVE' ? ' (Ngừng hợp tác ✕)' : ''}</option>`).join('')
    : Array.from(new Map(products.filter(p => p.supplier_id).map(p => [p.supplier_id, p.supplier_name])).entries())
        .map(([sid, name]) => `<option value="${sid}">${escapeHtml(name)}</option>`).join('');

  const prodChecks = sortedProducts.map(p => {
    const isOfficial = p.launch_status === 'OFFICIAL';
    const unaccented = typeof removeVietnameseTones === 'function' ? removeVietnameseTones(p.name || '') : (p.name || '').toLowerCase();
    return `
      <label class="survey-option-label sv-product-item"
             data-name="${escapeHtml((p.name || '').toLowerCase())}"
             data-name-unaccented="${escapeHtml(unaccented)}"
             data-cat="${escapeHtml(p.category || '')}"
             data-supplier="${escapeHtml(String(p.supplier_id || ''))}"
             data-official="${isOfficial ? '1' : '0'}"
             style="font-size:12px;cursor:pointer;display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);transition:background 0.15s">
        <input type="checkbox" name="sv-product" value="${p.id}" data-official="${isOfficial ? '1' : '0'}" style="accent-color:var(--rose-500);margin-top:2px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;color:var(--text-primary);display:flex;align-items:center;justify-content:space-between;gap:4px">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
            <span style="font-size:10px;font-weight:600;white-space:nowrap;color:${isOfficial ? '#10b981' : '#94a3b8'}">${isOfficial ? '✓ Đang KD' : '🚫 Ngừng KD'}</span>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            🏷️ ${escapeHtml(p.category || 'Khác')}${p.supplier_name ? ` • 🏢 ${escapeHtml(p.supplier_name)}` : ''}
          </div>
        </div>
      </label>
    `;
  }).join('');

  const customerChecks = customers.map(c => {
    const skinText = c.skin_type || 'Chưa rõ da';
    const normalizedPrefs = (c.beauty_preferences || '')
      .split(',')
      .map(normalizeBeautyPreferenceLabel)
      .filter(Boolean);
    const prefText = normalizedPrefs[0] || '—';
    const unaccented = typeof removeVietnameseTones === 'function' ? removeVietnameseTones(c.full_name || '') : (c.full_name || '').toLowerCase();
    return `
      <label class="survey-option-label sv-recipient-item"
             data-skin="${escapeHtml(c.skin_type || '')}"
             data-prefs="${escapeHtml(normalizedPrefs.join(','))}"
             data-name="${escapeHtml((c.full_name || '').toLowerCase())}"
             data-name-unaccented="${escapeHtml(unaccented)}"
             data-username="${escapeHtml((c.username || '').toLowerCase())}"
             data-email="${escapeHtml((c.email || '').toLowerCase())}"
             data-phone="${escapeHtml((c.phone || '').toLowerCase())}"
             style="font-size:12px;cursor:pointer;display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);transition:background 0.15s">
        <input type="checkbox" name="sv-recipient" value="${c.customer_id}" checked onchange="updateSurveyRecipientCount('sv')" style="accent-color:var(--rose-500);margin-top:2px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
            <strong style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-primary)" title="${escapeHtml(c.full_name)}">${escapeHtml(c.full_name)}</strong>
            <span style="color:var(--text-muted);font-size:11px;white-space:nowrap">@${escapeHtml(c.username)}</span>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${c.email ? `📧 ${escapeHtml(c.email)}` : ''}${c.phone ? ` • 📞 ${escapeHtml(c.phone)}` : ''}
          </div>
          <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">
            <span class="badge" style="background:rgba(45,106,79,0.12);color:var(--green-700);font-size:10px;padding:1px 6px;font-weight:600">
              🧴 ${escapeHtml(skinText)}
            </span>
            ${prefText !== '—' ? `<span class="badge" style="background:rgba(244,63,94,0.1);color:#f43f5e;font-size:10px;padding:1px 6px;font-weight:600">💅 ${escapeHtml(prefText)}</span>` : ''}
          </div>
        </div>
      </label>
    `;
  }).join('');

  showModal('➕ Tạo chiến dịch khảo sát mới', `
    <div class="form-group"><label>Tiêu đề khảo sát *</label><input id="sv-title" placeholder="VD: Khảo sát thị hiếu Son môi Hè 2026"></div>
    <div class="form-group">
      <label>Sản phẩm liên quan * <span style="font-size:11px;color:var(--text-muted);font-weight:400">(chọn tối thiểu 1)</span></label>
      
      <!-- THANH BỘ LỌC SẢN PHẨM (ĐỒNG BỘ STYLE QUẢN LÝ SẢN PHẨM) -->
      <div class="filter-bar modal-filter-bar">
        <input type="text" id="sv-prod-search" placeholder="🔍 Tên sản phẩm..." oninput="filterSurveyProducts('sv')">
        <select id="sv-prod-cat" onchange="filterSurveyProducts('sv')">
          <option value="">Tất cả danh mục</option>
          ${productCategories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
        </select>
        <select id="sv-prod-supplier" onchange="filterSurveyProducts('sv')">
          <option value="">Tất cả NCC</option>
          ${supplierOptions}
        </select>
        <button type="button" class="btn btn-secondary" onclick="resetSurveyProductFilters('sv')">↺ Reset</button>
        <button type="button" class="btn btn-secondary btn-sm btn-toggle-all" onclick="toggleAllSurveyProducts('sv')">Chọn/Bỏ tất cả</button>
      </div>

      <div style="max-height:180px;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:2px">
        ${prodChecks || '<p style="font-size:12px;color:var(--text-muted)">Chưa có sản phẩm nào.</p>'}
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Ngày bắt đầu</label><input id="sv-start" type="date"></div>
      <div class="form-group"><label>Ngày kết thúc</label><input id="sv-end" type="date"></div>
    </div>
    <div class="form-group"><label>Mô tả</label><textarea id="sv-desc" placeholder="Mô tả mục tiêu chiến dịch khảo sát..."></textarea></div>

    <div class="form-group">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:4px">
        <label style="margin-bottom:0">Gửi đến tài khoản khách hàng</label>
        <span id="sv-recipient-status-text" style="font-size:12px;color:var(--text-muted)">Đang hiển thị <strong id="sv-recipient-visible-count" style="color:var(--text-primary)">${customers.length}</strong> khách hàng (Đã chọn <strong id="sv-recipient-count" style="color:var(--text-primary)">${customers.length}</strong>/${customers.length} khách hàng đang hoạt động)</span>
      </div>

      <!-- THANH BỘ LỌC KHÁCH HÀNG (ĐỒNG BỘ STYLE QUẢN LÝ KHÁCH HÀNG) -->
      <div class="filter-bar modal-filter-bar">
        <input type="text" id="sv-recipient-search" placeholder="🔍 Tên, email, số điện thoại..." oninput="filterSurveyRecipients('sv')">
        <select id="sv-recipient-skin" onchange="filterSurveyRecipients('sv')">
          <option value="">Tất cả loại da</option>
          <option value="Da dầu">Da dầu</option>
          <option value="Da khô">Da khô</option>
          <option value="Da hỗn hợp">Da hỗn hợp</option>
          <option value="Da nhạy cảm">Da nhạy cảm</option>
          <option value="Da thường">Da thường</option>
        </select>
        <select id="sv-recipient-pref" onchange="filterSurveyRecipients('sv')">
          <option value="">Tất cả sở thích</option>
          <option value="Trị mụn">Trị mụn</option>
          <option value="Dưỡng ẩm">Dưỡng ẩm</option>
          <option value="Chống lão hóa">Chống lão hóa</option>
          <option value="Trang điểm">Trang điểm</option>
          <option value="Chăm sóc da (Skincare)">Chăm sóc da (Skincare)</option>
          <option value="Organic">Organic</option>
        </select>
        <button type="button" class="btn btn-secondary" onclick="resetSurveyRecipientFilters('sv')">↺ Reset</button>
        <button type="button" class="btn btn-secondary btn-sm btn-toggle-all" onclick="toggleAllSurveyRecipients('sv')">Chọn/Bỏ tất cả</button>
      </div>

      <!-- Hidden select for automated test backward-compatibility -->
      <select id="sv-recipient-segment" style="display:none" onchange="filterSurveyRecipientsBySegment(this.value, 'sv')">
        <option value="ALL">ALL</option>
        <option value="SKIN:Da dầu">SKIN:Da dầu</option>
        <option value="SKIN:Da khô">SKIN:Da khô</option>
        <option value="SKIN:Da hỗn hợp">SKIN:Da hỗn hợp</option>
        <option value="SKIN:Da nhạy cảm">SKIN:Da nhạy cảm</option>
        <option value="SKIN:Da thường">SKIN:Da thường</option>
        <option value="PREF:Chăm sóc da (Skincare)">PREF:Chăm sóc da (Skincare)</option>
        <option value="PREF:Trang điểm">PREF:Trang điểm</option>
        <option value="PREF:Chống lão hóa">PREF:Chống lão hóa</option>
        <option value="PREF:Trị mụn">PREF:Trị mụn</option>
        <option value="PREF:Dưỡng ẩm">PREF:Dưỡng ẩm</option>
        <option value="PREF:Organic">PREF:Organic</option>
      </select>

      <div style="max-height:180px;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:2px">
        ${customerChecks || '<p style="font-size:12px;color:var(--text-muted)">Chưa có khách hàng hoạt động.</p>'}
      </div>
    </div>

    <div style="border-top:1px solid var(--border);margin:8px 0;padding-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <strong style="font-size:14px">📝 Danh sách câu hỏi</strong>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <button type="button" class="btn btn-outline-rose btn-sm" onclick="applySurveyTemplate('BEAUTY_PREF')">💄 Mẫu Thị hiếu & Sản phẩm</button>
          <button type="button" class="btn btn-outline-purple btn-sm" onclick="applySurveyTemplate('SERVICE_EXP')">🛍️ Mẫu Trải nghiệm dịch vụ</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addSurveyQuestion()">➕ Thêm câu hỏi</button>
        </div>
      </div>
      <div id="questions-container" style="display:flex;flex-direction:column;gap:12px"></div>
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Hủy</button>
      <button class="btn btn-purple" onclick="createSurvey('DRAFT')">💾 Lưu nháp</button>
      <button class="btn btn-primary" onclick="createSurvey('ACTIVE')">▶️ Tạo & Kích hoạt</button>
    </div>
  `, true);

  const modalEl = document.getElementById('modal');
  if (modalEl) modalEl.style.maxWidth = '850px';

  addSurveyQuestion();
}

function filterSurveyProducts(prefix = 'sv') {
  const searchInput = (document.getElementById(`${prefix}-prod-search`)?.value || '').trim();
  const searchVal = searchInput.toLowerCase();
  const searchValUnaccented = typeof removeVietnameseTones === 'function' ? removeVietnameseTones(searchInput) : searchVal;
  const catVal = document.getElementById(`${prefix}-prod-cat`)?.value || '';
  const supplierVal = document.getElementById(`${prefix}-prod-supplier`)?.value || '';

  const items = document.querySelectorAll(`.${prefix}-product-item`);
  items.forEach(item => {
    const name = (item.dataset.name || '').toLowerCase();
    const nameUnaccented = item.dataset.nameUnaccented || (typeof removeVietnameseTones === 'function' ? removeVietnameseTones(name) : name);
    const cat = item.dataset.cat || '';
    const supplier = item.dataset.supplier || '';

    const matchSearch = !searchVal || name.includes(searchVal) || (searchValUnaccented && nameUnaccented.includes(searchValUnaccented));
    const matchCat = !catVal || cat === catVal;
    const matchSupplier = !supplierVal || String(supplier) === String(supplierVal);

    if (matchSearch && matchCat && matchSupplier) {
      item.classList.remove('hidden');
      item.style.setProperty('display', 'flex', 'important');
    } else {
      item.classList.add('hidden');
      item.style.setProperty('display', 'none', 'important');
    }
  });
}

function resetSurveyProductFilters(prefix = 'sv') {
  const s = document.getElementById(`${prefix}-prod-search`);
  const c = document.getElementById(`${prefix}-prod-cat`);
  const sup = document.getElementById(`${prefix}-prod-supplier`);
  if (s) s.value = '';
  if (c) c.value = '';
  if (sup) sup.value = '';

  const items = document.querySelectorAll(`.${prefix}-product-item`);
  items.forEach(item => {
    item.classList.remove('hidden');
    item.style.setProperty('display', 'flex', 'important');
  });
}

function toggleAllSurveyProducts(prefix = 'sv') {
  const visibleBoxes = [...document.querySelectorAll(`.${prefix}-product-item:not(.hidden) input[name="${prefix}-product"]`)];
  if (!visibleBoxes.length) return;
  const shouldCheck = visibleBoxes.some(b => !b.checked);
  visibleBoxes.forEach(b => { b.checked = shouldCheck; });
}

function filterSurveyRecipients(prefix = 'sv') {
  const searchInput = (document.getElementById(`${prefix}-recipient-search`)?.value || '').trim();
  const searchVal = searchInput.toLowerCase();
  const searchValUnaccented = typeof removeVietnameseTones === 'function' ? removeVietnameseTones(searchInput) : searchVal;
  const skinVal = (document.getElementById(`${prefix}-recipient-skin`)?.value || '').toLowerCase().trim();
  const prefVal = (document.getElementById(`${prefix}-recipient-pref`)?.value || '').toLowerCase().trim();

  const items = document.querySelectorAll(`.${prefix}-recipient-item`);

  items.forEach(item => {
    const name = item.dataset.name || '';
    const nameUnaccented = item.dataset.nameUnaccented || (typeof removeVietnameseTones === 'function' ? removeVietnameseTones(name) : name);
    const username = item.dataset.username || '';
    const email = item.dataset.email || '';
    const phone = item.dataset.phone || '';
    const skin = (item.dataset.skin || '').toLowerCase().trim();
    const prefs = (item.dataset.prefs || '').toLowerCase().split(',').map(p => p.trim());

    const matchSearch = !searchVal ||
      name.includes(searchVal) ||
      (searchValUnaccented && nameUnaccented.includes(searchValUnaccented)) ||
      username.includes(searchVal) ||
      email.includes(searchVal) ||
      phone.includes(searchVal);
    const matchSkin = !skinVal || skin === skinVal;
    const matchPref = !prefVal || prefs.some(p => p.includes(prefVal) || prefVal.includes(p));

    const matches = matchSearch && matchSkin && matchPref;

    if (matches) {
      item.classList.remove('hidden');
      item.style.setProperty('display', 'flex', 'important');
    } else {
      item.classList.add('hidden');
      item.style.setProperty('display', 'none', 'important');
    }
  });

  updateSurveyRecipientCount(prefix);
}

function resetSurveyRecipientFilters(prefix = 'sv') {
  const searchEl = document.getElementById(`${prefix}-recipient-search`);
  const skinEl = document.getElementById(`${prefix}-recipient-skin`);
  const prefEl = document.getElementById(`${prefix}-recipient-pref`);
  const segEl = document.getElementById(`${prefix}-recipient-segment`);
  if (searchEl) searchEl.value = '';
  if (skinEl) skinEl.value = '';
  if (prefEl) prefEl.value = '';
  if (segEl) segEl.value = 'ALL';

  const items = document.querySelectorAll(`.${prefix}-recipient-item`);
  items.forEach(item => {
    item.classList.remove('hidden');
    item.style.setProperty('display', 'flex', 'important');
  });
  updateSurveyRecipientCount(prefix);
}

function toggleAllSurveyRecipients(prefix = 'sv') {
  const visibleBoxes = [...document.querySelectorAll(`.${prefix}-recipient-item:not(.hidden) input[name="${prefix}-recipient"]`)];
  if (!visibleBoxes.length) return;
  const shouldCheck = visibleBoxes.some(b => !b.checked);
  visibleBoxes.forEach(b => { b.checked = shouldCheck; });
  updateSurveyRecipientCount(prefix);
}

function updateSurveyRecipientCount(prefix = 'sv') {
  const allItems = document.querySelectorAll(`.${prefix}-recipient-item`);
  const totalCount = allItems.length;
  const visibleCount = Array.from(allItems).filter(item => !item.classList.contains('hidden')).length;
  const checkedCount = document.querySelectorAll(`input[name="${prefix}-recipient"]:checked`).length;

  const visEl = document.getElementById(`${prefix}-recipient-visible-count`);
  if (visEl) visEl.textContent = String(visibleCount);

  const countEl = document.getElementById(`${prefix}-recipient-count`);
  if (countEl) countEl.textContent = String(checkedCount);

  const statusEl = document.getElementById(`${prefix}-recipient-status-text`);
  if (statusEl && !visEl) {
    statusEl.innerHTML = `Đang hiển thị <strong id="${prefix}-recipient-visible-count" style="color:var(--text-primary)">${visibleCount}</strong> khách hàng (Đã chọn <strong id="${prefix}-recipient-count" style="color:var(--text-primary)">${checkedCount}</strong>/${totalCount} khách hàng đang hoạt động)`;
  }
}

function filterSurveyRecipientsBySegment(val, prefix = 'sv') {
  if (!val || val === 'ALL') {
    resetSurveyRecipientFilters(prefix);
    return;
  }
  const [segmentType, ...rawValue] = String(val).split(':');
  const targetValue = rawValue.join(':').trim();
  const skinEl = document.getElementById(`${prefix}-recipient-skin`);
  const prefEl = document.getElementById(`${prefix}-recipient-pref`);
  if (segmentType === 'SKIN') {
    if (skinEl) skinEl.value = targetValue;
    if (prefEl) prefEl.value = '';
  } else if (segmentType === 'PREF') {
    if (prefEl) prefEl.value = targetValue;
    if (skinEl) skinEl.value = '';
  }
  filterSurveyRecipients(prefix);

  // Automated test backward compatibility (UI-04 expects segment selection to select matching recipients):
  const items = document.querySelectorAll(`.${prefix}-recipient-item`);
  items.forEach(item => {
    const isVisible = !item.classList.contains('hidden');
    const cb = item.querySelector(`input[name="${prefix}-recipient"]`);
    if (cb) cb.checked = isVisible;
  });
  updateSurveyRecipientCount(prefix);
}

function applySurveyTemplate(type) {
  const container = document.getElementById('questions-container');
  if (!container) return;
  container.innerHTML = '';
  questionCount = 0;

  if (type === 'BEAUTY_PREF') {
    addSurveyQuestionWithData(
      'Cảm nhận và mức độ phù hợp của bạn đối với dòng sản phẩm',
      'SINGLE_CHOICE',
      'Rất thích & hợp da, Bình thường, Không phù hợp / Kích ứng nhẹ'
    );
    addSurveyQuestionWithData(
      'Yếu tố bạn quan tâm hàng đầu khi lựa chọn mỹ phẩm làm đẹp',
      'MULTI_CHOICE',
      'Thành phần an toàn lành tính, Hiệu quả thực tế rõ rệt, Thương hiệu uy tín, Giá thành hợp lý, Bao bì tiện lợi & sang trọng'
    );
    addSurveyQuestionWithData(
      'Mức độ hài lòng tổng quan của bạn về sản phẩm',
      'RATING',
      ''
    );
    toast('Đã nạp Mẫu khảo sát Thị hiếu & Sản phẩm (3 câu hỏi)', 'success');
  } else if (type === 'SERVICE_EXP') {
    addSurveyQuestionWithData(
      'Đánh giá chất lượng tư vấn và giải đáp chuyên môn của nhân viên',
      'RATING',
      ''
    );
    addSurveyQuestionWithData(
      'Đánh giá quy cách đóng gói chống sốc và tốc độ giao hàng',
      'SINGLE_CHOICE',
      'Rất nhanh & đóng gói cẩn thận, Đúng hẹn & bình thường, Giao chậm hoặc bao bì bị móp méo'
    );
    addSurveyQuestionWithData(
      'Góp ý hoặc đề xuất thêm để chúng tôi nâng cao chất lượng dịch vụ',
      'TEXT',
      ''
    );
    toast('Đã nạp Mẫu khảo sát Trải nghiệm dịch vụ (3 câu hỏi)', 'success');
  }
}

let questionCount = 0;
function addSurveyQuestionWithData(text = '', type = 'SINGLE_CHOICE', options = '', is_required = true) {
  questionCount++;
  const container = document.getElementById('questions-container');
  if (!container) return;
  const isReq = (is_required !== false && is_required !== 0);
  const div = document.createElement('div');
  div.id = `q-block-${questionCount}`;
  div.className = 'question-block';
  div.style.cssText = 'background:var(--bg-card-solid);border:1px solid var(--border);border-radius:10px;padding:14px;position:relative';
  div.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
      <div style="display:flex;gap:3px;align-items:center">
        <button type="button" class="question-reorder-btn" title="Chuyển câu hỏi lên trên" onclick="moveQuestionBlock(this, -1)">⬆️</button>
        <button type="button" class="question-reorder-btn" title="Chuyển câu hỏi xuống dưới" onclick="moveQuestionBlock(this, 1)">⬇️</button>
      </div>
      <input placeholder="Nội dung câu hỏi ${questionCount}..." id="q-text-${questionCount}" value="${escapeHtml(text)}" style="flex:1">
      <select id="q-type-${questionCount}" onchange="toggleOptionsField(${questionCount})" style="width:150px">
        <option value="SINGLE_CHOICE" ${type === 'SINGLE_CHOICE' ? 'selected' : ''}>Một lựa chọn</option>
        <option value="MULTI_CHOICE" ${type === 'MULTI_CHOICE' ? 'selected' : ''}>Nhiều lựa chọn</option>
        <option value="RATING" ${type === 'RATING' ? 'selected' : ''}>Đánh giá sao</option>
        <option value="TEXT" ${type === 'TEXT' ? 'selected' : ''}>Nhập văn bản</option>
      </select>
      <label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--text-secondary);cursor:pointer;white-space:nowrap;user-select:none">
        <input type="checkbox" id="q-req-${questionCount}" ${isReq ? 'checked' : ''} style="accent-color:var(--rose-500)">
        <span>Bắt buộc</span>
      </label>
      <button type="button" class="btn btn-danger btn-sm btn-icon" onclick="removeQuestion(${questionCount})">✕</button>
    </div>
    <div id="q-options-wrap-${questionCount}" style="${(type === 'RATING' || type === 'TEXT') ? 'display:none' : 'display:block'}">
      <input placeholder="Các lựa chọn, phân tách bằng dấu phẩy. VD: Lựa chọn A, Lựa chọn B, Lựa chọn C" id="q-options-${questionCount}" value="${escapeHtml(options)}">
    </div>
  `;
  container.appendChild(div);
}

function addSurveyQuestion() {
  addSurveyQuestionWithData('', 'SINGLE_CHOICE', '');
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


async function createSurvey(status) {
  const questions = [];
  document.querySelectorAll('[id^="q-block-"]').forEach((block) => {
    const n = block.id.replace('q-block-', '');
    const text = document.getElementById(`q-text-${n}`)?.value.trim();
    const type = document.getElementById(`q-type-${n}`)?.value;
    const optionsRaw = document.getElementById(`q-options-${n}`)?.value || '';
    const isRequired = document.getElementById(`q-req-${n}`)?.checked !== false;
    if (!text) return;
    const options = (type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE')
      ? optionsRaw.split(',').map(o => o.trim()).filter(Boolean) : null;
    questions.push({ question_text: text, question_type: type, options, is_required: isRequired });
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

let currentSurveyResultData = null;
let activeSurveyResultTab = 'questions';

function cleanQuestionTitle(text, i) {
  if (!text) return '';
  let cleaned = text.trim();
  // Xóa bỏ triệt để mọi tiền tố số thứ tự / câu số đã có từ DB để tránh lặp số 1. 1.
  cleaned = cleaned.replace(/^((câu\s*\d+[\.:\s]*|\d+[\.\):\s]+)+)/i, '').trim();
  return `${i + 1}. ${cleaned}`;
}

function getStarColor(val) {
  if (val >= 5) return '#10b981';
  if (val === 4) return '#34d399';
  if (val === 3) return '#fbbf24';
  if (val === 2) return '#fb923c';
  return '#f43f5e';
}

function toggleSurveyDrilldown(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'flex' : 'none';
}

function toggleRespondentDetail(id) {
  const el = document.getElementById(`resp-detail-${id}`);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'table-row' : 'none';
}

function switchSurveyResultTab(tabName) {
  activeSurveyResultTab = tabName;
  document.querySelectorAll('.modal-tab-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`stb-${tabName}`);
  if (activeBtn) activeBtn.classList.add('active');
  renderSurveyResultTabContent();
}

async function sendSurveyReminder(surveyId, customerId = null, remindAll = false, customerName = '') {
  try {
    const payload = remindAll ? { remind_all: true } : { customer_id: customerId };
    const res = await api('POST', `/api/manager/surveys/${surveyId}/remind`, payload);
    toast(res.message, 'success');
  } catch (e) {
    toast(`Không thể gửi nhắc nhở: ${e.message}`, 'error');
  }
}

async function viewSurveyResults(id, title) {
  showModal(`📊 Kết quả: ${title}`, `<div class="loading-spinner"><div class="spinner"></div></div>`, true);
  const modalEl = document.getElementById('modal');
  if (modalEl) modalEl.style.maxWidth = '900px';

  try {
    const data = await api('GET', `/api/manager/surveys/${id}/results`);
    currentSurveyResultData = data;
    activeSurveyResultTab = 'questions';

    const { survey, stats, results, respondents, recipients } = data;
    const surveyProducts = (Array.isArray(data.products) && data.products.length > 0)
      ? data.products
      : (survey.product_names ? survey.product_names.split(',').map(n => ({ name: n.trim(), category: '', supplier_name: '' })) : []);

    let body = `
      <!-- THANH TÓM TẮT NHANH 4 CHỈ SỐ -->
      <div class="survey-summary-chips">
        <div class="survey-chip-item">
          <div class="survey-chip-icon" style="background:rgba(59,130,246,0.12);color:#2563eb">📤</div>
          <div>
            <div class="survey-chip-label">Đã gửi</div>
            <div class="survey-chip-val">${stats.recipients_count} khách</div>
          </div>
        </div>
        <div class="survey-chip-item">
          <div class="survey-chip-icon" style="background:rgba(16,185,129,0.12);color:#059669">✅</div>
          <div>
            <div class="survey-chip-label">Đã phản hồi</div>
            <div class="survey-chip-val">${stats.respondents_count} <small style="font-size:11px;font-weight:600;color:#059669">(${stats.response_rate}%)</small></div>
          </div>
        </div>
        <div class="survey-chip-item">
          <div class="survey-chip-icon" style="background:rgba(245,158,11,0.12);color:#d97706">⏳</div>
          <div>
            <div class="survey-chip-label">Chưa tham gia</div>
            <div class="survey-chip-val" style="color:#d97706">${stats.pending_count} khách</div>
          </div>
        </div>
        <div class="survey-chip-item">
          <div class="survey-chip-icon" style="background:rgba(251,191,36,0.15);color:#d97706">⭐</div>
          <div>
            <div class="survey-chip-label">Điểm đánh giá TB</div>
            <div class="survey-chip-val" style="color:#d97706">${stats.overall_avg_rating ? `${stats.overall_avg_rating}★` : '—'}</div>
          </div>
        </div>
      </div>

      <!-- DANH SÁCH SẢN PHẨM KHẢO SÁT LIÊN QUAN -->
      ${surveyProducts.length > 0 ? `
      <div style="background:var(--bg-card-solid);border:1px solid var(--border);border-radius:10px;padding:12px 16px;margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:12.5px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:6px">
            <span>📦 Sản phẩm khảo sát trong chiến dịch:</span>
            <span class="badge badge-secondary" style="font-size:11px;font-weight:600;padding:2px 8px">${surveyProducts.length} sản phẩm</span>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${surveyProducts.map(p => `
            <div style="display:inline-flex;align-items:center;gap:6px;background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;padding:6px 12px;font-size:12px">
              <span style="font-weight:600;color:var(--text-primary)">🏷️ ${escapeHtml(p.name)}</span>
              ${p.category ? `<span class="badge" style="background:rgba(33,78,52,0.1);color:#214e34;font-size:11px;font-weight:600;padding:2px 7px;border-radius:4px">🏷️ ${escapeHtml(p.category)}</span>` : ''}
              ${p.supplier_name ? `<span class="badge" style="background:rgba(59,130,246,0.08);color:#2563eb;font-size:11px;font-weight:600;padding:2px 7px;border-radius:4px">🏢 ${escapeHtml(p.supplier_name)}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <!-- 3 TAB RÕ RÀNG -->
      <div class="modal-tab-nav">
        <button class="modal-tab-btn active" id="stb-questions" onclick="switchSurveyResultTab('questions')">
          📊 Thống kê câu hỏi (${results.length})
        </button>
        <button class="modal-tab-btn" id="stb-respondents" onclick="switchSurveyResultTab('respondents')">
          👤 Khách hàng đã phản hồi (${respondents.length})
        </button>
        <button class="modal-tab-btn" id="stb-recipients" onclick="switchSurveyResultTab('recipients')">
          📩 Theo dõi người nhận (${recipients.length})
        </button>
      </div>

      <div id="survey-tab-content">
        <!-- Rendered by renderSurveyResultTabContent -->
      </div>
    `;

    document.getElementById('modal-body').innerHTML = body;
    renderSurveyResultTabContent();
  } catch (e) {
    document.getElementById('modal-body').innerHTML = `<p class="error-msg">${e.message}</p>`;
  }
}

function renderSurveyResultTabContent() {
  const container = document.getElementById('survey-tab-content');
  if (!container || !currentSurveyResultData) return;

  const { survey, stats, results, respondents, recipients } = currentSurveyResultData;

  // TAB 1: THỐNG KÊ CÂU HỎI
  if (activeSurveyResultTab === 'questions') {
    if (results.length === 0) {
      container.innerHTML = `<div class="page-empty"><div class="empty-icon">📊</div><p>Chưa có dữ liệu câu hỏi</p></div>`;
      return;
    }

    let html = `<div style="display:flex;flex-direction:column;gap:14px;max-height:60vh;overflow-y:auto;padding-right:4px">`;
    results.forEach((r, i) => {
      const qTitle = cleanQuestionTitle(r.question_text, i);
      html += `
        <div style="background:var(--bg-card-solid);border:1px solid var(--border);border-radius:12px;padding:16px">
          <div style="font-size:13.5px;font-weight:700;margin-bottom:12px;color:var(--text-primary);line-height:1.4">
            ${escapeHtml(qTitle)}
            <span style="color:var(--text-muted);font-weight:400;font-size:11px">&nbsp;(${r.total_responses} phản hồi)</span>
          </div>
      `;

      if (r.question_type === 'RATING') {
        html += `
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px dashed var(--border)">
            <div style="font-size:26px;font-weight:800;color:#f59e0b">${r.average || '—'}</div>
            <div style="font-size:16px;color:#fbbf24">${r.average ? '★'.repeat(Math.round(r.average)) + '☆'.repeat(5 - Math.round(r.average)) : ''}</div>
            <div style="font-size:12px;color:var(--text-muted)">Điểm TB: <strong>${r.average ? `${r.average}★` : '—'}</strong></div>
          </div>
        `;

        if (r.distribution) {
          // Sắp xếp từ 5 sao xuống 1 sao
          const sortedDist = [...r.distribution].sort((a, b) => Number(b.value) - Number(a.value));
          sortedDist.forEach(d => {
            const hasReviewers = d.count > 0 && d.reviewers && d.reviewers.length > 0;
            const drilldownId = `drilldown-${r.question_id}-${d.value}`;

            html += `
              <div class="result-bar-wrap" style="margin-bottom:8px">
                <div class="result-bar-label ${hasReviewers ? 'drilldown-trigger' : ''}" 
                     ${hasReviewers ? `onclick="toggleSurveyDrilldown('${drilldownId}')" title="Nhấp để xem danh sách khách hàng đã đánh giá ${d.value} sao"` : ''}>
                  <span style="display:flex;align-items:center;gap:6px">
                    <span>⭐ ${d.value} sao (<strong>${d.count}</strong>)</span>
                    ${hasReviewers ? `<span style="font-size:11px;color:var(--green-700);font-weight:600">👥 Xem ai đánh giá ▾</span>` : ''}
                  </span>
                  <span style="font-weight:600">${d.percent}%</span>
                </div>
                <div class="result-bar">
                  <div class="result-bar-fill" style="width:${d.percent}%;background:${getStarColor(d.value)}"></div>
                </div>

                ${hasReviewers ? `
                  <div id="${drilldownId}" class="drilldown-panel" style="display:none">
                    <div style="font-size:11px;font-weight:700;color:var(--text-muted);display:flex;justify-content:space-between">
                      <span>👥 Khách hàng đánh giá ${d.value} sao (${d.reviewers.length}):</span>
                      <span>🕒 Thời gian nộp</span>
                    </div>
                    ${d.reviewers.map(rev => `
                      <div class="drilldown-reviewer-row">
                        <div style="display:flex;align-items:center;gap:8px">
                          <strong style="color:var(--text-primary)">${escapeHtml(rev.full_name)}</strong>
                          <span class="tag" style="font-size:10px;background:rgba(45,106,79,0.1);color:var(--green-700)">🧴 ${escapeHtml(rev.skin_type || 'Chưa rõ da')}</span>
                          <span class="tag" style="font-size:10px;background:rgba(59,130,246,0.1);color:#2563eb">🎂 ${rev.age ? `${rev.age} tuổi` : '—'}</span>
                          ${rev.phone || rev.email ? `<span style="font-size:11px;color:var(--text-muted)">(${escapeHtml(rev.phone || rev.email)})</span>` : ''}
                        </div>
                        <div style="font-size:11px;color:var(--text-muted)">
                          ${formatDateTime(rev.submitted_at)}
                        </div>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            `;
          });
        }
      } else if (r.distribution) {
        // SINGLE_CHOICE or MULTI_CHOICE: Thống kê % và gắn nhãn "🔥 Phổ biến nhất" cho phương án cao nhất
        const maxCount = Math.max(...r.distribution.map(d => d.count || 0), 0);

        r.distribution.forEach((d, dIdx) => {
          const hasReviewers = d.count > 0 && d.reviewers && d.reviewers.length > 0;
          const drilldownId = `drilldown-choice-${r.question_id}-${dIdx}`;
          const isTopChoice = maxCount > 0 && d.count === maxCount;

          html += `
            <div class="result-bar-wrap" style="margin-bottom:8px">
              <div class="result-bar-label ${hasReviewers ? 'drilldown-trigger' : ''}" 
                   ${hasReviewers ? `onclick="toggleSurveyDrilldown('${drilldownId}')" title="Nhấp để xem khách hàng chọn phương án này"` : ''}>
                <span style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <span>${escapeHtml(d.label)} (<strong>${d.count}</strong>)</span>
                  ${isTopChoice ? `<span class="badge" style="background:rgba(239,68,68,0.12);color:#ef4444;font-size:10px;font-weight:700;padding:2px 6px;border:1px solid rgba(239,68,68,0.25)">🔥 Phổ biến nhất</span>` : ''}
                  ${hasReviewers ? `<span style="font-size:11px;color:var(--green-700);font-weight:600">👥 Xem ai chọn ▾</span>` : ''}
                </span>
                <span style="font-weight:600">${d.percent}%</span>
              </div>
              <div class="result-bar">
                <div class="result-bar-fill" style="width:${d.percent}%;background:${isTopChoice ? '#10b981' : 'var(--green-600)'}"></div>
              </div>

              ${hasReviewers ? `
                <div id="${drilldownId}" class="drilldown-panel" style="display:none">
                  <div style="font-size:11px;font-weight:700;color:var(--text-muted);display:flex;justify-content:space-between">
                    <span>👥 Khách hàng chọn phương án này (${d.reviewers.length}):</span>
                    <span>🕒 Thời gian</span>
                  </div>
                  ${d.reviewers.map(rev => `
                    <div class="drilldown-reviewer-row">
                      <div style="display:flex;align-items:center;gap:8px">
                        <strong style="color:var(--text-primary)">${escapeHtml(rev.full_name)}</strong>
                        <span class="tag" style="font-size:10px;background:rgba(45,106,79,0.1);color:var(--green-700)">🧴 ${escapeHtml(rev.skin_type || 'Chưa rõ da')}</span>
                        <span class="tag" style="font-size:10px;background:rgba(59,130,246,0.1);color:#2563eb">🎂 ${rev.age ? `${rev.age} tuổi` : '—'}</span>
                        ${rev.phone || rev.email ? `<span style="font-size:11px;color:var(--text-muted)">(${escapeHtml(rev.phone || rev.email)})</span>` : ''}
                      </div>
                      <div style="font-size:11px;color:var(--text-muted)">
                        ${formatDateTime(rev.submitted_at)}
                      </div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          `;
        });
      } else if (r.text_answers && r.text_answers.length > 0) {
        html += `<div style="display:flex;flex-direction:column;gap:8px;margin-top:6px">`;
        r.text_answers.forEach(ans => {
          html += `
            <div style="background:var(--bg-card);border:1px solid var(--border);border-left:3px solid var(--green-600);border-radius:6px;padding:10px 12px">
              <div style="font-size:13px;color:var(--text-primary);line-height:1.5;margin-bottom:6px">
                "${escapeHtml(ans.text)}"
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text-muted);flex-wrap:wrap;gap:6px">
                <div style="display:flex;align-items:center;gap:6px">
                  <strong style="color:var(--text-primary)">${escapeHtml(ans.full_name)}</strong>
                  <span class="tag" style="font-size:10px">🧴 ${escapeHtml(ans.skin_type || '—')}</span>
                  <span class="tag" style="font-size:10px">🎂 ${ans.age ? `${ans.age} tuổi` : '—'}</span>
                  ${ans.email || ans.phone ? `<span>· ${escapeHtml(ans.email || ans.phone)}</span>` : ''}
                </div>
                <div>🕒 ${formatDateTime(ans.submitted_at)}</div>
              </div>
            </div>
          `;
        });
        html += `</div>`;
      } else {
        html += `<div style="color:var(--text-muted);font-size:12px;font-style:italic">Chưa có câu trả lời cho câu hỏi này</div>`;
      }

      html += `</div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
    return;
  }

  // TAB 2: KHÁCH HÀNG ĐÃ PHẢN HỒI
  if (activeSurveyResultTab === 'respondents') {
    if (respondents.length === 0) {
      container.innerHTML = `
        <div class="page-empty" style="padding:40px 20px">
          <div class="empty-icon">👤</div>
          <p>Chưa có khách hàng nào hoàn thành khảo sát này.</p>
        </div>
      `;
      return;
    }

    let html = `
      <div style="margin-bottom:10px;font-size:12px;color:var(--text-muted)">
        Hiển thị <strong>${respondents.length}</strong> khách hàng đã nộp bài khảo sát:
      </div>
      <div class="table-wrapper" style="max-height:60vh;overflow-y:auto">
        <table>
          <thead>
            <tr>
              <th>KHÁCH HÀNG</th>
              <th>LOẠI DA & ĐỘ TUỔI</th>
              <th>ĐIỂM TB PHIẾU</th>
              <th>THỜI GIAN NỘP</th>
              <th style="text-align:center">CHI TIẾT ĐÁP ÁN</th>
              <th>NGHIỆP VỤ CSKH</th>
            </tr>
          </thead>
          <tbody>
            ${respondents.map(r => {
      const contact = [r.email, r.phone].filter(Boolean).join(' · ');
      let cskhBadge = '<span class="badge badge-pending">⚡ Bình thường</span>';
      if (r.cskh_status === 'CARE_NEEDED') {
        cskhBadge = `
                  <div style="display:flex;align-items:center;gap:6px">
                    <span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;font-weight:700">⚠️ Cần chăm sóc</span>
                    <button class="btn btn-primary btn-sm" onclick="closeModal(); navigate('manager-feedbacks');" style="font-size:10px;padding:2px 6px" title="Chuyển đến màn hình CSKH">
                      💬 CSKH
                    </button>
                  </div>
                `;
      } else if (r.cskh_status === 'SATISFIED') {
        cskhBadge = '<span class="badge badge-replied">✅ Hài lòng</span>';
      }

      return `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px">
                      <div class="user-avatar" style="width:28px;height:28px;font-size:11px">
                        ${r.full_name ? r.full_name.charAt(0) : 'U'}
                      </div>
                      <div>
                        <strong>${escapeHtml(r.full_name)}</strong> <span style="font-size:11px;color:var(--text-muted)">@${escapeHtml(r.username || '')}</span>
                        ${contact ? `<div style="font-size:11px;color:var(--text-muted)">${escapeHtml(contact)}</div>` : ''}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style="display:flex;gap:4px;flex-wrap:wrap">
                      <span class="tag" style="font-size:10px;background:rgba(45,106,79,0.1);color:var(--green-700)">🧴 ${escapeHtml(r.skin_type || 'Chưa rõ')}</span>
                      <span class="tag" style="font-size:10px;background:rgba(59,130,246,0.1);color:#2563eb">🎂 ${r.age ? `${r.age} tuổi` : '—'}</span>
                    </div>
                  </td>
                  <td>
                    <span style="font-weight:700;color:#f59e0b">⭐ ${r.avg_rating || '—'}</span>
                    <span style="font-size:11px;color:var(--text-muted)">/ 5</span>
                  </td>
                  <td style="font-size:12px;color:var(--text-muted)">
                    ${formatDateTime(r.submitted_at)}
                  </td>
                  <td style="text-align:center">
                    <button class="btn btn-secondary btn-sm" onclick="toggleRespondentDetail(${r.customer_id})">
                      👁️ Xem đáp án (${r.answers.length}) ▾
                    </button>
                  </td>
                  <td>${cskhBadge}</td>
                </tr>
                <tr id="resp-detail-${r.customer_id}" style="display:none;background:var(--bg-input)">
                  <td colspan="6" style="padding:14px">
                    <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:8px">
                      📝 Toàn bộ câu trả lời của "${escapeHtml(r.full_name)}":
                    </div>
                    <div style="display:flex;flex-direction:column;gap:8px">
                      ${r.answers.map((ans, aIdx) => `
                        <div style="background:var(--bg-card-solid);border:1px solid var(--border);border-radius:6px;padding:8px 12px">
                          <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:4px">
                            ${cleanQuestionTitle(ans.question_text, aIdx)}
                          </div>
                          <div style="font-size:12px;color:${ans.question_type === 'RATING' ? '#d97706' : 'var(--text-secondary)'};font-weight:${ans.question_type === 'RATING' ? '700' : '400'}">
                            ${ans.question_type === 'RATING' ? `⭐ ${ans.answer_value} sao / 5` : `👉 "${escapeHtml(ans.answer_value || '(Chưa điền)')}"`}
                          </div>
                        </div>
                      `).join('')}
                    </div>
                  </td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;
    container.innerHTML = html;
    return;
  }

  // TAB 3: THEO DÕI NGƯỜI NHẬN
  if (activeSurveyResultTab === 'recipients') {
    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px">
        <div style="font-size:12px;color:var(--text-muted)">
          Tổng số <strong>${recipients.length}</strong> người nhận (${stats.pending_count} chưa hoàn thành)
        </div>
        <button class="btn btn-warning btn-sm" onclick="sendSurveyReminder(${survey.id}, null, true)" ${stats.pending_count === 0 ? 'disabled' : ''}>
          🔔 Nhắc nhở tất cả người chưa làm (${stats.pending_count})
        </button>
      </div>

      <div class="table-wrapper" style="max-height:60vh;overflow-y:auto">
        <table>
          <thead>
            <tr>
              <th>KHÁCH HÀNG</th>
              <th>PHÂN KHÚC CRM</th>
              <th>KÊNH NHẬN</th>
              <th>TRẠNG THÁI</th>
              <th style="text-align:center">HÀNH ĐỘNG</th>
            </tr>
          </thead>
          <tbody>
            ${recipients.map(r => {
      const contact = [r.email, r.phone].filter(Boolean).join(' · ');
      return `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px">
                      <div class="user-avatar" style="width:28px;height:28px;font-size:11px">
                        ${r.full_name ? r.full_name.charAt(0) : 'U'}
                      </div>
                      <div>
                        <strong>${escapeHtml(r.full_name)}</strong> <span style="font-size:11px;color:var(--text-muted)">@${escapeHtml(r.username || '')}</span>
                        ${contact ? `<div style="font-size:11px;color:var(--text-muted)">${escapeHtml(contact)}</div>` : ''}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style="display:flex;gap:4px;flex-wrap:wrap">
                      <span class="tag" style="font-size:10px;background:rgba(45,106,79,0.1);color:var(--green-700)">🧴 ${escapeHtml(r.skin_type || 'Chưa rõ')}</span>
                      <span class="tag" style="font-size:10px;background:rgba(59,130,246,0.1);color:#2563eb">🎂 ${r.age ? `${r.age} tuổi` : '—'}</span>
                    </div>
                  </td>
                  <td>
                    <span class="tag" style="font-size:11px">📱 In-App Web</span>
                  </td>
                  <td>
                    ${r.already_submitted
          ? `<span class="badge badge-replied">✅ Đã hoàn thành</span>`
          : `<span class="badge badge-pending" style="background:rgba(245,158,11,0.15);color:#d97706">⏳ Chưa tham gia</span>`
        }
                  </td>
                  <td style="text-align:center">
                    ${!r.already_submitted ? `
                      <button class="btn btn-secondary btn-sm" onclick="sendSurveyReminder(${survey.id}, ${r.customer_id}, false, '${escapeHtml(r.full_name).replace(/'/g, "\\'")}')">
                        🔔 Gửi nhắc nhở
                      </button>
                    ` : `
                      <span style="font-size:11px;color:var(--text-muted)">Nộp lúc ${formatDateTime(r.submitted_at)}</span>
                    `}
                  </td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;
    container.innerHTML = html;
  }
}

// ========== MANAGER: FEEDBACKS (REPLY FEEDBACK) ==========
let allManagerFeedbacks = [];
let currentManagerFeedbacksList = [];
let managerFeedbackPage = 1;
const MANAGER_FEEDBACK_PAGE_SIZE = 10;

// Filters state
let managerFeedbackTab = 'ALL'; // 'ALL', 'PENDING', 'NEGATIVE', 'NEUTRAL', 'POSITIVE', 'REPLIED'
let managerFeedbackSearch = '';
let managerFeedbackRatingFilter = ''; // '', 'GROUP_NEGATIVE', '1', '2', '3', 'GROUP_POSITIVE', '4', '5'
let managerFeedbackStatusFilter = ''; // '', 'PENDING', 'REPLIED'
let pendingFeedbackFilter = null;

function navigateToReplyFeedbacks(options = {}) {
  pendingFeedbackFilter = options;
  if (typeof navigate === 'function') {
    navigate('manager-feedbacks');
  }
}

async function renderManagerFeedbacks() {
  setPageHeader('💬 Phản hồi & Đánh giá', 'Tiếp nhận và phản hồi đánh giá từ khách hàng');

  if (pendingFeedbackFilter) {
    managerFeedbackTab = pendingFeedbackFilter.tab || 'ALL';
    managerFeedbackSearch = pendingFeedbackFilter.search || '';
    if (pendingFeedbackFilter.tab === 'NEGATIVE') {
      managerFeedbackRatingFilter = 'GROUP_NEGATIVE';
      managerFeedbackStatusFilter = '';
    } else if (pendingFeedbackFilter.tab === 'PENDING') {
      managerFeedbackStatusFilter = 'PENDING';
      managerFeedbackRatingFilter = '';
      managerFeedbackTab = 'ALL';
    } else if (pendingFeedbackFilter.tab === 'NEUTRAL') {
      managerFeedbackRatingFilter = '3';
      managerFeedbackStatusFilter = '';
    } else if (pendingFeedbackFilter.tab === 'POSITIVE') {
      managerFeedbackRatingFilter = 'GROUP_POSITIVE';
      managerFeedbackStatusFilter = '';
    } else if (pendingFeedbackFilter.tab === 'REPLIED') {
      managerFeedbackStatusFilter = 'REPLIED';
      managerFeedbackRatingFilter = '';
      managerFeedbackTab = 'ALL';
    } else {
      managerFeedbackRatingFilter = pendingFeedbackFilter.rating || '';
      managerFeedbackStatusFilter = pendingFeedbackFilter.status || '';
    }
    managerFeedbackPage = 1;
    pendingFeedbackFilter = null;
  } else {
    managerFeedbackTab = 'ALL';
    managerFeedbackSearch = '';
    managerFeedbackRatingFilter = '';
    managerFeedbackStatusFilter = '';
    managerFeedbackPage = 1;
  }

  showLoading();
  try {
    const feedbacks = await api('GET', '/api/manager/feedbacks');
    allManagerFeedbacks = feedbacks || [];
    renderManagerFeedbacksLayout();
    filterAndRenderFeedbacks();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function renderManagerFeedbacksLayout() {
  const total = allManagerFeedbacks.length;
  const pending_count = allManagerFeedbacks.filter(f => f.status === 'PENDING').length;
  const negative_count = allManagerFeedbacks.filter(f => Number(f.rating) <= 2).length;
  const neutral_count = allManagerFeedbacks.filter(f => Number(f.rating) === 3).length;
  const positive_count = allManagerFeedbacks.filter(f => Number(f.rating) >= 4).length;
  const replied_count = allManagerFeedbacks.filter(f => f.status === 'REPLIED').length;

  const html = `
    <!-- Card Toolbar & Quick Filter Pills -->
    <div class="card" style="margin-bottom:18px;padding:16px 20px">
      <div class="table-card-header">
        <div class="card-title">💬 Quản lý phản hồi khách hàng</div>

        <div class="table-toolbar-right">
          <input type="text" id="fb-search" placeholder="🔍 Tìm theo tên khách hàng hoặc sản phẩm..."
                 value="${escapeHtml(managerFeedbackSearch)}"
                 oninput="handleFeedbackSearch(this.value)">

          <select id="fb-rating" onchange="handleFeedbackRatingChange(this.value)">
            <option value="" ${managerFeedbackRatingFilter === '' ? 'selected' : ''}>Tất cả số sao</option>
            <option value="GROUP_NEGATIVE" ${managerFeedbackRatingFilter === 'GROUP_NEGATIVE' ? 'selected' : ''}>⚠️ Tiêu cực (1-2 sao)</option>
            <option value="1" ${managerFeedbackRatingFilter === '1' ? 'selected' : ''}>⭐ 1 sao</option>
            <option value="2" ${managerFeedbackRatingFilter === '2' ? 'selected' : ''}>⭐ 2 sao</option>
            <option value="3" ${managerFeedbackRatingFilter === '3' ? 'selected' : ''}>⭐ 3 sao</option>
            <option value="GROUP_POSITIVE" ${managerFeedbackRatingFilter === 'GROUP_POSITIVE' ? 'selected' : ''}>⭐ Tích cực (4-5 sao)</option>
            <option value="4" ${managerFeedbackRatingFilter === '4' ? 'selected' : ''}>⭐ 4 sao</option>
            <option value="5" ${managerFeedbackRatingFilter === '5' ? 'selected' : ''}>⭐ 5 sao</option>
          </select>

          <select id="fb-status" onchange="handleFeedbackStatusChange(this.value)">
            <option value="" ${managerFeedbackStatusFilter === '' ? 'selected' : ''}>Tất cả trạng thái</option>
            <option value="PENDING" ${managerFeedbackStatusFilter === 'PENDING' ? 'selected' : ''}>⏳ Chờ phản hồi</option>
            <option value="REPLIED" ${managerFeedbackStatusFilter === 'REPLIED' ? 'selected' : ''}>✅ Đã phản hồi</option>
          </select>

          <button class="btn btn-secondary btn-sm" onclick="resetManagerFeedbackFilters()" title="Xóa tất cả điều kiện lọc">
            ↺ Đặt lại
          </button>
        </div>
      </div>

      <!-- Quick Filter Pills -->
      <div class="filter-tabs" id="fb-filter-tabs">
        <button class="filter-tab-btn ${managerFeedbackTab === 'ALL' ? 'active' : ''}" onclick="setFeedbackTab('ALL')">
          Tất cả (${total})
        </button>
        <button class="filter-tab-btn ${managerFeedbackTab === 'NEGATIVE' ? 'active' : ''}" onclick="setFeedbackTab('NEGATIVE')">
          ⚠️ Tiêu cực 1-2★ (${negative_count})
        </button>
        <button class="filter-tab-btn ${managerFeedbackTab === 'NEUTRAL' ? 'active' : ''}" onclick="setFeedbackTab('NEUTRAL')">
          😐 Trung lập 3★ (${neutral_count})
        </button>
        <button class="filter-tab-btn ${managerFeedbackTab === 'POSITIVE' ? 'active' : ''}" onclick="setFeedbackTab('POSITIVE')">
          ⭐ Tích cực 4-5★ (${positive_count})
        </button>
      </div>
    </div>

    <!-- Feedback List Container -->
    <div id="feedback-list-container" class="feedback-list"></div>
    <div id="feedback-pagination"></div>
    <p id="fb-summary-text" style="color:var(--text-muted);font-size:12px;margin-top:12px"></p>
  `;

  setPageContent(html);
}

function updateFeedbackPillCounts() {
  const total = allManagerFeedbacks.length;
  const negative_count = allManagerFeedbacks.filter(f => Number(f.rating) <= 2).length;
  const neutral_count = allManagerFeedbacks.filter(f => Number(f.rating) === 3).length;
  const positive_count = allManagerFeedbacks.filter(f => Number(f.rating) >= 4).length;

  const container = document.getElementById('fb-filter-tabs');
  if (!container) return;
  const templates = [
    `Tất cả (${total})`,
    `⚠️ Tiêu cực 1-2★ (${negative_count})`,
    `😐 Trung lập 3★ (${neutral_count})`,
    `⭐ Tích cực 4-5★ (${positive_count})`
  ];
  const buttons = container.querySelectorAll('.filter-tab-btn');
  buttons.forEach((btn, idx) => {
    if (templates[idx]) btn.textContent = templates[idx];
  });
}

function updateFeedbackTabButtonsUI() {
  const container = document.getElementById('fb-filter-tabs');
  if (!container) return;
  const tabKeys = ['ALL', 'NEGATIVE', 'NEUTRAL', 'POSITIVE'];
  const buttons = container.querySelectorAll('.filter-tab-btn');
  buttons.forEach((btn, idx) => {
    if (tabKeys[idx] === managerFeedbackTab) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function setFeedbackTab(tab) {
  managerFeedbackTab = tab;
  managerFeedbackPage = 1;

  if (tab === 'ALL') {
    managerFeedbackRatingFilter = '';
    managerFeedbackStatusFilter = '';
    const statusEl = document.getElementById('fb-status');
    if (statusEl) statusEl.value = '';
  } else if (tab === 'NEGATIVE') {
    managerFeedbackRatingFilter = 'GROUP_NEGATIVE';
  } else if (tab === 'NEUTRAL') {
    managerFeedbackRatingFilter = '3';
  } else if (tab === 'POSITIVE') {
    managerFeedbackRatingFilter = 'GROUP_POSITIVE';
  }

  const ratingEl = document.getElementById('fb-rating');
  if (ratingEl) ratingEl.value = managerFeedbackRatingFilter;

  updateFeedbackTabButtonsUI();
  filterAndRenderFeedbacks();
}

function handleFeedbackRatingChange(val) {
  managerFeedbackRatingFilter = val;
  managerFeedbackPage = 1;

  if (val === 'GROUP_NEGATIVE' || val === '1' || val === '2') {
    managerFeedbackTab = 'NEGATIVE';
  } else if (val === '3') {
    managerFeedbackTab = 'NEUTRAL';
  } else if (val === 'GROUP_POSITIVE' || val === '4' || val === '5') {
    managerFeedbackTab = 'POSITIVE';
  } else if (!val) {
    managerFeedbackTab = 'ALL';
  } else {
    managerFeedbackTab = '';
  }

  updateFeedbackTabButtonsUI();
  filterAndRenderFeedbacks();
}

function handleFeedbackStatusChange(val) {
  managerFeedbackStatusFilter = val;
  managerFeedbackPage = 1;

  updateFeedbackTabButtonsUI();
  filterAndRenderFeedbacks();
}

function handleFeedbackSearch(val) {
  managerFeedbackSearch = val;
  managerFeedbackPage = 1;
  filterAndRenderFeedbacks();
}

function resetManagerFeedbackFilters() {
  managerFeedbackTab = 'ALL';
  managerFeedbackSearch = '';
  managerFeedbackRatingFilter = '';
  managerFeedbackStatusFilter = '';
  managerFeedbackPage = 1;

  const searchEl = document.getElementById('fb-search');
  const ratingEl = document.getElementById('fb-rating');
  const statusEl = document.getElementById('fb-status');
  if (searchEl) searchEl.value = '';
  if (ratingEl) ratingEl.value = '';
  if (statusEl) statusEl.value = '';

  updateFeedbackTabButtonsUI();
  filterAndRenderFeedbacks();
}

function filterAndRenderFeedbacks() {
  let list = allManagerFeedbacks || [];

  // 1. Rating filter (tab or dropdown)
  if (managerFeedbackRatingFilter === 'GROUP_NEGATIVE') {
    list = list.filter(f => Number(f.rating) <= 2);
  } else if (managerFeedbackRatingFilter === 'GROUP_POSITIVE') {
    list = list.filter(f => Number(f.rating) >= 4);
  } else if (managerFeedbackRatingFilter && !isNaN(Number(managerFeedbackRatingFilter))) {
    list = list.filter(f => Number(f.rating) === Number(managerFeedbackRatingFilter));
  } else if (managerFeedbackTab === 'NEGATIVE') {
    list = list.filter(f => Number(f.rating) <= 2);
  } else if (managerFeedbackTab === 'NEUTRAL') {
    list = list.filter(f => Number(f.rating) === 3);
  } else if (managerFeedbackTab === 'POSITIVE') {
    list = list.filter(f => Number(f.rating) >= 4);
  }

  // 2. Status filter (tab or dropdown)
  if (managerFeedbackStatusFilter) {
    list = list.filter(f => f.status === managerFeedbackStatusFilter);
  } else if (managerFeedbackTab === 'PENDING') {
    list = list.filter(f => f.status === 'PENDING');
  } else if (managerFeedbackTab === 'REPLIED') {
    list = list.filter(f => f.status === 'REPLIED');
  }

  // 3. Search query
  if (managerFeedbackSearch) {
    const q = managerFeedbackSearch.toLowerCase().trim();
    list = list.filter(f =>
      (f.customer_name || '').toLowerCase().includes(q) ||
      (f.product_name || '').toLowerCase().includes(q) ||
      (f.content || '').toLowerCase().includes(q)
    );
  }

  currentManagerFeedbacksList = list;
  renderFeedbackListPage(managerFeedbackPage);
}

function renderFeedbackListPage(page) {
  managerFeedbackPage = page;
  const container = document.getElementById('feedback-list-container');
  const paginationEl = document.getElementById('feedback-pagination');
  const summaryEl = document.getElementById('fb-summary-text');
  if (!container) return;

  const total = currentManagerFeedbacksList.length;
  if (summaryEl) {
    summaryEl.innerHTML = `Hiển thị: <strong>${total}</strong> / ${allManagerFeedbacks.length} phản hồi`;
  }

  if (total === 0) {
    container.innerHTML = `
      <div class="page-empty" style="padding:40px 20px">
        <div class="empty-icon">💬</div>
        <p>Không có phản hồi nào phù hợp điều kiện lọc.</p>
        <button class="btn btn-secondary btn-sm" onclick="resetManagerFeedbackFilters()" style="margin-top:10px">↺ Xóa bộ lọc</button>
      </div>
    `;
    if (paginationEl) paginationEl.innerHTML = '';
    return;
  }

  const maxPage = Math.max(1, Math.ceil(total / MANAGER_FEEDBACK_PAGE_SIZE));
  if (managerFeedbackPage > maxPage) managerFeedbackPage = maxPage;
  const start = (managerFeedbackPage - 1) * MANAGER_FEEDBACK_PAGE_SIZE;
  const pagedList = currentManagerFeedbacksList.slice(start, start + MANAGER_FEEDBACK_PAGE_SIZE);

  container.innerHTML = pagedList.map(f => {
    let sentimentBadge = '';
    const r = Number(f.rating);
    if (r <= 2) {
      sentimentBadge = `<span class="badge" style="background:rgba(239,68,68,0.15);color:#ef4444;font-size:11px;font-weight:700">⚠️ Tiêu cực (${r}★)</span>`;
    } else if (r === 3) {
      sentimentBadge = `<span class="badge" style="background:rgba(245,158,11,0.15);color:#d97706;font-size:11px;font-weight:600">😐 Trung lập (3★)</span>`;
    } else {
      sentimentBadge = `<span class="badge" style="background:rgba(16,185,129,0.15);color:#10b981;font-size:11px;font-weight:600">⭐ Tích cực (${r}★)</span>`;
    }

    return `
      <div class="feedback-card" style="transition:box-shadow 0.2s">
        <div class="feedback-header">
          <div class="feedback-meta">
            <div class="feedback-customer" style="font-weight:700;font-size:14px">👩 ${escapeHtml(f.customer_name || 'Khách hàng')}</div>
            <div class="feedback-product" style="color:var(--text-muted);font-size:12px">💄 ${escapeHtml(f.product_name || 'Sản phẩm')}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div class="stars" style="color:#fbbf24">${renderStars(f.rating)}</div>
            ${sentimentBadge}
            ${f.status === 'PENDING'
              ? `<span class="badge badge-pending">⏳ Chờ phản hồi</span>`
              : `<span class="badge badge-replied">✅ Đã phản hồi</span>`}
            <span style="font-size:11px;color:var(--text-muted)">${formatDateTime(f.created_at)}</span>
          </div>
        </div>
        <p class="feedback-content" style="margin:10px 0;line-height:1.5">${escapeHtml(f.content || '(Không có nội dung)')}</p>
        ${f.reply_content ? `
          <div class="feedback-reply" style="background:var(--green-50);border-left:3px solid var(--green-600);border-radius:4px;padding:10px 14px;margin-top:10px">
            <div class="feedback-reply-label" style="font-weight:700;color:var(--green-800);font-size:12px;margin-bottom:4px">💬 Phản hồi của bộ phận CSKH:</div>
            <div class="feedback-reply-text" style="color:var(--text-main);font-size:13px">${escapeHtml(f.reply_content)}</div>
          </div>
        ` : `
          <div style="display:flex;gap:8px;margin-top:12px">
            <textarea id="reply-${f.id}" placeholder="Nhập nội dung phản hồi cho khách hàng..." style="flex:1;min-height:60px;padding:8px 12px;font-size:12px;border-radius:6px;border:1px solid var(--border)"></textarea>
            <button class="btn btn-success btn-sm" onclick="replyFeedback(${f.id})" style="align-self:flex-end;padding:8px 16px">📤 Gửi</button>
          </div>
        `}
      </div>
    `;
  }).join('');

  if (paginationEl) {
    paginationEl.innerHTML = renderPaginationBar({
      totalItems: total,
      pageSize: MANAGER_FEEDBACK_PAGE_SIZE,
      currentPage: managerFeedbackPage,
      onPageChangeFnName: 'renderFeedbackListPage'
    });
  }
}

function filterFeedbacks() {
  filterAndRenderFeedbacks();
}

async function replyFeedback(id) {
  const content = document.getElementById(`reply-${id}`)?.value.trim();
  if (!content) { toast('Vui lòng nhập nội dung phản hồi', 'error'); return; }
  try {
    await api('PUT', `/api/manager/feedbacks/${id}/reply`, { reply_content: content });
    toast('Đã gửi phản hồi thành công!', 'success');
    const feedbacks = await api('GET', '/api/manager/feedbacks');
    allManagerFeedbacks = feedbacks || [];
    updateFeedbackPillCounts();
    filterAndRenderFeedbacks();
  } catch (e) { toast(e.message, 'error'); }
}
