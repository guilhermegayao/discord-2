const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "Hoje às 14:05" para mensagens de hoje; data completa para as outras. */
export function formatTimestamp(iso: string, now = new Date()): string {
  const date = new Date(iso);
  return date.toDateString() === now.toDateString()
    ? `Hoje às ${timeFormat.format(date)}`
    : dateTimeFormat.format(date);
}

/**
 * Iniciais para o "ícone" de servidor/avatar: "Os Amigos" → "OA".
 * Usa a primeira letra ou número de cada palavra, ignorando pontuação:
 * "Ana (teste)" → "AT", e não "A(".
 */
export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}
