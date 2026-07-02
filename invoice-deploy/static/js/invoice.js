/* ===== 发票导入模块 ===== */
const InvoiceModule = {
  _batchMode: false,
  _rawItems: [],

  onBatchModeToggle() {
    this._batchMode = document.querySelector('input[name="recvMode"]:checked')?.value === "1";
    this._refreshItemsDisplay();
  },

  _refreshItemsDisplay() {
    const tbody = document.getElementById("piItemsBody");
    const items = this._rawItems;
    if (!items || items.length === 0) return;

    if (this._batchMode) {
      this._renderBatchItems(tbody, items);
    } else {
      this._renderNormalItems(tbody, items);
    }
    this.onTaxToggle();
  },

  _renderNormalItems(tbody, items) {
    tbody.innerHTML = "";
    let totalQty = 0, totalAmt = 0;
    items.forEach((item, i) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      const amt = Number(item.amount) || 0;
      totalQty += qty;
      totalAmt += amt;
      tbody.innerHTML += `<tr>
        <td>${i + 1}</td>
        <td><input value="${esc(item.clean_name)}" placeholder="材料名称"></td>
        <td><input value="${item.spec || ""}" placeholder="规格型号"></td>
        <td><input value="${item.unit || ""}" style="width:50px"></td>
        <td><input value="${qty.toFixed(3)}" style="width:80px"></td>
        <td><input value="${price.toFixed(2)}" style="width:90px"></td>
        <td><input value="${amt.toFixed(2)}" style="width:90px;font-weight:600"></td>
        <td style="text-align:center"><span style="color:#ea4335;cursor:pointer;font-size:16px" onclick="InvoiceModule.deleteRow(this)">✖</span></td>
      </tr>`;
    });
    // 存储原始数据到 dataset（供含税切换）
    const rawTax = items.reduce((s, it) => s + (Number(it.tax_amount) || 0), 0);
    tbody.dataset.rawTotalAmt = totalAmt.toFixed(2);
    tbody.dataset.rawTotalTax = rawTax.toFixed(2);
    const rows = tbody.querySelectorAll("tr");
    rows.forEach((row, i) => {
      const inputs = row.querySelectorAll("input");
      if (inputs.length >= 6) {
        row.dataset.rawAmt = (Number(items[i]?.amount) || 0).toFixed(2);
        row.dataset.rawQty = (Number(items[i]?.quantity) || 0).toFixed(3);
        row.dataset.rawPrice = (Number(items[i]?.unit_price) || 0).toFixed(2);
        row.dataset.rawTaxAmt = (Number(items[i]?.tax_amount) || 0).toFixed(2);
      }
    });
    this._updateFooter(items);
  },

  _renderBatchItems(tbody, items) {
    tbody.innerHTML = "";
    const whInput = document.getElementById("piWarehouse").value;
    const whName = whInput.includes("-") ? whInput.split("-")[1] : whInput;
    const firstItem = items?.[0];
    const materialName = whName ? `${whName}一批` : (firstItem?.clean_name ? `${firstItem.clean_name}一批` : "材料一批");

    const totalAmt = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    const totalTax = items.reduce((s, it) => s + (Number(it.tax_amount) || 0), 0);

    tbody.innerHTML = `<tr>
      <td>1</td>
      <td><input value="${esc(materialName)}" placeholder="材料名称"></td>
      <td><input value="见发票明细" placeholder="规格型号"></td>
      <td><input value="批" style="width:50px"></td>
      <td><input value="1.000" style="width:80px"></td>
      <td><input value="${totalAmt.toFixed(2)}" style="width:90px"></td>
      <td><input value="${totalAmt.toFixed(2)}" style="width:90px;font-weight:600"></td>
      <td></td>
    </tr>`;
    // 存储原始数据
    tbody.dataset.rawTotalAmt = totalAmt.toFixed(2);
    tbody.dataset.rawTotalTax = totalTax.toFixed(2);
    const row = tbody.querySelector("tr");
    if (row) {
      row.dataset.rawAmt = totalAmt.toFixed(2);
      row.dataset.rawQty = "1.000";
      row.dataset.rawPrice = totalAmt.toFixed(2);
      row.dataset.rawTaxAmt = totalTax.toFixed(2);
    }
    this._updateFooter([{ quantity: 1, amount: totalAmt, unit: "批" }]);
  },

  _updateFooter(items) {
    const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    const totalAmt = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    const unitLabel = items[0]?.unit || "";
    document.getElementById("piTotalQty").textContent = `${fmtQty(totalQty)} ${unitLabel}`;
    const rawTax = parseFloat(document.getElementById("piItemsBody").dataset.rawTotalTax) || 0;
    document.getElementById("piTotalTax").textContent = rawTax.toFixed(2);
    document.getElementById("piTotalAmt").textContent = totalAmt.toFixed(2);
  },

  /** 删除某行明细后实时重算汇总 */
  deleteRow(btn) {
    const tr = btn.closest("tr");
    tr.remove();
    this._recalcFromDom();
  },

  /** 根据当前 DOM 中剩余行重算所有汇总 */
  _recalcFromDom() {
    const tbody = document.getElementById("piItemsBody");
    let totalQty = 0, totalAmt = 0, rawTotalAmt = 0, rawTotalTax = 0;
    tbody.querySelectorAll("tr").forEach(r => {
      const ins = r.querySelectorAll("input");
      if (ins.length < 6) return;
      totalQty += parseFloat(ins[3].value) || 0;
      totalAmt += parseFloat(ins[5].value) || 0;
      rawTotalAmt += parseFloat(r.dataset.rawAmt) || 0;
      rawTotalTax += parseFloat(r.dataset.rawTaxAmt) || 0;
    });
    tbody.dataset.rawTotalAmt = rawTotalAmt.toFixed(2);
    tbody.dataset.rawTotalTax = rawTotalTax.toFixed(2);
    document.getElementById("piTotalQty").textContent = fmtQty(totalQty);
    document.getElementById("piTotalAmt").textContent = totalAmt.toFixed(2);
    document.getElementById("piAmount").value = totalAmt.toFixed(2);
    document.getElementById("piTotalTax").textContent = rawTotalTax.toFixed(2);
    document.getElementById("piTaxAmt").value = rawTotalTax.toFixed(2);
    this.onTaxToggle();
  },

  handleDrop(event) {
    const files = event.dataTransfer.files;
    if (files.length === 0) return;
    this.uploadFileDirect(files[0]);
  },

  uploadFile(input) {
    if (!input.files || !input.files[0]) return;
    this.uploadFileDirect(input.files[0]);
    input.value = "";
  },

  async uploadFileDirect(file) {
    const validTypes = [".pdf", ".jpg", ".jpeg", ".png"];
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!validTypes.includes(ext)) {
      toast("不支持的文件格式，请上传 PDF、JPG 或 PNG 文件", "error");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    const progress = document.getElementById("uploadProgress");
    progress.style.display = "block";
    const fill = progress.querySelector(".fill");
    fill.style.width = "20%";

    try {
      const resp = await fetch("/api/v1/invoice/parse", { method: "POST", body: formData });
      if (!resp.ok) {
        let errMsg = "解析失败";
        try { const err = await resp.json(); errMsg = err.error || `服务器错误(${esc(resp.status)})`; }
        catch (e) { errMsg = `服务器错误(${esc(resp.status)})`; }
        throw new Error(errMsg);
      }

      fill.style.width = "80%";
      const data = await resp.json();
      if (!data || !data.id) throw new Error("服务器返回数据异常");

      fill.style.width = "100%";
      setTimeout(() => { progress.style.display = "none"; fill.style.width = "0%"; }, 500);

      APP.currentParseData = data;
      APP.currentInvoiceId = data.id;

      this.displayResult(data, file.name);
      toast(data._blank ? "请手动填写发票信息" : `发票解析完成，请核对数据`, "info");
    } catch (e) {
      progress.style.display = "none";
      fill.style.width = "0%";
      console.error("Upload error:", e);
      toast(e.message || "上传失败，请重试", "error");
    }
  },

  displayResult(data, fileName) {
    try {
      document.getElementById("parseResult").style.display = "block";
      document.getElementById("importEmpty").style.display = "none";

      const badge = data._blank
        ? '<span class="badge badge-orange" style="margin-left:auto">⚠ 待填写</span>'
        : '<span class="badge badge-green" style="margin-left:auto">✓ 已识别</span>';
      document.getElementById("parseFileInfo").innerHTML = `📄 ${fileName} ${badge}`;

      const hint = document.getElementById("parseHint");
      if (data._hint) {
        hint.style.display = "block";
        document.getElementById("parseHintText").textContent = data._blank
          ? "未能自动识别此发票，请手动填写以下信息"
          : `当前为${data._hint}，请核对并修改为实际发票数据`;
      } else {
        hint.style.display = "none";
      }

      document.getElementById("piInvoiceNo").value = data.invoice_no || "";
      document.getElementById("piSeller").value = data.seller_name || "";
      document.getElementById("piTaxNo").value = data.seller_tax_no || "";
      document.getElementById("piAmount").value =
        data.total_amount !== undefined ? Number(data.total_amount).toFixed(2) : "0.00";
      document.getElementById("piTaxAmt").value =
        data.total_tax_amount !== undefined ? Number(data.total_tax_amount).toFixed(2) : "0.00";
      const piDateEl = document.getElementById("piDate");
      piDateEl.value = data.issue_date || "";
      if (!piDateEl._flatpickr) flatpickr(piDateEl, { locale: "zh", dateFormat: "Y-m-d" });
      const piRecvEl = document.getElementById("piRecvDate");
      piRecvEl.value = new Date().toISOString().split("T")[0];
      if (!piRecvEl._flatpickr) flatpickr(piRecvEl, { locale: "zh", dateFormat: "Y-m-d" });
      document.getElementById("piWarehouse").value = data.warehouse || "00-未分类";
      document.getElementById("piTaxExclusive").checked = true;

      // 保存原始 items 供切换使用
      this._rawItems = data.items || [{ clean_name: "", spec: "", unit: "", quantity: 0, unit_price: 0, amount: 0 }];

      // 重置为逐行点收
      this._batchMode = false;
      document.querySelector('input[name="recvMode"][value="0"]').checked = true;

      // 渲染明细
      this._refreshItemsDisplay();

      document.getElementById("piTotalLabel").textContent = "不含税合计";
      document.getElementById("piInvoiceNoList").value =
        `${esc(data.invoice_no)}              共1张`;

      this.onTaxToggle();

      // 从文件名自动匹配工程编号
      if (data.detected_project_no && data.detected_project_name) {
        const pjInput = document.getElementById("piProjectNo");
        const pjNameInput = document.getElementById("piProjectName");
        if (pjInput && pjNameInput) {
          pjInput.value = data.detected_project_no;
          pjInput.dataset.valid = "true";
          pjInput.style.borderColor = "";
          pjNameInput.value = data.detected_project_name;
          pjNameInput.style.borderColor = "";
        }
      }
    } catch (e) {
      console.error("displayResult error:", e);
      toast("显示解析结果时出错", "error");
    }
  },

  /** 税率选择变化：只刷新显示，税额以发票解析或用户手动编辑为准 */
  onTaxRateChange() {
    this.onTaxToggle();
  },

  /** 含税/不含税切换：含税金额 = 不含税金额 + 该行税额，含税单价 = 含税金额 / 数量 */
  onTaxToggle() {
    const isTaxInclusive = document.getElementById("piTaxInclusive").checked;
    const tbody = document.getElementById("piItemsBody");

    document.getElementById("piAmountLabel").textContent = isTaxInclusive ? "含税金额" : "不含税金额";
    document.getElementById("piUnitPriceLabel").textContent = isTaxInclusive ? "含税单价" : "不含税单价";
    document.getElementById("piTotalLabel").textContent = isTaxInclusive ? "价税合计" : "不含税合计";

    const rawTotalAmt = parseFloat(tbody.dataset.rawTotalAmt) || 0;
    const rawTotalTax = parseFloat(tbody.dataset.rawTotalTax) || 0;

    if (!isTaxInclusive) {
      // 不含税模式：还原发票原始值，不做任何计算
      let totalAmt = 0;
      tbody.querySelectorAll("tr").forEach(row => {
        const inputs = row.querySelectorAll("input");
        if (inputs.length < 6) return;
        inputs[5].value = row.dataset.rawAmt || "0.00";
        inputs[4].value = row.dataset.rawPrice || "0.00";
        totalAmt += parseFloat(inputs[5].value) || 0;
      });
      document.getElementById("piAmount").value = totalAmt.toFixed(2);
      document.getElementById("piTotalAmt").textContent = totalAmt.toFixed(2);
      return;
    }

    // 含税模式：各行含税金额 = 不含税金额 + 该行税额（发票原始数据，不分摊）
    const rows = tbody.querySelectorAll("tr");
    const result = [];
    rows.forEach(row => {
      const inputs = row.querySelectorAll("input");
      if (inputs.length < 6) return;
      const rawAmt = parseFloat(row.dataset.rawAmt) || 0;
      const qty = parseFloat(row.dataset.rawQty) || parseFloat(inputs[3].value) || 0;
      const itemTax = parseFloat(row.dataset.rawTaxAmt) || 0;

      const displayAmt = rawAmt + itemTax;
      result.push({ qty, inputs, displayAmt });
    });

    // 最后一行吸收舍入误差（仅当用户手动编辑过总税额时可能偏差）
    if (result.length > 0) {
      const expectedTotal = Math.round((rawTotalAmt + rawTotalTax) * 100) / 100;
      const sumRounded = result.reduce((s, r) => s + Math.round(r.displayAmt * 100) / 100, 0);
      const diff = Math.round((expectedTotal - sumRounded) * 100) / 100;
      if (diff !== 0) result[result.length - 1].displayAmt += diff;
    }

    let totalDisplayAmt = 0;
    result.forEach(r => {
      const rounded = Math.round(r.displayAmt * 100) / 100;
      r.inputs[5].value = rounded.toFixed(2);
      r.inputs[4].value = r.qty > 0 ? (rounded / r.qty).toFixed(6) : "0.00";
      totalDisplayAmt += rounded;
    });

    document.getElementById("piAmount").value = totalDisplayAmt.toFixed(2);
    document.getElementById("piTotalAmt").textContent = totalDisplayAmt.toFixed(2);
  },

  reset() {
    document.getElementById("parseResult").style.display = "none";
    document.getElementById("importEmpty").style.display = "block";
    document.getElementById("fileInput").value = "";
    document.getElementById("piWarehouse").style.borderColor = "";
    document.getElementById("piProjectNo").style.borderColor = "";
    APP.currentInvoiceId = null;
    APP.currentParseData = null;
  },

  /** 从当前表单收集编辑后的发票数据 */
  getEditedData() {
    const items = [];
    const rows = document.querySelectorAll("#piItemsBody tr");
    rows.forEach(row => {
      const inputs = row.querySelectorAll("input");
      if (inputs.length >= 6) {
        items.push({
          clean_name: inputs[0].value,
          spec: inputs[1].value,
          unit: inputs[2].value,
          quantity: parseFloat(inputs[3].value) || 0,
          unit_price: parseFloat(inputs[4].value) || 0,
          amount: parseFloat(inputs[5].value) || 0,
        });
      }
    });

    const totalAmt = items.reduce((s, i) => s + i.amount, 0);
    return {
      invoice_no: document.getElementById("piInvoiceNo").value,
      seller_name: document.getElementById("piSeller").value,
      seller_tax_no: document.getElementById("piTaxNo").value,
      issue_date: document.getElementById("piDate").value,
      total_amount: parseFloat(document.getElementById("piAmount").value) || totalAmt,
      total_tax_amount: parseFloat(document.getElementById("piTaxAmt").value) || 0,
      warehouse: document.getElementById("piWarehouse").value,
      is_special_tax: !document.getElementById("piTaxInclusive").checked,
      items: items,
    };
  },
};

/* 发票导入页编辑实时计算：数量/金额变动时反算单价 */
document.getElementById("piItemsBody").addEventListener("input", function(e) {
  const input = e.target;
  if (input.tagName !== "INPUT") return;
  const td = input.closest("td");
  if (!td) return;
  const tr = td.closest("tr");
  if (!tr) return;
  const tds = tr.querySelectorAll("td");
  if (tds.length < 7) return;
  const inputs = tr.querySelectorAll("input");
  if (inputs.length < 6) return;
  const idx = Array.from(tds).indexOf(td);

  const qty = parseFloat(inputs[3].value) || 0;
  const price = parseFloat(inputs[4].value) || 0;
  const amt = parseFloat(inputs[5].value) || 0;

  if (idx === 4 || idx === 5) {
    // 数量或单价改变 → 重算金额
    inputs[5].value = (qty * price).toFixed(2);
  } else if (idx === 6) {
    // 金额改变 → 反算单价
    inputs[4].value = qty > 0 ? (amt / qty).toFixed(2) : "0.00";
  }

  // 更新 dataset 中的原始不含税值
  if (!document.getElementById("piTaxInclusive").checked) {
    // 不含税模式：当前值就是不含税值
    tr.dataset.rawAmt = inputs[5].value;
    tr.dataset.rawPrice = inputs[4].value;
  } else {
    // 含税模式：不含税金额 = 含税金额 - 该行税额（发票原始税额固定不变）
    const itemTax = parseFloat(tr.dataset.rawTaxAmt) || 0;
    const rawAmt = Math.max(0, parseFloat(inputs[5].value) - itemTax);
    tr.dataset.rawAmt = rawAmt.toFixed(2);
  }
  tr.dataset.rawQty = inputs[3].value;

  // 更新底部合计和税额
  let totalQty = 0, totalAmt = 0, rawTotalAmtVal = 0, rawTotalTaxVal = 0;
  document.querySelectorAll("#piItemsBody tr").forEach(r => {
    const ins = r.querySelectorAll("input");
    if (ins.length >= 6) {
      totalQty += parseFloat(ins[3].value) || 0;
      totalAmt += parseFloat(ins[5].value) || 0;
      rawTotalAmtVal += parseFloat(r.dataset.rawAmt) || 0;
      rawTotalTaxVal += parseFloat(r.dataset.rawTaxAmt) || 0;
    }
  });
  document.getElementById("piTotalQty").textContent = fmtQty(totalQty);
  document.getElementById("piTotalAmt").textContent = totalAmt.toFixed(2);
  document.getElementById("piAmount").value = totalAmt.toFixed(2);

  // 更新 tbody dataset 总金额和总税额
  const tbodyDs = document.getElementById("piItemsBody").dataset;
  tbodyDs.rawTotalAmt = rawTotalAmtVal.toFixed(2);
  tbodyDs.rawTotalTax = rawTotalTaxVal.toFixed(2);
  document.getElementById("piTotalTax").textContent = rawTotalTaxVal.toFixed(2);
  document.getElementById("piTaxAmt").value = rawTotalTaxVal.toFixed(2);
});

/* 税额输入框手动编辑时更新 dataset 并刷新 */
document.getElementById("piTaxAmt").addEventListener("input", function() {
  const val = parseFloat(this.value) || 0;
  document.getElementById("piItemsBody").dataset.rawTotalTax = val.toFixed(2);
  // 重新执行切换刷新显示
  InvoiceModule.onTaxToggle();
});

/* ===== 发票列表模块 ===== */
const InvoiceListModule = {
  page: 1,
  totalPages: 1,
  total: 0,

  async loadList() {
    const container = document.getElementById("invoiceList");
    const detail = document.getElementById("invoiceDetail");
    detail.style.display = "none";
    container.style.display = "block";

    try {
      const keyword = document.getElementById("invSearch")?.value || "";
      const params = new URLSearchParams({ page: this.page, limit: 14 });
      if (keyword) params.set("keyword", keyword);
      const resp = await fetch(`/api/v1/invoice/list?${params}`);
      const data = await resp.json();
      this.total = data.total || 0;
      this.totalPages = Math.ceil(this.total / 14) || 1;
      const invoices = data.items || data;
      document.getElementById("invCount").textContent = this.total;

      if (invoices.length === 0) {
        container.innerHTML = `<div class="card"><div class="empty-state"><div class="icon">📄</div><div class="text">暂无发票记录</div></div></div>` + this._renderPagination();
        return;
      }

      container.innerHTML = invoices.map(inv => `
        <div class="card" style="cursor:pointer;margin-bottom:4px" onclick="InvoiceListModule.showDetail(${inv.id})">
          <div class="card-body" style="padding:12px 16px;display:flex;align-items:center;font-size:14px">
            <span style="width:26%;color:#222;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(inv.seller_name)}</span>
            <span style="width:22%;font-weight:700;color:#1a73e8;white-space:nowrap">发票金额 ¥${inv.total_amount?.toFixed(2) || '0.00'}</span>
            <span style="width:24%;color:#5f6368;white-space:nowrap">发票号 ${esc(inv.invoice_no)}</span>
            <span style="width:16%;color:#999;white-space:nowrap">开票日期 ${inv.issue_date || '-'}</span>
            <span style="width:12%;text-align:right"><span class="badge ${inv.status === 'confirmed' ? 'badge-green' : inv.status === 'used' ? 'badge-gray' : 'badge-orange'}" style="font-size:11px">
              ${inv.status === 'parsed' ? '已解析' : inv.status === 'confirmed' ? '已点收' : inv.status === 'used' ? '已领用' : inv.status}
            </span></span>
          </div>
        </div>
      `).join("") + this._renderPagination();
    } catch (e) {
      toast("加载发票列表失败", "error");
    }
  },

  _renderPagination() {
    return renderPagination(this.page, this.totalPages, 'InvoiceListModule.loadPage');
  },

  loadPage(page) {
    this.page = page;
    this.loadList();
  },

  async showDetail(id) {
    try {
      const resp = await fetch(`/api/v1/invoice/${id}`);
      const inv = await resp.json();

      const detail = document.getElementById("invoiceDetail");
      detail.style.display = "block";
      document.getElementById("invoiceList").style.display = "none";

      document.getElementById("ivNo").value = inv.invoice_no || '未识别';
      document.getElementById("ivSeller").value = inv.seller_name || '-';
      document.getElementById("ivDate").value = inv.issue_date || '-';
      document.getElementById("ivAmount").value = inv.total_amount ? inv.total_amount.toFixed(2) : '0.00';
      document.getElementById("ivWarehouse").value = inv.warehouse || '未分类';
      document.getElementById("ivTaxNo").value = inv.seller_tax_no || '-';
      document.getElementById("ivStatus").value = inv.status === 'parsed' ? '已解析' : inv.status === 'confirmed' ? '已点收' : inv.status === 'used' ? '已领用' : inv.status;

      // 发票原件预览
      const fp = document.getElementById("ivFilePreview");
      if (inv.has_file) {
        const isImg = inv.file_ext && ['.jpg','.jpeg','.png'].includes(inv.file_ext);
        fp.innerHTML = isImg
          ? '<img src="/api/v1/invoice/'+id+'/file" style="width:100%;height:auto;display:block">'
          : '<div style="display:flex;align-items:center;justify-content:center;min-height:100px;font-size:14px;color:#666">📄 PDF文件<br><span style="font-size:12px;color:#999">点击查看</span></div>';
        fp.onclick = () => window.open("/api/v1/invoice/"+id+"/file");
        fp.style.display = "block";
      } else {
        fp.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:100px;color:#ccc;font-size:12px">无原件</div>';
        fp.onclick = null;
        fp.style.display = "block";
      }

      const tbody = document.getElementById("ivItemsBody");
      tbody.innerHTML = "";
      (inv.items || []).forEach((item, i) => {
        tbody.innerHTML += `<tr>
          <td>${i + 1}</td>
          <td>${esc(item.clean_name)}</td>
          <td>${item.spec || ''}</td>
          <td>${item.unit || ''}</td>
          <td>${fmtQty(item.quantity || 0)}</td>
          <td>${(item.unit_price || 0).toFixed(2)}</td>
          <td>${(item.amount || 0).toFixed(2)}</td>
        </tr>`;
      });
    } catch (e) {
      toast("加载发票详情失败", "error");
    }
  },
};
