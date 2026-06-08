import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useThemeStore } from '@/stores/theme';
import { useTauriSwr } from '@/hooks/useSwr';
import { useTauriMutation } from '@/hooks/useMutation';
import type { AppSettings, Theme } from '@/types/settings';
import { Moon, Sun, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
];

export function Settings() {
  const { theme, setTheme } = useThemeStore();
  const { data: settings, isLoading } = useTauriSwr<AppSettings>('get_settings');
  const { mutate: updateSettings } = useTauriMutation('update_settings');

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    updateSettings({ theme: newTheme });
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">设置</h1>

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">外观</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Label>主题</Label>
            <div className="flex gap-2">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  variant={theme === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleThemeChange(value)}
                  className={cn(
                    'flex-1',
                    theme === value && 'ring-2 ring-primary'
                  )}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Paths */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">路径</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : settings ? (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">数据目录</Label>
                <p className="text-sm font-mono mt-1">{settings.data_dir}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">运行环境目录</Label>
                <p className="text-sm font-mono mt-1">{settings.runtime_dir}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">可执行文件目录</Label>
                <p className="text-sm font-mono mt-1">{settings.bin_dir}</p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">关于</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Envora v0.1.0</p>
            <p>统一的开发环境管理平台。</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
