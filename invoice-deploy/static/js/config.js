/* ===== 基础配置模块 ===== */
const ConfigModule = {
  currentSubtab: "warehouses",

  init() {
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.role !== 'admin') {
      // 非管理员隐藏操作日志和登录账号页签
      document.querySelectorAll('.tab-item[data-subtab="logs"], .tab-item[data-subtab="users"]').forEach(function(el) {
        el.style.display = 'none';
      });
    }
  },

  switchSubtab(name) {
    this.currentSubtab = name;
    document.querySelectorAll(".tab-item[data-subtab]").forEach(el => {
      el.classList.toggle("active", el.dataset.subtab === name);
    });
    // 切换子页签时重置分页状态
    this.projectPage = 1;
    this.personnelPage = 1;
    this.supplierPage = 1;
    this.logPage = 1;
    if (name === "warehouses") this.loadWarehouses();
    else if (name === "projects") this.loadProjects();
    else if (name === "personnel") this.loadPersonnel();
    else if (name === "suppliers") this.loadSuppliers();
    else if (name === "users") this.loadUsers();
    else if (name === "logs") this.loadLogs();
    else if (name === "settings") this.loadSettings();
  },

  // ===== 仓库管理 =====
  async loadWarehouses() {
    const container = document.getElementById("configContent");
    try {
      const resp = await fetch("/api/v1/warehouses");
      const whs = await resp.json();
      container.innerHTML = `
        <div style="margin-bottom:10px">
          <span style="color:#5f6368;font-size:12px">共 ${whs.length} 个固定仓库分类（仅可编辑匹配关键词）</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>编码</th><th>仓库名称</th><th>匹配关键词</th><th style="width:60px">关键词</th></tr></thead>
            <tbody>${whs.map(w => `<tr>
              <td style="color:#5f6368">${w.code}</td>
              <td><strong>${esc(w.name)}</strong></td>
              <td style="font-size:11px;color:#5f6368;text-align:left">${w.keywords}</td>
              <td><span style="color:#1a73e8;cursor:pointer" onclick="ConfigModule.showWarehouseForm(${w.id},'${w.code}','${esc(w.name)}','${w.keywords.replace(/'/g, "\\'")}')">编辑</span></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      `;
    } catch (e) { container.innerHTML = '<div class="alert alert-danger">加载失败</div>'; }
  },

  showWarehouseForm(id, code, name, keywords) {
    const html = `
      <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
        <div class="modal-box">
          <div class="modal-header">编辑匹配关键词 — ${code} ${name}</div>
          <div class="modal-body">
            <div style="font-size:12px;color:#5f6368;margin-bottom:12px">
              仓库编码：<strong>${code}</strong> ｜ 仓库名称：<strong>${name}</strong>
            </div>
            <div class="form-group"><label>匹配关键词（逗号分隔）</label><input class="form-control" id="whKeywords" value="${keywords || ''}"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">取消</button>
            <button class="btn btn-primary" onclick="ConfigModule.saveWarehouse(${id})">保存</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML("beforeend", html);
  },

  async saveWarehouse(id) {
    const data = {
      keywords: document.getElementById("whKeywords").value,
    };
    try {
      const resp = await fetch(`/api/v1/warehouses/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error); }
      toast("关键词已更新", "success");
      document.querySelector(".modal-overlay")?.remove();
      this.loadWarehouses();
    } catch (e) { toast(e.message, "error"); }
  },

  // ===== 工程管理 =====
  projectPage: 1,
  projectLimit: 15,

  async loadProjects() {
    const container = document.getElementById("configContent");
    try {
      const resp = await fetch("/api/v1/projects");
      const allProjects = await resp.json();
      const total = allProjects.length;
      const totalPages = Math.ceil(total / this.projectLimit) || 1;
      if (this.projectPage > totalPages) this.projectPage = totalPages;
      const start = (this.projectPage - 1) * this.projectLimit;
      const projects = allProjects.slice(start, start + this.projectLimit);

      container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="color:#5f6368;font-size:12px">共 ${total} 个工程</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-outline btn-sm" onclick="ConfigModule.exportProjects()">📤 导出</button>
            <button class="btn btn-outline btn-sm" onclick="ConfigModule.importProjects()">📥 Excel导入</button>
            <button class="btn btn-primary btn-sm" onclick="ConfigModule.showProjectForm()">＋ 添加工程</button>
          </div>
        </div>
        <input type="file" id="projectFileInput" accept=".xlsx,.xls" style="display:none" onchange="ConfigModule.uploadProjectExcel(this)">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>工程编号</th><th>工程名称</th><th>发包单位</th><th style="width:80px">操作</th></tr></thead>
            <tbody>${projects.map(p => `<tr><td>${esc(p.project_no)}</td><td>${esc(p.project_name)}</td><td style="color:#5f6368">${esc(p.client)}</td>
              <td style="white-space:nowrap"><span style="color:#1a73e8;cursor:pointer" onclick="ConfigModule.showProjectForm(${p.id},'${p.project_no.replace(/'/g,"\\'")}','${p.project_name.replace(/'/g,"\\'")}','${(p.client||'').replace(/'/g,"\\'")}')">编辑</span>
                ${currentUser?.role === 'admin' ? '<span style="color:#ea4335;cursor:pointer;margin-left:8px" onclick="ConfigModule.deleteProject(' + p.id + ')">删除</span>' : ''}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
        ${renderPagination(this.projectPage, totalPages, 'ConfigModule.loadProjectsPage')}
      `;
    } catch (e) { container.innerHTML = '<div class="alert alert-danger">加载失败</div>'; }
  },

  loadProjectsPage(p) { this.projectPage = p; this.loadProjects(); },

  exportProjects() {
    window.open("/api/v1/projects/export");
  },

  loadPersonnelPage(p) { this.personnelPage = p; this.loadPersonnel(); },
  loadSuppliersPage(p) { this.supplierPage = p; this.loadSuppliers(); },
  loadLogsPage(p) { this.logPage = p; this.loadLogs(); },

  exportLogs() {
    window.open("/api/v1/logs/export");
  },

  showProjectForm(id, pjNo, pjName, pjClient) {
    const isEdit = !!id;
    const html = `
      <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
        <div class="modal-box">
          <div class="modal-header">${isEdit ? '编辑工程' : '添加工程'}</div>
          <div class="modal-body">
            <div class="form-group"><label>工程编号</label><input class="form-control" id="pjNo" value="${pjNo || ''}" placeholder="如 80-7"></div>
            <div class="form-group" style="margin-top:10px"><label>工程名称</label><input class="form-control" id="pjName" value="${pjName || ''}"></div>
            <div class="form-group" style="margin-top:10px"><label>发包单位</label><input class="form-control" id="pjClient" value="${pjClient || ''}"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">取消</button>
            <button class="btn btn-primary" onclick="ConfigModule.saveProject(${id || 'null'})">保存</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML("beforeend", html);
  },

  async saveProject(id) {
    const data = { project_no: document.getElementById("pjNo").value, project_name: document.getElementById("pjName").value, client: document.getElementById("pjClient")?.value || "" };
    try {
      const url = id ? `/api/v1/projects/${id}` : "/api/v1/projects";
      const method = id ? "PUT" : "POST";
      const resp = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error); }
      toast(id ? "工程已更新" : "工程已添加", "success");
      document.querySelector(".modal-overlay")?.remove();
      this.loadProjects();
    } catch (e) { toast(e.message, "error"); }
  },

  async deleteProject(id) {
    if (!(await showConfirm("确认删除？"))) return;
    const resp = await fetch(`/api/v1/projects/${id}`, { method: "DELETE" });
    if (!resp.ok) { const e = await resp.json(); toast(e.error, "error"); return; }
    toast("已删除", "success");
    this.loadProjects();
  },

  importProjects() {
    document.getElementById("projectFileInput").click();
  },

  async uploadProjectExcel(input) {
    const file = input.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const resp = await fetch("/api/v1/projects/import", { method: "POST", body: formData });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error);
      toast(result.message, "success");
    } catch (e) {
      toast(e.message, "error");
    }
    input.value = "";
    this.loadProjects();
  },

  // ===== 人员管理 =====
  personnelPage: 1,
  personnelLimit: 15,

  async loadPersonnel() {
    const container = document.getElementById("configContent");
    try {
      const resp = await fetch("/api/v1/personnel");
      const allPeople = await resp.json();
      const total = allPeople.length;
      const totalPages = Math.ceil(total / this.personnelLimit) || 1;
      if (this.personnelPage > totalPages) this.personnelPage = totalPages;
      const start = (this.personnelPage - 1) * this.personnelLimit;
      const people = allPeople.slice(start, start + this.personnelLimit);

      container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="color:#5f6368;font-size:12px">共 ${total} 人</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-outline btn-sm" onclick="ConfigModule.downloadPersonnelTemplate()">📄 下载导入模板</button>
            <button class="btn btn-outline btn-sm" onclick="ConfigModule.importPersonnel()">📥 Excel导入</button>
            <button class="btn btn-primary btn-sm" onclick="ConfigModule.showPersonForm()">＋ 添加人员</button>
          </div>
        </div>
        <input type="file" id="personnelFileInput" accept=".xlsx,.xls" style="display:none" onchange="ConfigModule.uploadPersonnelExcel(this)">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>姓名</th><th>角色</th><th>状态</th><th style="width:100px">操作</th></tr></thead>
            <tbody>${people.map(p => `<tr>
              <td>${esc(p.name)}</td>
              <td>${p.role.split(',').map(r => ({accountant:'记账员',buyer:'采购员',recipient:'领用人'})[r] || r).filter(Boolean).join('、') || '-'}</td>
              <td><span class="badge ${p.enabled ? 'badge-green' : 'badge-gray'}">${p.enabled ? '启用' : '禁用'}</span></td>
              <td style="white-space:nowrap"><span style="color:#1a73e8;cursor:pointer" onclick="ConfigModule.showPersonForm(${p.id},'${p.name.replace(/'/g,"\\'")}','${p.role}',${p.enabled})">编辑</span>
                ${currentUser?.role === 'admin' ? '<span style="color:#ea4335;cursor:pointer;margin-left:8px" onclick="ConfigModule.deletePerson(' + p.id + ')">删除</span>' : ''}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
        ${renderPagination(this.personnelPage, totalPages, 'ConfigModule.loadPersonnelPage')}
      `;
    } catch (e) { container.innerHTML = '<div class="alert alert-danger">加载失败</div>'; }
  },

  showPersonForm(id, name, role, enabled) {
    const isEdit = !!id;
    const roles = (role || '').split(',').filter(Boolean);
    const html = `
      <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
        <div class="modal-box">
          <div class="modal-header">${isEdit ? '编辑人员' : '添加人员'}</div>
          <div class="modal-body">
            <div class="form-group"><label>姓名</label><input class="form-control" id="perName" value="${name || ''}"></div>
            <div class="form-group" style="margin-top:10px"><label>角色（可多选）</label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:6px"><input type="checkbox" class="perRole" value="accountant" ${roles.includes('accountant')?'checked':''} style="width:18px;height:18px"><span>记账员</span></label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:6px"><input type="checkbox" class="perRole" value="buyer" ${roles.includes('buyer')?'checked':''} style="width:18px;height:18px"><span>采购员</span></label>
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:6px"><input type="checkbox" class="perRole" value="recipient" ${roles.includes('recipient')?'checked':''} style="width:18px;height:18px"><span>领用人</span></label>
            </div>
            ${isEdit ? '<div class="form-group" style="margin-top:10px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="perEnabled" ' + (enabled !== false ? 'checked' : '') + ' style="width:18px;height:18px"><span style="font-size:13px">启用</span></label></div>' : ''}
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">取消</button>
            <button class="btn btn-primary" onclick="ConfigModule.savePerson(${id || 'null'})">保存</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML("beforeend", html);
  },

  downloadPersonnelTemplate() {
    window.open("/api/v1/personnel/template");
  },

  importPersonnel() {
    document.getElementById("personnelFileInput").click();
  },

  async uploadPersonnelExcel(input) {
    const file = input.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const resp = await fetch("/api/v1/personnel/import", { method: "POST", body: formData });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error);
      toast(result.message, "success");
    } catch (e) {
      toast(e.message, "error");
    }
    input.value = "";
    this.loadPersonnel();
  },

  async savePerson(id) {
    const enabledEl = document.getElementById("perEnabled");
    const roleValues = Array.from(document.querySelectorAll(".perRole:checked")).map(cb => cb.value).join(",");
    const data = { name: document.getElementById("perName").value, role: roleValues };
    if (enabledEl) data.enabled = enabledEl.checked;
    try {
      const url = id ? `/api/v1/personnel/${id}` : "/api/v1/personnel";
      const method = id ? "PUT" : "POST";
      const resp = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || "保存失败"); }
      toast(id ? "人员已更新" : "人员已添加", "success");
      document.querySelector(".modal-overlay")?.remove();
      this.loadPersonnel();
    } catch (e) { toast(e.message, "error"); }
  },

  async deletePerson(id) {
    if (!(await showConfirm("确认删除？"))) return;
    const resp = await fetch(`/api/v1/personnel/${id}`, { method: "DELETE" });
    if (!resp.ok) { const e = await resp.json(); toast(e.error, "error"); return; }
    toast("已删除", "success");
    this.loadPersonnel();
  },

  // ===== 供应商管理 =====
  supplierPage: 1,
  supplierLimit: 15,

  async loadSuppliers() {
    const container = document.getElementById("configContent");
    try {
      // 自动同步
      await fetch("/api/v1/suppliers/sync", { method: "POST" });
      const resp = await fetch("/api/v1/suppliers");
      const allSuppliers = await resp.json();
      const total = allSuppliers.length;
      const totalPages = Math.ceil(total / this.supplierLimit) || 1;
      if (this.supplierPage > totalPages) this.supplierPage = totalPages;
      const start = (this.supplierPage - 1) * this.supplierLimit;
      const suppliers = allSuppliers.slice(start, start + this.supplierLimit);

      container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="color:#5f6368;font-size:12px">共 ${total} 个供应商</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-outline btn-sm" onclick="ConfigModule.syncSuppliers()">🔄 同步</button>
            <button class="btn btn-primary btn-sm" onclick="ConfigModule.showSupplierForm()">＋ 添加供应商</button>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>供应商名称</th><th>统一社会信用代码</th><th>联系人</th><th>电话</th><th>备注</th><th style="width:80px">操作</th></tr></thead>
            <tbody>${suppliers.map(s => `<tr>
              <td>${esc(s.name)}</td>
              <td style="font-family:monospace">${s.credit_code || '-'}</td>
              <td>${s.contact || '-'}</td>
              <td>${s.phone || '-'}</td>
              <td style="color:#5f6368">${s.remark || ''}</td>
              <td style="white-space:nowrap"><span style="color:#1a73e8;cursor:pointer" onclick="ConfigModule.showSupplierForm(${s.id},'${s.name.replace(/'/g,"\\'")}','${(s.credit_code||'').replace(/'/g,"\\'")}','${(s.contact||'').replace(/'/g,"\\'")}','${(s.phone||'').replace(/'/g,"\\'")}','${(s.remark||'').replace(/'/g,"\\'")}')">编辑</span>
                ${currentUser?.role === 'admin' ? '<span style="color:#ea4335;cursor:pointer;margin-left:8px" onclick="ConfigModule.deleteSupplier(' + s.id + ')">删除</span>' : ''}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
        ${renderPagination(this.supplierPage, totalPages, 'ConfigModule.loadSuppliersPage')}
      `;
    } catch (e) { container.innerHTML = '<div class="alert alert-danger">加载失败</div>'; }
  },

  async syncSuppliers() {
    try {
      const resp = await fetch("/api/v1/suppliers/sync", { method: "POST" });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error);
      toast(result.message, "success");
    } catch (e) { toast(e.message, "error"); }
    this.loadSuppliers();
  },

  showSupplierForm(id, name, credit_code, contact, phone, remark) {
    const isEdit = !!id;
    const html = `
      <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
        <div class="modal-box">
          <div class="modal-header">${isEdit ? '编辑供应商' : '添加供应商'}</div>
          <div class="modal-body">
            <div class="form-group"><label>供应商名称</label><input class="form-control" id="supName" value="${name || ''}"></div>
            <div class="form-group" style="margin-top:10px"><label>统一社会信用代码</label><input class="form-control" id="supCreditCode" value="${credit_code || ''}"></div>
            <div class="form-group" style="margin-top:10px"><label>联系人</label><input class="form-control" id="supContact" value="${contact || ''}"></div>
            <div class="form-group" style="margin-top:10px"><label>电话</label><input class="form-control" id="supPhone" value="${phone || ''}"></div>
            <div class="form-group" style="margin-top:10px"><label>备注</label><input class="form-control" id="supRemark" value="${remark || ''}"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">取消</button>
            <button class="btn btn-primary" onclick="ConfigModule.saveSupplier(${id || 'null'})">保存</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML("beforeend", html);
  },

  async saveSupplier(id) {
    const data = {
      name: document.getElementById("supName").value,
      credit_code: document.getElementById("supCreditCode").value,
      contact: document.getElementById("supContact").value,
      phone: document.getElementById("supPhone").value,
      remark: document.getElementById("supRemark").value,
    };
    try {
      const url = id ? `/api/v1/suppliers/${id}` : "/api/v1/suppliers";
      const method = id ? "PUT" : "POST";
      const resp = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error); }
      toast(id ? "供应商已更新" : "供应商已添加", "success");
      document.querySelector(".modal-overlay")?.remove();
      this.loadSuppliers();
    } catch (e) { toast(e.message, "error"); }
  },

  async deleteSupplier(id) {
    if (!(await showConfirm("确认删除此供应商？"))) return;
    const resp = await fetch(`/api/v1/suppliers/${id}`, { method: "DELETE" });
    if (!resp.ok) { const e = await resp.json(); toast(e.error, "error"); return; }
    toast("已删除", "success");
    this.loadSuppliers();
  },

  // ===== 用户管理 =====
  async loadUsers() {
    const container = document.getElementById("configContent");
    try {
      const resp = await fetch("/api/v1/auth/users");
      if (!resp.ok) {
        container.innerHTML = '<div class="alert alert-warning">仅管理员可管理用户</div>';
        return;
      }
      const users = await resp.json();
      container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="color:#5f6368;font-size:12px">共 ${users.length} 个用户</span>
          <button class="btn btn-primary btn-sm" onclick="ConfigModule.showUserForm()">＋ 添加用户</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>用户名</th><th>显示名称</th><th>角色</th><th>状态</th><th style="width:120px">操作</th></tr></thead>
            <tbody>${users.map(u => `<tr>
              <td><strong>${esc(u.username)}</strong></td>
              <td>${esc(u.display_name)}</td>
              <td><span class="badge ${u.role === 'admin' ? 'badge-orange' : 'badge-blue'}">${u.role === 'admin' ? '管理员' : '普通用户'}</span></td>
              <td><span class="badge ${u.enabled ? 'badge-green' : 'badge-gray'}">${u.enabled ? '启用' : '禁用'}</span></td>
              <td style="white-space:nowrap">
                <span style="color:#1a73e8;cursor:pointer" onclick="ConfigModule.showUserForm(${u.id},'${u.username.replace(/'/g,"\\'")}','${(u.display_name||'').replace(/'/g,"\\'")}','${u.role}',${u.enabled})">编辑</span>
                <span style="color:#ea4335;cursor:pointer;margin-left:8px" onclick="ConfigModule.deleteUser(${u.id})">删除</span>
              </td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      `;
    } catch (e) { container.innerHTML = '<div class="alert alert-danger">加载失败</div>'; }
  },

  showUserForm(id, username, displayName, role, enabled) {
    const isEdit = !!id;
    const isAdminSelf = isEdit && typeof currentUser !== 'undefined' && currentUser && currentUser.id === id;
    const html = `
      <div class="modal-overlay" onclick="if(event.target===this)this.remove()">
        <div class="modal-box">
          <div class="modal-header">${isEdit ? '编辑用户' : '添加用户'}</div>
          <div class="modal-body">
            <div class="form-group"><label>用户名</label><input class="form-control" id="usrName" value="${username || ''}"></div>
            <div class="form-group" style="margin-top:10px"><label>显示名称</label><input class="form-control" id="usrDisplay" value="${displayName || ''}"></div>
            <div class="form-group" style="margin-top:10px"><label>角色</label>
              <select class="form-control" id="usrRole">
                <option value="user" ${role === 'user' ? 'selected' : ''}>普通用户</option>
                <option value="admin" ${role === 'admin' ? 'selected' : ''}>管理员</option>
              </select>
            </div>
            ${isEdit ? '<div class="form-group" style="margin-top:10px"><label>账户状态</label><label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:4px"><input type="checkbox" id="usrEnabled" ' + (enabled !== false ? 'checked' : '') + ' style="width:18px;height:18px"' + (isAdminSelf ? ' disabled' : '') + '><span style="font-size:13px">' + (isAdminSelf ? '不能停用自己' : '启用（取消勾选即停用）') + '</span></label></div>' : ''}
            <div class="form-group" style="margin-top:10px"><label>${isEdit ? '新密码（留空不修改）' : '密码'}</label>
              <input class="form-control" id="usrPassword" type="password" placeholder="${isEdit ? '留空则不修改' : ''}">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">取消</button>
            <button class="btn btn-primary" onclick="ConfigModule.saveUser(${id || 'null'})">保存</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML("beforeend", html);
  },

  async saveUser(id) {
    const enabledEl = document.getElementById("usrEnabled");
    const data = {
      username: document.getElementById("usrName").value,
      display_name: document.getElementById("usrDisplay").value,
      role: document.getElementById("usrRole").value,
      password: document.getElementById("usrPassword").value,
    };
    if (enabledEl) data.enabled = enabledEl.checked;
    try {
      const url = id ? `/api/v1/auth/users/${id}` : "/api/v1/auth/users";
      const method = id ? "PUT" : "POST";
      const resp = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error); }
      toast(id ? "用户已更新" : "用户已添加", "success");
      document.querySelector(".modal-overlay")?.remove();
      this.loadUsers();
    } catch (e) { toast(e.message, "error"); }
  },

  async deleteUser(id) {
    if (!(await showConfirm("确认删除此用户？"))) return;
    try {
      const resp = await fetch(`/api/v1/auth/users/${id}`, { method: "DELETE" });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error); }
      toast("已删除", "success");
      this.loadUsers();
    } catch (e) { toast(e.message, "error"); }
  },

  // ===== 操作日志 =====
  logPage: 1,
  logLimit: 15,
  async loadLogs(page) {
    const container = document.getElementById("configContent");
    if (page !== undefined) this.logPage = page;
    try {
      const resp = await fetch(`/api/v1/logs?page=${this.logPage}&limit=${this.logLimit}`);
      if (!resp.ok) { container.innerHTML = '<div class="alert alert-danger">加载失败</div>'; return; }
      const data = await resp.json();
      const logs = data.items || [];
      const totalPages = Math.ceil((data.total || 0) / this.logLimit) || 1;

      container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="color:#5f6368;font-size:12px">共 ${data.total} 条操作记录</span>
          <button class="btn btn-outline btn-sm" onclick="ConfigModule.exportLogs()">📤 导出</button>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th style="width:50px">ID</th><th style="width:80px">用户</th><th style="width:80px">操作</th><th style="width:100px">对象</th><th>详情</th><th style="width:150px">时间</th></tr></thead>
            <tbody>${logs.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:#9aa0a6;padding:24px">暂无操作记录</td></tr>' : logs.map(l => `<tr>
              <td>${l.id}</td>
              <td>${esc(l.username)}</td>
              <td><span class="badge ${l.action === 'create' ? 'badge-green' : l.action === 'delete' ? 'badge-orange' : 'badge-blue'}">${esc(l.action_label)}</span></td>
              <td>${esc(l.target_type_label)}${l.target_id ? ' #'+l.target_id : ''}</td>
              <td style="font-size:12px;color:#5f6368">${esc(l.detail)}</td>
              <td style="font-size:12px;color:#9aa0a6">${esc(l.created_at)}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
        ${renderPagination(this.logPage, totalPages, 'ConfigModule.loadLogsPage')}
      `;
    } catch (e) { container.innerHTML = '<div class="alert alert-danger">加载失败</div>'; }
  },

  // ===== 系统参数设置 =====
  async loadSettings() {
    const container = document.getElementById("configContent");
    try {
      const resp = await fetch("/api/v1/settings");
      const settings = await resp.json();
      container.innerHTML = `
        <div style="margin-bottom:10px">
          <span style="color:#5f6368;font-size:12px">系统全局参数设置</span>
        </div>
        <div class="card">
          <div class="card-body">
            <div class="form-group"><label>公司名称（用于打印模板）</label>
              <input class="form-control" id="cfgCompany" value="${settings.company_name || '天津港航安装工程有限公司'}">
            </div>
            <div class="form-group" style="margin-top:12px">
              <button class="btn btn-primary" onclick="ConfigModule.saveSettings()">💾 保存设置</button>
            </div>
            <div style="margin-top:16px;padding-top:12px;border-top:1px solid #e0e0e0;font-size:12px;color:#9aa0a6">
              当前配置项：company_name — 打印单据和报表中的公司名称
            </div>
          </div>
        </div>
      `;
    } catch (e) { container.innerHTML = '<div class="alert alert-danger">加载失败</div>'; }
  },

  async saveSettings() {
    const data = {
      company_name: document.getElementById("cfgCompany").value,
    };
    try {
      const resp = await fetch("/api/v1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error); }
      toast("系统参数已保存，打印时生效", "success");
    } catch (e) { toast(e.message, "error"); }
  },
};
