import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Plus, Trash2, Globe, RefreshCw, FileText, FolderOpen } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useInstalledVersions, useDefaultVersion } from '@/hooks/use-runtimes';
import { tauriInvoke } from '@/lib/tauri';

interface VirtualHost {
  id: string;
  domain: string;
  root_dir: string;
  php_version: string;
  port: number;
  enabled: boolean;
  hosts_managed: boolean;
}

interface VHostConfFile {
  path: string;
  content: string;
}

// ── nginx.conf Editor ──────────────────────────────────────────────

const NginxConfEditor = ({ version }: { version: string }) => {
  const [content, setContent] = useState<string | null>(null);
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [reloading, setReloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const t = await tauriInvoke<string>('get_nginx_config', { version }); setContent(t); setOriginal(t); }
    catch (e) { setContent(`# Error: ${String(e)}`); }
    finally { setLoading(false); }
  }, [version]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!content) return;
    setSaving(true); setMsg('');
    try { await tauriInvoke('save_nginx_config', { version, content }); setOriginal(content); setMsg('已保存！'); setTimeout(() => setMsg(''), 2000); }
    catch (e) { setMsg(`错误：${String(e)}`); }
    finally { setSaving(false); }
  };

  const reload = async () => {
    setReloading(true);
    try { await tauriInvoke('reload_nginx', { version }); setMsg('已重载！'); setTimeout(() => setMsg(''), 2000); }
    catch (e) { setMsg(`重载失败：${String(e)}`); }
    finally { setReloading(false); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm">{msg && <span className={msg.startsWith('错误') || msg.startsWith('重载失败') ? 'text-red-500' : 'text-green-500'}>{msg}</span>}{content !== original && !msg && <span className="text-yellow-500">未保存</span>}</span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reload} disabled={reloading}><RefreshCw className="h-3 w-3 mr-1" />重载</Button>
          <Button onClick={save} disabled={saving || content === original}><Save className="h-3 w-3 mr-1" />保存</Button>
        </div>
      </div>
      <textarea className="w-full h-72 font-mono text-xs bg-muted p-3 rounded-md border resize-y" value={content || ''} onChange={e => setContent(e.target.value)} spellCheck={false} />
    </div>
  );
};

// ── Virtual Hosts ──────────────────────────────────────────────────

const VHostManager = ({ version }: { version: string }) => {
  const { data: defaultPhpVersion } = useDefaultVersion('php');
  const [vhosts, setVhosts] = useState<VirtualHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ domain: '', root_dir: '/Users/simonf/Projects/', php_version: '', port: 80 });
  const [hostsContent, setHostsContent] = useState('');
  const [formError, setFormError] = useState('');
  const [configOpen, setConfigOpen] = useState(false);
  const [configVhost, setConfigVhost] = useState<VirtualHost | null>(null);
  const [configFile, setConfigFile] = useState<VHostConfFile | null>(null);
  const [configContent, setConfigContent] = useState('');
  const [configMessage, setConfigMessage] = useState('');
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  const chooseRootDir = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: '选择项目根目录',
      defaultPath: form.root_dir || undefined,
    });

    if (typeof selected === 'string') {
      setForm(current => ({ ...current, root_dir: selected }));
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try { setVhosts(await tauriInvoke<VirtualHost[]>('list_vhosts')); }
    catch (e) { console.error(String(e)); }
    finally { setLoading(false); }
  }, []);

  const loadHosts = async () => {
    try { setHostsContent(await tauriInvoke<string>('get_hosts_content')); }
    catch (e) { console.error(String(e)); }
  };

  useEffect(() => { load(); loadHosts(); }, [load]);

  useEffect(() => {
    if (!defaultPhpVersion) return;
    setForm(current => (
      current.php_version && current.php_version !== version
        ? current
        : { ...current, php_version: defaultPhpVersion }
    ));
  }, [defaultPhpVersion, version]);

  const create = async () => {
    setFormError('');
    try {
      await tauriInvoke('create_vhost', { config: form, nginxVersion: version });
      setShowForm(false); setForm({ domain: '', root_dir: '/Users/simonf/Projects/', php_version: defaultPhpVersion || '', port: 80 });
      load();
    } catch (e) {
      setFormError(String(e));
    }
  };

  const remove = async (id: string) => {
    await tauriInvoke('delete_vhost', { id, nginxVersion: version });
    load();
  };

  const addHosts = async (domain: string) => {
    await tauriInvoke('add_hosts_entry', { domain });
    loadHosts();
  };

  const removeHosts = async (domain: string) => {
    await tauriInvoke('remove_hosts_entry', { domain });
    loadHosts();
  };

  const openVhostConfig = async (vhost: VirtualHost) => {
    setConfigOpen(true);
    setConfigVhost(vhost);
    setConfigFile(null);
    setConfigContent('');
    setConfigMessage('');
    setConfigLoading(true);
    try {
      const file = await tauriInvoke<VHostConfFile>('get_vhost_config', { id: vhost.id, nginxVersion: version });
      setConfigFile(file);
      setConfigContent(file.content);
    } catch (e) {
      setConfigMessage(String(e));
    } finally {
      setConfigLoading(false);
    }
  };

  const saveVhostConfig = async () => {
    if (!configVhost) return;
    setConfigSaving(true);
    setConfigMessage('');
    try {
      await tauriInvoke('save_vhost_config', { id: configVhost.id, nginxVersion: version, content: configContent });
      setConfigMessage('已保存并重载 nginx');
    } catch (e) {
      setConfigMessage(String(e));
    } finally {
      setConfigSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{vhosts.length} 个站点</span>
        <Button variant="outline" onClick={() => setShowForm(!showForm)}><Plus className="h-3 w-3 mr-1" />添加站点</Button>
      </div>

      {showForm && (
        <div className="grid grid-cols-2 gap-2 p-3 border rounded-md">
          <div><Label className="text-xs">域名</Label><Input placeholder="myapp.test" value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} /></div>
          <div><Label className="text-xs">端口</Label><Input type="number" value={form.port} onChange={e => setForm({ ...form, port: parseInt(e.target.value) || 80 })} /></div>
          <div className="col-span-2">
            <Label className="text-xs">项目根目录</Label>
            <div className="flex gap-2">
              <Input
                placeholder="/Users/xxx/Projects/myapp/public"
                value={form.root_dir}
                onChange={e => setForm({ ...form, root_dir: e.target.value })}
              />
              <Button type="button" variant="outline" onClick={chooseRootDir} title="选择项目根目录">
                <FolderOpen className="h-3 w-3 mr-1" />选择
              </Button>
            </div>
          </div>
          {formError && <pre className="col-span-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-red-500/10 p-2 text-xs text-red-600">{formError}</pre>}
          <div className="col-span-2 flex gap-2">
            <Button onClick={create} disabled={!form.domain || !form.root_dir}><Plus className="h-3 w-3 mr-1" />创建</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>取消</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {vhosts.map(v => (
          <div key={v.id} className="p-3 border rounded-md space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <a href={`http://${v.domain}`} target="_blank" className="font-mono text-sm hover:underline" rel="noreferrer">{v.domain}</a>
                <Badge variant="outline" className="text-xs">:{v.port}</Badge>
              </div>
              <Button variant="ghost" className="h-7" onClick={() => remove(v.id)}><Trash2 className="h-3 w-3 text-red-500" /></Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>根目录：<code>{v.root_dir}</code></div>
              <div>PHP: {v.php_version && v.php_version !== version ? v.php_version : '未设置'}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="h-7 text-xs" onClick={() => openVhostConfig(v)}>
                <FileText className="h-3 w-3 mr-1" />配置
              </Button>
              {!v.hosts_managed ? (
                <Button variant="outline" className="h-7 text-xs" onClick={() => addHosts(v.domain)}>添加到 /etc/hosts</Button>
              ) : (
                <Button variant="outline" className="h-7 text-xs" onClick={() => removeHosts(v.domain)}>从 /etc/hosts 移除</Button>
              )}
            </div>
          </div>
        ))}
        {vhosts.length === 0 && <p className="text-sm text-muted-foreground py-4">尚未配置站点。添加第一个站点吧。</p>}
      </div>

      {/* Hosts file preview */}
      <Card>
        <CardHeader className="py-2"><CardTitle className="text-xs font-medium flex items-center gap-1"><FileText className="h-3 w-3" /> /etc/hosts</CardTitle></CardHeader>
        <CardContent className="p-2">
          <pre className="text-xs font-mono max-h-32 overflow-auto whitespace-pre-wrap bg-muted p-2 rounded">{hostsContent || '加载中...'}</pre>
        </CardContent>
      </Card>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader className="pr-10">
            <DialogTitle>{configVhost?.domain}.conf</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {configFile?.path && <div className="truncate text-xs text-muted-foreground">{configFile.path}</div>}
            {configMessage && (
              <pre className={`max-h-28 overflow-auto whitespace-pre-wrap rounded-md p-2 text-xs ${configMessage.startsWith('已保存') ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                {configMessage}
              </pre>
            )}
            <textarea
              className="h-[48vh] w-full resize-y rounded-md border bg-muted p-3 font-mono text-xs"
              value={configContent}
              onChange={e => setConfigContent(e.target.value)}
              spellCheck={false}
              disabled={configLoading}
              placeholder={configLoading ? '加载中...' : ''}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfigOpen(false)}>关闭</Button>
              <Button onClick={saveVhostConfig} disabled={configLoading || configSaving || !configVhost}>
                <Save className="h-3 w-3 mr-1" />保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Versions Tab ───────────────────────────────────────────────────

const VersionsTab = () => {
  const { data: installed, isLoading } = useInstalledVersions('nginx');
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <div className="space-y-2">
      {installed?.length ? installed.map((v: any) => (
        <div key={v.version} className="flex items-center justify-between p-3 rounded-md border">
          <span className="font-mono text-sm">{v.version}</span>
          <span className="text-xs text-muted-foreground">{v.size ? `${(v.size / 1_048_576).toFixed(0)} MB` : ''}</span>
        </div>
      )) : <p className="text-sm text-muted-foreground">尚未安装任何版本。</p>}
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────

export const NginxRuntimeDetail = () => {
  const { data: installed } = useInstalledVersions('nginx');
  const { data: defaultVersion } = useDefaultVersion('nginx');
  const [activeTab, setActiveTab] = useState('versions');
  const ver = defaultVersion || installed?.[0]?.version || '';

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🌐</span>
        <h1 className="text-2xl font-bold">Nginx</h1>
        {ver && <Badge variant="outline">默认：{ver}</Badge>}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="versions">版本</TabsTrigger>
          <TabsTrigger value="config" disabled={!ver}>nginx.conf</TabsTrigger>
          <TabsTrigger value="vhosts" disabled={!ver}>站点</TabsTrigger>
        </TabsList>

        <TabsContent value="versions" className="mt-4"><Card><CardHeader><CardTitle className="text-base">已安装版本</CardTitle></CardHeader><CardContent><VersionsTab /></CardContent></Card></TabsContent>
        <TabsContent value="config" className="mt-4"><Card><CardHeader><CardTitle className="text-base">nginx.conf</CardTitle></CardHeader><CardContent>{ver ? <NginxConfEditor key={ver} version={ver} /> : <p className="text-sm text-muted-foreground">请先安装 Nginx。</p>}</CardContent></Card></TabsContent>
        <TabsContent value="vhosts" className="mt-4"><Card><CardHeader><CardTitle className="text-base">站点</CardTitle></CardHeader><CardContent>{ver ? <VHostManager key={ver} version={ver} /> : <p className="text-sm text-muted-foreground">请先安装 Nginx。</p>}</CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
};
