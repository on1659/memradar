import type { SVGProps } from 'react'

export function TrendHunterIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M6.2 17.1 9.7 13.2 12.2 14.5 17.8 7.2" fill="none" stroke="#2F7E6E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.5 7.1h2.5v2.5" fill="none" stroke="#2F7E6E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="16.4" r="2.1" fill="#8DEDD7" stroke="#2F7E6E" strokeWidth="1" />
      <circle cx="12.2" cy="14.5" r="1.8" fill="#FFD266" stroke="#B97C18" strokeWidth="0.9" />
      <circle cx="17.8" cy="7.2" r="1.8" fill="#FF7A7A" stroke="#BA3B4B" strokeWidth="0.9" />
      <path d="M5.6 8.1h4M5.6 10.8h2.7" stroke="#8B8FA0" strokeWidth="1.15" strokeLinecap="round" />
    </svg>
  )
}
