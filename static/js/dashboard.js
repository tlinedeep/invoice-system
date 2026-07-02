/* ===== 数据看板模块（含 Chart.js 图表） ===== */
const DashboardModule = {
  _whChart: null,
  _trendChart: null,

  async load() {
    try {
      const statsResp = await fetch("/api/v1/dashboard/stats");
      const stats = await statsResp.json();

      this._renderStats(stats);
      this._renderWarehouseChart(stats.warehouse_summary || []);
      this._renderTrendChart();
    } catch (e) {
      console.error("Dashboard error:", e);
    }
  },

  _renderStats(stats) {
    const container = document.getElementById("dashStats");
    const cards = [
      { label: "本月点收金额", value: `¥${stats.monthly_recv_amt?.toFixed(2) || '0.00'}`, color: "#1a73e8" },
      { label: "本月点收单数", value: `${stats.monthly_recv_cnt || 0} 张`, color: "#34a853" },
      { label: "本月领用金额", value: `¥${stats.monthly_use_amt?.toFixed(2) || '0.00'}`, color: "#ea8600" },
      { label: "本月领用单数", value: `${stats.monthly_use_cnt || 0} 张`, color: "#ea4335" },
      { label: "本月发票数", value: `${stats.monthly_inv_cnt || 0} 张`, color: "#5f6368" },
      { label: "供应商总数", value: `${stats.supplier_cnt || 0} 家`, color: "#9334e6" },
    ];
    container.innerHTML = cards.map(c => `
      <div style="background:#f8f9fa;border-radius:8px;padding:16px;text-align:center;border:1px solid #e0e0e0">
        <div style="font-size:13px;color:#5f6368;margin-bottom:6px">${esc(c.label)}</div>
        <div style="font-size:24px;font-weight:700;color:${c.color}">${c.value}</div>
      </div>
    `).join("");
  },

  _renderWarehouseChart(whList) {
    const canvas = document.getElementById("warehouseChart");
    if (!canvas) return;

    // 保留原始文本列表（无数据时显示）
    const textContainer = document.getElementById("dashWarehouses");
    if (whList.length === 0) {
      textContainer.innerHTML = '<div style="padding:8px 0;text-align:center;color:#9aa0a6;font-size:14px">暂无数据</div>';
      canvas.style.display = "none";
      return;
    }
    canvas.style.display = "block";
    // 顶部显示简短文字汇总
    textContainer.innerHTML = `<div style="font-size:13px;color:#5f6368;margin-bottom:4px">共 ${whList.length} 个仓库有入库记录</div>`;

    if (this._whChart) this._whChart.destroy();

    const labels = whList.map(w => `${w.code}-${w.name}`);
    const values = whList.map(w => w.total_in_amt);
    const colors = ["#1a73e8","#34a853","#ea8600","#ea4335","#9334e6","#0d7c7c",
                    "#c5221f","#f9ab00","#185abc","#137333","#e37400","#b31412",
                    "#8e24aa","#00acc1"];

    this._whChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "入库金额 (¥)",
          data: values,
          backgroundColor: colors.slice(0, labels.length),
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => "¥" + (v/10000).toFixed(1) + "万" } },
          x: { ticks: { maxRotation: 30, font: { size: 11 } } }
        }
      }
    });
  },

  async _renderTrendChart() {
    const canvas = document.getElementById("trendChart");
    if (!canvas) return;

    try {
      // 从报表接口获取月度数据
      const resp = await fetch("/api/v1/reports/monthly");
      const data = await resp.json();
      const monthlyData = (data.monthly_recv || []).slice().reverse();

      if (this._trendChart) this._trendChart.destroy();

      if (monthlyData.length === 0) {
        canvas.style.display = "none";
        return;
      }
      canvas.style.display = "block";

      this._trendChart = new Chart(canvas, {
        type: "line",
        data: {
          labels: monthlyData.map(d => d.ym),
          datasets: [
            {
              label: "点收金额",
              data: monthlyData.map(d => d.amt),
              borderColor: "#1a73e8",
              backgroundColor: "rgba(26,115,232,0.08)",
              fill: true,
              tension: 0.3,
              pointRadius: 4,
              pointHoverRadius: 6,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => "¥" + ctx.parsed.y.toFixed(2) } }
          },
          scales: {
            y: { beginAtZero: true, ticks: { callback: v => "¥" + (v/10000).toFixed(1) + "万" } },
            x: { ticks: { maxRotation: 30, font: { size: 11 } } }
          }
        }
      });
    } catch (e) { /* 静默失败，无数据显示不影响 */ }
  },

};
