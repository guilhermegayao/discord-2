import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { GuestOnly, RequireAuth } from './auth/RouteGuards';
import { ChatView } from './chat/ChatView';
import { GuildIndex, GuildLayout } from './chat/GuildLayout';
import { AppLayout } from './layout/AppLayout';
import { ChannelsHome } from './pages/ChannelsHome';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { createQueryClient } from './queryClient';

/** O Router fica fora (main.tsx), para os testes poderem usar um MemoryRouter. */
export function App({ queryClient }: { queryClient?: QueryClient }) {
  const [client] = useState(() => queryClient ?? createQueryClient());

  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route path="/channels" element={<ChannelsHome />} />
              <Route path="/channels/:guildId" element={<GuildLayout />}>
                <Route index element={<GuildIndex />} />
                <Route path=":channelId" element={<ChatView />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/channels" replace />} />
        </Routes>
      </AuthProvider>
    </QueryClientProvider>
  );
}
