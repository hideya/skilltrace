# Auth And Admin Scaffold

SkillTrace is currently a local-first, unauthenticated skill observability tool.
The auth/admin code is intentionally retained as a parked, buildable scaffold
for a possible future remote/team mode.

This scaffold is not part of the normal local tracing workflow. Local SkillTrace
users do not need login, OAuth setup, SMTP setup, `.env`, remote database setup,
or user/admin account setup.

## Current Status

The scaffold is still compiled and some routes are directly routable. Treat this
as preserved infrastructure, not accidental dead code.

The local product path is:

- start the local daemon
- register the MCP server
- run `skilltrace start`
- inspect trace runs under `/app/runs`

The local product path should not depend on auth/admin behavior unless
SkillTrace explicitly grows a remote/team mode.

## Preserved Routes

Auth routes:

- `/login`
- `/signup`
- `/forgot`
- `/verify`
- `/verify/:token`
- `/reset-password/:token`
- `/logout`

OAuth routes:

- `/oauth/google`
- `/oauth/google/callback`
- `/oauth/github`
- `/oauth/github/callback`

Admin routes:

- `/admin`
- `/admin/notes`

Parked app routes from the auth scaffold:

- `/app`
- `/app/settings`

Developer helper route:

- `/clear-session`

## Preserved Code

The intentionally preserved scaffold includes:

- auth helpers under `app/.server/auth`
- user and note schemas under `app/.server/db/schema`
- user and note validators under `app/.server/db/validators`
- user and note models under `app/models/.server`
- auth routes under `app/routes/_auth`
- OAuth routes under `app/routes/oauth`
- admin routes under `app/routes/admin`
- parked notes/settings routes under `app/routes/app/index.tsx` and
  `app/routes/app/settings.tsx`
- `scripts/promote-admin.ts`
- auth-related dependencies such as OAuth, SMTP, and password hashing libraries

## Commented Remote-Mode Hooks

Some local-mode routes keep commented auth references near the code they would
protect in a future remote/team mode. These comments are intentional signposts,
not forgotten half-edits.

Current examples:

- `app/routes/app/_layout.tsx`
- `app/routes/app/runs.tsx`
- `app/routes/app/runs.$id.tsx`
- `app/routes/app/runs.compare.tsx`

## Maintenance Policy

Do not remove the scaffold as dead code unless the project explicitly decides
that remote/team mode is no longer a goal.

Do not expand the local tracing workflow to require this scaffold unless
remote/team mode becomes active product work.

Small maintenance is fine when needed to keep the scaffold buildable, but avoid
adding features to it opportunistically.
