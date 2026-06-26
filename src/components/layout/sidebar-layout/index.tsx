import { Outlet } from 'react-router-dom';
import { Sidebar } from '../app-sidebar';

export const SidebarLayout = () => {
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar />
      <main className="relative flex-1 min-w-0 overflow-auto">
        <div className="mx-auto w-full max-w-360">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
