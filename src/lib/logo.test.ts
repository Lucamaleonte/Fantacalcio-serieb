import { describe, expect, it } from 'vitest'
import { coverCrop, logoPath, placeholderColor, teamInitials } from './logo'

describe('coverCrop', () => {
  it('immagine orizzontale: quadrato al centro', () => {
    expect(coverCrop(400, 300)).toEqual({ sx: 50, sy: 0, size: 300 })
  })
  it('immagine verticale: quadrato al centro', () => {
    expect(coverCrop(300, 501)).toEqual({ sx: 0, sy: 100, size: 300 })
  })
  it('immagine quadrata: tutta', () => {
    expect(coverCrop(256, 256)).toEqual({ sx: 0, sy: 0, size: 256 })
  })
})

describe('logoPath', () => {
  it('cartella <lega>/<utente>/ e nome dal momento del caricamento', () => {
    expect(logoPath('L', 'U', 123, 'image/webp')).toBe('L/U/123.webp')
    expect(logoPath('L', 'U', 123, 'image/png')).toBe('L/U/123.png')
  })
})

describe('teamInitials', () => {
  it('due parole: iniziali', () => {
    expect(teamInitials('Real Madrink')).toBe('RM')
  })
  it('una parola: prime due lettere', () => {
    expect(teamInitials('atletico')).toBe('AT')
  })
  it('accenti e simboli', () => {
    expect(teamInitials('  Città-di Ève ')).toBe('CD')
    expect(teamInitials('!!!')).toBe('?')
  })
})

describe('placeholderColor', () => {
  it('stesso nome, stesso colore', () => {
    expect(placeholderColor('Squadra A')).toBe(placeholderColor('Squadra A'))
    expect(placeholderColor('Squadra A')).toMatch(/^bg-/)
  })
})
