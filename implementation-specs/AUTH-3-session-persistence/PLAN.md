# AUTH-3 · Keep me signed in across reloads: implementation plan

> **Story:** [stories/AUTH-3-session-persistence.md](../../stories/AUTH-3-session-persistence.md) · **Spec:** [SPEC.md](./SPEC.md) · **Conventions:** [CONVENTIONS.md](../CONVENTIONS.md) · **Product spec:** [SPEC.md §2.1, §8 Phase 3](../../SPEC.md)
> **Estimate:** 2 pts · **Labels:** auth · **Depends on:** AUTH-6 (**not merged yet**, see §2 and R1)

This plan expands the implementation spec against the code as it is **today**. It records the decisions, the traps found in the existing session code, and the order of work, so the PR stays small and easy to review.

---

## 1. Acceptance criteria

| # | Criterion | How we prove it |
|---|---|---|
| AC1 | The token and user are persisted. | Sign in, reload. `ai-hub-auth` in localStorage holds `{ state: { token, user } }` and no actions. You stay signed in. |
| AC2 | On app start with a token, `GET /auth/me` runs behind a full-screen loader. | Throttle the network to "Slow 3G", reload a private page. `LoadingScreen` shows, exactly **one** `GET /api/auth/me` fires, and **no other** API request fires before it resolves. Then the page renders. |
| AC3 | A 401 from that call clears the session. | Set `token` in `ai-hub-auth` to garbage, reload. `ai-hub-auth` is cleared and you land on `/login?redirect=<path>`. The error UI never flashes. |
| AC4 | The user menu shows the real name, email and initials. | Signed in as `demo@aihub.dev`: the sidebar footer shows the seeded name, the email and its initials. Nothing says "Ada Lovelace" unless that's the real user. |

AC1 is already met by FND-4. This story only verifies it and doesn't touch the store.

---

## 2. Current state

| Area | File | What it does today |
|---|---|---|
| Session store | [auth.store.ts](../../client/src/shared/stores/auth.store.ts) | zustand `persist`, key `ai-hub-auth`, `partialize` to `{ token, user }`. Hydration is synchronous. `setUser` already exists. **AC1 is done.** |
| 401 handling | [client.ts](../../client/src/shared/api/client.ts) | Any 401 except `/auth/login` calls `clearSession()` and shows a deduplicated "Session expired" snackbar. `/auth/me` goes through this path. |
| Query defaults | [queryClient.ts](../../client/src/shared/api/queryClient.ts) | `staleTime: 30s`, no refetch on focus, retries only 5xx (twice). A 401 or a network error (no status) is **not** retried, so it fails fast. |
| Query key | [queryKeys.ts](../../client/src/shared/api/queryKeys.ts) | `queryKeys.me = ['me']` already exists. |
| Auth API | [auth.ts](../../client/src/features/auth/api/auth.ts) | `register`, `login`. No `getMe`. |
| Server | `server/src/routes/auth.routes.ts` | `GET /auth/me` → `{ user: User }`, guarded by `requireAuth` (401 on a bad or expired token). |
| User menu | [UserMenu.tsx](../../client/src/features/auth/components/UserMenu.tsx) | Hard-coded `const user = { name: 'Ada Lovelace', … }` with `TODO(Phase 3)`. Initials are computed inline. |
| Loader | [LoadingScreen.tsx](../../client/src/shared/components/LoadingScreen.tsx) | Full-screen centered spinner, `aria-label="Loading"`. Ready to use. |
| Error UI | — | **`ErrorState` doesn't exist** (FND-5 isn't done). The spec's step 1 refers to it. |
| Utils | — | `src/shared/utils/` doesn't exist yet. |
| Guards | `RequireAuth.tsx`, `PublicOnly.tsx` | **Empty staged files.** AUTH-6 is planned but not implemented. |
| React Query | `package.json` | v5: `useQuery` has no `onSuccess`, so side effects go in the `queryFn` (as the spec says). |

---

## 3. Design decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Where the gate sits | A **layout route** between `RequireAuth` and `AppShell`: `RequireAuth → SessionGate → AppShell`. | Same pattern as the AUTH-6 guards (layout routes, D2 there). It only runs with a token, because `RequireAuth` is its parent. It sits **above** `AppShell`, so `RecentChats` and the page queries don't fire with an unvalidated token. That would cause several parallel 401s and data flashing behind the loader. |
| D2 | Loader condition | `isPending` only (no data yet), **not** `isFetching`. | The loader shows once per app load. Background refetches after `staleTime` keep the cached user on screen, so navigating never shows the loader again (spec step 4). |
| D3 | 401 handling | **Nothing new.** The FND-4 interceptor already clears the session, and `RequireAuth` redirects. While the error is a 401, `SessionGate` keeps rendering `LoadingScreen` instead of the error UI. | One owner for 401s (AUTH-4 builds on it). Rendering the loader on a 401 avoids a one-frame flash of "Couldn't load your session" before the redirect. |
| D4 | Keeping the store's `user` fresh | `useMe`'s `queryFn` calls `useAuthStore.getState().setUser(user)` and returns `user`. `UserMenu` reads from the **store**. | The spec's choice. The store's `user` is part of the persisted session, not a copy of query data for display, so it's an exception to the "never copy query data into zustand" rule. Write that in a one-line comment so reviewers don't flag it. It also means a renamed user (SET-1) only needs to update one place. |
| D5 | Redundant `/auth/me` right after sign-in | In `useLogin` and `useRegister` `onSuccess`, also call `queryClient.setQueryData(queryKeys.me, user)`. | Without it, `SessionGate` mounts with an empty cache after sign-in and shows the full-screen loader a second time for data we already have. Seeding the cache makes sign-in go straight to the page. The `30s` `staleTime` keeps that seed from refetching right away. |
| D6 | Non-401 errors (server down, 5xx after retries) | Full-screen fallback inside `SessionGate`: a message from `getErrorMessage(error)` and a **Retry** button that calls `refetch()`. Keep the session. Leave `// TODO(FND-5): use ErrorState`. | The spec asks for an error state with Retry, but `ErrorState` doesn't exist. Building the shared component belongs to FND-5 (one story per PR). Signing the user out because the server is down would be wrong. |
| D7 | Initials helper | `src/shared/utils/initials.ts` → `getInitials(name: string): string`. | The spec's path, and CONVENTIONS lists `shared/utils/` for helpers like this. It's pure and has no feature knowledge, so it belongs in `shared/`. SET-1's profile page can reuse it. |
| D8 | `UserMenu` with `user === null` | Render nothing in the name/email slot and `?` in the avatar. Don't crash. | Under the gate it's always set. It can still be null when a session was persisted by an older build that stored only `token`, or for a moment during sign-out (AUTH-5). |
| D9 | `getMe` response shape | `getMe(): Promise<User>` unwraps `{ user }`. | Callers want the `User`. It matches how `login`/`register` return the body, but one level down, since `/me` wraps the user. |

---

## 4. Target route tree

```
RootLayout (Suspense)                      errorElement: RouteError
├─ PublicOnly                              (AUTH-6)
│  ├─ /login        LoginPage
│  └─ /register     RegisterPage
├─ RequireAuth                             (AUTH-6) no token → /login?redirect=…
│  └─ SessionGate                          ← NEW: pending → LoadingScreen · 401 → LoadingScreen (redirect follows) · other error → Retry · ok → <Outlet>
│     └─ AppShell                          errorElement: RouteError
│        ├─ /  /chat  /chat/:id  /compare  /providers  /settings
└─ *                NotFoundPage           no guard, no gate
```

---

## 5. Files

| Action | Path | What |
|---|---|---|
| modify | `client/src/features/auth/api/auth.ts` | add `getMe(): Promise<User>`. Also fix the import spacing (`RegisterRequest ,LoginRequest`). |
| create | `client/src/features/auth/hooks/useMe.ts` | `useQuery` on `queryKeys.me`, `enabled: !!token`, calls `setUser` in the `queryFn` |
| create | `client/src/features/auth/components/SessionGate.tsx` | layout route: loader, error with Retry, or `<Outlet />` |
| modify | `client/src/features/auth/index.ts` | export `SessionGate` |
| modify | `client/src/app/router.tsx` | insert `SessionGate` between `RequireAuth` and `AppShell` |
| modify | `client/src/features/auth/hooks/useLogin.ts` | also seed `queryKeys.me` (D5) |
| modify | `client/src/features/auth/hooks/useRegister.ts` | same |
| create | `client/src/shared/utils/initials.ts` | `getInitials(name)` |
| modify | `client/src/features/auth/components/UserMenu.tsx` | read `user` from the store, use `getInitials`, remove the `TODO(Phase 3)` and the hard-coded user |

No new dependencies. No server changes.

---

## 6. Implementation steps

**Before step 1:** AUTH-6 must be merged, or at least `RequireAuth` filled and wired in the router. See R1.

### Step 1: `getMe`
```ts
export async function getMe(): Promise<User> {
  const { data } = await api.get<{ user: User }>('/auth/me');
  return data.user;
}
```

### Step 2: `useMe`
```ts
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
```
- Keep the narrow `(s) => s.token` selector, so `setUser` doesn't re-render the gate.
- No `retry` override: the defaults already skip 4xx and network errors, and retry 5xx twice.

### Step 3: `SessionGate`
```tsx
/** Layout route: on app start, validates the stored token with GET /auth/me before any private page renders. */
export function SessionGate() {
  const { data, isPending, isError, error, refetch, isFetching } = useMe();

  // A 401 has already cleared the session (FND-4 interceptor). RequireAuth is about to redirect, so don't flash the error UI.
  if (isPending || (isError && getErrorStatus(error) === 401)) return <LoadingScreen />;

  // Only the first load is gated: a failed background refetch keeps the cached user on screen
  if (isError && !data) {
    // TODO(FND-5): replace with the shared ErrorState
    return (/* full-screen Box: "Couldn't load your session", getErrorMessage(error), Retry button
               with loading={isFetching}, onClick={() => refetch()} */);
  }
  return <Outlet />;
}
```
- `isPending` is `true` while there's no data, including when the query is disabled. That's fine, because `RequireAuth` never renders the gate without a token.
- Once data exists, a failed **background** refetch leaves `isError` true **and** keeps `data`. Check `data` before showing the error screen (`if (isError && !data)`), so a later 5xx doesn't throw a working user out of the app. Only the first load is gated.
- Use MUI `Box` + `Typography` + `Button` and theme tokens, centered and `100dvh` like `LoadingScreen`. Use the `…Rounded` icon for Retry if there is one.

### Step 4: Seed the cache after sign-in and sign-up (D5)
```ts
onSuccess: ({ token, user }) => {
  useAuthStore.getState().setSession(token, user);
  queryClient.setQueryData(queryKeys.me, user);
},
```
Import `queryClient` from `@/shared/api/queryClient`. Do the same in `useRegister`.

### Step 5: Export and wire the router
```ts
// features/auth/index.ts
export { SessionGate } from './components/SessionGate';
```
```tsx
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
```

### Step 6: `getInitials`
```ts
/** "Ada Lovelace" → "AL", "ada" → "A", "  " → "?". Takes the first and last word. */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : '';
  return (first + last).toUpperCase();
}
```
- First and last word, so "Ada King Lovelace" gives `AL`, not `AK`. That's what users expect from avatars.
- `Array.from` splits by code point, so names that start with an emoji or a non-BMP character don't produce half a surrogate pair.

### Step 7: `UserMenu`
```tsx
const user = useAuthStore((s) => s.user);
const initials = user ? getInitials(user.name) : '?';
```
- Delete the module-level `user` const and its `TODO(Phase 3)`, and the inline initials code.
- `ListItemText` uses `user?.name` and `user?.email`. Add `title={user?.email}` or a `Tooltip` on the button so a truncated (`noWrap`) email can still be read, and give the avatar `alt`/`aria-hidden` (the button already has an `aria-label`).
- Leave **Sign out** as it is. It belongs to AUTH-5.

### Step 8: `cd client && npm run lint && npm run build`

---

## 7. Risks and edge cases

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **AUTH-6 isn't implemented.** `RequireAuth` is an empty file. | AC3 only half works: the session is cleared, but nothing redirects to `/login`. `SessionGate` would also run for signed-out users if mounted without the guard. | Merge AUTH-6 first (the story card already says `depends_on: [AUTH-6]`). Don't try to fit the guard into this PR. |
| R2 | Showing the loader again after sign-in | A second full-screen spinner right after the login form. It looks like a glitch. | D5: seed `queryKeys.me` in `useLogin`/`useRegister`. |
| R3 | Flash of the error UI on a 401 | One frame of "Couldn't load your session" before the redirect. | D3: treat a 401 like pending in the gate. |
| R4 | A background `me` refetch fails later | A working user is thrown onto an error screen. | Step 3: only show the error screen when there's **no data**. |
| R5 | `AppShell` mounts before validation | `RecentChats` and page queries fire with a bad token. That causes several 401s and shows private data behind the loader. | D1: `SessionGate` sits **above** `AppShell`. Matrix row 3 checks it. |
| R6 | Stale `me` cache across users | User A signs out, user B signs in, and the menu shows A for a moment. | Out of scope: AUTH-5 calls `queryClient.clear()` on sign-out and AUTH-4 does it on 401. D5's `setQueryData` also overwrites the cache on every sign-in, so this PR already avoids it on the sign-in path. |
| R7 | The snackbar says "Session expired" for a tampered token | Wording isn't exactly right for that case. | Acceptable. It's the same flow as a real expiry, and AUTH-4 owns the snackbar copy. |
| R8 | Corrupt `ai-hub-auth` JSON | `persist` fails to parse it. | zustand catches the error and keeps the defaults (signed out). Nothing to add. Matrix row 7 checks it. |
| R9 | StrictMode double mount | Two `/auth/me` requests in dev. | React Query dedupes in-flight queries by key, so only one request fires. If you see two, the key or the `enabled` flag is wrong. |
| R10 | Copying query data into zustand | Reviewers flag it as a CONVENTIONS §3 violation. | D4 and the inline comment explain the exception. Mention it in the PR description. |

---

## 8. Verification (manual test matrix)

Run the server (`npm run seed` for the demo user), then `cd client && npm run dev`. Sign in as `demo@aihub.dev` / `password123`.

| # | Setup | Action | Expected |
|---|---|---|---|
| 1 | signed in | inspect `ai-hub-auth` in DevTools → Application | `{ state: { token, user }, version: 0 }`, no functions (AC1) |
| 2 | signed in, Slow 3G | reload `/providers` | `LoadingScreen`, then the page. Exactly one `GET /auth/me` (AC2) |
| 3 | signed in, Slow 3G | reload, watch the Network tab | **no** `/conversations` or `/providers` request starts before `/auth/me` resolves (R5) |
| 4 | signed in | navigate between pages | the loader never shows again (spec step 4) |
| 5 | signed out | sign in from `/login` | lands on the page **without** a second full-screen loader. No extra `/auth/me` in Network (R2) |
| 6 | signed in | set `token` to `garbage`, reload `/compare` | `ai-hub-auth` cleared, lands on `/login?redirect=%2Fcompare`, one snackbar, no error UI flash (AC3, R3) |
| 7 | — | set `ai-hub-auth` to `{not json`, reload `/` | treated as signed out → `/login?redirect=%2F` (R8) |
| 8 | signed in | stop the server, reload | error screen with Retry. Session **kept**. Start the server, click Retry → page renders (D6) |
| 9 | signed in | stop the server **after** the page has loaded, wait 30 s, navigate | no error screen. The app stays usable with the cached user (R4) |
| 10 | signed in | open the user menu, expanded and collapsed sidebar | real name, email and initials. In collapsed mode only the avatar shows (AC4) |
| 11 | signed in | in localStorage, set `user` to `null`, keep the token, reload | no crash. After `/auth/me` resolves, the real user shows (D8) |
| 12 | — | `getInitials` in the console or a scratch file with `'Ada Lovelace'`, `'ada'`, `'  Ada   King  Lovelace '`, `''`, `'émile zola'` | `AL`, `A`, `AL`, `?`, `ÉZ` |

Then `npm run lint && npm run build` with zero errors and zero warnings.

---

## 9. Definition of done

- [ ] AC1–AC4 pass (matrix rows 1, 2, 6, 10).
- [ ] Rows 3, 5, 8 and 9 pass (no early requests, no double loader, error with Retry, no error after first load).
- [ ] `SessionGate` sits between `RequireAuth` and `AppShell`. It's exported only through `@/features/auth`.
- [ ] No hard-coded user left in `UserMenu`. The `TODO(Phase 3)` is gone.
- [ ] `TODO(FND-5)` is left where the inline error UI stands in for `ErrorState`.
- [ ] `lint` and `build` are clean.
- [ ] The PR description mentions D4 (store copy of `user`) and R7 (snackbar wording) so reviewers don't report them as bugs.
- [ ] Commit: `feat(auth): AUTH-3 session persistence`. Move the card to **Done**.

---

## 10. Out of scope (owned by other stories)

- Route guards and `?redirect=`: **AUTH-6** (prerequisite).
- `handleUnauthorized`, `queryClient.clear()` on 401 and the snackbar copy: **AUTH-4**.
- Sign-out clearing the session and cache: **AUTH-5**.
- The shared `ErrorState` / `EmptyState` components: **FND-5**.
- Editing the profile name (`PATCH /auth/me`): **SET-1** (it should update both `queryKeys.me` and `setUser`).
- Syncing the session across tabs with a `storage` listener: possible later improvement.
- Automated tests for `getInitials` and `SessionGate`: **QA-2** (rows 6, 8 and 12 are the cases to port).
