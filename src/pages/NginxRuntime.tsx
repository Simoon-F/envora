import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Plus, Trash2, Globe, RefreshCw, FileText } from 'lucide-react';
import { useInstalledVersions, useDefaultVersion } from '@/hooks/useRuntimes';
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

// ── nginx.conf Editor ──────────────────────────────────────────────

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
    if (!content) return;
    setSaving(true); setMsg('');
    try { await tauriInvoke('save_nginx_config', { version, content }); setOriginal(content); setMsg('Saved!'); setTimeout(() => setMsg(''), 2000); }
    catch (e) { setMsg(`Error: ${String(e)}`); }
    finally { setSaving(false); }
  };

  const reload = async () => {
    setReloading(true);
    try { await tauriInvoke('reload_nginx', { version }); setMsg('Reloaded!'); setTimeout(() => setMsg(''), 2000); }
    catch (e) { setMsg(`Reload failed: ${String(e)}`); }
    finally { setReloading(false); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm">{msg && <span className={msg.startsWith('Error') || msg.startsWith('Reload failed') ? 'text-red-500' : 'text-green-500'}>{msg}</span>}{content !== original && !msg && <span className="text-yellow-500">Unsaved</span>}</span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reload} disabled={reloading}><RefreshCw className="h-3 w-3 mr-1" />Reload</Button>
          <Button onClick={save} disabled={saving || content === original}><Save className="h-3 w-3 mr-1" />Save</Button>
        </div>
      </div>
      <textarea className="w-full h-72 font-mono text-xs bg-muted p-3 rounded-md border resize-y" value={content || ''} onChange={e => setContent(e.target.value)} spellCheck={false} />
    </div>
  );
}

// ── Virtual Hosts ──────────────────────────────────────────────────

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

  const loadHosts = async () => {
    try { setHostsContent(await tauriInvoke<string>('get_hosts_content')); }
    catch (e) { console.error(String(e)); }
  };

  useEffect(() => { load(); loadHosts(); }, [load]);

  const create = async () => {
    await tauriInvoke('create_vhost', { config: form, nginxVersion: version });
    setShowForm(false); setForm({ domain: '', root_dir: '/Users/simonf/Projects/', php_version: version, port: 80 });
    load();
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

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{vhosts.length} sites</span>
        <Button variant="outline" onClick={() => setShowForm(!showForm)}><Plus className="h-3 w-3 mr-1" />Add Site</Button>
      </div>

      {showForm && (
        <div className="grid grid-cols-2 gap-2 p-3 border rounded-md">
          <div><Label className="text-xs">Domain</Label><Input placeholder="myapp.test" value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} /></div>
          <div><Label className="text-xs">Port</Label><Input type="number" value={form.port} onChange={e => setForm({ ...form, port: parseInt(e.target.value) || 80 })} /></div>
          <div className="col-span-2"><Label className="text-xs">Project Root</Label><Input placeholder="/Users/xxx/Projects/myapp/public" value={form.root_dir} onChange={e => setForm({ ...form, root_dir: e.target.value })} /></div>
          <div className="col-span-2 flex gap-2">
            <Button onClick={create} disabled={!form.domain}><Plus className="h-3 w-3 mr-1" />Create</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
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
              <div>Root: <code>{v.root_dir}</code></div>
              <div>PHP: {v.php_version}</div>
            </div>
            <div className="flex gap-2">
              {!v.hosts_managed ? (
                <Button variant="outline" className="h-7 text-xs" onClick={() => addHosts(v.domain)}>Add to /etc/hosts</Button>
              ) : (
                <Button variant="outline" className="h-7 text-xs" onClick={() => removeHosts(v.domain)}>Remove from /etc/hosts</Button>
              )}
            </div>
          </div>
        ))}
        {vhosts.length === 0 && <p className="text-sm text-muted-foreground py-4">No sites configured. Add your first virtual host.</p>}
      </div>

      {/* Hosts file preview */}
      <Card>
        <CardHeader className="py-2"><CardTitle className="text-xs font-medium flex items-center gap-1"><FileText className="h-3 w-3" /> /etc/hosts</CardTitle></CardHeader>
        <CardContent className="p-2">
          <pre className="text-xs font-mono max-h-32 overflow-auto whitespace-pre-wrap bg-muted p-2 rounded">{hostsContent || 'Loading...'}</pre>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Versions Tab ───────────────────────────────────────────────────

function VersionsTab() {
  const { data: installed, isLoading } = useInstalledVersions('nginx');
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <div className="space-y-2">
      {installed?.length ? installed.map((v: any) => (
        <div key={v.version} className="flex items-center justify-between p-3 rounded-md border">
          <span className="font-mono text-sm">{v.version}</span>
          <span className="text-xs text-muted-foreground">{v.size ? `${(v.size / 1_048_576).toFixed(0)} MB` : ''}</span>
        </div>
      )) : <p className="text-sm text-muted-foreground">No versions installed.</p>}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────

export function NginxRuntime() {
  const { data: installed } = useInstalledVersions('nginx');
  const { data: defaultVersion } = useDefaultVersion('nginx');
  const [activeTab, setActiveTab] = useState('versions');
  const ver = defaultVersion || installed?.[0]?.version || '';

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🌐</span>
        <h1 className="text-2xl font-bold">Nginx</h1>
        {ver && <Badge variant="outline">Default: {ver}</Badge>}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="config" disabled={!ver}>nginx.conf</TabsTrigger>
          <TabsTrigger value="vhosts" disabled={!ver}>Virtual Hosts</TabsTrigger>
        </TabsList>

        <TabsContent value="versions" className="mt-4"><Card><CardHeader><CardTitle className="text-base">Installed Versions</CardTitle></CardHeader><CardContent><VersionsTab /></CardContent></Card></TabsContent>
        <TabsContent value="config" className="mt-4"><Card><CardHeader><CardTitle className="text-base">nginx.conf</CardTitle></CardHeader><CardContent>{ver ? <NginxConfEditor key={ver} version={ver} /> : <p className="text-sm text-muted-foreground">Install Nginx first.</p>}</CardContent></Card></TabsContent>
        <TabsContent value="vhosts" className="mt-4"><Card><CardHeader><CardTitle className="text-base">Virtual Hosts</CardTitle></CardHeader><CardContent>{ver ? <VHostManager key={ver} version={ver} /> : <p className="text-sm text-muted-foreground">Install Nginx first.</p>}</CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}
