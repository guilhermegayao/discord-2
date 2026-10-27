import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiRequestError } from '../api/client';

/**
 * Leva os erros da API para o formulário: erros por campo (ex.: "E-mail já
 * cadastrado") aparecem embaixo do input; o resto vira um erro geral.
 */
export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
): void {
  if (err instanceof ApiRequestError) {
    const fields = Object.entries(err.body.fieldErrors ?? {});
    for (const [field, messages] of fields) {
      setError(field as Path<T>, { message: messages[0] });
    }
    if (fields.length === 0) setError('root.server', { message: err.message });
    return;
  }
  setError('root.server', { message: 'Não foi possível falar com o servidor. Tente de novo.' });
}
