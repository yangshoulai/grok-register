import { useEffect, useMemo, useState } from "react";
import { Copy, Eye, EyeOff, FileJson2, Loader2, RefreshCw } from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader, Toast } from "@/components/ui";
import { api, type ConfigFileSnapshot } from "@/lib/api";
import { copyText } from "@/lib/utils";

export function ConfigFilePage() {
  const [file, setFile] = useState<ConfigFileSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSecrets, setShowSecrets] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.getConfigFile();
      setFile(result.file);
    } catch (reason: any) {
      setError(reason.message || "读取配置失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const content = useMemo(() => {
    const source = String(file?.content || "");
    if (showSecrets || !source) return source;
    try {
      const parsed = JSON.parse(source);
      for (const key of file?.sensitive_keys || []) {
        if (key in parsed && parsed[key] !== "" && parsed[key] !== null) parsed[key] = "********";
      }
      return JSON.stringify(parsed, null, 2);
    } catch {
      return source;
    }
  }, [file, showSecrets]);

  const copy = async (value: string, label: string) => {
    setToast((await copyText(value)) ? `已复制${label}` : `${label}复制失败`);
    window.setTimeout(() => setToast(""), 2200);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="配置文件"
        description="查看当前实际 config.json 路径、磁盘状态和运行配置内容。"
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新
          </Button>
        }
      />

      {loading && !file ? (
        <Card className="flex min-h-64 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />读取配置</Card>
      ) : error ? (
        <Card className="border-red-200 p-4 text-sm text-red-700">{error}</Card>
      ) : file ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex items-center gap-2 font-semibold text-slate-950"><FileJson2 className="h-4 w-4 text-sky-600" />JSON 内容</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowSecrets((value) => !value)}>
                  {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{showSecrets ? "隐藏敏感值" : "显示敏感值"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => void copy(content, "JSON")}> <Copy className="h-4 w-4" />复制</Button>
              </div>
            </div>
            <pre className="max-h-[70dvh] overflow-auto bg-slate-50 p-4 font-mono text-xs leading-5 text-slate-800 sm:p-5 sm:text-sm">{content}</pre>
          </Card>
          <div className="space-y-4">
            <Card className="p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-500">实际路径</div>
              <div className="mt-2 break-all font-mono text-xs leading-5 text-slate-800">{file.path}</div>
              <Button className="mt-4 w-full" variant="outline" size="sm" onClick={() => void copy(file.path, "配置路径")}><Copy className="h-4 w-4" />复制路径</Button>
            </Card>
            <Card className="p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-500">文件状态</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant={file.exists ? "success" : "secondary"}>{file.exists ? "文件存在" : "运行时预览"}</Badge>
                <Badge variant="outline">{file.size.toLocaleString()} bytes</Badge>
              </div>
              {file.modified_at ? <div className="mt-3 text-xs leading-5 text-slate-500">修改时间<br />{new Date(file.modified_at).toLocaleString()}</div> : null}
            </Card>
            {file.parse_error ? <Card className="border-amber-200 p-4 text-sm text-amber-800">JSON 解析异常：{file.parse_error}</Card> : null}
          </div>
        </div>
      ) : (
        <Card className="p-4"><EmptyState title="没有配置内容" /></Card>
      )}
      <Toast message={toast} />
    </div>
  );
}
