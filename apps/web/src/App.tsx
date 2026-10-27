import { ServerStatus } from './components/ServerStatus';

export function App() {
  return (
    <main className="app">
      <h1>discord-2</h1>
      <p className="muted">Chat, voz e compartilhamento de tela entre amigos.</p>
      <ServerStatus />
    </main>
  );
}
