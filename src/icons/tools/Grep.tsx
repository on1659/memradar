import type { SVGProps } from 'react'

export function GrepIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M5.5 6.8h8.6M5.5 10.3h6.8M5.5 13.8h5.2" stroke="#6C7482" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="15.4" cy="14.5" r="3.1" fill="#E8E4FF" stroke="#6555D9" strokeWidth="1" />
      <path d="m17.6 16.7 2.2 2.2" stroke="#6555D9" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M14.1 14.5h2.6" stroke="#3F3496" strokeWidth="1.1" />
      <path d="M5.5 6.8h3.2" stroke="#FF8A58" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  )
}
