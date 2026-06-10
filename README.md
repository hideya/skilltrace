# Auth Starter

A React Router v7 SSR starter with cookie-session auth, email/password flows,
OAuth, protected routes, and a small notes dashboard.

This repo is based on: https://github.com/gistajs/auth

## Stack

- React Router v7 SSR
- React 19
- Tailwind CSS v4 + daisyUI v5
- Drizzle ORM + Atlas schema flow
- SQLite locally, Turso/libSQL-compatible database in production
- Cookie sessions
- Google + GitHub OAuth
- Nodemailer for auth emails

## Quick Start

Install dependencies:

```bash
pnpm install
```

Prepare `.env` and generate a `COOKIE_SECRET`:

```bash
pnpm prep
```

Apply the local database schema:

```bash
pnpm atlas
```

Start the dev server:

```bash
pnpm dev
```

Open the local URL printed by React Router, usually `http://localhost:5173`.

## Environment Variables

`pnpm prep` creates `.env` from `.env.example` if needed.

- `COOKIE_SECRET`: required for signing cookie sessions. Must be at least 32 characters.
- `ORIGIN`: public app origin used for OAuth callbacks and auth email links.
- `DB_URL`: production Turso/libSQL database URL.
- `DB_AUTH_TOKEN`: production Turso/libSQL auth token.
- `SMTP_CONFIG`: JSON Nodemailer transport config. If omitted or invalid, verify/reset links are logged to server output in dev.
- `GOOGLE_CLIENT_ID`: Google OAuth client ID.
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret.
- `GITHUB_CLIENT_ID`: GitHub OAuth client ID.
- `GITHUB_CLIENT_SECRET`: GitHub OAuth client secret.

Local development uses `data/dev.db` by default.

## Scripts

- `pnpm prep`: create `.env` and generate a cookie secret.
- `pnpm dev`: run the React Router dev server.
- `pnpm tsc`: run a quick TypeScript check.
- `pnpm build`: build the app for production.
- `pnpm atlas`: apply the local database schema.
- `pnpm atlas:prod`: apply the production database schema.
- `pnpm drizzle-studio`: open Drizzle Studio for local data.
- `pnpm drizzle-studio:prod`: open Drizzle Studio for production data.
- `pnpm ship`: merge `dev` to `main` and deploy through Vercel.
- `pnpm clean`: remove generated local files while preserving `.env`, `/tmp`, and `/data`.

Schema migrations are intentionally manual. Review schema changes before running Atlas commands.

## Auth Flows

- `/signup`: create an email/password account.
- `/login`: sign in with email/password or OAuth.
- `/logout`: end the current session.
- `/verify`: request a verification email.
- `/verify/:token`: verify an email token.
- `/forgot`: request a password reset link.
- `/reset-password/:token`: set a new password.
- `/oauth/google`: start Google OAuth.
- `/oauth/github`: start GitHub OAuth.
- `/app`: protected notes dashboard.
- `/app/settings`: protected account settings.
- `/admin`: admin-only user overview.
- `/admin/notes`: admin-only notes overview.

## Project Structure

- `app/routes/_auth`: login, signup, logout, verify, forgot password, and reset password routes.
- `app/routes/oauth`: Google and GitHub OAuth routes and callbacks.
- `app/routes/app`: protected app shell, dashboard, and settings page.
- `app/routes/admin`: admin-only routes.
- `app/.server/auth`: cookie session helpers and auth middleware.
- `app/models/.server`: server-side model layer.
- `app/.server/db`: database schema, connection, and validators.
- `app/ui`: shared UI components.
- `scripts`: project setup, cleanup, admin promotion, and deploy helpers.

Routes are generated from `app/routes.ts` with `react-router-auto-routes`.

## Local Development Notes

Auth emails use `SMTP_CONFIG` when configured. Without a valid SMTP config, the app logs verify and reset links with an `[auth-link]` prefix so local development stays simple.

The protected app routes use middleware from `app/.server/auth/middlewares.ts`.
Use `requireUser(request)` or `getUser(request)` from `app/.server/auth/cookie.ts`
when working outside middleware-backed routes.

## Deployment

This project is Vercel-ready.

Before deploying:

1. Set production environment variables in Vercel.
2. Apply the production schema manually with `pnpm atlas:prod`.
3. Deploy from `main`.

`vercel.json` currently allows deployments from `main` and disables automatic deployments from other branches.
