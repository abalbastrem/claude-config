// Traceability matrix: crosses OpenSpec scenarios with test results and branch coverage.
//
//   node <claude-config>/tools/matrix/matrix.ts [--root <project>] [--dir <dir>] [--check] [--base <ref>]
//
// --dir is the project folder that holds config.json, matrix.md and state.json
// (default: docs/traceability, relative to --root, which defaults to the current folder).
//
// Without --check it writes matrix.md (no test state: it is versioned) and state.json (with
// state, for the live view). With --check it writes nothing and exits with an error if there
// are tests without a scenario, scenarios without tests, failing or only skipped, missing
// results, or if matrix.md is out of date. Branch coverage is informative: it never blocks.
// Why and how: the "Traceability matrix" section of the claude-config README.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

type TestState = 'pass' | 'fail' | 'skipped'
type ScenarioState = TestState | 'no-test'

export type Test = { runner: string; level: string; file: string; title: string; state: TestState }
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
export type LayerCoverage = {
  layer: string
  available: boolean
  global: Count
  new: Count
  uncovered: { file: string; line: number }[]
}
export type Coverage = { base: string | null; baseWarning?: string; layers: LayerCoverage[] }

export type Result = {
  scenarios: Scenario[]
  orphans: Test[]
  missingResults: string[]
  errors: string[]
  coverage: Coverage
  markdown: string
}

type Config = {
  results: { runner: string; file: string; root?: string }[]
  baseBranch?: string
  coverage?: { layer: string; file: string }[]
}
type SpecScenario = Omit<Scenario, 'state' | 'tests'>
export type Paths = { root: string; dir: string }

// One ID per scenario, unique across the repo: SC-1, SC-2… Capability and requirement are
// columns of their own in the matrix, so the ID does not repeat them.
const ID_IN_TITLE = /\bSC-\d+\b/g

const toPosix = (p: string) => p.split(sep).join('/').replace(/\\/g, '/')
const file = (p: Paths, name: string) => join(p.root, p.dir, name)

// ---------- Specs ----------

function specsIn(dir: string): { capability: string; path: string }[] {
  if (!existsSync(dir)) return []
  const out: { capability: string; path: string }[] = []
  const visit = (current: string) => {
    for (const e of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, e.name)
      if (e.isDirectory()) visit(path)
      else if (e.name === 'spec.md') out.push({ capability: toPosix(relative(dir, current)), path })
    }
  }
  visit(dir)
  return out
}

type Block = { section: string; requirement: string; scenarios: { id: string | null; name: string }[] }

function readSpec(path: string): Block[] {
  const blocks: Block[] = []
  let section = 'MAIN'
  let current: Block | null = null
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const delta = line.match(/^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements/)
    if (delta) {
      section = delta[1]
      current = null
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
  return blocks
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
    for (const b of readSpec(path)) {
      const list: SpecScenario[] = []
      for (const s of b.scenarios) {
        if (!valid(s.id, s.name, where)) continue
        if (seen.has(s.id)) errors.push(`Duplicate ID: ${s.id} (${where}).`)
        seen.add(s.id)
        list.push({ id: s.id, name: s.name, capability, requirement: b.requirement, origin: 'spec' })
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
      for (const b of readSpec(path)) {
        const k = key(capability, b.requirement)
        if (b.section === 'REMOVED') {
          byRequirement.delete(k)
          continue
        }
        if (b.section !== 'ADDED' && b.section !== 'MODIFIED') continue
        const previous = new Set((byRequirement.get(k) ?? []).map((s) => s.id))
        const list: SpecScenario[] = []
        for (const s of b.scenarios) {
          if (!valid(s.id, s.name, where)) continue
          if (seen.has(s.id) && !(b.section === 'MODIFIED' && previous.has(s.id))) {
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
function readJapa(text: string, runnerRoot: string): Test[] {
  const tests: Test[] = []
  let suite = ''
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue
    let ev: Record<string, any>
    try {
      ev = JSON.parse(line)
    } catch {
      continue
    }
    if (ev.event === 'suite:start') suite = ev.name
    if (ev.event !== 'test:end') continue
    const state: TestState = ev.isSkipped || ev.isTodo ? 'skipped' : (ev.errors ?? []).length ? 'fail' : 'pass'
    tests.push({
      runner: 'japa',
      level: suite === 'unit' ? 'unit' : 'public interface',
      file: toPosix(join(runnerRoot, ev.relativePath ?? '')),
      title: ev.title?.expanded ?? ev.title?.original ?? '',
      state,
    })
  }
  return tests
}

// Vitest, json reporter.
function readVitest(text: string, root: string, errors: string[]): Test[] {
  const report = JSON.parse(text)
  const tests: Test[] = []
  for (const f of report.testResults ?? []) {
    const path = toPosix(relative(root, f.name))
    if (f.status === 'failed' && !(f.assertionResults ?? []).length) {
      errors.push(`vitest could not run ${path}: ${String(f.message ?? '').split('\n')[0]}`)
    }
    for (const a of f.assertionResults ?? []) {
      const state: TestState = a.status === 'passed' ? 'pass' : a.status === 'failed' ? 'fail' : 'skipped'
      tests.push({ runner: 'vitest', level: 'component', file: path, title: a.title, state })
    }
  }
  return tests
}

// ---------- Matrix ----------

const cell = (s: string) => s.replace(/\|/g, '\\|')

function markdown(scenarios: Scenario[], orphans: Test[]): string {
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
  return l.join('\n') + '\n'
}

// ---------- Coverage ----------

const git = (root: string, ...args: string[]) =>
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })

// Added or modified lines per file, since the point where the branch leaves the base.
function changedLines(root: string, base: string): Map<string, Set<number>> {
  const since = git(root, 'merge-base', 'HEAD', base).trim()
  const changes = new Map<string, Set<number>>()
  let current = ''
  for (const line of git(root, 'diff', '--unified=0', '--no-color', '--no-renames', since, '--').split('\n')) {
    if (line.startsWith('+++ ')) {
      current = line === '+++ /dev/null' ? '' : line.slice(6)
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
  // New, still untracked files count in full.
  for (const untracked of git(root, 'ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) {
    const lines = readFileSync(join(root, untracked), 'utf8').split('\n').length
    changes.set(untracked, new Set(Array.from({ length: lines }, (_, i) => i + 1)))
  }
  return changes
}

function coverage(root: string, config: Config, forcedBase?: string): Coverage {
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
    const empty: LayerCoverage = { layer, available: false, global: { covered: 0, total: 0 }, new: { covered: 0, total: 0 }, uncovered: [] }
    const report = join(root, path)
    if (!existsSync(report)) return empty
    let data: Record<string, any>
    try {
      data = JSON.parse(readFileSync(report, 'utf8'))
    } catch {
      return empty
    }
    const c: LayerCoverage = { ...empty, available: true }
    for (const f of Object.values(data)) {
      const rel = toPosix(relative(root, f.path))
      const changed = changes?.get(rel)
      for (const [id, branch] of Object.entries<any>(f.branchMap ?? {})) {
        const counts: number[] = f.b?.[id] ?? []
        branch.locations.forEach((loc: any, i: number) => {
          const covered = (counts[i] ?? 0) > 0
          c.global.total++
          if (covered) c.global.covered++
          const line: number = loc?.start?.line ?? branch.loc?.start?.line ?? branch.line
          if (changed?.has(line)) {
            c.new.total++
            if (covered) c.new.covered++
            else c.uncovered.push({ file: rel, line })
          }
        })
      }
    }
    c.uncovered.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    return c
  })

  return { base: changes ? base : null, ...(baseWarning ? { baseWarning } : {}), layers }
}

// ---------- API ----------

export function generate(p: Paths, options: { base?: string } = {}): Result {
  const errors: string[] = []
  const config: Config = JSON.parse(readFileSync(file(p, 'config.json'), 'utf8'))
  const specs = readScenarios(p.root, errors)

  const tests: Test[] = []
  const missingResults: string[] = []
  for (const { runner, file: path, root: runnerRoot } of config.results) {
    const report = join(p.root, path)
    const text = existsSync(report) ? readFileSync(report, 'utf8').trim() : ''
    if (!text) {
      missingResults.push(`${runner} (${path})`)
      continue
    }
    if (runner === 'japa') tests.push(...readJapa(text, runnerRoot ?? ''))
    else if (runner === 'vitest') tests.push(...readVitest(text, p.root, errors))
    else errors.push(`Unknown runner in config.json: ${runner}.`)
  }

  const ids = new Set(specs.map((s) => s.id))
  const byId = new Map<string, Test[]>()
  const orphans: Test[] = []
  for (const t of tests) {
    const own = [...new Set(t.title.match(ID_IN_TITLE) ?? [])]
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
    return { ...s, state, tests: own }
  })

  return {
    scenarios,
    orphans,
    missingResults,
    errors,
    coverage: coverage(p.root, config, options.base),
    markdown: markdown(scenarios, orphans),
  }
}

export function problems(p: Paths, r: Result): string[] {
  const out: string[] = []
  const ids = (state: ScenarioState) => r.scenarios.filter((s) => s.state === state).map((s) => s.id)
  if (ids('no-test').length) out.push(`Scenarios without tests: ${ids('no-test').join(', ')}`)
  if (ids('fail').length) out.push(`Scenarios with failing tests: ${ids('fail').join(', ')}`)
  if (ids('skipped').length) out.push(`Scenarios with only skipped tests: ${ids('skipped').join(', ')}`)
  for (const t of r.orphans) out.push(`Test without a scenario: "${t.title}" (${t.file})`)
  for (const m of r.missingResults) out.push(`Missing results from ${m}: run the tests first`)
  const md = file(p, 'matrix.md')
  if (!existsSync(md) || readFileSync(md, 'utf8') !== r.markdown) {
    out.push(`${toPosix(join(p.dir, 'matrix.md'))} is out of date: regenerate the matrix and commit it`)
  }
  return out
}

export function write(p: Paths, r: Result): void {
  mkdirSync(join(p.root, p.dir), { recursive: true })
  writeFileSync(file(p, 'matrix.md'), r.markdown)
  const { markdown: _md, ...state } = r
  writeFileSync(file(p, 'state.json'), JSON.stringify({ generatedAt: new Date().toISOString(), ...state }, null, 2))
}

export function pathsFrom(argv: string[]): Paths {
  const value = (flag: string) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined)
  return { root: resolve(value('--root') ?? process.cwd()), dir: value('--dir') ?? 'docs/traceability' }
}

function main(argv: string[]): number {
  const p = pathsFrom(argv)
  const b = argv.indexOf('--base')
  const r = generate(p, b >= 0 ? { base: argv[b + 1] } : {})

  if (r.errors.length) {
    for (const e of r.errors) console.error(`✖ ${e}`)
    return 1
  }
  if (argv.includes('--check')) {
    const found = problems(p, r)
    for (const x of found) console.error(`✖ ${x}`)
    if (found.length) return 1
    console.log(`✔ Matrix is green: ${r.scenarios.length} scenarios, all with passing tests.`)
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
    else console.log(`  · Branches ${c.layer}: global ${pct(c.global)}; new code vs ${r.coverage.base ?? '—'}: ${pct(c.new)}.`)
  }
  if (r.coverage.baseWarning) console.log(`  · ${r.coverage.baseWarning}`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
