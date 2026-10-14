import { describe, expect, it } from 'vitest'
import { csvText } from './csv'

describe('csvText', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvText('a,b')).toBe('"a,b"')
    expect(csvText('say "hi"')).toBe('"say ""hi"""')
    expect(csvText('line1\nline2')).toBe('"line1\nline2"')
  })
  it('neutralises spreadsheet formulas', () => {
    expect(csvText('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvText('+1')).toBe("'+1")
  })
  it('leaves plain text alone', () => {
    expect(csvText('ORB breakout')).toBe('ORB breakout')
  })
})
