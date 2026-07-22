/**
 * hookScan — 훅 설정 인벤토리 스캐너 (docs/goal/hooks-analytics.md D4)
 *
 * 읽는 소스는 정확히 4종뿐이다:
 *  1. 관리형(managed) 설정 — 플랫폼별 고정 경로
 *  2. 사용자 `~/.claude/settings.json`
 *  3. 현재 프로젝트 `settings.json` + `settings.local.json`
 *     (프로젝트 루트 = CLI/서버 실행 루트 — 트랜스크립트 유래 cwd 절대 금지)
 *  4. 활성 플러그인의 `hooks/hooks.json`
 *     (installed_plugins.json ∩ enabledPlugins — 설치돼도 비활성이면 제외)
 *
 * 읽기 게이트 (no-egress by construction):
 *  - UNC 경로 거부, realpath 봉쇄(symlink 이탈 차단), 1MB 캡
 *  - 파싱 결과에서 `hooks`(+플러그인 게이트용 `enabledPlugins`) 키만 추출 —
 *    env 등 다른 설정 내용은 메모리에 보관하지 않는다
 *  - 오류는 {filePath, errorCode} 만 보고 (내용 미포함)
 *
 * 매처 컴파일은 절대 throw 하지 않는다: null/''/'*' = 전체 매치,
 * 잘못된 정규식은 리터럴 동등 비교로 폴백 (교차 심문 바인딩).
 *
 * cli/index.mjs 와 vite.config.ts(dev 미러)가 공유하는 단일 소스다.
 * 테스트(tests/hook-events.test.mts)가 직접 import 하므로 부수효과 없는
 * 순수 모듈로 유지할 것.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { commandDigest, asciiSkeleton } from './hookExtract.mjs'
import { maskSecrets } from './secretMask.mjs'

const MAX_HOOKS_FILE_BYTES = 1024 * 1024

function isUncPath(p) {
  return /^[\\/]{2}/.test(String(p))
}

function normalizeFsPath(p) {
  const resolved = path.resolve(String(p))
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function defaultManagedPaths() {
  if (process.platform === 'win32') {
    const programData = process.env.PROGRAMDATA || 'C:\\ProgramData'
    return [path.join(programData, 'ClaudeCode', 'managed-settings.json')]
  }
  if (process.platform === 'darwin') {
    return ['/Library/Application Support/ClaudeCode/managed-settings.json']
  }
  return ['/etc/claude-code/managed-settings.json']
}

/**
 * 게이트 통과 후 `hooks`/`enabledPlugins` 키만 추출해 반환.
 * 파일 부재는 정상(null, 오류 아님). 실패는 errors 에 {filePath, errorCode}.
 */
function readGatedConfig(filePath, containRoot, errors) {
  if (isUncPath(filePath)) {
    errors.push({ filePath, errorCode: 'UNC_REJECTED' })
    return null
  }
  if (!fs.existsSync(filePath)) return null
  try {
    const real = fs.realpathSync(filePath)
    if (isUncPath(real)) {
      errors.push({ filePath, errorCode: 'UNC_REJECTED' })
      return null
    }
    if (containRoot) {
      const realRoot = fs.realpathSync(containRoot)
      const nReal = normalizeFsPath(real)
      const nRoot = normalizeFsPath(realRoot)
      // 경로 구분자 경계까지 확인 — 형제 프리픽스(예: .claude-evil 이 .claude 로
      // 시작) 우회를 차단한다. 루트 자신은 허용. 드라이브/파일시스템 루트(C:\, /)는
      // path.resolve 가 후행 구분자를 남기므로 이중 구분자를 피한다.
      const rootWithSep = nRoot.endsWith(path.sep) ? nRoot : nRoot + path.sep
      if (nReal !== nRoot && !nReal.startsWith(rootWithSep)) {
        errors.push({ filePath, errorCode: 'PATH_ESCAPE' })
        return null
      }
    }
    const stat = fs.statSync(real)
    if (stat.size > MAX_HOOKS_FILE_BYTES) {
      errors.push({ filePath, errorCode: 'SIZE_CAP' })
      return null
    }
    const parsed = JSON.parse(fs.readFileSync(real, 'utf-8'))
    if (!parsed || typeof parsed !== 'object') return null
    // hooks + enabledPlugins 만 추출 — 나머지 설정 내용은 즉시 버린다
    return {
      hooks: parsed.hooks && typeof parsed.hooks === 'object' ? parsed.hooks : undefined,
      enabledPlugins: parsed.enabledPlugins && typeof parsed.enabledPlugins === 'object' ? parsed.enabledPlugins : undefined,
    }
  } catch {
    errors.push({ filePath, errorCode: 'READ_OR_PARSE_ERROR' })
    return null
  }
}

/** hooks 오브젝트 → 평탄한 엔트리 목록. 형태 이상은 조용히 건너뛴다 (fail-soft) */
function extractEntries(hooksObj, meta) {
  const out = []
  if (!hooksObj || typeof hooksObj !== 'object') return out
  for (const [event, groups] of Object.entries(hooksObj)) {
    if (!Array.isArray(groups)) continue
    for (const group of groups) {
      if (!group || typeof group !== 'object') continue
      const matcher = typeof group.matcher === 'string' ? group.matcher : null
      const hooks = Array.isArray(group.hooks) ? group.hooks : []
      for (const hook of hooks) {
        if (!hook || hook.type !== 'command' || typeof hook.command !== 'string') continue
        const raw = hook.command
        // ${CLAUDE_PLUGIN_ROOT} 는 설치 경로로 확장, $CLAUDE_PROJECT_DIR 는
        // 리터럴 유지 (텔레메트리 command 도 리터럴로 기록된다 — 실측)
        const expanded = meta.pluginRoot
          ? raw.split('${CLAUDE_PLUGIN_ROOT}').join(meta.pluginRoot)
          : raw
        const commandKeys = [...new Set([
          commandDigest(raw),
          commandDigest(expanded),
          commandDigest(asciiSkeleton(raw)),
          commandDigest(asciiSkeleton(expanded)),
        ])]
        out.push({
          event,
          matcher,
          command: raw,
          source: meta.source,
          sourceLabel: meta.sourceLabel,
          filePath: meta.filePath,
          scope: meta.scope,
          commandKeys,
        })
      }
    }
  }
  return out
}

/**
 * 훅 설정 인벤토리 스캔.
 *
 * @param {{ homeDir?: string, projectRoot?: string, managedPaths?: string[] }} [options]
 *   테스트 주입구 — 미지정 시 os.homedir() / process.cwd() / 플랫폼 기본 경로.
 * @returns {{ entries: object[], errors: Array<{filePath: string, errorCode: string}> }}
 */
export function scanHooks(options = {}) {
  const homeDir = options.homeDir || os.homedir()
  const projectRoot = options.projectRoot || process.cwd()
  const managedPaths = options.managedPaths || defaultManagedPaths()
  const errors = []
  const entries = []
  /** 'name@marketplace' 전체 키 기준 활성 집합 (bkit 함정 — 설치 ≠ 활성) */
  const enabledPluginKeys = new Set()
  const collectEnabled = (cfg) => {
    if (!cfg || !cfg.enabledPlugins) return
    for (const [key, value] of Object.entries(cfg.enabledPlugins)) {
      if (value === true) enabledPluginKeys.add(key)
    }
  }

  // 1. 관리형 설정
  for (const managedPath of managedPaths) {
    const cfg = readGatedConfig(managedPath, path.dirname(managedPath), errors)
    if (cfg?.hooks) {
      entries.push(...extractEntries(cfg.hooks, {
        source: 'managed', sourceLabel: '관리형 설정', filePath: managedPath, scope: 'global',
      }))
    }
    collectEnabled(cfg)
  }

  // 2. 사용자 설정
  const userSettingsPath = path.join(homeDir, '.claude', 'settings.json')
  const userCfg = readGatedConfig(userSettingsPath, path.join(homeDir, '.claude'), errors)
  if (userCfg?.hooks) {
    entries.push(...extractEntries(userCfg.hooks, {
      source: 'user', sourceLabel: '사용자 설정', filePath: userSettingsPath, scope: 'global',
    }))
  }
  collectEnabled(userCfg)

  // 3. 현재 프로젝트 설정 (실행 루트 고정 — 트랜스크립트 cwd 유래 경로 금지)
  const projectPairs = [
    { file: path.join(projectRoot, '.claude', 'settings.json'), source: 'project', sourceLabel: '프로젝트 설정' },
    { file: path.join(projectRoot, '.claude', 'settings.local.json'), source: 'project-local', sourceLabel: '프로젝트 로컬 설정' },
  ]
  for (const { file, source, sourceLabel } of projectPairs) {
    const cfg = readGatedConfig(file, projectRoot, errors)
    if (cfg?.hooks) {
      entries.push(...extractEntries(cfg.hooks, {
        source, sourceLabel, filePath: file, scope: 'project',
      }))
    }
    collectEnabled(cfg)
  }

  // 4. 활성 플러그인 hooks.json (installed ∩ enabled)
  const manifestPath = path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json')
  let plugins = {}
  const manifestCfgErrors = []
  if (!isUncPath(manifestPath) && fs.existsSync(manifestPath)) {
    try {
      const stat = fs.statSync(manifestPath)
      if (stat.size <= MAX_HOOKS_FILE_BYTES) {
        plugins = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')).plugins || {}
      } else {
        manifestCfgErrors.push({ filePath: manifestPath, errorCode: 'SIZE_CAP' })
      }
    } catch {
      manifestCfgErrors.push({ filePath: manifestPath, errorCode: 'READ_OR_PARSE_ERROR' })
    }
  }
  errors.push(...manifestCfgErrors)

  for (const [pluginKey, installations] of Object.entries(plugins)) {
    if (!enabledPluginKeys.has(pluginKey)) continue // bkit 함정 — 비활성 플러그인 제외
    const pluginName = pluginKey.split('@')[0]
    const entry = Array.isArray(installations) ? installations[installations.length - 1] : null
    const installPath = entry?.installPath
    if (!installPath || isUncPath(installPath)) continue
    const hooksJsonPath = path.join(installPath, 'hooks', 'hooks.json')
    const cfg = readGatedConfig(hooksJsonPath, installPath, errors)
    if (cfg?.hooks) {
      entries.push(...extractEntries(cfg.hooks, {
        source: 'plugin',
        sourceLabel: `플러그인 ${pluginName}`,
        filePath: hooksJsonPath,
        scope: 'global',
        pluginRoot: installPath,
      }))
    }
  }

  return { entries, errors }
}

/**
 * 매처 컴파일 — 절대 throw 금지.
 * null/''/'*' → 전체 매치. 그 외 full-string RegExp, SyntaxError 시 리터럴 동등.
 */
export function compileHookMatcher(matcher) {
  if (matcher === null || matcher === undefined || matcher === '' || matcher === '*') {
    return () => true
  }
  let re = null
  try {
    re = new RegExp(`^(?:${matcher})$`)
  } catch {
    re = null
  }
  if (re) {
    const compiled = re
    return (segment) => {
      try {
        return compiled.test(String(segment))
      } catch {
        return false
      }
    }
  }
  return (segment) => segment === matcher
}

/**
 * 세션 배열 → 매칭용 텔레메트리 행.
 * Session.hookSummary 만 소비한다 (mjs/TS 경계 계약과 동일 원칙).
 * segment = hookName 의 ':' 뒤 (resolved matcher 구간, 없으면 '').
 */
export function buildHookTelemetryRows(sessions) {
  const rows = []
  for (const session of sessions || []) {
    if (!session || session.source !== 'claude') continue
    const summaryRows = session.hookSummary?.rows
    if (!Array.isArray(summaryRows)) continue
    for (const row of summaryRows) {
      const name = typeof row.hookName === 'string' ? row.hookName : ''
      const idx = name.indexOf(':')
      rows.push({
        event: typeof row.hookEvent === 'string' ? row.hookEvent : '',
        segment: idx >= 0 ? name.slice(idx + 1) : '',
        commandKey: typeof row.commandKey === 'string' ? row.commandKey : 'unknown',
        cwd: typeof session.cwd === 'string' ? session.cwd : '',
      })
    }
  }
  return rows
}

/**
 * 설정 엔트리 ↔ 텔레메트리 매칭.
 * 같은 event AND (commandKey 일치 → confidence 'command' / 매처 일치 → 'event').
 * 프로젝트 스코프 엔트리는 세션 cwd 가 프로젝트 루트와 정규화 일치할 때만.
 */
export function matchHookEntries(entries, telemetryRows, projectRoot) {
  const normalizedRoot = normalizeFsPath(projectRoot || process.cwd())
  const rows = telemetryRows || []
  return (entries || []).map((entry) => {
    const matcherFn = compileHookMatcher(entry.matcher)
    let observed = false
    let confidence = null
    for (const row of rows) {
      if (row.event !== entry.event) continue
      if (entry.scope === 'project') {
        if (!row.cwd || normalizeFsPath(row.cwd) !== normalizedRoot) continue
      }
      if (entry.commandKeys.includes(row.commandKey)) {
        observed = true
        confidence = 'command'
        break // command 일치가 최상위 확신 — 즉시 확정
      }
      if (matcherFn(row.segment)) {
        observed = true
        if (confidence === null) confidence = 'event'
        // event 수준 일치는 유지한 채 command 일치를 계속 탐색
      }
    }
    return { ...entry, observed, confidence }
  })
}

/**
 * 정적 임베드용 공개 형태 — command 원문/filePath/timeout 절대 미포함.
 * commandKey 는 원문 다이제스트(후보 첫 항목) — 비가역이라 안전.
 */
export function toPublicHookEntries(matchedEntries) {
  return (matchedEntries || []).map((entry) => ({
    event: entry.event,
    matcher: entry.matcher,
    sourceLabel: entry.sourceLabel,
    observed: entry.observed,
    confidence: entry.confidence,
    commandKey: entry.commandKeys[0],
  }))
}

/**
 * 서버 `/api/hooks` 형태 — command 는 직렬화 경계에서 maskSecrets (단일 소스).
 * loopback 응답 전용. commandKeys 는 Dashboard 서브행 라벨 매핑용 다이제스트.
 */
export function toServerHookEntries(matchedEntries) {
  return (matchedEntries || []).map((entry) => ({
    event: entry.event,
    matcher: entry.matcher,
    command: maskSecrets(entry.command).masked,
    source: entry.source,
    filePath: entry.filePath,
    observed: entry.observed,
    confidence: entry.confidence,
    commandKeys: entry.commandKeys,
  }))
}
