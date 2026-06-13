import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDefaultVersion, useInstalledVersions } from '@/hooks/use-runtimes';
import { tauriInvoke } from '@/lib/tauri';
import { listen } from '@tauri-apps/api/event';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  PackageCheck,
  Play,
  RefreshCw,
  Save,
  Settings2,
  Terminal,
  Wrench,
} from 'lucide-react';

interface ComposerInfo {
  envora_installed: boolean;
  envora_path: string;
  envora_cache_dir: string;
  envora_version: string | null;
  system_available: boolean;
  system_version: string | null;
  php_path: string | null;
  php_version: string | null;
  php_ini_path: string | null;
}

interface ComposerConfigEntry {
  key: string;
  value: string;
}

interface ComposerCommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

interface ComposerProgress {
  percent: number;
  message: string;
}

interface ComposerProgressEvent {
  type?: string;
  payload?: {
    runtime?: string;
    version?: string;
    percent?: number;
    message?: string;
  };
  runtime?: string;
  version?: string;
  percent?: number;
  message?: string;
}

const repositoryPresets = [
  { label: 'Packagist', value: 'https://repo.packagist.org' },
  { label: '阿里云', value: 'https://mirrors.aliyun.com/composer/' },
  { label: '腾讯云', value: 'https://mirrors.cloud.tencent.com/composer/' },
  { label: '华为云', value: 'https://repo.huaweicloud.com/repository/php/' },
];

const commandPresets = [
  { label: '安装依赖', args: ['install'] },
  { label: '更新依赖', args: ['update'] },
  { label: '重建自动加载', args: ['dump-autoload'] },
  { label: '诊断', args: ['diagnose'] },
];

function collectMissingExtensions(result: ComposerCommandResult | null) {
  if (!result) return [];

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
  const extensions = new Set<string>();
  for (const match of output.matchAll(/requires\s+(ext-[a-z0-9_]+)\s+\*/gi)) {
    extensions.add(match[1].toLowerCase());
  }
  for (const match of output.matchAll(/missing from your system[\s\S]{0,160}?(ext-[a-z0-9_]+)/gi)) {
    extensions.add(match[1].toLowerCase());
  }

  return [...extensions];
}

function extensionHint(extension: string) {
  const name = extension.replace(/^ext-/, '');
  if (name === 'gd') {
    return 'GD 常用于验证码、缩略图、Excel 和图片处理。如果当前 PHP 包里没有 gd.so，需要换用或重新打包带 GD 的 PHP。';
  }
  return `当前 PHP 缺少 ${name} 扩展，Composer 不能确认依赖在本机可运行。`;
}

function firstConfigValue(config: ComposerConfigEntry[], key: string) {
  return config.find((entry) => entry.key === key)?.value ?? '';
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <p className="break-all font-mono text-xs">{value || '-'}</p>
    </div>
  );
}

function ComposerStatus({
  info,
  loading,
  busy,
  message,
  progress,
  onInstall,
  onUpdate,
  onRefresh,
}: {
  info: ComposerInfo | null;
  loading: boolean;
  busy: boolean;
  message: string;
  progress: ComposerProgress | null;
  onInstall: () => void;
  onUpdate: () => void;
  onRefresh: () => void;
}) {
  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <PackageCheck className="h-4 w-4" />
              Envora Composer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge variant={info?.envora_installed ? 'default' : 'secondary'}>
              {info?.envora_installed ? '已安装' : '未安装'}
            </Badge>
            <StatusRow label="版本" value={info?.envora_version ?? ''} />
            <StatusRow label="路径" value={info?.envora_path ?? ''} />
            <StatusRow label="缓存目录" value={info?.envora_cache_dir ?? ''} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Terminal className="h-4 w-4" />
              PHP 运行环境
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge variant={info?.php_path ? 'default' : 'secondary'}>
              {info?.php_path ? '就绪' : '缺失'}
            </Badge>
            <StatusRow label="版本" value={info?.php_version ?? ''} />
            <StatusRow label="可执行文件" value={info?.php_path ?? ''} />
            <StatusRow label="php.ini" value={info?.php_ini_path ?? ''} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              系统 Composer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge variant={info?.system_available ? 'outline' : 'secondary'}>
              {info?.system_available ? '已检测到' : '未找到'}
            </Badge>
            <StatusRow label="版本" value={info?.system_version ?? ''} />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onInstall} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          安装 / 重新安装
        </Button>
        <Button variant="outline" onClick={onUpdate} disabled={busy || !info?.envora_installed}>
          <RefreshCw className="h-4 w-4" />
          自我更新
        </Button>
        <Button variant="ghost" onClick={onRefresh} disabled={busy}>
          <RefreshCw className="h-4 w-4" />
          刷新
        </Button>
        {message && <span className="text-xs text-muted-foreground whitespace-pre-wrap">{message}</span>}
      </div>
      {progress && (
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {progress.message} ({progress.percent.toFixed(0)}%)
          </p>
        </div>
      )}
    </div>
  );
}

function ComposerConfig() {
  const [config, setConfig] = useState<ComposerConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [repo, setRepo] = useState('');
  const [timeout, setTimeoutValue] = useState('');
  const [cacheDir, setCacheDir] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const next = await tauriInvoke<ComposerConfigEntry[]>('get_composer_config');
      setConfig(next);
      setRepo(firstConfigValue(next, 'repositories.packagist.org.url'));
      setTimeoutValue(firstConfigValue(next, 'process-timeout'));
      setCacheDir(firstConfigValue(next, 'cache-dir'));
    } catch (error) {
      setMessage(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveValue = async (key: string, value: string) => {
    setSaving(true);
    setMessage('');
    try {
      const result = await tauriInvoke<ComposerCommandResult>('set_composer_config', { key, value });
      setMessage(result.stderr || result.stdout || '已保存。');
      await load();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {message && <div className="rounded-md border bg-muted p-2 text-xs whitespace-pre-wrap">{message}</div>}

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-2">
          <Label>Packagist 仓库</Label>
          <Input value={repo} onChange={(event) => setRepo(event.target.value)} placeholder="https://repo.packagist.org" />
          <div className="flex flex-wrap gap-1">
            {repositoryPresets.map((preset) => (
              <Button key={preset.label} variant="outline" className="h-7 text-xs" onClick={() => setRepo(preset.value)}>
                {preset.label}
              </Button>
            ))}
          </div>
          <Button size="sm" onClick={() => saveValue('repo.packagist', repo)} disabled={saving || !repo}>
            <Save className="h-3 w-3" />
            保存仓库
          </Button>
        </div>

        <div className="space-y-2">
          <Label>进程超时时间</Label>
          <Input value={timeout} onChange={(event) => setTimeoutValue(event.target.value)} placeholder="300" />
          <Button size="sm" onClick={() => saveValue('process-timeout', timeout)} disabled={saving || !timeout}>
            <Save className="h-3 w-3" />
            保存超时
          </Button>
        </div>

        <div className="space-y-2">
          <Label>缓存目录</Label>
          <Input value={cacheDir} onChange={(event) => setCacheDir(event.target.value)} placeholder="Envora 数据目录/composer/cache" />
          <Button size="sm" onClick={() => saveValue('cache-dir', cacheDir)} disabled={saving || !cacheDir}>
            <Save className="h-3 w-3" />
            保存缓存
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">全局配置</div>
        <div className="max-h-80 overflow-auto">
          {config.map((entry) => (
            <div key={entry.key} className="grid grid-cols-[240px_1fr] gap-3 border-b px-3 py-2 text-xs last:border-b-0">
              <span className="font-mono">{entry.key}</span>
              <span className="break-all text-muted-foreground">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ComposerIssuePanel({
  result,
  info,
  onOpenPhp,
  onIgnoreExtension,
}: {
  result: ComposerCommandResult | null;
  info: ComposerInfo | null;
  onOpenPhp: () => void;
  onIgnoreExtension: (extension: string) => void;
}) {
  const missingExtensions = useMemo(() => collectMissingExtensions(result), [result]);

  if (missingExtensions.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="font-medium text-destructive">缺少 PHP 扩展</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Composer 检测到当前 PHP 环境不满足依赖要求。优先修 PHP 运行时，临时忽略只适合先拉起项目。
            </p>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {missingExtensions.map((extension) => (
              <div key={extension} className="rounded-md border bg-background p-2">
                <div className="font-mono text-xs font-medium">{extension}</div>
                <p className="mt-1 text-xs text-muted-foreground">{extensionHint(extension)}</p>
              </div>
            ))}
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            <div>PHP: <span className="font-mono">{info?.php_path || '-'}</span></div>
            <div>php.ini: <span className="font-mono">{info?.php_ini_path || '未检测到，请运行 php --ini 查看'}</span></div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onOpenPhp}>
              <Wrench className="h-3.5 w-3.5" />
              去 PHP 扩展
            </Button>
            {missingExtensions.map((extension) => (
              <Button key={extension} size="sm" variant="ghost" onClick={() => onIgnoreExtension(extension)}>
                临时忽略 {extension}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ComposerRunner({ info }: { info: ComposerInfo | null }) {
  const navigate = useNavigate();
  const { data: installedPhp } = useInstalledVersions('php');
  const { data: defaultPhp } = useDefaultVersion('php');
  const [projectDir, setProjectDir] = useState('');
  const [phpVersion, setPhpVersion] = useState('');
  const [argsText, setArgsText] = useState('install');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ComposerCommandResult | null>(null);
  const [error, setError] = useState('');

  const selectedPhp = phpVersion || defaultPhp || installedPhp?.[0]?.version || '';
  const args = useMemo(
    () => argsText.split(' ').map((part) => part.trim()).filter(Boolean),
    [argsText],
  );

  useEffect(() => {
    if (!phpVersion && defaultPhp) {
      setPhpVersion(defaultPhp);
    }
  }, [defaultPhp, phpVersion]);

  const run = async () => {
    setRunning(true);
    setError('');
    setResult(null);
    try {
      setResult(await tauriInvoke<ComposerCommandResult>('run_composer_command', {
        request: {
          projectDir,
          phpVersion: selectedPhp || null,
          args,
        },
      }));
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  };

  const appendIgnoreExtension = (extension: string) => {
    const flag = `--ignore-platform-req=${extension}`;
    setArgsText((current) => {
      if (current.includes(flag)) return current;
      return `${current.trim()} ${flag}`.trim();
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
        <div className="space-y-2">
          <Label>项目目录</Label>
          <Input value={projectDir} onChange={(event) => setProjectDir(event.target.value)} placeholder="/Users/you/Projects/myapp" />
        </div>
        <div className="space-y-2">
          <Label>PHP 版本</Label>
          <select
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
            value={selectedPhp}
            onChange={(event) => setPhpVersion(event.target.value)}
          >
            {!selectedPhp && <option value="">默认 PHP</option>}
            {installedPhp?.map((version) => (
              <option key={version.version} value={version.version}>
                {version.version}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Composer 参数</Label>
        <div className="flex gap-2">
          <Input value={argsText} onChange={(event) => setArgsText(event.target.value)} placeholder="install --no-interaction" />
          <Button onClick={run} disabled={running || !projectDir || args.length === 0}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            运行
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {commandPresets.map((preset) => (
            <Button key={preset.label} variant="outline" className="h-7 text-xs" onClick={() => setArgsText(preset.args.join(' '))}>
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{error}</div>}
      {result && (
        <div className="space-y-2">
          <Badge variant={result.status === 0 ? 'default' : 'destructive'}>退出码 {result.status}</Badge>
          <ComposerIssuePanel
            result={result}
            info={info}
            onOpenPhp={() => navigate('/runtimes/php')}
            onIgnoreExtension={appendIgnoreExtension}
          />
          <pre className="max-h-96 overflow-auto rounded-md border bg-muted p-3 text-xs whitespace-pre-wrap">
            {[result.stdout, result.stderr].filter(Boolean).join('\n')}
          </pre>
        </div>
      )}
    </div>
  );
}

export function Composer() {
  const [activeTab, setActiveTab] = useState('status');
  const [statusInfo, setStatusInfo] = useState<ComposerInfo | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [installProgress, setInstallProgress] = useState<ComposerProgress | null>(null);
  const installingRef = useRef(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      setStatusInfo(await tauriInvoke<ComposerInfo>('get_composer_info'));
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<ComposerProgressEvent>('envora://progress', (event) => {
      const payload = event.payload.payload ?? event.payload;
      if (payload.runtime !== 'composer') return;
      if (!installingRef.current) return;

      setInstallProgress({
        percent: payload.percent ?? 0,
        message: payload.message ?? '处理中...',
      });
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  const install = async () => {
    installingRef.current = true;
    setStatusBusy(true);
    setStatusMessage('');
    setInstallProgress({ percent: 0, message: '准备安装 Composer...' });
    try {
      await tauriInvoke('install_composer');
      setStatusMessage('Composer 已安装。');
      setInstallProgress(null);
      await loadStatus();
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      installingRef.current = false;
      setInstallProgress(null);
      setStatusBusy(false);
    }
  };

  const update = async () => {
    setStatusBusy(true);
    setStatusMessage('');
    setInstallProgress(null);
    try {
      const result = await tauriInvoke<ComposerCommandResult>('update_composer');
      setStatusMessage(result.stdout || result.stderr || 'Composer 已更新。');
      await loadStatus();
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setStatusBusy(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Settings2 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Composer</h1>
        <Badge variant="outline">PHP 依赖管理器</Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="status">状态</TabsTrigger>
          <TabsTrigger value="config">配置</TabsTrigger>
          <TabsTrigger value="run">运行</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Composer 运行环境</CardTitle>
            </CardHeader>
            <CardContent>
              <ComposerStatus
                info={statusInfo}
                loading={statusLoading}
                busy={statusBusy}
                message={statusMessage}
                progress={installProgress}
                onInstall={install}
                onUpdate={update}
                onRefresh={loadStatus}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">全局配置</CardTitle>
            </CardHeader>
            <CardContent>
              <ComposerConfig />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="run" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">项目命令</CardTitle>
            </CardHeader>
            <CardContent>
              <ComposerRunner info={statusInfo} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
