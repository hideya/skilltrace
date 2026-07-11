# SkillTrace Examples

Each subdirectory is a source template for a disposable demo repository.

Keep demo templates as close as possible to a real target repo. Avoid adding
SkillTrace-specific explanatory files inside a demo template unless the file is
intentionally part of the agent's task environment.

Generated demo working copies should live under `tmp/<demo-name>`.

For the Type Fix demo:

```bash
pnpm demo:reset type-fix-demo
cd tmp/type-fix-demo
npm install
```

The reset command copies `examples/type-fix-demo` to `tmp/type-fix-demo` and
preserves symlinks such as `CLAUDE.md -> AGENTS.md` and
`.claude -> .agents`.

For a manual reset, use `cp -RP` so symlinks are preserved:

```bash
mkdir -p tmp
rm -rf tmp/type-fix-demo
cp -RP examples/type-fix-demo tmp/type-fix-demo
```

`examples/type-fix-demo` is intentionally broken. The copied demo should be
used as the agent's working directory, and can be deleted and regenerated after
each trial.
