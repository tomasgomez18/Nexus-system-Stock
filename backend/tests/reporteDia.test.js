import test from 'node:test';
import assert from 'node:assert/strict';
import { combinarCierresDia } from '../modules/Venta/VentaController.js';
import { construirDatosCierre } from '../services/CorreoService.js';

const cierre = (extra) => ({
  fecha: new Date('2026-01-01T03:00:00.000Z'),
  estado: 'cerrado',
  total: 0,
  cantidad: 0,
  efectivo: { total: 0, cantidad: 0 },
  transferencia: { total: 0, cantidad: 0 },
  tarjeta: { total: 0, cantidad: 0 },
  cuentaCorriente: { total: 0, cantidad: 0 },
  ...extra,
});

const manana = cierre({
  turno: 'manana',
  abiertoPor: 'Juan',
  abiertaEn: new Date('2026-01-01T12:00:00.000Z'),
  cerradoPor: 'Juan',
  cerradaEn: new Date('2026-01-01T16:00:00.000Z'),
  fondoInicial: 500,
  total: 1000,
  cantidad: 4,
  efectivo: { total: 600, cantidad: 2 },
  transferencia: { total: 400, cantidad: 2 },
  totalRetiros: 100,
});

const tarde = cierre({
  turno: 'tarde',
  abiertoPor: 'Ana',
  abiertaEn: new Date('2026-01-01T16:05:00.000Z'),
  cerradoPor: 'Ana',
  cerradaEn: new Date('2026-01-01T22:00:00.000Z'),
  total: 300,
  cantidad: 1,
  tarjeta: { total: 300, cantidad: 1 },
});

test('combinarCierresDia suma los turnos y toma el fondo de la mañana', () => {
  const merged = combinarCierresDia([tarde, manana]);
  assert.equal(merged.turno, 'dia');
  assert.equal(merged.total, 1300);
  assert.equal(merged.cantidad, 5);
  assert.equal(merged.efectivo.total, 600);
  assert.equal(merged.transferencia.total, 400);
  assert.equal(merged.tarjeta.total, 300);
  assert.equal(merged.totalRetiros, 100);
  assert.equal(merged.fondoInicial, 500, 'el fondo del día es el de la mañana');
  assert.equal(merged.abiertoPor, 'Juan');
  assert.equal(merged.cerradoPor, 'Juan / Ana');
});

test('construirDatosCierre arma el reporte del día con desglose por turno', () => {
  const merged = combinarCierresDia([tarde, manana]);
  const datos = construirDatosCierre({
    ventas: [],
    close: merged,
    offset: 0,
    turno: 'dia',
    desgloseTurnos: [
      {
        turno: 'manana',
        total: 1000,
        cantidad: 4,
        efectivo: { total: 600 },
        transferencia: { total: 400 },
        tarjeta: { total: 0 },
        cuentaCorriente: { total: 0 },
        cerradoPor: 'Juan',
      },
      {
        turno: 'tarde',
        total: 300,
        cantidad: 1,
        efectivo: { total: 0 },
        transferencia: { total: 0 },
        tarjeta: { total: 300 },
        cuentaCorriente: { total: 0 },
        cerradoPor: 'Ana',
      },
    ],
  });
  assert.match(datos.subject, /Reporte del total del día/);
  assert.match(datos.html, /Detalle por turno/);
  assert.match(datos.html, /REPORTE DEL DÍA/);
  assert.match(datos.html, /Juan/);
  assert.match(datos.html, /Ana/);
});

test('el cierre de un turno no incluye el desglose por turno', () => {
  const datos = construirDatosCierre({
    ventas: [],
    close: cierre({ turno: 'tarde', cerradoPor: 'Ana', total: 100, efectivo: { total: 100, cantidad: 1 } }),
    offset: 0,
    turno: 'tarde',
  });
  assert.doesNotMatch(datos.html, /Detalle por turno/);
  assert.match(datos.subject, /Cierre turno tarde/);
});
