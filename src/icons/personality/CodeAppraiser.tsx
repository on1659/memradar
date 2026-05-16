import type { SVGProps } from 'react'

export function CodeAppraiserIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <circle cx="11" cy="10.7" r="6.2" fill="#E7F1FF" stroke="#3B6EA8" strokeWidth="1.1" />
      <path d="M7.5 8.2h4.6" stroke="#284E78" strokeWidth="1.25" />
      <path d="M7.5 10.7h3.2" stroke="#284E78" strokeWidth="1.25" />
      <path d="M7.5 13.1h2.2" stroke="#284E78" strokeWidth="1.25" />
      <circle cx="14.9" cy="14.5" r="3.2" fill="#86E5E0" stroke="#1E7E8C" strokeWidth="1.05" />
      <path d="m17.1 16.7 2.5 2.5" stroke="#7C4DFF" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13.5 14.5h2.8" stroke="#155D68" strokeWidth="1.2" />
    </svg>
  )
}
