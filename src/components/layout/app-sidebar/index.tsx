import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Package, PackageCheck, Settings, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { APP_VERSION } from '@/lib/version';
import { useTranslation } from '@/i18n/use-translation';
import { OperationCenter } from '../operation-center';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, labelKey: 'Dashboard' },
  { to: '/runtimes', icon: Package, labelKey: 'Runtimes' },
  { to: '/composer', icon: PackageCheck, labelKey: 'Composer' },
  { to: '/settings', icon: Settings, labelKey: 'Settings' },
] as const;

export const Sidebar = () => {
  const { t } = useTranslation();

  return (
    <aside className="w-56 border-r bg-muted/30 flex flex-col">
      {/* Logo */}
      <div className="h-14 flex items-center gap-2 px-4 border-b">
        <Zap className="h-5 w-5 text-primary" />
        <span className="font-semibold text-lg">Envora</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map(({ to, icon: Icon, labelKey }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )
            }
          >
            <Icon className="h-4 w-4" />
            <span>{t('Layout', labelKey)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t p-3">
        <OperationCenter />
      </div>

      <div className="px-4 pb-4 text-xs text-muted-foreground">
        Envora v{APP_VERSION}
      </div>
    </aside>
  );
};
