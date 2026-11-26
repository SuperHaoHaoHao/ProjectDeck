import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium leading-5',
  {
    variants: {
      variant: {
        default: 'border-zinc-700/70 bg-zinc-800/60 text-zinc-300',
        mono: 'border-zinc-800 bg-zinc-900/80 text-zinc-400 font-mono',
        accent: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        blue: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
        amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        violet: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
