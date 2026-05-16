import type { SVGProps } from 'react'

export function FeatureIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect x="5.5" y="6" width="5.2" height="5.2" rx="1" fill="#7BCBFF" stroke="#2D72A8" strokeWidth="0.95" />
      <rect x="13.3" y="6" width="5.2" height="5.2" rx="1" fill="#FFD15C" stroke="#B77B18" strokeWidth="0.95" />
      <rect x="9.4" y="13.2" width="5.2" height="5.2" rx="1" fill="#8EE6B2" stroke="#38895E" strokeWidth="0.95" />
      <path d="M10.7 8.6h2.6M12 11.2v2" stroke="#465064" strokeWidth="1.15" strokeLinecap="round" />
      <path d="M16 13.4v3.3M14.4 15h3.2" stroke="#D94A64" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
