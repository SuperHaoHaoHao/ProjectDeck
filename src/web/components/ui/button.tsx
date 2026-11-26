import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40',
  {
    variants: {
      variant: {
        default: 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400',
        secondary: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
        ghost: 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100',
        outline: 'border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3 text-xs',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
