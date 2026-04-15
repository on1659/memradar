import { motion } from 'framer-motion'
import type { CSSProperties, ReactNode } from 'react'

interface SlideLayoutProps {
  children: ReactNode
  gradient?: string
}

export function SlideLayout({ children, gradient = 'from-bg via-bg to-bg' }: SlideLayoutProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className={`wrapped-surface absolute inset-0 flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#06060e] bg-gradient-to-br p-8 ${gradient}`}
    >
      {children}
    </motion.div>
  )
}

export function AnimatedNumber({ value, suffix = '' }: { value: number; suffix?: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.5, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.3, type: 'spring' }}
      className="inline-block"
    >
      {value.toLocaleString()}{suffix}
    </motion.span>
  )
}

export function FadeInText({ children, delay = 0, className = '', style }: { children: ReactNode; delay?: number; className?: string; style?: CSSProperties }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}
