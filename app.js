
// Theme management
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
const themeToggle = document.getElementById('themeToggle');
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}
if (themeToggle) themeToggle.addEventListener('click', toggleTheme);


// ------------------------------
// SQLite state using JaferSQL
// ------------------------------
let db = null;                // JaferDatabase instance
let currentTables = [];
let currentResults = null;    // { columns, values }
let filteredResults = null;
let currentPage = 1;
const pageSize = 50;
let globalSearchQuery = '';
let columnFilters = {};

let currentDbFileName = null;

// DOM elements
const fileInput = document.getElementById('dbFileInput');
const tableList = document.getElementById('tableList');
const sqlEditor = document.getElementById('sqlEditor');
const runQueryBtnInner = document.getElementById('runQueryBtnInner');
const toggleEditorBtn = document.getElementById('toggleEditorBtn');
const closeEditorBtnInner = document.getElementById('closeEditorBtnInner');
const editorSection = document.getElementById('editorSection');
const clearQueryBtn = document.getElementById('clearQueryBtn');
const highlightingCode = document.getElementById('highlighting-code');
const highlightingBox = document.getElementById('highlighting');
const resultsContainer = document.getElementById('resultsTableContainer');
const resultStats = document.getElementById('resultStats');
const queryError = document.getElementById('queryError');
const tableCount = document.getElementById('tableCount');
const tableSearch = document.getElementById('tableSearch');
const resetBtn = document.getElementById('resetBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const exportDbBtn = document.getElementById('exportDbBtn');

const loading = document.getElementById('loading');
const globalSearch = document.getElementById('globalSearch');
const resetFiltersBtn = document.getElementById('resetFiltersBtn');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageLinks = document.getElementById('pageLinks');
const paginationInfo = document.getElementById('paginationInfo');
const gridPagination = document.getElementById('gridPagination');
const tableInfoBar = document.getElementById('tableInfoBar');
const currentTableNameEl = document.getElementById('currentTableName');
const totalRowCountEl = document.getElementById('totalRowCount');
const totalColCountEl = document.getElementById('totalColCount');
let currentTableName = '';

// ---------------------------------
// Helper: Convert jaferAll rows to {columns, values}
// ---------------------------------
function rowsToResults(rows) {
    if (!rows || rows.length === 0) return { columns: [], values: [] };
    const columns = Object.keys(rows[0]);
    const values = rows.map(row => columns.map(col => row[col]));
    return { columns, values };
}

// ---------------------------------
// Load database file using JaferSQL
// ---------------------------------
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showLoading(true);
    resetState();
    try {
        const arrayBuffer = await file.arrayBuffer();
        const uInt8Array = new Uint8Array(arrayBuffer);
        // JaferSQL loads WASM automatically on first jaferInit
        db = await JaferSQL.jaferInit(uInt8Array);
        showToast('Database loaded successfully');
        loadTables();
        showResetBtn(true);
        currentDbFileName = file.name;   // e.g., "my_data.sqlite"
    } catch (err) {
        console.error(err);
        showError('Failed to load database: ' + (err.message || 'Invalid SQLite file'));
    } finally {
        showLoading(false);
    }
});

// Reset database
resetBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the current database?')) {
        resetState();
        fileInput.value = '';
        showResetBtn(false);
        showToast('Database cleared');
    }
});

// Load sample database (Chinook)
const loadSampleBtn = document.getElementById('loadSampleBtn');
loadSampleBtn.addEventListener('click', async () => {
    showLoading(true);
    resetState();
    try {
        const response = await fetch('https://raw.githubusercontent.com/lerocha/chinook-database/master/ChinookDatabase/DataSources/Chinook_Sqlite.sqlite');
        if (!response.ok) throw new Error('Failed to fetch sample');
        const arrayBuffer = await response.arrayBuffer();
        const uInt8Array = new Uint8Array(arrayBuffer);
        db = await JaferSQL.jaferInit(uInt8Array);
        showToast('Sample database loaded! (Chinook Music Store)');
        loadTables();
        showResetBtn(true);
        currentDbFileName = 'chinook_sample.db';
    } catch (err) {
        console.error(err);
        showError('Failed to load sample database.');
    } finally {
        showLoading(false);
    }
});

function showResetBtn(show) {
    //resetBtn.style.display = show ? 'inline-flex' : 'none';
    resetBtn.disabled = !show;
    exportCsvBtn.disabled = !show;
    exportJsonBtn.disabled = !show;
    exportDbBtn.disabled = !show;
}

function resetState() {
    if (db) {
        try { db.jaferClose(); } catch(e) {}
        db = null;
    }
    currentTables = [];
    currentTableName = '';
    tableList.innerHTML = '<div class="empty-state" style="padding: 1rem;"><small>No tables found</small></div>';
    tableCount.textContent = '0';
    clearResults();
    queryError.style.display = 'none';
    columnFilters = {};
    globalSearch.value = '';
    currentDbFileName = null;
    if (tableInfoBar) tableInfoBar.style.display = 'none';
}

// Load table list using jaferTables()
function loadTables() {
    if (!db) return;
    try {
        currentTables = db.jaferTables();  // returns array of table names
        tableCount.textContent = currentTables.length;
        renderTableList();
    } catch (err) {
        console.error(err);
        showError('Failed to read table list');
    }
}

function renderTableList(filter = '') {
    tableList.innerHTML = '';
    const filteredTables = currentTables.filter(t => t.toLowerCase().includes(filter.toLowerCase()));
    if (filteredTables.length === 0) {
        tableList.innerHTML = '<div class="empty-state" style="padding: 1rem;"><small>No matching tables</small></div>';
        return;
    }
    filteredTables.forEach(tableName => {
        const item = document.createElement('div');
        item.className = 'table-item';
        item.title = tableName;
        item.innerHTML = `
            <span class="table-toggle-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" style="width:12px; height:12px; margin-right:4px;"><path d="M6 5l7 5-7 5V5z" /></svg>
            </span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 4a3 3 0 00-3 3v6a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H5zm-1 9v-1h5v2H5a1 1 0 01-1-1zm7 1h4a1 1 0 001-1v-1h-5v2zm0-4h5V8h-5v2zm-7 0V8h5v2H4zm0-4a1 1 0 011-1h4v2H4V6zm7-1h4a1 1 0 011 1v1h-5V5z" clip-rule="evenodd" /></svg>
            <span style="flex:1">${escapeHtml(tableName)}</span>
        `;
        item.onclick = () => {
            document.querySelectorAll('.table-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            currentTableName = tableName;
            const query = `SELECT * FROM "${tableName}" LIMIT 10000;`;
            sqlEditor.value = query;
            if (typeof updateHighlighting === 'function') updateHighlighting();
            runQuery();
        };
        tableList.appendChild(item);
    });
}

tableSearch.addEventListener('input', (e) => renderTableList(e.target.value));

// ---------------------------------
// SQL Editor highlighting (Prism)
// ---------------------------------
if (sqlEditor && highlightingCode) {
    function updateHighlighting() {
        let text = sqlEditor.value;
        if (text[text.length - 1] === "\n") text += " ";
        highlightingCode.textContent = text;
        Prism.highlightElement(highlightingCode);
    }
    sqlEditor.addEventListener('input', updateHighlighting);
    sqlEditor.addEventListener('scroll', () => {
        highlightingBox.scrollTop = sqlEditor.scrollTop;
        highlightingBox.scrollLeft = sqlEditor.scrollLeft;
    });
    updateHighlighting();
    sqlEditor.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runQuery();
    });
}

// Toggle editor panel
function toggleEditor(shouldShow = null) {
    const isShow = (shouldShow !== null) ? shouldShow : (editorSection.style.display === 'none' || editorSection.style.display === '');
    editorSection.style.display = isShow ? 'block' : 'none';
    if (toggleEditorBtn) toggleEditorBtn.classList.toggle('btn-pro-primary', isShow);
    if (isShow) sqlEditor.focus();
}
if (toggleEditorBtn) toggleEditorBtn.addEventListener('click', () => toggleEditor());
if (closeEditorBtnInner) closeEditorBtnInner.addEventListener('click', () => toggleEditor(false));
if (clearQueryBtn) {
    clearQueryBtn.onclick = () => {
        sqlEditor.value = '';
        if (typeof updateHighlighting === 'function') updateHighlighting();
        sqlEditor.focus();
    };
}

// ---------------------------------
// Run SQL query using JaferSQL
// ---------------------------------
async function runQuery() {
    if (!db) {
        showError("Please load a database file first.");
        return;
    }
    const sql = sqlEditor.value.trim();
    if (!sql) return;
    queryError.style.display = 'none';
    columnFilters = {};
    globalSearch.value = '';

    try {
        const isSelect = /^\s*SELECT/i.test(sql);
        if (isSelect) {
            // Use jaferAll (returns array of objects)
            const rows = db.jaferAll(sql);
            currentResults = rowsToResults(rows);
            applyFilters();
        } else {
            // Non-SELECT: use jaferRun to get changes
            const result = db.jaferRun(sql);
            showSuccess(`Query executed successfully. Rows modified: ${result.changes}`);
            // Reload tables in case schema changed
            loadTables();
            clearResults();
        }
    } catch (err) {
        showError(err.message || 'Query failed');
    }
}
if (runQueryBtnInner) runQueryBtnInner.addEventListener('click', runQuery);

// ---------------------------------
// Filtering & Pagination (unchanged logic)
// ---------------------------------
function applyFilters() {
    if (!currentResults) return;
    const globalQuery = globalSearch.value.toLowerCase();
    const columns = currentResults.columns;
    const rows = currentResults.values;
    const filtered = rows.filter(row => {
        const matchesGlobal = globalQuery === '' || row.some(cell => String(cell).toLowerCase().includes(globalQuery));
        if (!matchesGlobal) return false;
        for (const [colIndex, filterValue] of Object.entries(columnFilters)) {
            const cellValue = String(row[colIndex]).toLowerCase();
            if (!cellValue.includes(filterValue.toLowerCase())) return false;
        }
        return true;
    });
    filteredResults = { columns, values: filtered };
    const resetBox = document.getElementById('resetFiltersBox');
    if (resetBox) resetBox.style.display = (globalQuery || Object.keys(columnFilters).length > 0) ? 'block' : 'none';
    currentPage = 1;
    renderGrid();
}

function renderGrid() {
    if (!filteredResults) return;
    const totalRows = filteredResults.values.length;
    const totalPages = Math.ceil(totalRows / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalRows);
    const pageData = filteredResults.values.slice(startIndex, endIndex);

    if (tableInfoBar && currentResults) {
        tableInfoBar.style.display = 'flex';
        currentTableNameEl.textContent = currentTableName || 'Query Results';
        totalRowCountEl.textContent = currentResults.values.length.toLocaleString();
        totalColCountEl.textContent = currentResults.columns.length;
    }
    if (resultStats) resultStats.textContent = totalRows;
    paginationInfo.textContent = totalRows > 0 ? `Showing ${startIndex + 1} - ${endIndex} of ${totalRows}` : 'No results';
    gridPagination.style.display = totalRows > 0 ? 'flex' : 'none';

    let html = '<table class="pro-table"><thead><tr>';
    html += '<th class="row-index-col">#</th>';
    filteredResults.columns.forEach((col, i) => {
        const typeIcon = detectTypeIcon(pageData, i);
        const filterVal = columnFilters[i] || '';
        html += `
            <th>
                <div class="th-inner">
                    <div class="th-title">
                        <span class="col-type-icon">${typeIcon}</span>
                        <span>${escapeHtml(col)}</span>
                    </div>
                    <div class="th-filter">
                        <input type="text" placeholder="Filter..." data-col="${i}" value="${escapeHtml(filterVal)}">
                    </div>
                </div>
            </th>
        `;
    });
    html += '</tr></thead><tbody>';
    pageData.forEach((row, rowIndex) => {
        const absoluteIndex = startIndex + rowIndex + 1;
        html += '<tr>';
        html += `<td class="row-index-col">${absoluteIndex}</td>`;
        row.forEach(cell => {
            const val = cell === null ? '<span class="val-null">NULL</span>' : escapeHtml(String(cell));
            html += `<td>${val}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    resultsContainer.innerHTML = html;

    // Attach filter input events
    resultsContainer.querySelectorAll('.th-filter input').forEach(input => {
        input.addEventListener('input', (e) => {
            const colIndex = e.target.getAttribute('data-col');
            const val = e.target.value;
            if (val) columnFilters[colIndex] = val;
            else delete columnFilters[colIndex];
            applyFilters();
        });
        input.addEventListener('click', (e) => e.stopPropagation());
    });
    updatePaginationControls(totalPages);
    exportCsvBtn.disabled = totalRows === 0;
    exportJsonBtn.disabled = totalRows === 0;
}

function detectTypeIcon(data, colIndex) {
    if (!data || data.length === 0) return 'ABC';
    const sample = data[0][colIndex];
    if (typeof sample === 'number') return '123';
    if (sample === null) return 'ABC';
    if (typeof sample === 'string' && sample.match(/^\d{4}-\d{2}-\d{2}/)) return '📅';
    return 'ABC';
}

function updatePaginationControls(totalPages) {
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
    pageLinks.innerHTML = '';
    if (totalPages <= 1) return;
    const addPageLink = (p) => {
        const btn = document.createElement('button');
        btn.className = 'btn-page';
        if (p === currentPage) btn.classList.add('active');
        btn.textContent = p;
        btn.onclick = () => { currentPage = p; renderGrid(); };
        pageLinks.appendChild(btn);
    };
    if (totalPages <= 5) {
        for (let i = 1; i <= totalPages; i++) addPageLink(i);
    } else {
        addPageLink(1);
        if (currentPage > 3) pageLinks.appendChild(document.createTextNode('...'));
        for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) addPageLink(i);
        if (currentPage < totalPages - 2) pageLinks.appendChild(document.createTextNode('...'));
        addPageLink(totalPages);
    }
}
prevPageBtn.onclick = () => { if (currentPage > 1) { currentPage--; renderGrid(); } };
nextPageBtn.onclick = () => { if (currentPage < Math.ceil(filteredResults.values.length / pageSize)) { currentPage++; renderGrid(); } };
globalSearch.addEventListener('input', applyFilters);
if (resetFiltersBtn) resetFiltersBtn.onclick = () => { columnFilters = {}; globalSearch.value = ''; applyFilters(); };

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ---------------------------------
// Export CSV / JSON
// ---------------------------------
exportCsvBtn.addEventListener('click', () => {
    if (!filteredResults) return;
    const csvContent = [
        filteredResults.columns.join(","),
        ...filteredResults.values.map(row => row.map(cell => {
            if (cell === null) return "";
            let s = String(cell);
            if (s.includes('"') || s.includes(',')) s = `"${s.replace(/"/g, '""')}"`;
            return s;
        }).join(","))
    ].join("\n");
    downloadFile(csvContent, 'sqlite_export.csv', 'text/csv');
});
exportJsonBtn.addEventListener('click', () => {
    if (!filteredResults) return;
    const jsonData = filteredResults.values.map(row => {
        let obj = {};
        filteredResults.columns.forEach((col, i) => obj[col] = row[i]);
        return obj;
    });
    downloadFile(JSON.stringify(jsonData, null, 2), 'sqlite_export.json', 'application/json');
});
function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Download entire database as .db file
function downloadDatabase() {
    if (!db) {
        showError("No database loaded.");
        return;
    }
    try {
        const data = db.jaferExport();
        const blob = new Blob([data], { type: 'application/x-sqlite3' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentDbFileName || 'database.db';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Database exported successfully.");
    } catch (err) {
        console.error(err);
        showError("Failed to export database: " + err.message);
    }
}

if (exportDbBtn) {
    exportDbBtn.addEventListener('click', downloadDatabase);
}

// ---------------------------------
// UI helpers (toast, loading, clear)
// ---------------------------------
function showToast(message) {
    const toast = document.getElementById("toast");
    if (toast) {
        toast.textContent = message;
        toast.className = "toast show";
        setTimeout(() => toast.className = "toast", 3000);
    }
}
function clearResults() {
    resultsContainer.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">📊</div>
            <h3>No Data to Display</h3>
            <p>Open a database file or run a query to see results here.</p>
        </div>
    `;
    if (resultStats) resultStats.textContent = '0';
    gridPagination.style.display = 'none';
    exportCsvBtn.disabled = true;
    exportJsonBtn.disabled = true;
    currentResults = null;
    filteredResults = null;
}
function showError(msg) {
    queryError.textContent = msg;
    queryError.style.display = 'block';
}
function showSuccess(msg) {
    queryError.style.display = 'none';
    showToast(msg);
}
function showLoading(show) {
    if (show) {
        loading.style.display = 'block';
        const empty = resultsContainer.querySelector('.empty-state');
        if (empty) empty.style.display = 'none';
    } else {
        loading.style.display = 'none';
        const empty = resultsContainer.querySelector('.empty-state');
        if (empty) empty.style.display = 'flex';
    }
}

// ---------------------------------
// Mobile SQLite sidebar toggle
// ---------------------------------
const sqliteSidebarToggle = document.getElementById('sqliteSidebarToggle');
const sqliteSidebar = document.querySelector('.sqlite-sidebar');
const sqliteSidebarOverlay = document.getElementById('sqliteSidebarOverlay');
function toggleSqliteSidebar() {
    if (sqliteSidebar && sqliteSidebarOverlay) {
        sqliteSidebar.classList.toggle('show');
        sqliteSidebarOverlay.classList.toggle('show');
    }
}
function closeSqliteSidebar() {
    if (sqliteSidebar && sqliteSidebarOverlay) {
        sqliteSidebar.classList.remove('show');
        sqliteSidebarOverlay.classList.remove('show');
    }
}
if (sqliteSidebarToggle) sqliteSidebarToggle.addEventListener('click', toggleSqliteSidebar);
if (sqliteSidebarOverlay) sqliteSidebarOverlay.addEventListener('click', closeSqliteSidebar);
// Close sidebar when a table is selected on mobile
tableList.addEventListener('click', (e) => {
    if (window.innerWidth <= 1024 && e.target.closest('.table-item')) closeSqliteSidebar();
});

// ---------------------------------
// Everything is ready – JaferSQL will load WASM automatically
// No need to call initializeSqlite() manually
// ---------------------------------
