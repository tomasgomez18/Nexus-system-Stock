import { describe, test, expect } from 'vitest';
import { calcularPagina, paginar, rangoPaginas } from '../src/utils/paginacion';

describe('calcularPagina', () => {
  test('con total 0 devuelve una sola página vacía', () => {
    expect(calcularPagina(0, 25, 1)).toEqual({
      total: 0,
      porPagina: 25,
      totalPaginas: 1,
      paginaSegura: 1,
      desde: 0,
      hasta: 0,
    });
  });

  test('calcula el rango de la página en el medio', () => {
    expect(calcularPagina(100, 25, 2)).toEqual({
      total: 100,
      porPagina: 25,
      totalPaginas: 4,
      paginaSegura: 2,
      desde: 26,
      hasta: 50,
    });
  });

  test('ajusta una página fuera de rango a la última', () => {
    const info = calcularPagina(10, 25, 99);
    expect(info.totalPaginas).toBe(1);
    expect(info.paginaSegura).toBe(1);
    expect(info.desde).toBe(1);
    expect(info.hasta).toBe(10);
  });

  test('tolera porPagina inválido o negativo', () => {
    expect(calcularPagina(3, 0, 1).porPagina).toBe(1);
    expect(calcularPagina(3, -5, 1).totalPaginas).toBe(3);
    expect(calcularPagina(3, 'x', 1).totalPaginas).toBe(3);
  });
});

describe('paginar', () => {
  const lista = [1, 2, 3, 4, 5];

  test('devuelve los items de la primera página', () => {
    const res = paginar(lista, 1, 2);
    expect(res.items).toEqual([1, 2]);
    expect(res.totalPaginas).toBe(3);
    expect(res.desde).toBe(1);
    expect(res.hasta).toBe(2);
  });

  test('devuelve la última página parcial', () => {
    const res = paginar(lista, 3, 2);
    expect(res.items).toEqual([5]);
    expect(res.desde).toBe(5);
    expect(res.hasta).toBe(5);
  });

  test('con página fuera de rango devuelve la última sin romper', () => {
    const res = paginar(lista, 99, 2);
    expect(res.paginaSegura).toBe(3);
    expect(res.items).toEqual([5]);
  });

  test('con lista vacía devuelve vacío', () => {
    const res = paginar([], 1, 25);
    expect(res.items).toEqual([]);
    expect(res.total).toBe(0);
    expect(res.desde).toBe(0);
    expect(res.hasta).toBe(0);
  });

  test('tolera una lista que no es array', () => {
    expect(paginar(null, 1, 25).items).toEqual([]);
    expect(paginar(undefined, 1, 25).items).toEqual([]);
  });
});

describe('rangoPaginas', () => {
  test('con una sola página devuelve solo el 1', () => {
    expect(rangoPaginas(1, 1)).toEqual([1]);
  });

  test('con pocas páginas no agrega elipsis', () => {
    expect(rangoPaginas(2, 3)).toEqual([1, 2, 3]);
  });

  test('con muchas páginas resume con elipsis en el medio', () => {
    expect(rangoPaginas(5, 10)).toEqual([1, '…', 4, 5, 6, '…', 10]);
  });

  test('en la primera página muestra el inicio', () => {
    expect(rangoPaginas(1, 10)).toEqual([1, 2, '…', 10]);
  });

  test('en la última página muestra el final', () => {
    expect(rangoPaginas(10, 10)).toEqual([1, '…', 9, 10]);
  });

  test('tolera valores inválidos', () => {
    expect(rangoPaginas(0, 0)).toEqual([1]);
    expect(rangoPaginas(99, 4)).toEqual([1, '…', 3, 4]);
  });
});
