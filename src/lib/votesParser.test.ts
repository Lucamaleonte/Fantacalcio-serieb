import { describe, expect, it } from 'vitest'
import { parseVotes, parseVoteValue } from './votesParser'

describe('parseVoteValue', () => {
  it('numeri con virgola o punto', () => {
    expect(parseVoteValue('6,5')).toBe(6.5)
    expect(parseVoteValue(' 7.5 ')).toBe(7.5)
    expect(parseVoteValue('10')).toBe(10)
    expect(parseVoteValue('-1')).toBe(-1)
    expect(parseVoteValue('+3')).toBe(3)
  })

  it('senza voto', () => {
    for (const sv of ['SV', 'sv', 's.v.', 'S.V.', '-', '', '  ', '–', 'n.e.']) {
      expect(parseVoteValue(sv)).toBeNull()
    }
  })

  it('valori non validi', () => {
    expect(parseVoteValue('sei')).toBeUndefined()
    expect(parseVoteValue('6,5,5')).toBeUndefined()
  })
})

describe('parseVotes', () => {
  it('formato del piano: intestazione, virgola decimale, SV', () => {
    const { rows, errors } = parseVotes(
      'Nome;Squadra;Voto;Fantavoto\nCognome;Squadra;6,5;7,5\nAltro G.;Squadra;SV;SV\n',
    )
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { line: 2, name: 'Cognome', team: 'Squadra', vote: 6.5, fantavote: 7.5 },
      {
        line: 3,
        name: 'Altro G.',
        team: 'Squadra',
        vote: null,
        fantavote: null,
      },
    ])
  })

  it('senza intestazione, con tab, righe vuote e titoli ignorati', () => {
    const text = [
      'Palermo',
      '',
      'Perin\tPalermo\t6\t5',
      'Patanè\tJuve Stabia\t7\t10,5',
      '   ',
      'Hellas Verona',
    ].join('\n')
    const { rows, errors, ignored } = parseVotes(text)
    expect(errors).toEqual([])
    expect(ignored).toBe(2)
    expect(rows.map((r) => [r.name, r.fantavote])).toEqual([
      ['Perin', 5],
      ['Patanè', 10.5],
    ])
  })

  it('separatore virgola con voti tra virgolette', () => {
    const { rows } = parseVotes('Perin,Palermo,"6,5","5,5"')
    expect(rows[0]).toMatchObject({ vote: 6.5, fantavote: 5.5 })
  })

  it('intestazione con colonne in altro ordine e senza squadra', () => {
    const { rows } = parseVotes('FV;Giocatore;V\n8;Perin;7')
    expect(rows[0]).toMatchObject({
      name: 'Perin',
      team: '',
      vote: 7,
      fantavote: 8,
    })
  })

  it('intestazione ripetuta a metà testo', () => {
    const text =
      'Nome;Squadra;Voto;Fantavoto\nA;X;6;6\nNome;Squadra;Voto;Fantavoto\nB;Y;5;4'
    expect(parseVotes(text).rows).toHaveLength(2)
  })

  it('segnala righe errate con il numero di riga', () => {
    const { rows, errors } = parseVotes(
      [
        'Nome;Squadra;Voto;Fantavoto',
        'A;X;sei;6',
        'B;Y;6;boh',
        ';Z;6;6',
        'C;W;11;12',
        'D;V;6;6',
      ].join('\n'),
    )
    expect(rows.map((r) => r.name)).toEqual(['D'])
    expect(errors.map((e) => [e.line, e.reason])).toEqual([
      [2, 'Voto "sei" non valido'],
      [3, 'Fantavoto "boh" non valido'],
      [4, 'Nome mancante'],
      [5, 'Voto 11 fuori scala (0-10)'],
    ])
  })

  it('senza intestazione servono 4 colonne', () => {
    const { rows, errors } = parseVotes('Perin;Palermo;6')
    expect(rows).toEqual([])
    expect(errors[0].reason).toContain('4 colonne')
  })
})
