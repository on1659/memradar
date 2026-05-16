import type { SVGProps } from 'react'

export function Rank1Icon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="9.2" r="4.6" fill="#FFE071" stroke="#B77B18" strokeWidth="1" />
      <path d="M12 6.8V12M10.5 8.2 12 6.8l1.5 1.4" fill="none" stroke="#79510F" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.8 13.2 7.7 19.4l4.3-2.4 4.3 2.4-1.1-6.2" fill="#7C8CFF" stroke="#4852AE" strokeWidth="1" strokeLinejoin="round" />
      <path d="M9.5 9.4h5" stroke="#79510F" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}
