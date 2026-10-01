import './helpers/setup-env.js';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startTestDB, stopTestDB, clearDB, runHandler } from './helpers/db.js';
import Producto from '../modules/Producto/ProductoModel.js';
import Venta from '../modules/Venta/VentaModel.js';
import Cliente from '../modules/Cliente/ClienteModel.js';
import Usuario from '../modules/Autenticacion/UsuarioModel.js';
import Notificacion from '../modules/Notificacion/NotificacionModel.js';
import MovimientoCuentaCorriente from '../modules/MovimientoCuentaCorriente/MovimientoCuentaCorrienteModel.js';
import CuotaCuentaCorriente from '../modules/CuotaCuentaCorriente/CuotaCuentaCorrienteModel.js';
import { crearVenta, abrirCaja, eliminarVenta } from '../modules/Venta/VentaController.js';
import {
  crearMovimiento,
  anularMovimiento,
  actualizarMovimiento,
} from '../modules/MovimientoCuentaCorriente/MovimientoCuentaCorrienteController.js';
import { ejecutarDevolucion, revertirDevolucion } from '../modules/Devolucion/DevolucionService.js';
import {
  obtenerCuotasDeCliente,
  obtenerResumenCuotas,
} from '../modules/CuotaCuentaCorriente/CuotaCuentaCorrienteController.js';
import { actualizar as actualizarAjustes, obtener as obtenerAjustesController } from '../modules/AjustesCuentaCorriente/AjustesCuentaCorrienteController.js';
import { obtenerAjustes } from '../modules/AjustesCuentaCorriente/AjustesCuentaCorrienteService.js';
import { calcularSaldosDeCliente } from '../utils/CuentaCorrienteUtils.js';
import {
  calcularPlanCuotas,
  resolverPlanDeVenta,
  sumarMeses,
  hoyEnUtc,
  revisarCuotas,
} from '../modules/CuotaCuentaCorriente/CuotasService.js';

before(async () => {
  await startTestDB();
});

after(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearDB();
});

const admin = { id: '507f1f77bcf86cd799439011', nombre: 'Admin', email: 'admin@x.com', rol: 'admin' };

const crearCliente = (extra = {}) => Cliente.create({ nombre: 'Ana Lopez', ...extra });
const crearProducto = (extra = {}) => Producto.create({ nombre: 'Remera', categoria: 'Prendas', precio: 10000, cantidad: 50, ...extra });

const abrirCajaDeHoy = async (fondoInicial = 0) => {
  const res = await runHandler(abrirCaja, { body: { nombre: 'Turno Mañana', fondoInicial }, usuario: admin });
  assert.equal(res.status, 201);
  return res.body;
};

const fechaFutura = (dias = 30) => {
  const d = new Date(hoyEnUtc().getTime() + dias * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

const diasAtras = (dias) => new Date(hoyEnUtc().getTime() - dias * 86400000);

/** El precio del producto sale de la suma de los pagos, asi el ticket siempre cuadra. */
const vender = async ({ pagos, cliente, ...resto }, usuario = admin) => {
  const total = pagos.reduce((suma, pago) => suma + pago.monto, 0);
  const producto = await crearProducto({ precio: total });
  const res = await runHandler(crearVenta, {
    body: {
      articulos: [{ producto: String(producto._id), cantidad: 1, precio: total }],
      offset: 0,
      pagos,
      cliente,
      ...resto,
    },
    usuario,
  });
  return { ...res, producto };
};

const saldoDe = async (clienteId) => (await calcularSaldosDeCliente(clienteId)).saldo;
const enCentavos = (monto) => Math.round(Number(monto) * 100);

const crearCuota = (cliente, extra = {}) =>
  CuotaCuentaCorriente.create({
    cliente: cliente._id,
    clienteNombre: cliente.nombre,
    venta: new mongoose.Types.ObjectId(),
    numero: 1,
    totalCuotas: 1,
    monto: 10000,
    tasaMoraMensual: 5,
    fechaVencimiento: diasAtras(40),
    estado: 'pendiente',
    ...extra,
  });

test('el plan reparte el interés fijo en cuotas iguales y la última absorbe el redondeo', () => {
  const plan = calcularPlanCuotas({ montoBase: 10000, cantidadCuotas: 3, interesPorcentaje: 10, aplicarInteres: true });
  assert.equal(plan.interesCentavos, 100000);
  assert.equal(plan.totalCentavos, 1100000);
  assert.deepEqual(plan.montosCentavos, [366666, 366666, 366668]);
  assert.equal(plan.montosCentavos.reduce((s, m) => s + m, 0), plan.totalCentavos);

  const sinInteres = calcularPlanCuotas({ montoBase: 10000, cantidadCuotas: 2, interesPorcentaje: 10, aplicarInteres: false });
  assert.equal(sinInteres.interesCentavos, 0);
  assert.deepEqual(sinInteres.montosCentavos, [500000, 500000]);

  const muchas = calcularPlanCuotas({ montoBase: 10000, cantidadCuotas: 99, interesPorcentaje: 0, aplicarInteres: false });
  assert.equal(muchas.cantidadCuotas, 24);
});

test('vender a cuenta corriente en cuotas genera interés y cuotas con vencimientos mensuales', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy();
  const primerVencimiento = fechaFutura(30);

  const venta = await vender({
    pagos: [{ metodo: 'cuentaCorriente', monto: 10000 }],
    cliente: String(cliente._id),
    planCuotas: {
      cantidadCuotas: 3,
      aplicarInteres: true,
      interesPorcentaje: 10,
      tasaMoraMensual: 5,
      primerVencimiento,
    },
  });
  assert.equal(venta.status, 201);
  assert.equal(await saldoDe(cliente._id), 11000);

  const debitos = await MovimientoCuentaCorriente.find({ cliente: cliente._id, tipo: 'debito' });
  assert.equal(debitos.length, 2);
  assert.equal(debitos.find((m) => m.origen === 'factura').monto, 10000);
  assert.equal(debitos.find((m) => m.origen === 'interes').monto, 1000);

  const cuotas = await CuotaCuentaCorriente.find({ venta: venta.body._id }).sort({ numero: 1 });
  assert.equal(cuotas.length, 3);
  assert.deepEqual(cuotas.map((c) => enCentavos(c.monto)), [366666, 366666, 366668]);
  assert.equal(cuotas.reduce((s, c) => s + enCentavos(c.monto), 0), 1100000);
  assert.equal(cuotas[0].tasaMoraMensual, 5);
  assert.equal(cuotas[0].interesPorcentaje, 10);

  const base = new Date(`${primerVencimiento}T00:00:00.000Z`);
  assert.deepEqual(
    cuotas.map((c) => c.fechaVencimiento.getTime()),
    [0, 1, 2].map((i) => sumarMeses(base, i).getTime())
  );

  assert.equal(venta.body.planCuotas.cantidadCuotas, 3);
  assert.equal(enCentavos(venta.body.planCuotas.montoFinanciado), 1100000);
});

test('una venta a cuenta corriente sin plan usa una cuota a 30 días sin interés', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy();

  const venta = await vender({ pagos: [{ metodo: 'cuentaCorriente', monto: 10000 }], cliente: String(cliente._id) });
  assert.equal(await saldoDe(cliente._id), 10000);
  assert.equal(await MovimientoCuentaCorriente.countDocuments({ origen: 'interes' }), 0);

  const cuotas = await CuotaCuentaCorriente.find({ venta: venta.body._id });
  assert.equal(cuotas.length, 1);
  assert.equal(enCentavos(cuotas[0].monto), 1000000);
  assert.equal(cuotas[0].fechaVencimiento.getTime(), sumarMeses(hoyEnUtc(), 1).getTime());

  const ajustes = await obtenerAjustes();
  assert.equal(cuotas[0].tasaMoraMensual, ajustes.tasaMoraMensualPorcentaje);
});

test('los pagos se imputan a la cuota más antigua y al anular el pago las cuotas se recalculan', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy();

  const venta = await vender({
    pagos: [{ metodo: 'cuentaCorriente', monto: 9000 }],
    cliente: String(cliente._id),
    planCuotas: { cantidadCuotas: 3, primerVencimiento: fechaFutura(30) },
  });

  const pago = await runHandler(crearMovimiento, {
    params: { clienteId: String(cliente._id) },
    body: { tipo: 'credito', origen: 'pago', monto: 4000, formaPago: 'efectivo' },
    usuario: admin,
  });
  assert.equal(pago.status, 201);
  assert.equal(pago.body.imputaciones.length, 3);

  let cuotas = await CuotaCuentaCorriente.find({ venta: venta.body._id }).sort({ numero: 1 });
  assert.deepEqual(cuotas.map((c) => c.estado), ['pagada', 'parcial', 'pendiente']);
  assert.equal(enCentavos(cuotas[1].pagado), 100000);
  assert.equal(await saldoDe(cliente._id), 5000);

  await runHandler(anularMovimiento, {
    params: { clienteId: String(cliente._id), movimientoId: String(pago.body._id) },
    body: { motivo: 'Error de carga' },
    usuario: admin,
  });

  cuotas = await CuotaCuentaCorriente.find({ venta: venta.body._id }).sort({ numero: 1 });
  assert.deepEqual(cuotas.map((c) => c.estado), ['pendiente', 'pendiente', 'pendiente']);
  assert.deepEqual(cuotas.map((c) => enCentavos(c.pagado)), [0, 0, 0]);
  assert.equal(await saldoDe(cliente._id), 9000);
});

test('la mora se aplica apenas la cuota vence y suma un mes por cada mes impaga', async () => {
  const cliente = await crearCliente();
  const cuota = await crearCuota(cliente, { monto: 10000, fechaVencimiento: diasAtras(70), tasaMoraMensual: 5 });
  await MovimientoCuentaCorriente.create({
    cliente: cliente._id,
    clienteNombre: cliente.nombre,
    tipo: 'debito',
    origen: 'factura',
    monto: 10000,
    formaPago: 'ninguno',
    estado: 'activo',
  });

  const primera = await revisarCuotas();
  assert.equal(primera.morasAplicadas, 3);
  assert.equal(primera.montoMora, 1500);

  const actualizada = await CuotaCuentaCorriente.findById(cuota._id);
  assert.equal(enCentavos(actualizada.moraAcumulada), 150000);
  assert.equal(await saldoDe(cliente._id), 11500);

  const segunda = await revisarCuotas();
  assert.equal(segunda.morasAplicadas, 0);

  const movimientosMora = await MovimientoCuentaCorriente.find({ origen: 'mora', origenCuota: cuota._id }).sort({ fecha: 1 });
  assert.equal(movimientosMora.length, 3);
  assert.equal(movimientosMora[0].tipo, 'debito');
  assert.equal(movimientosMora[0].monto, 500);
  assert.equal(movimientosMora[0].estado, 'activo');
});

test('los avisos de cuota son solo para admin y no se duplican', async () => {
  await Usuario.create({ nombre: 'Admin', email: 'admin@x.com', clave: 'secreta123', rol: 'admin' });
  const cliente = await crearCliente();
  const porVencer = await crearCuota(cliente, {
    monto: 5000,
    fechaVencimiento: new Date(hoyEnUtc().getTime() + 2 * 86400000),
    tasaMoraMensual: 0,
  });
  const vencida = await crearCuota(cliente, {
    monto: 8000,
    fechaVencimiento: diasAtras(2),
    tasaMoraMensual: 5,
  });

  const res = await revisarCuotas();
  assert.equal(res.avisosProximos, 1);
  assert.equal(res.avisosVencidos, 1);
  assert.equal(res.morasAplicadas, 1);

  const avisos = await Notificacion.find({ cuota: { $in: [porVencer._id, vencida._id] } });
  assert.equal(avisos.length, 3);
  assert.ok(avisos.every((a) => a.soloAdmin === true && a.nuevaParaAdmin === true));
  assert.ok(avisos.some((a) => a.titulo === 'Cuota por vencer'));
  assert.ok(avisos.some((a) => a.titulo === 'Cuota vencida'));
  assert.ok(avisos.some((a) => a.titulo === 'Cuota vencida: mora aplicada'));

  const otra = await revisarCuotas();
  assert.equal(otra.avisosProximos, 0);
  assert.equal(otra.avisosVencidos, 0);
  assert.equal(await Notificacion.countDocuments(), 3);
});

test('la devolución total cancela las cuotas pendientes y revierte interés y mora', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy();

  const venta = await vender({
    pagos: [{ metodo: 'cuentaCorriente', monto: 10000 }],
    cliente: String(cliente._id),
    planCuotas: {
      cantidadCuotas: 2,
      aplicarInteres: true,
      interesPorcentaje: 10,
      tasaMoraMensual: 5,
      primerVencimiento: fechaFutura(30),
    },
  });
  assert.equal(await saldoDe(cliente._id), 11000);

  const { devolucion } = await ejecutarDevolucion(
    { producto: String(venta.producto._id), cantidad: 1, venta: String(venta.body._id), motivo: 'No le gustó', offset: 0 },
    admin
  );

  assert.equal(await saldoDe(cliente._id), 0);
  const cuotas = await CuotaCuentaCorriente.find({ venta: venta.body._id });
  assert.equal(cuotas.length, 2);
  assert.ok(cuotas.every((c) => c.estado === 'cancelada'));

  const creditos = await MovimientoCuentaCorriente.find({ origenDevolucion: devolucion._id, tipo: 'credito' });
  assert.equal(creditos.length, 2);
  assert.equal(creditos.reduce((s, c) => s + c.monto, 0), 11000);
});

test('revertir una devolución total reactiva las cuotas canceladas', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy();

  const venta = await vender({
    pagos: [{ metodo: 'cuentaCorriente', monto: 10000 }],
    cliente: String(cliente._id),
    planCuotas: {
      cantidadCuotas: 2,
      aplicarInteres: true,
      interesPorcentaje: 10,
      tasaMoraMensual: 5,
      primerVencimiento: fechaFutura(30),
    },
  });
  const { devolucion } = await ejecutarDevolucion(
    { producto: String(venta.producto._id), cantidad: 1, venta: String(venta.body._id), motivo: 'Error', offset: 0 },
    admin
  );
  assert.equal(await saldoDe(cliente._id), 0);

  await revertirDevolucion(String(devolucion._id), admin);

  const cuotas = await CuotaCuentaCorriente.find({ venta: venta.body._id });
  assert.ok(cuotas.every((c) => c.estado === 'pendiente'));
  assert.equal(await saldoDe(cliente._id), 11000);
});

test('eliminar una venta cancela sus cuotas y anula los cargos de interés', async () => {
  const cliente = await crearCliente();
  await abrirCajaDeHoy();

  const venta = await vender({
    pagos: [{ metodo: 'cuentaCorriente', monto: 10000 }],
    cliente: String(cliente._id),
    planCuotas: {
      cantidadCuotas: 2,
      aplicarInteres: true,
      interesPorcentaje: 10,
      tasaMoraMensual: 5,
      primerVencimiento: fechaFutura(30),
    },
  });

  const res = await runHandler(eliminarVenta, { params: { id: String(venta.body._id) }, usuario: admin });
  assert.equal(res.status, 200);

  const cuotas = await CuotaCuentaCorriente.find({ venta: venta.body._id });
  assert.ok(cuotas.every((c) => c.estado === 'cancelada'));
  assert.equal(await MovimientoCuentaCorriente.countDocuments({ origen: 'interes', estado: 'activo' }), 0);
  assert.equal(await saldoDe(cliente._id), 10000);
});

test('el admin actualiza los ajustes y se usan como valores por defecto al vender', async () => {
  const iniciales = await runHandler(obtenerAjustesController, { usuario: admin });
  assert.equal(iniciales.body.interesFinanciacionPorcentaje, 10);
  assert.equal(iniciales.body.tasaMoraMensualPorcentaje, 5);
  assert.equal(iniciales.body.diasAvisoVencimiento, 3);

  const actualizados = await runHandler(actualizarAjustes, {
    body: { interesFinanciacionPorcentaje: 15, tasaMoraMensualPorcentaje: 8, diasAvisoVencimiento: 7 },
    usuario: admin,
  });
  assert.equal(actualizados.status, 200);
  assert.equal(actualizados.body.interesFinanciacionPorcentaje, 15);
  assert.equal(actualizados.body.actualizadoPor, 'Admin');

  const plan = await resolverPlanDeVenta({ aplicarInteres: true }, { offset: 0 });
  assert.equal(plan.interesPorcentaje, 15);
  assert.equal(plan.tasaMoraMensual, 8);

  await assert.rejects(
    () => runHandler(actualizarAjustes, { body: { interesFinanciacionPorcentaje: -1, tasaMoraMensualPorcentaje: 5, diasAvisoVencimiento: 3 }, usuario: admin }),
    (error) => error.name === 'ZodError'
  );
});

test('no se puede fijar un primer vencimiento anterior a hoy', async () => {
  const ayer = new Date(hoyEnUtc().getTime() - 86400000);
  const ayerStr = `${ayer.getUTCFullYear()}-${String(ayer.getUTCMonth() + 1).padStart(2, '0')}-${String(ayer.getUTCDate()).padStart(2, '0')}`;
  await assert.rejects(
    () => resolverPlanDeVenta({ primerVencimiento: ayerStr }, { offset: 0 }),
    (error) => error.statusCode === 400
  );
  await assert.rejects(
    () => resolverPlanDeVenta({ primerVencimiento: 'no-es-fecha' }, { offset: 0 }),
    (error) => error.statusCode === 400
  );
});

test('no se puede cargar a mano un movimiento de interés o mora', async () => {
  const cliente = await crearCliente();
  await assert.rejects(
    () =>
      runHandler(crearMovimiento, {
        params: { clienteId: String(cliente._id) },
        body: { tipo: 'debito', origen: 'interes', monto: 100, formaPago: 'ninguno' },
        usuario: admin,
      }),
    (error) => error.name === 'ZodError'
  );
});

test('un pago no se puede registrar como débito ni una factura como crédito', async () => {
  const cliente = await crearCliente();
  await assert.rejects(
    () =>
      runHandler(crearMovimiento, {
        params: { clienteId: String(cliente._id) },
        body: { tipo: 'debito', origen: 'pago', monto: 1000, formaPago: 'efectivo' },
        usuario: admin,
      }),
    (error) => error.name === 'ZodError'
  );
  await assert.rejects(
    () =>
      runHandler(crearMovimiento, {
        params: { clienteId: String(cliente._id) },
        body: { tipo: 'credito', origen: 'factura', monto: 1000, formaPago: 'ninguno' },
        usuario: admin,
      }),
    (error) => error.name === 'ZodError'
  );
  assert.equal(await MovimientoCuentaCorriente.countDocuments(), 0);
});

test('al editar un movimiento no se permite una combinación incoherente de tipo y origen', async () => {
  const cliente = await crearCliente();
  await MovimientoCuentaCorriente.create({
    cliente: cliente._id,
    clienteNombre: cliente.nombre,
    tipo: 'debito',
    origen: 'factura',
    monto: 5000,
    formaPago: 'ninguno',
    estado: 'activo',
  });
  const pago = await runHandler(crearMovimiento, {
    params: { clienteId: String(cliente._id) },
    body: { tipo: 'credito', origen: 'pago', monto: 1000, formaPago: 'efectivo' },
    usuario: admin,
  });
  assert.equal(pago.status, 201);

  await assert.rejects(
    () =>
      runHandler(actualizarMovimiento, {
        params: { clienteId: String(cliente._id), movimientoId: String(pago.body._id) },
        body: { tipo: 'debito' },
        usuario: admin,
      }),
    (error) => error.statusCode === 400
  );

  const movimiento = await MovimientoCuentaCorriente.findById(pago.body._id);
  assert.equal(movimiento.tipo, 'credito');
  assert.equal(movimiento.origen, 'pago');
});

test('las cuotas del cliente se listan con saldo pendiente y vencida', async () => {
  const cliente = await crearCliente();
  await crearCuota(cliente, { monto: 1000, fechaVencimiento: diasAtras(2) });

  const res = await runHandler(obtenerCuotasDeCliente, {
    params: { clienteId: String(cliente._id) },
    usuario: admin,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].vencida, true);
  assert.equal(res.body[0].saldoPendiente, 1000);
});

test('el resumen cuenta vencidas, por vencer y el total pendiente', async () => {
  const cliente = await crearCliente();
  await crearCuota(cliente, { monto: 10000, fechaVencimiento: diasAtras(2) });
  await crearCuota(cliente, { monto: 10000, fechaVencimiento: new Date(hoyEnUtc().getTime() + 2 * 86400000) });
  await crearCuota(cliente, { monto: 10000, fechaVencimiento: new Date(hoyEnUtc().getTime() + 40 * 86400000) });

  const res = await runHandler(obtenerResumenCuotas, { usuario: admin });
  assert.equal(res.status, 200);
  assert.equal(res.body.vencidas, 1);
  assert.equal(res.body.porVencer, 1);
  assert.equal(res.body.pendientes, 3);
  assert.equal(res.body.totalPendiente, 30000);
});
