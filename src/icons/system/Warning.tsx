import type { SVGProps } from 'react'

export function WarningIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 4.6 20 18.8H4z" fill="#FFE49A" stroke="#B77B18" strokeWidth="1.05" strokeLinejoin="round" />
      <path d="M12 9.6v4.3" stroke="#7D5310" strokeWidth="1.45" strokeLinecap="round" />
      <circle cx="12" cy="16.8" r="0.8" fill="#7D5310" />
    </svg>
  )
}
