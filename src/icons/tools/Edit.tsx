import type { SVGProps } from 'react'

export function EditIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M6.3 4.8h7.2l3.2 3.2v10.8H6.3z" fill="#FFF8EA" stroke="#78634B" strokeWidth="1" />
      <path d="M13.5 4.8V8h3.2" fill="#FFE2A6" stroke="#78634B" strokeWidth="1" />
      <path d="M8.6 10.8h4.4M8.6 13.4h3.2" stroke="#807469" strokeWidth="1.05" strokeLinecap="round" />
      <path d="M12.5 17.4 18.1 11.8l1.6 1.6-5.6 5.6h-1.6z" fill="#FF8A58" stroke="#B34D28" strokeWidth="0.9" strokeLinejoin="round" />
    </svg>
  )
}
