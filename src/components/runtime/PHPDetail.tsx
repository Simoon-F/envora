import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Download, Trash2, Check, Save, PackagePlus, Circle } from 'lucide-react';
import { useInstalledVersions, useAvailableVersions, useDefaultVersion, useInstallVersion, useUninstallVersion, useSwitchDefault } from '@/hooks/useRuntimes';
import type { RuntimeVersion, VersionInfo } from '@/types/runtime';
import { tauriInvoke } from '@/lib/tauri';

interface ExtensionInfo { name: string; filename: string; enabled: boolean; size: string; }
interface PeclInfo { name: string; description: string; installed: boolean; }

// ── Versions Tab ───────────────────────────────────────────────────

function VersionsTab() {
  const { data: installed, isLoading, mutate } = useInstalledVersions('php');
  const { data: available } = useAvailableVersions('php');
  const { data: defaultVersion } = useDefaultVersion('php');
  const { mutate: installVersion, isLoading: isInstalling } = useInstallVersion();
  const { mutate: uninstallVersion } = useUninstallVersion();
  const { mutate: switchDefault } = useSwitchDefault();
  const [installProgress, setInstallProgress] = useState<number | null>(null);
  const [installMessage, setInstallMessage] = useState('');
  const [installingVer, setInstallingVer] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<{ payload: { runtime: string; version: string; percent: number; message: string } }>(
        'envora://progress', (event) => {
          const p = event.payload.payload || event.payload;
          if (p.runtime === 'php' && p.version === installingVer) {
            setInstallProgress(p.percent); setInstallMessage(p.message);
          }
        }
      ).then(fn => { unlisten = fn; });
    });
    return () => { unlisten?.(); };
  }, [installingVer]);

  const handleInstall = async (version: string) => {
    setInstallingVer(version); setInstallProgress(0);
    try { await installVersion({ runtime: 'php', version }); mutate(); }
    finally { setInstallingVer(null); setInstallProgress(null); }
  };

  return (
    <div className="space-y-4">
      {isLoading ? <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
        <>
          {installed && installed.length > 0 ? (
            <div className="space-y-2">
              {installed.map((v: RuntimeVersion) => (
                <div key={v.version} className="flex items-center justify-between p-3 rounded-md border">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{v.version}</span>
                    {v.version === defaultVersion && <Badge><Check className="h-3 w-3 mr-1" />Default</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{formatBytes(v.size)}</span>
                    {v.version !== defaultVersion && (
                      <Button variant="ghost" size="sm" onClick={async () => { await switchDefault({ runtime: 'php', version: v.version }); mutate(); }}>Set Default</Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={async () => { await uninstallVersion({ runtime: 'php', version: v.version }); mutate(); }}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">No versions installed.</p>}
          {installProgress !== null && (
            <div className="space-y-1">
              <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary transition-all duration-300" style={{ width: `${installProgress}%` }} /></div>
              <p className="text-xs text-muted-foreground">{installMessage} ({installProgress.toFixed(0)}%)</p>
            </div>
          )}
          <div>
            <h4 className="text-sm font-medium mb-2">Available</h4>
            {available?.filter((v: VersionInfo) => !v.is_installed).map((v: VersionInfo) => (
              <div key={v.version} className="flex items-center justify-between p-2 rounded-md border hover:bg-muted cursor-pointer mb-1" onClick={() => handleInstall(v.version)}>
                <span className="font-mono text-sm">{v.version}</span>
                <Button size="sm" variant="ghost" disabled={isInstalling}><Download className="h-3 w-3" /></Button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── php.ini Editor ─────────────────────────────────────────────────

function PhpIniEditor({ version }: { version: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { loadConfig(); }, [version]);
  const loadConfig = async () => {
    setLoading(true);
    try { const t = await tauriInvoke<string>('get_php_config', { version }); setContent(t); setOriginal(t); }
    catch (e) { setContent(`; ${String(e)}`); }
    finally { setLoading(false); }
  };
  const handleSave = async () => {
    if (!content) return; setSaving(true); setMessage('');
    try { await tauriInvoke('save_php_config', { version, content }); setOriginal(content); setMessage('Saved!'); setTimeout(() => setMessage(''), 2000); }
    catch (e) { setMessage(`Save failed: ${String(e)}`); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm">{message && <span className="text-green-500">{message}</span>}{content !== original && !message && <span className="text-yellow-500">Unsaved</span>}</span>
        <Button size="sm" onClick={handleSave} disabled={saving || content === original}><Save className="h-3 w-3 mr-1" />Save</Button>
      </div>
      <textarea className="w-full h-96 font-mono text-xs bg-muted p-3 rounded-md border resize-y" value={content || ''} onChange={e => setContent(e.target.value)} spellCheck={false} />
    </div>
  );
}

// ── Extensions ─────────────────────────────────────────────────────

function ExtensionManager({ version }: { version: string }) {
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setExtensions(await tauriInvoke<ExtensionInfo[]>('list_php_extensions', { version })); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [version]);
  useEffect(() => { load(); }, [load]);

  const handleToggle = async (ext: ExtensionInfo) => {
    setToggling(ext.filename);
    try { await tauriInvoke('toggle_php_extension', { version, extensionName: ext.filename, enabled: !ext.enabled }); setExtensions(prev => prev.map(e => e.filename === ext.filename ? { ...e, enabled: !e.enabled } : e)); }
    catch (e) { console.error(e); }
    finally { setToggling(null); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  const builtins = new Set(['Core', 'ctype', 'curl', 'date', 'dom', 'fileinfo', 'filter', 'hash', 'iconv', 'json', 'libxml', 'mbstring', 'mysqli', 'mysqlnd', 'openssl', 'pcre', 'PDO', 'pdo_mysql', 'pdo_sqlite', 'Phar', 'posix', 'random', 'Reflection', 'session', 'SimpleXML', 'SPL', 'sqlite3', 'standard', 'tokenizer', 'xml', 'xmlreader', 'xmlwriter', 'zlib']);
  const loadable = extensions.filter(e => !builtins.has(e.name));
  const builtinsList = extensions.filter(e => builtins.has(e.name));

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium mb-2">Loadable ({loadable.length})</h4>
        <div className="grid grid-cols-2 gap-1">
          {loadable.map(ext => (
            <div key={ext.filename} className="flex items-center justify-between p-2 rounded-md border text-sm">
              <div className="flex items-center gap-2">
                <Switch checked={ext.enabled} onCheckedChange={() => handleToggle(ext)} disabled={toggling === ext.filename} />
                <span>{ext.name}</span>
                {toggling === ext.filename && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
              <span className="text-xs text-muted-foreground">{ext.size}</span>
            </div>
          ))}
          {loadable.length === 0 && <p className="text-sm text-muted-foreground col-span-2">No loadable extensions</p>}
        </div>
      </div>
      <div>
        <h4 className="text-sm font-medium mb-2">Built-in ({builtinsList.length})</h4>
        <div className="grid grid-cols-3 gap-1">
          {builtinsList.map(ext => (
            <div key={ext.name} className="flex items-center gap-1 text-xs text-muted-foreground p-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400" />{ext.name}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── PECL ───────────────────────────────────────────────────────────

function PeclInstaller({ version }: { version: string }) {
  const [extensions, setExtensions] = useState<PeclInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setExtensions(await tauriInvoke<PeclInfo[]>('list_pecl_extensions', { version })); }
    catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, [version]);
  useEffect(() => { load(); }, [load]);

  const handleInstall = async (name: string) => {
    setInstalling(name); setError(null);
    try { await tauriInvoke('install_pecl_extension', { version, extensionName: name }); await load(); }
    catch (e) { setError(`Failed: ${String(e)}`); }
    finally { setInstalling(null); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <div className="space-y-4">
      {error && <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm whitespace-pre-wrap">{error}</div>}
      <div className="grid grid-cols-2 gap-2">
        {extensions.map(ext => (
          <div key={ext.name} className="flex items-center justify-between p-3 rounded-md border">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{ext.name}</span>
                {ext.installed && <span className="flex items-center gap-1 text-xs text-green-600"><Circle className="h-2 w-2 fill-green-600" />Installed</span>}
              </div>
              <p className="text-xs text-muted-foreground">{ext.description}</p>
            </div>
            <Button size="sm" variant={ext.installed ? "ghost" : "outline"} disabled={ext.installed || installing !== null} onClick={() => handleInstall(ext.name)}>
              {installing === ext.name ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <PackagePlus className="h-3 w-3 mr-1" />}
              {ext.installed ? 'Installed' : 'Install'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export function PHPDetail({ version }: { version: string }) {
  const [activeTab, setActiveTab] = useState('versions');
  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="versions">Versions</TabsTrigger>
        <TabsTrigger value="ini">php.ini</TabsTrigger>
        <TabsTrigger value="extensions">Extensions</TabsTrigger>
        <TabsTrigger value="pecl">PECL</TabsTrigger>
      </TabsList>
      <TabsContent value="versions" className="mt-4"><Card><CardHeader><CardTitle className="text-base">Versions</CardTitle></CardHeader><CardContent><VersionsTab /></CardContent></Card></TabsContent>
      <TabsContent value="ini" className="mt-4"><Card><CardHeader><CardTitle className="text-base">php.ini</CardTitle></CardHeader><CardContent><PhpIniEditor key={version} version={version} /></CardContent></Card></TabsContent>
      <TabsContent value="extensions" className="mt-4"><Card><CardHeader><CardTitle className="text-base">Extensions</CardTitle></CardHeader><CardContent><ExtensionManager key={version} version={version} /></CardContent></Card></TabsContent>
      <TabsContent value="pecl" className="mt-4"><Card><CardHeader><CardTitle className="text-base">PECL Extensions</CardTitle></CardHeader><CardContent><PeclInstaller key={version} version={version} /></CardContent></Card></TabsContent>
    </Tabs>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
