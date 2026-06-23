import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Terminal className="h-4 w-4" />
          {t('Settings', 'ShellEnvironment')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={shellEnv?.is_installed ? 'default' : 'secondary'}>
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
            <p className="mt-1 break-all font-mono text-sm">{shellEnv?.bin_dir ?? binDir ?? '-'}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t('Settings', 'EnvironmentScript')}</Label>
            <p className="mt-1 break-all font-mono text-sm">{shellEnv?.env_script ?? '-'}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t('Settings', 'ShellProfile')}</Label>
            <p className="mt-1 break-all font-mono text-sm">{shellEnv?.shell_profile ?? '-'}</p>
          </div>

          <Button size="sm" onClick={onInstall} disabled={isInstalling}>
            {isInstalling ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
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
