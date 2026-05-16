import type { SVGProps } from 'react'

export function EmptySessionsIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M5 9.5h14l-1.5 8H6.5z" fill="#F1F4F8" stroke="#657184" strokeWidth="1" strokeLinejoin="round" />
      <path d="M7.8 9.5 9.2 6h5.6l1.4 3.5" fill="#DDE7F4" stroke="#657184" strokeWidth="1" strokeLinejoin="round" />
      <path d="M8.6 13.5h2.2l1.2 1.5h3.4" fill="none" stroke="#8B93A3" strokeWidth="1.15" strokeLinecap="round" />
      <path d="M10.2 18.9h3.6" stroke="#7C8CFF" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
