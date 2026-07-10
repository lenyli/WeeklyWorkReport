const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 5173);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const LEADER_NAME = "周南";
const ROOT_NAME = "groves";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

let writeQueue = Promise.resolve();

function blankStore() {
  return { users: {}, roster: [], reports: {} };
}

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function roleFor(name) {
  if (name.toLowerCase() === ROOT_NAME) return "root";
  if (name === LEADER_NAME) return "collector";
  return "member";
}

function submissionKey(weekStart, name) {
  return `${weekStart}::${normalizeName(name)}`;
}

function sortNames(names) {
  return [...new Set(names.map(normalizeName).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "zh-Hans-u-co-pinyin", { numeric: true, sensitivity: "base" }),
  );
}

async function readStore() {
  try {
    return { ...blankStore(), ...JSON.parse(await fs.readFile(STORE_PATH, "utf8")) };
  } catch (error) {
    if (error.code === "ENOENT") return blankStore();
    throw error;
  }
}

async function writeStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  writeQueue = writeQueue.then(() => fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8"));
  await writeQueue;
}

async function mutateStore(mutator) {
  const store = await readStore();
  const result = await mutator(store);
  store.roster = sortNames(store.roster);
  await writeStore(store);
  return result;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function assertAdmin(actor) {
  const role = roleFor(normalizeName(actor));
  if (role !== "collector" && role !== "root") throw new Error("没有权限");
}

function validateSubmission(submission) {
  const name = normalizeName(submission?.memberName);
  if (!name) throw new Error("缺少成员姓名");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(submission?.weekStart || "")) throw new Error("缺少周一日期");
  if (!Array.isArray(submission.rows) || submission.rows.length !== 5) throw new Error("周报行数不正确");
  return {
    type: "weekly-report-submission",
    version: 2,
    memberName: name,
    weekStart: submission.weekStart,
    weekEnd: submission.weekEnd,
    submittedAt: submission.submittedAt || new Date().toISOString(),
    columns: submission.columns || [],
    rows: submission.rows,
  };
}

function reportsForWeek(store, weekStart) {
  return Object.fromEntries(
    Object.entries(store.reports).filter(([, report]) => report.weekStart === weekStart),
  );
}

async function handleApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readBody(req);
    const name = normalizeName(body.name);
    if (!name) return json(res, 400, { error: "请输入姓名" });
    const user = await mutateStore((store) => {
      const now = new Date().toISOString();
      const role = roleFor(name);
      store.users[name] = {
        name,
        role,
        firstLoginAt: store.users[name]?.firstLoginAt || now,
        lastLoginAt: now,
      };
      if (role !== "root") store.roster = sortNames([...store.roster, name]);
      return store.users[name];
    });
    return json(res, 200, { user });
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    const name = normalizeName(url.searchParams.get("name"));
    const weekStart = url.searchParams.get("weekStart");
    const role = roleFor(name);
    if (!name || !weekStart) return json(res, 400, { error: "缺少参数" });
    if (role !== "collector" && role !== "root") return json(res, 403, { error: "没有权限" });
    const store = await readStore();
    const payload = {
      user: store.users[name] || { name, role },
      roster: sortNames(store.roster),
      reports: reportsForWeek(store, weekStart),
    };
    if (role === "root") {
      payload.users = Object.values(store.users).sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-u-co-pinyin"));
      payload.allReports = Object.values(store.reports);
    }
    return json(res, 200, payload);
  }

  if (req.method === "POST" && url.pathname === "/api/reports") {
    const body = await readBody(req);
    const actor = normalizeName(body.actor);
    const report = validateSubmission(body.submission);
    if (!actor || actor !== report.memberName) return json(res, 403, { error: "只能提交自己的周报" });
    await mutateStore((store) => {
      const now = new Date().toISOString();
      const role = roleFor(report.memberName);
      store.users[report.memberName] = {
        name: report.memberName,
        role,
        firstLoginAt: store.users[report.memberName]?.firstLoginAt || now,
        lastLoginAt: store.users[report.memberName]?.lastLoginAt || now,
      };
      store.roster = sortNames([...store.roster, report.memberName]);
      store.reports[submissionKey(report.weekStart, report.memberName)] = report;
      return report;
    });
    return json(res, 200, { report });
  }

  if (req.method === "POST" && url.pathname === "/api/roster") {
    const body = await readBody(req);
    assertAdmin(body.actor);
    const name = normalizeName(body.name);
    if (!name || name.toLowerCase() === ROOT_NAME) return json(res, 400, { error: "成员姓名不正确" });
    const roster = await mutateStore((store) => {
      if (body.action === "delete") {
        store.roster = store.roster.filter((item) => item !== name);
      } else {
        store.roster = sortNames([...store.roster, name]);
      }
      return store.roster;
    });
    return json(res, 200, { roster });
  }

  return json(res, 404, { error: "接口不存在" });
}

async function serveStatic(req, res, url) {
  const cleanPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(ROOT, cleanPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": cleanPath === "/index.html" ? "no-store" : "public, max-age=60",
    });
    res.end(data);
  } catch (error) {
    res.writeHead(error.code === "ENOENT" ? 404 : 500);
    res.end(error.code === "ENOENT" ? "Not found" : "Server error");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (error) {
    json(res, 500, { error: error.message || "服务错误" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Weekly report PWA running at http://127.0.0.1:${PORT}/`);
});
