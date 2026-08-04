const MODEL_MAP: Record<string, string> = {
  // 집계 제외 표식 — 정상 경로에서는 여기 닿지 않는다. 모델 축(배지·차트·facet)은
  // modelAttribution 의 displayModel/isAggregatableModel 이 `<synthetic>` 을 걸러내므로,
  // 이 항목이 화면에 보인다면 그 소비처가 표시 규칙을 우회했다는 뜻이다.
  '<synthetic>': 'Synthetic',
  'claude-opus-4-6': 'Opus 4.6',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-haiku-4-5-20251001': 'Haiku 4.5',
  'claude-opus-4-5-20250414': 'Opus 4.5',
  'claude-sonnet-4-5-20250414': 'Sonnet 4.5',
  'claude-3-5-sonnet-20241022': 'Sonnet 3.5',
  'claude-3-5-haiku-20241022': 'Haiku 3.5',
  'claude-3-opus-20240229': 'Opus 3',
  'claude-3-sonnet-20240229': 'Sonnet 3',
  'claude-3-haiku-20240307': 'Haiku 3',
}

export function shortModelName(model: string): string {
  if (MODEL_MAP[model]) return MODEL_MAP[model]
  // Try partial match: strip "claude-" prefix and date suffix
  let s = model.replace(/^claude-/, '').replace(/-\d{8}$/, '')
  // Convert dashes to readable: opus-4-6 → Opus 4.6
  s = s.replace(/^(\w+)-(\d+)-(\d+)$/, (_, name, major, minor) =>
    name.charAt(0).toUpperCase() + name.slice(1) + ' ' + major + '.' + minor
  )
  // 2세그먼트: fable-5 → Fable 5 (Claude 5 계열은 마이너 번호가 없어 위 정규식에 안 걸린다).
  // 표기법은 CLI 문구에 있다 — "You've reached your Fable 5 limit".
  s = s.replace(/^(\w+)-(\d+)$/, (_, name, major) =>
    name.charAt(0).toUpperCase() + name.slice(1) + ' ' + major
  )
  // Fallback: just capitalize first letter
  if (s === model) return model
  return s
}
