/* ===== 搜索联想组件 ===== */
let _acTimer = null;

/* ===== 工程编号搜索联想 ===== */
function setupProjectAutocomplete(inputId, nameInputId, clientInputId) {
  const input = document.getElementById(inputId);
  const nameInput = document.getElementById(nameInputId);
  const clientInput = clientInputId ? document.getElementById(clientInputId) : null;
  const container = input.parentElement;
  container.classList.add("autocomplete-wrap");
  let dropdown = container.querySelector(".autocomplete-dropdown");
  if (!dropdown) { dropdown = document.createElement("div"); dropdown.className = "autocomplete-dropdown"; container.appendChild(dropdown); }

  function selectItem(item) {
    if (!item) return;
    input.value = item.dataset.code; input.dataset.valid = "true"; input.style.borderColor = "";
    nameInput.value = item.dataset.name; nameInput.dispatchEvent(new Event("change"));
    if (clientInput) { clientInput.value = item.dataset.client || ""; clientInput.dispatchEvent(new Event("change")); }
    dropdown.classList.remove("show");
  }

  input.addEventListener("input", function() {
    nameInput.value = ""; input.dataset.valid = "false"; input.style.borderColor = "";
    const q = this.value.trim();
    clearTimeout(_acTimer);
    if (q.length === 0) { dropdown.classList.remove("show"); dropdown.innerHTML = ""; return; }
    _acTimer = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/v1/projects/search?q=${encodeURIComponent(q)}`);
        if (!resp.ok) return;
        const projects = await resp.json();
        if (projects.length === 0) { dropdown.classList.remove("show"); return; }
        dropdown.innerHTML = projects.map(p =>
          `<div class="autocomplete-item" data-code="${esc(p.project_no)}" data-name="${esc(p.project_name)}" data-client="${esc(p.client || '')}">
            <span class="item-code">${esc(p.project_no)}</span>
            <span class="item-name">${esc(p.project_name)}</span>
            ${p.client ? `<span class="item-name" style="color:#9aa0a6;font-size:11px">（${esc(p.client)}）</span>` : ''}
          </div>`
        ).join("");
        dropdown.classList.add("show");
      } catch (e) { dropdown.classList.remove("show"); }
    }, 150);
  });

  input.addEventListener("keydown", function(e) {
    if (e.key === "Enter") { e.preventDefault(); const first = dropdown.querySelector(".autocomplete-item"); if (first) selectItem(first); }
  });
  dropdown.addEventListener("mousedown", function(e) {
    e.preventDefault(); const item = e.target.closest(".autocomplete-item"); if (!item) return; selectItem(item);
  });
  input.addEventListener("blur", function() {
    setTimeout(() => { dropdown.classList.remove("show");validateProject(input); }, 0);
  });
  input.addEventListener("focus", function() {
    if (dropdown.querySelectorAll(".autocomplete-item").length > 0) dropdown.classList.add("show");
  });
}

/* ===== 仓库搜索联想（本地过滤） ===== */
function setupWarehouseAutocomplete(inputId) {
  const input = document.getElementById(inputId);
  const container = input.parentElement;
  container.classList.add("autocomplete-wrap");
  let dropdown = container.querySelector(".autocomplete-dropdown");
  if (!dropdown) { dropdown = document.createElement("div"); dropdown.className = "autocomplete-dropdown"; container.appendChild(dropdown); }

  function filterWarehouses(q) {
    const list = (APP.initData && APP.initData.warehouses) || [];
    if (!q) return list;
    const lower = q.toLowerCase();
    return list.filter(w => w.label.toLowerCase().includes(lower) || w.name.toLowerCase().includes(lower) || w.code.toLowerCase().includes(lower));
  }

  function renderDropdown(items) {
    if (items.length === 0) { dropdown.classList.remove("show"); dropdown.innerHTML = ""; return; }
    dropdown.innerHTML = items.map(w =>
      `<div class="autocomplete-item" data-label="${esc(w.label)}">
        <span class="item-code">${esc(w.code)}</span>
        <span class="item-name">${esc(w.name)}</span>
      </div>`
    ).join("");
    dropdown.classList.add("show");
  }

  function selectItem(item) {
    if (!item) return;
    input.value = item.dataset.label; input.dataset.valid = "true"; input.style.borderColor = "";
    dropdown.classList.remove("show");
  }

  input.addEventListener("input", function() {
    const q = this.value.trim(); const matched = filterWarehouses(q); renderDropdown(matched);
  });
  input.addEventListener("keydown", function(e) {
    if (e.key === "Enter") { e.preventDefault(); const first = dropdown.querySelector(".autocomplete-item"); if (first) selectItem(first); }
  });
  dropdown.addEventListener("mousedown", function(e) {
    e.preventDefault(); const item = e.target.closest(".autocomplete-item"); if (!item) return; selectItem(item);
  });
  input.addEventListener("blur", function() {
    setTimeout(() => { dropdown.classList.remove("show");validateWarehouse(input); }, 0);
  });
  input.addEventListener("focus", function() {
    const matched = filterWarehouses(this.value.trim()); if (matched.length > 0) renderDropdown(matched);
  });
}

/* ===== 人员搜索联想（本地过滤） ===== */
function setupPersonnelAutocomplete(inputId, listKey) {
  const input = document.getElementById(inputId);
  const container = input.parentElement;
  container.classList.add("autocomplete-wrap");
  let dropdown = container.querySelector(".autocomplete-dropdown");
  if (!dropdown) { dropdown = document.createElement("div"); dropdown.className = "autocomplete-dropdown"; container.appendChild(dropdown); }

  const items = (APP.initData && APP.initData[listKey]) || [];

  function filterItems(q) {
    if (!q) return items;
    const lower = q.toLowerCase();
    return items.filter(p => p.name.toLowerCase().includes(lower));
  }

  function renderDropdown(matched) {
    if (matched.length === 0) { dropdown.classList.remove("show"); dropdown.innerHTML = ""; return; }
    dropdown.innerHTML = matched.map(p =>
      `<div class="autocomplete-item" data-name="${esc(p.name)}"><span class="item-name">${esc(p.name)}</span></div>`
    ).join("");
    dropdown.classList.add("show");
  }

  function selectItem(item) {
    if (!item) return;
    input.value = item.dataset.name; input.dataset.valid = "true"; input.style.borderColor = "";
    dropdown.classList.remove("show");
  }

  input.addEventListener("input", function() {
    input.dataset.valid = "false"; const q = this.value.trim(); const matched = filterItems(q); renderDropdown(matched);
  });
  input.addEventListener("keydown", function(e) {
    if (e.key === "Enter") { e.preventDefault(); const first = dropdown.querySelector(".autocomplete-item"); if (first) selectItem(first); }
  });
  // 人员联想：mousedown 避免 blur 竞争
  dropdown.addEventListener("mousedown", function(e) {
    e.preventDefault(); const item = e.target.closest(".autocomplete-item"); if (!item) return; selectItem(item);
  });
  input.addEventListener("blur", function() {
    setTimeout(() => { dropdown.classList.remove("show"); }, 200);
  });
  input.addEventListener("focus", function() {
    const matched = filterItems(this.value.trim()); if (matched.length > 0) renderDropdown(matched);
  });
}

/* ===== 输入校验 ===== */
function validateWarehouse(input) {
  const val = input.value.trim();
  const list = (APP.initData && APP.initData.warehouses) || [];
  const valid = list.some(w => w.label === val);
  if (val && !valid) { input.style.borderColor = "#ea4335"; input.dataset.valid = "false"; }
  else { input.style.borderColor = ""; input.dataset.valid = "true"; }
}

function validateProject(input) {
  const val = input.value.trim();
  if (!val) return;
  const nameInput = document.getElementById("piProjectName");
  if (nameInput && !nameInput.value) { input.style.borderColor = "#ea4335"; input.dataset.valid = "false"; }
  else { input.style.borderColor = ""; input.dataset.valid = "true"; }
}

/* ===== 多选下拉组件（支持搜索） ===== */
function setupMultiSelect(containerId, options, selectedValues, onChange, searchable) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  container.className = 'multiselect-wrap';

  const display = document.createElement('div');
  display.className = 'multiselect-display';
  display.tabIndex = 0;
  container.appendChild(display);

  const dropdown = document.createElement('div');
  dropdown.className = 'multiselect-dropdown';
  container.appendChild(dropdown);

  const selected = new Set(selectedValues || []);
  let searchText = '';

  function getFilteredOptions() {
    if (!searchText) return options;
    const q = searchText.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }

  function renderDisplay() {
    if (selected.size === 0 || selected.size === options.length) {
      display.innerHTML = '<span class="multiselect-placeholder">全部</span>';
    } else {
      display.innerHTML = `<span class="multiselect-tag">已选 ${selected.size} 项</span><span class="ms-clear-all">× 清除</span>`;
    }
  }

  function renderSearchBox() {
    if (!searchable) return;
    // 只有首次创建搜索框
    if (dropdown.querySelector('.ms-search')) return;
    const div = document.createElement('div');
    div.className = 'ms-search';
    div.innerHTML = '<input type="text" class="ms-search-input" placeholder="输入关键字搜索..." autocomplete="off">';
    dropdown.insertBefore(div, dropdown.firstChild);
    const input = div.querySelector('.ms-search-input');
    input.addEventListener('input', (e) => {
      searchText = e.target.value;
      renderItems();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && onChange) {
        const filtered = getFilteredOptions();
        filtered.forEach(o => selected.add(o.value));
        syncSelected();
        renderDisplay();
        renderItems();
        dropdown.classList.remove('show');
        onChange([...selected]);
      }
    });
  }

  function renderItems() {
    const filtered = getFilteredOptions();
    const isSearching = searchText.length > 0;
    // 搜索时：全选指已过滤项；否则指全部
    const total = isSearching ? filtered.length : options.length;
    const allSelected = !isSearching && selected.size === options.length;

    dropdown.querySelectorAll('.ms-select-all, .ms-item, .ms-empty').forEach(n => n.remove());

    const refNode = dropdown.querySelector('.ms-search') || null;

    // 全选行（始终不勾选，避免用户困惑）
    const selAll = document.createElement('div');
    selAll.className = 'ms-select-all';
    if (isSearching) {
      const allOn = filtered.length > 0 && filtered.every(o => selected.has(o.value));
      selAll.innerHTML = `<span>${allOn ? '取消全选' : '全选'}</span>`;
    } else {
      selAll.innerHTML = `<span>${allSelected ? '取消全选' : '全选'}</span>`;
    }
    if (refNode) refNode.after(selAll);
    else dropdown.appendChild(selAll);

    selAll.addEventListener('click', (e) => {
      if (isSearching) {
        const allOn = filtered.every(o => selected.has(o.value));
        filtered.forEach(o => {
          if (allOn) selected.delete(o.value);
          else selected.add(o.value);
        });
        syncSelected();
      } else {
        toggleAll();
        return; // toggleAll 已包含 syncSelected
      }
      renderDisplay();
      renderItems();
      if (onChange) onChange([...selected]);
    });

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ms-empty';
      empty.textContent = '无匹配';
      selAll.after(empty);
    } else {
      const frag = document.createDocumentFragment();
      filtered.forEach(o => {
        const item = document.createElement('div');
        item.className = 'ms-item';
        item.dataset.value = o.value;
        item.innerHTML = `<input type="checkbox" ${selected.has(o.value) ? 'checked' : ''}><span>${esc(o.label)}</span>`;
        item.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const v = item.dataset.value;
          if (selected.has(v)) selected.delete(v);
          else selected.add(v);
          const cb = item.querySelector('input[type=checkbox]');
          if (cb) cb.checked = selected.has(v);
          syncSelected();
          renderDisplay();
          if (onChange) onChange([...selected]);
        });
        frag.appendChild(item);
      });
      selAll.after(frag);
    }
  }

  function renderDropdown() {
    dropdown.innerHTML = '';
    if (searchable) renderSearchBox();
    renderItems();
  }

  function syncSelected() {
    // 把选中值同步到容器 dataset，供外部读取
    container.dataset.selectedValues = [...selected].join(',');
  }

  function toggleValue(value, force) {
    if (force === true) selected.add(value);
    else if (force === false) selected.delete(value);
    else if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    syncSelected();
    renderDisplay();
    renderDropdown();
    if (onChange) onChange([...selected]);
  }

  function toggleAll() {
    if (selected.size === options.length) {
      selected.clear();
    } else {
      options.forEach(o => selected.add(o.value));
    }
    syncSelected();
    renderDisplay();
    renderDropdown();
    if (onChange) onChange([...selected]);
  }

  display.addEventListener('click', (e) => {
    const close = e.target.closest('.ms-remove');
    const clearAll = e.target.closest('.ms-clear-all');
    if (close) { toggleValue(close.dataset.value, false); e.stopPropagation(); return; }
    if (clearAll) { selected.clear(); syncSelected(); renderDisplay(); renderDropdown(); if (onChange) onChange([]); e.stopPropagation(); return; }
    dropdown.classList.toggle('show');
    if (dropdown.classList.contains('show')) searchText = '';
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) dropdown.classList.remove('show');
  });

  syncSelected();
  renderDisplay();
  renderDropdown();
}
