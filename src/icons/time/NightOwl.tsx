import type { SVGProps } from 'react'

export function NightOwlIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect x="5" y="7" width="14" height="10.6" rx="1.8" fill="#152039" stroke="#59657D" strokeWidth="1" />
      <path d="M5 9.8h14" stroke="#59657D" strokeWidth="1" />
      <path d="M7.4 12.2 9 13.5l-1.6 1.3M10.6 14.8h2.8" fill="none" stroke="#8BE4FF" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.4 10.9a2 2 0 0 0 1.6 3.6 2.8 2.8 0 0 1-3.5-3.5 2 2 0 0 0 1.9-.1Z" fill="#FFE78A" stroke="#C99B38" strokeWidth="0.75" />
      <circle cx="7" cy="8.4" r="0.45" fill="#FF7A7A" />
      <circle cx="8.5" cy="8.4" r="0.45" fill="#FFD15C" />
    </svg>
  )
}
