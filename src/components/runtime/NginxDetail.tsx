import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Plus, Trash2, Globe, RefreshCw, FileText } from 'lucide-react';
import { useInstalledVersions } from '@/hooks/useRuntimes';
import { tauriInvoke } from '@/lib/tauri';
import type { RuntimeVersion } from '@/types/runtime';

interface VirtualHost { id: string; domain: string; root_dir: string; php_version: string; port: number; enabled: boolean; hosts_managed: boolean; }

function NginxConfEditor({ version }: { version: string }) {
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
    if (!content) return; setSaving(true); setMsg('');
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
          <Button variant="outline" size="sm" onClick={reload} disabled={reloading}><RefreshCw className="h-3 w-3 mr-1" />重载</Button>
          <Button size="sm" onClick={save} disabled={saving || content === original}><Save className="h-3 w-3 mr-1" />保存</Button>
        </div>
      </div>
      <textarea className="w-full h-72 font-mono text-xs bg-muted p-3 rounded-md border resize-y" value={content || ''} onChange={e => setContent(e.target.value)} spellCheck={false} />
    </div>
  );
}

function VHostManager({ version }: { version: string }) {
  const [vhosts, setVhosts] = useState<VirtualHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ domain: '', root_dir: '/Users/simonf/Projects/', php_version: version, port: 80 });
  const [hostsContent, setHostsContent] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { setVhosts(await tauriInvoke<VirtualHost[]>('list_vhosts')); }
    catch (e) { console.error(String(e)); }
    finally { setLoading(false); }
  }, []);
  const loadHosts = async () => { try { setHostsContent(await tauriInvoke<string>('get_hosts_content')); } catch (e) { console.error(String(e)); } };
  useEffect(() => { load(); loadHosts(); }, [load]);
  const create = async () => {
    await tauriInvoke('create_vhost', { config: form, nginxVersion: version });
    setShowForm(false); setForm({ domain: '', root_dir: '/Users/simonf/Projects/', php_version: version, port: 80 }); load();
  };
  const remove = async (id: string) => { await tauriInvoke('delete_vhost', { id, nginxVersion: version }); load(); };
  const addHosts = async (domain: string) => { await tauriInvoke('add_hosts_entry', { domain }); loadHosts(); };
  const removeHosts = async (domain: string) => { await tauriInvoke('remove_hosts_entry', { domain }); loadHosts(); };
  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{vhosts.length} 个站点</span>
        <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}><Plus className="h-3 w-3 mr-1" />添加站点</Button>
      </div>
      {showForm && (
        <div className="grid grid-cols-2 gap-2 p-3 border rounded-md">
          <div><Label className="text-xs">域名</Label><Input placeholder="myapp.test" value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} /></div>
          <div><Label className="text-xs">端口</Label><Input type="number" value={form.port} onChange={e => setForm({ ...form, port: parseInt(e.target.value) || 80 })} /></div>
          <div className="col-span-2"><Label className="text-xs">项目根目录</Label><Input placeholder="/Users/xxx/Projects/myapp/public" value={form.root_dir} onChange={e => setForm({ ...form, root_dir: e.target.value })} /></div>
          <div className="col-span-2 flex gap-2">
            <Button size="sm" onClick={create} disabled={!form.domain}><Plus className="h-3 w-3 mr-1" />创建</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>取消</Button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {vhosts.map(v => (
          <div key={v.id} className="p-3 border rounded-md space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-sm">{v.domain}</span>
                <Badge variant="outline" className="text-xs">:{v.port}</Badge>
              </div>
              <Button variant="ghost" size="sm" className="h-7" onClick={() => remove(v.id)}><Trash2 className="h-3 w-3 text-red-500" /></Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>根目录：<code>{v.root_dir}</code></div>
              <div>PHP: {v.php_version}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => v.hosts_managed ? removeHosts(v.domain) : addHosts(v.domain)}>
                {v.hosts_managed ? '从 /etc/hosts 移除' : '添加到 /etc/hosts'}
              </Button>
            </div>
          </div>
        ))}
        {vhosts.length === 0 && <p className="text-sm text-muted-foreground py-4">尚未配置站点。</p>}
      </div>
      <Card><CardHeader className="py-2"><CardTitle className="text-xs font-medium flex items-center gap-1"><FileText className="h-3 w-3" /> /etc/hosts</CardTitle></CardHeader><CardContent className="p-2"><pre className="text-xs font-mono max-h-32 overflow-auto whitespace-pre-wrap bg-muted p-2 rounded">{hostsContent || '加载中...'}</pre></CardContent></Card>
    </div>
  );
}

function VersionsTab() {
  const { data: installed, isLoading } = useInstalledVersions('nginx');
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <div className="space-y-2">
      {installed?.length ? installed.map((v: RuntimeVersion) => (
        <div key={v.version} className="flex items-center justify-between p-3 rounded-md border">
          <span className="font-mono text-sm">{v.version}</span>
          <span className="text-xs text-muted-foreground">{v.size ? `${(v.size / 1_048_576).toFixed(0)} MB` : ''}</span>
        </div>
      )) : <p className="text-sm text-muted-foreground">尚未安装任何版本。</p>}
    </div>
  );
}

export function NginxDetail({ version }: { version: string }) {
  const [activeTab, setActiveTab] = useState('versions');
  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="versions">版本</TabsTrigger>
        <TabsTrigger value="config">nginx.conf</TabsTrigger>
        <TabsTrigger value="vhosts">Hosts</TabsTrigger>
      </TabsList>
      <TabsContent value="versions" className="mt-4"><Card><CardHeader><CardTitle className="text-base">版本</CardTitle></CardHeader><CardContent><VersionsTab /></CardContent></Card></TabsContent>
      <TabsContent value="config" className="mt-4"><Card><CardHeader><CardTitle className="text-base">nginx.conf</CardTitle></CardHeader><CardContent><NginxConfEditor key={version} version={version} /></CardContent></Card></TabsContent>
      <TabsContent value="vhosts" className="mt-4"><Card><CardHeader><CardTitle className="text-base">Hosts</CardTitle></CardHeader><CardContent><VHostManager key={version} version={version} /></CardContent></Card></TabsContent>
    </Tabs>
  );
}
