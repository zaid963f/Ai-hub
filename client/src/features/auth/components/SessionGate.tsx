import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { Outlet } from 'react-router';
import { getErrorMessage, getErrorStatus } from '@/shared/api/errors';
import { LoadingScreen } from '@/shared/components/LoadingScreen';
import { useMe } from '../hooks/useMe';

/** Layout route: on app start, validates the stored token with GET /auth/me before any private page renders. */
export function SessionGate() {
  const { data, isPending, isError, error, refetch, isFetching } = useMe();

  // A 401 has already cleared the session (FND-4 interceptor). RequireAuth is about to redirect, so don't flash the error UI.
  if (isPending || (isError && getErrorStatus(error) === 401)) return <LoadingScreen />;

  // Only the first load is gated: a failed background refetch keeps the cached user on screen
  if (isError && !data) {
    // TODO(FND-5): replace with the shared ErrorState
    return (
      <Stack
        role="alert"
        spacing={2}
        sx={{ alignItems: 'center', justifyContent: 'center', height: '100dvh', px: 2, textAlign: 'center', bgcolor: 'background.default' }}
      >
        <Typography variant="h6" component="h1">
          Couldn't load your session
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {getErrorMessage(error)}
        </Typography>
        <Button
          variant="contained"
          disabled={isFetching}
          startIcon={isFetching ? <CircularProgress size={20} color="inherit" /> : <RefreshRoundedIcon />}
          onClick={() => void refetch()}
        >
          Retry
        </Button>
      </Stack>
    );
  }

  return <Outlet />;
}
