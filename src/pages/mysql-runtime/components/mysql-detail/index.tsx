import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Plus, Trash2, Key } from 'lucide-react';
import { useInstalledVersions } from '@/hooks/use-runtimes';
import { useTranslation } from '@/i18n/use-translation';
import { tauriInvoke } from '@/lib/tauri';
import type { RuntimeVersion } from '@/types/runtime';

interface MysqlUser { user: string; host: string; }
interface MysqlDatabase { name: string; }

const MyCnfEditor = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { const t = await tauriInvoke<string>('get_mysql_config', { version }); setContent(t); setOriginal(t); }
    catch (e) { setContent(`; Error: ${String(e)}`); }
    finally { setLoading(false); }
  }, [version]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!content) return; setSaving(true); setMsg('');
    try { await tauriInvoke('save_mysql_config', { version, content }); setOriginal(content); setMsg(t('Common.Saved')); setTimeout(() => setMsg(''), 2000); }
    catch (e) { setMsg(t('Common.ErrorPrefix', { message: String(e) })); }
    finally { setSaving(false); }
  };
  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm">{msg && <span className={msg.startsWith(t('Common.ErrorPrefix', { message: '' })) ? 'text-red-500' : 'text-green-500'}>{msg}</span>}{content !== original && !msg && <span className="text-yellow-500">{t('Common.Unsaved')}</span>}</span>
        <Button size="sm" onClick={save} disabled={saving || content === original}><Save className="h-3 w-3 mr-1" />{t('Common.Save')}</Button>
      </div>
      <textarea className="w-full h-72 font-mono text-xs bg-muted p-3 rounded-md border resize-y" value={content || ''} onChange={e => setContent(e.target.value)} spellCheck={false} />
    </div>
  );
};

const UserManager = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<MysqlUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', host: 'localhost' });
  const [changingPw, setChangingPw] = useState<string | null>(null);
  const [newPw, setNewPw] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers(await tauriInvoke<MysqlUser[]>('list_mysql_users', { version })); }
    catch (e) { console.error(String(e)); }
    finally { setLoading(false); }
  }, [version]);
  useEffect(() => { load(); }, [load]);
  const create = async () => { await tauriInvoke('create_mysql_user', { version, ...newUser }); setNewUser({ username: '', password: '', host: 'localhost' }); setShowForm(false); load(); };
  const drop = async (user: string, host: string) => { await tauriInvoke('drop_mysql_user', { version, username: user, host }); load(); };
  const changePw = async (user: string, host: string) => { await tauriInvoke('change_mysql_password', { version, username: user, host, password: newPw }); setChangingPw(null); setNewPw(''); };
  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{t('RuntimeDetail.UserCount', { count: users.length })}</span>
        <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}><Plus className="h-3 w-3 mr-1" />{t('Common.Add')}</Button>
      </div>
      {showForm && (
        <div className="grid grid-cols-3 gap-2 p-3 border rounded-md">
          <div><Label className="text-xs">{t('RuntimeDetail.Username')}</Label><Input value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} /></div>
          <div><Label className="text-xs">{t('RuntimeDetail.Password')}</Label><Input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} /></div>
          <div><Label className="text-xs">{t('RuntimeDetail.Host')}</Label><Input value={newUser.host} onChange={e => setNewUser({ ...newUser, host: e.target.value })} /></div>
          <div className="col-span-3 flex gap-2">
            <Button size="sm" onClick={create} disabled={!newUser.username}><Plus className="h-3 w-3 mr-1" />{t('Common.Create')}</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>{t('Common.Cancel')}</Button>
          </div>
        </div>
      )}
      <div className="space-y-1">
        {users.map(u => (
          <div key={`${u.user}@${u.host}`} className="flex items-center justify-between p-2 border rounded-md">
            <div><span className="font-mono text-sm">{u.user}</span><span className="text-xs text-muted-foreground ml-2">@{u.host}</span></div>
            <div className="flex items-center gap-2">
              {changingPw === `${u.user}@${u.host}` ? (
                <div className="flex gap-1">
                  <Input className="w-32 h-7 text-xs" type="password" placeholder={t('RuntimeDetail.NewPassword')} value={newPw} onChange={e => setNewPw(e.target.value)} />
                  <Button size="sm" className="h-7 text-xs" onClick={() => changePw(u.user, u.host)}>{t('Common.Save')}</Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setChangingPw(null)}>{t('Common.Cancel')}</Button>
                </div>
              ) : (
                <>
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => { setChangingPw(`${u.user}@${u.host}`); setNewPw(''); }}><Key className="h-3 w-3" /></Button>
                  {!['root', 'mysql.session', 'mysql.sys'].includes(u.user) && (
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => drop(u.user, u.host)}><Trash2 className="h-3 w-3 text-red-500" /></Button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const DatabaseManager = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const [dbs, setDbs] = useState<MysqlDatabase[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDb, setNewDb] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { setDbs(await tauriInvoke<MysqlDatabase[]>('list_mysql_databases', { version })); }
    catch (e) { console.error(String(e)); }
    finally { setLoading(false); }
  }, [version]);
  useEffect(() => { load(); }, [load]);
  const create = async () => { setError(''); try { await tauriInvoke('create_mysql_database', { version, database: newDb }); setNewDb(''); load(); } catch (e) { setError(String(e)); } };
  const drop = async (name: string) => { setError(''); try { await tauriInvoke('drop_mysql_database', { version, database: name }); load(); } catch (e) { setError(String(e)); } };
  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <div className="space-y-3">
      {error && <div className="p-2 rounded bg-destructive/10 text-destructive text-xs">{error}</div>}
      <div className="flex gap-2"><Input className="flex-1" placeholder={t('RuntimeDetail.DatabaseName')} value={newDb} onChange={e => setNewDb(e.target.value)} /><Button size="sm" onClick={create} disabled={!newDb}><Plus className="h-3 w-3 mr-1" />{t('Common.Create')}</Button></div>
      <div className="grid grid-cols-3 gap-1">
        {dbs.map(db => (
          <div key={db.name} className="flex items-center justify-between p-2 border rounded-md text-sm">
            <span className="font-mono">{db.name}</span>
            {!['information_schema', 'mysql', 'performance_schema', 'sys'].includes(db.name) && (
              <Button variant="ghost" size="sm" className="h-6" onClick={() => drop(db.name)}><Trash2 className="h-3 w-3 text-red-500" /></Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const VersionsTab = () => {
  const { t } = useTranslation();
  const { data: installed, isLoading } = useInstalledVersions('mysql');
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <div className="space-y-2">
      {installed?.length ? installed.map((v: RuntimeVersion) => (
        <div key={v.version} className="flex items-center justify-between p-3 rounded-md border">
          <span className="font-mono text-sm">{v.version}</span>
          <span className="text-xs text-muted-foreground">{v.size ? `${(v.size / 1_048_576).toFixed(0)} MB` : ''}</span>
        </div>
      )) : <p className="text-sm text-muted-foreground">{t('RuntimeDetail.NoVersionsInstalled')}</p>}
    </div>
  );
};

export const MySQLDetail = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('versions');
  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="versions">{t('Common.Versions')}</TabsTrigger>
        <TabsTrigger value="config">my.cnf</TabsTrigger>
        <TabsTrigger value="users">{t('RuntimeDetail.UserManagement')}</TabsTrigger>
        <TabsTrigger value="databases">{t('Common.Databases')}</TabsTrigger>
      </TabsList>
      <TabsContent value="versions" className="mt-4"><Card><CardHeader><CardTitle className="text-base">{t('Common.Versions')}</CardTitle></CardHeader><CardContent><VersionsTab /></CardContent></Card></TabsContent>
      <TabsContent value="config" className="mt-4"><Card><CardHeader><CardTitle className="text-base">my.cnf</CardTitle></CardHeader><CardContent><MyCnfEditor key={version} version={version} /></CardContent></Card></TabsContent>
      <TabsContent value="users" className="mt-4"><Card><CardHeader><CardTitle className="text-base">{t('RuntimeDetail.UserManagement')}</CardTitle></CardHeader><CardContent><UserManager key={version} version={version} /></CardContent></Card></TabsContent>
      <TabsContent value="databases" className="mt-4"><Card><CardHeader><CardTitle className="text-base">{t('Common.Databases')}</CardTitle></CardHeader><CardContent><DatabaseManager key={version} version={version} /></CardContent></Card></TabsContent>
    </Tabs>
  );
};
