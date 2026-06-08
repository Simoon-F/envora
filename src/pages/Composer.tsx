import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDefaultVersion, useInstalledVersions } from '@/hooks/useRuntimes';
import { tauriInvoke } from '@/lib/tauri';
import {
  CheckCircle2,
  Download,
  Loader2,
  PackageCheck,
  Play,
  RefreshCw,
  Save,
  Settings2,
  Terminal,
} from 'lucide-react';

interface ComposerInfo {
  envora_installed: boolean;
  envora_path: string;
  envora_version: string | null;
  system_available: boolean;
  system_version: string | null;
  php_path: string | null;
  php_version: string | null;
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

const repositoryPresets = [
  { label: 'Packagist', value: 'https://repo.packagist.org' },
  { label: 'Aliyun', value: 'https://mirrors.aliyun.com/composer/' },
  { label: 'Tencent', value: 'https://mirrors.cloud.tencent.com/composer/' },
  { label: 'Huawei', value: 'https://repo.huaweicloud.com/repository/php/' },
];

const commandPresets = [
  { label: 'Install', args: ['install'] },
  { label: 'Update', args: ['update'] },
  { label: 'Dump Autoload', args: ['dump-autoload'] },
  { label: 'Diagnose', args: ['diagnose'] },
];

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

function ComposerStatus() {
  const [info, setInfo] = useState<ComposerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setInfo(await tauriInvoke<ComposerInfo>('get_composer_info'));
    } catch (error) {
      setMessage(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const install = async () => {
    setBusy(true);
    setMessage('');
    try {
      await tauriInvoke('install_composer');
      setMessage('Composer installed.');
      await load();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const update = async () => {
    setBusy(true);
    setMessage('');
    try {
      const result = await tauriInvoke<ComposerCommandResult>('update_composer');
      setMessage(result.stdout || result.stderr || 'Composer updated.');
      await load();
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

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
              {info?.envora_installed ? 'Installed' : 'Not installed'}
            </Badge>
            <StatusRow label="Version" value={info?.envora_version ?? ''} />
            <StatusRow label="Path" value={info?.envora_path ?? ''} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Terminal className="h-4 w-4" />
              PHP Runtime
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge variant={info?.php_path ? 'default' : 'secondary'}>
              {info?.php_path ? 'Ready' : 'Missing'}
            </Badge>
            <StatusRow label="Version" value={info?.php_version ?? ''} />
            <StatusRow label="Binary" value={info?.php_path ?? ''} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              System Composer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge variant={info?.system_available ? 'outline' : 'secondary'}>
              {info?.system_available ? 'Detected' : 'Not found'}
            </Badge>
            <StatusRow label="Version" value={info?.system_version ?? ''} />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={install} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Install / Reinstall
        </Button>
        <Button variant="outline" onClick={update} disabled={busy || !info?.envora_installed}>
          <RefreshCw className="h-4 w-4" />
          Self Update
        </Button>
        <Button variant="ghost" onClick={load} disabled={busy}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
        {message && <span className="text-xs text-muted-foreground whitespace-pre-wrap">{message}</span>}
      </div>
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
      setMessage(result.stderr || result.stdout || 'Saved.');
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
          <Label>Packagist Repository</Label>
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
            Save Repository
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Process Timeout</Label>
          <Input value={timeout} onChange={(event) => setTimeoutValue(event.target.value)} placeholder="300" />
          <Button size="sm" onClick={() => saveValue('process-timeout', timeout)} disabled={saving || !timeout}>
            <Save className="h-3 w-3" />
            Save Timeout
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Cache Directory</Label>
          <Input value={cacheDir} onChange={(event) => setCacheDir(event.target.value)} placeholder="~/.composer/cache" />
          <Button size="sm" onClick={() => saveValue('cache-dir', cacheDir)} disabled={saving || !cacheDir}>
            <Save className="h-3 w-3" />
            Save Cache
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Global config</div>
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

function ComposerRunner() {
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

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
        <div className="space-y-2">
          <Label>Project Directory</Label>
          <Input value={projectDir} onChange={(event) => setProjectDir(event.target.value)} placeholder="/Users/you/Projects/myapp" />
        </div>
        <div className="space-y-2">
          <Label>PHP Version</Label>
          <select
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
            value={selectedPhp}
            onChange={(event) => setPhpVersion(event.target.value)}
          >
            {!selectedPhp && <option value="">Default PHP</option>}
            {installedPhp?.map((version) => (
              <option key={version.version} value={version.version}>
                {version.version}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Composer Arguments</Label>
        <div className="flex gap-2">
          <Input value={argsText} onChange={(event) => setArgsText(event.target.value)} placeholder="install --no-interaction" />
          <Button onClick={run} disabled={running || !projectDir || args.length === 0}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run
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
          <Badge variant={result.status === 0 ? 'default' : 'destructive'}>Exit {result.status}</Badge>
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Settings2 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Composer</h1>
        <Badge variant="outline">PHP dependency manager</Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="run">Run</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Composer Runtime</CardTitle>
            </CardHeader>
            <CardContent>
              <ComposerStatus />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Global Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <ComposerConfig />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="run" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Project Commands</CardTitle>
            </CardHeader>
            <CardContent>
              <ComposerRunner />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
