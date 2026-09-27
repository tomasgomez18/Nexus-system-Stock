import './helpers/setup-env.js';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDB, stopTestDB, clearDB, runHandler } from './helpers/db.js';
import Usuario from '../modules/Autenticacion/UsuarioModel.js';
import {
  obtenerUsuarios,
  actualizarUsuario,
  reiniciarClave,
  cambiarActivo,
  eliminarUsuario,
} from '../modules/Usuario/UsuarioController.js';

before(async () => {
  await startTestDB();
});

after(async () => {
  await stopTestDB();
});

beforeEach(async () => {
  await clearDB();
});

const crearUsuarioTest = (extra = {}) =>
  Usuario.create({
    nombre: 'Empleado',
    email: 'empleado@x.com',
    clave: 'secreto123',
    rol: 'user',
    ...extra,
  });

const crearPrincipal = (extra = {}) =>
  crearUsuarioTest({ nombre: 'Admin', email: 'nexus@code.com', rol: 'admin', ...extra });

test('el listado marca solo a la cuenta principal como protegida', async () => {
  const principal = await crearPrincipal();
  const otroAdmin = await crearUsuarioTest({ nombre: 'Otro', email: 'otro@x.com', rol: 'admin' });
  const empleado = await crearUsuarioTest();

  const res = await runHandler(obtenerUsuarios, {
    usuario: { id: String(otroAdmin._id), nombre: 'Otro', rol: 'admin' },
  });
  const porEmail = Object.fromEntries(res.body.map((u) => [u.email, u.protegido]));
  assert.equal(porEmail['nexus@code.com'], true);
  assert.equal(porEmail['otro@x.com'], false);
  assert.equal(porEmail['empleado@x.com'], false);
  assert.ok(!('clave' in res.body.find((u) => String(u._id) === String(principal._id))));
});

test('la cuenta principal no se puede eliminar, desactivar, editar ni resetear por otro', async () => {
  const principal = await crearPrincipal();
  const otroAdmin = await crearUsuarioTest({ nombre: 'Otro', email: 'otro@x.com', rol: 'admin' });
  const req = { id: String(otroAdmin._id), nombre: 'Otro', rol: 'admin' };

  const eliminar = await runHandler(eliminarUsuario, { params: { id: String(principal._id) }, usuario: req });
  assert.equal(eliminar.status, 400);

  const desactivar = await runHandler(cambiarActivo, {
    params: { id: String(principal._id) },
    body: { activo: false },
    usuario: req,
  });
  assert.equal(desactivar.status, 400);

  const editar = await runHandler(actualizarUsuario, {
    params: { id: String(principal._id) },
    body: { nombre: 'Hackeado', email: 'hack@x.com' },
    usuario: req,
  });
  assert.equal(editar.status, 400);

  const clave = await runHandler(reiniciarClave, {
    params: { id: String(principal._id) },
    body: { clave: 'nueva123' },
    usuario: req,
  });
  assert.equal(clave.status, 400);

  const enBase = await Usuario.findById(principal._id);
  assert.ok(enBase);
  assert.equal(enBase.nombre, 'Admin');
  assert.equal(enBase.email, 'nexus@code.com');
  assert.equal(enBase.activo, true);
});

test('la cuenta principal puede reiniciar su propia clave', async () => {
  const principal = await crearPrincipal();

  const res = await runHandler(reiniciarClave, {
    params: { id: String(principal._id) },
    body: { clave: 'nueva123' },
    usuario: { id: String(principal._id), nombre: 'Admin', rol: 'admin' },
  });
  assert.equal(res.status, 200);
});

test('otro administrador se puede editar, resetear, desactivar y eliminar', async () => {
  const principal = await crearPrincipal();
  const otroAdmin = await crearUsuarioTest({ nombre: 'Otro', email: 'otro@x.com', rol: 'admin' });
  const req = { id: String(principal._id), nombre: 'Admin', rol: 'admin' };

  const editar = await runHandler(actualizarUsuario, {
    params: { id: String(otroAdmin._id) },
    body: { nombre: 'Renombrado', email: 'renombrado@x.com', rol: 'admin' },
    usuario: req,
  });
  assert.equal(editar.status, 200);
  assert.equal(editar.body.nombre, 'Renombrado');
  assert.equal(editar.body.email, 'renombrado@x.com');

  const clave = await runHandler(reiniciarClave, {
    params: { id: String(otroAdmin._id) },
    body: { clave: 'nueva123' },
    usuario: req,
  });
  assert.equal(clave.status, 200);

  const desactivar = await runHandler(cambiarActivo, {
    params: { id: String(otroAdmin._id) },
    body: { activo: false },
    usuario: req,
  });
  assert.equal(desactivar.status, 200);
  assert.equal(desactivar.body.activo, false);

  const eliminar = await runHandler(eliminarUsuario, { params: { id: String(otroAdmin._id) }, usuario: req });
  assert.equal(eliminar.status, 200);
  assert.equal(await Usuario.findById(otroAdmin._id), null);
});

test('un administrador se puede degradar a empleado si no es el último admin activo', async () => {
  await crearPrincipal();
  const otroAdmin = await crearUsuarioTest({ nombre: 'Otro', email: 'otro@x.com', rol: 'admin' });
  const req = { id: '507f1f77bcf86cd799439011', nombre: 'Admin', rol: 'admin' };

  const res = await runHandler(actualizarUsuario, {
    params: { id: String(otroAdmin._id) },
    body: { rol: 'user' },
    usuario: req,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.rol, 'user');
});

test('no se puede eliminar ni desactivar la propia cuenta', async () => {
  await crearPrincipal();
  const otroAdmin = await crearUsuarioTest({ nombre: 'Otro', email: 'otro@x.com', rol: 'admin' });
  const req = { id: String(otroAdmin._id), nombre: 'Otro', rol: 'admin' };

  const eliminar = await runHandler(eliminarUsuario, { params: { id: String(otroAdmin._id) }, usuario: req });
  assert.equal(eliminar.status, 400);

  const desactivar = await runHandler(cambiarActivo, {
    params: { id: String(otroAdmin._id) },
    body: { activo: false },
    usuario: req,
  });
  assert.equal(desactivar.status, 400);
});

test('no se puede degradar, desactivar ni eliminar al último admin activo', async () => {
  const principalInactivo = await crearPrincipal({ activo: false });
  const adminActivo = await crearUsuarioTest({ nombre: 'Admin2', email: 'admin2@x.com', rol: 'admin', activo: true });
  const req = { id: String(principalInactivo._id), nombre: 'Admin', rol: 'admin' };

  const degradar = await runHandler(actualizarUsuario, {
    params: { id: String(adminActivo._id) },
    body: { rol: 'user' },
    usuario: req,
  });
  assert.equal(degradar.status, 400);

  const desactivar = await runHandler(cambiarActivo, {
    params: { id: String(adminActivo._id) },
    body: { activo: false },
    usuario: req,
  });
  assert.equal(desactivar.status, 400);

  const eliminar = await runHandler(eliminarUsuario, { params: { id: String(adminActivo._id) }, usuario: req });
  assert.equal(eliminar.status, 400);
});
