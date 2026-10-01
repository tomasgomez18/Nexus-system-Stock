import './helpers/setup-env.js';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestDB, stopTestDB, clearDB, runHandler } from './helpers/db.js';
import Producto from '../modules/Producto/ProductoModel.js';
import Promocion from '../modules/Promocion/PromocionModel.js';
import { crearVenta, abrirCaja } from '../modules/Venta/VentaController.js';
import { obtenerProductos, obtenerProducto } from '../modules/Producto/ProductoController.js';
import { crearPromocion, cancelarPromocion, obtenerPromociones } from '../modules/Promocion/PromocionController.js';

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

const crearProducto = (extra = {}) =>
  Producto.create({ nombre: 'Remera', categoria: 'Prendas', precio: 10000, cantidad: 50, ...extra });

const abrirCajaDeHoy = async (fondoInicial = 0) => {
  const res = await runHandler(abrirCaja, { body: { nombre: 'Turno Mañana', fondoInicial }, usuario: admin });
  assert.equal(res.status, 201);
  return res.body;
};

const rangoActivo = () => ({
  desde: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  hasta: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
});

const crearPromo = (extra = {}) =>
  runHandler(crearPromocion, {
    body: { nombre: 'Oferta', tipo: 'porcentaje', valor: 20, ...rangoActivo(), ...extra },
    usuario: admin,
  });

const esperaCodigo = (codigo) => (error) => error?.statusCode === codigo;

test('una promoción por porcentaje aplica el precio de oferta en los productos', async () => {
  const producto = await crearProducto();
  const res = await crearPromo({ productos: [String(producto._id)] });
  assert.equal(res.status, 201);
  assert.equal(res.body.estado, 'activa');

  const listado = await runHandler(obtenerProductos, { usuario: admin });
  assert.equal(listado.body[0].precio, 10000);
  assert.equal(listado.body[0].oferta.precioOferta, 8000);
  assert.equal(listado.body[0].oferta.tipo, 'porcentaje');

  const uno = await runHandler(obtenerProducto, { params: { id: String(producto._id) }, usuario: admin });
  assert.equal(uno.body.oferta.precioOferta, 8000);
});

test('una promoción por monto fijo descuenta ese monto', async () => {
  const producto = await crearProducto();
  await crearPromo({ tipo: 'monto', valor: 1500, productos: [String(producto._id)] });

  const listado = await runHandler(obtenerProductos, { usuario: admin });
  assert.equal(listado.body[0].oferta.precioOferta, 8500);
});

test('la promoción para todos incluye los productos que se carguen después', async () => {
  await crearPromo({ todos: true, productos: [] });
  const nuevo = await crearProducto({ nombre: 'Campera', precio: 20000 });

  const listado = await runHandler(obtenerProductos, { usuario: admin });
  const campera = listado.body.find((p) => String(p._id) === String(nuevo._id));
  assert.equal(campera.oferta.precioOferta, 16000);
});

test('una promoción programada o vencida no cambia el precio', async () => {
  const producto = await crearProducto();
  const ahora = Date.now();

  await crearPromo({
    desde: new Date(ahora + 3600000).toISOString(),
    hasta: new Date(ahora + 7200000).toISOString(),
    productos: [String(producto._id)],
  });
  let listado = await runHandler(obtenerProductos, { usuario: admin });
  assert.equal(listado.body[0].oferta, null);

  await Promocion.deleteMany({});
  await crearPromo({
    desde: new Date(ahora - 7200000).toISOString(),
    hasta: new Date(ahora - 3600000).toISOString(),
    productos: [String(producto._id)],
  });
  listado = await runHandler(obtenerProductos, { usuario: admin });
  assert.equal(listado.body[0].oferta, null);
});

test('no se permiten promociones superpuestas sobre el mismo producto', async () => {
  const producto = await crearProducto();
  const primera = await crearPromo({ productos: [String(producto._id)] });
  assert.equal(primera.status, 201);

  await assert.rejects(
    () => crearPromo({ productos: [String(producto._id)] }),
    esperaCodigo(409)
  );

  await assert.rejects(
    () => crearPromo({ todos: true, productos: [] }),
    esperaCodigo(409)
  );

  const otro = await crearProducto({ nombre: 'Campera' });
  const soloOtro = await crearPromo({ productos: [String(otro._id)] });
  assert.equal(soloOtro.status, 201);
});

test('se permiten promociones secuenciales sobre el mismo producto', async () => {
  const producto = await crearProducto();
  const ahora = Date.now();

  const primera = await crearPromo({
    desde: new Date(ahora - 3600000).toISOString(),
    hasta: new Date(ahora + 3600000).toISOString(),
    productos: [String(producto._id)],
  });
  assert.equal(primera.status, 201);

  const siguiente = await crearPromo({
    desde: new Date(ahora + 3600000).toISOString(),
    hasta: new Date(ahora + 7200000).toISOString(),
    productos: [String(producto._id)],
  });
  assert.equal(siguiente.status, 201);
});

test('la venta cobra el precio de oferta y el descuento global se aplica encima', async () => {
  const producto = await crearProducto({ precio: 10000 });
  await crearPromo({ productos: [String(producto._id)] });
  await abrirCajaDeHoy();

  const res = await runHandler(crearVenta, {
    body: {
      articulos: [{ producto: String(producto._id), cantidad: 1 }],
      pagos: [{ metodo: 'efectivo', monto: 8000 }],
      offset: 0,
    },
    usuario: admin,
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.total, 8000);
  assert.equal(res.body.articulos[0].precio, 8000);

  const conDescuento = await runHandler(crearVenta, {
    body: {
      articulos: [{ producto: String(producto._id), cantidad: 1 }],
      pagos: [{ metodo: 'efectivo', monto: 7200 }],
      descuento: 10,
      offset: 0,
    },
    usuario: admin,
  });
  assert.equal(conDescuento.status, 201);
  assert.equal(conDescuento.body.total, 7200);
});

test('cancelar una promoción devuelve el precio normal al instante', async () => {
  const producto = await crearProducto({ precio: 10000 });
  const promo = await crearPromo({ productos: [String(producto._id)] });

  const cancelada = await runHandler(cancelarPromocion, {
    params: { id: String(promo.body._id) },
    usuario: admin,
  });
  assert.equal(cancelada.status, 200);
  assert.equal(cancelada.body.estado, 'cancelada');

  const listado = await runHandler(obtenerProductos, { usuario: admin });
  assert.equal(listado.body[0].oferta, null);

  await abrirCajaDeHoy();
  const venta = await runHandler(crearVenta, {
    body: {
      articulos: [{ producto: String(producto._id), cantidad: 1 }],
      pagos: [{ metodo: 'efectivo', monto: 10000 }],
      offset: 0,
    },
    usuario: admin,
  });
  assert.equal(venta.body.total, 10000);
});

test('el listado de promociones devuelve estado y alcance', async () => {
  const producto = await crearProducto();
  await crearPromo({ productos: [String(producto._id)] });

  const res = await runHandler(obtenerPromociones, { usuario: admin });
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].estado, 'activa');
  assert.equal(res.body[0].cantidadProductos, 1);
  assert.equal(res.body[0].creadoPor, 'Admin');
});
