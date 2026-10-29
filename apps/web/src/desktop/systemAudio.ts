import workletUrl from './systemAudioWorklet.ts?worker&url';

/** O som do PC como faixa de áudio pronta para publicar. */
export interface SystemAudio {
  track: MediaStreamTrack;
  /** Para de tocar e fecha o canal (o app desliga a captura). */
  close(): void;
}

/**
 * Transforma o canal de áudio que o app desktop mandou numa faixa:
 * canal → AudioWorklet → MediaStreamDestination. Nada vai para os alto-
 * falantes (quem transmite não precisa ouvir de novo o próprio PC).
 */
export async function createSystemAudio(port: MessagePort): Promise<SystemAudio> {
  const context = new AudioContext({ sampleRate: 48_000, latencyHint: 'interactive' });
  try {
    await context.audioWorklet.addModule(workletUrl);
    const node = new AudioWorkletNode(context, 'system-audio', {
      numberOfInputs: 0,
      outputChannelCount: [2],
    });
    const destination = context.createMediaStreamDestination();
    node.connect(destination);
    node.port.postMessage(null, [port]);
    await context.resume();

    const [track] = destination.stream.getAudioTracks();
    if (!track) throw new Error('sem faixa de áudio');
    return {
      track,
      close() {
        node.port.postMessage('close');
        node.disconnect();
        track.stop();
        void context.close();
      },
    };
  } catch (err) {
    port.close();
    void context.close();
    throw err;
  }
}
