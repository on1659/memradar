import type { Provider } from './types'
import { parseJsonl } from '../parser'

export const claudeProvider: Provider = {
  id: 'claude',
  name: 'Claude Code',
  detect: (content: string) => {
    const first = content.slice(0, 500)
    return first.includes('"sessionId"') || first.includes('"file-history-snapshot"')
  },
  parse: parseJsonl,
}
