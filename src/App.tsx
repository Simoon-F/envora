import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SidebarLayout } from '@/components/layout/SidebarLayout';
import { Dashboard } from '@/pages/Dashboard';
import { Runtimes } from '@/pages/Runtimes';
import { PhpRuntime } from '@/pages/PhpRuntime';
import { Settings } from '@/pages/Settings';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<SidebarLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/runtimes" element={<Runtimes />} />
          <Route path="/runtimes/php" element={<PhpRuntime />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
