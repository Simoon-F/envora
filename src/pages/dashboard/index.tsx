import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAllServices, useStartAllServices, useStopAllServices } from '@/hooks/use-services';
import { listen } from '@tauri-apps/api/event';
import { Loader2, Power, PowerOff } from 'lucide-react';
import { ServiceCard } from './components/service-card';
import { useTranslation } from '@/i18n/use-translation';

export const Dashboard = () => {
  const [startAllError, setStartAllError] = useState('');
  const { t } = useTranslation();
  const { isLoading, mutate } = useAllServices();
  const { mutate: startAll, isLoading: isStartingAll } = useStartAllServices();
  const { mutate: stopAll, isLoading: isStoppingAll } = useStopAllServices();

  useEffect(() => {
    const setup = async () => {
      const unlisten = await listen<{ id: string; status: string }>('envora://service-status', () => {
        mutate();
      });
      return unlisten;
    };
    let unlisten: (() => void) | undefined;
    setup().then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [mutate]);

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
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('Dashboard', 'Dashboard')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleStartAll} disabled={isStartingAll}>
            <Power className="mr-2 h-4 w-4" />
            {t('Dashboard', 'StartAll')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleStopAll} disabled={isStoppingAll}>
            <PowerOff className="mr-2 h-4 w-4" />
            {t('Dashboard', 'StopAll')}
          </Button>
        </div>
      </div>

      {startAllError && (
        <pre className="whitespace-pre-wrap rounded-md border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600">
          {startAllError}
        </pre>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ServiceCard serviceType="php-fpm" title="PHP-FPM" />
        <ServiceCard serviceType="nginx" title="Nginx" />
        <ServiceCard serviceType="mysql" title="MySQL" />
      </div>
    </div>
  );
};
