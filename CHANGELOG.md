# Changelog

Release history for the Auth starter.

## 2026-04-25

Fixed DaisyUI CSS builds with newer Vite releases

- DaisyUI is now loaded through its explicit package entry point, avoiding the Vite package resolution issue tracked in vitejs/vite#22323.

## 2026-04-17

Smaller starter install footprint

- Starter repos no longer ship a committed `pnpm-lock.yaml`, so your first `pnpm install` generates a fresh lockfile pinned to the current versions.
- Some starters no longer depend on `vite-plugin-devtools-json`; the Chrome DevTools workspace endpoint is now served by a small built-in plugin.

## 2026-04-11

Made auth email links single-use

- Verification and password reset links now rotate after a successful use, so the same email link cannot be reused until it expires.
- Email verification keeps its confirm step, but only the final submit consumes the token.

## 2026-04-09

Simplified starter Vite path resolution

- Starter projects now rely on Vite's built-in tsconfig path resolution for `~/*` imports instead of an extra plugin dependency.
- New starter installs no longer include `vite-tsconfig-paths`, reducing one piece of Vite setup to maintain.

## 2026-04-05

Standardized Claude instructions across starters

- Starter repos now consistently include `CLAUDE.md`, so Claude can find the same project instructions already provided in `AGENTS.md`.

Simplified starter route skills

- Starter skills now use a single `/route` entry point for single-route scaffolding, CRUD route flows, and auth protection guidance.
- The `/model` skill now points Atlas setup and apply guidance to a colocated migration reference.

## 2026-04-03

Upgraded all starters to Vite 8

- New starter projects now ship with Vite 8
- Companion tooling was refreshed alongside the Vite upgrade so starter dev, build, and typecheck workflows stay aligned.

## 2026-04-02

Starter templates now ship upgrade pin metadata

- Exported starter `package.json` files now include `gistajs.pin`, so projects created from GitHub templates and CLI scaffolds start with the same upgrade baseline metadata.

## 2026-03-30

Added name field to starter skills for CLI compatibility

- Skills now include a `name` field in SKILL.md frontmatter, required by `npx skills add` for discovery and installation.

## 2026-03-29

Smoothed auth history behavior

- Auth flows now use replace-style navigation for auth success and auth-internal form submits, so transient login and signup steps collapse out of browser history more cleanly.

## 2026-03-28

Improved auth and form starter setup

- `pnpm prep` now applies Atlas automatically and seeds verified local users Alice and Bob in the `form` starter.
- Added `pnpm db:reset` to recreate `data/dev.db`, reapply Atlas, and reseed the local users.
- Improved shared starter auth behavior while keeping each starter's product pages and setup flow tailored to its use case.

## 2026-03-27

Added the Form starter and shared auth composition

- Added a new free `form` starter with forms, submissions, public fill pages, and analytics.
- `auth` and `form` now share the same auth foundation and auth flow behavior.
- Added sync and release coverage for `gistajs/form`.

Added starter release tags and sync polish

- Starter repos now publish release tags.
- Removed generated README timestamps so unchanged starter exports can skip no-op branch publishes.
- Starter READMEs now direct contributors to open issues and not direct PRs.

## 2026-03-17

Renamed production Atlas script

- Renamed the production Atlas package script from `prod:atlas` to `atlas:prod`.

Updated starter skills

- Updated route and CRUD skills to prefer grouped folders for route clusters.
- Clarified dynamic route param naming, including when to use `$id` versus descriptive snake_case params.
- Documented that simple `$id` params often map to `public_id` in Gista.js starters.

## 2026-03-16

Started publishing starter changelogs

- Added generated CHANGELOG.md output to exported starter repos.
