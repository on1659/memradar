import type { SVGProps } from 'react'

export function ReviewIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M6.3 4.9h7.1l3.1 3.1v10.2H6.3z" fill="#F6FAFF" stroke="#57657D" strokeWidth="1" />
      <path d="M13.4 4.9V8h3.1" fill="#D9E8FF" stroke="#57657D" strokeWidth="1" />
      <path d="M8.6 10.7h4.1M8.6 13.4h2.8" stroke="#7B8494" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="15.5" cy="15.5" r="2.7" fill="#FFE071" stroke="#B58320" strokeWidth="0.95" />
      <path d="m17.4 17.4 1.9 1.9" stroke="#B58320" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}
