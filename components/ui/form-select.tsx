import { SelectHTMLAttributes } from "react";
import { UseFormRegisterReturn, FieldError } from "react-hook-form";
import { FormField } from "./form-field";

interface FormSelectOption {
  value: string;
  label: string;
}

interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  registration: UseFormRegisterReturn;
  options: FormSelectOption[];
  error?: FieldError;
  helperText?: string;
  required?: boolean;
  placeholder?: string;
}

export function FormSelect({
  label,
  registration,
  options,
  error,
  helperText,
  required,
  placeholder,
  ...props
}: FormSelectProps) {
  return (
    <FormField
      label={label}
      error={error?.message}
      required={required}
      helperText={helperText}
    >
      <select
        {...registration}
        {...props}
        className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}
