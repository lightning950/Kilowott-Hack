import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded border bg-surface px-2.5 text-sm text-fg placeholder:text-faint transition-colors hover:border-border-strong focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:bg-subtle disabled:text-muted";
const controlState = (error?: string) => (error ? "border-bad/60 focus:border-bad focus:ring-bad/15" : "border-border");

interface FieldProps {
  label?: string;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  aside?: ReactNode;
}

/** Label + control + hint/error, wired for screen readers. */
export const Field = ({ label, hint, error, className, children, aside }: FieldProps) => {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {(label || aside) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && (
            <label htmlFor={id} className="text-xs font-medium text-fg">
              {label}
            </label>
          )}
          {aside}
        </div>
      )}
      {children(id, error || hint ? msgId : undefined)}
      {error ? (
        <p id={msgId} className="text-xs text-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
};

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  error?: string;
  prefix?: ReactNode;
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ error, prefix, mono, className, ...rest }, ref) => (
  <div className="relative flex items-center">
    {prefix && <span className="pointer-events-none absolute left-2.5 text-sm text-muted">{prefix}</span>}
    <input
      ref={ref}
      aria-invalid={!!error || undefined}
      className={cn(control, controlState(error), "h-8", prefix && "pl-7", mono && "font-mono num", className)}
      {...rest}
    />
  </div>
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }>(
  ({ error, className, ...rest }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={!!error || undefined}
      className={cn(control, controlState(error), "min-h-[84px] resize-y py-2 leading-relaxed", className)}
      {...rest}
    />
  ),
);
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { error?: string }>(
  ({ error, className, children, ...rest }, ref) => (
    <select
      ref={ref}
      aria-invalid={!!error || undefined}
      className={cn(
        control,
        controlState(error),
        "h-8 cursor-pointer appearance-none bg-[length:16px] bg-[right_6px_center] bg-no-repeat pr-7",
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2378716C%22 stroke-width=%222%22><path d=%22m7 10 5 5 5-5%22/></svg>')]",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...rest }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn("h-3.5 w-3.5 cursor-pointer rounded-[3px] border-border-strong accent-[rgb(var(--accent))]", className)}
    {...rest}
  />
));
Checkbox.displayName = "Checkbox";
