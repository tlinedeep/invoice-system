/* ===== 全局变量 ===== */
let APP = { currentInvoiceId: null, currentParseData: null, settings: {}, initData: {} };
let currentUser = null;

/* ===== 全局错误捕获 ===== */
window.addEventListener('error', function(e) {
  console.error('[全局错误]', e.message, e.filename, e.lineno);
});
window.addEventListener('unhandledrejection', function(e) {
  console.error('[未处理的Promise异常]', e.reason);
});

/* ===== 工具函数 ===== */
function toast(msg, type = "success") {
  const c = document.getElementById("toastContainer");
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

/** 格式化数量：整数显示整数，有小数的去掉末尾多余0 */
function fmtQty(n) { return parseFloat(n || 0).toString(); }

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function switchTab(name) {
  document.querySelectorAll(".tab-content").forEach(el => el.style.display = "none");
  const target = document.getElementById("tab-" + name);
  if (target) target.style.display = "block";
  document.querySelectorAll(".menu-item").forEach(el => el.classList.remove("active"));
  const mi = document.querySelector(`.menu-item[data-tab="${name}"]`);
  if (mi) mi.classList.add("active");
}

function showConfirm(msg) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:360px;border-radius:12px;text-align:center">
        <div style="padding:28px 24px 16px">
          <div style="font-size:36px;margin-bottom:12px">⚠️</div>
          <div style="font-size:15px;color:#202124;line-height:1.6">${esc(msg)}</div>
        </div>
        <div style="display:flex;gap:10px;padding:0 24px 24px;justify-content:center">
          <button class="btn btn-outline" id="confirmNo" style="flex:1;justify-content:center;padding:10px">取消</button>
          <button class="btn btn-danger" id="confirmYes" style="flex:1;justify-content:center;padding:10px">确认删除</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#confirmYes").onclick = () => { overlay.remove(); resolve(true); };
    overlay.querySelector("#confirmNo").onclick = () => { overlay.remove(); resolve(false); };
    overlay.onclick = e => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
  });
}

/* ===== 编辑退出确认 ===== */
function confirmExitEdit() {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:400px;border-radius:12px;text-align:center">
        <div style="padding:28px 24px 16px">
          <div style="font-size:36px;margin-bottom:12px">⚠️</div>
          <div style="font-size:15px;color:#202124;line-height:1.6">当前编辑内容尚未保存，请选择：</div>
        </div>
        <div style="display:flex;gap:10px;padding:0 24px 24px;justify-content:center">
          <button class="btn btn-outline" id="ceCancel" style="flex:1;justify-content:center;padding:10px">取消</button>
          <button class="btn btn-outline" id="ceDiscard" style="flex:1;justify-content:center;padding:10px">不保存</button>
          <button class="btn btn-success" id="ceSave" style="flex:1;justify-content:center;padding:10px">保存</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = v => { overlay.remove(); resolve(v); };
    overlay.querySelector("#ceCancel").onclick = () => close("cancel");
    overlay.querySelector("#ceDiscard").onclick = () => close("discard");
    overlay.querySelector("#ceSave").onclick = () => close("save");
    overlay.onclick = e => { if (e.target === overlay) close("cancel"); };
  });
}

async function exitEditGuard() {
  const recvEdit = document.getElementById("recvDetail")?.dataset.editMode === "true";
  const useEdit = document.getElementById("useDetail")?.dataset.editMode === "true";
  if (!recvEdit && !useEdit) return true;

  const action = await confirmExitEdit();
  if (action === "cancel") return false;

  if (action === "save") {
    const saveRecv = async () => {
      const id = document.getElementById("recvDetail").dataset.id;
      const items = [];
      document.querySelectorAll("#rdItemsBody tr:not(.total-row)").forEach(row => {
        const tds = row.querySelectorAll("td");
        items.push({
          material_name: tds[1].querySelector("input")?.value || tds[1].textContent,
          spec: tds[2].querySelector("input")?.value || tds[2].textContent,
          unit: tds[3].querySelector("input")?.value || tds[3].textContent,
          quantity: parseFloat(tds[4].querySelector("input")?.value || tds[4].textContent) || 0,
          unit_price: 0,
          amount: parseFloat(tds[6].querySelector("input")?.value || tds[6].textContent) || 0,
        });
      });
      const resp = await fetch(`/api/v1/receiving-notes/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouse_code: document.getElementById("rdWarehouse").value,
          date: document.getElementById("rdDate").value,
          project_no: document.getElementById("rdProjectNo")?.value || "",
          project_name: document.getElementById("rdProjectName")?.value || "",
          accountant: document.getElementById("rdAccountant")?.value || "",
          buyer: document.getElementById("rdBuyer")?.value || "",
          items,
        }),
      });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || "保存失败"); }
      toast("点收单已保存", "success");
    };
    const saveUse = async () => {
      const id = document.getElementById("useDetail").dataset.id;
      const items = [];
      document.querySelectorAll("#udItemsBody tr:not(.total-row)").forEach(row => {
        const tds = row.querySelectorAll("td");
        items.push({ material_name: tds[1].querySelector("input")?.value || tds[1].textContent, spec: tds[2].querySelector("input")?.value || tds[2].textContent, unit: tds[3].querySelector("input")?.value || tds[3].textContent, quantity: parseFloat(tds[4].querySelector("input")?.value || tds[4].textContent) || 0, unit_price: 0, amount: parseFloat(tds[6].querySelector("input")?.value || tds[6].textContent) || 0 });
      });
      const resp = await fetch(`/api/v1/use-notes/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: document.getElementById("udRecipient")?.value || "",
          date: document.getElementById("udDate").value,
          accountant: document.getElementById("udAccountant")?.value || "",
          items,
        }),
      });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || "保存失败"); }
      toast("领用单已保存", "success");
    };
    try {
      if (recvEdit) await saveRecv();
      if (useEdit) await saveUse();
    } catch (e) {
      toast(e.message, "error");
      return false;
    }
  }
  document.getElementById("recvDetail").dataset.editMode = "false";
  document.getElementById("useDetail").dataset.editMode = "false";
  return true;
}

async function gotoTab(name, loadFn) {
  if (!await exitEditGuard()) return;
  switchTab(name);
  ["recvSearch","useSearch","invSearch","invInventorySearch","hKeyword"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  if (typeof loadFn === "function") loadFn();
}

/* ===== 认证 ===== */
async function logout() {
  await fetch("/api/v1/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

/* ===== 输入框清除按钮 ===== */
/* ===== 输入框清除按钮（类似汇总报表 .ms-clear-all 风格） ===== */
function enableClearButton(input) {
  if (!input || input.dataset.clearEnabled) return;
  input.dataset.clearEnabled = "true";
  var btn = document.createElement("span");
  btn.textContent = "× 清除";
  btn.className = "ms-clear-all";
  btn.style.display = "none";
  input.parentNode.insertBefore(btn, input.nextSibling);
  function toggle() { btn.style.display = input.value.length > 0 ? "inline" : "none"; }
  input.addEventListener("input", toggle);
  input.addEventListener("change", toggle);
  btn.addEventListener("mousedown", function(e) {
    e.preventDefault();
    input.value = "";
    input.dataset.valid = "false";
    input.focus();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  toggle();
}

/* ===== 一式三份打印 ===== */
function printTriplicate(buildHtml) {
  // 先测一份内容的高度（含 wrapper padding 20px），宽度模拟 A4 实际打印区域
  var d = document.createElement('div');
  d.innerHTML = '<div style="margin-top:38px;padding:20px 0">' + buildHtml() + '</div>';
  d.style.cssText = 'position:fixed;left:-9999px;top:0;width:175mm'; // @page margin:17.5mm 每边
  document.body.appendChild(d);
  var h = d.offsetHeight;
  document.body.removeChild(d);

  // A4 全高 297mm，@page margin:0 无浏览器边距，全页可用
  var pageH = Math.round(297 * 3.78) + 20; // 全A4高度 1123px，+20补偿测量偏差
  // 每份高度超过 297/2=148.5mm 则1份/页，超过 297/3=99mm 则2份/页，否则3份/页
  var copyH = h + 8; // 含裁切线
  var perPage = copyH > 561 ? 1 : (copyH > 374 ? 2 : 3); // 561px≈148.5mm, 374px≈99mm
  var divider = '<div style="text-align:center;padding:0;font-size:0;line-height:0">\
                  <span style="color:#ccc;font-size:8px;line-height:1">- - - - - - - - - - - - - - - - - - - - - - - - - - -</span>\
                 </div>';

  // 按 perPage 分组，每组内用 divider 分隔，组间分页
  var pages = [];
  for (var i = 0; i < 3; i += perPage) {
    var page = '';
    for (var j = i; j < Math.min(i + perPage, 3); j++) {
      page += '<div style="margin-top:38px;padding:20px 0">' + buildHtml() + '</div>' + divider; // 每份后面都加裁切线
    }
    pages.push(page);
  }

  var all = pages.join('<div style="page-break-after:always"></div>');

  var f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none';
  document.body.appendChild(f);
  var w = f.contentWindow;
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>打印</title><style>@page{margin:0 17.5mm 0 17.5mm}body{font-family:"Microsoft YaHei",sans-serif;color:#202124;margin:0;padding:0;font-size:15px}</style></head><body>' + all + '</body></html>');
  w.document.close();
  setTimeout(function() { w.print(); setTimeout(function() { document.body.removeChild(f); window.focus(); }, 200); }, 500);
}

/* ===== 分页 ===== */

/* ===== 分页组件（事件委托，避免 inline onclick XSS） ===== */
function renderPagination(page, totalPages, loadPageFn) {
  if (totalPages <= 1) return '';
  const uid = 'pg_' + Math.random().toString(36).slice(2, 8);
  let h = `<div class="pagination" id="${uid}" data-fn="${esc(loadPageFn)}" data-total="${totalPages}" style="display:flex;justify-content:center;align-items:center;gap:4px;margin-top:16px;flex-wrap:wrap">`;
  h += `<button class="btn btn-sm ${page <= 1 ? 'btn-disabled' : 'btn-outline'}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} style="font-size:13px;padding:4px 10px">‹</button>`;
  h += `<button class="btn btn-sm ${page === 1 ? 'btn-primary' : 'btn-outline'}" data-page="1" style="font-size:13px;padding:4px 10px;min-width:32px">1</button>`;
  let start = Math.max(2, page - 2);
  let end = Math.min(totalPages - 1, page + 2);
  if (end - start < 4) {
    if (start <= 2) end = Math.min(totalPages - 1, start + 4);
    if (end >= totalPages - 1) start = Math.max(2, end - 4);
  }
  if (start > 2) h += '<span style="color:#9aa0a6;font-size:13px;padding:0 2px">…</span>';
  for (let i = start; i <= end; i++) {
    h += `<button class="btn btn-sm ${i === page ? 'btn-primary' : 'btn-outline'}" data-page="${i}" style="font-size:13px;padding:4px 10px;min-width:32px">${i}</button>`;
  }
  if (end < totalPages - 1) h += '<span style="color:#9aa0a6;font-size:13px;padding:0 2px">…</span>';
  if (totalPages > 1) {
    h += `<button class="btn btn-sm ${page === totalPages ? 'btn-primary' : 'btn-outline'}" data-page="${totalPages}" style="font-size:13px;padding:4px 10px;min-width:32px">${totalPages}</button>`;
  }
  h += `<button class="btn btn-sm ${page >= totalPages ? 'btn-disabled' : 'btn-outline'}" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''} style="font-size:13px;padding:4px 10px">›</button>`;
  h += `<span style="margin-left:8px;font-size:13px;color:#5f6368">跳转到</span>`;
  h += `<input class="form-control" style="width:52px;height:28px;font-size:13px;text-align:center;padding:2px 4px" type="number" min="1" max="${totalPages}" value="${page}" data-page-input="true">`;
  h += '<span style="font-size:12px;color:#9aa0a6">页</span></div>';
  return h;
}

/* 分页事件委托（全局注册一次） */
function _resolveFn(fnName) {
  /* 解析 "Module.method" 字符串，返回绑定好 this 的函数 */
  if (!fnName) return null;
  var parts = fnName.split('.');
  if (parts.length < 2) return null;
  // 先尝试 window 对象
  var ctx = parts.slice(0, -1).reduce(function(obj, key) { return obj && obj[key]; }, typeof window !== 'undefined' ? window : {});
  if (!ctx) {
    // const 声明不在 window 上，用 Function 构造器在全局作用域查找
    try { ctx = new Function('return ' + parts.slice(0, -1).join('.'))(); } catch(e) { return null; }
  }
  var fn = ctx[parts[parts.length - 1]];
  return typeof fn === 'function' ? fn.bind(ctx) : null;
}
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.pagination [data-page]');
  if (!btn || btn.disabled) return;
  const container = btn.closest('.pagination');
  const fnName = container.dataset.fn;
  const p = parseInt(btn.dataset.page);
  const total = parseInt(container.dataset.total);
  const fn = _resolveFn(fnName);
  if (fn && p >= 1 && p <= total) fn(p);
});
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;
  const input = e.target.closest('.pagination [data-page-input]');
  if (!input) return;
  const container = input.closest('.pagination');
  const fnName = container.dataset.fn;
  const total = parseInt(container.dataset.total);
  const v = parseInt(input.value);
  const fn = _resolveFn(fnName);
  if (fn && v >= 1 && v <= total) fn(v);
});

/* ===== 页面初始化 ===== */
async function loadRecent() {
  try {
    const [recvResp, useResp] = await Promise.all([
      fetch("/api/v1/receiving-notes?limit=5"),
      fetch("/api/v1/use-notes?limit=5"),
    ]);
    const recvData = await recvResp.json();
    const useData = await useResp.json();
    const recvNotes = (recvData.items || recvData).slice(0, 3);
    const useNotes = (useData.items || useData).slice(0, 3);
    const list = document.getElementById("recentList");
    if (recvNotes.length === 0 && useNotes.length === 0) {
      list.innerHTML = '<div style="padding:16px;text-align:center;color:#9aa0a6;font-size:12px">暂无记录</div>';
      return;
    }
    let html = '';
    recvNotes.forEach(n => {
      html += `<div class="detail-item" style="cursor:pointer;padding:7px 14px" onclick="gotoTab('receiving',()=>ReceivingModule.showDetail(${n.id}))">
        <div style="font-size:12px"><span style="color:#1a73e8;font-weight:700">${esc(n.note_no)}</span> <span style="color:#9aa0a6;font-size:11px">点收</span><br><span style="font-size:11px;color:#5f6368">${esc(n.seller_name || '-')}</span></div>
        <span style="font-weight:600;font-size:13px">¥${n.total_amount?.toFixed(2) || '0.00'}</span>
      </div>`;
    });
    useNotes.forEach(n => {
      html += `<div class="detail-item" style="cursor:pointer;padding:7px 14px" onclick="gotoTab('use',()=>UseModule.showDetail(${n.id}))">
        <div style="font-size:12px"><span style="color:#e65100;font-weight:700">${esc(n.note_no)}</span> <span style="color:#9aa0a6;font-size:11px">领用</span><br><span style="font-size:11px;color:#5f6368">${esc(n.seller_name || '-')}</span></div>
        <span style="font-weight:600;font-size:13px">¥${n.total_amount?.toFixed(2) || '0.00'}</span>
      </div>`;
    });
    list.innerHTML = html;
    document.getElementById("dpLastNo").textContent = recvNotes[0]?.note_no || useNotes[0]?.note_no || "-";
  } catch (e) { console.error(e); }
}

async function initApp() {
  try {
    const whoResp = await fetch("/api/v1/auth/whoami");
    if (!whoResp.ok) { window.location.href = "/login"; return; }
    const whoData = await whoResp.json();
    currentUser = whoData.user;
    document.getElementById("currentUser").textContent = currentUser.display_name || currentUser.username;
    document.getElementById("userAvatar").textContent = (currentUser.display_name || currentUser.username)[0];
  } catch (e) { window.location.href = "/login"; return; }
  try {
    const resp = await fetch("/api/v1/init-data");
    try {
      const sResp = await fetch("/api/v1/settings");
      APP.settings = await sResp.json();
    } catch (e) { APP.settings = {}; }
    APP.initData = await resp.json();
    setupProjectAutocomplete("piProjectNo", "piProjectName");
    setupPersonnelAutocomplete("piAccountant", "accountants");
    setupPersonnelAutocomplete("piBuyer", "buyers");
    setupPersonnelAutocomplete("piRecipient", "recipients");
    setupWarehouseAutocomplete("piWarehouse");

    // 搜索框 × 清除按钮
    ["recvSearch","useSearch","invSearch","invInventorySearch"].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) enableClearButton(el);
    });
    document.getElementById("dpMonth").textContent = new Date().getMonth() + 1 + "月";
    document.getElementById("dpUser").textContent = (currentUser.display_name || currentUser.username) + (currentUser.role === 'admin' ? '（管理员）' : '（记账员）');
    await loadRecent();
    switchTab('dashboard');
    DashboardModule.load();
  } catch (e) { console.error("Init error:", e); }
}
