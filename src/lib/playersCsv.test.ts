import { describe, expect, it } from 'vitest'
import { splitLine } from './csv'
import { parsePlayersCsv, parseRole } from './playersCsv'

describe('parsePlayersCsv', () => {
  it('legge il formato standard con intestazione e BOM', () => {
    const { rows, errors } = parsePlayersCsv(
      '﻿nome;ruolo;squadra\nPerin;P;Palermo\nPatanè;C;Südtirol\n',
    )
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { line: 2, name: 'Perin', role: 'P', real_team: 'Palermo' },
      { line: 3, name: 'Patanè', role: 'C', real_team: 'Südtirol' },
    ])
  })

  it('funziona senza intestazione e con separatori tab o virgola', () => {
    expect(parsePlayersCsv('Perin\tP\tPalermo').rows).toHaveLength(1)
    expect(
      parsePlayersCsv('Perin,P,Palermo\r\nLeali,P,Hellas Verona').rows,
    ).toHaveLength(2)
  })

  it("usa l'ordine delle colonne dell'intestazione", () => {
    const { rows } = parsePlayersCsv(
      'Squadra;Giocatore;Ruolo\nPalermo;Perin;Por',
    )
    expect(rows[0]).toMatchObject({
      name: 'Perin',
      role: 'P',
      real_team: 'Palermo',
    })
  })

  it('ignora righe vuote e segnala le righe errate con il numero di riga', () => {
    const { rows, errors } = parsePlayersCsv(
      [
        'nome;ruolo;squadra',
        'Perin;P;Palermo',
        '',
        'Senza ruolo;X;Pisa',
        ';D;Pisa',
        'Solo due;D',
        'Senza squadra;A;',
        'Perin;P;Palermo',
        'Buono;att;Bari',
      ].join('\n'),
    )
    expect(rows.map((r) => r.name)).toEqual(['Perin', 'Buono'])
    expect(errors.map((e) => [e.line, e.reason])).toEqual([
      [4, 'Ruolo "X" non valido: usa P, D, C o A'],
      [5, 'Nome mancante'],
      [6, 'Servono 3 colonne: nome;ruolo;squadra'],
      [7, 'Squadra mancante'],
      [8, 'Duplicato della riga 2'],
    ])
  })

  it('riconosce i duplicati anche con accenti o maiuscole diverse', () => {
    const { rows, errors } = parsePlayersCsv(
      'Patanè;C;Südtirol\nPATANE;C;sudtirol',
    )
    expect(rows).toHaveLength(1)
    expect(errors[0].reason).toBe('Duplicato della riga 1')
  })

  it("segnala un'intestazione senza la colonna squadra", () => {
    const { rows, errors } = parsePlayersCsv('nome;ruolo\nPerin;P')
    expect(rows).toEqual([])
    expect(errors[0].reason).toContain('squadra')
  })

  it('testo vuoto', () => {
    expect(parsePlayersCsv('  \n\n')).toEqual({ rows: [], errors: [] })
  })
})

describe('parseRole', () => {
  it('accetta lettere e parole', () => {
    expect(parseRole('p')).toBe('P')
    expect(parseRole('Difensore')).toBe('D')
    expect(parseRole(' CEN ')).toBe('C')
    expect(parseRole('Attaccante')).toBe('A')
    expect(parseRole('X')).toBeNull()
  })
})

describe('splitLine', () => {
  it('gestisce i campi tra virgolette', () => {
    expect(splitLine('"Rossi; M.";D;"Pisa"', ';')).toEqual([
      'Rossi; M.',
      'D',
      'Pisa',
    ])
    expect(splitLine('"Il ""Mago""",C,Bari', ',')).toEqual([
      'Il "Mago"',
      'C',
      'Bari',
    ])
  })
})
