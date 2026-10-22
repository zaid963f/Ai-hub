import { Navigate, Outlet, useLocation } from 'react-router';
import { paths } from '@/shared/config/paths';
import { useAuthStore } from '@/shared/stores/auth.store';

/** Layout route: renders private routes only when there is a session. */
export function RequireAuth() {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();

  if (!token) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`${paths.login}?redirect=${redirect}`} replace />;
  }
  return <Outlet />;
}
