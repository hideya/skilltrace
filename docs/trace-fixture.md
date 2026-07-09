# SkillTrace Trace Fixture

This document explains the first manual trace fixture loop for SkillTrace.

The purpose is to verify trace behavior end to end:

1. read a fixture skill file
2. emit passive file access events
3. emit active semantic skill-use events
4. view the run timeline
5. confirm the consistency checker reports expected pass and warning states

This is a test driver for the observability loop. It is not a real agent runtime and does not prove general file-read monitoring.

## Fixture Skill

The fixture skill lives at:

```text
fixtures/skills/pr-review/SKILL.md
```

It is intentionally separate from real working Codex skills. Codex does not treat this fixture directory as an installed skill root.

The fixture includes:

```text
fixtures/skills/pr-review/SKILL.md
fixtures/skills/pr-review/references/checklist.md
```

## Prerequisites

Start the SkillTrace dev server in another terminal:

```bash
pnpm dev
```

Make sure the local DB has the SkillTrace tables:

```bash
pnpm db:init-local
```

## Demo Runs

Run the fixture demo sequence:

```bash
pnpm skilltrace:demo --server http://localhost:5777
```

By default, the command creates two runs.

The pass run posts:

- `skill_file_read`
- `skill_reference_read`
- `skill_use_started`
- `skill_use_finished`

Expected result:

- the Timeline shows all four events
- the compact timeline rows expand to show event payload details
- Consistency shows `Observed and declared` with a `pass` badge

The warning run posts:

- `skill_file_read`
- `skill_reference_read`

Expected result:

- the Timeline shows passive file events
- Consistency shows `Read but not declared` with a `warning` badge

This warning case includes a reference read, so SkillTrace treats it as material
evidence that should have semantic or reflection support in full mode. A bare
passive `SKILL.md` entrypoint read without reference, semantic, or reflection
evidence is now shown as neutral `discovered` evidence instead.

At the end, it prints run URLs:

```text
http://localhost:5777/app/runs/<run_id>
```

Open those URLs in the browser.

## Cases

Run only the passing case:

```bash
pnpm skilltrace:demo --case pass --server http://localhost:5777
```

Run only the warning case:

```bash
pnpm skilltrace:demo --case warning --server http://localhost:5777
```

## Fixed Run ID

Use a fixed run ID when you want repeatable manual testing:

```bash
pnpm skilltrace:demo \
  --case both \
  --run run_fixture_pr_review_demo \
  --server http://localhost:5777
```

Repeated runs with the same base run ID append more events to the same timelines. Use a new run ID when you want clean timelines.

## Manual Pieces

The demo command is equivalent to running the lower-level harness commands manually.

Passive read:

```bash
pnpm skilltrace:read \
  --run run_fixture_pr_review_manual \
  --skill pr-review \
  --server http://localhost:5777 \
  fixtures/skills/pr-review/SKILL.md
```

Semantic start:

```bash
pnpm skilltrace:log \
  --run run_fixture_pr_review_manual \
  --skill pr-review \
  --event skill_use_started \
  --summary "Using PR review fixture." \
  --confidence medium \
  --server http://localhost:5777
```

Semantic finish:

```bash
pnpm skilltrace:log \
  --run run_fixture_pr_review_manual \
  --skill pr-review \
  --event skill_use_finished \
  --summary "Completed PR review fixture." \
  --confidence medium \
  --server http://localhost:5777
```

## What This Test Proves

This fixture proves that SkillTrace can correlate passive and semantic events for one run.

It verifies:

- passive event ingestion
- semantic event ingestion
- run ID aggregation
- timeline rendering
- consistency checking

It does not verify:

- real agent behavior
- real Codex skill activation
- filesystem-level read monitoring
- MCP protocol transport
- instrumentation compliance by a model

Those are later experiments.
