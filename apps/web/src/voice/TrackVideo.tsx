import type { Track } from 'livekit-client';
import { useEffect, useRef } from 'react';

interface Props {
  track: Track;
  className?: string;
  label: string;
}

/**
 * Mostra a imagem de uma faixa de vídeo do LiveKit. O SDK liga a faixa ao
 * <video> (attach) e desliga quando o componente sai (detach).
 */
export function TrackVideo({ track, className, label }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  // muted: o áudio da tela toca pelo caminho de áudio (que respeita o ensurdecer).
  return <video ref={ref} className={className} aria-label={label} autoPlay playsInline muted />;
}
