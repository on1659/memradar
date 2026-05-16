import type { SVGProps } from 'react'

export function DeepDiverIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="7.9" fill="#E6F8FF" stroke="#3B87A7" strokeWidth="1" />
      <path d="M12 6.9v8.2" stroke="#2B5570" strokeWidth="1.35" strokeLinecap="round" />
      <path d="m9.2 12.6 2.8 2.8 2.8-2.8" fill="none" stroke="#EF5268" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.4 8.4h2.2M14.4 8.4h2.2M7.1 17h9.8" stroke="#50B8CE" strokeWidth="1.15" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.1" fill="#DFF4FF" stroke="#6A65D8" strokeWidth="0.9" />
      <circle cx="12" cy="12" r="0.65" fill="#6A65D8" />
    </svg>
  )
}
