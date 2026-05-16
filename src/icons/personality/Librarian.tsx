import type { SVGProps } from 'react'

export function LibrarianIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect x="6" y="6.2" width="3.4" height="10.8" rx="0.8" fill="#72D06E" stroke="#3E8744" strokeWidth="0.95" />
      <rect x="9.4" y="5.2" width="3.5" height="11.8" rx="0.8" fill="#7C8CFF" stroke="#4752AE" strokeWidth="0.95" />
      <rect x="12.9" y="6.7" width="3.3" height="10.3" rx="0.8" fill="#FF7AB0" stroke="#B94775" strokeWidth="0.95" />
      <rect x="16.1" y="7.8" width="2.5" height="9.2" rx="0.7" fill="#FFC95C" stroke="#B8841F" strokeWidth="0.9" />
      <path d="M5.3 17.5h14" stroke="#5E6470" strokeWidth="1.35" />
      <path d="M7.1 9h1.1M10.6 8.2h1.1M14 10h1" stroke="#FFFFFF" strokeWidth="1.05" strokeLinecap="round" />
    </svg>
  )
}
