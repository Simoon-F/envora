import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/i18n/use-translation';
import type { ShellEnvironmentStatus } from '@/types/settings';
import { CheckCircle2, Loader2, Terminal } from 'lucide-react';

interface ShellEnvironmentSettingsProps {
  binDir: string | undefined;
  shellEnv: ShellEnvironmentStatus | undefined;
  isInstalling: boolean;
  onInstall: () => void;
}

export const ShellEnvironmentSettings = ({
  binDir,
  shellEnv,
  isInstalling,
  onInstall,
}: ShellEnvironmentSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Card size="sm" className="card-subtle mt-4">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Terminal className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">{t('Settings', 'ShellEnvironment')}</h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant={shellEnv?.is_installed ? 'success' : 'secondary'}>
              {shellEnv?.is_installed ? t('Settings', 'Installed') : t('Settings', 'NotInstalled')}
            </Badge>
            <span className="text-xs text-muted-foreground">{t('Settings', 'TakesEffectInNewTerminal')}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={shellEnv?.profile_installed ? 'outline' : 'secondary'}>
              Profile {shellEnv?.profile_installed ? t('Settings', 'Installed') : t('Settings', 'NotInstalled')}
            </Badge>
            <Badge variant={shellEnv?.user_path_installed ? 'outline' : 'secondary'}>
              PATH {shellEnv?.user_path_installed ? t('Settings', 'Installed') : t('Settings', 'NotInstalled')}
            </Badge>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">{t('Settings', 'CommandDirectory')}</Label>
            <p className="mt-1 break-all rounded-md bg-code-bg px-2 py-1.5 font-mono text-xs">{shellEnv?.bin_dir ?? binDir ?? '-'}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t('Settings', 'EnvironmentScript')}</Label>
            <p className="mt-1 break-all rounded-md bg-code-bg px-2 py-1.5 font-mono text-xs">{shellEnv?.env_script ?? '-'}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t('Settings', 'ShellProfile')}</Label>
            <p className="mt-1 break-all rounded-md bg-code-bg px-2 py-1.5 font-mono text-xs">{shellEnv?.shell_profile ?? '-'}</p>
          </div>

          <Button size="sm" onClick={onInstall} disabled={isInstalling}>
            {isInstalling ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 size-4" />
            )}
            {shellEnv?.is_installed
              ? t('Settings', 'ReinstallShellEnvironment')
              : t('Settings', 'InstallShellEnvironment')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
