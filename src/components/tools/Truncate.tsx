import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface TruncateProps {
  text: string
  maxChars?: number
  className?: string
  monospace?: boolean
}

export function Truncate({ text, maxChars = 1500, className = '', monospace = true }: TruncateProps) {
  const [expanded, setExpanded] = useState(false)
  const isLong = text.length > maxChars
  const display = !expanded && isLong ? text.slice(0, maxChars) + '\n…' : text
  const fontClass = monospace ? 'font-mono' : ''

  return (
    <div className={className}>
      <pre className={`whitespace-pre-wrap break-words text-[11px] leading-5 text-text/85 ${fontClass}`}>{display}</pre>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 flex items-center gap-1 text-[10px] text-text/45 hover:text-text/80 transition-colors"
        >
          {expanded
            ? <><ChevronUp className="h-3 w-3" /> 접기</>
            : <><ChevronDown className="h-3 w-3" /> 더 보기 ({(text.length / 1024).toFixed(1)}KB)</>}
        </button>
      )}
    </div>
  )
}
