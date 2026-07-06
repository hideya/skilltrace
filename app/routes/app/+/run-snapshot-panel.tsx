import { useState } from 'react'
import { AnimatedDisclosure } from '~/ui/animated-disclosure'
import { CompactDetailsPanel, EmptyPanel, StatTile } from './run-detail-ui'

export function RunSnapshotPanel({ snapshot }: RunSnapshotPanelProps) {
  let [selectedFile, setSelectedFile] =
    useState<RunSnapshotInstructionFile | null>(null)

  if (!snapshot) {
    return (
      <CompactDetailsPanel summary="not recorded" title="Run snapshot">
        <EmptyPanel>No Git snapshot recorded.</EmptyPanel>
      </CompactDetailsPanel>
    )
  }

  if (!snapshot.available) {
    return (
      <CompactDetailsPanel
        summary={snapshot.reason || 'not in Git worktree'}
        title="Run snapshot"
      >
        <EmptyPanel>
          {snapshot.reason || 'Target was not inside a Git worktree.'}
        </EmptyPanel>
      </CompactDetailsPanel>
    )
  }

  let files = Array.isArray(snapshot.files) ? snapshot.files : []
  let untracked = Array.isArray(snapshot.untracked_instruction_files)
    ? snapshot.untracked_instruction_files
    : []
  let instructionContents = Array.isArray(snapshot.instruction_file_contents)
    ? snapshot.instruction_file_contents
    : []

  return (
    <CompactDetailsPanel
      summary={runSnapshotSummary(snapshot, files.length)}
      title="Run snapshot"
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="HEAD" value={shortHash(snapshot.head)} />
        <StatTile label="Branch" value={snapshot.branch || 'detached'} />
        <StatTile
          label="State"
          value={snapshot.dirty ? 'dirty' : 'clean'}
        />
        <StatTile label="Changed" value={files.length} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {untracked.length > 0 ? (
          <span className="badge badge-outline">
            {untracked.length} untracked instruction file
            {untracked.length === 1 ? '' : 's'}
          </span>
        ) : null}
        {snapshot.instruction_diff_truncated ? (
          <span className="badge badge-warning">diff truncated</span>
        ) : null}
      </div>

      {files.length > 0 ? (
        <AnimatedDisclosure
          childrenClassName="border-t border-base-300 p-4"
          className="mt-4 rounded-box border border-base-300"
          header={`${files.length} Changed file${files.length === 1 ? '' : 's'}`}
          headerClassName="w-full cursor-pointer px-4 py-3 text-left text-sm font-semibold"
        >
          <ul>
            {files.map((file) => {
              let instructionFile = instructionContents.find(
                (item) => item.path === file.path,
              )

              return (
                <SnapshotFileRow
                  file={file}
                  instructionFile={instructionFile}
                  key={`${file.status}:${file.path}:${file.previous_path ?? ''}`}
                  onSelect={setSelectedFile}
                />
              )
            })}
          </ul>
        </AnimatedDisclosure>
      ) : null}

      {untracked.length > 0 ? (
        <AnimatedDisclosure
          childrenClassName="space-y-4 border-t border-base-300 p-4"
          className="mt-4 rounded-box border border-base-300"
          header="Untracked instruction files"
          headerClassName="w-full cursor-pointer px-4 py-3 text-left text-sm font-semibold"
        >
          {untracked.map((file) => (
            <section className="space-y-2" key={file.path}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-mono text-xs font-semibold break-words">
                  {file.path}
                </h3>
                {file.truncated ? (
                  <span className="badge badge-xs badge-warning">
                    truncated
                  </span>
                ) : null}
              </div>
              <pre className="max-h-72 overflow-auto rounded-box bg-base-200 p-3 text-xs leading-relaxed">
                {file.content}
              </pre>
            </section>
          ))}
        </AnimatedDisclosure>
      ) : null}

      <InstructionFileDialog
        diff={snapshot.instruction_diff}
        file={selectedFile}
        onClose={() => setSelectedFile(null)}
      />
    </CompactDetailsPanel>
  )
}

function runSnapshotSummary(snapshot: RunSnapshot, changedCount: number) {
  let parts = [
    shortHash(snapshot.head),
    snapshot.branch || 'detached',
    snapshot.dirty ? 'dirty' : 'clean',
  ]

  if (changedCount > 0) {
    parts.push(`${changedCount} changed`)
  }

  return parts.filter(Boolean).join(' / ')
}

function SnapshotFileRow({
  file,
  instructionFile,
  onSelect,
}: SnapshotFileRowProps) {
  let label = file.target_relative_path ?? file.path
  let className =
    'grid w-full gap-2 py-1 text-left text-xs sm:grid-cols-[4rem_minmax(0,1fr)]'

  if (instructionFile) {
    return (
      <li className="rounded bg-info/10">
        <button
          className={`${className} cursor-pointer px-2 hover:bg-info/20`}
          onClick={() => onSelect(instructionFile)}
          type="button"
        >
          <span className="font-mono text-info">{file.status}</span>
          <span className="font-mono font-semibold break-words text-info">
            {file.previous_path ? `${file.previous_path} -> ` : null}
            {label}
          </span>
        </button>
      </li>
    )
  }

  return (
    <li className={className}>
      <span className="font-mono text-base-content/50">{file.status}</span>
      <span className="font-mono break-words">
        {file.previous_path ? `${file.previous_path} -> ` : null}
        {label}
      </span>
    </li>
  )
}

function InstructionFileDialog({
  diff,
  file,
  onClose,
}: InstructionFileDialogProps) {
  if (!file) return null

  let changedLines = changedLinesForFile(diff, file.path)
  let lines = file.content ? file.content.split('\n') : ['(empty file)']

  return (
    <dialog className="modal-open modal">
      <div className="modal-box max-w-5xl">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold">Instruction file content</h3>
            <p className="mt-1 font-mono text-xs break-words text-base-content/60">
              {file.target_relative_path ?? file.path}
            </p>
          </div>
          <button
            className="btn btn-outline btn-sm"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        {file.truncated ? (
          <div className="mb-4 alert alert-warning">
            Captured content was truncated.
          </div>
        ) : null}
        <div className="max-h-[70vh] overflow-auto rounded-box bg-base-200 py-4 text-xs leading-relaxed">
          {lines.map((line, index) => (
            <div
              className={`grid grid-cols-[4rem_minmax(0,1fr)] gap-3 px-4 ${
                changedLines.has(index + 1) ? 'bg-warning/20' : ''
              }`}
              key={index}
            >
              <span className="text-right font-mono text-base-content/40 select-none">
                {index + 1}
              </span>
              <span className="font-mono whitespace-pre-wrap">
                {line || ' '}
              </span>
            </div>
          ))}
        </div>
      </div>
      <button className="modal-backdrop" onClick={onClose} type="button">
        close
      </button>
    </dialog>
  )
}

function changedLinesForFile(diff: string | undefined, filePath: string) {
  let changedLines = new Set<number>()
  if (!diff) return changedLines

  let inFile = false
  let newLine = 0

  for (let line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      inFile = diffHeaderMatchesFile(line, filePath)
      newLine = 0
      continue
    }

    if (!inFile) continue

    let hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (hunk) {
      newLine = Number(hunk[1])
      continue
    }

    if (newLine === 0) continue
    if (line.startsWith('+++') || line.startsWith('---')) continue

    if (line.startsWith('+')) {
      changedLines.add(newLine)
      newLine += 1
      continue
    }

    if (line.startsWith('-')) continue

    newLine += 1
  }

  return changedLines
}

function diffHeaderMatchesFile(line: string, filePath: string) {
  let normalized = filePath.replaceAll('\\', '/')
  return (
    line.includes(` b/${normalized}`) ||
    line.endsWith(` b/${normalized}`) ||
    line.includes(` a/${normalized} `)
  )
}

function shortHash(value?: string | null) {
  if (!value) return 'unknown'
  return value.slice(0, 8)
}

type RunSnapshotPanelProps = {
  snapshot?: RunSnapshot | null
}

type RunSnapshot = {
  available?: boolean
  branch?: string | null
  dirty?: boolean
  files?: RunSnapshotFile[]
  head?: string | null
  instruction_diff?: string
  instruction_diff_truncated?: boolean
  instruction_file_contents?: RunSnapshotInstructionFile[]
  reason?: string
  untracked_instruction_files?: RunSnapshotUntrackedFile[]
}

type RunSnapshotFile = {
  path: string
  status: string
  previous_path?: string
  target_relative_path?: string
}

type RunSnapshotInstructionFile = {
  path: string
  target_relative_path?: string
  status: string
  content: string
  truncated?: boolean
}

type RunSnapshotUntrackedFile = {
  path: string
  content: string
  truncated?: boolean
}

type SnapshotFileRowProps = {
  file: RunSnapshotFile
  instructionFile?: RunSnapshotInstructionFile
  onSelect: (file: RunSnapshotInstructionFile) => void
}

type InstructionFileDialogProps = {
  diff?: string
  file: RunSnapshotInstructionFile | null
  onClose: () => void
}
