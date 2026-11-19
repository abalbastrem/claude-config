---
name: matrix
description: Set up or use the traceability matrix that crosses OpenSpec scenarios with tests and branch coverage. Use when the user runs /matrix, or asks to set up, regenerate, check or open the traceability matrix in a project.
argument-hint: setup | status
---

# Traceability matrix

A general tool that lives in the claude-config repo, `tools/matrix/`. It crosses:

- **OpenSpec scenarios**: the living spec in `openspec/specs/`, plus the delta specs of changes in progress;
- **test results**: Japa (ndjson reporter), Vitest (json reporter) and Playwright (json reporter);
- **branch coverage**: istanbul `coverage-final.json`, from c8 or `@vitest/coverage-v8`. Coverage is shown globally and for the new code against a base branch, with a **branch analysis**: every uncovered branch with its code, and its class once it has been classified.

It produces:

- `matrix.md`: which tests verify each scenario, with no test state. It is versioned.
- `state.json`: the same plus test state and coverage. It is git-ignored.
- **A live page**: the tool's own `view.html`, served by `server.ts`. It repaints itself over SSE every time the tests run.

The tool reads `<dir>/config.json` in the project, and is always called through the claude-config folder, never copied:

```
node $CLAUDE_CONFIG/tools/matrix/matrix.ts --dir <dir> [--check] [--base <ref>]
node $CLAUDE_CONFIG/tools/matrix/server.ts --dir <dir> [--port 5180]
```

`CLAUDE_CONFIG` defaults to `~/projects/software/claude-config`.

## The rules it enforces

They come from the global CLAUDE.md, section Tests.

- Every OpenSpec scenario carries an ID in its title: `#### Scenario: [SC-n] …`. The ID is unique across the repo, and a new scenario takes the next free number. Numbers are never reused.
- Every test title starts with the ID(s) of the scenario(s) it verifies: `SC-7 · …` or `SC-7 SC-8 · …`. The ID goes on the test itself, not on its `describe` or group: an ID anywhere else does not count, and `--check` points it out.
- The pre-push hook also fails when the typecheck fails (see setup, step 6).
- `--check` exits 1, and so does the pre-push hook, when any of these happen:
  - a test without a scenario;
  - a scenario without tests, with failing tests, or with only skipped tests;
  - missing results, or stale ones: the specs changed after the last test run, or a runner was not rerun in it (needs the stamp, see setup);
  - no scenarios at all;
  - `matrix.md` out of date.
- Errors in the specs (a scenario without ID, a duplicate ID, a requirement twice in one capability) exit 1 in any mode. A flag without a value exits 2.
- Coverage never blocks. `--check` only warns about new uncovered branches that are not classified yet, and about classifications that match no uncovered branch any more.

## Branch analysis

It needs coverage of every source file, loaded or not: c8 with `all: true` and `src`/`include`, Vitest with `coverage.include`. Without that, a module no test loads is simply missing from the report.

The live view lists every uncovered branch per layer and file: line, code, branch type, whether it is new code, and its class. A module no test loads is one finding ("whole module"), not a branch on line 1. Paths of one branch on the same line count as one finding.

Classes are the four of the global CLAUDE.md ("Tancament de la Story"), and they live in a versioned file of the project, `<dir>/branches.json` (config `classifications` to rename it):

```json
[{ "file": "backend/app/controllers/profile_controller.ts", "code": "*",
   "class": "other-story", "note": "No test loads the module: it belongs to the accounts epic, which has no spec yet" }]
```

- `class`: `missing-criterion`, `dead-or-defensive`, `technical-decision` or `other-story`.
- `code` is the trimmed text of the line the view shows, or `*` for a whole module. The key is file + code, not the line number, so a classification follows the code when it moves. Two lines with the same text in one file share it.
- `note`: why, readable without the conversation.
- `ref` (optional): a link to the discussion, when there was one.
- `matrix.md` gets a "Classified uncovered branches" section from this file only, so it does not churn with coverage.

**You classify; the user decides what follows from it.** When closing a story, classify each new uncovered branch, write it to the file and list it in the PR. What a class leads to is the user's decision, taken in the conversation (global CLAUDE.md, section «Cap test sense criteri»): a missing criterion becomes a scenario only after the user agrees, and dead code or another story's code is removed only if they say so.

## Arguments

Read `$ARGUMENTS`. If it is empty, treat it as `status`.

### `status`

Run the tests if there are no results yet. Then run `matrix.ts --dir <dir>` and report:

- the counts per state;
- the scenarios that are not green;
- the orphan tests;
- the branch coverage, global and new, and how many uncovered branches are not classified.

Offer the live view.

### `setup`

Prepare a project that already uses OpenSpec. Stop and ask at each step that needs a decision; do not make the decisions yourself.

1. **Folder.** Ask where the matrix lives. The default is `docs/traceability`; a project may name it in its own language.
2. **`config.json`.** Ask which runners the project has and where each one should write its results. The tool reads Japa, Vitest and Playwright only (see «Per runner»); any other runner needs a new reader in `matrix.ts` first, so say so and stop. Then write, for example for a backend with Japa and a frontend with Vitest:

   ```json
   {
     "results": [
       { "runner": "japa", "file": "backend/tmp/test-results.ndjson", "root": "backend" },
       { "runner": "vitest", "file": "frontend/tmp/test-results.json" }
     ],
     "baseBranch": "main",
     "coverage": [
       { "layer": "backend", "file": "backend/coverage/coverage-final.json" },
       { "layer": "frontend", "file": "frontend/coverage/coverage-final.json" }
     ]
   }
   ```

   A results entry's `file` is relative to the project root; `root`, when set, is the folder the runner runs from, so that test file paths come out relative to the project. Add `<dir>/state.json` to `.gitignore`.
3. **Results.** Make each runner write its machine-readable results to the file in `config.json` while keeping its normal output readable (recipes in «Per runner»).
   - **Stamp first.** The test target starts with `matrix.ts --dir <dir> --stamp`, which records a fingerprint of the specs. With it, `--check` knows when results were produced against other specs, or when a runner was not rerun. Add `<dir>/specs-stamp.json` to `.gitignore` too.
4. **Branch coverage.** Every layer writes an istanbul `coverage-final.json` covering every source file, loaded or not, with the project's generated files (the ones nobody edits by hand) and the tests out. Recipes in «Per runner».
5. **Make targets.** Add `CLAUDE_CONFIG ?= $(HOME)/projects/software/claude-config` and the four targets, plus a fifth when it applies. Use the project's language for their names. Quote the tool path in recipes (`node "$(CLAUDE_CONFIG)/tools/matrix/matrix.ts"`): on Windows `$(HOME)` comes with backslashes, which bash eats inside multi-line recipes.
   - `test`: runs every runner, even if one fails, and exits with an error if any failed.
   - `matrix`: runs `matrix.ts`.
   - `matrix-check`: runs `matrix.ts --check`.
   - `matrix-live`: runs `server.ts`.
   - `test` and `matrix` print a warning when `git config core.hooksPath` is not `.githooks` (see step 6).
   - `typecheck`: only if the project uses a language or tool with type checking (TypeScript, mypy…). It calls the command each package already uses (`tsc --noEmit`, `tsc -b`, `mypy`…), even when that command only lives inside another script such as `build`. Like `test`, it runs every package even if one fails, and exits with an error if any failed. If the project already has an equivalent target, reuse it. Without type checking (plain JS, or a compiled language whose build already checks types), skip it without asking.
6. **Pre-push hook.** Create `.githooks/pre-push` (executable: `git update-index --chmod=+x`) that runs, in this order, the typecheck target from step 5 (if the project has one), `make test` and the check target. The typecheck goes first because it is the cheapest and test runners often transpile without checking types, so a type error can sit behind a green suite. The hook calls the make target, not a package's own script, so that every package is checked. Activate it with `git config core.hooksPath .githooks` from the project's setup target **and** from every package's install: a `prepare` script (`git config core.hooksPath .githooks || true`) in each `package.json`, so any `npm install` turns it on. A hook that only `make setup` activates is missing in every clone set up before it, and nobody notices. The warning of step 5 shows when it is still off. Start the hook by checking that `$CLAUDE_CONFIG/tools/matrix/matrix.ts` exists, and fail with a clear message saying where to get claude-config if it does not: a clone without it should not die on a cryptic Node error.
7. **CI (optional, ask).** The hook is the local gate; a CI job is the net for whatever skips it (`--no-verify`, a clone without hooks, a web edit, another contributor). Recommend it when more than one person works on the repo. If the user wants it, add `.github/workflows/matrix.yml` calling the reusable workflow (see the README), with a `setup` that installs every package and prepares what the tests need (env files, migrations, Playwright browsers).
8. **Scenario IDs.** Number the scenarios that have no `[SC-n]`, in order of appearance, continuing from the highest existing number. Check that `openspec validate --specs --strict` still passes.
9. **Test IDs: stop and ask.** Propose a table with each test, the scenario(s) you think it verifies, and the doubtful ones marked. Tests that fit no scenario are listed apart.
   - Do not invent scenarios and do not decide a mapping on your own: that is the user's call.
   - Apply only the mapping the user approves.
   - The user decides what happens to tests without a scenario. Usually the direction is capability → requirement → scenario → test, so such tests are removed, not given a scenario after the fact.
10. **Verify.** Run the tests, generate the matrix and show the result. Start the live view only if the user wants it.

## Per runner

**Japa**

- **Results:** with AdonisJS, `node ace test --reporters=spec --reporters=ndjson | tee <file> | grep -v '^{'`. The spec output stays readable, and the JSON lines go only to the file. Run it under `bash` with `set -o pipefail`, or the pipeline hides Japa's exit code (`dash`, the default `sh` on Ubuntu CI, has no `pipefail`).
- **Level:** from the suite: `unit` → unit, `e2e` → e2e, any other suite → public interface. Map other suite names with `"levels": { "<suite>": "<level>" }` in that results entry.
- **Coverage:** `c8` as a pinned dev dependency, with a `.c8rc.json` that sets `all: true`, `include` for the app code, `exclude` for generated code and tests, and the `json` and `json-summary` reporters to `coverage/`. Prefix the test command with `npx c8`. With c8 (V8 coverage), every block V8 measures counts as a branch, including the continuation of an `await`: do not compare that figure directly with istanbul-instrumented layers.

**Vitest**

- **Results:** `vitest run --reporter=default --reporter=json --outputFile.json=<file>`.
- **Level:** component, unless the entry sets `"level"`.
- **Coverage:** `@vitest/coverage-v8` at the same version as `vitest`. In `test.coverage`, set `provider: 'v8'`, `include` for the source, `exclude` for generated code and tests, and the `json` and `json-summary` reporters. Add `--coverage` to the run.

**Playwright**

- **Results:** `reporter: [['list'], ['json', { outputFile: 'tmp/e2e-results.json' }]]` in `playwright.config.ts`. Playwright resolves `outputFile` from the config's folder, while the entry is relative to the project root.
- **Level:** e2e, unless the entry sets `"level"`. A spec that runs in several projects (browsers) counts as one test with the worst state of its runs; `flaky` (passed on a retry) counts as pass. Projects that are not tests of a scenario, such as an auth setup, go in `"ignoreProjects": ["setup"]`.
- **Coverage:** none: the E2E run in processes apart, and what they go through is already covered by the other levels.

## Notes

- Needs Node 24 or later, which runs the TypeScript directly.
- The tool runs from the claude-config checkout as it stands, so it warns when that checkout is not on its default branch or has uncommitted changes: that changes what every project's check does.
- The tool has no tests of its own on purpose: it only displays the project's tests.
