const SKILL_ROOTS = [
  ['.agents', 'skills'],
  ['.claude', 'skills'],
] as const

export function skillPathFromRoot(filePath: string, includeRoot = false) {
  let parts = pathParts(filePath)
  let index = skillRootIndex(parts)
  if (index === null) return null

  return parts.slice(includeRoot ? index : index + 2).join('/') || null
}

export function skillDirectoryKey(filePath: string) {
  let parts = pathParts(filePath)
  if (parts.includes('.skills')) return null

  let rootIndex = skillRootIndex(parts)
  if (rootIndex !== null && parts[rootIndex + 2]) {
    return parts
      .slice(rootIndex, rootIndex + 3)
      .join('/')
      .toLowerCase()
  }

  if (parts.at(-1)?.toLowerCase() === 'skill.md' && parts.length >= 2) {
    return parts.slice(0, -1).join('/').toLowerCase()
  }

  let referenceIndex = parts.findIndex(
    (part) => part.toLowerCase() === 'references',
  )
  if (referenceIndex > 0) {
    return parts.slice(0, referenceIndex).join('/').toLowerCase()
  }

  return null
}

function skillRootIndex(parts: string[]) {
  for (let index = 0; index < parts.length; index += 1) {
    if (
      SKILL_ROOTS.some(
        ([parent, child]) =>
          parts[index] === parent && parts[index + 1] === child,
      )
    ) {
      return index
    }
  }

  return null
}

function pathParts(filePath: string) {
  return filePath.replaceAll('\\', '/').split('/').filter(Boolean)
}
