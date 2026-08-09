import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, History, Loader2, RefreshCcw, Search, ShieldAlert, XCircle } from "lucide-react";
import { AccountEmailLabel } from "@/components/AccountEmailIcon";
import { Badge, Button, Card, EmptyState, Input, PageHeader, PaginationBar, Toast } from "@/components/ui";
import { api, type AccountRecord, type ReloginStatus } from "@/lib/api";
import { appendReloginHistory } from "@/lib/reloginHistory";

export function ReloginPage() {
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState<ReloginStatus | null>(null);
  const [toast, setToast] = useState<{ message: string; tone?: "default" | "success" | "error" }>({ message: "" });
  const recordedRun = useRef("");

  const notify = (message: string, tone: "default" | "success" | "error" = "default") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast({ message: "" }), 2400);
  };

  const loadAccounts = async (targetPage = page, targetQuery = query, targetPageSize = pageSize) => {
    setLoading(true);
    try {
      const result = await api.accounts({ limit: targetPageSize, offset: (targetPage - 1) * targetPageSize, q: targetQuery.trim() });
      setAccounts(result.items || []);
      setTotal(Number(result.total ?? result.items?.length ?? 0));
      setPage(targetPage);
    } catch (error: any) {
      notify(error.message || "账号加载失败", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelected({});
      void loadAccounts(1, query);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const result = await api.reloginStatus();
        if (!active) return;
        const next = result.relogin;
        setStatus(next);
        if (next.running) {
          timer = window.setTimeout(poll, 1500);
          return;
        }
        if (next.run_id && recordedRun.current !== next.run_id) {
          await appendReloginHistory(next);
          recordedRun.current = next.run_id;
          if (next.finished_at) void loadAccounts();
        }
      } catch {
        if (active) timer = window.setTimeout(poll, 4000);
      }
    };
    void poll();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [status?.running]);

  const candidates = accounts;
  const eligibleCandidates = candidates.filter((item) => !!item.email && !!item.password);
  const selectedIds = Object.entries(selected).filter(([, value]) => value).map(([id]) => Number(id));
  const allSelected = eligibleCandidates.length > 0 && eligibleCandidates.every((item) => selected[item.id]);
  const botRiskByAccountId = useMemo(() => {
    const map = new Map<number, boolean>();
    for (const item of accounts) {
      map.set(item.id, !!item.bot_risk);
    }
    return map;
  }, [accounts]);

  const start = async () => {
    if (!selectedIds.length || status?.running) return;
    if (!window.confirm(`重新登录选中的 ${selectedIds.length} 个账号并刷新 SSO 与授权文件？`)) return;
    setStarting(true);
    try {
      const result = await api.startBatchRelogin(selectedIds);
      recordedRun.current = "";
      setStatus(result.relogin);
      notify("重新登录任务已启动", "success");
    } catch (error: any) {
      notify(error.message || "启动失败", "error");
    } finally {
      setStarting(false);
    }
  };

  const progress = status?.total_count
    ? Math.min(100, Math.round((status.completed_count / status.total_count) * 100))
    : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="重新登录"
        description="集中选择已有账号，通过保存的邮箱和密码刷新 SSO、CPA 与 Grok2API 授权文件。"
        actions={
          <Link
            to="/accounts/relogin/history"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <History className="h-4 w-4" aria-hidden="true" />
            登录历史
          </Link>
        }
      />

      {status?.running ? (
        <Card className="overflow-hidden border-sky-200">
          <div className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-semibold text-slate-950">
                  <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
                  正在重新登录
                </div>
                <p className="mt-1 text-xs text-slate-500">{status.stage} · {status.email || "准备账号"}</p>
              </div>
              <Badge variant="default">{status.completed_count}/{status.total_count}</Badge>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-sky-500 transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["已完成", status.completed_count],
                ["成功", status.success_count],
                ["失败", status.failed_count],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-lg font-semibold tabular-nums text-slate-950">{value}</div>
                  <div className="text-[11px] text-slate-500">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : status?.run_id && status.finished_at ? (
        <Card className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold text-slate-950">最近一次重新登录已完成</div>
              <div className="mt-1 text-sm text-slate-500">成功 {status.success_count} · 失败 {status.failed_count}</div>
            </div>
            <Link
              to={`/accounts/relogin/history/${status.run_id}`}
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white"
            >
              查看报告
            </Link>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">选择账号</h2>
              <p className="mt-1 text-xs text-slate-500">共 {total} 个账号；缺少邮箱或密码的记录会显示但不可选择。</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索邮箱或服务商" className="pl-9" />
              </div>
              <Button onClick={() => void start()} disabled={!selectedIds.length || starting || !!status?.running}>
                {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCcw className="h-4 w-4" aria-hidden="true" />}
                重新登录 {selectedIds.length ? `(${selectedIds.length})` : ""}
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-52 items-center justify-center text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />加载账号
          </div>
        ) : candidates.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelected((previous) => {
                            const next = { ...previous };
                            for (const item of eligibleCandidates) checked ? (next[item.id] = true) : delete next[item.id];
                            return next;
                          });
                        }}
                        aria-label="选择全部账号"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">账号</th>
                    <th className="px-4 py-3 font-medium">服务商</th>
                    <th className="px-4 py-3 font-medium">CPA</th>
                    <th className="px-4 py-3 font-medium">Grok2API</th>
                    <th className="px-4 py-3 font-medium">最近状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {candidates.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3"><input type="checkbox" disabled={!item.email || !item.password} checked={!!selected[item.id]} onChange={(event) => setSelected((old) => ({ ...old, [item.id]: event.target.checked }))} /></td>
                      <td className="px-4 py-3">
                        <AccountEmailLabel
                          email={item.email}
                          botRisk={!!item.bot_risk}
                          emailClassName="text-sm text-slate-900"
                        />
                        {item.bot_risk ? (
                          <div className="mt-1">
                            <Badge variant="warning">
                              <ShieldAlert className="mr-1 h-3 w-3" aria-hidden="true" />
                              风控标记
                            </Badge>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{item.provider || "-"}</td>
                      <td className="px-4 py-3"><Badge variant={item.cpa_auth_available ? "success" : "secondary"}>{item.cpa_auth_available ? "已生成" : "无文件"}</Badge></td>
                      <td className="px-4 py-3"><Badge variant={item.grok2api_auth_available ? "success" : "secondary"}>{item.grok2api_auth_available ? "已生成" : "无文件"}</Badge></td>
                      <td className="px-4 py-3 text-slate-500">{!item.email || !item.password ? "缺少登录凭据" : item.extra?.relogin_status === "success" ? "重登成功" : item.extra?.relogin_status ? String(item.extra.relogin_status) : "未重登"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-slate-100 md:hidden">
              {candidates.map((item) => (
                <label key={item.id} className={`flex items-start gap-3 p-4 ${!item.email || !item.password ? "opacity-60" : ""}`}>
                  <input type="checkbox" className="mt-1" disabled={!item.email || !item.password} checked={!!selected[item.id]} onChange={(event) => setSelected((old) => ({ ...old, [item.id]: event.target.checked }))} />
                  <div className="min-w-0 flex-1">
                    <AccountEmailLabel
                      email={item.email}
                      botRisk={!!item.bot_risk}
                      emailClassName="text-sm text-slate-900"
                    />
                    <div className="mt-1 text-xs text-slate-500">{item.provider || "未知服务商"}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {!item.email || !item.password ? <Badge variant="warning">缺少凭据</Badge> : null}
                      {item.bot_risk ? (
                        <Badge variant="warning">
                          <ShieldAlert className="mr-1 h-3 w-3" aria-hidden="true" />
                          风控标记
                        </Badge>
                      ) : null}
                      {item.cpa_auth_available ? <Badge variant="success">CPA</Badge> : null}
                      {item.grok2api_auth_available ? <Badge variant="success">Grok2API</Badge> : null}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </>
        ) : (
          <div className="p-4"><EmptyState title="没有可重新登录的账号" description="账号需要同时保存有效邮箱和密码。" /></div>
        )}
        {total > 0 ? (
          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={total}
            loading={loading}
            onPageChange={(nextPage) => void loadAccounts(nextPage)}
            onPageSizeChange={(nextSize) => {
              setPageSize(nextSize);
              setSelected({});
              void loadAccounts(1, query, nextSize);
            }}
          />
        ) : null}
      </Card>

      {status?.items?.length ? (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-4 sm:px-5"><h2 className="font-semibold text-slate-950">本次执行明细</h2></div>
          <div className="divide-y divide-slate-100">
            {status.items.map((item) => (
              <div key={item.account_id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                {item.status === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : item.status === "failed" ? <XCircle className="mt-0.5 h-4 w-4 text-red-600" /> : <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-slate-400" />}
                <div className="min-w-0 flex-1">
                  <AccountEmailLabel
                    email={item.email || `账号 #${item.account_id}`}
                    botRisk={!!botRiskByAccountId.get(item.account_id)}
                    emailClassName="text-sm text-slate-900"
                  />
                  {botRiskByAccountId.get(item.account_id) ? (
                    <div className="mt-1">
                      <Badge variant="warning">
                        <ShieldAlert className="mr-1 h-3 w-3" aria-hidden="true" />
                        风控标记
                      </Badge>
                    </div>
                  ) : null}
                  {item.error ? <div className="mt-1 break-all text-xs text-red-700">{item.error}</div> : null}
                  {item.status === "failed" && (item.stage || item.error_type || item.url) ? (
                    <div className="mt-2 space-y-1 rounded-lg bg-red-50 p-2 text-xs text-slate-600">
                      {item.stage ? <div><strong className="text-slate-800">阶段：</strong>{item.stage}</div> : null}
                      {item.error_type ? <div><strong className="text-slate-800">类型：</strong>{item.error_type}</div> : null}
                      {item.url ? <div className="break-all"><strong className="text-slate-800">页面：</strong>{item.url}</div> : null}
                      {item.screenshot_url ? <div className="flex flex-wrap items-center gap-2"><a href={item.screenshot_url} target="_blank" rel="noreferrer" className="font-medium text-sky-600 hover:underline">查看失败截图</a>{item.captured_at ? <span className="text-slate-400">{new Date(item.captured_at).toLocaleString()}</span> : null}</div> : null}
                    </div>
                  ) : null}
                </div>
                <Badge variant={item.status === "success" ? "success" : item.status === "failed" ? "destructive" : "secondary"}>{item.status === "success" ? "成功" : item.status === "failed" ? "失败" : "等待"}</Badge>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
      <Toast message={toast.message} tone={toast.tone} />
    </div>
  );
}
