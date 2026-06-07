import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Package, Settings, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/runtimes', icon: Package, label: 'Runtimes' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
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

      {/* Footer */}
      <div className="p-4 border-t text-xs text-muted-foreground">
        Envora v0.1.0
      </div>
    </aside>
  );
}
