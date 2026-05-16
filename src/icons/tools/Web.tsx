import type { SVGProps } from 'react'

export function WebIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <circle cx="11.3" cy="11.4" r="6.4" fill="#E1F6FF" stroke="#2F79A8" strokeWidth="1" />
      <path d="M4.9 11.4h12.8" stroke="#2F79A8" strokeWidth="1" />
      <path d="M11.3 5c1.7 1.8 2.6 4 2.6 6.4s-.9 4.7-2.6 6.4M11.3 5c-1.7 1.8-2.6 4-2.6 6.4s.9 4.7 2.6 6.4" fill="none" stroke="#2F79A8" strokeWidth="0.95" />
      <path d="m15.3 15.9 4.1 1.8-1.8.8-.8 1.8z" fill="#FF9A5B" stroke="#B9572E" strokeWidth="0.9" strokeLinejoin="round" />
    </svg>
  )
}
