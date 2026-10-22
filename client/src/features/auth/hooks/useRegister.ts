import { useMutation } from '@tanstack/react-query';
import { register } from '../api/auth';

/** Creates the account only; the user signs in afterwards on the login page. */
export function useRegister() {
  return useMutation({
    mutationFn: register,
  });
}
