import type { SVGProps } from 'react'

export function EveningCoderIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect x="5" y="7" width="14" height="10.6" rx="1.8" fill="#172033" stroke="#56667F" strokeWidth="1" />
      <path d="M5 9.8h14" stroke="#56667F" strokeWidth="1" />
      <path d="M7.4 12.2 9 13.5l-1.6 1.3M10.6 14.8h2.8" fill="none" stroke="#8BE4FF" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.2 15.7a2.9 2.9 0 0 1 5.2 0" fill="#FF9A5B" stroke="#B9572E" strokeWidth="0.9" />
      <circle cx="7" cy="8.4" r="0.45" fill="#FF7A7A" />
      <circle cx="8.5" cy="8.4" r="0.45" fill="#FFD15C" />
    </svg>
  )
}
