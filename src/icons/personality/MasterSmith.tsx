import type { SVGProps } from 'react'

export function MasterSmithIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M9 4.6h6l4.1 4.1v6.6L15 19.4H9l-4.1-4.1V8.7z" fill="#FFF1D8" stroke="#7F5B35" strokeWidth="1.1" />
      <path d="M8.1 13.1h7.8l-1.3 2.8H9.4z" fill="#B9B0A8" stroke="#6C615C" strokeWidth="1" />
      <path d="M7.3 17.2h9.4" stroke="#6C615C" strokeWidth="1.35" />
      <path d="M9.2 9.2h5.6" stroke="#6C615C" strokeWidth="1.35" />
      <path d="M11.1 7.1v4.1" stroke="#E0623E" strokeWidth="1.4" />
      <circle cx="16.8" cy="7.4" r="1.3" fill="#FFC94D" stroke="#A66C10" strokeWidth="0.8" />
    </svg>
  )
}
