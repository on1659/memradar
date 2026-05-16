import type { SVGProps } from 'react'

export function DevopsIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect x="5.2" y="7.2" width="5.3" height="4.3" rx="0.9" fill="#9DE36D" stroke="#4B9140" strokeWidth="0.9" />
      <rect x="13.5" y="12.6" width="5.3" height="4.3" rx="0.9" fill="#7C8CFF" stroke="#4852AE" strokeWidth="0.9" />
      <path d="M10.5 9.4h1.6c2 0 3.5 1.3 3.5 3.1" fill="none" stroke="#4C586E" strokeWidth="1.25" strokeLinecap="round" />
      <path d="m14.2 10.9 1.5 1.6-1.5 1.6" fill="none" stroke="#4C586E" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.8 11.5v2.2c0 1.5 1.2 2.7 2.7 2.7h2.9" fill="none" stroke="#4C586E" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M6.7 5.3h2.2M15 18.9h2.2" stroke="#FFB84D" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}
