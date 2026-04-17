import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, FolderOpen, Shield, Terminal } from 'lucide-react'
import { ThemeSwitcher } from './ThemeSwitcher'
import { useTheme } from './theme'

interface DropZoneProps {
  onFilesLoaded: (files: { name: string; content: string }[]) => void
}

interface CandidateFile {
  file: File
  relativePath?: string
}

const COMMAND = 'npx memradar'

const QUICK_STEPS = [
  {
    title: '터미널 열기',
    body: 'PowerShell, CMD, iTerm 어디서든 시작할 수 있어요.',
  },
  {
    title: '명령어 실행',
    body: '`npx memradar` 한 줄이면 Claude와 Codex 로그를 함께 찾습니다.',
  },
  {
    title: '바로 분석 보기',
    body: '브라우저가 열리면 바로 대화 기록과 코드 리포트를 볼 수 있어요.',
  },
]

const GUIDE_OPTIONS = [
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
] as const

export function DropZone({ onFilesLoaded }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fileCount, setFileCount] = useState(0)
  const [guideSource, setGuideSource] = useState<'claude' | 'codex'>('claude')
  const folderInputRef = useRef<HTMLInputElement>(null)
  const themeProps = useTheme()

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '')
      folderInputRef.current.setAttribute('directory', '')
    }
  }, [])

  const readFiles = useCallback(
    async (fileList: FileList | CandidateFile[]) => {
      setLoading(true)
      setError('')
      setFileCount(0)

      const files: { name: string; content: string }[] = []
      const candidates = Array.isArray(fileList)
        ? fileList
        : Array.from(fileList, (file) => ({
            file,
            relativePath: file.webkitRelativePath,
          }))

      for (const candidate of candidates) {
        if (isSessionLogJsonl(candidate.file, candidate.relativePath)) {
          const content = await candidate.file.text()
          files.push({ name: candidate.file.name, content })
          setFileCount(files.length)
        }
      }

      if (files.length > 0) {
        onFilesLoaded(files)
      } else {
        setError(
          `${candidates.length}개 항목을 확인했지만 Claude 또는 Codex 세션 파일을 찾지 못했습니다. \`.claude\` 또는 \`.codex\` 폴더를 통째로 선택해 주세요.`
        )
      }

      setLoading(false)
    },
    [onFilesLoaded]
  )

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)

      const items = e.dataTransfer.items
      const allFiles: CandidateFile[] = []

      if (items) {
        const entries: FileSystemEntry[] = []

        for (let i = 0; i < items.length; i += 1) {
          const entry = items[i].webkitGetAsEntry?.()
          if (entry) entries.push(entry)
        }

        for (const entry of entries) {
          if (entry.isFile) {
            const file = await new Promise<File>((resolve) =>
              (entry as FileSystemFileEntry).file(resolve)
            )
            allFiles.push({ file, relativePath: entry.name })
          } else if (entry.isDirectory) {
            const dirFiles = await readDirectory(entry as FileSystemDirectoryEntry, entry.name)
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
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        void readFiles(e.target.files)
      }
    },
    [readFiles]
  )

  const isWin = typeof navigator !== 'undefined' && navigator.platform.startsWith('Win')
  const folderGuide = guideSource === 'claude'
    ? {
        path: isWin ? 'C:\\Users\\{username}\\.claude' : '~/.claude',
        pickerDescription: '`.claude` 폴더를 통째로 선택하면 세션 파일을 자동으로 찾습니다.',
        note: '`.claude` 폴더를 선택하면 `projects` 아래 세션만 골라서 사용하고, `subagents` 같은 보조 폴더는 건너뜁니다.',
      }
    : {
        path: isWin ? 'C:\\Users\\{username}\\.codex' : '~/.codex',
        pickerDescription: '`.codex` 폴더를 통째로 선택하면 세션 파일을 자동으로 찾습니다.',
        note: '`.codex` 폴더를 선택하면 `sessions` 아래 로그만 사용합니다. 설정/캐시 파일은 무시됩니다.',
      }

  return (
    <div className="relative min-h-screen bg-[radial-gradient(circle_at_top,_color-mix(in_srgb,var(--t-accent)_12%,transparent),transparent_40%),linear-gradient(180deg,color-mix(in_srgb,var(--t-bg-card)_82%,transparent),var(--t-bg)_72%)] px-4 py-10 sm:px-6 lg:px-8">
      <div className="absolute right-4 top-4 z-30 sm:right-6 sm:top-6">
        <ThemeSwitcher
          theme={themeProps.theme}
          accent={themeProps.accent}
          onThemeChange={themeProps.setTheme}
          onAccentChange={themeProps.setAccent}
        />
      </div>
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col justify-center">
        <motion.div
          className="mb-8 text-center lg:mb-10 lg:text-left"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/8 px-3 py-1 text-xs font-medium tracking-[0.18em] text-accent uppercase">
            <Terminal className="h-3.5 w-3.5" />
            Copy First Start
          </div>
          <h1 className="mb-3 text-5xl font-bold tracking-tight text-text-bright sm:text-6xl">
            <span className="text-accent">Mem</span>radar
          </h1>
          <p className="mx-auto max-w-2xl text-base leading-7 text-text sm:text-lg lg:mx-0">
            첫 화면에서는 가장 빠른 시작 방법을 먼저 보여주고, 폴더 연결은 필요할 때만 쓰는 보조 방식으로 정리했습니다.
            기본 실행은 Claude와 Codex 로그를 함께 찾고, 수동 연결은 둘 중 하나만 골라도 됩니다.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-text/70 lg:mx-0">
            모바일에서는 확인이 어렵고, Claude나 Codex를 실제로 사용하는 PC에서만 바로 불러와 볼 수 있습니다.
          </p>
        </motion.div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
          <motion.section
            className="rounded-[28px] border border-border/70 bg-bg-card/88 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur sm:p-8"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.45 }}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-accent">추천 시작 방식</p>
                <h2 className="mt-2 text-2xl font-semibold text-text-bright sm:text-3xl">
                  Ctrl+C → 터미널에서 Ctrl+V → Enter
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-text sm:text-base">
                  명령어를 Ctrl+C로 복사하고 터미널에 Ctrl+V로 붙여넣으세요.
                </p>
              </div>
              <div className="self-start rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                가장 빠른 시작
              </div>
            </div>

            <div className="mt-6">
              <CopyCommand command={COMMAND} />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {QUICK_STEPS.map((step, index) => (
                <div
                  key={step.title}
                  className="rounded-2xl border border-border/60 bg-bg/35 px-4 py-4"
                >
                  <div className="mb-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent/12 text-sm font-semibold text-accent">
                    {index + 1}
                  </div>
                  <p className="text-sm font-semibold text-text-bright">{step.title}</p>
                  <p className="mt-2 text-sm leading-6 text-text">{step.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-accent/10 bg-accent/6 px-4 py-4">
              <div className="mt-0.5 rounded-full bg-green/12 p-2 text-green">
                <Shield className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-bright">로컬 실행</p>
                <p className="mt-1 text-sm leading-6 text-text">
                  세션 데이터는 현재 PC에서만 읽습니다. 모바일보다는 Claude나 Codex를 쓰는 PC에서 확인하는 흐름에 맞춰져 있습니다.
                </p>
              </div>
            </div>
          </motion.section>

          <motion.aside
            className="space-y-5"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16, duration: 0.45 }}
          >
            <section className="rounded-[28px] border border-border/70 bg-bg-card/84 p-5 backdrop-blur sm:p-6">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl border border-accent/20 bg-accent/10 p-3 text-accent">
                  <FolderOpen className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-accent">보조 방식</p>
                  <h3 className="mt-1 text-xl font-semibold text-text-bright">직접 폴더 연결</h3>
                  <p className="mt-2 text-sm leading-6 text-text">
                    웹에서는 Claude와 Codex 폴더를 각각 넣어야 합니다.
                    <code className="text-accent/80">npx memradar</code>를 쓰면 둘 다 한 번에 자동으로 찾아줘요.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {GUIDE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setGuideSource(option.id)}
                    className="rounded-full border px-3 py-1 text-xs font-medium transition-all"
                    style={guideSource === option.id
                      ? {
                          color: 'var(--color-text-bright)',
                          borderColor: 'var(--color-border)',
                          background: 'var(--color-bg-hover)',
                        }
                      : undefined}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => void handleDrop(e)}
                className={`mt-5 rounded-3xl border-2 border-dashed p-5 transition-all duration-200 ${
                  isDragging
                    ? 'border-accent bg-accent/8'
                    : 'border-border/70 bg-bg/35 hover:border-accent/30 hover:bg-bg/55'
                }`}
              >
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="space-y-3 py-3"
                    >
                      <p className="text-base font-semibold text-text-bright">세션 파일 확인 중...</p>
                      <p className="text-sm text-text">
                        {fileCount > 0 ? `${fileCount}개 세션을 읽었습니다.` : '.jsonl 파일을 찾는 중입니다.'}
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                    >
                      <button
                        type="button"
                        onClick={() => folderInputRef.current?.click()}
                        className="w-full rounded-2xl border border-border/70 bg-bg-card/72 px-4 py-4 text-left transition hover:border-accent/30 hover:bg-bg-card"
                      >
                        <p className="text-base font-semibold text-text-bright">폴더 선택하기</p>
                        <p className="mt-1 text-sm leading-6 text-text">
                          클릭하거나 드래그해서 {folderGuide.pickerDescription}
                        </p>
                      </button>

                      {error && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-4 rounded-2xl border border-rose/20 bg-rose/8 px-4 py-3 text-sm leading-6 text-rose"
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

              <div className="mt-4 rounded-2xl border border-border/60 bg-bg/35 px-4 py-4">
                <p className="text-xs font-semibold tracking-[0.16em] text-text/60 uppercase">
                  찾는 기본 위치
                </p>
                <code className="mt-3 block overflow-x-auto rounded-xl bg-bg-card/88 px-3 py-3 font-mono text-sm text-accent">
                  {folderGuide.path}
                </code>
                <p className="mt-3 text-sm leading-6 text-text">
                  {folderGuide.note}
                </p>
              </div>
            </section>

            <section className="rounded-[28px] border border-border/70 bg-bg-card/84 p-5 backdrop-blur sm:p-6">
              <p className="text-sm font-semibold text-accent">왜 이렇게 바꿨나</p>
              <ul className="mt-3 space-y-3 text-sm leading-6 text-text">
                <li>처음 들어온 사람이 해야 할 행동이 하나로 보이게 정리했습니다.</li>
                <li>명령어를 작은 코드칩이 아니라 크게 선택 가능한 입력창으로 바꿨습니다.</li>
                <li>폴더 연결은 필요할 때만 여는 보조 흐름으로 내렸고, Claude와 Codex 둘 다 지원하도록 안내를 맞췄습니다.</li>
              </ul>
            </section>
          </motion.aside>
        </div>
      </div>
    </div>
  )
}

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  const commandInputRef = useRef<HTMLInputElement>(null)

  const selectCommand = useCallback(() => {
    const input = commandInputRef.current
    if (!input) return
    input.focus()
    input.select()
    input.setSelectionRange(0, input.value.length)
  }, [])

  const handleCopy = useCallback(async () => {
    selectCommand()

    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }, [command, selectCommand])

  const handleInputClick = useCallback(() => {
    selectCommand()
  }, [selectCommand])

  const handleShellClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('button')) return
      selectCommand()
    },
    [selectCommand]
  )

  return (
    <div className="rounded-[28px] border border-accent/18 bg-[#0c1220] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-medium tracking-[0.18em] text-text/55 uppercase">
          <Terminal className="h-3.5 w-3.5 text-accent" />
          Terminal Command
        </div>
        <div className="rounded-full border border-accent/18 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
          클릭하면 전체 선택
        </div>
      </div>

      <div
        onClick={handleShellClick}
        className="rounded-2xl border border-accent/12 bg-black/24 p-3 sm:p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="text-sm font-medium text-accent/70">$</span>
          <input
            ref={commandInputRef}
            readOnly
            value={command}
            onClick={handleInputClick}
            onFocus={handleInputClick}
            aria-label="memradar command"
            className="min-w-0 flex-1 bg-transparent font-mono text-base text-text-bright outline-none sm:text-lg"
          />
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-accent/18 bg-accent/10 px-4 py-2.5 text-sm font-medium text-text-bright transition hover:border-accent/32 hover:bg-accent/14"
          >
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span
                  key="copied"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  className="inline-flex items-center gap-2"
                >
                  <Check className="h-4 w-4 text-green" />
                  복사됨
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  className="inline-flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" />
                  복사하기
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-text">
        그대로 붙여넣고 Enter를 누르면 Claude는 <code className="text-accent/80">.claude</code>, Codex는 <code className="text-accent/80">.codex</code> 아래 로그를 같이 찾아서 분석 화면을 엽니다.
        실행이 안 되면 <a href="https://github.com/on1659/memradar#설치-가이드" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2 hover:text-accent-bright">설치 가이드</a>를 참고하세요.
      </p>
    </div>
  )
}

function normalizeRelativePath(relativePath?: string) {
  return (relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
}

function isSessionLogJsonl(file: File, relativePath?: string) {
  if (!file.name.endsWith('.jsonl')) return false

  const normalizedPath = normalizeRelativePath(relativePath)
  if (!normalizedPath) return true
  if (normalizedPath.includes('/subagents/')) return false

  const segments = normalizedPath.split('/').filter(Boolean)
  const firstSegment = segments[0]
  if (segments.includes('projects') || segments.includes('sessions')) return true
  if (firstSegment === '.claude' || firstSegment === 'claude' || firstSegment === '.codex' || firstSegment === 'codex') {
    return false
  }

  return true
}

async function readDirectory(
  dirEntry: FileSystemDirectoryEntry,
  currentPath = dirEntry.name
): Promise<CandidateFile[]> {
  const files: CandidateFile[] = []
  const reader = dirEntry.createReader()

  const readEntries = (): Promise<FileSystemEntry[]> =>
    new Promise((resolve) => reader.readEntries(resolve))

  let entries = await readEntries()

  while (entries.length > 0) {
    for (const entry of entries) {
      const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name

      if (entry.isFile && entry.name.endsWith('.jsonl')) {
        const file = await new Promise<File>((resolve) =>
          (entry as FileSystemFileEntry).file(resolve)
        )
        files.push({ file, relativePath: entryPath })
      } else if (entry.isDirectory) {
        const subFiles = await readDirectory(entry as FileSystemDirectoryEntry, entryPath)
        files.push(...subFiles)
      }
    }

    entries = await readEntries()
  }

  return files
}
