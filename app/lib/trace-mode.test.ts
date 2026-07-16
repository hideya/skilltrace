import { describe, expect, test } from 'vitest'
import { isTraceMode, normalizeTraceMode, traceModeLabel } from './trace-mode'

describe('trace modes', () => {
  test('normalizes supported modes', () => {
    expect(normalizeTraceMode('full')).toBe('full')
    expect(normalizeTraceMode('passive_reflection')).toBe('passive_reflection')
    expect(normalizeTraceMode('passive_only')).toBe('passive_only')
    expect(normalizeTraceMode('unknown')).toBe('full')
  })

  test('provides shared validation and labels', () => {
    expect(isTraceMode('passive_only')).toBe(true)
    expect(isTraceMode('unknown')).toBe(false)
    expect(traceModeLabel('passive_reflection')).toBe('passive + reflection')
  })
})
