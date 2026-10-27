import { type InputHTMLAttributes, useId } from 'react';
import type { FieldError, UseFormRegisterReturn } from 'react-hook-form';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  registration: UseFormRegisterReturn;
  error?: FieldError;
};

/** Input com label e mensagem de erro ligados por id (acessível para leitores de tela). */
export function FormField({ label, registration, error, ...inputProps }: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
        {...registration}
      />
      {error && (
        <span id={errorId} className="field__error" role="alert">
          {error.message}
        </span>
      )}
    </div>
  );
}
