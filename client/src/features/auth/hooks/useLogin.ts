import { useMutation } from '@tanstack/react-query';
import { queryClient } from '@/shared/api/queryClient';
import { queryKeys } from '@/shared/api/queryKeys';
import { useAuthStore } from '@/shared/stores/auth.store';
import { login } from '../api/auth';

export function useLogin() {
  return useMutation({
    mutationFn: login,
    onSuccess: ({ token, user }) => {
      // Seed the cache first so SessionGate doesn't show its loader again right after sign-in
      queryClient.setQueryData(queryKeys.me, user);
      useAuthStore.getState().setSession(token, user);
    },
  });
}
