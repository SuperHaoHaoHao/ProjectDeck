import Convert from 'ansi-to-html';
import { ArrowDownToLine, Circle, Eraser } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchLogs, logStreamUrl } from '@/api';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const converter = new Convert({ fg: '#d4d4d4', bg: '#0a0a0a', newline: true, escapeXML: true });
const MAX_CHARS = 400_000;

export function Terminal({
  projectId,
  running,
  managed,
}: {
  projectId: string;
  running: boolean;
  managed?: boolean;
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [loading, setLoading] = useState(true);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setText('');
    setConnected(false);

    fetchLogs(projectId, 800)
      .then((result) => {
        if (alive) setText(result.lines);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });

    const source = new EventSource(logStreamUrl(projectId));
    source.onopen = () => {
      if (alive) setConnected(true);
    };
    source.onerror = () => {
      if (alive) setConnected(false);
    };
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { chunk?: string };
        if (!data.chunk) return;
        setText((prev) => (prev + data.chunk).slice(-MAX_CHARS));
      } catch {}
    };

    return () => {
      alive = false;
      source.close();
    };
  }, [projectId]);

  const html = useMemo(() => converter.toHtml(text), [text]);

  useEffect(() => {
    if (!autoScroll) return;
    const node = scrollerRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [html, autoScroll]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-[#08090a]">
      <div className="flex items-center gap-3 border-b border-zinc-800/80 bg-[#0c0d10] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        </div>
        <span className="font-mono text-[11px] text-zinc-500">projectdeck — logs</span>
        <span
          className={cn(
            'ml-2 flex items-center gap-1 font-mono text-[10px]',
            connected ? 'text-emerald-400' : 'text-zinc-600',
          )}
        >
          <Circle size={6} fill="currentColor" />
          {connected ? t('term.streaming') : t('term.disconnected')}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAutoScroll((value) => !value)}
            title={t('term.autoScroll')}
            className={cn(
              'flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] transition-colors',
              autoScroll
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
            )}
          >
            <ArrowDownToLine size={11} />
            {t('term.autoScroll')}
          </button>
          <button
            type="button"
            onClick={() => setText('')}
            title={t('term.clear')}
            className="flex h-7 items-center gap-1 rounded-md border border-zinc-800 px-2 text-[10px] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <Eraser size={11} />
            {t('term.clear')}
          </button>
        </div>
      </div>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-auto px-4 py-3">
        {loading ? (
          <div className="font-mono text-[12px] text-zinc-600">{t('term.loading')}</div>
        ) : text ? (
          <pre
            className="whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-zinc-300"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <div className="font-mono text-[12px] leading-5 text-zinc-600">
            {running && !managed ? (
              <span data-testid="adopted-hint" className="text-amber-400/80">
                {t('term.adopted')}
              </span>
            ) : (
              <span>{running ? t('term.waiting') : t('term.notRunning')}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
