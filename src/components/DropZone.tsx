import { useCallback, useState } from 'react'
import { Upload, Sparkles, FolderOpen } from 'lucide-react'

interface DropZoneProps {
  onFilesLoaded: (files: { name: string; content: string }[]) => void
}

export function DropZone({ onFilesLoaded }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)

  const readFiles = useCallback(
    async (fileList: FileList | File[]) => {
      setLoading(true)
      const files: { name: string; content: string }[] = []
      const arr = Array.from(fileList)

      for (const file of arr) {
        if (file.name.endsWith('.jsonl')) {
          const content = await file.text()
          files.push({ name: file.name, content })
        }
      }

      if (files.length > 0) {
        onFilesLoaded(files)
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="animate-in mb-12 text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Sparkles className="w-8 h-8 text-accent" />
          <h1 className="text-5xl font-bold text-text-bright tracking-tight">
            Promptale
          </h1>
        </div>
        <p className="text-lg text-text max-w-md mx-auto">
          당신의 AI 대화가 들려주는 이야기
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`
          animate-in w-full max-w-lg p-12 rounded-2xl border-2 border-dashed
          transition-all duration-300 cursor-pointer text-center
          ${
            isDragging
              ? 'border-accent bg-accent/5 scale-[1.02]'
              : 'border-border hover:border-accent/50 hover:bg-bg-hover'
          }
        `}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-text-bright">파싱 중...</p>
          </div>
        ) : (
          <>
            <Upload
              className={`w-12 h-12 mx-auto mb-4 transition-colors ${
                isDragging ? 'text-accent' : 'text-text'
              }`}
            />
            <p className="text-text-bright font-medium mb-2">
              .jsonl 세션 파일을 드래그하세요
            </p>
            <p className="text-sm text-text">
              또는 클릭하여 파일 선택 (폴더도 가능)
            </p>
            <input
              id="file-input"
              type="file"
              accept=".jsonl"
              multiple
              className="hidden"
              onChange={handleInputChange}
            />
          </>
        )}
      </div>

      <div className="animate-in mt-8 flex items-center gap-2 text-sm text-text/60">
        <FolderOpen className="w-4 h-4" />
        <span>
          기본 경로: <code className="text-accent/80">~/.claude/projects/</code>
        </span>
      </div>
    </div>
  )
}

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
