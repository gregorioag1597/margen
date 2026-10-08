import { describe, expect, it } from 'vitest';
import { fractionToPercentInput, parseLocaleNumber, percentInputToFraction } from './number-input';

describe('parseLocaleNumber (formato argentino)', () => {
  it.each([
    ['18000', '18000'],
    ['18.000', '18000'],
    ['1.500.000', '1500000'],
    ['6,39', '6.39'],
    ['1.234,50', '1234.5'],
    ['1,234.50', '1234.5'],
    ['1.5', '1.5'],
    ['0,08', '0.08'],
    ['$ 25.000', '25000'],
    [' 80 ', '80'],
    ['007', '7'],
    ['-5', '-5'],
  ])('"%s" → %s', (input, expected) => {
    expect(parseLocaleNumber(input)).toBe(expected);
  });

  it.each(['', 'abc', '1,2,3', '12a', '--5', '1..2'])('"%s" no es un número', (input) => {
    expect(parseLocaleNumber(input)).toBeNull();
  });
});

describe('porcentajes', () => {
  it('"6,39" → 0.0639 y vuelta', () => {
    expect(percentInputToFraction('6,39')).toBe('0.0639');
    expect(fractionToPercentInput(0.0639)).toBe('6,39');
  });

  it('"15" → 0.15', () => {
    expect(percentInputToFraction('15')).toBe('0.15');
  });
});
