import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, Square, RotateCw, Loader2 } from 'lucide-react';
import { useAllServices, useStartService, useStopService } from '@/hooks/useServices';
import type { ServiceStatus } from '@/types/service';

const statusColors: Record<ServiceStatus, string> = {
  running: 'bg-green-500',
  stopped: 'bg-red-500',
  error: 'bg-red-500',
  starting: 'bg-yellow-500',
  stopping: 'bg-yellow-500',
  unknown: 'bg-gray-500',
};

const statusLabels: Record<ServiceStatus, string> = {
  running: 'Running',
  stopped: 'Stopped',
  error: 'Error',
  starting: 'Starting...',
  stopping: 'Stopping...',
  unknown: 'Unknown',
};

export function Dashboard() {
  const { data: services, isLoading, mutate } = useAllServices();
  const { mutate: startService, isLoading: isStarting } = useStartService();
  const { mutate: stopService, isLoading: isStopping } = useStopService();

  const handleStart = async (serviceType: string) => {
    // TODO: Get default version for this service
    await startService({ service_type: serviceType, version: '8.4.1' });
    mutate();
  };

  const handleStop = async (serviceId: string) => {
    await stopService({ service_id: serviceId });
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
          <Button variant="outline" size="sm">
            <Play className="h-4 w-4 mr-2" />
            Start All
          </Button>
          <Button variant="outline" size="sm">
            <Square className="h-4 w-4 mr-2" />
            Stop All
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Service cards */}
        {['nginx', 'mysql', 'php-fpm'].map((serviceType) => {
          const service = services?.find((s) => s.id.startsWith(serviceType));
          const status = service?.status ?? 'stopped';

          return (
            <Card key={serviceType}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium capitalize">
                  {serviceType === 'php-fpm' ? 'PHP-FPM' : serviceType.toUpperCase()}
                </CardTitle>
                <Badge variant={status === 'running' ? 'default' : 'secondary'}>
                  <span className={`h-2 w-2 rounded-full mr-2 ${statusColors[status]}`} />
                  {statusLabels[status]}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    {service?.pid ? `PID: ${service.pid}` : 'Not running'}
                    {service?.port ? ` • Port: ${service.port}` : ''}
                  </div>
                  <div className="flex gap-2">
                    {status === 'running' ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => service && handleStop(service.id)}
                          disabled={isStopping}
                        >
                          <Square className="h-3 w-3 mr-1" />
                          Stop
                        </Button>
                        <Button variant="outline" size="sm">
                          <RotateCw className="h-3 w-3 mr-1" />
                          Restart
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleStart(serviceType)}
                        disabled={isStarting}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Start
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
