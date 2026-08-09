import { History, Trash2, X } from "lucide-react";
import { Badge, Button, EmptyState } from "@/components/ui";
import type { ReloginHistoryEntry } from "@/lib/reloginHistory";

function formatWhen(finishedAt: number | null) {
  // finished_at 是后端 time.time() 的秒级浮点，需要乘 1000 才能进 Date。
  if (!finishedAt) return "时间未知";
  return new Date(finishedAt * 1000).toLocaleString();
}

export function ReloginHistoryDialog({
  entries,
  onOpenEntry,
  onRemoveEntry,
  onClearAll,
  onClose,
}: {
  entries: ReloginHistoryEntry[];
  onOpenEntry: (entry: ReloginHistoryEntry) => void;
  onRemoveEntry: (runId: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end bg-slate-950/55 sm:items-center sm:justify-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="relogin-history-title"
        className="w-full overflow-hidden rounded-t-3xl bg-card shadow-2xl sm:max-w-xl sm:rounded-3xl"
      >
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-300 sm:hidden" />
        <header className="flex items-start justify-between gap-3 border-b px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id="relogin-history-title" className="font-semibold text-foreground">
              重新登录历史
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              共 {entries.length} 次记录，存放在本浏览器 IndexedDB，清除浏览器数据后会丢失。
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="shrink-0"
            onClick={onClose}
            aria-label="关闭重新登录历史"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </header>

        <div className="max-h-[55vh] overflow-y-auto px-4 py-2 sm:px-5">
          {entries.length ? (
            <ul className="divide-y">
              {entries.map((entry) => (
                <li key={entry.run_id} className="flex items-center gap-2 py-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left transition hover:bg-muted"
                    onClick={() => onOpenEntry(entry)}
                  >
                    <div className="truncate text-sm font-medium text-foreground">
                      {formatWhen(entry.finished_at)}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">总数 {entry.total_count}</Badge>
                      <Badge variant="success">成功 {entry.success_count}</Badge>
                      {entry.failed_count ? (
                        <Badge variant="destructive">失败 {entry.failed_count}</Badge>
                      ) : null}
                    </div>
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0 text-destructive"
                    onClick={() => onRemoveEntry(entry.run_id)}
                    aria-label={`删除 ${formatWhen(entry.finished_at)} 的记录`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-6">
              <EmptyState title="暂无历史记录" description="完成一次重新登录后，报告会自动记录在这里。" />
            </div>
          )}
        </div>

        <footer className="flex gap-2 border-t px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-4">
          <Button
            variant="outline"
            className="flex-1 text-destructive"
            onClick={onClearAll}
            disabled={!entries.length}
          >
            <History className="h-4 w-4" aria-hidden="true" />
            清空历史
          </Button>
          <Button className="flex-1" onClick={onClose}>
            关闭
          </Button>
        </footer>
      </section>
    </div>
  );
}
