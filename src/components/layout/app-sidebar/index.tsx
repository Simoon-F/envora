import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Package, PackageCheck, Settings, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OperationCenter } from '../operation-center';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: '仪表盘' },
  { to: '/runtimes', icon: Package, label: '运行环境' },
  { to: '/composer', icon: PackageCheck, label: 'Composer' },
  { to: '/settings', icon: Settings, label: '设置' },
];

export const Sidebar = () => {
  return (
    <aside className="w-56 border-r bg-muted/30 flex flex-col">
      {/* Logo */}
      <div className="h-14 flex items-center gap-2 px-4 border-b">
        <Zap className="h-5 w-5 text-primary" />
        <span className="font-semibold text-lg">Envora</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
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
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t p-3">
        <OperationCenter />
      </div>

      <div className="px-4 pb-4 text-xs text-muted-foreground">
        Envora v0.1.0
      </div>
    </aside>
  );
};
