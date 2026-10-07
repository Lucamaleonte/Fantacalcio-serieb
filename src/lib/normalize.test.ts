import { describe, expect, it } from 'vitest'
import { normalizeName, playerKey } from './normalize'

describe('normalizeName', () => {
  it('toglie accenti, maiuscole e punteggiatura', () => {
    expect(normalizeName('Patanè')).toBe('patane')
    expect(normalizeName('Südtirol')).toBe('sudtirol')
    expect(normalizeName("D'Alessandro")).toBe('d alessandro')
    expect(normalizeName('Seghetti J.')).toBe('seghetti j')
  })

  it('riduce gli spazi', () => {
    expect(normalizeName('  Jonathan   Silva ')).toBe('jonathan silva')
  })

  it('gestisce lettere speciali', () => {
    expect(normalizeName('Højlund')).toBe('hojlund')
    expect(normalizeName('Kaczmarek Ł.')).toBe('kaczmarek l')
  })
})

describe('playerKey', () => {
  it('considera uguali nomi scritti in modo diverso', () => {
    expect(playerKey('PATANÈ', 'Südtirol')).toBe(
      playerKey('patane', 'sudtirol'),
    )
  })

  it('distingue squadre diverse', () => {
    expect(playerKey('Rossi', 'Pisa')).not.toBe(playerKey('Rossi', 'Bari'))
  })
})
