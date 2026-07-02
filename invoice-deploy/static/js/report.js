/* ===== 汇总报表模块（方案A：统一筛选+综合表格+分页） ===== */
const ReportModule = {
  page: 1,
  pageSize: 14,
  total: 0,
  totalPages: 1,
  _allItems: [],
  _view: 'detail',
  _groupedData: {},
  _whData: [],      // 收发存仓库数据
  _whTotal: {},     // 收发存合计

  async load() {
    try {
      const params = this._getFilterParams();
      const queryResp = await fetch(`/api/v1/reports/query?${params}`);
      const data = await queryResp.json();

      this._initFilters(data.filters);
      this._renderSummary(data.summary);
      this._allItems = data.items || [];
      this._groupedData = {
        warehouse: data.grouped_by_warehouse || [],
        project: data.grouped_by_project || [],
        supplier: data.grouped_by_supplier || [],
      };
      this._renderView();
    } catch (e) {
      console.error("Report load error:", e);
      toast("加载报表失败", "error");
    }
  },

  setView(view) {
    this._view = view;
    document.querySelectorAll('[id^="rptView"]').forEach(b => {
      b.className = b.id === 'rptView' + view.charAt(0).toUpperCase() + view.slice(1)
        ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
    });
    this._renderView();
  },

  _renderView() {
    if (this._view === 'detail') {
      this.total = this._allItems.length;
      this.totalPages = Math.ceil(this.total / this.pageSize) || 1;
      this.page = 1;
      this._renderPage();
    } else if (this._view === 'warehouse') {
      this._loadWarehouseView();
    } else {
      const items = this._groupedData[this._view] || [];
      this.total = items.length;
      this.totalPages = Math.ceil(this.total / this.pageSize) || 1;
      this.page = 1;
      this._renderGroupedPage();
    }
  },

  async _loadWarehouseView() {
    try {
      const params = this._getFilterParams();
      const years = params.get('years') || String(new Date().getFullYear());
      const months = params.get('months') || String(new Date().getMonth() + 1).padStart(2, '0');
      const year = years.split(',')[0];
      const month = months.split(',')[0];
      const resp = await fetch('/api/v1/reports/warehouse-print?year=' + year + '&month=' + month);
      const data = await resp.json();
      // 如果用户已经切换到其他页面，不再渲染（检查报表tab是否可见）
      const rptTab = document.getElementById('tab-reports');
      if (!rptTab || rptTab.style.display === 'none') return;
      this._whData = data.warehouses || [];
      this._whTotal = data.total || {};
      this.total = this._whData.length;
      this.totalPages = Math.ceil(this.total / this.pageSize) || 1;
      this.page = 1;
      this._renderWarehousePage();
    } catch (e) {
      toast('加载收发存数据失败', 'error');
      console.error(e);
    }
  },

  _renderWarehousePage() {
    const tbody = document.getElementById('rptTableBody');
    const thead = document.querySelector('#rptTable thead tr');
    // 收发存汇总表表头
    thead.innerHTML = '<th style="font-weight:600">仓库</th><th style="text-align:right">期初金额</th><th style="text-align:right">收入金额</th><th style="text-align:right">发出金额</th><th style="text-align:right">结存金额</th>';

    const start = (this.page - 1) * this.pageSize;
    const end = start + this.pageSize;
    const pageItems = this._whData.slice(start, end);

    if (pageItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#9aa0a6">暂无数据</td></tr>';
      return;
    }

    let totalOpening = 0, totalIncome = 0, totalExpense = 0, totalBalance = 0;
    tbody.innerHTML = pageItems.map(function(w) {
      totalOpening += w.opening || 0;
      totalIncome += w.income || 0;
      totalExpense += w.expense || 0;
      totalBalance += w.balance || 0;
      return '<tr>' +
        '<td style="font-weight:600">' + esc(w.code) + esc(w.name) + '</td>' +
        '<td style="text-align:right">¥' + (w.opening || 0).toLocaleString('zh-CN', {minimumFractionDigits: 2}) + '</td>' +
        '<td style="text-align:right;color:#1a73e8;font-weight:600">¥' + (w.income || 0).toLocaleString('zh-CN', {minimumFractionDigits: 2}) + '</td>' +
        '<td style="text-align:right;color:#ea8600;font-weight:600">¥' + (w.expense || 0).toLocaleString('zh-CN', {minimumFractionDigits: 2}) + '</td>' +
        '<td style="text-align:right">¥' + (w.balance || 0).toLocaleString('zh-CN', {minimumFractionDigits: 2}) + '</td>' +
        '</tr>';
    }).join('');
    // 合计行
    tbody.innerHTML += '<tr style="font-weight:700;background:#f8f9fa;border-top:2px solid #e0e0e0">' +
      '<td style="text-align:right;color:#202124">合计</td>' +
      '<td style="text-align:right">¥' + totalOpening.toLocaleString('zh-CN', {minimumFractionDigits: 2}) + '</td>' +
      '<td style="text-align:right;color:#1a73e8">¥' + totalIncome.toLocaleString('zh-CN', {minimumFractionDigits: 2}) + '</td>' +
      '<td style="text-align:right;color:#ea8600">¥' + totalExpense.toLocaleString('zh-CN', {minimumFractionDigits: 2}) + '</td>' +
      '<td style="text-align:right">¥' + totalBalance.toLocaleString('zh-CN', {minimumFractionDigits: 2}) + '</td>' +
      '</tr>';

    // 更新底部汇总
    document.getElementById('sumRecvAmt').textContent = '¥' + totalIncome.toFixed(2);
    document.getElementById('sumUseAmt').textContent = '¥' + totalExpense.toFixed(2);

    this._renderPagination();
  },

  _renderGrouped(groupBy, items) {
    const tbody = document.getElementById('rptTableBody');
    const thead = document.querySelector('#rptTable thead tr');

    // 更新表头匹配分组视图
    const headers = {
      warehouse: ['<th style="font-weight:600">仓库</th>', '<th style="text-align:center">点收单数</th>', '<th style="text-align:right">点收金额</th>', '<th style="text-align:center">领用单数</th>', '<th style="text-align:right">领用金额</th>'],
      project: ['<th style="font-weight:600">工程编号</th>', '<th>工程名称</th>', '<th style="text-align:center">点收单数</th>', '<th style="text-align:right">点收金额</th>', '<th style="text-align:center">领用单数</th>', '<th style="text-align:right">领用金额</th>'],
      supplier: ['<th style="font-weight:600">供应商</th>', '<th style="text-align:center">点收单数</th>', '<th style="text-align:right">点收金额</th>', '<th style="text-align:center">领用单数</th>', '<th style="text-align:right">领用金额</th>'],
    };
    thead.innerHTML = headers[groupBy].join('');
    tbody.innerHTML = '';

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#9aa0a6">暂无数据</td></tr>';
      return;
    }

    let totalRecvCnt = 0, totalRecvAmt = 0, totalUseCnt = 0, totalUseAmt = 0;

    function totalRow(cell1) {
      return `<tr style="font-weight:700;background:#f8f9fa;border-top:2px solid #e0e0e0">
        ${cell1}
        <td style="text-align:center">${totalRecvCnt}</td>
        <td style="text-align:right;color:#1a73e8">¥${totalRecvAmt.toFixed(2)}</td>
        <td style="text-align:center">${totalUseCnt}</td>
        <td style="text-align:right;color:#ea8600">¥${totalUseAmt.toFixed(2)}</td>
      </tr>`;
    }

    if (groupBy === 'warehouse') {
      tbody.innerHTML = items.map(item => {
        totalRecvCnt += item.recv_cnt || 0;
        totalRecvAmt += item.recv_amt || 0;
        totalUseCnt += item.use_cnt || 0;
        totalUseAmt += item.use_amt || 0;
        return `<tr>
          <td style="font-weight:600">${esc(item.code)}${esc(item.name)}</td>
          <td style="text-align:center">${item.recv_cnt || 0}</td>
          <td style="text-align:right;color:#1a73e8;font-weight:600">¥${(item.recv_amt || 0).toFixed(2)}</td>
          <td style="text-align:center">${item.use_cnt || 0}</td>
          <td style="text-align:right;color:#ea8600;font-weight:600">¥${(item.use_amt || 0).toFixed(2)}</td>
        </tr>`;
      }).join('');
      tbody.innerHTML += totalRow('<td style="text-align:right;color:#202124">合计</td>');
    } else if (groupBy === 'project') {
      tbody.innerHTML = items.map(item => {
        totalRecvCnt += item.recv_cnt || 0;
        totalRecvAmt += item.recv_amt || 0;
        totalUseCnt += item.use_cnt || 0;
        totalUseAmt += item.use_amt || 0;
        return `<tr>
          <td style="font-weight:600">${esc(item.project_no)}</td>
          <td>${esc(item.project_name)}</td>
          <td style="text-align:center">${item.recv_cnt || 0}</td>
          <td style="text-align:right;color:#1a73e8;font-weight:600">¥${(item.recv_amt || 0).toFixed(2)}</td>
          <td style="text-align:center">${item.use_cnt || 0}</td>
          <td style="text-align:right;color:#ea8600;font-weight:600">¥${(item.use_amt || 0).toFixed(2)}</td>
        </tr>`;
      }).join('');
      tbody.innerHTML += totalRow('<td colspan="2" style="text-align:right;color:#202124">合计</td>');
    } else if (groupBy === 'supplier') {
      tbody.innerHTML = items.map(item => {
        totalRecvCnt += item.recv_cnt || 0;
        totalRecvAmt += item.recv_amt || 0;
        totalUseCnt += item.use_cnt || 0;
        totalUseAmt += item.use_amt || 0;
        return `<tr>
          <td style="font-weight:600">${esc(item.supplier)}</td>
          <td style="text-align:center">${item.recv_cnt || 0}</td>
          <td style="text-align:right;color:#1a73e8;font-weight:600">¥${(item.recv_amt || 0).toFixed(2)}</td>
          <td style="text-align:center">${item.use_cnt || 0}</td>
          <td style="text-align:right;color:#ea8600;font-weight:600">¥${(item.use_amt || 0).toFixed(2)}</td>
        </tr>`;
      }).join('');
      tbody.innerHTML += totalRow('<td style="text-align:right;color:#202124">合计</td>');
    }
  },

  _getFilterParams() {
    const params = new URLSearchParams();

    function getSelected(id) {
      const el = document.getElementById(id);
      if (!el || !el.dataset.selectedValues) return [];
      return el.dataset.selectedValues.split(',').filter(Boolean);
    }

    const years = getSelected('rptYears');
    if (years.length > 0) params.set('years', years.join(','));

    const months = getSelected('rptMonths');
    if (months.length > 0) params.set('months', months.join(','));

    const projects = getSelected('rptProject');
    if (projects.length > 0) params.set('project_no', projects.join(','));

    const warehouses = getSelected('rptWarehouse');
    if (warehouses.length > 0) params.set('warehouse_code', warehouses.join(','));

    const suppliers = getSelected('rptSupplier');
    if (suppliers.length > 0) params.set('supplier_name', suppliers.join(','));

    return params;
  },

  _initFilters(filters) {
    if (!filters) return;

    const yearEl = document.getElementById('rptYears');
    if (yearEl && !yearEl.dataset.initialized) {
      const opts = (filters.years || []).map(y => ({ value: y, label: y }));
      setupMultiSelect('rptYears', opts, [], () => this.load());
      yearEl.dataset.initialized = 'true';
    }

    const monthEl = document.getElementById('rptMonths');
    if (monthEl && !monthEl.dataset.initialized) {
      const opts = '01,02,03,04,05,06,07,08,09,10,11,12'.split(',').map(m => ({ value: m, label: m + '月' }));
      setupMultiSelect('rptMonths', opts, [], () => this.load());
      monthEl.dataset.initialized = 'true';
    }

    const projEl = document.getElementById('rptProject');
    if (projEl && !projEl.dataset.initialized && filters.projects) {
      const opts = filters.projects.map(p => ({ value: p.project_no, label: `${p.project_no} - ${p.project_name}` }));
      setupMultiSelect('rptProject', opts, [], () => this.load(), true);
      projEl.dataset.initialized = 'true';
    }

    const whEl = document.getElementById('rptWarehouse');
    if (whEl && !whEl.dataset.initialized && filters.warehouses) {
      const opts = filters.warehouses.map(w => ({ value: w.code, label: `${w.code}-${w.name}` }));
      setupMultiSelect('rptWarehouse', opts, [], () => this.load(), true);
      whEl.dataset.initialized = 'true';
    }

    const supEl = document.getElementById('rptSupplier');
    if (supEl && !supEl.dataset.initialized && filters.suppliers) {
      const opts = filters.suppliers.map(s => ({ value: s.name, label: s.name }));
      setupMultiSelect('rptSupplier', opts, [], () => this.load(), true);
      supEl.dataset.initialized = 'true';
    }
  },

  _renderSummary(summary) {
    if (!summary) return;
    document.getElementById('sumRecvAmt').textContent = `¥${(summary.recv_amt || 0).toLocaleString('zh-CN', {minimumFractionDigits: 2})}`;
    document.getElementById('sumUseAmt').textContent = `¥${(summary.use_amt || 0).toLocaleString('zh-CN', {minimumFractionDigits: 2})}`;
    document.getElementById('sumRecvCnt').textContent = `${summary.recv_cnt || 0} 张`;
    document.getElementById('sumUseCnt').textContent = `${summary.use_cnt || 0} 张`;
  },

  _renderPage() {
    const start = (this.page - 1) * this.pageSize;
    const pageItems = this._allItems.slice(start, start + this.pageSize);
    this._renderTable(pageItems);
    this._renderPagination();
  },

  _renderTable(items) {
    const tbody = document.getElementById('rptTableBody');
    // 恢复明细视图的 9 列表头
    const thead = document.querySelector('#rptTable thead tr');
    thead.innerHTML = '<th style="text-align:center">月份</th><th style="text-align:center">工程编号</th><th>工程名称</th><th>仓库</th><th>供应商</th><th style="text-align:center">点收单数</th><th style="text-align:right">点收金额</th><th style="text-align:center">领用单数</th><th style="text-align:right">领用金额</th>';
    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#9aa0a6">暂无数据</td></tr>';
      return;
    }

    let totalRecvCnt = 0, totalRecvAmt = 0, totalUseCnt = 0, totalUseAmt = 0;

    tbody.innerHTML = items.map(item => {
      totalRecvCnt += item.recv_cnt || 0;
      totalRecvAmt += item.recv_amt || 0;
      totalUseCnt += item.use_cnt || 0;
      totalUseAmt += item.use_amt || 0;

      return `<tr>
        <td style="text-align:center;font-weight:600">${esc(item.ym || '')}</td>
        <td style="text-align:center">${esc(item.project_no || '')}</td>
        <td>${esc(item.project_name || '')}</td>
        <td>${esc(item.warehouse_code || '')}${esc(item.warehouse_name || '')}</td>
        <td>${esc(item.supplier || '')}</td>
        <td style="text-align:center">${item.recv_cnt || 0}</td>
        <td style="text-align:right;color:#1a73e8;font-weight:600">¥${(item.recv_amt || 0).toFixed(2)}</td>
        <td style="text-align:center">${item.use_cnt || 0}</td>
        <td style="text-align:right;color:#ea8600;font-weight:600">¥${(item.use_amt || 0).toFixed(2)}</td>
      </tr>`;
    }).join('');

    tbody.innerHTML += `<tr style="font-weight:700;background:#f8f9fa;border-top:2px solid #e0e0e0">
      <td colspan="5" style="text-align:right;color:#202124">合计</td>
      <td style="text-align:center">${totalRecvCnt}</td>
      <td style="text-align:right;color:#1a73e8">¥${totalRecvAmt.toFixed(2)}</td>
      <td style="text-align:center">${totalUseCnt}</td>
      <td style="text-align:right;color:#ea8600">¥${totalUseAmt.toFixed(2)}</td>
    </tr>`;
  },

  _renderPagination() {
    const container = document.getElementById('rptPagination');
    if (!container) return;
    container.innerHTML = renderPagination(this.page, this.totalPages, 'ReportModule.loadPage');
  },

  _renderGroupedPage() {
    const allItems = this._groupedData[this._view] || [];
    const start = (this.page - 1) * this.pageSize;
    const pageItems = allItems.slice(start, start + this.pageSize);
    this._renderGrouped(this._view, pageItems);
    this._renderPagination();
  },

  loadPage(p) {
    this.page = p;
    if (this._view === 'detail') {
      this._renderPage();
    } else if (this._view === 'warehouse') {
      this._renderWarehousePage();
    } else {
      this._renderGroupedPage();
    }
  },

  exportExcel() {
    const params = this._getFilterParams();
    if (this._view !== 'detail') params.set('view', this._view);
    const a = document.createElement('a');
    a.href = `/api/v1/reports/query/export?${params.toString()}`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  printReport() {
    if (this._view === 'warehouse') {
      this._printWarehouseReport();
      return;
    }
    const table = document.getElementById('rptTable');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (tbody && tbody.children.length === 1 && tbody.innerHTML.includes('暂无数据')) {
      toast('没有数据可打印', 'warning');
      return;
    }
    const viewNames = { detail: '明细', warehouse: '按仓库', project: '按工程', supplier: '按供应商' };
    const title = '汇总报表（' + (viewNames[this._view] || '明细') + '）';
    const recvAmt = document.getElementById('sumRecvAmt')?.textContent || '-';
    const useAmt = document.getElementById('sumUseAmt')?.textContent || '-';
    const theadHTML = table.querySelector('thead')?.innerHTML || '';
    const tbodyHTML = table.querySelector('tbody')?.innerHTML || '';
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + title + '</title>' +
      '<style>' +
      '@page{size:landscape;margin:12mm}' +
      'body{font-family:"Microsoft YaHei","SimSun",sans-serif;margin:0;padding:16px;font-size:12px}' +
      'h2{text-align:center;margin-bottom:6px;font-size:16px}' +
      '.meta{text-align:center;font-size:11px;color:#666;margin-bottom:14px}' +
      'table{width:100%;border-collapse:collapse}' +
      'th,td{border:1px solid #000;padding:3px 5px;text-align:center;font-size:11px}' +
      'th{background:#f0f0f0;font-weight:700}' +
      '</style>' +
      '</head><body>' +
      '<h2>' + title + '</h2>' +
      '<div class="meta">点收合计: ' + recvAmt + ' | 领用合计: ' + useAmt + '</div>' +
      '<table>' + theadHTML + tbodyHTML + '</table>' +
      '</body></html>';
    // 用隐藏 iframe 打印，避免弹出窗口劫持焦点
    var iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none';
    document.body.appendChild(iframe);
    var w = iframe.contentWindow;
    w.document.write(html);
    w.document.close();
    setTimeout(function() {
      w.print();
      setTimeout(function() { document.body.removeChild(iframe); window.focus(); }, 200);
    }, 500);
  },

  async _printWarehouseReport() {
    const params = this._getFilterParams();
    const years = params.get('years') || '';
    const months = params.get('months') || '';
    const year = years.split(',')[0] || new Date().getFullYear().toString();
    const month = months.split(',')[0] || String(new Date().getMonth() + 1).padStart(2, '0');
    try {
      const resp = await fetch('/api/v1/reports/warehouse-print?year=' + year + '&month=' + month);
      const data = await resp.json();
      const rows = data.warehouses || [];
      const t = data.total || {};
      const fmt = function(n) { return (n || 0).toLocaleString('zh-CN', {minimumFractionDigits: 2}); };
      const rowsHtml = rows.map(function(w) {
        if (!w.opening && !w.income && !w.expense && !w.balance) return '';
        return '<tr><td style="padding:3px 6px;text-align:center">' + w.code + w.name + '</td>' +
          '<td style="padding:3px 6px;text-align:right">' + fmt(w.opening) + '</td>' +
          '<td style="padding:3px 6px;text-align:right">' + fmt(w.income) + '</td>' +
          '<td style="padding:3px 6px;text-align:right">' + fmt(w.expense) + '</td>' +
          '<td style="padding:3px 6px;text-align:right">' + fmt(w.balance) + '</td></tr>';
      }).filter(function(r) { return r; }).join('');
      var user = typeof currentUser !== 'undefined' && currentUser ? currentUser.display_name || currentUser.username : '';
      const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>收发存汇总表</title><style>' +
        '@page{size:portrait;margin:10mm 15mm}' +
        'body{font-family:"Microsoft YaHei","SimSun",sans-serif;margin:0;padding:0;font-size:12px}' +
        'h2{text-align:center;font-size:22px;margin:10px 0 24px 0;letter-spacing:6px}' +
        '.meta{font-size:14px;margin-bottom:4px}' +
        '.meta2{font-size:14px;margin-bottom:12px}' +
        'table{width:100%;border-collapse:collapse}' +
        'th,td{border:1px solid #000;padding:5px 8px;font-size:12px}' +
        'th{background:#f0f0f0;font-weight:700;text-align:center}' +
        '.total td{font-weight:700;background:#f8f8f8}' +
        '.footer{display:flex;justify-content:space-between;margin-top:28px;font-size:14px}' +
        '</style></head><body>' +
        '<h2>收 发 存 汇 总 表</h2>' +
        '<div class="meta">记账日期：' + data.month_start + '~' + data.month_end + '</div>' +
        '<div class="meta2">仓库：' + rows.map(function(w) { return w.code + w.name; }).join('、') + '</div>' +
        '<table><thead><tr><th style="width:18%">仓 库</th><th style="width:18%">期初金额</th><th style="width:20%">收入金额</th><th style="width:20%">发出金额</th><th style="width:18%">结存金额</th></tr></thead><tbody>' +
        rowsHtml +
        '<tr class="total"><td style="text-align:center">合 计</td><td style="text-align:right">' + fmt(t.opening) + '</td><td style="text-align:right">' + fmt(t.income) + '</td><td style="text-align:right">' + fmt(t.expense) + '</td><td style="text-align:right">' + fmt(t.balance) + '</td></tr>' +
        '</tbody></table>' +
        '<div class="footer"><span>单位：天津港航安装工程有限公司</span><span>制表：' + user + '</span></div>' +
        '<div style="text-align:right;font-size:14px;margin-top:8px">打印日期：' + data.print_date + '</div>' +
        '</body></html>';
      // 用隐藏 iframe 打印，避免弹出窗口劫持焦点
      var iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none';
      document.body.appendChild(iframe);
      var w = iframe.contentWindow;
      w.document.write(html);
      w.document.close();
      setTimeout(function() {
        w.print();
        setTimeout(function() { document.body.removeChild(iframe); window.focus(); }, 200);
      }, 500);
    } catch (e) {
      toast('获取打印数据失败', 'error');
      console.error(e);
    }
  },
};
