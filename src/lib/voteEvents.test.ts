import { describe, expect, it } from 'vitest'
import { eventIcons, parseEventCount } from './voteEvents'

describe('eventIcons', () => {
  it('una icona per evento, prima i bonus poi i malus', () => {
    expect(
      eventIcons({ amm: 1, gol: 2, assist: 1 }).map((i) => i.text),
    ).toEqual(['⚽⚽', '👟', '🟨'])
  })

  it('gol subiti: una x per gol, oltre 3 con il numero', () => {
    expect(eventIcons({ gs: 3 })[0]).toMatchObject({
      text: '❌❌❌',
      label: 'Gol subito ×3',
    })
    expect(eventIcons({ gs: 5 })[0].text).toBe('❌×5')
  })

  it('porta inviolata, cartellino rosso', () => {
    expect(eventIcons({ pi: 1, esp: 1 })).toEqual([
      { key: 'pi', text: '🧤', label: 'Porta inviolata' },
      { key: 'esp', text: '🟥', label: 'Espulsione' },
    ])
  })

  it('niente eventi', () => {
    expect(eventIcons({})).toEqual([])
    expect(eventIcons(null)).toEqual([])
    expect(eventIcons({ gol: 0 })).toEqual([])
  })
})

describe('parseEventCount', () => {
  it('vuoto e trattino valgono 0', () => {
    expect(parseEventCount('')).toBe(0)
    expect(parseEventCount(' - ')).toBe(0)
  })

  it('numeri interi da 0 a 20', () => {
    expect(parseEventCount('2')).toBe(2)
    expect(parseEventCount('21')).toBeUndefined()
    expect(parseEventCount('1,5')).toBeUndefined()
    expect(parseEventCount('sì')).toBeUndefined()
  })
})
