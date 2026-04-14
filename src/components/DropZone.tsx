import { useCallback, useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderOpen, Terminal, Copy, Check, Radar, ChevronDown } from 'lucide-react'

interface DropZoneProps {
  onFilesLoaded: (files: { name: string; content: string }[]) => void
}

function createSeededRandom(seed: number) {
  let current = seed
  return () => {
    current = (current * 1664525 + 1013904223) >>> 0
    return current / 0x100000000
  }
}

/* ── Radar background ─────────────────────────────────────────────── */

function RadarBG() {
  const rings = [120, 200, 280, 360]
  const blips = useMemo(() => {
    const random = createSeededRandom(42)
    return Array.from({ length: 8 }, (_, i) => ({
      id: i,
      angle: random() * 360,
      radius: 80 + random() * 260,
      delay: random() * 4,
      size: 2 + random() * 3,
      repeatDelay: 2 + random() * 3,
    }))
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <svg
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        width="800" height="800" viewBox="-400 -400 800 800"
        style={{ opacity: 0.12 }}
      >
        {/* concentric rings */}
        {rings.map((r) => (
          <circle key={r} cx="0" cy="0" r={r} fill="none"
            stroke="var(--t-accent)" strokeWidth="1"
            strokeDasharray="4 6" opacity={1 - r / 500}
          />
        ))}
        {/* crosshairs */}
        <line x1="-380" y1="0" x2="380" y2="0" stroke="var(--t-accent)" strokeWidth="0.5" opacity="0.4" />
        <line x1="0" y1="-380" x2="0" y2="380" stroke="var(--t-accent)" strokeWidth="0.5" opacity="0.4" />
        {/* sweep */}
        <g className="radar-sweep-group">
          <defs>
            <linearGradient id="sweep-grad" gradientTransform="rotate(0)">
              <stop offset="0%" stopColor="var(--t-accent)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--t-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,0 L0,-360 A360,360 0 0,1 254.6,-254.6 Z" fill="url(#sweep-grad)" className="radar-sweep" />
        </g>
      </svg>

      {/* blips */}
      {blips.map((b) => {
        const x = Math.cos((b.angle * Math.PI) / 180) * b.radius
        const y = Math.sin((b.angle * Math.PI) / 180) * b.radius
        return (
          <motion.div
            key={b.id}
            className="absolute rounded-full bg-accent"
            style={{
              width: b.size,
              height: b.size,
              left: `calc(50% + ${x}px)`,
              top: `calc(50% + ${y}px)`,
              boxShadow: `0 0 ${b.size * 3}px var(--t-accent)`,
            }}
            animate={{
              opacity: [0, 0.9, 0.9, 0],
              scale: [0.5, 1.2, 1, 0.5],
            }}
            transition={{
              duration: 3,
              delay: b.delay,
              repeat: Infinity,
              repeatDelay: b.repeatDelay,
            }}
          />
        )
      })}

      {/* gradient vignette */}
      <div className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, transparent 30%, var(--t-bg) 75%)`,
        }}
      />
    </div>
  )
}

/* ── Scan-line overlay ────────────────────────────────────────────── */

function ScanLine() {
  return (
    <motion.div
      className="absolute left-0 right-0 h-[2px] pointer-events-none z-10"
      style={{
        background: `linear-gradient(90deg, transparent, var(--t-accent), transparent)`,
        boxShadow: `0 0 20px 4px var(--t-accent)`,
        opacity: 0.3,
      }}
      animate={{ top: ['0%', '100%'] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
    />
  )
}

/* ── Main DropZone ────────────────────────────────────────────────── */

export function DropZone({ onFilesLoaded }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fileCount, setFileCount] = useState(0)
  const folderInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '')
      folderInputRef.current.setAttribute('directory', '')
    }
  }, [])

  const readFiles = useCallback(
    async (fileList: FileList | File[]) => {
      setLoading(true)
      setError('')
      setFileCount(0)
      const files: { name: string; content: string }[] = []
      const arr = Array.from(fileList)

      for (const file of arr) {
        if (file.name.endsWith('.jsonl')) {
          const content = await file.text()
          files.push({ name: file.name, content })
          setFileCount(files.length)
        }
      }

      if (files.length > 0) {
        onFilesLoaded(files)
      } else {
        setError(`${arr.length}개 파일 중 .jsonl 세션 파일을 찾지 못했습니다. .claude 폴더를 선택해주세요.`)
      }
      setLoading(false)
    },
    [onFilesLoaded]
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const items = e.dataTransfer.items
      const allFiles: File[] = []

      if (items) {
        const entries: FileSystemEntry[] = []
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry?.()
          if (entry) entries.push(entry)
        }

        for (const entry of entries) {
          if (entry.isFile) {
            const file = await new Promise<File>((resolve) =>
              (entry as FileSystemFileEntry).file(resolve)
            )
            if (file.name.endsWith('.jsonl')) allFiles.push(file)
          } else if (entry.isDirectory) {
            const dirFiles = await readDirectory(entry as FileSystemDirectoryEntry)
            allFiles.push(...dirFiles)
          }
        }
      }

      if (allFiles.length > 0) {
        await readFiles(allFiles)
      }
    },
    [readFiles]
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) readFiles(e.target.files)
    },
    [readFiles]
  )

  const isWin = typeof navigator !== 'undefined' && navigator.platform.startsWith('Win')

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      <RadarBG />
      <ScanLine />

      {/* Hero */}
      <motion.div
        className="relative z-20 text-center mb-10 px-4"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-accent/20 bg-accent/5 text-accent text-xs tracking-widest uppercase mb-6"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <Radar className="w-3.5 h-3.5" />
          AI Session Scanner
        </motion.div>

        <h1 className="text-6xl sm:text-7xl font-bold text-text-bright tracking-tight mb-4">
          <span className="text-accent">Mem</span>radar
        </h1>

        <motion.p
          className="text-lg sm:text-xl text-text max-w-lg mx-auto leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          당신의 AI 대화가 들려주는 이야기
        </motion.p>
      </motion.div>

      {/* Drop zone card */}
      <motion.div
        className="relative z-20 w-full max-w-md mx-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => folderInputRef.current?.click()}
          className="relative cursor-pointer group"
        >
          {/* glow effect */}
          <div className={`absolute -inset-[1px] rounded-2xl transition-opacity duration-500 ${isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}`}
            style={{ background: `linear-gradient(135deg, var(--t-accent), transparent, var(--t-accent))`, filter: 'blur(8px)' }}
          />

          <div className={`
            relative rounded-2xl border backdrop-blur-sm p-8 sm:p-10 text-center
            transition-all duration-300
            ${isDragging
              ? 'border-accent bg-accent/10 scale-[1.01]'
              : 'border-border/60 bg-bg-card/80 hover:border-accent/30'}
          `}>
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-4 py-4"
                >
                  {/* radar spinner */}
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border border-accent/30" />
                    <div className="absolute inset-2 rounded-full border border-accent/20" />
                    <div className="absolute inset-4 rounded-full border border-accent/10" />
                    <motion.div
                      className="absolute inset-0"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    >
                      <div className="absolute top-1/2 left-1/2 w-1/2 h-[2px] origin-left"
                        style={{ background: `linear-gradient(90deg, var(--t-accent), transparent)` }}
                      />
                    </motion.div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    </div>
                  </div>
                  <div>
                    <p className="text-text-bright font-medium">스캔 중...</p>
                    {fileCount > 0 && (
                      <p className="text-sm text-accent mt-1">{fileCount}개 세션 발견</p>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.div
                    className="mx-auto mb-5 w-14 h-14 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center"
                    whileHover={{ scale: 1.05, rotate: -3 }}
                    transition={{ type: 'spring', stiffness: 400 }}
                  >
                    <FolderOpen className={`w-7 h-7 transition-colors duration-300 ${isDragging ? 'text-accent' : 'text-accent/70'}`} />
                  </motion.div>

                  <p className="text-text-bright font-medium text-lg mb-2">
                    <code className="text-accent font-mono">.claude</code> 폴더 연결
                  </p>
                  <p className="text-sm text-text leading-relaxed">
                    드래그하거나 클릭하여 폴더를 선택하세요<br />
                    <span className="text-text/50">.jsonl 세션 파일을 자동으로 찾습니다</span>
                  </p>

                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-sm text-rose mt-4 px-3 py-2 rounded-lg bg-rose/5 border border-rose/10"
                    >
                      {error}
                    </motion.p>
                  )}

                  <input
                    ref={folderInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleInputChange}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* path hint */}
        <motion.p
          className="text-center text-xs text-text/40 mt-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <code className="text-accent/50">
            {isWin ? 'C:\\Users\\{username}\\.claude' : '~/.claude'}
          </code>
        </motion.p>
      </motion.div>

      {/* divider */}
      <motion.div
        className="relative z-20 flex items-center gap-4 w-full max-w-md mx-4 my-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
      >
        <div className="flex-1 h-px bg-border/50" />
        <span className="text-xs text-text/30 uppercase tracking-widest">or</span>
        <div className="flex-1 h-px bg-border/50" />
      </motion.div>

      {/* CLI card */}
      <motion.div
        className="relative z-20 w-full max-w-md mx-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.6 }}
      >
        <div className="rounded-xl border border-border/40 bg-bg-card/60 backdrop-blur-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Terminal className="w-4 h-4 text-accent/70" />
            <span className="text-sm font-medium text-text-bright">자동 스캔</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent/70 uppercase tracking-wider">
              추천
            </span>
          </div>
          <p className="text-sm text-text/70 mb-3">
            터미널에서 실행하면 로그를 자동으로 찾아 분석합니다.
          </p>
          <CopyCommand command="npx memradar" />
          <div className="flex items-center gap-1.5 mt-3">
            <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
            <p className="text-[11px] text-text/35">
              로컬 실행 — 데이터가 PC 밖으로 나가지 않습니다
            </p>
          </div>
        </div>
      </motion.div>

      {/* scroll indicator */}
      <motion.div
        className="absolute bottom-6 z-20"
        animate={{ y: [0, 6, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <ChevronDown className="w-5 h-5 text-text/20" />
      </motion.div>
    </div>
  )
}

/* ── CopyCommand ──────────────────────────────────────────────────── */

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      onClick={handleCopy}
      className="flex items-center justify-between bg-bg/60 rounded-lg px-4 py-2.5 cursor-pointer hover:bg-bg-hover transition-all duration-200 group border border-border/30 hover:border-accent/20"
    >
      <div className="flex items-center gap-2">
        <span className="text-accent/40 text-xs">$</span>
        <code className="text-sm text-accent font-mono">{command}</code>
      </div>
      <button className="text-text/30 group-hover:text-text/60 transition-colors">
        <AnimatePresence mode="wait">
          {copied ? (
            <motion.div key="check" initial={{ scale: 0.5 }} animate={{ scale: 1 }}>
              <Check className="w-4 h-4 text-green" />
            </motion.div>
          ) : (
            <motion.div key="copy" initial={{ scale: 0.5 }} animate={{ scale: 1 }}>
              <Copy className="w-4 h-4" />
            </motion.div>
          )}
        </AnimatePresence>
      </button>
    </div>
  )
}

/* ── Directory reader ─────────────────────────────────────────────── */

async function readDirectory(dirEntry: FileSystemDirectoryEntry): Promise<File[]> {
  const files: File[] = []
  const reader = dirEntry.createReader()

  const readEntries = (): Promise<FileSystemEntry[]> =>
    new Promise((resolve) => reader.readEntries(resolve))

  let entries = await readEntries()
  while (entries.length > 0) {
    for (const entry of entries) {
      if (entry.isFile && entry.name.endsWith('.jsonl')) {
        const file = await new Promise<File>((resolve) =>
          (entry as FileSystemFileEntry).file(resolve)
        )
        files.push(file)
      } else if (entry.isDirectory) {
        const subFiles = await readDirectory(entry as FileSystemDirectoryEntry)
        files.push(...subFiles)
      }
    }
    entries = await readEntries()
  }

  return files
}
