import { messageContentSchema } from '@discord-2/shared';
import { type KeyboardEvent, useRef, useState } from 'react';
import { getSocket } from '../realtime/socket';
import { useSendMessage } from './hooks';
import { TypingIndicator } from './TypingIndicator';

const MAX = 2000;
/** Reenvia o "estou digitando" no máximo a cada 3 s enquanto a pessoa digita. */
const TYPING_EVERY_MS = 3000;

interface Props {
  channelId: string;
  /** "#geral" ou "@ana": usado no placeholder e no rótulo acessível. */
  label: string;
}

/** Caixa de texto: Enter envia, Shift+Enter quebra linha. */
export function Composer({ channelId, label }: Props) {
  const [text, setText] = useState('');
  const send = useSendMessage(channelId);
  const lastTypingSent = useRef(0);

  const submit = () => {
    const parsed = messageContentSchema.safeParse(text);
    if (!parsed.success) return;
    send.mutate({ content: parsed.data, nonce: crypto.randomUUID() });
    setText('');
    lastTypingSent.current = 0;
  };

  const onChange = (value: string) => {
    setText(value);
    const now = Date.now();
    if (value.trim() && now - lastTypingSent.current > TYPING_EVERY_MS) {
      lastTypingSent.current = now;
      getSocket().emit('typing:start', { channelId });
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing: não envia no meio de uma composição de acento/IME
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const remaining = MAX - text.length;

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        aria-label={`Mensagem para ${label}`}
        placeholder={`Conversar em ${label}`}
        value={text}
        maxLength={MAX}
        rows={1}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {remaining <= 200 && (
        <span className={`composer__counter${remaining <= 0 ? ' composer__counter--full' : ''}`}>
          {remaining}
        </span>
      )}
      <TypingIndicator channelId={channelId} />
    </form>
  );
}
