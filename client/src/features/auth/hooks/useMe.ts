import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/api/queryKeys';
import { useAuthStore } from '@/shared/stores/auth.store';
import { getMe } from '../api/auth';

/** Validates the persisted token and refreshes the stored user. */
export function useMe() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      const user = await getMe();
      // The user is part of the persisted session, so the store keeps a copy (CONVENTIONS §3 exception)
      useAuthStore.getState().setUser(user);
      return user;
    },
    enabled: !!token,
  });
}
