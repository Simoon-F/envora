import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDefaultVersion, useInstalledVersions } from '@/hooks/use-runtimes';
import { useTranslation } from '@/i18n/use-translation';
import { tauriInvoke } from '@/lib/tauri';
import { DetailTabs } from '@/components/runtime/detail-tabs';
import { RuntimeHeader } from '@/components/runtime/runtime-header';
import { ComposerIcon } from '@/components/runtime/runtime-icons';
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
  { labelKey: 'Packagist', value: 'https://repo.packagist.org' },
  { labelKey: 'Aliyun', value: 'https://mirrors.aliyun.com/composer/' },
  { labelKey: 'TencentCloud', value: 'https://mirrors.cloud.tencent.com/composer/' },
  { labelKey: 'HuaweiCloud', value: 'https://repo.huaweicloud.com/repository/php/' },
] as const;

const commandPresets = [
  { labelKey: 'InstallDependencies', args: ['install'] },
  { labelKey: 'UpdateDependencies', args: ['update'] },
  { labelKey: 'DumpAutoload', args: ['dump-autoload'] },
  { labelKey: 'Diagnose', args: ['diagnose'] },
] as const;

const collectMissingExtensions = (result: ComposerCommandResult | null) => {
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
};

const extensionHint = (extension: string, t: ReturnType<typeof useTranslation>['t']) => {
  const name = extension.replace(/^ext-/, '');
  if (name === 'gd') {
    return t('Composer.MissingGdHint');
  }
  return t('Composer.MissingExtensionHint', { extension: name });
};

const firstConfigValue = (config: ComposerConfigEntry[], key: string) => {
  return config.find((entry) => entry.key === key)?.value ?? '';
};

const ComposerStatus = ({
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
}) => {
  const { t } = useTranslation();

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <StatusCard
          icon={<PackageCheck className="size-4" />}
          title="Envora Composer"
          status={info?.envora_installed ? 'Installed' : t('Common', 'Missing')}
          statusVariant={info?.envora_installed ? 'success' : 'secondary'}
          rows={[
            { label: t('Common', 'Version'), value: info?.envora_version ?? '' },
            { label: t('Settings', 'Path'), value: info?.envora_path ?? '' },
            { label: t('Composer', 'CacheDirectory'), value: info?.envora_cache_dir ?? '' },
          ]}
        />

        <StatusCard
          icon={<Terminal className="size-4" />}
          title={t('Composer', 'PhpEnvironment')}
          status={info?.php_path ? t('Common', 'Ready') : t('Common', 'Missing')}
          statusVariant={info?.php_path ? 'default' : 'secondary'}
          rows={[
            { label: t('Common', 'Version'), value: info?.php_version ?? '' },
            { label: t('Composer', 'PhpExecutable'), value: info?.php_path ?? '' },
            { label: 'php.ini', value: info?.php_ini_path ?? '' },
          ]}
        />

        <StatusCard
          icon={<CheckCircle2 className="size-4" />}
          title={t('Composer', 'SystemComposer')}
          status={info?.system_available ? t('Common', 'Installed') : t('Common', 'Missing')}
          statusVariant={info?.system_available ? 'outline' : 'secondary'}
          rows={[
            { label: t('Common', 'Version'), value: info?.system_version ?? '' },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onInstall} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          {t('Composer', 'InstallOrReinstall')}
        </Button>
        <Button variant="outline" onClick={onUpdate} disabled={busy || !info?.envora_installed}>
          <RefreshCw className="size-4" />
          {t('Composer', 'SelfUpdate')}
        </Button>
        <Button variant="ghost" onClick={onRefresh} disabled={busy}>
          <RefreshCw className="size-4" />
          {t('Common', 'Refresh')}
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
};

const StatusCard = ({
  icon,
  title,
  status,
  statusVariant,
  rows,
}: {
  icon: React.ReactNode;
  title: string;
  status: string;
  statusVariant: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive';
  rows: { label: string; value: string }[];
}) => {
  return (
    <Card size="sm" className="card-subtle p-4">
      <CardContent className="p-0 space-y-3">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{title}</span>
          <Badge variant={statusVariant} className="ml-auto gap-1 px-1.5 py-0 text-[11px]">
            {status}
          </Badge>
        </div>
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.label} className="space-y-0.5">
              <Label className="text-[11px] text-muted-foreground">{row.label}</Label>
              <p className="break-all font-mono text-xs text-muted-foreground">{row.value || '-'}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const ComposerConfig = () => {
  const { t } = useTranslation();
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
      setMessage(result.stderr || result.stdout || t('Common', 'Saved'));
      await load();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5">
      {message && <div className="rounded-lg bg-muted/60 p-2 text-xs whitespace-pre-wrap">{message}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2">
          <Label>{t('Composer', 'Repository')}</Label>
          <Input value={repo} onChange={(event) => setRepo(event.target.value)} placeholder="https://repo.packagist.org" />
          <div className="flex flex-wrap gap-1">
            {repositoryPresets.map((preset) => (
              <Button key={preset.labelKey} variant="outline" size="xs" className="h-6 text-xs" onClick={() => setRepo(preset.value)}>
                {preset.labelKey === 'Packagist' ? 'Packagist' : t('Composer', preset.labelKey)}
              </Button>
            ))}
          </div>
          <Button size="xs" onClick={() => saveValue('repo.packagist', repo)} disabled={saving || !repo}>
            <Save className="size-3.5" />
            {t('Composer', 'SaveRepository')}
          </Button>
        </div>

        <div className="space-y-2">
          <Label>{t('Composer', 'ProcessTimeout')}</Label>
          <Input value={timeout} onChange={(event) => setTimeoutValue(event.target.value)} placeholder="300" />
          <Button size="xs" onClick={() => saveValue('process-timeout', timeout)} disabled={saving || !timeout}>
            <Save className="size-3.5" />
            {t('Composer', 'SaveTimeout')}
          </Button>
        </div>

        <div className="space-y-2">
          <Label>{t('Composer', 'CacheDirectory')}</Label>
          <Input value={cacheDir} onChange={(event) => setCacheDir(event.target.value)} placeholder="Envora data directory/composer/cache" />
          <Button size="xs" onClick={() => saveValue('cache-dir', cacheDir)} disabled={saving || !cacheDir}>
            <Save className="size-3.5" />
            {t('Composer', 'SaveCache')}
          </Button>
        </div>
      </div>

      <div className="rounded-xl bg-card shadow-sm">
        <div className="border-b bg-muted/30 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          {t('Composer', 'GlobalConfig')}
        </div>
        <div className="max-h-80 overflow-auto">
          {config.map((entry) => (
            <div key={entry.key} className="grid grid-cols-[240px_1fr] gap-3 border-b px-4 py-1.5 text-xs last:border-b-0 hover:bg-muted/30">
              <span className="font-mono text-muted-foreground">{entry.key}</span>
              <span className="break-all text-muted-foreground/80">{entry.value}</span>
            </div>
          ))}
          {config.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">No configuration entries</div>
          )}
        </div>
      </div>
    </div>
  );
};

const ComposerIssuePanel = ({
  result,
  info,
  onOpenPhp,
  onIgnoreExtension,
}: {
  result: ComposerCommandResult | null;
  info: ComposerInfo | null;
  onOpenPhp: () => void;
  onIgnoreExtension: (extension: string) => void;
}) => {
  const { t } = useTranslation();
  const missingExtensions = useMemo(() => collectMissingExtensions(result), [result]);

  if (missingExtensions.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="font-medium text-danger">{t('Composer', 'MissingPhpExtension')}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('Composer', 'MissingPhpExtensionBody')}
            </p>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {missingExtensions.map((extension) => (
              <div key={extension} className="rounded-lg bg-card p-2.5">
                <div className="font-mono text-xs font-medium">{extension}</div>
                <p className="mt-1 text-xs text-muted-foreground">{extensionHint(extension, t)}</p>
              </div>
            ))}
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            <div>PHP: <span className="font-mono">{info?.php_path || '-'}</span></div>
            <div>php.ini: <span className="font-mono">{info?.php_ini_path || t('Composer', 'PhpIniMissing')}</span></div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="xs" variant="outline" onClick={onOpenPhp}>
              <Wrench className="h-3.5 w-3.5" />
              {t('Composer', 'OpenPhpExtensions')}
            </Button>
            {missingExtensions.map((extension) => (
              <Button key={extension} size="xs" variant="ghost" onClick={() => onIgnoreExtension(extension)}>
                {t('Composer', 'TemporarilyIgnore', { extension })}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const ComposerRunner = ({ info }: { info: ComposerInfo | null }) => {
  const { t } = useTranslation();
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
    <div className="space-y-5">
      <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
        <div className="space-y-2">
          <Label>{t('RuntimeDetail', 'ProjectDirectory')}</Label>
          <Input value={projectDir} onChange={(event) => setProjectDir(event.target.value)} placeholder="/Users/you/Projects/myapp" />
        </div>
        <div className="space-y-2">
          <Label>{t('Composer', 'PhpVersion')}</Label>
          <select
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
            value={selectedPhp}
            onChange={(event) => setPhpVersion(event.target.value)}
          >
            {!selectedPhp && <option value="">{t('Common', 'Default')} PHP</option>}
            {installedPhp?.map((version) => (
              <option key={version.version} value={version.version}>
                {version.version}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('Composer', 'ComposerArguments')}</Label>
        <div className="flex gap-2">
          <Input value={argsText} onChange={(event) => setArgsText(event.target.value)} placeholder="install --no-interaction" />
          <Button onClick={run} disabled={running || !projectDir || args.length === 0}>
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {t('Common', 'Run')}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {commandPresets.map((preset) => (
            <Button key={preset.labelKey} variant="outline" size="xs" className="h-6 text-xs" onClick={() => setArgsText(preset.args.join(' '))}>
              {t('Composer', preset.labelKey)}
            </Button>
          ))}
        </div>
      </div>

      {error && <div className="rounded-lg bg-danger/10 p-2 text-xs text-danger">{error}</div>}
      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={result.status === 0 ? 'default' : 'destructive'}>
              {t('Composer', 'ExitCode', { code: result.status })}
            </Badge>
          </div>
          <ComposerIssuePanel
            result={result}
            info={info}
            onOpenPhp={() => navigate('/runtimes/php')}
            onIgnoreExtension={appendIgnoreExtension}
          />
          <pre className="max-h-96 overflow-auto rounded-lg bg-code-bg p-3 text-xs whitespace-pre-wrap">
            {[result.stdout, result.stderr].filter(Boolean).join('\n')}
          </pre>
        </div>
      )}
    </div>
  );
};

export const ComposerDetail = () => {
  const { t } = useTranslation();
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
        message: payload.message ?? t('Operations', 'Processing'),
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
    setInstallProgress({ percent: 0, message: t('Composer', 'PreparingInstall') });
    try {
      await tauriInvoke('install_composer');
      setStatusMessage(t('Composer', 'ComposerInstalled'));
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
      setStatusMessage(result.stdout || result.stderr || t('Composer', 'ComposerUpdated'));
      await loadStatus();
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setStatusBusy(false);
    }
  };

  const tabs = [
    { value: 'status', label: t('Composer', 'Status'), title: t('Composer', 'ComposerEnvironment'), content: <ComposerStatus info={statusInfo} loading={statusLoading} busy={statusBusy} message={statusMessage} progress={installProgress} onInstall={install} onUpdate={update} onRefresh={loadStatus} /> },
    { value: 'config', label: t('Composer', 'Config'), title: t('Composer', 'GlobalConfig'), content: <ComposerConfig /> },
    { value: 'run', label: t('Composer', 'Run'), title: t('Composer', 'ProjectCommand'), content: <ComposerRunner info={statusInfo} /> },
  ];

  return (
    <div className="p-5 space-y-5">
      <RuntimeHeader
        icon={<ComposerIcon className="size-8" />}
        name="Composer"
        actions={<Badge variant="outline">{t('Composer', 'DependencyManager')}</Badge>}
      />
      <DetailTabs tabs={tabs} value={activeTab} onValueChange={setActiveTab} />
    </div>
  );
};
