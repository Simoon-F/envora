import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Trash2, Key, Package } from 'lucide-react';
import { useInstalledVersions } from '@/hooks/use-runtimes';
import { useTranslation } from '@/i18n/use-translation';
import { tauriInvoke } from '@/lib/tauri';
import type { RuntimeVersion } from '@/types/runtime';
import { VersionRow } from '@/components/runtime/version-row';
import { ConfigEditor } from '@/components/runtime/config-editor';
import { DetailTabs } from '@/components/runtime/detail-tabs';
import { EmptyState } from '@/components/runtime/empty-state';

interface MysqlUser { user: string; host: string; }
interface MysqlDatabase { name: string; }

const MyCnfEditor = ({ version }: { version: string }) => (
  <ConfigEditor version={version} loadCommand="get_mysql_config" saveCommand="save_mysql_config" />
);

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
  if (loading) return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{t('RuntimeDetail.UserCount', { count: users.length })}</span>
        <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}><Plus className="size-3.5 mr-1" />{t('Common.Add')}</Button>
      </div>
      {showForm && (
        <div className="grid grid-cols-3 gap-2 p-3 rounded-lg border border-border bg-card">
          <div><Label className="text-xs">{t('RuntimeDetail.Username')}</Label><Input value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} /></div>
          <div><Label className="text-xs">{t('RuntimeDetail.Password')}</Label><Input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} /></div>
          <div><Label className="text-xs">{t('RuntimeDetail.Host')}</Label><Input value={newUser.host} onChange={e => setNewUser({ ...newUser, host: e.target.value })} /></div>
          <div className="col-span-3 flex gap-2">
            <Button size="sm" onClick={create} disabled={!newUser.username}><Plus className="size-3.5 mr-1" />{t('Common.Create')}</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>{t('Common.Cancel')}</Button>
          </div>
        </div>
      )}
      <div className="space-y-1">
        {users.map(u => (
          <div key={`${u.user}@${u.host}`} className="flex items-center justify-between p-2 rounded-lg border border-border bg-card">
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
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => { setChangingPw(`${u.user}@${u.host}`); setNewPw(''); }}><Key className="size-3.5" /></Button>
                  {!['root', 'mysql.session', 'mysql.sys'].includes(u.user) && (
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => drop(u.user, u.host)}><Trash2 className="size-3.5 text-danger" /></Button>
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
  if (loading) return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="space-y-3">
      {error && <div className="p-2 rounded bg-destructive/10 text-destructive text-xs">{error}</div>}
      <div className="flex gap-2"><Input className="flex-1" placeholder={t('RuntimeDetail.DatabaseName')} value={newDb} onChange={e => setNewDb(e.target.value)} /><Button size="sm" onClick={create} disabled={!newDb}><Plus className="size-3.5 mr-1" />{t('Common.Create')}</Button></div>
      <div className="grid grid-cols-3 gap-1">
        {dbs.map(db => (
          <div key={db.name} className="flex items-center justify-between p-2 rounded-lg border border-border bg-card text-sm">
            <span className="font-mono">{db.name}</span>
            {!['information_schema', 'mysql', 'performance_schema', 'sys'].includes(db.name) && (
              <Button variant="ghost" size="sm" className="h-6" onClick={() => drop(db.name)}><Trash2 className="size-3.5 text-danger" /></Button>
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
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="space-y-2">
      {installed?.length ? installed.map((v: RuntimeVersion) => (
        <VersionRow key={v.version} label={v.version} size={v.size} isDefault={false} />
      )) : <EmptyState icon={<Package className="size-5" />} title={t('RuntimeDetail.NoVersionsInstalled')} />}
    </div>
  );
};

export const MySQLDetail = ({ version }: { version: string }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('versions');
  const tabs = [
    { value: 'versions', label: t('Common.Versions'), title: t('Common.Versions'), content: <VersionsTab /> },
    { value: 'config', label: 'my.cnf', title: 'my.cnf', content: <MyCnfEditor key={version} version={version} /> },
    { value: 'users', label: t('RuntimeDetail.UserManagement'), title: t('RuntimeDetail.UserManagement'), content: <UserManager key={version} version={version} /> },
    { value: 'databases', label: t('Common.Databases'), title: t('Common.Databases'), content: <DatabaseManager key={version} version={version} /> },
  ];
  return <DetailTabs tabs={tabs} value={activeTab} onValueChange={setActiveTab} />;
};
