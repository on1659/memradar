import type { SVGProps } from 'react'

export function WrenchIcon({ size = 24, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path d="M15.1 5.1a4.1 4.1 0 0 0 4.2 4.2l-8.8 8.8-3-3z" fill="#DCE2EA" stroke="#647084" strokeWidth="1" strokeLinejoin="round" />
      <path d="m6.2 16.3 1.3-1.3 3 3-1.3 1.3a1.8 1.8 0 0 1-2.5 0l-.5-.5a1.8 1.8 0 0 1 0-2.5Z" fill="#7C8CFF" stroke="#4852AE" strokeWidth="1" />
      <path d="M14.4 10.6 11.6 13.4" stroke="#697386" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="17.1" cy="7.4" r="0.75" fill="#FFCA4F" />
    </svg>
  )
}
