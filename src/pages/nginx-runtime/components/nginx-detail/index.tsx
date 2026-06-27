import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Save, Trash2, Globe, RefreshCw, FileText, FolderOpen, Package } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useDefaultVersion, useInstalledVersions } from '@/hooks/use-runtimes';
import { useTranslation } from '@/i18n/use-translation';
import { tauriInvoke } from '@/lib/tauri';
import type { RuntimeVersion } from '@/types/runtime';
import { VersionRow } from '@/components/runtime/version-row';
import { ConfigEditor } from '@/components/runtime/config-editor';
import { DetailTabs } from '@/components/runtime/detail-tabs';
import { EmptyState } from '@/components/runtime/empty-state';

interface VirtualHost { id: string; domain: string; root_dir: string; php_version: string; port: number; enabled: boolean; hosts_managed: boolean; }
interface VHostConfFile { path: string; content: string; }

const NginxConfEditor = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const [reloading, setReloading] = useState(false);
  const reload = async () => {
    setReloading(true);
    try { await tauriInvoke('reload_nginx', { version }); }
    catch (e) { console.error(String(e)); }
    finally { setReloading(false); }
  };
  return (
    <ConfigEditor
      version={version}
      loadCommand="get_nginx_config"
      saveCommand="save_nginx_config"
      extraActions={
        <Button variant="outline" size="sm" onClick={reload} disabled={reloading}>
          <RefreshCw className="size-3.5 mr-1" />
          {t('Common.Reload')}
        </Button>
      }
    />
  );
};

const VHostManager = ({ version }: { version: string }) => {
  const { t } = useTranslation();
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
      title: t('RuntimeDetail.ChooseProjectRoot'),
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
  const loadHosts = async () => { try { setHostsContent(await tauriInvoke<string>('get_hosts_content')); } catch (e) { console.error(String(e)); } };
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
      setShowForm(false); setForm({ domain: '', root_dir: '/Users/simonf/Projects/', php_version: defaultPhpVersion || '', port: 80 }); load();
    } catch (e) {
      setFormError(String(e));
    }
  };
  const remove = async (id: string) => { await tauriInvoke('delete_vhost', { id, nginxVersion: version }); load(); };
  const addHosts = async (domain: string) => { await tauriInvoke('add_hosts_entry', { domain }); loadHosts(); };
  const removeHosts = async (domain: string) => { await tauriInvoke('remove_hosts_entry', { domain }); loadHosts(); };
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
      setConfigMessage(t('RuntimeDetail.SaveAndReloadedNginx'));
    } catch (e) {
      setConfigMessage(String(e));
    } finally {
      setConfigSaving(false);
    }
  };
  if (loading) return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{t('RuntimeDetail.SiteCount', { count: vhosts.length })}</span>
        <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}><Plus className="size-3.5 mr-1" />{t('Common.AddSite')}</Button>
      </div>
      {showForm && (
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/60 p-3">
          <div><Label className="text-xs">{t('RuntimeDetail.Domain')}</Label><Input placeholder="myapp.test" value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} /></div>
          <div><Label className="text-xs">{t('RuntimeDetail.Port')}</Label><Input type="number" value={form.port} onChange={e => setForm({ ...form, port: parseInt(e.target.value) || 80 })} /></div>
          <div className="col-span-2">
            <Label className="text-xs">{t('RuntimeDetail.ProjectRoot')}</Label>
            <div className="flex gap-2">
              <Input
                placeholder="/Users/xxx/Projects/myapp/public"
                value={form.root_dir}
                onChange={e => setForm({ ...form, root_dir: e.target.value })}
              />
              <Button type="button" variant="outline" size="sm" onClick={chooseRootDir} title={t('RuntimeDetail.ChooseProjectRoot')}>
                <FolderOpen className="size-3.5 mr-1" />{t('Common.Select')}
              </Button>
            </div>
          </div>
          {formError && <pre className="col-span-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-danger/10 p-2 text-xs text-danger">{formError}</pre>}
          <div className="col-span-2 flex gap-2">
            <Button size="sm" onClick={create} disabled={!form.domain || !form.root_dir}><Plus className="size-3.5 mr-1" />{t('Common.Create')}</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>{t('Common.Cancel')}</Button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {vhosts.map(v => (
          <div key={v.id} className="rounded-lg bg-card p-3 space-y-2 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="size-4 text-muted-foreground" />
                <span className="font-mono text-sm">{v.domain}</span>
                <Badge variant="outline" className="text-xs">:{v.port}</Badge>
              </div>
              <Button variant="ghost" size="sm" className="h-7" onClick={() => remove(v.id)}><Trash2 className="size-3.5 text-danger" /></Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>{t('RuntimeDetail.RootDirectory')}: <code className="ml-1 rounded bg-code-bg px-1.5 py-0.5 font-mono text-xs">{v.root_dir}</code></div>
              <div>PHP: {v.php_version && v.php_version !== version ? v.php_version : t('Common.NotSet')}</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openVhostConfig(v)}>
                <FileText className="size-3.5 mr-1" />{t('Common.Config')}
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => v.hosts_managed ? removeHosts(v.domain) : addHosts(v.domain)}>
                {v.hosts_managed ? t('Common.HostsRemove') : t('Common.HostsAdd')}
              </Button>
            </div>
          </div>
        ))}
        {vhosts.length === 0 && <p className="text-sm text-muted-foreground py-4">{t('RuntimeDetail.NoSites')}</p>}
      </div>
      <div className="rounded-xl bg-card shadow-sm">
        <div className="border-b bg-muted/30 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1.5">
          <FileText className="size-3.5" /> /etc/hosts
        </div>
        <pre className="text-xs font-mono max-h-32 overflow-auto whitespace-pre-wrap bg-code-bg p-2 rounded-b-xl">{hostsContent || t('Common.Loading')}</pre>
      </div>
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader className="pr-10">
            <DialogTitle>{configVhost?.domain}.conf</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {configFile?.path && <div className="truncate text-xs text-muted-foreground">{configFile.path}</div>}
            {configMessage && (
              <pre className={`max-h-28 overflow-auto whitespace-pre-wrap rounded-lg p-2 text-xs ${configMessage === t('RuntimeDetail.SaveAndReloadedNginx') ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                {configMessage}
              </pre>
            )}
            <textarea
              className="h-[48vh] w-full resize-y rounded-lg border bg-code-bg p-3 font-mono text-xs"
              value={configContent}
              onChange={e => setConfigContent(e.target.value)}
              spellCheck={false}
              disabled={configLoading}
              placeholder={configLoading ? t('Common.Loading') : ''}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfigOpen(false)}>{t('Common.Close')}</Button>
              <Button size="sm" onClick={saveVhostConfig} disabled={configLoading || configSaving || !configVhost}>
                <Save className="size-3.5 mr-1" />{t('Common.Save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const VersionsTab = () => {
  const { t } = useTranslation();
  const { data: installed, isLoading } = useInstalledVersions('nginx');
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="space-y-2">
      {installed?.length ? installed.map((v: RuntimeVersion) => (
        <VersionRow key={v.version} label={v.version} size={v.size} isDefault={false} />
      )) : <EmptyState icon={<Package className="size-5" />} title={t('RuntimeDetail.NoVersionsInstalled')} />}
    </div>
  );
};

export const NginxDetail = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('versions');
  const tabs = [
    { value: 'versions', label: t('Common.Versions'), title: t('Common.Versions'), content: <VersionsTab /> },
    { value: 'config', label: 'nginx.conf', title: 'nginx.conf', content: <NginxConfEditor key={version} version={version} /> },
    { value: 'vhosts', label: t('RuntimeDetail.Sites'), title: t('RuntimeDetail.Sites'), content: <VHostManager key={version} version={version} /> },
  ];
  return <DetailTabs tabs={tabs} value={activeTab} onValueChange={setActiveTab} />;
};
