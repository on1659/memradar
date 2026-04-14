const MODEL_MAP: Record<string, string> = {
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
  // Fallback: just capitalize first letter
  if (s === model) return model
  return s
}
