import type { SVGProps } from 'react'

export function AfternoonWarriorIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect x="6" y="8" width="10.8" height="8.8" rx="1.4" fill="#FFF8EA" stroke="#8D7655" strokeWidth="1" />
      <path d="M8.2 11h5.2M8.2 13.4h4" stroke="#9B8B76" strokeWidth="1.05" strokeLinecap="round" />
      <circle cx="17.2" cy="7.9" r="2" fill="#FFB24D" stroke="#B9572E" strokeWidth="0.9" />
      <path d="M17.2 4.7v1M17.2 10.8v1M14.1 7.9h1M19.3 7.9h1" stroke="#B9572E" strokeWidth="0.9" strokeLinecap="round" />
      <path d="M14.2 16.5l2.4 1.6" stroke="#58A66E" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  )
}
