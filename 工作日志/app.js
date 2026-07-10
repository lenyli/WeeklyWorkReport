const LEADER_NAME = "周南";
const ROOT_NAME = "groves";
const STORAGE_KEY = "weekly-report-pwa-client";

const REPORT_COLUMNS = [
  { key: "date", label: "日期" },
  { key: "dev", label: "开发/测试/需求" },
  { key: "site", label: "场地支持" },
  { key: "presales", label: "售前支持" },
  { key: "other", label: "其他" },
];

const WEEKDAYS = ["星期一", "星期二", "星期三", "星期四", "星期五"];
const $ = (id) => document.getElementById(id);

const clientState = loadClientState();
let currentUser = null;
let collectorData = null;
let rootData = null;
let lastSubmission = null;

function loadClientState() {
  try {
    return {
      name: "",
      drafts: {},
      submissions: {},
      ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
    };
  } catch {
    return { name: "", drafts: {}, submissions: {} };
  }
}

function saveClientState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clientState));
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function getRole(name) {
  if (name.toLowerCase() === ROOT_NAME) return "root";
  if (name === LEADER_NAME) return "collector";
  return "member";
}

function todayMonday() {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return toISODate(date);
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISODate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(isoDate, days) {
  const date = parseISODate(isoDate);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

function weekDates(startIso) {
  return WEEKDAYS.map((weekday, index) => ({
    iso: addDays(startIso, index),
    label: `${addDays(startIso, index)}\n${weekday}`,
    weekday,
  }));
}

function submissionKey(weekStart, memberName) {
  return `${weekStart}::${normalizeName(memberName)}`;
}

function currentDraftKey() {
  return submissionKey($("reportWeekStart").value, currentUser?.name || "");
}

const nameCollator = new Intl.Collator("zh-Hans-u-co-pinyin", {
  numeric: true,
  sensitivity: "base",
});

function sortNames(names) {
  return [...new Set(names.map(normalizeName).filter(Boolean))].sort((a, b) =>
    nameCollator.compare(a, b),
  );
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || `请求失败：${response.status}`);
  return data;
}

function setPanels() {
  const loggedIn = Boolean(currentUser);
  const role = currentUser?.role;
  $("loginPanel").classList.toggle("hidden", loggedIn);
  $("accountBar").classList.toggle("hidden", !loggedIn);
  $("reportPanel").classList.toggle("hidden", !loggedIn || role === "root");
  $("collectorPanel").classList.toggle("hidden", role !== "collector");
  $("rootPanel").classList.toggle("hidden", role !== "root");
  if (loggedIn) $("accountName").textContent = currentUser.name;
}

async function login(name) {
  const normalized = normalizeName(name);
  if (!normalized) return;
  $("loginStatus").textContent = "正在进入...";
  const result = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ name: normalized }),
  });
  currentUser = result.user;
  clientState.name = normalized;
  saveClientState();
  $("loginStatus").textContent = "";
  setPanels();
  await afterLogin();
}

async function afterLogin() {
  if (currentUser.role !== "root") {
    if (!$("reportWeekStart").value) $("reportWeekStart").value = todayMonday();
    renderReportTable();
    loadDraftIntoForm();
  }
  if (currentUser.role === "collector") await refreshCollector();
  if (currentUser.role === "root") await refreshRoot();
}

function logout() {
  currentUser = null;
  collectorData = null;
  rootData = null;
  clientState.name = "";
  saveClientState();
  $("nameInput").value = "";
  $("reportStatus").textContent = "";
  setPanels();
}

function renderReportTable() {
  const wrap = $("reportTableWrap");
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const headRow = document.createElement("tr");

  REPORT_COLUMNS.forEach((col) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = col.label;
    headRow.append(th);
  });
  thead.append(headRow);

  weekDates($("reportWeekStart").value).forEach((day) => {
    const row = $("rowTemplate").content.firstElementChild.cloneNode(true);
    row.querySelector("th").textContent = day.label;
    row.dataset.date = day.iso;
    tbody.append(row);
  });

  table.append(thead, tbody);
  wrap.replaceChildren(table);
  wrap.querySelectorAll("textarea").forEach((input) => {
    input.addEventListener("input", () => {
      saveDraft({ silent: true });
      $("reportStatus").textContent = "草稿已保存在本机。";
    });
  });
}

function collectFormRows() {
  return [...$("reportTableWrap").querySelectorAll("tbody tr")].map((row, index) => {
    const fields = {};
    row.querySelectorAll("textarea").forEach((textarea) => {
      fields[textarea.dataset.field] = textarea.value.trim();
    });
    return {
      date: row.dataset.date,
      weekday: WEEKDAYS[index],
      fields,
    };
  });
}

function loadDraftIntoForm() {
  const draft = clientState.drafts[currentDraftKey()];
  $("reportTableWrap").querySelectorAll("tbody tr").forEach((row, index) => {
    const source = draft?.rows?.[index]?.fields || {};
    row.querySelectorAll("textarea").forEach((textarea) => {
      textarea.value = source[textarea.dataset.field] || "";
    });
  });
}

function saveDraft(options = {}) {
  if (!currentUser?.name || !$("reportWeekStart").value) return;
  const draft = {
    memberName: currentUser.name,
    weekStart: $("reportWeekStart").value,
    weekEnd: addDays($("reportWeekStart").value, 4),
    updatedAt: new Date().toISOString(),
    rows: collectFormRows(),
  };
  clientState.drafts[currentDraftKey()] = draft;
  saveClientState();
  if (!options.silent) $("reportStatus").textContent = "草稿已保存在本机。";
}

function createSubmission() {
  saveDraft({ silent: true });
  const weekStart = $("reportWeekStart").value;
  return {
    type: "weekly-report-submission",
    version: 2,
    memberName: currentUser.name,
    weekStart,
    weekEnd: addDays(weekStart, 4),
    submittedAt: new Date().toISOString(),
    columns: REPORT_COLUMNS.map(({ key, label }) => ({ key, label })),
    rows: collectFormRows(),
  };
}

async function submitReport() {
  const submission = createSubmission();
  $("reportStatus").textContent = "正在提交...";
  const result = await api("/api/reports", {
    method: "POST",
    body: JSON.stringify({ actor: currentUser.name, submission }),
  });
  lastSubmission = result.report;
  clientState.submissions[submissionKey(submission.weekStart, submission.memberName)] = result.report;
  saveClientState();
  $("reportStatus").textContent = "已提交，统一收集端已自动收到。";
  if (currentUser.role === "collector") await refreshCollector();
}

function downloadBackup() {
  const submission = lastSubmission || createSubmission();
  downloadBlob(jsonBlob(submission), `周报备份_${submission.weekStart}_${submission.memberName}.json`);
}

function jsonBlob(value) {
  return new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
}

function downloadBlob(blob, fileName) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function refreshCollector() {
  const weekStart = $("collectorWeekStart").value || todayMonday();
  $("collectorWeekStart").value = weekStart;
  collectorData = await api(`/api/state?name=${encodeURIComponent(currentUser.name)}&weekStart=${weekStart}`);
  renderCollector();
}

function renderCollector() {
  if (!collectorData) return;
  const roster = sortNames(collectorData.roster);
  const reports = collectorData.reports || {};
  $("rosterCount").textContent = `(${roster.length}/20)`;
  $("rosterList").replaceChildren(
    ...roster.map((name) => {
      const row = document.createElement("div");
      row.className = "person-row";
      row.innerHTML = `<strong></strong><button class="ghost danger" type="button">删除</button>`;
      row.querySelector("strong").textContent = name;
      row.querySelector("button").addEventListener("click", () => removeRosterMember(name));
      return row;
    }),
  );
  renderStatusBlock($("collectorStatus"), roster, reports, $("collectorWeekStart").value);
}

function renderStatusBlock(target, roster, reports, weekStart) {
  const submitted = roster.filter((name) => reports[submissionKey(weekStart, name)]);
  const missing = roster.filter((name) => !reports[submissionKey(weekStart, name)]);
  target.replaceChildren(
    statusLine(`本周名单 ${roster.length} 人，已提交 ${submitted.length} 人，未提交 ${missing.length} 人。`, "summary-line"),
  );
  roster.forEach((name) => {
    const report = reports[submissionKey(weekStart, name)];
    const row = document.createElement("div");
    row.className = "status-row";
    const left = document.createElement("span");
    left.textContent = name;
    const right = document.createElement("span");
    right.className = `pill ${report ? "ok" : "missing"}`;
    right.textContent = report ? "已提交" : "未提交";
    row.append(left, right);
    target.append(row);
  });
}

function statusLine(text, className = "") {
  const line = document.createElement("div");
  line.className = className;
  line.textContent = text;
  return line;
}

async function addRosterMember(name) {
  const normalized = normalizeName(name);
  if (!normalized) return;
  await api("/api/roster", {
    method: "POST",
    body: JSON.stringify({ actor: currentUser.name, action: "add", name: normalized }),
  });
  await refreshCollector();
}

async function removeRosterMember(name) {
  if (!confirm(`确定删除 ${name}？会同时从本周缺交统计名单中移除。`)) return;
  await api("/api/roster", {
    method: "POST",
    body: JSON.stringify({ actor: currentUser.name, action: "delete", name }),
  });
  await refreshCollector();
}

function exportCollectorWorkbook() {
  if (!collectorData) return;
  const weekStart = $("collectorWeekStart").value;
  const workbook = buildWorkbookData(weekStart, collectorData.roster, collectorData.reports || {});
  downloadBlob(createXlsx(workbook), `周报汇总_${weekStart}.xlsx`);
}

async function refreshRoot() {
  const weekStart = $("rootWeekStart").value || todayMonday();
  $("rootWeekStart").value = weekStart;
  rootData = await api(`/api/state?name=${encodeURIComponent(currentUser.name)}&weekStart=${weekStart}`);
  renderRoot();
}

function renderRoot() {
  if (!rootData) return;
  const weekStart = $("rootWeekStart").value;
  renderStatusBlock($("rootSummary"), sortNames(rootData.roster), rootData.reports || {}, weekStart);
  renderLoginTimes();
  renderAllReports();
}

function renderLoginTimes() {
  const users = [...(rootData.users || [])].sort((a, b) => {
    const at = a.lastLoginAt || "";
    const bt = b.lastLoginAt || "";
    return bt.localeCompare(at);
  });
  $("loginTimes").replaceChildren(
    ...users.map((user) => {
      const row = document.createElement("div");
      row.className = "person-row";
      row.innerHTML = `<strong></strong><span></span>`;
      row.querySelector("strong").textContent = user.name;
      row.querySelector("span").textContent = formatDateTime(user.lastLoginAt);
      return row;
    }),
  );
}

function renderAllReports() {
  const reports = [...(rootData.allReports || [])].sort((a, b) => {
    const weekCompare = b.weekStart.localeCompare(a.weekStart);
    if (weekCompare) return weekCompare;
    return nameCollator.compare(a.memberName, b.memberName);
  });
  $("allReports").replaceChildren(
    ...reports.map((report) => {
      const card = document.createElement("article");
      card.className = "report-card";
      const rows = report.rows
        .map((row) => {
          const f = row.fields || {};
          return `<tr><th>${escapeHtml(`${row.date}\n${row.weekday}`)}</th><td>${escapeHtml(f.dev || "")}</td><td>${escapeHtml(f.site || "")}</td><td>${escapeHtml(f.presales || "")}</td><td>${escapeHtml(f.other || "")}</td></tr>`;
        })
        .join("");
      card.innerHTML = `<header><strong>${escapeHtml(report.memberName)}</strong><span>${escapeHtml(report.weekStart)} 至 ${escapeHtml(report.weekEnd)}｜${escapeHtml(formatDateTime(report.submittedAt))}</span></header>
        <div class="table-wrap"><table><thead><tr>${REPORT_COLUMNS.map((col) => `<th>${escapeHtml(col.label)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
      return card;
    }),
  );
}

function exportRootWorkbook() {
  if (!rootData) return;
  const weekStart = $("rootWeekStart").value;
  const workbook = buildWorkbookData(weekStart, rootData.roster, rootData.reports || {});
  downloadBlob(createXlsx(workbook), `groves_周报汇总_${weekStart}.xlsx`);
}

function buildWorkbookData(weekStart, roster, reports) {
  const names = sortNames([...roster, ...Object.values(reports).map((report) => report.memberName)]);
  const summaryRows = [
    [
      { value: "姓名", style: 4 },
      { value: "状态", style: 4 },
      { value: "提交时间", style: 4 },
      { value: "备注", style: 4 },
    ],
  ];

  names.forEach((name) => {
    const report = reports[submissionKey(weekStart, name)];
    summaryRows.push([
      { value: name, style: 3 },
      { value: report ? "已提交" : "未提交", style: report ? 5 : 6 },
      { value: report ? formatDateTime(report.submittedAt) : "", style: 3 },
      { value: report ? "" : "未收到本周提交", style: 3 },
    ]);
  });

  const sheets = [
    {
      name: "汇总",
      columns: [16, 12, 22, 30],
      rows: summaryRows.map((cells, index) => ({ height: index === 0 ? 26 : 22, cells })),
    },
  ];

  const usedNames = new Set(["汇总"]);
  names.forEach((name) => {
    const report = reports[submissionKey(weekStart, name)];
    const rows = [
      REPORT_COLUMNS.map((col) => ({ value: col.label, style: 1 })),
      ...weekDates(weekStart).map((day, index) => {
        const fields = report?.rows?.[index]?.fields || {};
        return [
          { value: day.label, style: 2 },
          { value: fields.dev || "", style: 3 },
          { value: fields.site || "", style: 3 },
          { value: fields.presales || "", style: 3 },
          { value: fields.other || "", style: 3 },
        ];
      }),
    ];
    sheets.push({
      name: sanitizeSheetName(name, usedNames),
      columns: [12, 22, 22, 22, 24],
      rows: rows.map((cells, index) => ({ height: index === 0 ? 38 : 60, cells })),
    });
  });
  return { sheets };
}

function sanitizeSheetName(name, used) {
  const base = (name || "未命名")
    .replace(/[\[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || "未命名";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    const tail = ` ${suffix}`;
    candidate = `${base.slice(0, 31 - tail.length)}${tail}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createXlsx(workbook) {
  const files = {};
  files["[Content_Types].xml"] = contentTypesXml(workbook.sheets.length);
  files["_rels/.rels"] = rootRelsXml();
  files["docProps/core.xml"] = coreXml();
  files["docProps/app.xml"] = appXml(workbook.sheets.length);
  files["xl/workbook.xml"] = workbookXml(workbook.sheets);
  files["xl/_rels/workbook.xml.rels"] = workbookRelsXml(workbook.sheets.length);
  files["xl/styles.xml"] = stylesXml();
  workbook.sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = sheetXml(sheet);
  });
  return new Blob([zipStore(files)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function contentTypesXml(sheetCount) {
  const sheets = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return xmlDecl(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
${sheets}
</Types>`);
}

function rootRelsXml() {
  return xmlDecl(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
}

function workbookRelsXml(sheetCount) {
  const rels = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join("");
  return xmlDecl(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels}
<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
}

function workbookXml(sheets) {
  const sheetNodes = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${xmlAttr(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("");
  return xmlDecl(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNodes}</sheets></workbook>`);
}

function coreXml() {
  const now = new Date().toISOString();
  return xmlDecl(`<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:creator>工作周报收集 PWA</dc:creator><cp:lastModifiedBy>工作周报收集 PWA</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`);
}

function appXml(sheetCount) {
  return xmlDecl(`<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>工作周报收集 PWA</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>
<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheetCount}</vt:i4></vt:variant></vt:vector></HeadingPairs>
</Properties>`);
}

function stylesXml() {
  return xmlDecl(`<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><color theme="1"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><color theme="1"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/></font></fonts>
<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE5F3DD"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF6F7"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF155E75"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFEE4E2"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFB8C8CF"/></left><right style="thin"><color rgb="FFB8C8CF"/></right><top style="thin"><color rgb="FFB8C8CF"/></top><bottom style="thin"><color rgb="FFB8C8CF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
}

function sheetXml(sheet) {
  const maxCols = Math.max(...sheet.rows.map((row) => row.cells.length));
  const ref = `A1:${columnName(maxCols)}${sheet.rows.length}`;
  const cols = sheet.columns
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const rows = sheet.rows
    .map((row, rowIndex) => {
      const cells = row.cells.map((cell, colIndex) => cellXml(cell, rowIndex + 1, colIndex + 1)).join("");
      const height = row.height ? ` ht="${row.height}" customHeight="1"` : "";
      return `<row r="${rowIndex + 1}"${height}>${cells}</row>`;
    })
    .join("");
  return xmlDecl(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18"/><dimension ref="${ref}"/><cols>${cols}</cols><sheetData>${rows}</sheetData>
<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`);
}

function cellXml(cell, rowIndex, colIndex) {
  const ref = `${columnName(colIndex)}${rowIndex}`;
  const style = Number.isInteger(cell.style) ? ` s="${cell.style}"` : "";
  const value = cell.value == null ? "" : String(cell.value);
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
}

function columnName(index) {
  let name = "";
  while (index > 0) {
    const rem = (index - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    index = Math.floor((index - 1) / 26);
  }
  return name;
}

function xmlDecl(content) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${content}`;
}

function xmlText(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function xmlAttr(value) {
  return xmlText(value).replace(/"/g, "&quot;");
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  Object.entries(files).forEach(([path, content]) => {
    const nameBytes = encoder.encode(path);
    const data = typeof content === "string" ? encoder.encode(content) : content;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  });
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, centralParts.length, true);
  endView.setUint16(10, centralParts.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const totalLength = localParts.reduce((sum, part) => sum + part.length, 0) + centralSize + end.length;
  const output = new Uint8Array(totalLength);
  let cursor = 0;
  [...localParts, ...centralParts, end].forEach((part) => {
    output.set(part, cursor);
    cursor += part.length;
  });
  return output;
}

function bindEvents() {
  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await login($("nameInput").value);
    } catch (error) {
      $("loginStatus").textContent = error.message;
    }
  });
  $("logoutBtn").addEventListener("click", logout);
  $("reportWeekStart").addEventListener("change", () => {
    renderReportTable();
    loadDraftIntoForm();
  });
  $("collectorWeekStart").addEventListener("change", refreshCollector);
  $("rootWeekStart").addEventListener("change", refreshRoot);
  $("saveDraftBtn").addEventListener("click", () => saveDraft());
  $("submitBtn").addEventListener("click", () => submitReport().catch((error) => ($("reportStatus").textContent = error.message)));
  $("downloadBackupBtn").addEventListener("click", downloadBackup);
  $("refreshCollectorBtn").addEventListener("click", refreshCollector);
  $("exportExcelBtn").addEventListener("click", exportCollectorWorkbook);
  $("addMemberForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await addRosterMember($("memberNameToAdd").value);
    $("memberNameToAdd").value = "";
  });
  $("refreshRootBtn").addEventListener("click", refreshRoot);
  $("rootExportExcelBtn").addEventListener("click", exportRootWorkbook);
}

async function boot() {
  $("reportWeekStart").value = todayMonday();
  $("collectorWeekStart").value = todayMonday();
  $("rootWeekStart").value = todayMonday();
  bindEvents();
  setPanels();
  if (clientState.name) {
    $("nameInput").value = clientState.name;
    try {
      await login(clientState.name);
    } catch {
      clientState.name = "";
      saveClientState();
      setPanels();
    }
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((error) => console.warn(error));
  }
}

boot();
