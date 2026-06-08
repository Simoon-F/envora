import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Play, Square, RotateCw, Loader2, PowerOff, Power, FileText, Trash2 } from 'lucide-react';
import { useAllServices, useStartService, useStopService, useRestartService, useStartAllServices, useStopAllServices, useServiceLog, useClearServiceLog } from '@/hooks/useServices';
import { useDefaultVersion } from '@/hooks/useRuntimes';
import type { ServiceStatus } from '@/types/service';
import { listen } from '@tauri-apps/api/event';

const runtimeName: Record<string, string> = {
  nginx: 'nginx', mysql: 'mysql', 'php-fpm': 'php',
};

const statusColors: Record<ServiceStatus, string> = {
  running: 'bg-green-500', stopped: 'bg-red-500', error: 'bg-red-500',
  starting: 'bg-yellow-500', stopping: 'bg-yellow-500', unknown: 'bg-gray-500',
};

const statusLabels: Record<ServiceStatus, string> = {
  running: '运行中', stopped: '已停止', error: '错误',
  starting: '启动中...', stopping: '停止中...', unknown: '未知',
};

function ServiceCard({ serviceType, title }: { serviceType: string; title: string }) {
  const [logOpen, setLogOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const { data: services, mutate } = useAllServices();
  const { data: defaultVersion } = useDefaultVersion(runtimeName[serviceType]);
  const { data: serviceLog, isLoading: isLogLoading, mutate: refreshLog } = useServiceLog(
    logOpen ? serviceType : null,
    logOpen && defaultVersion ? defaultVersion : null
  );
  const { mutate: clearLog, isLoading: isClearingLog } = useClearServiceLog();
  const { mutate: startService, isLoading: isStarting } = useStartService();
  const { mutate: stopService, isLoading: isStopping } = useStopService();
  const { mutate: restartService, isLoading: isRestarting } = useRestartService();

  const service = services?.find((s) => s.id.startsWith(serviceType));
  const status = service?.status ?? 'stopped';

  const handleStart = async () => {
    if (!defaultVersion) return;
    setActionError('');
    try {
      await startService({ serviceType, version: defaultVersion });
      mutate();
    } catch (e) {
      setActionError(String(e));
      setLogOpen(true);
    }
  };

  const handleStop = async () => {
    if (!service) return;
    setActionError('');
    try {
      await stopService({ serviceId: service.id });
      mutate();
    } catch (e) {
      setActionError(String(e));
    }
  };

  const handleRestart = async () => {
    if (!service) return;
    setActionError('');
    try {
      await restartService({ serviceId: service.id });
      mutate();
    } catch (e) {
      setActionError(String(e));
      setLogOpen(true);
    }
  };

  const handleClearLog = async () => {
    if (!defaultVersion) return;
    await clearLog({ serviceType, version: defaultVersion });
    refreshLog();
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Badge variant={status === 'running' ? 'default' : 'secondary'}>
            <span className={`h-2 w-2 rounded-full mr-2 ${statusColors[status]}`} />
            {statusLabels[status]}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {defaultVersion && <span className="mr-3">v{defaultVersion}</span>}
              {service?.pid ? `PID: ${service.pid}` : '未运行'}
              {service?.port ? ` • 端口: ${service.port}` : ''}
            </div>
            {actionError && <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-600">{actionError}</p>}
            <div className="flex flex-wrap gap-2">
              {status === 'running' ? (
                <>
                  <Button variant="outline" size="sm" onClick={handleStop} disabled={isStopping}>
                    <Square className="h-3 w-3 mr-1" />停止
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleRestart} disabled={isRestarting}>
                    <RotateCw className="h-3 w-3 mr-1" />重启
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={handleStart} disabled={isStarting || !defaultVersion}>
                  <Play className="h-3 w-3 mr-1" />启动
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setLogOpen(true);
                  refreshLog();
                }}
                disabled={!defaultVersion}
              >
                <FileText className="h-3 w-3 mr-1" />日志
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader className="pr-10">
            <DialogTitle>{title} 日志</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearLog}
              disabled={isClearingLog || !defaultVersion}
            >
              <Trash2 className="h-3 w-3 mr-1" />清空
            </Button>
          </div>
          <div className="max-h-[60vh] space-y-3 overflow-auto pr-1">
            {isLogLoading ? (
              <div className="rounded-md border bg-muted p-3 text-xs text-muted-foreground">加载中...</div>
            ) : serviceLog?.length ? (
              serviceLog.map((section) => (
                <section key={section.path} className="overflow-hidden rounded-md border">
                  <div className="flex items-center justify-between gap-3 border-b bg-muted/60 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{section.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{section.path}</div>
                    </div>
                    <Badge variant={section.exists ? 'outline' : 'secondary'} className="shrink-0 text-[11px]">
                      {section.exists ? '存在' : '缺失'}
                    </Badge>
                  </div>
                  <pre className="max-h-56 overflow-auto bg-background p-3 text-xs whitespace-pre-wrap">
                    {section.content || '暂无日志'}
                  </pre>
                </section>
              ))
            ) : (
              <div className="rounded-md border bg-muted p-3 text-xs text-muted-foreground">暂无日志</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function Dashboard() {
  const [startAllError, setStartAllError] = useState('');
  const { isLoading, mutate } = useAllServices();
  const { mutate: startAll, isLoading: isStartingAll } = useStartAllServices();
  const { mutate: stopAll, isLoading: isStoppingAll } = useStopAllServices();

  // Listen for health check events from backend
  useEffect(() => {
    const setup = async () => {
      const unlisten = await listen<{ id: string; status: string }>('envora://service-status', () => {
        mutate();
      });
      return unlisten;
    };
    let unlisten: (() => void) | undefined;
    setup().then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [mutate]);

  // Auto-refresh service list every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => mutate(), 5000);
    return () => clearInterval(interval);
  }, [mutate]);

  const handleStartAll = async () => {
    setStartAllError('');
    const results = await startAll({});
    const errors = results
      .filter((service) => service.status === 'error' && service.error)
      .map((service) => `${service.name}: ${service.error}`);
    if (errors.length > 0) {
      setStartAllError(errors.join('\n\n'));
    }
    mutate();
  };

  const handleStopAll = async () => {
    setStartAllError('');
    await stopAll({});
    mutate();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">仪表盘</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleStartAll} disabled={isStartingAll}>
            <Power className="h-4 w-4 mr-2" />全部启动
          </Button>
          <Button variant="outline" size="sm" onClick={handleStopAll} disabled={isStoppingAll}>
            <PowerOff className="h-4 w-4 mr-2" />全部停止
          </Button>
        </div>
      </div>

      {startAllError && (
        <pre className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 whitespace-pre-wrap">
          {startAllError}
        </pre>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ServiceCard serviceType="php-fpm" title="PHP-FPM" />
        <ServiceCard serviceType="nginx" title="Nginx" />
        <ServiceCard serviceType="mysql" title="MySQL" />
      </div>
    </div>
  );
}
