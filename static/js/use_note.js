/* ===== 领用单模块 ===== */
const UseModule = {
  page: 1,
  totalPages: 1,
  total: 0,

  async loadList() {
    const container = document.getElementById("useList");
    const detail = document.getElementById("useDetail");
    detail.style.display = "none";

    try {
      const keyword = document.getElementById("useSearch")?.value || "";
      const isMulti = document.getElementById("udBatchMode")?.checked;
      document.getElementById("udBatchExportBtn").style.display = isMulti ? "inline-flex" : "none";
      document.getElementById("udSelectAllLabel").style.display = isMulti ? "inline-flex" : "none";
      if (isMulti) document.getElementById("udSelectAll").checked = false;
      const params = new URLSearchParams({ page: this.page, limit: 12 });
      if (keyword) params.set("keyword", keyword);
      const resp = await fetch(`/api/v1/use-notes?${params}`);
      const data = await resp.json();
      this.total = data.total || 0;
      this.totalPages = Math.ceil(this.total / 12) || 1;
      const notes = data.items || data;
      document.getElementById("useCount").textContent = this.total;

      if (notes.length === 0) {
        container.innerHTML = `<div class="card"><div class="empty-state"><div class="icon">📝</div><div class="text">暂无领用单</div></div></div>` + this._renderPagination();
        return;
      }

      container.innerHTML = notes.map(n => `
        <div class="card" style="${isMulti ? '' : 'cursor:pointer'}" onclick="${isMulti ? '' : `UseModule.showDetail(${n.id})`}">
          <div class="card-body" style="padding:10px 16px;display:flex;align-items:center">
            ${isMulti ? `<input type="checkbox" class="use-checkbox" value="${n.id}" style="width:16px;height:16px;margin-right:10px">` : ''}
            <span style="width:16%;display:flex;align-items:center;gap:6px">
              <span style="font-weight:700;color:#ea8600;font-size:15px;white-space:nowrap">${esc(n.note_no)}</span>
              <span class="badge badge-green">有效</span>
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
            <span style="width:12%;text-align:right;font-weight:700;color:#ea8600;font-size:16px;white-space:nowrap">¥ ${n.total_amount?.toFixed(2) || '0.00'}</span>
          </div>
        </div>
      `).join("") + this._renderPagination();
    } catch (e) {
      toast("加载领用单列表失败", "error");
    }
  },

  _renderPagination() {
    return renderPagination(this.page, this.totalPages, 'UseModule.loadPage');
  },

  loadPage(page) {
    this.page = page;
    this.loadList();
  },

  async showDetail(id) {
    // 编辑状态切换明细时提示保存
    const detail = document.getElementById("useDetail");
    if (detail?.dataset.editMode === "true" && detail.dataset.id != id) {
      if (!await exitEditGuard()) return;
    }
    try {
      const resp = await fetch(`/api/v1/use-notes/${id}`);
      const note = await resp.json();

      const detail = document.getElementById("useDetail");
      detail.style.display = "block";
      document.querySelector(".main").scrollTo({ top: 0, behavior: "smooth" });
      detail.dataset.id = id;
      detail.dataset.editMode = "false";

      // 重置编辑按钮
      const udEditBtn = document.getElementById("udBtnEdit");
      udEditBtn.textContent = "✏️ 编辑";
      udEditBtn.className = "btn btn-outline btn-sm";

      // 重置字段为只读
      const udDateEl = document.getElementById("udDate");
      if (udDateEl._flatpickr) {
        udDateEl._flatpickr.setDate(note.date, true);
        udDateEl._flatpickr.close();
      }
      udDateEl.setAttribute("readonly", "readonly");

      document.getElementById("udNoteNo").value = note.note_no;
      document.getElementById("udWarehouse").value = note.warehouse_label || note.warehouse_code || "未分类";
      document.getElementById("udDate").value = note.date;

      this._renderItems(note.items || []);
      // 清除编辑模式留下的"操作"列头
      const udThAction = document.querySelector("#udItemsBody").closest("table").querySelector("thead .th-action");
      if (udThAction) udThAction.remove();

      this._renderMeta(note);

      document.getElementById("udBtnExport").onclick = () => this.exportExcel(id);
      document.getElementById("udBtnDelete").onclick = () => this.deleteNote(id, note.created_by);
      document.getElementById("udBtnEdit").onclick = () => this.toggleEdit(id, note);
      document.getElementById("udBtnPrint").onclick = () => this.printNote(note);
    } catch (e) {
      toast("加载领用单详情失败", "error");
    }
  },

  _renderItems(items) {
    const tbody = document.getElementById("udItemsBody");
    tbody.innerHTML = "";
    let totalQty = 0, totalAmt = 0;
    items.forEach((item, i) => {
      totalQty += item.quantity || 0;
      totalAmt += item.amount || 0;
      tbody.innerHTML += `<tr data-item-id="${item.id || ''}" data-receiving-item-id="${item.receiving_item_id || ''}">
        <td>${i + 1}</td>
        <td style="text-align:center">${esc(item.material_name)}</td>
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
    document.getElementById("udMeta").innerHTML = `
      <div style="position:relative">
        <strong>领用人：</strong>
        <input class="form-control" id="udRecipient" value="${esc(note.recipient || '')}" placeholder="输入关键字搜索..." autocomplete="off" style="margin-top:2px"><div class="autocomplete-dropdown"></div>
      </div>
      <div><strong>工号：</strong>${esc(note.project_no)}</div>
      <div style="grid-column:1/-1"><strong>工程名称：</strong>${esc(note.project_name)}</div>
      <div><strong>记账人：</strong>${esc(note.accountant)}</div>
      <div><strong>关联点收单：</strong>${note.receiving_note_no || '#' + note.receiving_note_id || '-'}</div>
    `;
    setupPersonnelAutocomplete("udRecipient", "recipients");
  },

  async toggleEdit(id, note) {
    const detail = document.getElementById("useDetail");
    const isEditing = detail.dataset.editMode === "true";

    // 权限检查：非管理员不能编辑他人创建的单据
    if (!isEditing && currentUser && currentUser.role !== 'admin' && note.created_by && note.created_by > 0 && note.created_by !== currentUser.id) {
      toast("无权修改他人创建的领用单", "error");
      return;
    }

    if (isEditing) {
      const items = [];
      document.querySelectorAll("#udItemsBody tr:not(.total-row)").forEach(row => {
        const tds = row.querySelectorAll("td");
        items.push({
          id: row.dataset.itemId || null,
          receiving_item_id: row.dataset.receivingItemId || null,
          material_name: tds[1].querySelector('input')?.value || tds[1].textContent,
          spec: tds[2].querySelector('input')?.value || tds[2].textContent,
          unit: tds[3].querySelector('input')?.value || tds[3].textContent,
          quantity: parseFloat(tds[4].querySelector('input')?.value || tds[4].textContent) || 0,
          unit_price: 0,
          amount: parseFloat(tds[6].querySelector('input')?.value || tds[6].textContent) || 0,
        });
      });

      // 校验记账人、领用人是否在人员列表中
      var _v = function(input, label, key) {
        var val = (input && input.value || '').trim();
        if (!val) { toast(label + "不能为空", "error"); if (input) input.focus(); return false; }
        var list = (APP.initData && APP.initData[key]) || [];
        if (!list.some(function(p) { return p.name === val; })) {
          toast("「" + val + "」不在单据人员列表中，请先在基础配置中添加", "error"); if (input) input.focus(); return false;
        }
        return true;
      };
      if (!_v(document.getElementById("udAccountant"), "记账人", "accountants")) return;
      if (!_v(document.getElementById("udRecipient"), "领用人", "recipients")) return;

      const body = {
        recipient: document.getElementById("udRecipient")?.value || note.recipient,
        date: document.getElementById("udDate").value,
        accountant: document.getElementById("udAccountant")?.value || note.accountant,
        version: note.version,
        items: items,
      };

      try {
        const resp = await fetch(`/api/v1/use-notes/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (resp.status === 409) { const e = await resp.json(); toast(e.error, "error"); setTimeout(() => location.reload(), 1500); return; }
        if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || "保存失败"); }
        toast("领用单已更新", "success");
        this.showDetail(id);
        loadRecent();
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
    const btn = document.getElementById("udBtnEdit");
    btn.textContent = "💾 保存";
    btn.className = "btn btn-success btn-sm";

    const udDateEl = document.getElementById("udDate");
    udDateEl.removeAttribute("readonly");
    if (!udDateEl._flatpickr) {
      flatpickr(udDateEl, { locale: "zh", dateFormat: "Y-m-d" });
    }

    document.getElementById("udMeta").innerHTML = `
      <div style="position:relative"><strong>领用人：</strong>
        <input class="form-control" id="udRecipient" value="${esc(note.recipient || '')}" placeholder="输入关键字搜索..." autocomplete="off"><div class="autocomplete-dropdown"></div>
      </div>
      <div><strong>工号：</strong>${esc(note.project_no)}</div>
      <div style="grid-column:1/-1"><strong>工程名称：</strong>${esc(note.project_name)}</div>
      <div style="position:relative"><strong>记账人：</strong><input class="form-control" id="udAccountant" value="${esc(note.accountant)}" placeholder="输入关键字搜索..." autocomplete="off"><div class="autocomplete-dropdown"></div></div>
      <div><strong>关联点收单：</strong>${note.receiving_note_no || '#' + note.receiving_note_id || '-'}</div>
    `;
    setupPersonnelAutocomplete("udAccountant", "accountants");
    setupPersonnelAutocomplete("udRecipient", "recipients");

    // 表头加"操作"列
    const thead = document.querySelector("#udItemsBody").closest("table").querySelector("thead tr");
    if (!thead.querySelector(".th-action")) {
      const th = document.createElement("th");
      th.className = "th-action";
      th.style.cssText = "width:50px";
      th.textContent = "操作";
      thead.appendChild(th);
    }
    document.querySelectorAll("#udItemsBody tr:not(.total-row)").forEach(row => {
      const tds = row.querySelectorAll("td");
      if (tds.length >= 7) {
        tds[1].innerHTML = `<input value="${tds[1].textContent}" style="width:100%;text-align:center">`;
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
      }
    });
  },

  toggleSelectAll() {
    const checked = document.getElementById("udSelectAll").checked;
    document.querySelectorAll(".use-checkbox").forEach(cb => cb.checked = checked);
  },

  async exportExcel(id) {
    try {
      const resp = await fetch(`/api/v1/use-notes/${id}/export`);
      const result = await resp.json();
      if (result.path) {
        const a = document.createElement("a");
        a.href = `/uploads/${result.filename}`;
        a.download = result.filename;
        a.click();
        toast(`导出成功：${result.filename}`, "success");
      }
    } catch (e) {
      toast("导出失败", "error");
    }
  },

  async batchExport() {
    const checkboxes = document.querySelectorAll(".use-checkbox:checked");
    const ids = [...checkboxes].map(cb => parseInt(cb.value));
    if (ids.length === 0) {
      toast("请先选择要导出的领用单", "error");
      return;
    }
    try {
      const resp = await fetch("/api/v1/use-notes/batch-export", {
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
        toast(`已导出 ${ids.length} 张领用单`, "success");
      }
    } catch (e) {
      toast("批量导出失败", "error");
    }
  },

  async deleteNote(id, createdBy) {
    // 权限检查：非管理员不能删除他人创建的单据
    if (currentUser && currentUser.role !== 'admin' && createdBy && createdBy > 0 && createdBy !== currentUser.id) {
      toast("无权删除他人创建的领用单", "error");
      return;
    }
    const noteDate = document.getElementById("udDate")?.value;
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.role !== 'admin' && noteDate) {
      const now = new Date();
      const monthStart = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01';
      if (noteDate < monthStart) {
        toast(noteDate.substring(0, 7) + ' 月的单据已锁定，不能删除', 'error');
        return;
      }
    }
    if (!(await showConfirm("确认删除此领用单？"))) return;
    try {
      const resp = await fetch(`/api/v1/use-notes/${id}`, { method: "DELETE" });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || "删除失败"); }
      toast("已删除", "success");
      this.page = 1;
      this.loadList();
      loadRecent();
    } catch (e) {
      toast("删除失败", "error");
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
        <h2 style="text-align:center;font-size:18px;margin:8px 0 20px 0">' + company + '《材料领用单》</h2>\
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:13px;margin-bottom:16px">\
          <span><b>领用编号：</b>' + esc(note.note_no) + '</span>\
          <span><b>日期：</b>' + esc(note.date) + '</span>\
          <span><b>仓库：</b>' + esc(note.warehouse_label || note.warehouse_code) + '</span>\
          <span></span>\
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
          <span><b>领用人：</b>' + esc(note.recipient) + '</span>\
        </div>';
    });
  },
};

/* 编辑模式实时金额计算 - 事件委托 */
document.getElementById("udItemsBody").addEventListener("input", function(e) {
  const detail = document.getElementById("useDetail");
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
  const tbody = document.getElementById("udItemsBody");
  let totalQty = 0, totalAmt = 0;
  tbody.querySelectorAll("tr:not(.total-row)").forEach(r => {
    const ins = r.querySelectorAll("input");
    if (ins.length >= 6) {
      totalQty += parseFloat(ins[3].value) || 0;
      totalAmt += parseFloat(ins[5].value) || 0;
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

