import { Navigate, Outlet, useSearchParams } from 'react-router';
import { useAuthStore } from '@/shared/stores/auth.store';
import { safeRedirect } from '../lib/safeRedirect';

/** Layout route: sign-in pages are skipped when there is a session. Owns the post-sign-in redirect. */
export function PublicOnly() {
  const token = useAuthStore((s) => s.token);
  const [searchParams] = useSearchParams();

  return token ? <Navigate to={safeRedirect(searchParams.get('redirect'))} replace /> : <Outlet />;
}
