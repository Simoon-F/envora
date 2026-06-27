import { Outlet } from 'react-router-dom';
import { Sidebar } from '../app-sidebar';

export const SidebarLayout = () => {
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar />
      <main className="relative flex-1 min-w-0 overflow-auto">
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
