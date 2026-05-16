import type { SVGProps } from 'react'

export function DebugIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect x="6.1" y="5.8" width="10.6" height="10.5" rx="2" fill="#FFE3E6" stroke="#B8485A" strokeWidth="1.05" />
      <path d="M8.6 8.3l2 2M10.6 8.3l-2 2" stroke="#D93F55" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M13.1 8.5h1.8M13.1 11.1h1.8" stroke="#5E6470" strokeWidth="1.15" strokeLinecap="round" />
      <circle cx="16.5" cy="16.5" r="2.8" fill="#84E8D8" stroke="#247C78" strokeWidth="1" />
      <path d="m18.5 18.5 1.4 1.4" stroke="#247C78" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  )
}
