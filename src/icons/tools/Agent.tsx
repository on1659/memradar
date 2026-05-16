import type { SVGProps } from 'react'

export function AgentIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M8.1 8.1h7.8M8.1 15.9h7.8M8.1 8.1v7.8M15.9 8.1v7.8" stroke="#8A94A8" strokeWidth="1.05" strokeLinecap="round" />
      <rect x="5.8" y="5.8" width="4.6" height="4.6" rx="1" fill="#8E7DFF" stroke="#4E43B6" strokeWidth="0.9" />
      <rect x="13.6" y="5.8" width="4.6" height="4.6" rx="1" fill="#8BE4FF" stroke="#247C94" strokeWidth="0.9" />
      <rect x="5.8" y="13.6" width="4.6" height="4.6" rx="1" fill="#FFD15C" stroke="#A66C10" strokeWidth="0.9" />
      <rect x="13.6" y="13.6" width="4.6" height="4.6" rx="1" fill="#72D9C8" stroke="#2B877A" strokeWidth="0.9" />
      <circle cx="12" cy="12" r="1.5" fill="#FFFFFF" stroke="#647084" strokeWidth="0.9" />
      <path d="M12 10.5v3M10.5 12h3" stroke="#647084" strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  )
}
