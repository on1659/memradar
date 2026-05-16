import type { SVGProps } from 'react'

export function RefactorIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M5.3 7.1h7.4" stroke="#6A5ED9" strokeWidth="1.55" strokeLinecap="round" />
      <path d="M5.3 12h5.7" stroke="#3B8BA4" strokeWidth="1.55" strokeLinecap="round" />
      <path d="M5.3 16.9h7.4" stroke="#E49B2E" strokeWidth="1.55" strokeLinecap="round" />
      <path d="M13 7.1c2.6 0 4.1 1.4 4.1 3.5v4.7" fill="none" stroke="#4F596D" strokeWidth="1.25" strokeLinecap="round" />
      <path d="m15.4 13.8 1.7 1.7 1.7-1.7" fill="none" stroke="#4F596D" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17.1" cy="15.5" r="1.8" fill="#E8E4FF" stroke="#6A5ED9" strokeWidth="0.85" />
    </svg>
  )
}
