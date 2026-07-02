/* ===== 库存台账模块 ===== */
const InventoryModule = {
  page: 1,
  totalPages: 1,
  total: 0,

  _initWarehouseFilter() {
    const el = document.getElementById("invWarehouseFilter");
    if (!el || el.dataset.initialized) return;
    const whList = (APP.initData && APP.initData.warehouses) || [];
    const opts = whList.map(w => ({ value: w.code, label: `${w.code}-${w.name}` }));
    setupMultiSelect("invWarehouseFilter", opts, [], () => {
      InventoryModule.page = 1;
      InventoryModule.load();
    }, true);
    el.dataset.initialized = "true";
  },

  async load() {
    this._initWarehouseFilter();
    const container = document.getElementById("invContent");
    const keyword = document.getElementById("invInventorySearch")?.value || "";

    // 读取多选组件选中的仓库编码
    const filterEl = document.getElementById("invWarehouseFilter");
    const warehouseCodes = filterEl && filterEl.dataset.selectedValues
      ? filterEl.dataset.selectedValues.split(",").filter(Boolean)
      : [];

    try {
      const params = new URLSearchParams({ page: this.page, limit: 16 });
      if (keyword) params.set("keyword", keyword);
      if (warehouseCodes.length > 0) params.set("warehouse_code", warehouseCodes.join(","));
      const resp = await fetch(`/api/v1/inventory?${params}`);
      const data = await resp.json();
      this.total = data.total || 0;
      this.totalPages = Math.ceil(this.total / 16) || 1;
      const items = data.items || [];
      document.getElementById("invTotalCount").textContent = this.total;

      if (items.length === 0) {
        container.innerHTML = `<div class="card"><div class="card-body" style="text-align:center;padding:40px;color:#9aa0a6">暂无库存数据，请先生成点收单或领用单</div></div>` + this._renderPagination();
        return;
      }

      let totalBalanceQty = 0, totalBalanceAmt = 0;
      container.innerHTML = `
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>材料名称</th><th>规格型号</th><th>单位</th><th>仓库</th>
              <th style="text-align:right">入库总数量</th><th style="text-align:right">入库总金额</th>
              <th style="text-align:right">出库总数量</th><th style="text-align:right">出库总金额</th>
              <th style="text-align:right;color:#1a73e8">库存余量</th><th style="text-align:right;color:#1a73e8">库存金额</th>
            </tr></thead>
            <tbody>${items.map(item => {
              totalBalanceQty += item.balance_qty;
              totalBalanceAmt += item.balance_amt;
              const isNegative = item.balance_qty < 0;
              return `<tr>
                <td>${esc(item.material_name)}</td>
                <td>${item.spec || ''}</td>
                <td>${esc(item.unit)}</td>
                <td>${esc(item.warehouse_code)}${esc(item.warehouse_name)}</td>
                <td style="text-align:right">${fmtQty(item.in_qty)}</td>
                <td style="text-align:right">${item.in_amt.toFixed(2)}</td>
                <td style="text-align:right">${fmtQty(item.out_qty)}</td>
                <td style="text-align:right">${item.out_amt.toFixed(2)}</td>
                <td style="text-align:right;font-weight:700;color:${isNegative ? '#ea4335' : '#1a73e8'}">${fmtQty(item.balance_qty)}</td>
                <td style="text-align:right;font-weight:600;color:${isNegative ? '#ea4335' : '#1a73e8'}">${item.balance_amt.toFixed(2)}</td>
              </tr>`;
            }).join('')}</tbody>
            <tfoot><tr style="font-weight:700;background:#f8f9fa;border-top:2px solid #e0e0e0">
              <td colspan="4" style="text-align:right">合计</td>
              <td style="text-align:right">-</td><td style="text-align:right">-</td>
              <td style="text-align:right">-</td><td style="text-align:right">-</td>
              <td style="text-align:right;color:#1a73e8">${fmtQty(totalBalanceQty)}</td>
              <td style="text-align:right;color:#1a73e8">${totalBalanceAmt.toFixed(2)}</td>
            </tr></tfoot>
          </table>
        </div>
        <div style="margin-top:8px;font-size:12px;color:#5f6368">共 ${this.total} 种材料</div>
      ` + this._renderPagination();
    } catch (e) {
      container.innerHTML = '<div class="alert alert-danger">加载失败</div>';
    }
  },

  _renderPagination() {
    return renderPagination(this.page, this.totalPages, 'InventoryModule.loadPage');
  },

  loadPage(page) {
    this.page = page;
    this.load();
  },

  exportExcel() {
    const keyword = document.getElementById("invInventorySearch")?.value || "";
    const filterEl = document.getElementById("invWarehouseFilter");
    const warehouseCodes = filterEl && filterEl.dataset.selectedValues
      ? filterEl.dataset.selectedValues.split(",").filter(Boolean)
      : [];
    const params = new URLSearchParams();
    if (keyword) params.set("keyword", keyword);
    if (warehouseCodes.length > 0) params.set("warehouse_code", warehouseCodes.join(","));
    const a = document.createElement('a');
    a.href = `/api/v1/inventory/export?${params}`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },
};
