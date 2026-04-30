import { TextareaHTMLAttributes } from "react";
import { UseFormRegisterReturn, FieldError } from "react-hook-form";
import { FormField } from "./form-field";

interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  registration: UseFormRegisterReturn;
  error?: FieldError;
  helperText?: string;
  required?: boolean;
  showCharCount?: boolean;
}

export function FormTextarea({
  label,
  registration,
  error,
  helperText,
  required,
  showCharCount,
  maxLength,
  ...props
}: FormTextareaProps) {
  return (
    <FormField
      label={label}
      error={error?.message}
      required={required}
      helperText={helperText}
    >
      <div className="space-y-1">
        <textarea
          {...registration}
          {...props}
          maxLength={maxLength}
          className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        {showCharCount && maxLength && (
          <p className="text-xs text-muted-foreground text-right">
            0 / {maxLength}
          </p>
        )}
      </div>
    </FormField>
  );
}
