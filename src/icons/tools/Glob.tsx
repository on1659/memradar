import type { SVGProps } from 'react'

export function GlobIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M4.8 7.8h5l1.4 1.7h8v7.6a1.7 1.7 0 0 1-1.7 1.7h-11A1.7 1.7 0 0 1 4.8 17z" fill="#FFF0C2" stroke="#A66C10" strokeWidth="1" strokeLinejoin="round" />
      <circle cx="8" cy="13" r="0.75" fill="#5D5EE0" />
      <circle cx="12" cy="13" r="0.75" fill="#2D9E62" />
      <circle cx="16" cy="13" r="0.75" fill="#E25570" />
      <path d="M10 15.8h4M12 13v2.8" stroke="#6C5A28" strokeWidth="1.05" strokeLinecap="round" />
    </svg>
  )
}
