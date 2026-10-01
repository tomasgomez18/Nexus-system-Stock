import './helpers/setup-env.js';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDB, stopTestDB, clearDB, runHandler } from './helpers/db.js';
import Venta from '../modules/Venta/VentaModel.js';
import Producto from '../modules/Producto/ProductoModel.js';
import { obtenerAnaliticaVentas, obtenerEstadisticasVentas, obtenerMasVendidos } from '../modules/Venta/VentaController.js';

before(async () => {
  await startTestDB();
});

after(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearDB();
});

const crearVentaTest = (extra = {}) =>
  Venta.create({
    cantidad: 1,
    precio: 100,
    total: 100,
    empleado: 'Ana',
    pagos: [{ metodo: 'efectivo', monto: 100 }],
    fechaCreacion: new Date('2026-09-10T12:00:00.000Z'),
    ...extra,
  });

const sumaSerie = (puntos, clave) =>
  Math.round(puntos.reduce((suma, punto) => suma + (punto[clave] || 0), 0) * 100) / 100;

test('la analítica vacía devuelve ceros y ejes vacíos', async () => {
  const res = await runHandler(obtenerAnaliticaVentas, { query: { offset: '0' } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.resumen, { total: 0, cantidad: 0 });
  assert.deepEqual(res.body.ejes.dia.puntos, []);
  assert.deepEqual(res.body.ejes.semana.puntos, []);
  assert.deepEqual(res.body.ejes.mes.puntos, []);
  assert.equal(res.body.ejes.hora, undefined);
  assert.deepEqual(res.body.empleados, []);
  assert.deepEqual(res.body.productos, []);
});

test('los ejes suman lo mismo que las estadísticas existentes', async () => {
  await crearVentaTest({ total: 100, cantidad: 1, pagos: [{ metodo: 'efectivo', monto: 100 }] });
  await crearVentaTest({ total: 250, cantidad: 2, precio: 125, pagos: [{ metodo: 'tarjeta', monto: 250 }] });
  await crearVentaTest({
    total: 90,
    cantidad: 1,
    pagos: [
      { metodo: 'efectivo', monto: 40 },
      { metodo: 'transferencia', monto: 50 },
    ],
  });
  await crearVentaTest({ total: 500, cantidad: 3, estado: 'devuelta' });

  const query = { desde: '2026-09-01', hasta: '2026-09-30', offset: '0' };
  const analitica = await runHandler(obtenerAnaliticaVentas, { query });
  const stats = await runHandler(obtenerEstadisticasVentas, { query });

  assert.equal(analitica.body.resumen.total, 440);
  assert.equal(analitica.body.resumen.cantidad, 4);

  for (const eje of ['dia', 'semana', 'mes']) {
    assert.equal(sumaSerie(analitica.body.ejes[eje].puntos, 'total'), stats.body.total, `total del eje ${eje}`);
    assert.equal(sumaSerie(analitica.body.ejes[eje].puntos, 'unidades'), stats.body.cantidad, `unidades del eje ${eje}`);
  }

  assert.equal(analitica.body.empleados.length, 1);
  assert.equal(analitica.body.empleados[0].empleado, 'Ana');
  assert.equal(analitica.body.empleados[0].total, 440);
  assert.equal(sumaSerie(analitica.body.ejes.dia.puntos, 'emp_0'), 440);
  assert.equal(sumaSerie(analitica.body.ejes.mes.puntos, 'emp_0'), 440);
});

test('las estadísticas separan la cuenta corriente como método de pago', async () => {
  await crearVentaTest({ total: 100, cantidad: 1, pagos: [{ metodo: 'efectivo', monto: 100 }] });
  await crearVentaTest({ total: 300, cantidad: 2, precio: 150, pagos: [{ metodo: 'cuentaCorriente', monto: 300 }] });
  await crearVentaTest({
    total: 200,
    cantidad: 1,
    pagos: [
      { metodo: 'efectivo', monto: 100 },
      { metodo: 'cuentaCorriente', monto: 100 },
    ],
  });

  const res = await runHandler(obtenerEstadisticasVentas, { query: { offset: '0' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.efectivo.total, 200);
  assert.equal(res.body.cuentaCorriente.total, 400);
  assert.equal(res.body.total, 600);
});

test('la serie por día respeta el offset del cliente y rellena días sin ventas', async () => {
  await crearVentaTest({ fechaCreacion: new Date('2026-09-10T02:30:00.000Z'), total: 100 });
  await crearVentaTest({ fechaCreacion: new Date('2026-09-12T12:00:00.000Z'), total: 300 });

  const res = await runHandler(obtenerAnaliticaVentas, { query: { offset: '180' } });
  assert.deepEqual(
    res.body.ejes.dia.puntos.map((punto) => ({ fecha: punto.fecha, total: punto.total, unidades: punto.unidades })),
    [
      { fecha: '2026-09-09', total: 100, unidades: 1 },
      { fecha: '2026-09-10', total: 0, unidades: 0 },
      { fecha: '2026-09-11', total: 0, unidades: 0 },
      { fecha: '2026-09-12', total: 300, unidades: 1 },
    ]
  );
});

test('la serie por semana agrupa desde el lunes y rellena semanas sin ventas', async () => {
  await crearVentaTest({ fechaCreacion: new Date('2026-09-09T12:00:00.000Z'), total: 100 });
  await crearVentaTest({ fechaCreacion: new Date('2026-09-21T12:00:00.000Z'), total: 300 });

  const res = await runHandler(obtenerAnaliticaVentas, { query: { offset: '0' } });
  assert.deepEqual(
    res.body.ejes.semana.puntos.map((punto) => ({ semana: punto.semana, total: punto.total })),
    [
      { semana: '2026-09-07', total: 100 },
      { semana: '2026-09-14', total: 0 },
      { semana: '2026-09-21', total: 300 },
    ]
  );
});

test('la semana usa la fecha local del cliente', async () => {
  await crearVentaTest({ fechaCreacion: new Date('2026-09-14T02:30:00.000Z'), total: 100 });

  const res = await runHandler(obtenerAnaliticaVentas, { query: { offset: '180' } });
  assert.equal(res.body.ejes.semana.puntos.length, 1);
  assert.equal(res.body.ejes.semana.puntos[0].semana, '2026-09-07');
});

test('la serie por mes agrupa y rellena meses intermedios', async () => {
  await crearVentaTest({ fechaCreacion: new Date('2026-07-15T12:00:00.000Z'), total: 100 });
  await crearVentaTest({ fechaCreacion: new Date('2026-09-15T12:00:00.000Z'), total: 200 });

  const res = await runHandler(obtenerAnaliticaVentas, { query: { offset: '0' } });
  assert.deepEqual(
    res.body.ejes.mes.puntos.map((punto) => ({ mes: punto.mes, total: punto.total })),
    [
      { mes: '2026-07', total: 100 },
      { mes: '2026-08', total: 0 },
      { mes: '2026-09', total: 200 },
    ]
  );
});

test('solo se devuelven los 5 empleados con más ventas y sus series', async () => {
  for (let i = 0; i < 7; i++) {
    await crearVentaTest({
      empleado: `Emp${i}`,
      total: 100 + i * 10,
      pagos: [{ metodo: 'efectivo', monto: 100 + i * 10 }],
    });
  }

  const res = await runHandler(obtenerAnaliticaVentas, { query: { offset: '0' } });
  assert.equal(res.body.empleados.length, 5);
  assert.equal(res.body.empleados[0].empleado, 'Emp6');
  assert.equal(res.body.empleados[0].id, 'emp_0');
  assert.equal(res.body.empleados[0].total, 160);
  assert.equal(res.body.empleados[4].empleado, 'Emp2');

  const punto = res.body.ejes.dia.puntos[0];
  assert.equal(punto.emp_0, 160);
  assert.equal(punto.emp_1, 150);
  assert.equal(punto.emp_5, undefined);
});

test('los productos más vendidos coinciden con /mas-vendidos y sus series', async () => {
  const ventas = [];
  for (let i = 0; i < 6; i++) {
    const producto = await Producto.create({
      nombre: `P${i}`,
      precio: 10,
      cantidad: 100,
      categoria: 'Ropa',
    });
    ventas.push(
      Venta.create({
        articulos: [{ producto: producto._id, cantidad: 6 - i, precio: 10, subtotal: (6 - i) * 10 }],
        total: (6 - i) * 10,
        empleado: 'Ana',
        pagos: [{ metodo: 'efectivo', monto: (6 - i) * 10 }],
        fechaCreacion: new Date('2026-09-10T12:00:00.000Z'),
      })
    );
  }
  await Promise.all(ventas);

  const query = { offset: '0' };
  const analitica = await runHandler(obtenerAnaliticaVentas, { query });
  const masVendidos = await runHandler(obtenerMasVendidos, { query });

  assert.equal(analitica.body.productos.length, 5);
  assert.deepEqual(
    analitica.body.productos.map((p) => [p.label, p.unidades]),
    masVendidos.body.map((p) => [p.nombre, p.totalVendido])
  );
  assert.equal(analitica.body.productos[0].label, 'P0');
  assert.equal(analitica.body.productos[0].id, 'prod_0');
  assert.equal(sumaSerie(analitica.body.ejes.dia.puntos, 'prod_0'), 6);
  assert.equal(sumaSerie(analitica.body.ejes.dia.puntos, 'prod_4'), 2);
  assert.equal(analitica.body.productos.find((p) => p.label === 'P5'), undefined);
});

test('las unidades efectivas de ventas legacy descuentan lo devuelto', async () => {
  const gorra = await Producto.create({ nombre: 'Gorra', precio: 50, cantidad: 10, categoria: 'Accesorios' });
  await crearVentaTest({
    producto: gorra._id,
    cantidad: 3,
    precio: 50,
    total: 150,
    cantidadDevuelta: 1,
    pagos: [{ metodo: 'efectivo', monto: 150 }],
  });

  const res = await runHandler(obtenerAnaliticaVentas, { query: { offset: '0' } });
  assert.equal(res.body.productos.length, 1);
  assert.equal(res.body.productos[0].label, 'Gorra');
  assert.equal(res.body.productos[0].unidades, 2);
  assert.equal(sumaSerie(res.body.ejes.dia.puntos, 'prod_0'), 2);
  assert.equal(res.body.ejes.dia.puntos[0].unidades, 2);
});

test('el rango desde/hasta filtra las ventas incluidas', async () => {
  await crearVentaTest({ fechaCreacion: new Date('2026-08-31T12:00:00.000Z'), total: 999 });
  await crearVentaTest({ fechaCreacion: new Date('2026-09-10T12:00:00.000Z'), total: 100 });

  const res = await runHandler(obtenerAnaliticaVentas, {
    query: { desde: '2026-09-01', hasta: '2026-09-30', offset: '0' },
  });
  assert.equal(res.body.resumen.total, 100);
  assert.equal(res.body.resumen.cantidad, 1);
  assert.equal(res.body.ejes.dia.puntos.length, 1);
  assert.equal(res.body.ejes.dia.puntos[0].fecha, '2026-09-10');
});

test('una fecha inválida devuelve error 400', async () => {
  await assert.rejects(
    () => runHandler(obtenerAnaliticaVentas, { query: { desde: '2026-13-99', offset: '0' } }),
    (error) => error.statusCode === 400
  );
});
