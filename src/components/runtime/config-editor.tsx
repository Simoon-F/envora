import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import { useTranslation } from '@/i18n/use-translation';
import { tauriInvoke } from '@/lib/tauri';

interface ConfigEditorProps {
  /** Runtime version to scope the config file. */
  version: string;
  /** Tauri command to load config content. */
  loadCommand: string;
  /** Tauri command to save config content. */
  saveCommand: string;
  /** Optional extra action rendered alongside Save (e.g. Reload). */
  extraActions?: React.ReactNode;
}

export const ConfigEditor = ({
  version,
  loadCommand,
  saveCommand,
  extraActions,
}: ConfigEditorProps) => {
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const text = await tauriInvoke<string>(loadCommand, { version });
      setContent(text);
      setOriginal(text);
    } catch (e) {
      setContent(`; ${String(e)}`);
      setOriginal('');
    } finally {
      setLoading(false);
    }
  }, [version, loadCommand]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (content == null) return;
    setSaving(true);
    setMessage('');
    setIsError(false);
    try {
      await tauriInvoke(saveCommand, { version, content });
      setOriginal(content);
      setMessage(t('Common', 'Saved'));
      setTimeout(() => setMessage(''), 2000);
    } catch (e) {
      setIsError(true);
      setMessage(t('Common', 'ErrorPrefix', { message: String(e) }));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const dirty = content !== original && !message;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm">
          {message && (
            <span className={isError ? 'text-danger' : 'text-success'}>{message}</span>
          )}
          {dirty && <span className="text-warning">{t('Common', 'Unsaved')}</span>}
        </span>
        <div className="flex gap-2">
          {extraActions}
          <Button
            size="sm"
            onClick={save}
            disabled={saving || content === original}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {t('Common', 'Save')}
          </Button>
        </div>
      </div>
      <textarea
        className="h-80 w-full resize-y rounded-lg border border-border bg-code-bg p-3 font-mono text-xs leading-relaxed text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        value={content ?? ''}
        onChange={(e) => setContent(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
};
