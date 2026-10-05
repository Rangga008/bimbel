"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "checked"> {
  checked?: boolean | 'indeterminate'
  onCheckedChange?: (checked: boolean | 'indeterminate') => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      checked={checked === 'indeterminate' ? false : checked}
      disabled={disabled}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      className={cn(
        "h-4 w-4 shrink-0 rounded-sm border border-input accent-primary transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
