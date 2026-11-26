import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** 复制路径：列表页和详情页共用，点完给一个短暂的对勾反馈 */
export function CopyButton({
  value,
  className,
  label,
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const copy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const title = label ?? t('common.copyPath');
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={copy}
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300',
        className,
      )}
    >
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
    </button>
  );
}
