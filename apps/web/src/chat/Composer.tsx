import { type ChannelDto, messageContentSchema } from '@discord-2/shared';
import { type KeyboardEvent, useState } from 'react';
import { useSendMessage } from './hooks';

const MAX = 2000;

/** Caixa de texto: Enter envia, Shift+Enter quebra linha. */
export function Composer({ channel }: { channel: ChannelDto }) {
  const [text, setText] = useState('');
  const send = useSendMessage(channel.id);

  const submit = () => {
    const parsed = messageContentSchema.safeParse(text);
    if (!parsed.success) return;
    send.mutate({ content: parsed.data, nonce: crypto.randomUUID() });
    setText('');
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
        aria-label={`Mensagem para #${channel.name}`}
        placeholder={`Conversar em #${channel.name}`}
        value={text}
        maxLength={MAX}
        rows={1}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {remaining <= 200 && (
        <span className={`composer__counter${remaining <= 0 ? ' composer__counter--full' : ''}`}>
          {remaining}
        </span>
      )}
    </form>
  );
}
