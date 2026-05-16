import type { SVGProps } from 'react'

export function WritingIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M6.2 4.8h7.6L17 8v10.7H6.2z" fill="#FFF6E5" stroke="#856A42" strokeWidth="1" />
      <path d="M13.8 4.8V8H17" fill="#FFE0A8" stroke="#856A42" strokeWidth="1" />
      <path d="M8.5 10.8h5.6M8.5 13.6h4.2" stroke="#8C806D" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M13.4 17.5 18.2 12.7l1.5 1.5-4.8 4.8h-1.5z" fill="#FF9A5B" stroke="#B9572E" strokeWidth="0.9" strokeLinejoin="round" />
      <path d="m17.9 13 1.5 1.5" stroke="#7F3D21" strokeWidth="0.95" />
    </svg>
  )
}
