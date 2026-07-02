# Type Fix Checklist

- Confirm the exact TypeScript diagnostics before editing.
- Fix syntax errors before type errors.
- Prefer correcting misspelled property names over changing types.
- Preserve the intended data shape unless the error shows the shape is wrong.
- Rerun `pnpm tsc` after edits.
