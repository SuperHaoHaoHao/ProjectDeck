import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ActionTone = 'start' | 'stop' | 'restart' | 'log' | 'install';
export type ActionSize = 'sm' | 'xs';

const TONES: Record<ActionTone, string> = {
  start: 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10',
  stop: 'border-red-500/30 text-red-300 hover:bg-red-500/10',
  restart: 'border-sky-500/30 text-sky-300 hover:bg-sky-500/10',
  log: 'border-violet-500/30 text-violet-300 hover:bg-violet-500/10',
  install: 'border-amber-500/30 text-amber-300 hover:bg-amber-500/10',
};

const SIZES: Record<ActionSize, string> = {
  sm: 'h-7 gap-1 px-2 text-[10px]',
  xs: 'h-6 gap-1 px-1.5 text-[10px]',
};

/** 列表、仪表盘卡片、详情页共用同一个操作按钮，颜色和尺寸都从这里来 */
export function ActionButton({
  tone,
  icon,
  label,
  title,
  disabled,
  onClick,
  size = 'sm',
  className,
}: {
  tone: ActionTone;
  icon: ReactNode;
  label?: string;
  title?: string;
  disabled?: boolean;
  onClick: () => void;
  size?: ActionSize;
  className?: string;
}) {
  const text = title ?? label;
  return (
    <button
      type="button"
      title={text}
      aria-label={text}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'inline-flex items-center justify-center rounded-md border font-mono transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        SIZES[size],
        TONES[tone],
        className,
      )}
    >
      {icon}
      {label ? <span>{label}</span> : null}
    </button>
  );
}
