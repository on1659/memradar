import type { Session } from '../types'

export interface Provider {
  id: string
  name: string
  detect: (content: string) => boolean
  parse: (content: string, fileName: string) => Session | null
}
