import { useLayoutEffect, useMemo, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { ChatMessage } from './cache';
import {
  useDeleteMessage,
  useDiscardMessage,
  useEditMessage,
  useMessages,
  useSendMessage,
} from './hooks';
import { MessageItem } from './MessageItem';

/** Mensagens seguidas do mesmo autor em até 5 min aparecem agrupadas. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;
/** Distância do topo/fundo (px) que conta como "encostado". */
const EDGE_PX = 80;

function startsGroup(prev: ChatMessage | undefined, current: ChatMessage): boolean {
  if (!prev || prev.author.id !== current.author.id) return true;
  return Date.parse(current.createdAt) - Date.parse(prev.createdAt) > GROUP_WINDOW_MS;
}

interface Props {
  channelId: string;
  /** "#geral" ou "@ana". */
  label: string;
  /** Texto do começo da conversa ("Boas-vindas a #geral!"). */
  welcome: string;
  /** Dono do servidor pode apagar qualquer mensagem (em DM, ninguém modera). */
  canModerate: boolean;
}

export function MessageList({ channelId, label, welcome, canModerate }: Props) {
  const { user } = useAuth();
  const query = useMessages(channelId);
  const edit = useEditMessage(channelId);
  const remove = useDeleteMessage(channelId);
  const send = useSendMessage(channelId);
  const discard = useDiscardMessage(channelId);

  const scrollRef = useRef<HTMLDivElement>(null);
  /** Altura/posição antes de carregar mensagens antigas (para não "pular" a tela). */
  const anchor = useRef<{ height: number; top: number } | null>(null);
  /** O usuário está no fim da conversa? Se sim, mensagem nova rola para baixo. */
  const atBottom = useRef(true);

  // A API devolve da mais nova para a mais antiga; a tela mostra ao contrário.
  const messages = useMemo(
    () => (query.data?.pages.flatMap((p) => p.messages) ?? []).toReversed(),
    [query.data],
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (anchor.current) {
      el.scrollTop = el.scrollHeight - anchor.current.height + anchor.current.top;
      anchor.current = null;
    } else if (atBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const loadOlder = () => {
    const el = scrollRef.current;
    if (!el || !query.hasNextPage || query.isFetchingNextPage) return;
    anchor.current = { height: el.scrollHeight, top: el.scrollTop };
    void query.fetchNextPage();
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < EDGE_PX;
    if (el.scrollTop < EDGE_PX) loadOlder();
  };

  if (query.isPending) {
    return <div className="messages" aria-busy="true" />;
  }
  if (query.isError) {
    return (
      <div className="messages messages--error" role="alert">
        Não foi possível carregar as mensagens.{' '}
        <button type="button" className="link-button" onClick={() => void query.refetch()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="messages" ref={scrollRef} onScroll={onScroll}>
      {query.hasNextPage ? (
        <button
          type="button"
          className="link-button messages__older"
          onClick={loadOlder}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? 'Carregando…' : 'Carregar mensagens anteriores'}
        </button>
      ) : (
        <div className="messages__start">
          <h2>{welcome}</h2>
          <p className="muted">Este é o começo do canal.</p>
        </div>
      )}

      <ol className="messages__list" aria-label={`Mensagens em ${label}`}>
        {messages.map((message, i) => {
          const mine = message.author.id === user?.id;
          return (
            <MessageItem
              key={message.id}
              message={message}
              showHeader={startsGroup(messages[i - 1], message)}
              canEdit={mine}
              canDelete={mine || canModerate}
              onEdit={(content) => edit.mutateAsync({ id: message.id, content })}
              onDelete={() => {
                if (window.confirm('Apagar esta mensagem?')) remove.mutate(message.id);
              }}
              onRetry={() => {
                discard(message.id);
                atBottom.current = true;
                send.mutate({ content: message.content, nonce: crypto.randomUUID() });
              }}
              onDiscard={() => discard(message.id)}
            />
          );
        })}
      </ol>
    </div>
  );
}
