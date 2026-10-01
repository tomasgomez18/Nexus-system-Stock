import './helpers/setup-env.js';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDB, stopTestDB, clearDB, runHandler } from './helpers/db.js';
import Cliente from '../modules/Cliente/ClienteModel.js';
import MovimientoCuentaCorriente from '../modules/MovimientoCuentaCorriente/MovimientoCuentaCorrienteModel.js';
import SolicitudCliente from '../modules/SolicitudCliente/SolicitudClienteModel.js';
import Notificacion from '../modules/Notificacion/NotificacionModel.js';
import {
  obtenerClientes,
  crearCliente,
  actualizarCliente,
  eliminarCliente,
} from '../modules/Cliente/ClienteController.js';
import {
  obtenerMovimientos,
  crearMovimiento,
  actualizarMovimiento,
  anularMovimiento,
  obtenerSaldo,
} from '../modules/MovimientoCuentaCorriente/MovimientoCuentaCorrienteController.js';
import {
  obtenerSolicitudes,
  crearSolicitud,
  aprobarSolicitud,
  rechazarSolicitud,
  contarSolicitudesPendientes,
} from '../modules/SolicitudCliente/SolicitudClienteController.js';
import { obtenerNotificaciones } from '../modules/Notificacion/NotificacionController.js';
import { saldoDeMovimientos } from '../utils/CuentaCorrienteUtils.js';

before(async () => {
  await startTestDB();
});

after(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearDB();
});

const admin = { id: '507f1f77bcf86cd799439011', nombre: 'Admin', rol: 'admin' };
const empleado = { id: '507f1f77bcf86cd799439012', nombre: 'Empleado', rol: 'user' };

const crearClienteTest = (extra = {}) => Cliente.create({ nombre: 'Cliente Uno', ...extra });

const registrarMovimiento = async (clienteId, cuerpo = {}, usuario = empleado) =>
  runHandler(crearMovimiento, {
    body: { tipo: 'debito', origen: 'ajuste', monto: 1000, formaPago: 'ninguno', ...cuerpo },
    params: { clienteId: String(clienteId) },
    usuario,
  });

/** Los errores con statusCode y los ZodError los traduce manejadorErrores a 4xx en la respuesta real. */
const esperaZod = (error) => error?.name === 'ZodError';
const esperaCodigo = (codigo) => (error) => error?.statusCode === codigo;

test('crear cliente exige nombre y rechaza nombres repetidos', async () => {
  const valido = await runHandler(crearCliente, { body: { nombre: 'Ana Lopez' }, usuario: admin });
  assert.equal(valido.status, 201);
  assert.equal(valido.body.saldo, 0);

  const repetido = await runHandler(crearCliente, { body: { nombre: 'ana lopez' }, usuario: admin });
  assert.equal(repetido.status, 409);

  await assert.rejects(() => runHandler(crearCliente, { body: { nombre: '' }, usuario: admin }), esperaZod);
});

test('el listado de clientes trae el saldo derivado de cada uno', async () => {
  const ana = await crearClienteTest({ nombre: 'Ana Lopez' });
  const bruno = await crearClienteTest({ nombre: 'Bruno Diaz' });
  await registrarMovimiento(ana._id, { monto: 5000, origen: 'factura' });
  await registrarMovimiento(ana._id, { tipo: 'credito', monto: 2000, origen: 'pago', formaPago: 'efectivo' });

  const res = await runHandler(obtenerClientes, { usuario: empleado });
  assert.equal(res.status, 200);
  const mapa = Object.fromEntries(res.body.map((c) => [c.nombre, c]));
  assert.equal(mapa['Ana Lopez'].saldo, 3000);
  assert.equal(mapa['Ana Lopez'].totalDebitos, 5000);
  assert.equal(mapa['Ana Lopez'].totalCreditos, 2000);
  assert.equal(mapa['Bruno Diaz'].saldo, 0);
});

test('un empleado puede buscar clientes por nombre o documento', async () => {
  await crearClienteTest({ nombre: 'Ana Lopez', documento: '30111222' });
  await crearClienteTest({ nombre: 'Bruno Diaz', documento: '30444555' });

  const res = await runHandler(obtenerClientes, { query: { buscar: 'bruno' }, usuario: empleado });
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].nombre, 'Bruno Diaz');

  const porDocumento = await runHandler(obtenerClientes, { query: { buscar: '30111' }, usuario: empleado });
  assert.equal(porDocumento.body.length, 1);
  assert.equal(porDocumento.body[0].nombre, 'Ana Lopez');
});

test('actualizar cliente no deja nombres duplicados contra otro cliente', async () => {
  const ana = await crearClienteTest({ nombre: 'Ana Lopez' });
  const bruno = await crearClienteTest({ nombre: 'Bruno Diaz' });

  const choque = await runHandler(actualizarCliente, {
    body: { nombre: 'ana lopez' },
    params: { id: String(bruno._id) },
    usuario: admin,
  });
  assert.equal(choque.status, 409);

  const mismoNombre = await runHandler(actualizarCliente, {
    body: { nombre: 'Bruno Diaz' },
    params: { id: String(bruno._id) },
    usuario: admin,
  });
  assert.equal(mismoNombre.status, 200);
  assert.equal(await Cliente.countDocuments({ _id: { $in: [ana._id, bruno._id] } }), 2);
});

test('no se puede eliminar un cliente con movimientos, pero sí uno sin movimientos', async () => {
  const conMovimientos = await crearClienteTest({ nombre: 'Ana Lopez' });
  await registrarMovimiento(conMovimientos._id, { monto: 1000 });
  const bloqueado = await runHandler(eliminarCliente, {
    params: { id: String(conMovimientos._id) },
    usuario: admin,
  });
  assert.equal(bloqueado.status, 409);
  assert.equal(await Cliente.countDocuments(), 1);

  const limpio = await crearClienteTest({ nombre: 'Bruno Diaz' });
  const eliminado = await runHandler(eliminarCliente, { params: { id: String(limpio._id) }, usuario: admin });
  assert.equal(eliminado.status, 200);
  assert.equal(await Cliente.countDocuments(), 1);
});

test('un movimiento de débito suma a la deuda y uno de crédito la reduce', async () => {
  const cliente = await crearClienteTest();
  await registrarMovimiento(cliente._id, { monto: 10000, origen: 'factura' });
  await registrarMovimiento(cliente._id, { tipo: 'credito', monto: 4000, origen: 'pago', formaPago: 'efectivo' });

  const res = await runHandler(obtenerSaldo, { params: { clienteId: String(cliente._id) }, usuario: empleado });
  assert.equal(res.status, 200);
  assert.equal(res.body.totalDebitos, 10000);
  assert.equal(res.body.totalCreditos, 4000);
  assert.equal(res.body.saldo, 6000);
  assert.equal(res.body.clienteNombre, 'Cliente Uno');
});

test('no se puede registrar un cobro si el cliente no tiene deuda', async () => {
  const cliente = await crearClienteTest();
  await assert.rejects(
    () => registrarMovimiento(cliente._id, { tipo: 'credito', monto: 5000, origen: 'pago' }),
    esperaCodigo(400)
  );
  assert.equal(await MovimientoCuentaCorriente.countDocuments(), 0);
});

test('un pago no puede superar la deuda pendiente', async () => {
  const cliente = await crearClienteTest();
  await registrarMovimiento(cliente._id, { monto: 10000, origen: 'factura' });

  await assert.rejects(
    () => registrarMovimiento(cliente._id, { tipo: 'credito', monto: 15000, origen: 'pago' }),
    esperaCodigo(400)
  );

  const exacto = await registrarMovimiento(cliente._id, { tipo: 'credito', monto: 10000, origen: 'pago' });
  assert.equal(exacto.status, 201);

  const saldo = await runHandler(obtenerSaldo, { params: { clienteId: String(cliente._id) }, usuario: empleado });
  assert.equal(saldo.body.saldo, 0);

  await assert.rejects(
    () => registrarMovimiento(cliente._id, { tipo: 'credito', monto: 1, origen: 'pago' }),
    esperaCodigo(400)
  );
});

test('al editar un pago no se puede superar la deuda sin ese pago', async () => {
  const cliente = await crearClienteTest();
  await registrarMovimiento(cliente._id, { monto: 10000, origen: 'factura' });
  const pago = await registrarMovimiento(cliente._id, { tipo: 'credito', monto: 4000, origen: 'pago' });

  await assert.rejects(
    () =>
      runHandler(actualizarMovimiento, {
        body: { monto: 11000 },
        params: { clienteId: String(cliente._id), movimientoId: String(pago.body._id) },
        usuario: empleado,
      }),
    esperaCodigo(400)
  );

  const editado = await runHandler(actualizarMovimiento, {
    body: { monto: 8000 },
    params: { clienteId: String(cliente._id), movimientoId: String(pago.body._id) },
    usuario: empleado,
  });
  assert.equal(editado.status, 200);
  assert.equal(editado.body.monto, 8000);
});

test('se rechaza el movimiento con monto no positivo o tipo inválido', async () => {
  const cliente = await crearClienteTest();
  await assert.rejects(() => registrarMovimiento(cliente._id, { monto: 0 }), esperaZod);
  await assert.rejects(() => registrarMovimiento(cliente._id, { monto: -100 }), esperaZod);
  await assert.rejects(() => registrarMovimiento(cliente._id, { tipo: 'otro' }), esperaZod);
  await assert.rejects(() => registrarMovimiento(cliente._id, { formaPago: 'bitcoin' }), esperaZod);
  await assert.rejects(() => registrarMovimiento(cliente._id, { origen: 'inventado' }), esperaZod);
  assert.equal(await MovimientoCuentaCorriente.countDocuments(), 0);
});

test('un movimiento contra un cliente inexistente no crea nada', async () => {
  await assert.rejects(
    () =>
      runHandler(crearMovimiento, {
        body: { tipo: 'debito', origen: 'ajuste', monto: 1000, formaPago: 'ninguno' },
        params: { clienteId: '507f1f77bcf86cd799439099' },
        usuario: empleado,
      }),
    esperaCodigo(404)
  );
  assert.equal(await MovimientoCuentaCorriente.countDocuments(), 0);

  await assert.rejects(
    () =>
      runHandler(crearMovimiento, {
        body: { tipo: 'debito', origen: 'ajuste', monto: 1000, formaPago: 'ninguno' },
        params: { clienteId: 'no-es-un-id' },
        usuario: empleado,
      }),
    esperaCodigo(400)
  );
});

test('los movimientos se guardan siempre con monto positivo y el tipo define el signo', async () => {
  const cliente = await crearClienteTest();
  const res = await registrarMovimiento(cliente._id, { monto: 7500, origen: 'factura' });
  assert.equal(res.status, 201);
  assert.equal(res.body.monto, 7500);
  assert.equal(res.body.tipo, 'debito');
  assert.equal(res.body.estado, 'activo');
  assert.equal(res.body.registradoPor, 'Empleado');
  assert.equal(res.body.clienteNombre, 'Cliente Uno');
});

test('el historial filtra por tipo, estado y rango de fechas', async () => {
  const cliente = await crearClienteTest();
  await registrarMovimiento(cliente._id, { monto: 1000, origen: 'factura', fecha: '2026-01-10' });
  await registrarMovimiento(cliente._id, { tipo: 'credito', monto: 500, origen: 'pago', fecha: '2026-01-20' });
  await registrarMovimiento(cliente._id, { monto: 2000, origen: 'factura', fecha: '2026-02-05' });

  const soloDebitos = await runHandler(obtenerMovimientos, {
    params: { clienteId: String(cliente._id) },
    query: { tipo: 'debito' },
    usuario: empleado,
  });
  assert.equal(soloDebitos.body.length, 2);

  const enero = await runHandler(obtenerMovimientos, {
    params: { clienteId: String(cliente._id) },
    query: { desde: '2026-01-01', hasta: '2026-01-31' },
    usuario: empleado,
  });
  assert.equal(enero.body.length, 2);
  assert.deepEqual(enero.body.map((m) => m.monto), [500, 1000]);

  const porReferencia = await runHandler(obtenerMovimientos, {
    params: { clienteId: String(cliente._id) },
    query: { buscar: 'pago' },
    usuario: empleado,
  });
  assert.equal(porReferencia.body.length, 0);
});

test('un rango de fechas inválido se rechaza', async () => {
  const cliente = await crearClienteTest();
  await assert.rejects(
    () =>
      runHandler(obtenerMovimientos, {
        params: { clienteId: String(cliente._id) },
        query: { desde: '2026-02-31' },
        usuario: empleado,
      }),
    esperaCodigo(400)
  );
  await assert.rejects(
    () =>
      runHandler(obtenerMovimientos, {
        params: { clienteId: String(cliente._id) },
        query: { hasta: 'ayer' },
        usuario: empleado,
      }),
    esperaCodigo(400)
  );
});

test('un movimiento se puede editar mientras esté activo y recalcula el saldo', async () => {
  const cliente = await crearClienteTest();
  const creado = await registrarMovimiento(cliente._id, { monto: 1000 });
  const editado = await runHandler(actualizarMovimiento, {
    body: { monto: 4000, nota: 'Corregido' },
    params: { clienteId: String(cliente._id), movimientoId: String(creado.body._id) },
    usuario: empleado,
  });
  assert.equal(editado.status, 200);
  assert.equal(editado.body.monto, 4000);
  assert.equal(editado.body.nota, 'Corregido');

  const saldo = await runHandler(obtenerSaldo, { params: { clienteId: String(cliente._id) }, usuario: empleado });
  assert.equal(saldo.body.saldo, 4000);
});

test('anular un movimiento exige motivo, lo deja sin efecto en el saldo y no borra el registro', async () => {
  const cliente = await crearClienteTest();
  await registrarMovimiento(cliente._id, { monto: 10000 });
  const credito = await registrarMovimiento(cliente._id, { tipo: 'credito', monto: 3000, origen: 'pago' });

  await assert.rejects(
    () =>
      runHandler(anularMovimiento, {
        body: {},
        params: { clienteId: String(cliente._id), movimientoId: String(credito.body._id) },
        usuario: empleado,
      }),
    esperaZod
  );

  const anulado = await runHandler(anularMovimiento, {
    body: { motivo: 'Pago duplicado' },
    params: { clienteId: String(cliente._id), movimientoId: String(credito.body._id) },
    usuario: empleado,
  });
  assert.equal(anulado.status, 200);
  assert.equal(anulado.body.estado, 'anulado');
  assert.equal(anulado.body.anuladoPor, 'Empleado');
  assert.equal(anulado.body.motivoAnulacion, 'Pago duplicado');
  assert.ok(anulado.body.anuladoEn);

  const saldo = await runHandler(obtenerSaldo, { params: { clienteId: String(cliente._id) }, usuario: empleado });
  assert.equal(saldo.body.saldo, 10000);
  assert.equal(saldo.body.totalCreditos, 0);
  assert.equal(await MovimientoCuentaCorriente.countDocuments(), 2);
});

test('un movimiento anulado no se puede volver a editar ni anular', async () => {
  const cliente = await crearClienteTest();
  const creado = await registrarMovimiento(cliente._id, { monto: 1000 });
  await runHandler(anularMovimiento, {
    body: { motivo: 'Error de carga' },
    params: { clienteId: String(cliente._id), movimientoId: String(creado.body._id) },
    usuario: empleado,
  });

  await assert.rejects(
    () =>
      runHandler(actualizarMovimiento, {
        body: { monto: 5000 },
        params: { clienteId: String(cliente._id), movimientoId: String(creado.body._id) },
        usuario: empleado,
      }),
    esperaCodigo(409)
  );

  await assert.rejects(
    () =>
      runHandler(anularMovimiento, {
        body: { motivo: 'Otra vez' },
        params: { clienteId: String(cliente._id), movimientoId: String(creado.body._id) },
        usuario: empleado,
      }),
    esperaCodigo(409)
  );
});

test('un movimiento no se puede tocar desde la cuenta de otro cliente', async () => {
  const ana = await crearClienteTest({ nombre: 'Ana Lopez' });
  const bruno = await crearClienteTest({ nombre: 'Bruno Diaz' });
  const movimiento = await registrarMovimiento(ana._id, { monto: 1000 });

  await assert.rejects(
    () =>
      runHandler(anularMovimiento, {
        body: { motivo: 'No es mío' },
        params: { clienteId: String(bruno._id), movimientoId: String(movimiento.body._id) },
        usuario: empleado,
      }),
    esperaCodigo(404)
  );
});

test('el empleado ve solo sus solicitudes y el admin ve todas', async () => {
  await runHandler(crearSolicitud, { body: { datos: { nombre: 'Carla Gomez' } }, usuario: empleado });
  await runHandler(crearSolicitud, {
    body: { datos: { nombre: 'Diego Paz' } },
    usuario: { id: '507f1f77bcf86cd799439013', nombre: 'Otro', rol: 'user' },
  });

  const delEmpleado = await runHandler(obtenerSolicitudes, { usuario: empleado });
  assert.equal(delEmpleado.body.length, 1);
  assert.equal(delEmpleado.body[0].datos.nombre, 'Carla Gomez');
  assert.equal(delEmpleado.body[0].solicitanteNombre, 'Empleado');

  const delAdmin = await runHandler(obtenerSolicitudes, { usuario: admin });
  assert.equal(delAdmin.body.length, 2);

  const pendientes = await runHandler(obtenerSolicitudes, { query: { estado: 'pendiente' }, usuario: admin });
  assert.equal(pendientes.body.length, 2);

  const estadoMalo = await runHandler(obtenerSolicitudes, { query: { estado: 'inventado' }, usuario: admin });
  assert.equal(estadoMalo.status, 400);
});

test('no se permiten dos solicitudes pendientes del mismo empleado con el mismo nombre', async () => {
  const primera = await runHandler(crearSolicitud, { body: { datos: { nombre: 'Carla Gomez' } }, usuario: empleado });
  assert.equal(primera.status, 201);

  const repetida = await runHandler(crearSolicitud, { body: { datos: { nombre: 'carla gomez' } }, usuario: empleado });
  assert.equal(repetida.status, 409);

  const deOtro = await runHandler(crearSolicitud, {
    body: { datos: { nombre: 'Carla Gomez' } },
    usuario: { id: '507f1f77bcf86cd799439013', nombre: 'Otro', rol: 'user' },
  });
  assert.equal(deOtro.status, 201);
});

test('aprobar una solicitud crea el cliente y deja la solicitud resuelta', async () => {
  const solicitud = await runHandler(crearSolicitud, {
    body: { datos: { nombre: 'Carla Gomez', documento: '30999888', email: 'carla@correo.com' } },
    usuario: empleado,
  });

  const aprobada = await runHandler(aprobarSolicitud, {
    params: { id: String(solicitud.body._id) },
    usuario: admin,
  });
  assert.equal(aprobada.status, 200);
  assert.equal(aprobada.body.estado, 'aprobada');
  assert.equal(aprobada.body.revisadoPorNombre, 'Admin');
  assert.ok(aprobada.body.cliente);

  const cliente = await Cliente.findById(aprobada.body.cliente);
  assert.equal(cliente.nombre, 'Carla Gomez');
  assert.equal(cliente.email, 'carla@correo.com');
  assert.equal(cliente.documento, '30999888');
});

test('una solicitud ya revisada no se puede volver a aprobar ni a rechazar', async () => {
  const solicitud = await runHandler(crearSolicitud, { body: { datos: { nombre: 'Carla Gomez' } }, usuario: empleado });
  await runHandler(aprobarSolicitud, { params: { id: String(solicitud.body._id) }, usuario: admin });

  const otra = await runHandler(aprobarSolicitud, { params: { id: String(solicitud.body._id) }, usuario: admin });
  assert.equal(otra.status, 409);

  const rechazar = await runHandler(rechazarSolicitud, {
    body: { motivo: 'Ya existe' },
    params: { id: String(solicitud.body._id) },
    usuario: admin,
  });
  assert.equal(rechazar.status, 409);
  assert.equal(await Cliente.countDocuments(), 1);
});

test('aprobar una solicitud cuyo cliente ya existe no rompe nada', async () => {
  await crearClienteTest({ nombre: 'Carla Gomez' });
  const solicitud = await runHandler(crearSolicitud, { body: { datos: { nombre: 'carla gomez' } }, usuario: empleado });

  const choque = await runHandler(aprobarSolicitud, {
    params: { id: String(solicitud.body._id) },
    usuario: admin,
  });
  assert.equal(choque.status, 409);
  assert.ok(choque.body.cliente);
  assert.equal(await Cliente.countDocuments(), 1);

  const pendiente = await SolicitudCliente.findById(solicitud.body._id);
  assert.equal(pendiente.estado, 'pendiente');
});

test('rechazar una solicitud exige motivo y no crea el cliente', async () => {
  const solicitud = await runHandler(crearSolicitud, { body: { datos: { nombre: 'Carla Gomez' } }, usuario: empleado });

  await assert.rejects(
    () => runHandler(rechazarSolicitud, { body: {}, params: { id: String(solicitud.body._id) }, usuario: admin }),
    esperaZod
  );

  const rechazada = await runHandler(rechazarSolicitud, {
    body: { motivo: 'Falta el documento' },
    params: { id: String(solicitud.body._id) },
    usuario: admin,
  });
  assert.equal(rechazada.status, 200);
  assert.equal(rechazada.body.estado, 'rechazada');
  assert.equal(rechazada.body.motivo, 'Falta el documento');
  assert.equal(await Cliente.countDocuments(), 0);
});

test('el saldo de una solicitud no existe hasta que el cliente se aprueba', async () => {
  await runHandler(crearSolicitud, { body: { datos: { nombre: 'Carla Gomez' } }, usuario: empleado });
  assert.equal(await Cliente.countDocuments(), 0);
  assert.equal(await MovimientoCuentaCorriente.countDocuments(), 0);
});

test('saldoDeMovimientos ignora los anulados y respeta el signo del tipo', () => {
  const resumen = saldoDeMovimientos([
    { tipo: 'debito', monto: 100, estado: 'activo' },
    { tipo: 'credito', monto: 25, estado: 'activo' },
    { tipo: 'debito', monto: 999.99, estado: 'anulado' },
  ]);
  assert.equal(resumen.totalDebitos, 100);
  assert.equal(resumen.totalCreditos, 25);
  assert.equal(resumen.saldo, 75);
  assert.deepEqual(saldoDeMovimientos([]), { totalDebitos: 0, totalCreditos: 0, saldo: 0 });
});

test('el conteo de pendientes solo mira las solicitudes sin revisar', async () => {
  const vacio = await runHandler(contarSolicitudesPendientes, { usuario: admin });
  assert.deepEqual(vacio.body, { total: 0 });

  const una = await runHandler(crearSolicitud, { body: { datos: { nombre: 'Carla Gomez' } }, usuario: empleado });
  const otra = await runHandler(crearSolicitud, {
    body: { datos: { nombre: 'Diego Paz' } },
    usuario: { id: '507f1f77bcf86cd799439013', nombre: 'Otro', rol: 'user' },
  });

  const conDos = await runHandler(contarSolicitudesPendientes, { usuario: admin });
  assert.deepEqual(conDos.body, { total: 2 });

  await runHandler(aprobarSolicitud, { params: { id: String(una.body._id) }, usuario: admin });
  const conUna = await runHandler(contarSolicitudesPendientes, { usuario: admin });
  assert.deepEqual(conUna.body, { total: 1 });

  await runHandler(rechazarSolicitud, {
    body: { motivo: 'Falta el documento' },
    params: { id: String(otra.body._id) },
    usuario: admin,
  });
  const sinPendientes = await runHandler(contarSolicitudesPendientes, { usuario: admin });
  assert.deepEqual(sinPendientes.body, { total: 0 });
});

test('crear una solicitud genera un aviso que solo ve el admin', async () => {
  const solicitud = await runHandler(crearSolicitud, {
    body: { datos: { nombre: 'Carla Gomez' } },
    usuario: empleado,
  });

  const avisos = await Notificacion.find({ solicitud: solicitud.body._id });
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].soloAdmin, true);
  assert.equal(avisos[0].nuevaParaAdmin, true);
  assert.equal(avisos[0].estado, 'pendiente');
  assert.equal(avisos[0].creadoPor.toString(), empleado.id);
  assert.match(avisos[0].descripcion, /Carla Gomez/);

  const delAdmin = await runHandler(obtenerNotificaciones, { usuario: admin });
  assert.equal(delAdmin.body.length, 1);

  const delEmpleado = await runHandler(obtenerNotificaciones, { usuario: empleado });
  assert.equal(delEmpleado.body.length, 0);
});

test('aprobar la solicitud deja el aviso realizado diciendo que fue aprobada', async () => {
  const solicitud = await runHandler(crearSolicitud, { body: { datos: { nombre: 'Carla Gomez' } }, usuario: empleado });

  await runHandler(aprobarSolicitud, { params: { id: String(solicitud.body._id) }, usuario: admin });

  const aviso = await Notificacion.findOne({ solicitud: solicitud.body._id });
  assert.equal(aviso.estado, 'realizado');
  assert.equal(aviso.comentario, 'Solicitud aprobada');
  assert.equal(aviso.realizadoNombre, 'Admin');
  assert.equal(aviso.nuevaParaAdmin, false);
  assert.ok(aviso.realizadoEn);
});

test('rechazar la solicitud deja el aviso realizado con el motivo', async () => {
  const solicitud = await runHandler(crearSolicitud, { body: { datos: { nombre: 'Carla Gomez' } }, usuario: empleado });

  await runHandler(rechazarSolicitud, {
    body: { motivo: 'Falta el documento' },
    params: { id: String(solicitud.body._id) },
    usuario: admin,
  });

  const aviso = await Notificacion.findOne({ solicitud: solicitud.body._id });
  assert.equal(aviso.estado, 'realizado');
  assert.equal(aviso.comentario, 'Solicitud rechazada: Falta el documento');
  assert.equal(aviso.realizadoNombre, 'Admin');
});

test('una solicitud que no se puede aprobar deja el aviso pendiente', async () => {
  await crearClienteTest({ nombre: 'Carla Gomez' });
  const solicitud = await runHandler(crearSolicitud, { body: { datos: { nombre: 'carla gomez' } }, usuario: empleado });

  const choque = await runHandler(aprobarSolicitud, {
    params: { id: String(solicitud.body._id) },
    usuario: admin,
  });
  assert.equal(choque.status, 409);

  const aviso = await Notificacion.findOne({ solicitud: solicitud.body._id });
  assert.equal(aviso.estado, 'pendiente');
  assert.equal(aviso.comentario, '');
});
