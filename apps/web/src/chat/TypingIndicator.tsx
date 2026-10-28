import { typingLabel } from './cache';
import { useTypingUsers } from './socialHooks';

/** "Ana está digitando…". O espaço fica reservado para a tela não pular. */
export function TypingIndicator({ channelId }: { channelId: string }) {
  const label = typingLabel(useTypingUsers(channelId));
  return (
    <p className="typing" aria-live="polite">
      {label}
    </p>
  );
}
