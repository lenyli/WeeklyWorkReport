const LocalDatabase = (() => {
  const DB_NAME = "weekly-report-local-db";
  const INITIAL_PASSWORD = "123456";

  function result(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function open() {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("users")) db.createObjectStore("users", { keyPath: "name" });
      if (!db.objectStoreNames.contains("submissions")) {
        const store = db.createObjectStore("submissions", { keyPath: "id" });
        store.createIndex("weekStart", "weekStart");
      }
    };
    const db = await result(request);
    const existing = await result(db.transaction("users").objectStore("users").get("周南"));
    if (!existing) {
      const leader = { name: "周南", role: "collector", active: true, passwordHash: await passwordHash("周南", INITIAL_PASSWORD) };
      await result(db.transaction("users", "readwrite").objectStore("users").put(leader));
    }
    return db;
  }

  async function passwordHash(name, password) {
    const bytes = new TextEncoder().encode(`${name}\n${password}\nweekly-report-local-v1`);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  async function getUser(name) {
    const db = await open();
    return result(db.transaction("users").objectStore("users").get(name));
  }

  async function authenticate(name, password) {
    const user = await getUser(name);
    if (!user || !user.active || user.passwordHash !== (await passwordHash(name, password))) return null;
    return user;
  }

  async function authenticateOrCreate(name, password) {
    let user = await getUser(name);
    if (!user && password === INITIAL_PASSWORD) {
      await createMember(name);
      user = await getUser(name);
    }
    if (!user || !user.active || user.passwordHash !== (await passwordHash(name, password))) return null;
    return user;
  }

  async function listUsers() {
    const db = await open();
    return result(db.transaction("users").objectStore("users").getAll());
  }

  async function createMember(name) {
    if (await getUser(name)) throw new Error("该姓名的账号已存在。");
    const user = { name, role: "member", active: true, passwordHash: await passwordHash(name, INITIAL_PASSWORD) };
    const db = await open();
    await result(db.transaction("users", "readwrite").objectStore("users").add(user));
  }

  async function deleteUser(name) {
    const user = await getUser(name);
    if (!user || user.role === "collector") throw new Error("不能删除该账号。");
    const db = await open();
    await result(db.transaction("users", "readwrite").objectStore("users").delete(name));
  }

  async function changePassword(name, oldPassword, newPassword) {
    const user = await authenticate(name, oldPassword);
    if (!user) throw new Error("原密码不正确。");
    user.passwordHash = await passwordHash(name, newPassword);
    const db = await open();
    await result(db.transaction("users", "readwrite").objectStore("users").put(user));
  }

  async function saveSubmission(report) {
    const db = await open();
    const saved = { ...report, id: `${report.weekStart}::${report.memberName}` };
    await result(db.transaction("submissions", "readwrite").objectStore("submissions").put(saved));
  }

  async function listSubmissions(weekStart) {
    const db = await open();
    return result(db.transaction("submissions").objectStore("submissions").index("weekStart").getAll(weekStart));
  }

  return { authenticate, authenticateOrCreate, changePassword, deleteUser, listSubmissions, listUsers, saveSubmission };
})();
