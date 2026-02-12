import * as React from "react"

import { cn } from "@/lib/utils"

function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "border-input bg-background text-foreground flex h-9 w-full items-center rounded-md border px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "appearance-none bg-no-repeat",
        "[background-image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22/%3E%3C/svg%3E')]",
        "bg-[length:1rem] bg-[position:right_0.5rem_center] pr-8",
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}

function SelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return <option className={cn(className)} {...props} />
}

function SelectGroup({
  className,
  ...props
}: React.ComponentProps<"optgroup">) {
  return <optgroup className={cn(className)} {...props} />
}

export { NativeSelect, SelectOption, SelectGroup }
