import { describe, expect, it } from 'vitest'
import {
  formatCountdown,
  fromDateTimeLocal,
  isLineupOpen,
  nextMatchdayNumber,
  pickCurrentMatchday,
  toDateTimeLocal,
} from './matchdays'
import type { Matchday, MatchdayStatus } from './types'

const now = new Date('2026-10-10T12:00:00Z')

function md(
  number: number,
  deadline: string,
  status: MatchdayStatus = 'open',
): Matchday {
  return { id: `m${number}`, league_id: 'l', number, deadline, status }
}

describe('isLineupOpen', () => {
  it('aperta solo prima della scadenza e con stato open', () => {
    expect(isLineupOpen(md(1, '2026-10-10T12:00:01Z'), now)).toBe(true)
    expect(isLineupOpen(md(1, '2026-10-10T12:00:00Z'), now)).toBe(false)
    expect(isLineupOpen(md(1, '2026-10-11T12:00:00Z', 'locked'), now)).toBe(
      false,
    )
  })
})

describe('pickCurrentMatchday', () => {
  it('sceglie la prossima scadenza futura', () => {
    const list = [
      md(1, '2026-10-03T18:00:00Z', 'scored'),
      md(3, '2026-10-24T18:00:00Z'),
      md(2, '2026-10-17T18:00:00Z'),
    ]
    expect(pickCurrentMatchday(list, now)?.number).toBe(2)
  })

  it("se nessuna è aperta sceglie l'ultima", () => {
    const list = [
      md(1, '2026-10-03T18:00:00Z', 'scored'),
      md(2, '2026-10-09T18:00:00Z'),
    ]
    expect(pickCurrentMatchday(list, now)?.number).toBe(2)
  })

  it('nessuna giornata', () => {
    expect(pickCurrentMatchday([], now)).toBeNull()
  })
})

describe('nextMatchdayNumber', () => {
  it('propone il numero successivo', () => {
    expect(nextMatchdayNumber([])).toBe(1)
    expect(
      nextMatchdayNumber([md(3, now.toISOString()), md(7, now.toISOString())]),
    ).toBe(8)
  })
})

describe('formatCountdown', () => {
  it('formatta il tempo rimanente', () => {
    expect(formatCountdown(0)).toBe('scaduta')
    expect(formatCountdown(45_000)).toBe('0 min 45 s')
    expect(formatCountdown((3 * 3600 + 12 * 60) * 1000)).toBe('3 h 12 min')
    expect(formatCountdown((2 * 86400 + 4 * 3600 + 59 * 60) * 1000)).toBe(
      '2 g 4 h',
    )
  })
})

describe('datetime-local', () => {
  it('andata e ritorno nello stesso fuso orario', () => {
    const local = '2026-10-16T20:30'
    expect(toDateTimeLocal(fromDateTimeLocal(local)!)).toBe(local)
    expect(fromDateTimeLocal('')).toBeNull()
  })
})
