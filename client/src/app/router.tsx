import { createBrowserRouter } from 'react-router';
import { providersRoutes } from '@/features/app-keys-config';
import { authRoutes, PublicOnly, RequireAuth, SessionGate, UserMenu } from '@/features/auth';
import { chatRoutes, RecentChats } from '@/features/chat';
import { compareRoutes } from '@/features/compare';
import { homeRoutes } from '@/features/home';
import { settingsRoutes } from '@/features/settings';
import { AppShell } from '@/shared/layout';
import { NotFoundPage } from './components/NotFoundPage';
import { RootLayout } from './components/RootLayout';
import { RouteError } from './components/RouteError';
import { navItems } from './navigation';

// Each feature owns its routes; the app only decides where they mount.
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      // Full-screen pages, no shell; signed-in users are sent on
      { element: <PublicOnly />, children: [...authRoutes] },

      // Everything else needs a validated session and lives inside the sidebar shell.
      // The guards wrap AppShell so no private query fires before the session is checked.
      {
        element: <RequireAuth />,
        children: [
          {
            element: <SessionGate />,
            children: [
              {
                element: <AppShell navItems={navItems} content={<RecentChats />} footer={<UserMenu />} />,
                errorElement: <RouteError />,
                children: [...homeRoutes, ...chatRoutes, ...compareRoutes, ...providersRoutes, ...settingsRoutes],
              },
            ],
          },
        ],
      },

      // No guard: the 404 page works with or without a session
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
