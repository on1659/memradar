import type { SVGProps } from 'react'

export function DesignIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect x="5" y="6" width="14" height="12" rx="1.8" fill="#FFE4EE" stroke="#B85A78" strokeWidth="1.05" />
      <path d="M5 9.1h14" stroke="#B85A78" strokeWidth="1.05" />
      <circle cx="7" cy="7.6" r="0.45" fill="#FF7A7A" />
      <circle cx="8.5" cy="7.6" r="0.45" fill="#FFD15C" />
      <rect x="7.2" y="11" width="4.3" height="4.5" rx="0.8" fill="#47D38B" stroke="#2D8A5E" strokeWidth="0.85" />
      <path d="M13.2 11.4h3.2M13.2 13.3h2.4M13.2 15.2h3" stroke="#6F6470" strokeWidth="0.95" strokeLinecap="round" />
      <path d="M16.7 17.7 19.4 15l.9.9-2.7 2.7h-.9z" fill="#FF934D" stroke="#B9572E" strokeWidth="0.75" strokeLinejoin="round" />
    </svg>
  )
}
