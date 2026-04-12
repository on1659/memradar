import type { Provider } from './types'
import type { Session } from '../types'
import { claudeProvider } from './claude'

const providers: Provider[] = [
  claudeProvider,
]

export function detectAndParse(content: string, fileName: string): Session | null {
  for (const provider of providers) {
    if (provider.detect(content)) {
      const session = provider.parse(content, fileName)
      if (session) return session
    }
  }
  return null
}

export function registerProvider(provider: Provider) {
  providers.push(provider)
}

export { type Provider } from './types'
