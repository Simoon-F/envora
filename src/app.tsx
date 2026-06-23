import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { SidebarLayout } from '@/components/layout/sidebar-layout';
import { Dashboard } from '@/pages/dashboard';
import { Runtimes } from '@/pages/runtimes';
import { PhpRuntime } from '@/pages/php-runtime';
import { MysqlRuntime } from '@/pages/mysql-runtime';
import { NginxRuntime } from '@/pages/nginx-runtime';
import { JavaRuntime } from '@/pages/java-runtime';
import { NodeRuntime } from '@/pages/node-runtime';
import { Composer } from '@/pages/composer';
import { Settings } from '@/pages/settings';
import { OperationEvents } from '@/components/runtime/operation-events';
import { useI18nStore } from '@/i18n/store';

const App = () => {
  const language = useI18nStore((state) => state.language);

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

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
          <Route path="/runtimes/node" element={<NodeRuntime />} />
          <Route path="/composer" element={<Composer />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
