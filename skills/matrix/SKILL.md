---
name: matrix
description: Set up or use the traceability matrix that crosses OpenSpec scenarios with tests and branch coverage. Use when the user runs /matrix, or asks to set up, regenerate, check or open the traceability matrix in a project.
argument-hint: setup | status
---

# Traceability matrix

A general tool that lives in the claude-config repo, `tools/matrix/`. It crosses:

- **OpenSpec scenarios**: the living spec in `openspec/specs/`, plus the delta specs of changes in progress;
- **test results**: Japa (ndjson reporter) and Vitest (json reporter);
- **branch coverage**: istanbul `coverage-final.json`, from c8 or `@vitest/coverage-v8`. Coverage is shown globally and for the new code against a base branch.

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
- Coverage never blocks.

## Arguments

Read `$ARGUMENTS`. If it is empty, treat it as `status`.

### `status`

Run the tests if there are no results yet. Then run `matrix.ts --dir <dir>` and report:

- the counts per state;
- the scenarios that are not green;
- the orphan tests;
- the branch coverage, global and new.

Offer the live view.

### `setup`

Prepare a project that already uses OpenSpec. Stop and ask at each step that needs a decision; do not make the decisions yourself.

1. **Folder.** Ask where the matrix lives. The default is `docs/traceability`; a Spanish project may prefer `docs/trazabilidad`.
2. **`config.json`.** Ask which runners the project has and where each one should write its results. Then write:

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

   `root` is the folder Japa runs from, so that file paths are relative to the project. Add `<dir>/state.json` to `.gitignore`.
3. **Results.**
   - **Japa:** `node ace test --reporters=spec --reporters=ndjson | tee <file> | grep -v '^{'`. The spec output stays readable, and the JSON lines go only to the file. Run it under `bash` with `set -o pipefail`, or the pipeline hides Japa's exit code (`dash`, the default `sh` on Ubuntu CI, has no `pipefail`).
   - **Levels.** Japa takes the level from the suite: `unit` → unit, `e2e` → e2e, any other suite → public interface. Map other suite names with `"levels": { "<suite>": "<level>" }` in that results entry. Vitest is component unless the entry sets `"level"`.
   - **Vitest:** `vitest run --reporter=default --reporter=json --outputFile.json=<file>`.
   - **Stamp first.** The test target starts with `matrix.ts --dir <dir> --stamp`, which records a fingerprint of the specs. With it, `--check` knows when results were produced against other specs, or when a runner was not rerun. Add `<dir>/specs-stamp.json` to `.gitignore` too.
4. **Branch coverage.**
   - **Backend (Japa):** add `c8` as a pinned dev dependency, plus a `.c8rc.json` with:
     - `all: true`;
     - `include` for the app code;
     - `exclude` for generated code and tests;
     - the `json` and `json-summary` reporters to `coverage/`.

     Then prefix the test command with `npx c8`.
   - **Frontend (Vitest):** add `@vitest/coverage-v8` at the same version as `vitest`. In `test.coverage` set:
     - `provider: 'v8'`;
     - `include` for the source;
     - `exclude` for generated components and tests;
     - the `json` and `json-summary` reporters.

     Then add `--coverage` to the run.
   - **Generated code always stays out**, for example shadcn components, generated schemas and registries.
5. **Make targets.** Add `CLAUDE_CONFIG ?= $(HOME)/projects/software/claude-config` and the four targets, plus a fifth when it applies. Use the project's language for their names. Quote the tool path in recipes (`node "$(CLAUDE_CONFIG)/tools/matrix/matrix.ts"`): on Windows `$(HOME)` comes with backslashes, which bash eats inside multi-line recipes.
   - `test`: runs every runner, even if one fails, and exits with an error if any failed.
   - `matrix`: runs `matrix.ts`.
   - `matrix-check`: runs `matrix.ts --check`.
   - `matrix-live`: runs `server.ts`.
   - `typecheck`: only if the project uses a language or tool with type checking (TypeScript, mypy…). It calls the command each package already uses (`tsc --noEmit`, `tsc -b`, `mypy`…), even when that command only lives inside another script such as `build`. Like `test`, it runs every package even if one fails, and exits with an error if any failed. If the project already has an equivalent target, reuse it. Without type checking (plain JS, or a compiled language whose build already checks types), skip it without asking.
6. **Pre-push hook.** Create `.githooks/pre-push` (executable: `git update-index --chmod=+x`) that runs, in this order, the typecheck target from step 5 (if the project has one), `make test` and the check target. The typecheck goes first because it is the cheapest and test runners often transpile without checking types, so a type error can sit behind a green suite. The hook calls the make target, not a package's own script, so that every package is checked. Activate it with `git config core.hooksPath .githooks`, ideally from the project's setup target. Start the hook by checking that `$CLAUDE_CONFIG/tools/matrix/matrix.ts` exists, and fail with a clear message saying where to get claude-config if it does not: a clone without it should not die on a cryptic Node error.
7. **Scenario IDs.** Number the scenarios that have no `[SC-n]`, in order of appearance, continuing from the highest existing number. Check that `openspec validate --specs --strict` still passes.
8. **Test IDs: stop and ask.** Propose a table with each test, the scenario(s) you think it verifies, and the doubtful ones marked. Tests that fit no scenario are listed apart.
   - Do not invent scenarios and do not decide a mapping on your own: that is the user's call.
   - Apply only the mapping the user approves.
   - The user decides what happens to tests without a scenario. Usually the direction is capability → requirement → scenario → test, so such tests are removed, not given a scenario after the fact.
9. **Verify.** Run the tests, generate the matrix and show the result. Start the live view only if the user wants it.

## Notes

- Needs Node 24 or later, which runs the TypeScript directly.
- The tool warns when the claude-config checkout it runs from is not on its default branch or has uncommitted changes anywhere, because that changes what every project's check does.
- The tool has no tests of its own on purpose: it only displays the project's tests.
- The tool and the hooks run from the claude-config folder as it stands. Keep that folder on `main` when you are not working on it.
- With c8 (V8 coverage), every block V8 measures counts as a branch, including the continuation of an `await`. Do not compare that figure directly with istanbul-instrumented layers.
