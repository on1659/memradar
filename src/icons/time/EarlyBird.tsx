import type { SVGProps } from 'react'

export function EarlyBirdIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect x="5.2" y="7" width="13.6" height="9.8" rx="1.8" fill="#EEF9F6" stroke="#6C9D93" strokeWidth="1" />
      <path d="M7.4 14.4h9.2" stroke="#6E8F73" strokeWidth="1.15" strokeLinecap="round" />
      <path d="M8.8 14.2a3.2 3.2 0 0 1 6.4 0" fill="#FFD15C" stroke="#B77B18" strokeWidth="0.95" />
      <path d="M12 8.5v1.3M8.9 9.7l.9.9M15.1 9.7l-.9.9" stroke="#FF9A4D" strokeWidth="1.05" strokeLinecap="round" />
      <path d="M8.4 16.8h7.2" stroke="#9DB2A8" strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  )
}
