import type { SVGProps } from 'react'

export function ChaosCreatorIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="2.1" fill="#FFE06A" stroke="#A66C10" strokeWidth="0.95" />
      <path d="M12 9.7V6.3M13.9 12.8l3 1.8M10.1 12.8l-3 1.8M10.4 10.3 8.1 8M13.6 10.3 15.9 8" stroke="#654C8F" strokeWidth="1.35" strokeLinecap="round" />
      <circle cx="12" cy="6.3" r="1.4" fill="#7A8DFF" stroke="#4854AF" strokeWidth="0.85" />
      <circle cx="16.9" cy="14.6" r="1.4" fill="#FF85A8" stroke="#B64E6A" strokeWidth="0.85" />
      <circle cx="7.1" cy="14.6" r="1.4" fill="#72D9C8" stroke="#2B877A" strokeWidth="0.85" />
      <circle cx="8.1" cy="8" r="1.1" fill="#FFC95C" stroke="#B8841F" strokeWidth="0.75" />
      <circle cx="15.9" cy="8" r="1.1" fill="#9DE36D" stroke="#4B9140" strokeWidth="0.75" />
    </svg>
  )
}
