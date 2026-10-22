import { paths } from '@/shared/config/paths';

const authPaths: string[] = [paths.login, paths.register];

/** Only same-origin, non-auth paths are allowed as a post-sign-in target. Anything else goes to the dashboard. */
export function safeRedirect(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return paths.dashboard;
  }
  const pathname = value.split(/[?#]/)[0];
  return authPaths.includes(pathname) ? paths.dashboard : value;
}
