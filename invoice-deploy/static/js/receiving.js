/* ===== 点收单模块 ===== */
const ReceivingModule = {
  page: 1,
  totalPages: 1,
  total: 0,
  async createFromInvoice() {
    if (!APP.currentInvoiceId) {
      toast("请先导入发票", "error");
      return;
    }

    const projectNo = document.getElementById("piProjectNo").value;
    if (!projectNo) {
      toast("请选择工程编号", "error");
      return;
    }

    // 校验工程编号是否有效
    const projectName = document.getElementById("piProjectName").value;
    if (!projectName) {
      toast("工程编号无效，请从搜索结果中选择", "error");
      document.getElementById("piProjectNo").style.borderColor = "#ea4335";
      return;
    }

    // 校验记账人、采购员、领用人：必填且必须在人员列表中
    var _personnelValid = function(input, label, listKey) {
      var val = input.value.trim();
      if (!val) { toast("请选择" + label, "error"); input.focus(); return false; }
      var list = (APP.initData && APP.initData[listKey]) || [];
      if (!list.some(function(p) { return p.name === val; })) {
        toast("「" + val + "」不在单据人员列表中，请先在基础配置中添加", "error");
        input.focus();
        return false;
      }
      return true;
    };
    if (!_personnelValid(document.getElementById("piAccountant"), "记账人", "accountants")) return;
    if (!_personnelValid(document.getElementById("piBuyer"), "采购员", "buyers")) return;
    if (!_personnelValid(document.getElementById("piRecipient"), "领用人", "recipients")) return;

    // 校验仓库是否有效
    const whInput = document.getElementById("piWarehouse");
    const whVal = whInput.value.trim();
    const whList = (APP.initData && APP.initData.warehouses) || [];
    if (whVal && !whList.some(w => w.label === whVal)) {
      toast("仓库编码无效，请从搜索结果中选择", "error");
      whInput.style.borderColor = "#ea4335";
      return;
    }

    // 收集用户在表单中编辑过的数据
    const edited = InvoiceModule.getEditedData();
    const whCode = edited.warehouse ? edited.warehouse.split("-")[0] : "00";

    const data = {
      invoice_id: APP.currentInvoiceId,
      project_no: projectNo,
      project_name: document.getElementById("piProjectName").value,
      accountant: document.getElementById("piAccountant").value,
      buyer: document.getElementById("piBuyer").value,
      recipient: document.getElementById("piRecipient").value,
      date: document.getElementById("piRecvDate")?.value || new Date().toISOString().split("T")[0],
      override: {
        seller_name: edited.seller_name,
        seller_tax_no: edited.seller_tax_no || "",
        invoice_no: edited.invoice_no,
        is_special_tax: edited.is_special_tax,
        warehouse_code: whCode,
        items: edited.items,
      },
    };

    try {
      const resp = await fetch("/api/v1/receiving-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "创建失败");
      }

      const result = await resp.json();
      toast(`点收单 ${esc(result.note_no)} 创建成功`, "success");

      // 切换到点收单tab查看
      switchTab("receiving");
      this.loadList();
      loadRecent();
    } catch (e) {
      toast(e.message, "error");
    }
  },

  async loadList() {
    const container = document.getElementById("recvList");
    const detail = document.getElementById("recvDetail");
    detail.style.display = "none";

    try {
      const keyword = document.getElementById("recvSearch")?.value || "";
      const isMulti = document.getElementById("rdBatchMode")?.checked;
      document.getElementById("rdBatchExportBtn").style.display = isMulti ? "inline-flex" : "none";
      document.getElementById("rdSelectAllLabel").style.display = isMulti ? "inline-flex" : "none";
      if (isMulti) document.getElementById("rdSelectAll").checked = false;
      const params = new URLSearchParams({ page: this.page, limit: 12 });
      if (keyword) params.set("keyword", keyword);
      const filterBtn = document.getElementById("rdFilterRemainBtn");
      const filterActive = filterBtn?.dataset.active === "true";
      if (filterActive) params.set("remaining_only", "true");
      const resp = await fetch(`/api/v1/receiving-notes?${params}`);
      const data = await resp.json();
      this.total = data.total || 0;
      this.totalPages = Math.ceil(this.total / 12) || 1;
      let notes = data.items || data;
      document.getElementById("recvCount").textContent = this.total;

      if (notes.length === 0) {
        container.innerHTML = `<div class="card"><div class="empty-state"><div class="icon">📋</div><div class="text">${filterActive ? '所有点收单均已领完' : '暂无点收单'}</div></div></div>` +
          this._renderPagination();
        return;
      }

      const isMultiMode = document.getElementById("rdBatchMode")?.checked;

      let html = notes.map(n => `
        <div class="card" style="${isMultiMode ? '' : 'cursor:pointer'}" onclick="${isMultiMode ? '' : `ReceivingModule.showDetail(${n.id})`}">
          <div class="card-body" style="padding:10px 16px;display:flex;align-items:center;gap:8px">
            ${isMultiMode ? `<input type="checkbox" class="recv-checkbox" value="${n.id}" style="width:16px;height:16px;margin-right:10px">` : ''}
            <span style="width:16%;display:flex;align-items:center;gap:6px">
              <span style="font-weight:700;color:#1a73e8;font-size:15px;white-space:nowrap">${esc(n.note_no)}</span>
              <span class="badge ${n.status === 'active' ? 'badge-green' : 'badge-gray'}">${n.status === 'active' ? '有效' : n.status}</span>
              <span class="badge badge-blue" style="flex-shrink:0">${esc(n.date)}</span>
            </span>
            <span style="width:22%;font-size:14px;color:#5f6368;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              <span style="color:#9aa0a6">供应商</span> ${esc(n.seller_name)}
            </span>
            <span style="width:12%;font-size:14px;color:#5f6368;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              <span style="color:#9aa0a6">工程编号</span> ${esc(n.project_no)}
            </span>
            <span style="width:28%;font-size:14px;color:#5f6368;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              <span style="color:#9aa0a6">工程名称</span> ${esc(n.project_name)}
            </span>
            <span style="width:10%;font-size:14px;color:#5f6368;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              <span style="color:#9aa0a6">仓库</span> ${esc(n.warehouse_label)}
            </span>
            <span style="width:12%;text-align:right;font-weight:700;color:#1a73e8;font-size:16px;white-space:nowrap">¥ ${n.total_amount?.toFixed(2) || '0.00'}${!n.all_used && n.status === 'active' ? '<span style="margin-left:4px;font-size:11px;color:#ea4335;font-weight:600">⏳未领完</span>' : ''}</span>
          </div>
        </div>
      `).join("") + this._renderPagination();

      container.innerHTML = html;
    } catch (e) {
      toast("加载点收单列表失败", "error");
    }
  },

  _renderPagination() {
    return renderPagination(this.page, this.totalPages, 'ReceivingModule.loadPage');
  },

  loadPage(page) {
    this.page = page;
    this.loadList();
  },

  toggleSelectAll() {
    const checked = document.getElementById("rdSelectAll").checked;
    document.querySelectorAll(".recv-checkbox").forEach(cb => cb.checked = checked);
  },

  toggleRemainingFilter() {
    const btn = document.getElementById("rdFilterRemainBtn");
    const isActive = btn.dataset.active === "true";
    if (isActive) {
      delete btn.dataset.active;
      btn.className = "btn btn-outline btn-sm";
    } else {
      btn.dataset.active = "true";
      btn.className = "btn btn-primary btn-sm";
    }
    this.page = 1;
    this.loadList();
  },

  async showDetail(id) {
    // 编辑状态切换明细时提示保存
    const detail = document.getElementById("recvDetail");
    if (detail?.dataset.editMode === "true" && detail.dataset.id != id) {
      if (!await exitEditGuard()) return;
    }
    try {
      const resp = await fetch(`/api/v1/receiving-notes/${id}`);
      const note = await resp.json();

      const detail = document.getElementById("recvDetail");
      detail.style.display = "block";
      document.querySelector(".main").scrollTo({ top: 0, behavior: "smooth" });
      detail.dataset.id = id;
      // 重置为非编辑模式
      detail.dataset.editMode = "false";

      // 重置编辑按钮
      const rdEditBtn = document.getElementById("rdBtnEdit");
      rdEditBtn.textContent = "✏️ 编辑";
      rdEditBtn.className = "btn btn-outline btn-sm";

      // 重置字段为只读
      document.getElementById("rdWarehouse").setAttribute("readonly", "readonly");
      const rdDateEl = document.getElementById("rdDate");
      if (rdDateEl._flatpickr) {
        rdDateEl._flatpickr.setDate(note.date, true);
        rdDateEl._flatpickr.close();
      }
      rdDateEl.setAttribute("readonly", "readonly");

      document.getElementById("rdNoteNo").value = note.note_no;
      document.getElementById("rdWarehouse").value = note.warehouse_label || note.warehouse_code || "未分类";
      document.getElementById("rdDate").value = note.date;
      const rdUseDate = document.getElementById("rdUseDate");
      if (rdUseDate) rdUseDate.value = note.date;

      // 状态：显示领用进度
      const statusHtml = note.has_use_note
        ? `<span class="badge badge-orange">已领 ${note.use_note_count} 次</span>`
        : `<span class="badge badge-green">✓ 有效</span>`;
      document.getElementById("recvStatus").innerHTML = statusHtml;

      this._renderItems(note.items || []);
      // 清除编辑模式留下的"操作"列头
      const rdThAction = document.querySelector("#rdItemsBody").closest("table").querySelector("thead .th-action");
      if (rdThAction) rdThAction.remove();
      this._renderMeta(note);

      // 按钮事件
      document.getElementById("rdBtnExport").onclick = () => this.exportExcel(id);
      document.getElementById("rdBtnPrint").onclick = () => this.printNote(note);

      // 编辑/删除按钮（已领用的点收单保存时会提示错误）
      document.getElementById("rdBtnEdit").onclick = () => this.toggleEdit(id, note);
      document.getElementById("rdBtnDelete").onclick = () => this.deleteNote(id, note.created_by);

      // 生成领用单按钮 — 一键生成全部剩余材料，数量不够可编辑修改
      const btnCreate = document.getElementById("rdBtnCreateUse");
      btnCreate.textContent = "📝 生成领用单";
      btnCreate.className = "btn btn-success btn-sm";
      btnCreate.disabled = false;
      btnCreate.onclick = () => this.createUseNoteDirectly(id, note);
    } catch (e) {
      toast("加载点收单详情失败", "error");
    }
  },

  _renderItems(items) {
    const tbody = document.getElementById("rdItemsBody");
    tbody.innerHTML = "";
    let totalQty = 0, totalAmt = 0, totalUsed = 0;
    items.forEach((item, i) => {
      totalQty += item.quantity || 0;
      totalAmt += item.amount || 0;
      totalUsed += item.used_qty || 0;
      const used = item.used_qty || 0;
      const remaining = item.remaining_qty || 0;
      let badge = '';
      let usedAttr = '';
      if (used > 0 && remaining <= 0) {
        badge = ' <span class="badge badge-orange" style="font-size:13px;margin-left:10px">已领完</span>';
        usedAttr = ' data-used="1"';
      } else if (used > 0) {
        badge = ` <span class="badge" style="font-size:13px;margin-left:10px;background:#fff3e0;color:#e65100;border:1px solid #ffcc80">部分领用 ${fmtQty(used)}/${fmtQty(item.quantity || 0)}</span>`;
        usedAttr = ' data-used="1"';
      } else {
        badge = ' <span class="badge" style="font-size:13px;margin-left:10px;background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7">未领用</span>';
      }
      tbody.innerHTML += `<tr${usedAttr} data-item-id="${item.id}">
        <td>${i + 1}</td>
        <td style="text-align:center">${esc(item.material_name)}${badge}</td>
        <td>${item.spec || ''}</td>
        <td>${esc(item.unit)}</td>
        <td style="text-align:center">${fmtQty(item.quantity || 0)}</td>
        <td style="text-align:center">${(item.unit_price || 0).toFixed(2)}</td>
        <td style="text-align:center">${(item.amount || 0).toFixed(2)}</td>
      </tr>`;
    });
    tbody.innerHTML += `<tr class="total-row"><td colspan="4" style="text-align:right">合计</td>
      <td style="text-align:center">${fmtQty(totalQty)}</td><td></td>
      <td class="amount-cell" style="text-align:center;white-space:nowrap">¥ ${totalAmt.toFixed(2)}</td></tr>`;
  },

  _renderMeta(note) {
    let invoiceHtml = `<div><strong>发票号码：</strong>${esc(note.invoice_no_list)}</div>`;
    if (note.invoice) {
      const inv = note.invoice;
      invoiceHtml = `
        <div style="grid-column:1/-1;margin-bottom:4px;border-bottom:1px dashed #e0e0e0;padding-bottom:6px">
          <strong style="color:#1a73e8">📄 关联发票</strong>
        </div>
        <div><strong>发票号码：</strong>${esc(inv.invoice_no)}</div>
        <div><strong>开票日期：</strong>${inv.issue_date || '-'}</div>
        <div><strong>发票金额：</strong><span style="color:#1a73e8;font-weight:600">¥${(inv.total_amount || 0).toFixed(2)}</span></div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="color:#1a73e8;cursor:pointer" onclick="switchTab('invoices');InvoiceListModule.showDetail(${inv.id})">查看详情</span>
          ${inv.has_file ? `<span style="color:#1a73e8;cursor:pointer" onclick="window.open('/api/v1/invoice/${inv.id}/file')">📥 下载原文件</span>` : ''}
        </div>
      `;
    }
    document.getElementById("rdMeta").innerHTML = `
      ${invoiceHtml}
      <div><strong>工程编号：</strong>${esc(note.project_no)}</div>
      <div><strong>工程名称：</strong>${esc(note.project_name)}</div>
      <div><strong>销售单位：</strong>${esc(note.seller_name)}</div>
      <div><strong>记账人：</strong>${esc(note.accountant)}</div>
      <div><strong>采购员：</strong>${esc(note.buyer)}</div>
      <div><strong>领用人：</strong>${esc(note.recipient || '')}</div>
      ${note.use_note_count > 0 ? `<div style="grid-column:1/-1;margin-top:4px"><span class="badge badge-orange">已领用 ${note.use_note_count} 次</span></div>` : ''}
    `;
  },

  async toggleEdit(id, note) {
    const detail = document.getElementById("recvDetail");
    const isEditing = detail.dataset.editMode === "true";

    // 权限检查：非管理员不能编辑他人创建的单据
    if (!isEditing && currentUser && currentUser.role !== 'admin' && note.created_by && note.created_by > 0 && note.created_by !== currentUser.id) {
      toast("无权修改他人创建的点收单", "error");
      return;
    }

    if (isEditing) {
      // 校验工程编号是否有效
      const pjInput = document.getElementById("rdProjectNo");
      const pjName = document.getElementById("rdProjectName")?.value;
      if (pjInput && (!pjInput.dataset.valid || pjInput.dataset.valid !== "true") && !pjName) {
        toast("工程编号无效，请从搜索结果中选择", "error");
        pjInput.style.borderColor = "#ea4335";
        return;
      }

      const items = [];
      const rows = document.querySelectorAll("#rdItemsBody tr:not(.total-row)");
      rows.forEach(row => {
        const tds = row.querySelectorAll("td");
        const itemId = row.dataset.itemId ? parseInt(row.dataset.itemId) : null;
        const entry = {
          material_name: tds[1].querySelector('input')?.value || tds[1].textContent,
          spec: tds[2].querySelector('input')?.value || tds[2].textContent,
          unit: tds[3].querySelector('input')?.value || tds[3].textContent,
          quantity: parseFloat(tds[4].querySelector('input')?.value || tds[4].textContent) || 0,
          unit_price: 0,
          amount: parseFloat(tds[6].querySelector('input')?.value || tds[6].textContent) || 0,
        };
        if (itemId) entry.id = itemId;
        items.push(entry);
      });

      // 校验记账人、采购员是否在人员列表中
      var _v = function(input, label, key) {
        var val = (input && input.value || '').trim();
        if (!val) { toast(label + "不能为空", "error"); if (input) input.focus(); return false; }
        var list = (APP.initData && APP.initData[key]) || [];
        if (!list.some(function(p) { return p.name === val; })) {
          toast("「" + val + "」不在单据人员列表中，请先在基础配置中添加", "error"); if (input) input.focus(); return false;
        }
        return true;
      };
      if (!_v(document.getElementById("rdAccountant"), "记账人", "accountants")) return;
      if (!_v(document.getElementById("rdBuyer"), "采购员", "buyers")) return;

      const body = {
        warehouse_code: document.getElementById("rdWarehouse").value.split("-")[0] || document.getElementById("rdWarehouse").value,
        date: document.getElementById("rdDate").value,
        project_no: document.getElementById("rdProjectNo")?.value || note.project_no,
        project_name: document.getElementById("rdProjectName")?.value || note.project_name,
        client: document.getElementById("rdClient")?.value || note.client || "",
        accountant: document.getElementById("rdAccountant")?.value || note.accountant,
        buyer: document.getElementById("rdBuyer")?.value || note.buyer,
        recipient: document.getElementById("rdRecipient")?.value || note.recipient || "",
        version: note.version,
        items: items,
      };

      try {
        const resp = await fetch(`/api/v1/receiving-notes/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (resp.status === 409) { const e = await resp.json(); toast(e.error, "error"); setTimeout(() => location.reload(), 1500); return; }
        if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || "保存失败"); }
        toast("点收单已更新", "success");
        this.showDetail(id); // 重新加载
      } catch (e) { toast(e.message, "error"); }
      return;
    }

    // 月份锁定检查：非管理员不能编辑上月及以前的单据
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.role !== 'admin') {
      const now = new Date();
      const monthStart = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
      if (note.date && note.date < monthStart) {
        toast(note.date.substring(0, 7) + ' 月的单据已锁定，不能修改', 'error');
        return;
      }
    }

    // 进入编辑模式
    detail.dataset.editMode = "true";
    const btn = document.getElementById("rdBtnEdit");
    btn.textContent = "💾 保存";
    btn.className = "btn btn-success btn-sm";

    // 使字段可编辑
    document.getElementById("rdWarehouse").removeAttribute("readonly");
    setupWarehouseAutocomplete("rdWarehouse");
    const rdDateEl = document.getElementById("rdDate");
    rdDateEl.removeAttribute("readonly");
    if (!rdDateEl._flatpickr) {
      flatpickr(rdDateEl, { locale: "zh", dateFormat: "Y-m-d" });
    }

    // 替换底部信息为可编辑
    document.getElementById("rdMeta").innerHTML = `
      <div style="position:relative"><strong>工程编号：</strong><input class="form-control autocomplete-wrap" id="rdProjectNo" value="${esc(note.project_no)}" placeholder="输入关键字搜索..." autocomplete="off" style="margin-top:2px"></div>
      <div><strong>工程名称：</strong><input class="form-control" id="rdProjectName" value="${esc(note.project_name)}"></div>
      <div><strong>销售单位：</strong>${esc(note.seller_name)}</div>
      <div><strong>发票号码：</strong>${esc(note.invoice_no_list)}</div>
      <div style="position:relative"><strong>记账人：</strong><input class="form-control" id="rdAccountant" value="${esc(note.accountant)}" placeholder="输入关键字搜索..." autocomplete="off"><div class="autocomplete-dropdown"></div></div>
      <div style="position:relative"><strong>采购员：</strong><input class="form-control" id="rdBuyer" value="${esc(note.buyer)}" placeholder="输入关键字搜索..." autocomplete="off"><div class="autocomplete-dropdown"></div></div>
      <div style="position:relative"><strong>领用人：</strong><input class="form-control" id="rdRecipient" value="${esc(note.recipient || '')}" placeholder="输入关键字搜索..." autocomplete="off"><div class="autocomplete-dropdown"></div></div>
    `;
    // 给编辑模式下的工程编号添加搜索联想（同时填充发包单位）
    setupProjectAutocomplete("rdProjectNo", "rdProjectName", "rdClient");
    setupPersonnelAutocomplete("rdAccountant", "accountants");
    setupPersonnelAutocomplete("rdBuyer", "buyers");
    setupPersonnelAutocomplete("rdRecipient", "recipients");

    // 明细行变输入框 + 行删除
    const tbody = document.getElementById("rdItemsBody");
    // 表头加"操作"列
    const thead = tbody.closest("table").querySelector("thead tr");
    if (!thead.querySelector(".th-action")) {
      const th = document.createElement("th");
      th.className = "th-action";
      th.style.cssText = "width:50px";
      th.textContent = "操作";
      thead.appendChild(th);
    }
    tbody.querySelectorAll("tr:not(.total-row)").forEach(row => {
      const tds = row.querySelectorAll("td");
      if (tds.length < 7) return;
      const isUsed = row.dataset.used === "1";
      if (isUsed) {
        // 已领用条目不可编辑
        tds[1].style.color = "#80868b";
        tds[4].innerHTML += ' <span style="color:#ea4335;font-size:11px">(已领用)</span>';
        return;
      }
      // 取文本时排除子元素（如 badge <span>），避免"未领用"混入物料名称
      const getOwnText = el => Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
      tds[1].innerHTML = `<input value="${getOwnText(tds[1])}" style="width:100%;text-align:center">`;
      tds[2].innerHTML = `<input value="${tds[2].textContent}" style="width:100%">`;
      tds[3].innerHTML = `<input value="${tds[3].textContent}" style="width:50px">`;
      tds[4].innerHTML = `<input value="${tds[4].textContent}" style="width:70px">`;
      tds[5].innerHTML = `<input value="${tds[5].textContent}" style="width:80px">`;
      tds[6].innerHTML = `<input value="${tds[6].textContent}" style="width:80px;font-weight:600">`;
      // 添加删除按钮
      const delTd = document.createElement("td");
      delTd.style.cssText = "text-align:center";
      delTd.innerHTML = '<span style="color:#ea4335;cursor:pointer;font-size:16px" onclick="this.closest(\'tr\').remove()">✖</span>';
      row.appendChild(delTd);
    });
  },

  async exportExcel(id) {
    try {
      const resp = await fetch(`/api/v1/receiving-notes/${id}/export`);
      const result = await resp.json();

      if (result.path) {
        // 尝试下载
        const fileName = result.filename;
        const downloadPath = `/uploads/${fileName}`;
        const a = document.createElement("a");
        a.href = downloadPath;
        a.download = fileName;
        a.click();
        toast(`导出成功：${result.filename}`, "success");
      }
    } catch (e) {
      toast("导出失败", "error");
    }
  },

  async createUseNoteDirectly(recvId, note) {
    const items = note.items || [];
    const available = items.filter(it => (it.remaining_qty || 0) > 0);
    if (available.length === 0) {
      toast("该点收单所有材料已全部领用", "info");
      return;
    }

    const recipient = (note.recipient || APP.initData?.recipients?.[0]?.name || "王晓伟");
    const rdUseDate = document.getElementById("rdUseDate");
    const useDate = rdUseDate ? rdUseDate.value : note.date;
    const payload = available.map(it => {
      // 数量=库存余量，金额=库存剩余金额，单价反算
      const qty = it.remaining_qty;
      const amt = it.remaining_amount || 0;
      const price = qty > 0 ? amt / qty : 0;
      return {
        receiving_item_id: it.id,
        material_name: it.material_name,
        spec: it.spec || '',
        unit: it.unit,
        quantity: qty,
        unit_price: price,
        amount: amt,
      };
    });

    try {
      const resp = await fetch(`/api/v1/use-notes/from-receiving/${recvId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient, items: payload, date: useDate }),
      });

      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || "生成失败"); }
      const result = await resp.json();
      toast(`领用单 ${esc(result.note_no)} 生成成功（若数量不匹配可编辑修改）`, "success");

      this.showDetail(recvId);
      switchTab("receiving");
      this.loadList();
      loadRecent();
    } catch (e) {
      toast(e.message, "error");
    }
  },

  async batchExport() {
    const checkboxes = document.querySelectorAll(".recv-checkbox:checked");
    const ids = [...checkboxes].map(cb => parseInt(cb.value));
    if (ids.length === 0) {
      toast("请先选择要导出的点收单", "error");
      return;
    }

    try {
      const resp = await fetch("/api/v1/receiving-notes/batch-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const result = await resp.json();
      if (result.path) {
        const a = document.createElement("a");
        a.href = `/uploads/${result.filename}`;
        a.download = result.filename;
        a.click();
        toast(`已导出 ${ids.length} 张点收单`, "success");
      }
    } catch (e) {
      toast("批量导出失败", "error");
    }
  },

  async deleteNote(id, createdBy) {
    // 权限检查：非管理员不能删除他人创建的单据
    if (currentUser && currentUser.role !== 'admin' && createdBy && createdBy > 0 && createdBy !== currentUser.id) {
      toast("无权删除他人创建的点收单", "error");
      return;
    }
    // 月份锁定检查：非管理员不能删除上月及以前的单据
    const noteDate = document.getElementById("rdDate")?.value;
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.role !== 'admin' && noteDate) {
      const now = new Date();
      const monthStart = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
      if (noteDate < monthStart) {
        toast(noteDate.substring(0, 7) + ' 月的单据已锁定，不能删除', 'error');
        return;
      }
    }
    if (!(await showConfirm("确认删除此点收单？"))) return;
    try {
      const resp = await fetch(`/api/v1/receiving-notes/${id}`, { method: "DELETE" });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "删除失败");
      }
      toast("已删除", "success");
      document.getElementById("recvDetail").style.display = "none";
      this.loadList();
      loadRecent();
    } catch (e) {
      toast(e.message, "error");
    }
  },

  printNote(note) {
    printTriplicate(function() {
      var itemsHtml = (note.items || []).map(function(item, i) { return '\
        <tr>\
          <td style="text-align:center;padding:5px 8px;border:1px solid #000">' + (i + 1) + '</td>\
          <td style="text-align:center;padding:5px 8px;border:1px solid #000">' + esc(item.material_name) + '</td>\
          <td style="text-align:center;padding:5px 8px;border:1px solid #000">' + (item.spec || '') + '</td>\
          <td style="text-align:center;padding:5px 8px;border:1px solid #000">' + (item.unit || '') + '</td>\
          <td style="text-align:center;padding:5px 8px;border:1px solid #000">' + fmtQty(item.quantity || 0) + '</td>\
          <td style="text-align:center;padding:5px 8px;border:1px solid #000">' + (item.unit_price || 0).toFixed(2) + '</td>\
          <td style="text-align:center;padding:5px 8px;border:1px solid #000">' + (item.amount || 0).toFixed(2) + '</td>\
        </tr>'; }).join('');
      var totalQty = (note.items || []).reduce(function(s, i) { return s + (i.quantity || 0); }, 0);
      var totalAmt = (note.items || []).reduce(function(s, i) { return s + (i.amount || 0); }, 0);
      var company = (APP.settings && APP.settings.company_name) || '天津港航安装工程有限公司';
      return '\
        <h2 style="text-align:center;font-size:18px;margin:8px 0 20px 0">' + company + '《材料点收单》</h2>\
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 2fr;gap:8px;font-size:13px;margin-bottom:16px">\
          <span><b>点收编号：</b>' + esc(note.note_no) + '</span>\
          <span><b>日期：</b>' + esc(note.date) + '</span>\
          <span><b>仓库：</b>' + esc(note.warehouse_label || note.warehouse_code) + '</span>\
          <span style="padding-left:4em;position:relative"><b style="position:absolute;left:0">供应商：</b>' + esc(note.seller_name) + '</span>\
        </div>\
        <table style="width:100%;border-collapse:collapse;font-size:12px">\
          <thead><tr>\
            <th style="background:#f0f0f0;padding:5px 8px;border:1px solid #000;text-align:center">序号</th>\
            <th style="background:#f0f0f0;padding:5px 8px;border:1px solid #000;text-align:center">材料名称</th>\
            <th style="background:#f0f0f0;padding:5px 8px;border:1px solid #000;text-align:center">规格型号</th>\
            <th style="background:#f0f0f0;padding:5px 8px;border:1px solid #000;text-align:center">单位</th>\
            <th style="background:#f0f0f0;padding:5px 8px;border:1px solid #000;text-align:center">数量</th>\
            <th style="background:#f0f0f0;padding:5px 8px;border:1px solid #000;text-align:center">单价</th>\
            <th style="background:#f0f0f0;padding:5px 8px;border:1px solid #000;text-align:center">金额</th>\
          </tr></thead>\
          <tbody>' + itemsHtml + '\
            <tr style="font-weight:700;background:#f8f8f8">\
              <td colspan="4" style="padding:5px 8px;border:1px solid #000;text-align:center">合计</td>\
              <td style="padding:5px 8px;border:1px solid #000;text-align:center">' + fmtQty(totalQty) + '</td>\
              <td style="padding:5px 8px;border:1px solid #000"></td>\
              <td style="padding:5px 8px;border:1px solid #000;text-align:center">' + totalAmt.toFixed(2) + '</td>\
            </tr>\
          </tbody>\
        </table>\
        <div style="display:grid;grid-template-columns:1fr 2.5fr 0.9fr 0.9fr;gap:4px;margin-top:30px;font-size:12px">\
          <span><b>工程编号：</b>' + esc(note.project_no) + '</span>\
          <span style="padding-left:5em;position:relative"><b style="position:absolute;left:0">工程名称：</b>' + esc(note.project_name) + '</span>\
          <span><b>记账人：</b>' + esc(note.accountant) + '</span>\
          <span><b>采购员：</b>' + esc(note.buyer) + '</span>\
        </div>';
    });
  },
};

/* 编辑模式实时金额计算 - 事件委托 */
document.getElementById("rdItemsBody").addEventListener("input", function(e) {
  const detail = document.getElementById("recvDetail");
  if (detail.dataset.editMode !== "true") return;
  const input = e.target;
  if (input.tagName !== "INPUT") return;
  const td = input.closest("td");
  if (!td) return;
  const tr = td.closest("tr");
  if (!tr) return;
  if (tr.classList.contains("total-row")) return;
  const tds = tr.querySelectorAll("td");
  if (tds.length < 7) return;
  const idx = Array.from(tds).indexOf(td);

  const qtyInput = tds[4]?.querySelector("input");
  const priceInput = tds[5]?.querySelector("input");
  const amtInput = tds[6]?.querySelector("input");
  if (!qtyInput || !priceInput || !amtInput) return;

  if (idx === 4 || idx === 5) {
    // 数量或单价改变 → 重算金额
    const qty = parseFloat(qtyInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    amtInput.value = (qty * price).toFixed(2);
  } else if (idx === 6) {
    // 金额改变 → 反算单价
    const qty = parseFloat(qtyInput.value) || 0;
    const amt = parseFloat(amtInput.value) || 0;
    priceInput.value = qty > 0 ? (amt / qty).toFixed(2) : '0.00';
  }

  // 更新底部合计
  const tbody = document.getElementById("rdItemsBody");
  let totalQty = 0, totalAmt = 0;
  tbody.querySelectorAll("tr:not(.total-row)").forEach(r => {
    const ins = r.querySelectorAll("input");
    if (ins.length >= 6) {
      totalQty += parseFloat(ins[3].value) || 0;
      totalAmt += parseFloat(ins[5].value) || 0;
    } else {
      // 已领用行无 input，从 td 文本取
      const tds = r.querySelectorAll("td");
      if (tds.length >= 7) {
        totalQty += parseFloat(tds[4].textContent) || 0;
        totalAmt += parseFloat(tds[6].textContent) || 0;
      }
    }
  });
  const totalRow = tbody.querySelector("tr.total-row");
  if (totalRow) {
    const tds = totalRow.querySelectorAll("td");
    if (tds.length >= 4) {
      tds[1].textContent = fmtQty(totalQty);
      tds[3].innerHTML = `¥ ${totalAmt.toFixed(2)}`;
    }
  }
});

