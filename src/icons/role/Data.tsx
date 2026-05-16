import type { SVGProps } from 'react'

export function DataIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <ellipse cx="10.8" cy="6.9" rx="5.3" ry="2.1" fill="#BDE9FF" stroke="#2F79A8" strokeWidth="1" />
      <path d="M5.5 6.9v8.1c0 1.2 2.4 2.1 5.3 2.1s5.3-.9 5.3-2.1V6.9" fill="#EAF8FF" stroke="#2F79A8" strokeWidth="1" />
      <path d="M5.5 10.9c0 1.2 2.4 2.1 5.3 2.1s5.3-.9 5.3-2.1" fill="none" stroke="#2F79A8" strokeWidth="1" />
      <path d="M15.7 17.2h3.7" stroke="#5D5EE0" strokeWidth="1.35" strokeLinecap="round" />
      <path d="m17.7 15.2 2 2-2 2" fill="none" stroke="#5D5EE0" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.3" cy="10.8" r="0.55" fill="#FF8A65" />
    </svg>
  )
}
