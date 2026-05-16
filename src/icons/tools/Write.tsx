import type { SVGProps } from 'react'

export function WriteIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M6.5 4.8h7.3l3.7 3.7v10.7h-11z" fill="#F4FFF8" stroke="#4E705A" strokeWidth="1" />
      <path d="M13.8 4.8v3.7h3.7" fill="#CFF7DD" stroke="#4E705A" strokeWidth="1" />
      <path d="M9 11.3h5.6M9 14.2h3.5" stroke="#64766C" strokeWidth="1.05" strokeLinecap="round" />
      <path d="M15.7 14.2v4.2M13.6 16.3h4.2" stroke="#34A86A" strokeWidth="1.45" strokeLinecap="round" />
    </svg>
  )
}
