import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Package, PackageCheck, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_VERSION } from '@/lib/version';
import { useTranslation } from '@/i18n/use-translation';
import { BrandMark } from '../brand-mark';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, labelKey: 'Dashboard' },
  { to: '/runtimes', icon: Package, labelKey: 'Runtimes' },
  { to: '/composer', icon: PackageCheck, labelKey: 'Composer' },
  { to: '/settings', icon: Settings, labelKey: 'Settings' },
] as const;

export const Sidebar = () => {
  const { t } = useTranslation();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 px-4">
        <BrandMark className="h-5 w-5" />
        <span className="text-[17px] font-semibold tracking-tight text-sidebar-foreground">
          Envora
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-2 py-1.5">
        <h2 className="px-2.5 pb-2 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          {t('Layout', 'Menu')}
        </h2>
        {navItems.map(({ to, icon: Icon, labelKey }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn('sidebar-nav-link', isActive ? 'sidebar-nav-link-active' : '')
            }
          >
            <Icon className="sidebar-nav-link-icon" />
            <span>{t('Layout', labelKey)}</span>
          </NavLink>
        ))}
      </nav>

      {/* Operation center — compact trigger at bottom */}
      <OperationTrigger />

      {/* Version */}
      <div className="border-t border-sidebar-border px-4 py-2.5">
        <span className="text-[11px] tabular-nums text-muted-foreground/50">
          Envora v{APP_VERSION}
        </span>
      </div>
    </aside>
  );
};

/* ── Operation center trigger ─────────────────────────────────── */

import { useMemo } from 'react';
import { Activity, CheckCircle2, ListChecks, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { tauriInvoke } from '@/lib/tauri';
import { type OperationInfo, useOperationsStore } from '@/stores/operations';

const operationName = (operation: OperationInfo, runtimeLabel: string) => {
  if (operation.kind === 'runtime_install') {
    return `${operation.target.runtime || runtimeLabel} ${operation.target.version || ''}`.trim();
  }
  if (operation.target.tool) {
    return operation.target.tool;
  }
  return operation.kind;
};

const statusText = (operation: OperationInfo, t: ReturnType<typeof useTranslation>['t']) => {
  switch (operation.status) {
    case 'queued':
      return t('Operations', 'Queued');
    case 'running':
      return t('Operations', 'Running');
    case 'completed':
      return t('Operations', 'Completed');
    case 'failed':
      return t('Operations', 'Failed');
    case 'cancelled':
      return t('Operations', 'Cancelled');
  }
};

const OperationIcon = ({ operation }: { operation: OperationInfo }) => {
  if (operation.status === 'completed') return <CheckCircle2 className="size-4 text-success" />;
  if (operation.status === 'failed') return <XCircle className="size-4 text-danger" />;
  if (operation.status === 'running') return <Loader2 className="size-4 animate-spin text-primary" />;
  return <Activity className="size-4 text-muted-foreground" />;
};

const OperationRow = ({ operation }: { operation: OperationInfo }) => {
  const { t } = useTranslation();
  const remove = useOperationsStore((state) => state.remove);

  const clear = async () => {
    remove(operation.id);
    if (!operation.id.startsWith('legacy:')) {
      await tauriInvoke('clear_operation', { id: operation.id }).catch(() => undefined);
    }
  };

  return (
    <div className="space-y-2 rounded-lg bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
            <OperationIcon operation={operation} />
            <div className="min-w-0">
            <div className="truncate text-sm font-medium">{operationName(operation, t('Operations', 'Runtime'))}</div>
            <div className="text-xs text-muted-foreground">{statusText(operation, t)}</div>
          </div>
        </div>
        {operation.status !== 'running' && operation.status !== 'queued' && (
          <Button variant="ghost" size="xs" className="h-6 shrink-0 text-xs" onClick={clear}>
            {t('Common', 'Clear')}
          </Button>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-all ${operation.status === 'failed' ? 'bg-danger' : 'bg-primary'}`}
          style={{ width: `${operation.percent}%` }}
        />
      </div>
      <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
        <span className="min-w-0 wrap-break-word">{operation.error || operation.message}</span>
        <span className="shrink-0 tabular-nums">{operation.percent.toFixed(0)}%</span>
      </div>
    </div>
  );
};

const OperationTrigger = () => {
  const { t } = useTranslation();
  const operationsById = useOperationsStore((state) => state.operations);
  const ordered = useMemo(
    () => Object.values(operationsById).sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [operationsById]
  );
  const running = useMemo(
    () => ordered.filter((operation) => operation.status === 'running' || operation.status === 'queued'),
    [ordered]
  );
  const latest = running[0] || ordered[0];

  return (
    <Sheet>
      <SheetTrigger
        render={
          <button
            type="button"
            className="sidebar-nav-link"
            title={t('Operations', 'Tasks')}
          />
        }
      >
        <div className="flex items-center gap-2 px-2.5 py-2">
          {running.length > 0 ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : (
            <ListChecks className="size-4 text-muted-foreground/70" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-muted-foreground">
              {t('Operations', 'Tasks')}
            </div>
            <div className="truncate text-[11px] text-muted-foreground/60">
              {latest
                ? `${operationName(latest, t('Operations', 'Runtime'))} · ${latest.percent.toFixed(0)}%`
                : t('Operations', 'NoRunningTasks')}
            </div>
          </div>
        </div>
      </SheetTrigger>
      <SheetContent className="w-95 sm:max-w-95">
        <SheetHeader>
          <SheetTitle>{t('Operations', 'Tasks')}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-2 overflow-auto px-4 pb-4">
          {ordered.length > 0 ? (
            ordered.map((operation) => <OperationRow key={operation.id} operation={operation} />)
          ) : (
            <div className="rounded-lg bg-muted/60 p-4 text-sm text-muted-foreground">
              {t('Operations', 'NoTasks')}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
