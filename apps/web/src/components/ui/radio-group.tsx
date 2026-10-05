"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
}

const RadioGroupContext = React.createContext<{ value?: string; onValueChange?: (v: string) => void; disabled?: boolean }>({});

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, value, onValueChange, disabled, ...props }, ref) => {
    return (
      <RadioGroupContext.Provider value={{ value, onValueChange, disabled }}>
        <div
          className={cn("grid gap-2", className)}
          {...props}
          ref={ref}
        />
      </RadioGroupContext.Provider>
    )
  }
)
RadioGroup.displayName = "RadioGroup"

interface RadioGroupItemProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value"> {
  value: string
}

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, value, id, ...props }, ref) => {
    const ctx = React.useContext(RadioGroupContext);
    return (
      <input
        ref={ref}
        type="radio"
        id={id}
        value={value}
        checked={ctx.value === value}
        disabled={ctx.disabled || props.disabled}
        onChange={() => ctx.onValueChange?.(value)}
        className={cn(
          "aspect-square h-4 w-4 rounded-full border border-input accent-primary transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    )
  }
)
RadioGroupItem.displayName = "RadioGroupItem"

export { RadioGroup, RadioGroupItem }
