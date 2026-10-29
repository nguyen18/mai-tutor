# Mai (mai-tutor)

Read `ARCHITECTURE.md` first (the project's deep-dive doc; keep it updated after major changes) and
`NOTES.md` for product decisions.

- **No LLM features:** see "Working conventions" in `ARCHITECTURE.md`.
- **Stage explicit paths, never `git add -A`.** `supabase/.temp/start-secrets/.../docker.env` holds local
  secrets. On 2026-10-01 a `git add -A` on a branch without `supabase/.gitignore` swept it into a commit
  and GitHub push protection rejected the push. `supabase/.gitignore` (ignoring `.temp` and `.branches`)
  is on `master` now, but branches older than that still lack it, and a commit tracking those files
  deletes them from disk when you switch off it.
- **Translations come from which-dialect** (`~/dev/which-dialect`, the npm package `which-dialect`):
  the Cheatsheet is generated with it (`npm run cheatsheet`; data from the jsDelivr CDN, or a local
  checkout via `WHICH_DIALECT_DATA`), and the backend's `check-spelling` function uses its journal
  review. Fix translations there, not by hand here.
- Another Claude session may be working in this checkout: check `git branch --show-current` and
  `git status` before switching branches, and use a worktree when it's busy.
- **Public repo: no secrets in commits.** A gitleaks pre-commit hook (`.githooks/pre-commit`, enabled with
  `git config core.hooksPath .githooks`) blocks staged secrets. If it stops a commit, move the secret to a
  git-ignored file; don't bypass it with `--no-verify`.
