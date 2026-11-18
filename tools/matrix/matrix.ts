// Traceability matrix: crosses OpenSpec scenarios with test results and branch coverage.
//
//   node <claude-config>/tools/matrix/matrix.ts [--root <project>] [--dir <dir>] [--check] [--base <ref>]
//   node <claude-config>/tools/matrix/matrix.ts [--root <project>] [--dir <dir>] --stamp
//
// --dir is the project folder that holds config.json, matrix.md, state.json and
// specs-stamp.json (default: docs/traceability, relative to --root, which defaults to the
// current folder; it may also be absolute).
//
// --stamp records a fingerprint of the specs; the project's test target runs it right before
// the tests, so the check can tell results produced against other specs.
//
// Without --check it writes matrix.md (no test state: it is versioned) and state.json (with
// state, for the live view). With --check it writes nothing and exits 1 if there are tests
// without a scenario, scenarios without tests, failing or only skipped, missing or stale
// results, no scenarios at all, or if matrix.md is out of date. Errors in the specs (a scenario
// without ID, a duplicate ID or requirement) exit 1 in any mode; a flag without a value exits 2.
// Branch coverage is informative: it never blocks. Uncovered branches can be classified in a
// versioned file (config `classifications`, default branches.json): matrix.md lists the
// classified ones, and the live view shows them all.
// Why and how: the "Traceability matrix" section of the claude-config README.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

type TestState = 'pass' | 'fail' | 'skipped'
type ScenarioState = TestState | 'no-test'

// `container` is the describe (Vitest, Playwright) or group (Japa) the test lives in. It never carries the
// test's IDs (those go on the test itself), but it helps explain an orphan.
export type Test = { runner: string; level: string; file: string; title: string; state: TestState; container?: string }
export type Scenario = {
  id: string
  name: string
  capability: string
  requirement: string
  origin: string
  state: ScenarioState
  tests: Test[]
}

// Branch coverage. Every path of a branch counts on its own, as istanbul does. "New" are the
// branches that start on a line that changes against the base branch (uncommitted changes and
// untracked files included).
type Count = { covered: number; total: number }

// Branch analysis: every uncovered branch, with its code and, once it has been classified, its
// class (the table of the global CLAUDE.md, "Tancament de la Story"). Classifications live in a
// versioned file of the project (config `classifications`, default branches.json), keyed by file
// and the trimmed text of the line, so they survive code moving up or down.
export const CLASSES = ['missing-criterion', 'dead-or-defensive', 'technical-decision', 'other-story'] as const
export type BranchClass = (typeof CLASSES)[number]
export type Classification = { file: string; code: string; class: BranchClass; note: string; ref?: string }
export type UncoveredBranch = {
  file: string
  line: number
  // istanbul branch type (if, cond-expr, binary-expr, default-arg, switch…); "module" when no
  // test ever loads the file, which c8 reports as one branch on line 1.
  type: string
  // The first line of the branch's range with something on it (a V8 block often starts on the
  // closing brace of the previous one), and how many uncovered paths share it.
  code: string
  paths: number
  isNew: boolean
  classification?: Omit<Classification, 'file' | 'code'>
}
export type FileCoverage = { file: string; total: number; uncovered: number; moduleNotRun: boolean }
export type LayerCoverage = {
  layer: string
  available: boolean
  global: Count
  new: Count
  // New-code branches only, as before; `branches` has them all.
  uncovered: { file: string; line: number }[]
  files: FileCoverage[]
  branches: UncoveredBranch[]
}
export type Coverage = {
  base: string | null
  baseWarning?: string
  layers: LayerCoverage[]
  // Entries of the classifications file that match no uncovered branch: covered since, or gone.
  obsolete: Classification[]
  classificationErrors: string[]
}

export type Result = {
  scenarios: Scenario[]
  orphans: Test[]
  missingResults: string[]
  // Results older than the newest spec: they cannot say anything about the current scenarios.
  staleResults: string[]
  errors: string[]
  // Set when this tool runs from a claude-config checkout that is not a clean main.
  toolWarning?: string
  coverage: Coverage
  markdown: string
}

// `levels` (Japa) maps a suite name to a test level; `level` (Vitest, Playwright) sets the level of
// the whole runner. Defaults: Japa "unit" → unit, "e2e" → e2e, any other suite → public interface;
// Vitest → component; Playwright → e2e.
// `ignoreProjects` (Playwright) lists projects whose runs are not tests of a scenario (a setup).
type ResultSource = {
  runner: string
  file: string
  root?: string
  levels?: Record<string, string>
  level?: string
  ignoreProjects?: string[]
}
type Config = {
  results: ResultSource[]
  baseBranch?: string
  coverage?: { layer: string; file: string }[]
  // File with the branch classifications, relative to --dir. Default: branches.json.
  classifications?: string
}
type SpecScenario = Omit<Scenario, 'state' | 'tests'>
export type Paths = { root: string; dir: string }

// One ID per scenario, unique across the repo: SC-1, SC-2… Capability and requirement are
// columns of their own in the matrix, so the ID does not repeat them.
// A test's IDs are the ones its title starts with: "SC-7 · …" or "SC-7 SC-8 · …". An ID anywhere
// else in the title, or glued to other characters (SC-1.5, x-SC-3), does not count.
const LEADING_IDS = /^\s*(SC-\d+(?:[\s,]+SC-\d+)*)(?=\s|·|:|$)/
const idsOf = (title: string): string[] => [...new Set(title.match(LEADING_IDS)?.[1].match(/SC-\d+/g) ?? [])]

const toPosix = (p: string) => p.split(sep).join('/').replace(/\\/g, '/')
// `dir` may be relative to the project root or absolute.
const dirOf = (p: Paths) => resolve(p.root, p.dir)
const file = (p: Paths, name: string) => join(dirOf(p), name)

// ---------- Specs ----------

function specsIn(dir: string): { capability: string; path: string }[] {
  if (!existsSync(dir)) return []
  const out: { capability: string; path: string }[] = []
  const visit = (current: string) => {
    for (const e of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(current, e.name)
      if (e.isDirectory()) visit(path)
      else if (e.name === 'spec.md') out.push({ capability: toPosix(relative(dir, current)), path })
    }
  }
  visit(dir)
  return out
}

type Block = { section: string; requirement: string; scenarios: { id: string | null; name: string }[] }
type Spec = { blocks: Block[]; renames: { from: string; to: string }[] }

// Same delta format OpenSpec parses: requirement blocks under ADDED/MODIFIED/REMOVED, and
// `FROM:`/`TO:` pairs under RENAMED. Lines inside code fences are ignored, as OpenSpec does.
function readSpec(path: string): Spec {
  const blocks: Block[] = []
  const renames: { from: string; to: string }[] = []
  let section = 'MAIN'
  let current: Block | null = null
  let fence: string | null = null
  let pendingFrom: string | null = null
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const fenceMark = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMark) {
      if (!fence) fence = fenceMark[1][0]
      else if (fenceMark[1][0] === fence) fence = null
      continue
    }
    if (fence) continue
    const header = line.match(/^## (.+?)\s*$/)
    if (header) {
      const delta = header[1].match(/^(ADDED|MODIFIED|REMOVED|RENAMED) Requirements$/)
      section = delta ? delta[1] : 'MAIN'
      current = null
      pendingFrom = null
      continue
    }
    if (section === 'RENAMED') {
      const from = line.match(/^\s*[-*+]?\s*FROM:\s*`?###\s*Requirement:\s*(.+?)`?\s*$/)
      const to = line.match(/^\s*[-*+]?\s*TO:\s*`?###\s*Requirement:\s*(.+?)`?\s*$/)
      if (from) pendingFrom = from[1].trim()
      else if (to && pendingFrom) {
        renames.push({ from: pendingFrom, to: to[1].trim() })
        pendingFrom = null
      }
      continue
    }
    const req = line.match(/^### Requirement:\s*(.+?)\s*$/)
    if (req) {
      current = { section, requirement: req[1], scenarios: [] }
      blocks.push(current)
      continue
    }
    const sc = line.match(/^#### Scenario:\s*(.+?)\s*$/)
    if (sc && current) {
      const withId = sc[1].match(/^\[(SC-\d+)\]\s*(.*)$/)
      current.scenarios.push(withId ? { id: withId[1], name: withId[2] } : { id: null, name: sc[1] })
    }
  }
  return { blocks, renames }
}

function readScenarios(root: string, errors: string[]): SpecScenario[] {
  const byRequirement = new Map<string, SpecScenario[]>()
  const key = (cap: string, req: string) => `${cap}\u0000${req}`
  const seen = new Set<string>()

  const valid = (id: string | null, name: string, where: string): id is string => {
    if (!id) {
      errors.push(`Scenario without ID in ${where}: "${name}". Add [SC-n] to its title, with the next free number.`)
      return false
    }
    return true
  }

  for (const { capability, path } of specsIn(join(root, 'openspec/specs'))) {
    const where = toPosix(relative(root, path))
    for (const b of readSpec(path).blocks) {
      const list: SpecScenario[] = []
      for (const s of b.scenarios) {
        if (!valid(s.id, s.name, where)) continue
        if (seen.has(s.id)) errors.push(`Duplicate ID: ${s.id} (${where}).`)
        seen.add(s.id)
        list.push({ id: s.id, name: s.name, capability, requirement: b.requirement, origin: 'spec' })
      }
      if (byRequirement.has(key(capability, b.requirement))) {
        errors.push(`Duplicate requirement in ${where}: "${b.requirement}". Each requirement appears once per capability.`)
      }
      byRequirement.set(key(capability, b.requirement), list)
    }
  }

  const changesDir = join(root, 'openspec/changes')
  const changes = existsSync(changesDir)
    ? readdirSync(changesDir, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'archive').map((d) => d.name).sort()
    : []
  for (const change of changes) {
    const origin = `change: ${change}`
    for (const { capability, path } of specsIn(join(changesDir, change, 'specs'))) {
      const where = toPosix(relative(root, path))
      const spec = readSpec(path)
      // Same order OpenSpec applies a delta in: RENAMED → REMOVED → MODIFIED → ADDED.
      for (const { from, to } of spec.renames) {
        const moved = byRequirement.get(key(capability, from))
        if (!moved) continue
        byRequirement.delete(key(capability, from))
        byRequirement.set(key(capability, to), moved.map((s) => ({ ...s, requirement: to, origin })))
      }
      const ordered = ['REMOVED', 'MODIFIED', 'ADDED'].flatMap((section) => spec.blocks.filter((b) => b.section === section))
      for (const b of ordered) {
        const k = key(capability, b.requirement)
        if (b.section === 'REMOVED') {
          for (const s of byRequirement.get(k) ?? []) seen.delete(s.id)
          byRequirement.delete(k)
          continue
        }
        const previous = new Set((byRequirement.get(k) ?? []).map((s) => s.id))
        // MODIFIED replaces the whole block: the IDs it drops are free of its old scenarios.
        if (b.section === 'MODIFIED') for (const id of previous) seen.delete(id)
        const list: SpecScenario[] = []
        for (const s of b.scenarios) {
          if (!valid(s.id, s.name, where)) continue
          if (seen.has(s.id)) {
            errors.push(`Duplicate ID: ${s.id} (${where}).`)
          }
          seen.add(s.id)
          list.push({ id: s.id, name: s.name, capability, requirement: b.requirement, origin })
        }
        byRequirement.set(k, list)
      }
    }
  }

  return [...byRequirement.values()].flat()
}

// ---------- Test results ----------

// Japa, ndjson reporter. Non-JSON lines (other reporters, logs) are ignored, so the file can be
// the whole tee'd output of the run. `root` is the folder Japa runs from, relative to the project.
const JAPA_LEVELS: Record<string, string> = { unit: 'unit', e2e: 'e2e' }

function readJapa(text: string, source: ResultSource): Test[] {
  const levels = { ...JAPA_LEVELS, ...(source.levels ?? {}) }
  const tests: Test[] = []
  let suite = ''
  let group = ''
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue
    let ev: Record<string, any>
    try {
      ev = JSON.parse(line)
    } catch {
      continue
    }
    if (ev.event === 'suite:start') suite = ev.name
    if (ev.event === 'group:start') group = ev.title ?? ''
    if (ev.event === 'group:end') group = ''
    if (ev.event !== 'test:end') continue
    const state: TestState = ev.isSkipped || ev.isTodo ? 'skipped' : (ev.errors ?? []).length ? 'fail' : 'pass'
    tests.push({
      runner: 'japa',
      level: levels[suite] ?? 'public interface',
      file: toPosix(join(source.root ?? '', ev.relativePath ?? '')),
      title: ev.title?.expanded ?? ev.title?.original ?? '',
      state,
      ...(group ? { container: group } : {}),
    })
  }
  return tests
}

// Vitest, json reporter.
function readVitest(text: string, source: ResultSource, root: string, errors: string[]): Test[] {
  let report: Record<string, any>
  try {
    report = JSON.parse(text)
  } catch {
    errors.push(`The vitest results in ${source.file} are not valid JSON (a run cut short?). Run the tests again.`)
    return []
  }
  const tests: Test[] = []
  for (const f of report.testResults ?? []) {
    const path = toPosix(relative(root, f.name))
    if (f.status === 'failed' && !(f.assertionResults ?? []).length) {
      errors.push(`vitest could not run ${path}: ${String(f.message ?? '').split('\n')[0]}`)
    }
    for (const a of f.assertionResults ?? []) {
      const state: TestState = a.status === 'passed' ? 'pass' : a.status === 'failed' ? 'fail' : 'skipped'
      const container = (a.ancestorTitles ?? []).join(' › ')
      tests.push({ runner: 'vitest', level: source.level ?? 'component', file: path, title: a.title, state, ...(container ? { container } : {}) })
    }
  }
  return tests
}

// Playwright, json reporter. Paths in the report are relative to the test directory
// (`config.rootDir`). A spec runs once per project (browser); it counts as ONE test whose state
// is the worst of its runs (fail > pass > skipped), so matrix.md does not depend on how many
// browsers ran. `flaky` (passed on a retry) counts as pass, as a retried Vitest test does.
// `ignoreProjects` drops projects that are not tests of a scenario, such as an auth setup. A
// run that dies before any test (a webServer that does not start) leaves its reason in the
// top-level `errors`.
const ANSI = /\u001b\[[0-9;]*m/g

function readPlaywright(text: string, source: ResultSource, root: string, errors: string[]): Test[] {
  let report: Record<string, any>
  try {
    report = JSON.parse(text)
  } catch {
    errors.push(`The playwright results in ${source.file} are not valid JSON (a run cut short?). Run the tests again.`)
    return []
  }
  for (const e of report.errors ?? []) {
    const lines = String(e.message ?? e.value ?? '').replace(ANSI, '').split(/\r?\n/)
    errors.push(`playwright could not run: ${lines.find((l) => l.trim()) ?? '(no message)'}`)
  }
  const ignored = new Set(source.ignoreProjects ?? [])
  const testDir = String(report.config?.rootDir ?? root)
  const tests: Test[] = []
  const stateOf = (status: string): TestState =>
    status === 'skipped' ? 'skipped' : status === 'expected' || status === 'flaky' ? 'pass' : 'fail'
  const walk = (suite: Record<string, any>, describes: string[]) => {
    for (const spec of suite.specs ?? []) {
      const runs = ((spec.tests ?? []) as Record<string, any>[]).filter((t) => !ignored.has(t.projectName))
      if (!runs.length) continue
      const states = runs.map((t) => stateOf(t.status))
      const state: TestState = states.includes('fail') ? 'fail' : states.includes('pass') ? 'pass' : 'skipped'
      const path = toPosix(relative(root, join(testDir, spec.file ?? suite.file ?? '')))
      const container = describes.join(' › ')
      tests.push({ runner: 'playwright', level: source.level ?? 'e2e', file: path, title: spec.title, state, ...(container ? { container } : {}) })
    }
    for (const child of suite.suites ?? []) walk(child, child.title ? [...describes, child.title] : describes)
  }
  // Top-level suites are files: their title is the path, not a describe.
  for (const file of report.suites ?? []) walk(file, [])
  return tests
}

// ---------- Matrix ----------

const cell = (s: string) => s.replace(/\|/g, '\\|')

const CLASS_LABELS: Record<BranchClass, string> = {
  'missing-criterion': 'Missing criterion',
  'dead-or-defensive': 'Dead or defensive code',
  'technical-decision': 'Technical decision',
  'other-story': "Another story's code",
}

function markdown(scenarios: Scenario[], orphans: Test[], classifications: Classification[]): string {
  const l: string[] = [
    '# Traceability matrix',
    '',
    '<!-- Generated by claude-config/tools/matrix/matrix.ts: do not edit by hand. -->',
    '',
    'Which tests verify each OpenSpec scenario. Test state is not versioned: the live view shows it (see the "Traceability matrix" section of the claude-config README).',
    '',
    '| Capability | Requirement | Scenario | Tests |',
    '|---|---|---|---|',
  ]
  for (const cap of [...new Set(scenarios.map((s) => s.capability))].sort()) {
    for (const s of scenarios.filter((x) => x.capability === cap)) {
      const inProgress = s.origin === 'spec' ? '' : ` _(${s.origin})_`
      const tests = s.tests.length ? s.tests.map((t) => `${cell(t.title)} (${t.level}, \`${t.file}\`)`).join('<br>') : '—'
      l.push(`| ${cap} | ${cell(s.requirement)} | ${s.id} · ${cell(s.name)}${inProgress} | ${tests} |`)
    }
  }
  l.push('', '## Tests without a scenario', '')
  if (orphans.length) for (const t of orphans) l.push(`- ${t.title} (${t.level}, \`${t.file}\`)`)
  else l.push('None.')
  // Only the decisions, taken from the versioned classifications file: no coverage figures, so
  // the matrix does not churn with every run. The live view shows what is still unclassified.
  if (classifications.length) {
    l.push('', '## Classified uncovered branches', '', '| File | Code | Class | Why | Ref |', '|---|---|---|---|---|')
    // Plain code-unit order, not localeCompare: matrix.md must come out the same on every machine.
    const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0)
    const sorted = [...classifications].sort((a, b) => cmp(a.file, b.file) || cmp(a.code, b.code))
    // A line break in a hand-written note would break the table row.
    const flat = (s: string) => cell(s.replace(/\s*\r?\n\s*/g, ' '))
    for (const c of sorted) {
      // Code with backticks needs a longer fence: `` a `b` ``.
      const fence = c.code.includes('`') ? '``' : '`'
      const code = c.code === MODULE_NOT_RUN ? '_(whole module)_' : `${fence} ${cell(c.code)} ${fence}`
      l.push(`| \`${c.file}\` | ${code} | ${CLASS_LABELS[c.class]} | ${flat(c.note)} | ${c.ref ? flat(c.ref) : '—'} |`)
    }
  }
  return l.join('\n') + '\n'
}

// ---------- Coverage ----------

const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })

// Path of a `+++ ` line: git appends a TAB to names with spaces, and C-quotes names with
// special characters ("b/a\"b.ts"). With core.quotepath=false non-ASCII names come as is.
function diffPath(raw: string): string {
  let p = raw.replace(/\t$/, '')
  if (p.startsWith('"') && p.endsWith('"')) {
    const bytes: number[] = []
    const body = p.slice(1, -1)
    for (let i = 0; i < body.length; i++) {
      const c = body[i]
      if (c !== '\\') {
        bytes.push(...Buffer.from(c, 'utf8'))
        continue
      }
      const n = body[++i]
      if (/[0-7]/.test(n)) {
        bytes.push(parseInt(body.slice(i, i + 3), 8))
        i += 2
      } else bytes.push(({ n: 10, t: 9, r: 13, '"': 34, '\\': 92 } as Record<string, number>)[n] ?? n.charCodeAt(0))
    }
    p = Buffer.from(bytes).toString('utf8')
  }
  return p.replace(/^b\//, '')
}

const MAX_UNTRACKED_BYTES = 1024 * 1024

// Added or modified lines per file, relative to `root` (which may be a subfolder of the git
// repo), since the point where the branch leaves the base.
function changedLines(root: string, base: string): Map<string, Set<number>> {
  const since = git(root, 'merge-base', 'HEAD', base).trim()
  const changes = new Map<string, Set<number>>()
  let current = ''
  const diff = git(root, '-c', 'core.quotepath=false', 'diff', '--relative', '--unified=0', '--no-color', '--no-renames', '--no-ext-diff', since, '--')
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      current = line === '+++ /dev/null' ? '' : diffPath(line.slice(4))
      continue
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (!hunk || !current) continue
    const start = Number(hunk[1])
    const n = hunk[2] === undefined ? 1 : Number(hunk[2])
    const set = changes.get(current) ?? new Set<number>()
    for (let i = start; i < start + n; i++) set.add(i)
    changes.set(current, set)
  }
  // New, still untracked files count in full. -z: no quoting at all. Each file on its own, so
  // one that cannot be read (a link, a binary, something huge) does not sink the rest.
  for (const untracked of git(root, 'ls-files', '-z', '--others', '--exclude-standard').split('\0').filter(Boolean)) {
    try {
      const path = join(root, untracked)
      const info = lstatSync(path)
      if (!info.isFile() || info.size > MAX_UNTRACKED_BYTES) continue
      const content = readFileSync(path)
      if (content.includes(0)) continue
      const lines = content.toString('utf8').split('\n').length
      changes.set(toPosix(untracked), new Set(Array.from({ length: lines }, (_, i) => i + 1)))
    } catch {
      // Unreadable: it simply does not count as new code.
    }
  }
  return changes
}

// The classifications file. A missing file is no classification at all; a malformed one is
// reported (it never blocks: coverage is informative) and ignored.
function readClassifications(p: Paths, config: Config, errors: string[]): Classification[] {
  const name = config.classifications ?? 'branches.json'
  const path = file(p, name)
  if (!existsSync(path)) return []
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    errors.push(`${name} is not valid JSON: branch classifications ignored.`)
    return []
  }
  if (!Array.isArray(raw)) {
    errors.push(`${name} must be a JSON array: branch classifications ignored.`)
    return []
  }
  const out: Classification[] = []
  raw.forEach((e: any, i) => {
    if (typeof e?.file !== 'string' || typeof e?.code !== 'string' || typeof e?.note !== 'string' || !CLASSES.includes(e?.class)) {
      errors.push(`${name}, entry ${i + 1}: needs file, code, note and a class among ${CLASSES.join(', ')}.`)
      return
    }
    out.push({ file: toPosix(e.file), code: e.code.trim(), class: e.class, note: e.note, ...(typeof e.ref === 'string' ? { ref: e.ref } : {}) })
  })
  return out
}

// Key of a branch for its classification: the file and the trimmed text of its line; "*" for a
// module no test loads.
const branchKey = (file: string, code: string) => `${file}\0${code}`
export const MODULE_NOT_RUN = '*'

function coverage(p: Paths, config: Config, forcedBase?: string): Coverage {
  const root = p.root
  const classificationErrors: string[] = []
  const classifications = readClassifications(p, config, classificationErrors)
  const byKey = new Map(classifications.map((c) => [branchKey(c.file, c.code), c]))
  const used = new Set<string>()
  const sources = new Map<string, string[]>()
  // First line of [start, end] with something besides braces and punctuation on it.
  const codeOf = (abs: string, start: number, end: number): { line: number; code: string } => {
    if (!sources.has(abs)) {
      try {
        sources.set(abs, readFileSync(abs, 'utf8').split(/\r?\n/))
      } catch {
        sources.set(abs, [])
      }
    }
    const lines = sources.get(abs)!
    const last = Math.min(Math.max(end, start), start + 50)
    for (let n = start; n <= last; n++) {
      const text = (lines[n - 1] ?? '').trim()
      if (text && !/^[\s{}()[\];,]*$/.test(text)) return { line: n, code: text }
    }
    return { line: start, code: (lines[start - 1] ?? '').trim() }
  }
  const base = forcedBase ?? config.baseBranch ?? null
  let changes: Map<string, Set<number>> | null = null
  let baseWarning: string | undefined
  if (base) {
    try {
      changes = changedLines(root, base)
    } catch {
      baseWarning = `Could not compare against "${base}": coverage of new code is not available.`
    }
  }

  const layers = (config.coverage ?? []).map(({ layer, file: path }): LayerCoverage => {
    const empty: LayerCoverage = {
      layer,
      available: false,
      global: { covered: 0, total: 0 },
      new: { covered: 0, total: 0 },
      uncovered: [],
      files: [],
      branches: [],
    }
    const report = join(root, path)
    if (!existsSync(report)) return empty
    let data: Record<string, any>
    try {
      data = JSON.parse(readFileSync(report, 'utf8'))
    } catch {
      return empty
    }
    const c: LayerCoverage = { ...empty, available: true }
    const classify = (b: Omit<UncoveredBranch, 'classification'>): UncoveredBranch => {
      const key = branchKey(b.file, b.type === 'module' ? MODULE_NOT_RUN : b.code)
      const found = byKey.get(key)
      if (!found) return b
      used.add(key)
      const { file: _f, code: _c, ...classification } = found
      return { ...b, classification }
    }
    for (const f of Object.values(data)) {
      const rel = toPosix(relative(root, f.path))
      const changed = changes?.get(rel)
      // A file no test loads: every statement and every function at 0. c8 reports it as one branch
      // on line 1; it is one finding (the whole module), not a branch of line 1. Requiring the
      // functions too keeps a loaded file whose only function is never called out of it.
      const statements = Object.values<number>(f.s ?? {})
      const functions = Object.values<number>(f.f ?? {})
      const moduleNotRun = statements.length > 0 && statements.every((n) => n === 0) && functions.every((n) => n === 0)
      const fc: FileCoverage = { file: rel, total: 0, uncovered: 0, moduleNotRun }
      // Paths of one branch that land on the same line and code are one finding.
      const own = new Map<string, UncoveredBranch>()
      const add = (b: Omit<UncoveredBranch, 'classification' | 'paths'>) => {
        const k = `${b.line}\0${b.code}`
        const prev = own.get(k)
        if (prev) {
          prev.paths++
          prev.isNew ||= b.isNew
        } else own.set(k, classify({ ...b, paths: 1 }))
      }
      for (const [id, branch] of Object.entries<any>(f.branchMap ?? {})) {
        const counts: number[] = f.b?.[id] ?? []
        ;(branch.locations ?? []).forEach((loc: any, i: number) => {
          const covered = (counts[i] ?? 0) > 0
          c.global.total++
          fc.total++
          if (covered) c.global.covered++
          else fc.uncovered++
          const line: number = loc?.start?.line ?? branch.loc?.start?.line ?? branch.line
          const isNew = changed?.has(line) ?? false
          if (isNew) {
            c.new.total++
            if (covered) c.new.covered++
            else c.uncovered.push({ file: rel, line })
          }
          if (!covered && !moduleNotRun) {
            const end: number = loc?.end?.line ?? line
            const shown = codeOf(f.path, line, end)
            // New if any line from the block's start to the code shown changed: a V8 block often
            // starts on an old closing brace before the new code.
            let touched = isNew
            for (let n = line; !touched && n <= shown.line; n++) touched = changed?.has(n) ?? false
            add({ file: rel, ...shown, type: String(branch.type ?? 'branch'), isNew: touched })
          }
        })
      }
      if (moduleNotRun && fc.uncovered) {
        const isNew = changed ? changed.size > 0 : false
        add({ file: rel, line: 1, type: 'module', code: 'no test loads this module', isNew })
      }
      if (fc.total) c.files.push(fc)
      c.branches.push(...own.values())
    }
    c.uncovered.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    c.files.sort((a, b) => a.file.localeCompare(b.file))
    c.branches.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    return c
  })

  // Only when every layer had data: otherwise a missing report would make every entry "obsolete".
  const complete = layers.length > 0 && layers.every((l) => l.available)
  const obsolete = complete ? classifications.filter((cl) => !used.has(branchKey(cl.file, cl.code))) : []
  return { base: changes ? base : null, ...(baseWarning ? { baseWarning } : {}), layers, obsolete, classificationErrors }
}

// ---------- API ----------

export function generate(p: Paths, options: { base?: string } = {}): Result {
  const errors: string[] = []
  const config: Config = JSON.parse(readFileSync(file(p, 'config.json'), 'utf8'))
  const specs = readScenarios(p.root, errors)

  // Freshness by content, not by file dates: a pull, checkout or touch that does not change a
  // spec must not make results stale. See readStamp/stamp.
  const stamp = readStamp(p)
  const specsChanged = stamp !== null && stamp.hash !== specFingerprint(p.root)
  const tests: Test[] = []
  const missingResults: string[] = []
  const staleResults: string[] = []
  for (const source of config.results) {
    const report = join(p.root, source.file)
    const text = existsSync(report) ? readFileSync(report, 'utf8').trim() : ''
    if (!text) {
      missingResults.push(`${source.runner} (${source.file})`)
      continue
    }
    if (stamp) {
      if (specsChanged) staleResults.push(`${source.runner} (${source.file}): the specs changed after the last test run`)
      else if (statSync(report).mtimeMs < stamp.at) staleResults.push(`${source.runner} (${source.file}): not rerun in the last test run`)
    }
    if (source.runner === 'japa') tests.push(...readJapa(text, source))
    else if (source.runner === 'vitest') tests.push(...readVitest(text, source, p.root, errors))
    else if (source.runner === 'playwright') tests.push(...readPlaywright(text, source, p.root, errors))
    else errors.push(`Unknown runner in config.json: ${source.runner}.`)
  }

  const ids = new Set(specs.map((s) => s.id))
  const byId = new Map<string, Test[]>()
  const orphans: Test[] = []
  for (const t of tests) {
    const own = idsOf(t.title)
    if (!own.length || own.some((id) => !ids.has(id))) orphans.push(t)
    for (const id of own.filter((id) => ids.has(id))) byId.set(id, [...(byId.get(id) ?? []), t])
  }

  const scenarios: Scenario[] = specs.map((s) => {
    const own = byId.get(s.id) ?? []
    const state: ScenarioState = !own.length
      ? 'no-test'
      : own.some((t) => t.state === 'fail')
        ? 'fail'
        : own.some((t) => t.state === 'pass')
          ? 'pass'
          : 'skipped'
    // Stable order, whatever order the runners reported in, so matrix.md does not churn.
    const tests = [...own].sort((a, b) => a.file.localeCompare(b.file) || a.title.localeCompare(b.title))
    return { ...s, state, tests }
  })

  const toolWarning = toolCheckoutWarning()
  const cov = coverage(p, config, options.base)
  const classifications = readClassifications(p, config, [])
  return {
    scenarios,
    orphans,
    missingResults,
    staleResults,
    errors,
    ...(toolWarning ? { toolWarning } : {}),
    coverage: cov,
    markdown: markdown(scenarios, orphans, classifications),
  }
}

// ---------- Freshness stamp ----------

// Fingerprint of the scenarios the tests are meant to verify: the content of every living spec
// and every in-progress delta (archived changes excluded), with line endings normalised.
function specFingerprint(root: string): string {
  const files = [
    ...specsIn(join(root, 'openspec/specs')),
    ...specsIn(join(root, 'openspec/changes')).filter((s) => !s.capability.startsWith('archive/')),
  ]
    .map((s) => s.path)
    .sort()
  const h = createHash('sha256')
  for (const f of files) {
    let content = ''
    try {
      content = readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
    } catch {
      // Gone between listing and reading: it counts as empty.
    }
    h.update(toPosix(relative(root, f))).update('\0').update(content).update('\0')
  }
  return h.digest('hex')
}

type Stamp = { hash: string; at: number }

// Written by `--stamp` right before the tests run (the project's test target does it), so the
// check knows which specs the results were produced against. Without a stamp, freshness is not
// checked.
function readStamp(p: Paths): Stamp | null {
  try {
    const s = JSON.parse(readFileSync(file(p, 'specs-stamp.json'), 'utf8'))
    return typeof s.hash === 'string' && typeof s.at === 'number' ? s : null
  } catch {
    return null
  }
}

export function stamp(p: Paths): void {
  mkdirSync(dirOf(p), { recursive: true })
  writeFileSync(file(p, 'specs-stamp.json'), JSON.stringify({ hash: specFingerprint(p.root), at: Date.now() }))
}

// Every project runs this tool from the claude-config checkout as it stands, so a feature branch
// or uncommitted changes there change what every project's check does. Say so, without failing.
// The whole repo counts, not only tools/matrix: the global CLAUDE.md, skills and agents also
// shape how projects are checked. The expected branch is the remote's default (origin/HEAD),
// falling back to main.
function toolCheckoutWarning(): string | undefined {
  const toolDir = dirname(fileURLToPath(import.meta.url))
  try {
    const branch = git(toolDir, 'rev-parse', '--abbrev-ref', 'HEAD').trim()
    let expected = 'main'
    try {
      expected = git(toolDir, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD').trim().replace(/^origin\//, '') || 'main'
    } catch {
      // No origin/HEAD: keep main.
    }
    const dirty = git(toolDir, 'status', '--porcelain').trim() !== ''
    if (branch === expected && !dirty) return undefined
    const what = [branch !== expected ? `on branch "${branch}"` : '', dirty ? 'with uncommitted changes' : ''].filter(Boolean).join(' and ')
    return `The matrix tool runs from a claude-config checkout ${what}, not a clean ${expected}: results may differ from other projects.`
  } catch {
    return undefined
  }
}

export function problems(p: Paths, r: Result): string[] {
  const out: string[] = []
  const ids = (state: ScenarioState) => r.scenarios.filter((s) => s.state === state).map((s) => s.id)
  if (ids('no-test').length) out.push(`Scenarios without tests: ${ids('no-test').join(', ')}`)
  if (ids('fail').length) out.push(`Scenarios with failing tests: ${ids('fail').join(', ')}`)
  if (ids('skipped').length) out.push(`Scenarios with only skipped tests: ${ids('skipped').join(', ')}`)
  for (const t of r.orphans) {
    const hint = t.container && idsOf(t.container).length ? ` — the ID is on its describe/group "${t.container}"; it must be on the test itself` : ''
    out.push(`Test without a scenario: "${t.title}" (${t.file})${hint}`)
  }
  for (const m of r.missingResults) out.push(`Missing results from ${m}: run the tests first`)
  for (const s of r.staleResults) out.push(`Stale results from ${s}: run the tests again`)
  if (!r.scenarios.length) out.push('No scenarios found under openspec/: nothing to trace yet')
  const md = file(p, 'matrix.md')
  // Line endings do not count: a CRLF checkout (core.autocrlf) is not out of date.
  const sameText = (a: string, b: string) => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n')
  if (!existsSync(md) || !sameText(readFileSync(md, 'utf8'), r.markdown)) {
    // A broken classifications file drops its section from the generated matrix: say why.
    const why = r.coverage.classificationErrors.length ? ` (the branch classifications file has errors: ${r.coverage.classificationErrors.join(' ')})` : ''
    out.push(`${toPosix(join(p.dir, 'matrix.md'))} is out of date: regenerate the matrix and commit it${why}`)
  }
  return out
}

export function write(p: Paths, r: Result): void {
  mkdirSync(dirOf(p), { recursive: true })
  writeFileSync(file(p, 'matrix.md'), r.markdown)
  const { markdown: _md, ...state } = r
  writeFileSync(file(p, 'state.json'), JSON.stringify({ generatedAt: new Date().toISOString(), ...state }, null, 2))
}

// Value of a CLI flag. A flag present without a value (or followed by another flag) is an error,
// not a silent default.
export function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name)
  if (i < 0) return undefined
  const v = argv[i + 1]
  if (v === undefined || v.startsWith('-')) throw new Error(`${name} needs a value`)
  return v
}

export function pathsFrom(argv: string[]): Paths {
  return { root: resolve(flag(argv, '--root') ?? process.cwd()), dir: flag(argv, '--dir') ?? 'docs/traceability' }
}

function main(argv: string[]): number {
  let p: Paths
  let base: string | undefined
  try {
    p = pathsFrom(argv)
    base = flag(argv, '--base')
  } catch (e) {
    console.error(`✖ ${(e as Error).message}`)
    return 2
  }
  if (argv.includes('--stamp')) {
    stamp(p)
    return 0
  }
  const r = generate(p, base ? { base } : {})
  if (r.toolWarning) console.error(`! ${r.toolWarning}`)

  // Coverage never blocks: these are warnings in both modes, printed before anything can stop.
  for (const e of r.coverage.classificationErrors) console.error(`! ${e}`)
  if (r.errors.length) {
    for (const e of r.errors) console.error(`✖ ${e}`)
    return 1
  }
  const unclassifiedNew = r.coverage.layers.flatMap((l) => l.branches).filter((b) => b.isNew && !b.classification).length
  if (unclassifiedNew) console.error(`! ${unclassifiedNew} new uncovered branches not classified yet (see the live view).`)
  if (r.coverage.obsolete.length) console.error(`! ${r.coverage.obsolete.length} branch classifications match no uncovered branch: remove them.`)
  if (argv.includes('--check')) {
    const found = problems(p, r)
    for (const x of found) console.error(`✖ ${x}`)
    if (found.length) return 1
    console.log(`✔ Matrix is green: ${r.scenarios.length} scenarios, all with passing tests, and every test traced.`)
    return 0
  }
  write(p, r)
  const count = (state: ScenarioState) => r.scenarios.filter((s) => s.state === state).length
  console.log(
    `Matrix generated: ${r.scenarios.length} scenarios (${count('pass')} passing, ${count('fail')} failing, ` +
      `${count('no-test')} without tests, ${count('skipped')} skipped), ${r.orphans.length} tests without a scenario.`,
  )
  for (const m of r.missingResults) console.log(`  · No results from ${m}.`)
  const pct = (c: Count) => (c.total ? `${c.covered}/${c.total} (${Math.round((100 * c.covered) / c.total)}%)` : 'no branches')
  for (const c of r.coverage.layers) {
    if (!c.available) console.log(`  · Branches ${c.layer}: no coverage data.`)
    else {
      const left = c.branches.filter((b) => !b.classification).length
      console.log(
        `  · Branches ${c.layer}: global ${pct(c.global)}; new code vs ${r.coverage.base ?? '—'}: ${pct(c.new)}; ` +
          `${c.branches.length} uncovered findings, ${left} not classified.`,
      )
    }
  }
  if (r.coverage.baseWarning) console.log(`  · ${r.coverage.baseWarning}`)
  return 0
}

// True when this module is the script being run. Compares real paths (a CLAUDE_CONFIG behind a
// symlink, 8.3 short names) and, on Windows, ignores case, so the CLI never silently does nothing.
export function isMain(moduleUrl: string): boolean {
  if (!process.argv[1]) return false
  const real = (p: string) => {
    try {
      return realpathSync.native(p)
    } catch {
      return resolve(p)
    }
  }
  const norm = (p: string) => (process.platform === 'win32' ? real(p).toLowerCase() : real(p))
  return norm(process.argv[1]) === norm(fileURLToPath(moduleUrl))
}

if (isMain(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
