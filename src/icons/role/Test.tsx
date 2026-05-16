import type { SVGProps } from 'react'

export function TestIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect x="6.1" y="5.5" width="11" height="13.1" rx="1.7" fill="#F9FBFF" stroke="#4D6077" strokeWidth="1" />
      <rect x="9" y="4.2" width="5.6" height="2.4" rx="0.8" fill="#D7E6FF" stroke="#4D6077" strokeWidth="0.9" />
      <path d="m8.6 9.3.7.7 1.2-1.4M8.6 12.5l.7.7 1.2-1.4" fill="none" stroke="#2D9E62" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.3 9.5h2.9M12.3 12.6h2.4" stroke="#788396" strokeWidth="1.05" strokeLinecap="round" />
      <circle cx="16.2" cy="16.3" r="2.7" fill="#B7F0D0" stroke="#2B8A5A" strokeWidth="0.95" />
      <path d="m15 16.3.8.8 1.5-1.8" fill="none" stroke="#1F7148" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
