import { Outlet } from 'react-router-dom';
import { Sidebar } from '../app-sidebar';

export const SidebarLayout = () => {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};
