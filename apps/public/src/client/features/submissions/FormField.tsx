import type { ReactNode } from 'react';

type FormFieldProps = {
  children: ReactNode;
  error?: string;
  help?: ReactNode;
  id: string;
  label: string;
  optional?: boolean;
  required?: boolean;
};

export function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <span className="field-error" id={id}>
      {message}
    </span>
  ) : null;
}

export function FormField({
  children,
  error,
  help,
  id,
  label,
  optional = false,
  required = false,
}: FormFieldProps) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="form-field">
      <label htmlFor={id}>
        <span>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
          {optional ? <span className="optional-label"> (optional)</span> : null}
        </span>
      </label>
      {children}
      {help ? (
        <span className="field-help" id={helpId}>
          {help}
        </span>
      ) : null}
      <FieldError id={errorId ?? `${id}-error`} message={error} />
    </div>
  );
}
