import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, Square, RotateCw, Loader2, PowerOff, Power } from 'lucide-react';
import { useAllServices, useStartService, useStopService, useRestartService, useStartAllServices, useStopAllServices } from '@/hooks/useServices';
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
  running: 'Running', stopped: 'Stopped', error: 'Error',
  starting: 'Starting...', stopping: 'Stopping...', unknown: 'Unknown',
};

function ServiceCard({ serviceType, title }: { serviceType: string; title: string }) {
  const { data: services, mutate } = useAllServices();
  const { data: defaultVersion } = useDefaultVersion(runtimeName[serviceType]);
  const { mutate: startService, isLoading: isStarting } = useStartService();
  const { mutate: stopService, isLoading: isStopping } = useStopService();
  const { mutate: restartService, isLoading: isRestarting } = useRestartService();

  const service = services?.find((s) => s.id.startsWith(serviceType));
  const status = service?.status ?? 'stopped';

  const handleStart = async () => {
    if (!defaultVersion) return;
    await startService({ serviceType, version: defaultVersion });
    mutate();
  };

  const handleStop = async () => {
    if (!service) return;
    await stopService({ serviceId: service.id });
    mutate();
  };

  const handleRestart = async () => {
    if (!service) return;
    await restartService({ serviceId: service.id });
    mutate();
  };

  return (
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
            {service?.pid ? `PID: ${service.pid}` : 'Not running'}
            {service?.port ? ` • Port: ${service.port}` : ''}
          </div>
          <div className="flex gap-2">
            {status === 'running' ? (
              <>
                <Button variant="outline" size="sm" onClick={handleStop} disabled={isStopping}>
                  <Square className="h-3 w-3 mr-1" />Stop
                </Button>
                <Button variant="outline" size="sm" onClick={handleRestart} disabled={isRestarting}>
                  <RotateCw className="h-3 w-3 mr-1" />Restart
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={handleStart} disabled={isStarting || !defaultVersion}>
                <Play className="h-3 w-3 mr-1" />Start
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
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
    await startAll({});
    mutate();
  };

  const handleStopAll = async () => {
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
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleStartAll} disabled={isStartingAll}>
            <Power className="h-4 w-4 mr-2" />Start All
          </Button>
          <Button variant="outline" size="sm" onClick={handleStopAll} disabled={isStoppingAll}>
            <PowerOff className="h-4 w-4 mr-2" />Stop All
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ServiceCard serviceType="php-fpm" title="PHP-FPM" />
        <ServiceCard serviceType="nginx" title="Nginx" />
        <ServiceCard serviceType="mysql" title="MySQL" />
      </div>
    </div>
  );
}
