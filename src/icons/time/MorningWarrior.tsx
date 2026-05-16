import type { SVGProps } from 'react'

export function MorningWarriorIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect x="5.4" y="7.6" width="13.2" height="9.2" rx="1.7" fill="#EAF8FF" stroke="#4A99B2" strokeWidth="1" />
      <circle cx="12" cy="10.8" r="2.1" fill="#FFD15C" stroke="#B77B18" strokeWidth="0.9" />
      <path d="M12 6.1v1.2M8.3 7.2l.8.8M15.7 7.2l-.8.8M8.1 10.8H7" stroke="#FF9A4D" strokeWidth="1" strokeLinecap="round" />
      <path d="M7.7 15.1h8.6" stroke="#6A8D88" strokeWidth="1.05" strokeLinecap="round" />
      <rect x="9.4" y="17.1" width="5.2" height="1.2" rx="0.6" fill="#CBD6DF" />
    </svg>
  )
}
