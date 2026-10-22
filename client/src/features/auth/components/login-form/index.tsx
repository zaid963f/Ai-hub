import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useLocation } from 'react-router';
import { getErrorMessage, getErrorStatus, getFieldErrors } from '@/shared/api/errors';
import { PasswordField } from '../PasswordField';
import { LoginFormSchema, type LoginFormValues } from './config';
import { useLogin } from '../../hooks/useLogin';

const formFields = [ 'email', 'password'] as const;
const isFormField = (key: string): key is (typeof formFields)[number] =>
  (formFields as readonly string[]).includes(key);

export function LoginForm() {
  const loginMutation = useLogin();
  // Set by RegisterForm after a successful sign-up
  const registeredEmail = (useLocation().state as { registeredEmail?: string } | null)?.registeredEmail;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(LoginFormSchema),
    mode: 'onTouched',
    defaultValues: { email: registeredEmail ?? '' },
  });

  const onSubmit = handleSubmit(({  email, password }) => {
    loginMutation.mutate(
      { email, password },
      {
        onError: (err) => {
          const status = getErrorStatus(err);
          if (status === 409) {
            setError('email', { message: 'An account with this email already exists' });
          } else if (status === 400) {
            for (const [field, message] of Object.entries(getFieldErrors(err))) {
              if (isFormField(field)) setError(field, { message });
            }
          }
        },
      },
    );
  });

  // 409/400 land on the fields; anything else (network, 500…) gets a banner
  const status = getErrorStatus(loginMutation.error);
  const showAlert = loginMutation.isError && status !== 409 && status !== 400;
  const isPending = loginMutation.isPending;

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={onSubmit}>
      {registeredEmail && !loginMutation.isError && (
        <Alert severity="success">Account created. Sign in to continue.</Alert>
      )}
      {showAlert && <Alert severity="error">{getErrorMessage(loginMutation.error)}</Alert>}

      <TextField
        {...register('email')}
        label="Email"
        type="email"
        autoComplete="email"
        autoFocus={!registeredEmail}
        fullWidth
        error={Boolean(errors.email)}
        helperText={errors.email?.message}
      />
      <PasswordField
        {...register('password')}
        label="Password"
        autoComplete="current-password"
        autoFocus={Boolean(registeredEmail)}
        fullWidth
        error={Boolean(errors.password)}
        helperText={errors.password?.message}
      />
      
      <Button
        type="submit"
        variant="contained"
        size="large"
        fullWidth
        disabled={isPending}
        startIcon={isPending ? <CircularProgress size={20} color="inherit" /> : undefined}
      >
        Sign in
      </Button>
    </Stack>
  );
}
