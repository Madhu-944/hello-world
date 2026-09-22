document.addEventListener('DOMContentLoaded', () => {

  // ----------------------------
  // Helpers: safe element access
  // ----------------------------
  const $ = (id) => document.getElementById(id);

  const outEl = $('out');           // optional
  const sqlEl = $('sql');           // recommended textarea
  const metaEl = $('resultMeta');   // optional
  const headEl = $('resultHead');   // optional
  const bodyEl = $('resultBody');   // optional
  const errorBox = $('errorBox');   // optional

  function showError(err) {
    const msg = (err && err.stack) ? err.stack : (err && err.message) ? err.message : String(err);
    if (errorBox) {
      errorBox.style.display = 'block';
      errorBox.textContent = msg;
    }
    if (outEl && !errorBox) outEl.textContent = "ERROR:\n" + msg;
    console.error(err);
  }

  function clearError() {
    if (errorBox) {
      errorBox.style.display = 'none';
      errorBox.textContent = '';
    }
  }

  // ----------------------------
  // Assert model is ready
  // ----------------------------
  function assertReady() {
    if (typeof alasql === 'undefined') {
      throw new Error("AlaSQL not loaded (check your <script src> path/order).");
    }
    if (!alasql.tables || !alasql.tables.Elements) {
      throw new Error("render-model.js did not initialise tables (it may have crashed before table init).");
    }
  }

  // ----------------------------
  // Table UI state (optional)
  // ----------------------------
  let fullRows = [];
  let filteredRows = [];
  let page = 1;
  let pageSize = Number($('pageSize')?.value) || 25;
  let sortKey = null;
  let sortDir = 1; // 1 asc, -1 desc

  function normalise(v) {
    if (v === null || v === undefined) return '';
    return String(v).toLowerCase();
  }

  function applyFilter() {
    const filterEl = $('filter');
    const q = normalise(filterEl ? filterEl.value : '').trim();

    if (!q) {
      filteredRows = [...fullRows];
    } else {
      filteredRows = fullRows.filter(row => {
        if (!row) return false;
        for (const k of Object.keys(row)) {
          if (normalise(row[k]).includes(q)) return true;
        }
        return false;
      });
    }

    page = 1;
    applySort();
  }

  function applySort() {
    if (!sortKey) {
      render();
      return;
    }
    filteredRows.sort((a, b) => {
      const av = a?.[sortKey];
      const bv = b?.[sortKey];

      const an = (typeof av === 'number') ? av : (!isNaN(Number(av)) && av !== '' && av !== null && av !== undefined ? Number(av) : null);
      const bn = (typeof bv === 'number') ? bv : (!isNaN(Number(bv)) && bv !== '' && bv !== null && bv !== undefined ? Number(bv) : null);

      let cmp;
      if (an !== null && bn !== null) cmp = an - bn;
      else cmp = normalise(av).localeCompare(normalise(bv));

      return cmp * sortDir;
    });
    render();
  }

  function setSort(key) {
    if (sortKey === key) sortDir *= -1;
    else { sortKey = key; sortDir = 1; }
    applySort();
  }

  // ----------------------------
  // Render: table if present, else JSON to #out
  // ----------------------------
  function render() {
    const total = filteredRows.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.min(page, pages);

    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    const rows = filteredRows.slice(start, end);

    const pageInfoEl = $('pageInfo');
    if (metaEl) metaEl.textContent = `Rows: ${total} (showing ${start + 1}-${end})`;
    if (pageInfoEl) pageInfoEl.textContent = `Page ${page} / ${pages}`;

    // If there is no table container, just dump JSON
    if (!headEl || !bodyEl) {
      if (outEl) outEl.textContent = JSON.stringify(rows, null, 2);
      return;
    }

    // Columns: use keys of first row (fast). If empty, clear table.
    const columns = rows.length ? Object.keys(rows[0]) : (fullRows.length ? Object.keys(fullRows[0]) : []);
    headEl.innerHTML = '';
    bodyEl.innerHTML = '';

    if (!columns.length) return;

    // Header
    const trh = document.createElement('tr');
    columns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col + (sortKey === col ? (sortDir === 1 ? ' ▲' : ' ▼') : '');
      th.style.padding = '6px 8px';
      th.style.borderBottom = '1px solid #ddd';
      th.style.position = 'sticky';
      th.style.top = '0';
      th.style.background = '#f7f7f7';
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => setSort(col));
      trh.appendChild(th);
    });
    headEl.appendChild(trh);

    let lastGroupValue = null;
    // Rows
    rows.forEach(r => {
      const currentGroupValue = r?.[columns[0]];
	  //alert(currentGroupValue);
	  //const currentGroupValue = r?.[GROUP_COLUMN];
      const tr = document.createElement('tr');
      if (currentGroupValue !== lastGroupValue) {
          tr.classList.add('group-start');
          lastGroupValue = currentGroupValue;
      }

      columns.forEach(col => {
        const td = document.createElement('td');
        const v = r?.[col];

        if (typeof v === 'string' && v.indexOf('http') !== -1) {
          td.innerHTML = String(v).replace(
            /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/gi,
            url => `<a href="${url}" target="_blank" rel="noopener noreferrer">🔗 Click here</a>`
          );
        } else {
            td.textContent = (v === null || v === undefined) ? '' : String(v);
        }

        td.style.padding = '6px 8px';
        td.style.borderBottom = '1px solid #eee';
        tr.appendChild(td);
      });
      bodyEl.appendChild(tr);
    });
  }

  // ----------------------------
  // Run SQL and refresh UI
  // ----------------------------
  function runSql() {
    clearError();
    try {
      assertReady();

      const sql = document.getElementById('myprompt')?.textContent || "SELECT TOP 20 id, type, name FROM Elements;";
      const res = alasql(sql);

      fullRows = Array.isArray(res) ? res : [{ result: res }];
      filteredRows = [...fullRows];

      // reset paging/sort
      const ps = Number($('pageSize')?.value);
      pageSize = (ps && !isNaN(ps)) ? ps : pageSize;
      page = 1;
      sortKey = null;
      sortDir = 1;

      applyFilter();
    } catch (e) {
      showError(e);
    }
  }

  // ----------------------------
  // Wire events SAFELY (no null.addEventListener)
  // ----------------------------
  const runBtn = $('run');
  if (runBtn) runBtn.addEventListener('click', runSql);

  const filterEl = $('filter');
  if (filterEl) filterEl.addEventListener('input', applyFilter);

  const pageSizeEl = $('pageSize');
  if (pageSizeEl) pageSizeEl.addEventListener('change', () => {
    const ps = Number(pageSizeEl.value) || 25;
    pageSize = ps;
    page = 1;
    render();
  });

  const prevBtn = $('prev');
  if (prevBtn) prevBtn.addEventListener('click', () => {
    page = Math.max(1, page - 1);
    render();
  });

  const nextBtn = $('next');
  if (nextBtn) nextBtn.addEventListener('click', () => {
    const pages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    page = Math.min(pages, page + 1);
    render();
  });

  // ----------------------------
  // Auto-run once on load
  // ----------------------------
  runSql();

});

  // ----------------------------
  // Function hide show SQL
  // ----------------------------
(function () {
  const sqlBox   = document.getElementById('myprompt');
  const row      = document.getElementById('sqlToggleRow');
  const toggle   = document.getElementById('toggleSql');

  if (!sqlBox || !row || !toggle) return;

  // toon de toggle alleen als er SQL is
  row.style.display = 'block';
  sqlBox.style.display = 'none';

  toggle.onclick = function (e) {
    e.preventDefault();
    const visible = sqlBox.style.display !== 'none';
    sqlBox.style.display = visible ? 'none' : 'block';
    toggle.textContent   = visible ? 'show SQL' : 'hide SQL';
  };
})();