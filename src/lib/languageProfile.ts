import type { Session } from '../types'

interface LanguageDef {
  name: string
  color: string
  extensions: string[]
  fenceIds: string[]
}

const LANGUAGES: LanguageDef[] = [
  { name: 'TypeScript', color: '#3178c6', extensions: ['.ts', '.tsx', '.mts', '.cts'], fenceIds: ['typescript', 'ts', 'tsx'] },
  { name: 'JavaScript', color: '#f7df1e', extensions: ['.js', '.jsx', '.mjs', '.cjs'], fenceIds: ['javascript', 'js', 'jsx'] },
  { name: 'Python', color: '#3776ab', extensions: ['.py', '.pyx'], fenceIds: ['python', 'py'] },
  { name: 'Rust', color: '#dea584', extensions: ['.rs'], fenceIds: ['rust', 'rs'] },
  { name: 'Go', color: '#00add8', extensions: ['.go'], fenceIds: ['go', 'golang'] },
  { name: 'Java', color: '#b07219', extensions: ['.java'], fenceIds: ['java'] },
  { name: 'C/C++', color: '#555555', extensions: ['.c', '.cpp', '.cc', '.h', '.hpp'], fenceIds: ['c', 'cpp', 'c++'] },
  { name: 'C#', color: '#178600', extensions: ['.cs'], fenceIds: ['csharp', 'cs'] },
  { name: 'Ruby', color: '#cc342d', extensions: ['.rb'], fenceIds: ['ruby', 'rb'] },
  { name: 'PHP', color: '#4f5d95', extensions: ['.php'], fenceIds: ['php'] },
  { name: 'Swift', color: '#f05138', extensions: ['.swift'], fenceIds: ['swift'] },
  { name: 'Kotlin', color: '#a97bff', extensions: ['.kt', '.kts'], fenceIds: ['kotlin', 'kt'] },
  { name: 'Dart', color: '#00b4ab', extensions: ['.dart'], fenceIds: ['dart'] },
  { name: 'CSS', color: '#663399', extensions: ['.css', '.scss', '.sass', '.less'], fenceIds: ['css', 'scss', 'sass', 'less'] },
  { name: 'HTML', color: '#e34c26', extensions: ['.html', '.htm', '.ejs', '.hbs'], fenceIds: ['html', 'htm'] },
  { name: 'SQL', color: '#e38c00', extensions: ['.sql'], fenceIds: ['sql'] },
  { name: 'Shell', color: '#89e051', extensions: ['.sh', '.bash', '.zsh'], fenceIds: ['bash', 'sh', 'shell', 'zsh'] },
  { name: 'Vue', color: '#41b883', extensions: ['.vue'], fenceIds: ['vue'] },
  { name: 'Svelte', color: '#ff3e00', extensions: ['.svelte'], fenceIds: ['svelte'] },
  { name: 'YAML', color: '#cb171e', extensions: ['.yaml', '.yml'], fenceIds: ['yaml', 'yml'] },
  { name: 'JSON', color: '#a0a0a0', extensions: ['.json', '.jsonl', '.jsonc'], fenceIds: ['json', 'jsonc'] },
  { name: 'Markdown', color: '#083fa1', extensions: ['.md', '.mdx'], fenceIds: ['markdown', 'md', 'mdx'] },
  { name: 'Lua', color: '#000080', extensions: ['.lua'], fenceIds: ['lua'] },
  { name: 'Elixir', color: '#6e4a7e', extensions: ['.ex', '.exs'], fenceIds: ['elixir', 'ex'] },
  { name: 'Scala', color: '#c22d40', extensions: ['.scala', '.sc'], fenceIds: ['scala'] },
  { name: 'R', color: '#276dc3', extensions: ['.r', '.R'], fenceIds: ['r'] },
  { name: 'Zig', color: '#f7a41d', extensions: ['.zig'], fenceIds: ['zig'] },
]

// Build lookup maps once
const fenceIdMap = new Map<string, string>()
const extMap = new Map<string, string>()
const colorMap = new Map<string, string>()

for (const lang of LANGUAGES) {
  colorMap.set(lang.name, lang.color)
  for (const id of lang.fenceIds) fenceIdMap.set(id, lang.name)
  for (const ext of lang.extensions) extMap.set(ext, lang.name)
}

// Regex for code fences: ```typescript, ```python, etc.
const FENCE_RE = /```([\w+#-]+)/g

// Regex for filenames with known extensions
const FILE_EXT_RE = /\b[\w./-]+\.(tsx?|jsx?|mjs|cjs|py|pyx|rs|go|java|cpp|cc|h|hpp|cs|rb|php|swift|kt|kts|dart|s?css|sass|less|html?|ejs|hbs|sql|sh|bash|zsh|vue|svelte|ya?ml|jsonl?|jsonc|mdx?|lua|exs?|scala|sc|zig)\b/gi

export interface LanguageScore {
  name: string
  color: string
  count: number
}

export function analyzeLanguages(sessions: Session[], limit = 10): LanguageScore[] {
  const scores: Record<string, number> = {}

  for (const session of sessions) {
    for (const msg of session.messages) {
      const text = msg.text

      // Code fence languages
      for (const match of text.matchAll(FENCE_RE)) {
        const langName = fenceIdMap.get(match[1].toLowerCase())
        if (langName) scores[langName] = (scores[langName] || 0) + 1
      }

      // File extensions in paths/filenames
      for (const match of text.matchAll(FILE_EXT_RE)) {
        const ext = '.' + match[1].toLowerCase()
        // Normalize multi-char extensions
        const normalized =
          ext === '.yml' ? '.yaml' :
          ext === '.htm' ? '.html' :
          ext === '.cc' ? '.cpp' :
          ext === '.mjs' || ext === '.cjs' ? '.js' :
          ext === '.mts' || ext === '.cts' ? '.ts' :
          ext === '.jsonc' ? '.json' :
          ext === '.sass' || ext === '.less' ? '.scss' :
          ext === '.bash' || ext === '.zsh' ? '.sh' :
          ext === '.sc' ? '.scala' :
          ext === '.exs' ? '.ex' :
          ext
        const langName = extMap.get(normalized) || extMap.get(ext)
        if (langName) scores[langName] = (scores[langName] || 0) + 1
      }
    }
  }

  return Object.entries(scores)
    .map(([name, count]) => ({ name, color: colorMap.get(name) || '#888', count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
