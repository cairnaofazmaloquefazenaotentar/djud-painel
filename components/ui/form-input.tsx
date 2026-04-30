import { InputHTMLAttributes } from "react";
import { UseFormRegisterReturn, FieldError } from "react-hook-form";
import { FormField } from "./form-field";

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  registration: UseFormRegisterReturn;
  error?: FieldError;
  helperText?: string;
  required?: boolean;
}

export function FormInput({
  label,
  registration,
  error,
  helperText,
  required,
  ...props
}: FormInputProps) {
  return (
    <FormField
      label={label}
      error={error?.message}
      required={required}
      helperText={helperText}
    >
      <input
        {...registration}
        {...props}
        className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      />
    </FormField>
  );
}
