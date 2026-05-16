import type { SVGProps } from 'react'

export function AllroundBuilderIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect x="6.1" y="6.1" width="4.4" height="4.4" rx="1" fill="#76D66F" stroke="#3E8F42" strokeWidth="0.95" />
      <rect x="13.5" y="6.1" width="4.4" height="4.4" rx="1" fill="#7A8DFF" stroke="#4854AF" strokeWidth="0.95" />
      <rect x="6.1" y="13.5" width="4.4" height="4.4" rx="1" fill="#FFD05C" stroke="#B6801B" strokeWidth="0.95" />
      <rect x="13.5" y="13.5" width="4.4" height="4.4" rx="1" fill="#FF85A8" stroke="#B64E6A" strokeWidth="0.95" />
      <path d="M10.5 8.3h3M12 10.5v3M10.5 15.7h3" stroke="#394155" strokeWidth="1.15" strokeLinecap="round" />
      <path d="M5 19.2h14" stroke="#647084" strokeWidth="1.15" strokeLinecap="round" />
    </svg>
  )
}
