import type { SVGProps } from 'react'

export function BrandMarkIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 4.6 16.2 8.2 19.4 12 16.2 15.8 12 19.4 7.8 15.8 4.6 12 7.8 8.2z" fill="#E8E4FF" stroke="#5D5EE0" strokeWidth="1.05" strokeLinejoin="round" />
      <path d="M12 4.6v14.8M4.6 12h14.8M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6" stroke="#6B63D9" strokeWidth="1.05" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.2" fill="#8BE4FF" stroke="#247C94" strokeWidth="0.9" />
      <circle cx="12" cy="12" r="0.75" fill="#FFD15C" />
    </svg>
  )
}
