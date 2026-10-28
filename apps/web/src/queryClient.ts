import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './api/client';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Erro 4xx (sem acesso, não existe) não melhora tentando de novo.
        retry: (failureCount, error) =>
          !(error instanceof ApiRequestError && error.status < 500) && failureCount < 2,
        refetchOnWindowFocus: false,
      },
    },
  });
}
