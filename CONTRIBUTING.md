# Contributing to Playwright Enterprise Tester

Thanks for your interest in contributing! This plugin is an open, community-
driven project. Every contribution — from typo fixes to new phase 2 features —
is welcome.

## Ways to contribute

### 1. Report a bug

Open an [issue](https://github.com/lopadova/playwright-enterprise-tester/issues)
with:
- Your project stack (Laravel / Next.js / Bun / etc.)
- Your `.playwright-tester.json` (redact secrets)
- The command you ran
- Expected vs actual behavior
- A minimal reproduction if possible

### 2. Propose a new feature

Open an [issue](https://github.com/lopadova/playwright-enterprise-tester/issues)
with the `enhancement` label. Describe:
- The problem it solves
- Who benefits
- A rough API sketch (config section, CLI args)
- Whether it belongs in phase 2 (independent toggle) or phase 3 (larger scope)

Before opening a PR, wait for feedback on the issue. This avoids wasted work
on features that don't fit the plugin's philosophy.

### 3. Add a stack example

If you use the plugin on a stack that's not covered in `docs/examples/`,
please contribute an example! Template:

```markdown
# <Stack name> integration

## Detection
How the plugin detects your stack (files, deps, markers).

## Setup
Specific steps to install the plugin on this stack.

## Config
Stack-specific `.playwright-tester.json` sections.

## First test
A minimal smoke test that works on a fresh project.

## Gotchas
Anything unique (middleware, CSRF, hydration, ...)
```

### 4. Extend a reference doc

The `skills/playwright-enterprise-tester/references/` directory has 31
reference docs covering patterns, playbooks, and scenarios. If you have a
pattern that works well, extend the relevant doc with a new section.

### 5. Add a helper script

Helper scripts live in `skills/playwright-enterprise-tester/scripts/`.
Rules for new scripts:
- Use Node.js built-ins only, no external deps
- Read config from `.playwright-tester.json`
- Support `--dry-run` for safety
- Write output to `test-results/<script-name>.json` with versioned schema
- Follow the naming convention: `<feature>.mjs`

### 6. Write an integration test

We need end-to-end integration tests that validate the plugin works on real
stacks. Contributions welcome in `tests/integration/`.

## Development workflow

### Setup

```bash
git clone https://github.com/lopadova/playwright-enterprise-tester.git
cd playwright-enterprise-tester

# No build step required — the plugin is markdown + Node scripts
```

### Testing your changes

1. Clone a real project (Laravel, Next.js, etc.)
2. Symlink the plugin into `.claude/plugins/`:
   ```bash
   ln -s /path/to/playwright-enterprise-tester .claude/plugins/playwright-enterprise-tester
   ```
3. Run `/playwright-tester mode=smoke` in Claude Code
4. Verify your change works end to end

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(P2.12): add custom axe rules per project
fix(scripts): handle empty test-results directory
docs(onboarding): clarify wave B order
refactor(skill): extract shared locator logic
```

Prefixes:
- `feat` — new feature
- `fix` — bug fix
- `docs` — documentation only
- `refactor` — code change without feature/bug change
- `test` — tests only
- `chore` — build, tooling, housekeeping

Scope examples: `P2.12`, `scripts`, `docs`, `onboarding`, `config`, `skill`,
`agent`, `command`.

### Pull request

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Update `CHANGELOG.md` under `[Unreleased]`
5. Run `node -c .playwright-tester.json.tmpl` to validate the config template
   (if you touched it)
6. Push and open a PR with a clear description

Small PRs get reviewed faster than large ones. If your change is big, please
break it into multiple PRs.

## Project philosophy

When proposing or implementing changes, keep these principles in mind:

1. **Defensive-minimal defaults** — new features default to OFF. Users opt in.
2. **Phase 2 toggles are independent** — no cascading activation.
3. **Governance first** — the plugin never silently modifies app code.
4. **Multi-stack neutrality** — no single stack gets preferential treatment.
5. **Backwards compatibility** — config schema is versioned; bumps require
   migration notes.
6. **Documentation is code** — every feature needs a reference doc.
7. **Generic before specific** — extract common patterns into shared helpers.

## Code of Conduct

Be kind, constructive, and welcoming. We follow the
[Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).

## Questions?

Open a [discussion](https://github.com/lopadova/playwright-enterprise-tester/discussions)
or an issue.

---

*Developed with ❤️ by Lorenzo Padovani Padosoft for accelerating enterprise development with AI tools.*
