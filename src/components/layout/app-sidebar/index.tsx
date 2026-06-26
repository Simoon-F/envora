import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Package, PackageCheck, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_VERSION } from '@/lib/version';
import { useTranslation } from '@/i18n/use-translation';
import { OperationCenter } from '../operation-center';
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
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        <h2 className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          {t('Layout', 'Menu')}
        </h2>
        {navItems.map(({ to, icon: Icon, labelKey }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors duration-200',
                isActive
                  ? 'bg-primary/10 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity duration-200',
                    isActive ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <Icon
                  className={cn(
                    'h-4 w-4 transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                  )}
                />
                <span>{t('Layout', labelKey)}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Operation center */}
      <div className="px-3 pb-3">
        <OperationCenter />
      </div>

      {/* Version */}
      <div className="border-t border-sidebar-border px-4 py-2.5">
        <span className="text-[11px] tabular-nums text-muted-foreground/60">
          Envora v{APP_VERSION}
        </span>
      </div>
    </aside>
  );
};
