import type ReactMarkdown from 'react-markdown'

export const mdComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-6 text-base font-bold text-text-bright first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-5 text-[0.95rem] font-semibold text-text-bright first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-4 text-sm font-medium text-text-bright first:mt-0">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-3 leading-7 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-7">{children}</li>,
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-')
    if (isBlock) return <code className="block">{children}</code>
    return (
      <code className="rounded bg-bg px-1.5 py-0.5 font-mono text-[0.82em] text-accent/90">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-lg border border-border/60 bg-bg px-4 py-3.5 font-mono text-[0.78em] leading-relaxed last:mb-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 border-accent/40 pl-4 italic text-text/70 last:mb-0">
      {children}
    </blockquote>
  ),
  a: ({ children }) => (
    <span className="cursor-default text-accent/80">{children}</span>
  ),
  strong: ({ children }) => <strong className="font-semibold text-text-bright">{children}</strong>,
  em: ({ children }) => <em className="italic text-text/80">{children}</em>,
  hr: () => <hr className="my-5 border-border/40" />,
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-medium text-text-bright">{children}</th>,
  td: ({ children }) => <td className="border-b border-border/30 px-3 py-2">{children}</td>,
}
