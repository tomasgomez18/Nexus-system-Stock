import { describe, test, expect } from 'vitest';
import { formatearRestante } from '../src/utils/cuentaRegresiva';

describe('formatearRestante', () => {
  test('formatea días, horas, minutos y segundos', () => {
    const ms = ((2 * 24 + 4) * 3600 + 15 * 60 + 30) * 1000;
    expect(formatearRestante(ms)).toBe('2d 04h 15m 30s');
  });

  test('sin días muestra horas, minutos y segundos', () => {
    expect(formatearRestante((4 * 3600 + 15 * 60 + 30) * 1000)).toBe('04h 15m 30s');
  });

  test('sin horas muestra minutos y segundos', () => {
    expect(formatearRestante((15 * 60 + 5) * 1000)).toBe('15m 05s');
  });

  test('menos de un minuto muestra solo segundos', () => {
    expect(formatearRestante(30 * 1000)).toBe('30s');
  });

  test('tiempos negativos o inválidos quedan en cero', () => {
    expect(formatearRestante(-5000)).toBe('0s');
    expect(formatearRestante(null)).toBe('0s');
    expect(formatearRestante('x')).toBe('0s');
  });
});
