import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

function TypingCursor({ showAt, hideAt }: { showAt: number; hideAt: number }) {
  const [visible, setVisible] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const t1 = window.setTimeout(() => setVisible(true), showAt * 1000)
    const t2 = window.setTimeout(() => setGone(true), hideAt * 1000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [showAt, hideAt])

  if (!visible || gone) return null

  return (
    <motion.span
      className="ml-[1px] inline-block rounded-sm bg-accent/70"
      style={{ width: '2px', height: '0.82em', verticalAlign: 'middle' }}
      animate={{ opacity: [1, 0] }}
      transition={{ duration: 0.55, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
    />
  )
}

export function TypewriterText({
  children,
  delay = 0,
  stagger = 0.1,
  className = '',
  style,
  showCursor = false,
  cursorHideAt,
}: {
  children: string
  delay?: number
  stagger?: number
  className?: string
  style?: CSSProperties
  showCursor?: boolean
  cursorHideAt?: number
}) {
  const [count, setCount] = useState(0)
  const timersRef = useRef<number[]>([])

  useEffect(() => {
    setCount(0)
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []

    for (let i = 0; i < children.length; i++) {
      const t = window.setTimeout(
        () => setCount(i + 1),
        (delay + i * stagger) * 1000,
      )
      timersRef.current.push(t)
    }

    return () => { timersRef.current.forEach(clearTimeout) }
  }, [children, delay, stagger])

  const autoHideAt = delay + children.length * stagger + 0.35
  const hideAt = cursorHideAt ?? autoHideAt

  return (
    <div className={className} style={style}>
      <span>{children.slice(0, count)}</span>
      {/* invisible remainder holds layout so no reflow */}
      <span style={{ opacity: 0 }} aria-hidden="true">{children.slice(count)}</span>
      {showCursor && <TypingCursor showAt={delay} hideAt={hideAt} />}
    </div>
  )
}

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
