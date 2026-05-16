import type { SVGProps } from 'react'

export function LightningFixerIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M12.8 4.2 6.7 13.1h4.1l-1.2 6.7 7.8-10.2h-4.6z" fill="#FFB84D" stroke="#C75327" strokeWidth="1.05" strokeLinejoin="round" />
      <rect x="5.7" y="7.2" width="4.1" height="3.8" rx="0.8" fill="#8CE6D3" stroke="#2B877A" strokeWidth="0.9" />
      <rect x="14.1" y="13.2" width="4.2" height="3.8" rx="0.8" fill="#8C9BFF" stroke="#4853B5" strokeWidth="0.9" />
      <path d="M10.1 9.1h2.9c1.7 0 3.1 1.2 3.1 3" fill="none" stroke="#404B68" strokeWidth="1.2" />
      <path d="m14.6 10.6 1.5 1.5-1.5 1.5" fill="none" stroke="#404B68" strokeWidth="1.2" />
    </svg>
  )
}
