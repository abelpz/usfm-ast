/**
 * Thin tooltip wrapper. Wrap any element to add a tooltip with minimal boilerplate.
 *
 * @example
 * <Tip label="Add book">
 *   <Button size="icon"><Plus /></Button>
 * </Tip>
 */
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ReactNode } from 'react';

export function Tip({
  label,
  children,
  side = 'bottom',
}: {
  label: string;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
