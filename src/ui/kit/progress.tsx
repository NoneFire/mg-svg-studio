import * as React from 'react'
import { Progress as ProgressPrimitive } from 'radix-ui'
import { cn } from './utils'

/** Shared Radix progress, using the existing shadcn bridge and theme tokens. */
export const Progress = React.forwardRef<React.ElementRef<typeof ProgressPrimitive.Root>, React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>>(function Progress({ className, value, max = 100, ...props }, ref) {
  const limit = Number.isFinite(max) && max > 0 ? max : 100
  const bounded = value == null || !Number.isFinite(value) ? null : Math.max(0, Math.min(value, limit))
  return <ProgressPrimitive.Root ref={ref} value={bounded} max={limit} className={cn('tita-progress relative h-1.5 w-full overflow-hidden rounded-full bg-tita-surface-muted', className)} {...props}>
    <ProgressPrimitive.Indicator className="h-full bg-tita-primary transition-transform duration-200 motion-reduce:transition-none" style={{ width: '100%', transform: `translateX(-${bounded == null ? 100 : 100 - bounded / limit * 100}%)` }} />
  </ProgressPrimitive.Root>
})
