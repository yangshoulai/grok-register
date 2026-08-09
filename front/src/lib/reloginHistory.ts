import type { ReloginItem } from "@/lib/api";

export type ReloginHistoryEntry = {
  run_id: string;
  finished_at: number | null;
  total_count: number;
  success_count: number;
  failed_count: number;
  items: ReloginItem[];
};

// 使用独立数据库，避免同源下其它功能提前创建同名 v1 数据库但没有本对象仓库。
const DB_NAME = "grok-register-relogin-history";
const DB_VERSION = 1;
const STORE = "relogin-history";
const INDEX_FINISHED = "finished_at";

/**
 * IndexedDB 配额通常是磁盘剩余空间的一定比例（几百 MB 起步），
 * 远大于 localStorage 的 ~5MB，因此这里保留完整明细、不截断错误。
 * 历史列表由页面分页展示，存储层保留全部记录，不再因为固定条数截断。
 */

type ReportLike = {
  run_id?: string;
  finished_at?: number | null;
  total_count?: number;
  success_count?: number;
  failed_count?: number;
  items?: ReloginItem[];
};

let dbPromise: Promise<IDBDatabase | null> | null = null;
let memoryEntries: ReloginHistoryEntry[] = [];

function normalizeEntries(entries: ReloginHistoryEntry[]) {
  return entries
    .filter((entry) => entry && typeof entry.run_id === "string" && Array.isArray(entry.items))
    .sort((a, b) => (b.finished_at || 0) - (a.finished_at || 0));
}

function remember(entries: ReloginHistoryEntry[]) {
  memoryEntries = normalizeEntries(entries);
  return memoryEntries;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  const pending = new Promise<IDBDatabase | null>((resolve) => {
    const fail = () => {
      // 打开失败不永久缓存，下次写入或读取时允许重新尝试。
      queueMicrotask(() => {
        if (dbPromise === pending) dbPromise = null;
      });
      resolve(null);
    };
    if (typeof indexedDB === "undefined") {
      fail();
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      // 部分浏览器的隐私模式会直接抛错。
      fail();
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "run_id" });
        store.createIndex(INDEX_FINISHED, "finished_at");
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.close();
        fail();
        return;
      }
      db.onversionchange = () => {
        db.close();
        if (dbPromise === pending) dbPromise = null;
      };
      db.onclose = () => {
        if (dbPromise === pending) dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = fail;
    request.onblocked = fail;
  });
  dbPromise = pending;
  return pending;
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | null
): Promise<T | null> {
  return openDatabase().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        let request: IDBRequest<T> | null;
        let result: T | null = null;
        let settled = false;
        const finish = (value: T | null) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        try {
          const tx = db.transaction(STORE, mode);
          request = work(tx.objectStore(STORE));
          tx.oncomplete = () => finish(result);
          tx.onabort = () => finish(null);
          tx.onerror = () => finish(null);
        } catch {
          finish(null);
          return;
        }
        if (!request) {
          finish(null);
          return;
        }
        request.onsuccess = () => {
          result = request!.result;
        };
        request.onerror = () => finish(null);
      })
  );
}

/** 按完成时间倒序返回全部历史；存储不可用时返回空数组，功能静默降级。 */
export async function loadReloginHistory(): Promise<ReloginHistoryEntry[]> {
  const rows = await runTransaction<ReloginHistoryEntry[]>("readonly", (store) => store.getAll());
  if (!rows) return memoryEntries;
  return remember(rows);
}

export async function appendReloginHistory(report: ReportLike): Promise<ReloginHistoryEntry[]> {
  const runId = String(report.run_id || "");
  if (!runId) return loadReloginHistory();
  const entry: ReloginHistoryEntry = {
    run_id: runId,
    finished_at: report.finished_at ?? null,
    total_count: Number(report.total_count || 0),
    success_count: Number(report.success_count || 0),
    failed_count: Number(report.failed_count || 0),
    items: (report.items ?? []).map((item) => ({
      ...item,
      error: String(item.error || ""),
    })),
  };
  const current = memoryEntries.filter((old) => old.run_id !== runId);
  remember([entry, ...current]);
  const stored = await runTransaction<IDBValidKey>("readwrite", (store) => store.put(entry));
  if (stored === null) return memoryEntries;

  return loadReloginHistory();
}

export async function removeReloginHistory(runId: string): Promise<ReloginHistoryEntry[]> {
  remember(memoryEntries.filter((entry) => entry.run_id !== runId));
  await runTransaction<undefined>("readwrite", (store) => store.delete(runId));
  return loadReloginHistory();
}

export async function clearReloginHistory(): Promise<ReloginHistoryEntry[]> {
  remember([]);
  await runTransaction<undefined>("readwrite", (store) => store.clear());
  return loadReloginHistory();
}
