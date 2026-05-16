import type { SVGProps } from 'react'

export function BashIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect x="4.8" y="6.3" width="14.4" height="11.4" rx="1.8" fill="#172033" stroke="#56667F" strokeWidth="1" />
      <path d="M4.8 9h14.4" stroke="#56667F" strokeWidth="1" />
      <path d="M7.4 10 9.2 11.5 7.4 13" fill="none" stroke="#8BE4FF" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 13.7h4.3" stroke="#B7F0D0" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="7" cy="7.8" r="0.45" fill="#FF7A7A" />
      <circle cx="8.5" cy="7.8" r="0.45" fill="#FFD15C" />
    </svg>
  )
}
