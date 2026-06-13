import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SidebarLayout } from '@/components/layout/SidebarLayout';
import { Dashboard } from '@/pages/Dashboard';
import { Runtimes } from '@/pages/Runtimes';
import { PhpRuntime } from '@/pages/PhpRuntime';
import { MysqlRuntime } from '@/pages/MysqlRuntime';
import { NginxRuntime } from '@/pages/NginxRuntime';
import { JavaRuntime } from '@/pages/JavaRuntime';
import { Composer } from '@/pages/Composer';
import { Settings } from '@/pages/Settings';
import { OperationEvents } from '@/components/runtime/OperationEvents';

function App() {
  return (
    <BrowserRouter>
      <OperationEvents />
      <Routes>
        <Route element={<SidebarLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/runtimes" element={<Runtimes />} />
          <Route path="/runtimes/php" element={<PhpRuntime />} />
          <Route path="/runtimes/mysql" element={<MysqlRuntime />} />
          <Route path="/runtimes/nginx" element={<NginxRuntime />} />
          <Route path="/runtimes/java" element={<JavaRuntime />} />
          <Route path="/composer" element={<Composer />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
