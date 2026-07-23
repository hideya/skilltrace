import fs from 'fs'
import path from 'path'

export function shellSkillReads(
  command: string,
  cwd: string,
  skillRoots: string[],
) {
  let reads: ShellSkillRead[] = []
  let seen = new Set<string>()

  for (let segment of shellSegments(command)) {
    let tokens = shellTokens(segment)
    let commandIndex = shellCommandIndex(tokens)
    if (commandIndex < 0) continue
    let name = path.basename(tokens[commandIndex])
    if (!['cat', 'sed', 'head', 'tail'].includes(name)) continue
    let operands = tokens.slice(commandIndex + 1)
    if (
      name === 'sed' &&
      operands.some(
        (token) =>
          token === '-i' ||
          token.startsWith('-i') ||
          token === '--in-place' ||
          token.startsWith('--in-place='),
      )
    )
      continue

    for (let token of operands) {
      if (/^\d*[<>]/.test(token)) break
      if (!fileOperand(token)) continue
      let absolutePath = path.resolve(cwd, token)
      if (!skillRoots.some((root) => withinRoot(absolutePath, root))) continue

      let key = `${name}:${absolutePath}`
      if (seen.has(key)) continue
      seen.add(key)
      reads.push({
        absolutePath,
        classifier: name,
      })
    }
  }

  return reads
}

export function shellVerificationOperations(command: string) {
  let operations: ShellVerificationOperation[] = []

  for (let segment of shellSegments(command)) {
    let tokens = shellTokens(segment)
    let commandIndex = shellCommandIndex(tokens)
    if (commandIndex < 0) continue
    let words = tokens.slice(commandIndex).map((token) => token.toLowerCase())
    let operation = verificationOperation(words)
    if (operation) operations.push(operation)
  }

  return operations
}

function verificationOperation(
  words: string[],
): ShellVerificationOperation | null {
  let runner = path.basename(words[0] ?? '')
  let args = words.slice(1).filter((word) => !word.startsWith('-'))

  if (['pnpm', 'npm', 'yarn', 'bun', 'npx'].includes(runner)) {
    if (args[0] === 'run' || args[0] === 'exec') args.shift()
    let task = args[0] ?? ''
    let kind = verificationKind(task)
    return kind
      ? { kind, classifier: `${runner}_${safeClassifier(task)}` }
      : null
  }
  if (runner === 'cargo' && args[0] === 'test') {
    return { kind: 'test', classifier: 'cargo_test' }
  }
  if (runner === 'go' && args[0] === 'test') {
    return { kind: 'test', classifier: 'go_test' }
  }
  if (runner === 'make') {
    let kind = verificationKind(args[0] ?? '')
    return kind ? { kind, classifier: `make_${safeClassifier(args[0])}` } : null
  }

  let kind = verificationKind(runner)
  return kind ? { kind, classifier: safeClassifier(runner) } : null
}

function verificationKind(value: string): OperationKind | null {
  if (/^(test|vitest|jest|pytest|rspec|mocha)(:|$)/.test(value)) return 'test'
  if (/^(tsc|typecheck|type-check|check-types)(:|$)/.test(value)) {
    return 'typecheck'
  }
  if (/^(lint|eslint|stylelint|biome|ruff)(:|$)/.test(value)) return 'lint'
  if (/^(build|compile)(:|$)/.test(value)) return 'build'
  return null
}

function shellSegments(command: string) {
  let segments: string[] = []
  let current = ''
  let quote = ''

  for (let index = 0; index < command.length; index += 1) {
    let char = command[index]
    let next = command[index + 1]

    if (quote) {
      current += char
      if (char === quote && command[index - 1] !== '\\') quote = ''
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      current += char
      continue
    }
    if (char === '\n' || char === ';' || char === '|') {
      if (current.trim()) segments.push(current.trim())
      current = ''
      if (char === '|' && next === '|') index += 1
      continue
    }
    if (char === '&' && next === '&') {
      if (current.trim()) segments.push(current.trim())
      current = ''
      index += 1
      continue
    }
    current += char
  }

  if (current.trim()) segments.push(current.trim())
  return segments
}

function shellTokens(segment: string) {
  let tokens: string[] = []
  let current = ''
  let quote = ''

  for (let index = 0; index < segment.length; index += 1) {
    let char = segment[index]
    if (quote) {
      if (char === quote && segment[index - 1] !== '\\') {
        quote = ''
      } else {
        current += char
      }
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current)
      current = ''
      continue
    }
    if (char === '\\' && segment[index + 1]) {
      current += segment[++index]
      continue
    }
    current += char
  }

  if (current) tokens.push(current)
  return tokens
}

function shellCommandIndex(tokens: string[]) {
  let index = 0
  while (
    index < tokens.length &&
    /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])
  ) {
    index += 1
  }
  if (tokens[index] === 'env' || tokens[index] === 'command') index += 1
  return index < tokens.length ? index : -1
}

function fileOperand(value: string) {
  if (!value || value === '-' || value.startsWith('-')) return false
  if (/[$`*?{}]/.test(value)) return false
  return value.includes('/') || path.basename(value) === 'SKILL.md'
}

function withinRoot(filePath: string, root: string) {
  return pathWithin(filePath, root) || pathWithin(realPath(filePath), realPath(root))
}

function pathWithin(filePath: string, root: string) {
  let relative = path.relative(path.resolve(root), path.resolve(filePath))
  return (
    relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
  )
}

function realPath(value: string) {
  try {
    return fs.realpathSync(value)
  } catch {
    return path.resolve(value)
  }
}

function safeClassifier(value?: string) {
  return (value ?? 'unknown')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export type ShellSkillRead = {
  absolutePath: string
  classifier: string
}

export type ShellVerificationOperation = {
  kind: OperationKind
  classifier: string
}

type OperationKind = 'test' | 'typecheck' | 'lint' | 'build'
