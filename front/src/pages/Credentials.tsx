import { useEffect, useState } from "react";
import { Archive, Copy, Download, Loader2, Search, ShieldAlert, UploadCloud } from "lucide-react";
import { AccountEmailLabel } from "@/components/AccountEmailIcon";
import { Badge, Button, Card, EmptyState, Input, PageHeader, PaginationBar, Toast } from "@/components/ui";
import { api, type AccountRecord, type AuthKind } from "@/lib/api";
import { copyText } from "@/lib/utils";

export function CredentialsPage() {
  const [items, setItems] = useState<AccountRecord[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<AuthKind>("cpa");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState<{ message: string; tone?: "default" | "success" | "error" }>({ message: "" });

  const notify = (message: string, tone: "default" | "success" | "error" = "default") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast({ message: "" }), 2400);
  };

  const load = async (targetPage = page, targetQuery = query, targetPageSize = pageSize) => {
    setLoading(true);
    try {
      const result = await api.accounts({ limit: targetPageSize, offset: (targetPage - 1) * targetPageSize, q: targetQuery.trim() });
      setItems(result.items || []);
      setTotal(Number(result.total ?? result.items?.length ?? 0));
      setPage(targetPage);
    } catch (error: any) {
      notify(error.message || "授权文件加载失败", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelected({});
      void load(1, query);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  const filtered = items;
  const isAvailable = (item: AccountRecord) => tab === "cpa"
    ? item.cpa_auth_available
    : tab === "grok2api"
      ? item.grok2api_auth_available
      : item.sso_available;
  const selectedIds = Object.entries(selected).filter(([, value]) => value).map(([id]) => Number(id));
  const availableCount = filtered.filter(isAvailable).length;
  const selectableItems = filtered.filter(isAvailable);
  const allVisibleSelected = selectableItems.length > 0 && selectableItems.every((item) => selected[item.id]);

  const toggleAllVisible = (checked: boolean) => {
    setSelected((previous) => {
      const next = { ...previous };
      for (const item of selectableItems) {
        if (checked) next[item.id] = true;
        else delete next[item.id];
      }
      return next;
    });
  };

  const batchDownload = async () => {
    if (!selectedIds.length) return;
    setBusy("download");
    try {
      const result = await api.downloadAuthArchive(selectedIds, tab);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(`已导出 ${result.exported} 个文件${result.skipped ? `，跳过 ${result.skipped} 个` : ""}`, "success");
    } catch (error: any) {
      notify(error.message || "批量导出失败", "error");
    } finally {
      setBusy("");
    }
  };

  const copyJson = async (item: AccountRecord) => {
    setBusy(`copy-${item.id}`);
    try {
      const result = await api.accountAuthJson(item.id, tab);
      notify((await copyText(result.content)) ? (tab === "sso" ? "SSO 已复制" : "JSON 已复制") : "复制失败", "success");
    } catch (error: any) {
      notify(error.message || "读取 JSON 失败", "error");
    } finally {
      setBusy("");
    }
  };

  const importGrok2API = async (item: AccountRecord) => {
    setBusy(`import-${item.id}`);
    try {
      const result = await api.importAccountToGrok2API(item.id);
      setItems((old) => old.map((row) => row.id === item.id ? result.item : row));
      notify("已导入 Grok2API", "success");
    } catch (error: any) {
      notify(error.message || "导入失败", "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="授权文件"
        description="集中查看、复制和导出 CPA 与 Grok2API 授权文件，减少账号列表中的操作负担。"
        actions={
          <Button onClick={() => void batchDownload()} disabled={!selectedIds.length || !!busy}>
            {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
            批量导出 {selectedIds.length ? `(${selectedIds.length})` : ""}
          </Button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["账号记录", total],
          [tab === "cpa" ? "本页 CPA 文件" : tab === "grok2api" ? "本页 Grok2API 文件" : "本页 SSO", availableCount],
          ["已选择", selectedIds.length],
        ].map(([label, value]) => (
          <Card key={String(label)} className="p-4">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{value}</div>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 sm:w-[30rem]">
              {(["cpa", "grok2api", "sso"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setTab(value); setSelected({}); }}
                  className={`min-h-10 rounded-md text-sm font-medium ${tab === value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
                >
                  {value === "cpa" ? "CPA / Auth" : value === "grok2api" ? "Grok2API" : "SSO"}
                </button>
              ))}
            </div>
            <div className="relative sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索邮箱" className="pl-9" />
            </div>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" disabled={!selectableItems.length} checked={allVisibleSelected} onChange={(event) => toggleAllVisible(event.target.checked)} aria-label="全选本页可用授权文件" />
              全选本页
            </label>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-52 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />加载授权文件</div>
        ) : filtered.length ? (
          <div className="divide-y divide-slate-100">
            {filtered.map((item) => {
              const available = isAvailable(item);
              const path = tab === "cpa" ? item.cpa_auth_path : tab === "grok2api" ? item.grok2api_auth_path : item.account_file;
              const remoteStatus = tab === "cpa" ? item.cpa_remote_status : tab === "grok2api" ? item.grok2api_remote_status : "";
              return (
                <div key={item.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <input type="checkbox" className="mt-1" disabled={!available} checked={!!selected[item.id]} onChange={(event) => setSelected((old) => ({ ...old, [item.id]: event.target.checked }))} />
                    <div className="min-w-0">
                      <AccountEmailLabel
                        email={item.email}
                        botRisk={!!item.bot_risk}
                        emailClassName="text-sm text-slate-950"
                      />
                      <div className="mt-1 truncate text-xs text-slate-500" title={path}>{path || (tab === "sso" ? "未找到 data/accounts 账号文件" : "未生成本地文件")}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant={available ? "success" : "secondary"}>{available ? "文件可用" : "无文件"}</Badge>
                        {item.bot_risk ? (
                          <Badge variant="warning">
                            <ShieldAlert className="mr-1 h-3 w-3" aria-hidden="true" />
                            风控标记
                          </Badge>
                        ) : null}
                        {remoteStatus && remoteStatus !== "not_configured" ? <Badge variant={remoteStatus === "success" ? "success" : remoteStatus === "failed" ? "destructive" : "warning"}>远程 {remoteStatus}</Badge> : null}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <Button variant="outline" size="sm" disabled={!available || !!busy} onClick={() => void copyJson(item)}>
                      {busy === `copy-${item.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}复制
                    </Button>
                    <a
                      href={available ? api.accountAuthDownloadUrl(item.id, tab) : undefined}
                      download
                      aria-disabled={!available}
                      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium ${available ? "bg-white text-slate-700 hover:bg-slate-50" : "pointer-events-none bg-slate-50 text-slate-300"}`}
                    >
                      <Download className="h-4 w-4" />下载
                    </a>
                    {tab === "grok2api" && item.grok2api_remote_configured ? (
                      <Button variant="outline" size="sm" className="col-span-2" disabled={!available || !!busy} onClick={() => void importGrok2API(item)}>
                        {busy === `import-${item.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}导入远程
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4"><EmptyState title="暂无授权文件" description="账号完成 SSO → Auth 后会在这里显示对应文件。" /></div>
        )}
        {total > 0 ? (
          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={total}
            loading={loading}
            pageSizeOptions={[20, 50, 100, 200]}
            onPageChange={(nextPage) => void load(nextPage)}
            onPageSizeChange={(nextSize) => {
              setPageSize(nextSize);
              setSelected({});
              void load(1, query, nextSize);
            }}
          />
        ) : null}
      </Card>
      <Toast message={toast.message} tone={toast.tone} />
    </div>
  );
}
