import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

export type StepperStep = {
  id: string;
  label: string;
};

type StepperProps = {
  steps: StepperStep[];
  currentIndex: number;
  className?: string;
};

/**
 * Horizontal step indicator (numbered circles + labels).
 * currentIndex is 0-based; steps before current show a check.
 */
export function Stepper({ steps, currentIndex, className }: StepperProps) {
  return (
    <nav aria-label="Progress" className={cn('flex w-full items-start gap-1 sm:gap-2', className)}>
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={step.id} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-center gap-1">
              {i > 0 ? (
                <div
                  className={cn('bg-border h-px min-w-0 flex-1', done || active ? 'bg-primary' : '')}
                  aria-hidden
                />
              ) : (
                <div className="min-w-0 flex-1" aria-hidden />
              )}
              <div
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold',
                  done && 'border-primary bg-primary text-primary-foreground',
                  active && !done && 'border-primary text-primary',
                  !active && !done && 'border-muted-foreground/30 text-muted-foreground',
                )}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <Check className="size-4" aria-hidden /> : i + 1}
              </div>
              {i < steps.length - 1 ? (
                <div
                  className={cn('bg-border h-px min-w-0 flex-1', done ? 'bg-primary' : '')}
                  aria-hidden
                />
              ) : (
                <div className="min-w-0 flex-1" aria-hidden />
              )}
            </div>
            <span
              className={cn(
                'text-center text-[10px] font-medium leading-tight sm:text-xs',
                active ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </nav>
  );
}
