import type { SVGProps } from 'react'

export function ReadIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M6.4 4.8h7.4l3.8 3.8v10.6H6.4z" fill="#F6FAFF" stroke="#526177" strokeWidth="1" />
      <path d="M13.8 4.8v3.8h3.8" fill="#DCEAFF" stroke="#526177" strokeWidth="1" />
      <path d="M8.7 11.2h6.1M8.7 14h6.1M8.7 16.8h3.8" stroke="#6C7482" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="17.2" cy="17.4" r="1.5" fill="#86E5E0" stroke="#247C78" strokeWidth="0.8" />
    </svg>
  )
}
