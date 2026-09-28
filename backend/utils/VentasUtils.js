export const obtenerArticulos = (venta) => {
  if (!venta) return [];
  if (venta.articulos && venta.articulos.length > 0) return venta.articulos;
  if (venta.producto || venta.precio != null || venta.cantidad != null) {
    return [{
      producto: venta.producto,
      cantidad: venta.cantidad,
      precio: venta.precio,
      talle: venta.talle || '',
      color: '',
      subtotal: venta.total,
    }];
  }
  return [];
};

export const unidadesNetasVenta = (venta) => {
  if (!venta || venta.estado === 'devuelta') return 0;
  const articulos = obtenerArticulos(venta);
  const total = articulos.reduce((acc, i) => acc + (Number(i.cantidad) || 0), 0);
  if (venta.articulos && venta.articulos.length > 0) return total;
  return Math.max(0, total - (venta.cantidadDevuelta || 0));
};

export const totalNetoVenta = (venta) => {
  if (!venta || venta.estado === 'devuelta') return 0;
  return Number(venta.total) || 0;
};

export const mismaLinea = (item, { producto, talle, color }) =>
  String(item?.producto?._id ?? item?.producto ?? '') === String(producto?._id ?? producto ?? '') &&
  String(item?.talle ?? '').trim().toLowerCase() === String(talle ?? '').trim().toLowerCase() &&
  String(item?.color ?? '').trim().toLowerCase() === String(color ?? '').trim().toLowerCase();

export const prorratearPagos = (pagos = [], monto = 0) => {
  const total = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const montoRound = Math.round((Number(monto) || 0) * 100) / 100;
  if (total <= 0 || montoRound <= 0) return [];
  const partes = [];
  let asignado = 0;
  pagos.forEach((p, i) => {
    const parte = i === pagos.length - 1
      ? Math.round((montoRound - asignado) * 100) / 100
      : Math.round(((Number(p.monto) || 0) / total) * montoRound * 100) / 100;
    asignado = Math.round((asignado + parte) * 100) / 100;
    if (parte > 0) partes.push({ metodo: p.metodo, monto: parte });
  });
  return partes;
};

export const totalEfectivoDePagos = (pagos = []) =>
  Math.round(
    pagos.filter((p) => p.metodo === 'efectivo').reduce((s, p) => s + (Number(p.monto) || 0), 0) * 100
  ) / 100;

export const esMismoDia = (fecha, offset = 0, referencia = new Date()) => {
  if (!fecha) return false;
  const a = new Date(new Date(fecha).getTime() - Number(offset) * 60000);
  const b = new Date(referencia.getTime() - Number(offset) * 60000);
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
};

export const redondear = (valor) => Math.round((Number(valor) || 0) * 100) / 100;

const fechaDesplazada = (fecha, offset = 0) => new Date(new Date(fecha).getTime() - Number(offset) * 60000);

const pad2 = (n) => String(n).padStart(2, '0');

export const claveDia = (fecha, offset = 0) => {
  const d = fechaDesplazada(fecha, offset);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

export const claveMes = (fecha, offset = 0) => claveDia(fecha, offset).slice(0, 7);

export const claveSemana = (fecha, offset = 0) => {
  const d = fechaDesplazada(fecha, offset);
  const diaSemana = (d.getUTCDay() + 6) % 7;
  const lunes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diaSemana));
  return `${lunes.getUTCFullYear()}-${pad2(lunes.getUTCMonth() + 1)}-${pad2(lunes.getUTCDate())}`;
};

const sumarDia = (clave) => {
  const [y, m, d] = clave.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
};

const sumarSemana = (clave) => {
  const [y, m, d] = clave.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 7));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
};

const sumarMes = (clave) => {
  const [y, m] = clave.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m, 1));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`;
};

const contarDias = (desdeClave, hastaClave) => {
  const [y1, m1, d1] = desdeClave.split('-').map(Number);
  const [y2, m2, d2] = hastaClave.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
};

const contarSemanas = (desdeClave, hastaClave) => Math.round((contarDias(desdeClave, hastaClave) - 1) / 7) + 1;

const contarMeses = (desdeClave, hastaClave) => {
  const [y1, m1] = desdeClave.split('-').map(Number);
  const [y2, m2] = hastaClave.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
};

export const claveEje = (fecha, offset, eje) => {
  if (eje === 'mes') return claveMes(fecha, offset);
  if (eje === 'semana') return claveSemana(fecha, offset);
  return claveDia(fecha, offset);
};

export const unidadesEfectivasDeVenta = (venta) => {
  const esLegacy = !(venta?.articulos && venta.articulos.length > 0);
  const devueltoLegacy = esLegacy ? (venta?.cantidadDevuelta || 0) : 0;
  return obtenerArticulos(venta)
    .map((item) => ({
      productoId: String(item?.producto?._id ?? item?.producto ?? ''),
      nombre: item?.producto?.nombre || '',
      cantidad: Math.max(0, (Number(item?.cantidad) || 0) - devueltoLegacy),
    }))
    .filter((item) => item.productoId && item.cantidad > 0);
};

export const rankingProductosPorUnidades = (ventas = [], limit = 8) => {
  const mapa = new Map();
  for (const venta of ventas) {
    if (totalNetoVenta(venta) <= 0 && unidadesNetasVenta(venta) <= 0) continue;
    for (const item of unidadesEfectivasDeVenta(venta)) {
      if (!mapa.has(item.productoId)) {
        mapa.set(item.productoId, { productoId: item.productoId, nombre: item.nombre, unidades: 0 });
      }
      const fila = mapa.get(item.productoId);
      fila.unidades += item.cantidad;
      if (!fila.nombre && item.nombre) fila.nombre = item.nombre;
    }
  }
  return [...mapa.values()]
    .sort((a, b) => b.unidades - a.unidades || a.productoId.localeCompare(b.productoId))
    .slice(0, limit);
};

export const pagosNetosDeVenta = (venta) => {
  if (unidadesNetasVenta(venta) <= 0) return [];
  if (venta.pagos && venta.pagos.length > 0) {
    const totalPagado = venta.pagos.reduce((sum, p) => sum + p.monto, 0);
    if (totalPagado <= 0) return [];
    return venta.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto }));
  }
  return [{ metodo: venta.metodoPago || 'efectivo', monto: venta.total }];
};

export const resumirPorMetodo = (ventas = []) =>
  ventas.reduce((acc, s) => {
    const pagos = pagosNetosDeVenta(s);
    if (pagos.length === 0) return acc;
    const unidadesNetas = unidadesNetasVenta(s);
    const totalPagado = pagos.reduce((sum, p) => sum + p.monto, 0);
    let asignadas = 0;
    for (let i = 0; i < pagos.length; i++) {
      const p = pagos[i];
      if (!acc[p.metodo]) acc[p.metodo] = { total: 0, cantidad: 0 };
      acc[p.metodo].total += p.monto;
      const parte = i === pagos.length - 1
        ? unidadesNetas - asignadas
        : Math.round(unidadesNetas * (p.monto / totalPagado));
      acc[p.metodo].cantidad += parte;
      asignadas += parte;
    }
    return acc;
  }, {});

export const rankingEmpleados = (ventas = []) => {
  const mapa = new Map();
  for (const venta of ventas) {
    const neto = totalNetoVenta(venta);
    const unidades = unidadesNetasVenta(venta);
    if (neto <= 0 && unidades <= 0) continue;
    const nombre = String(venta.empleado || '').trim() || 'Sin asignar';
    if (!mapa.has(nombre)) mapa.set(nombre, { empleado: nombre, total: 0, unidades: 0, ventas: 0 });
    const fila = mapa.get(nombre);
    fila.total += neto;
    fila.unidades += unidades;
    fila.ventas += 1;
  }
  return [...mapa.values()]
    .map((fila) => ({ ...fila, total: redondear(fila.total) }))
    .sort((a, b) => b.total - a.total || b.unidades - a.unidades);
};

export const construirEje = (ventas = [], offset = 0, eje = 'dia', mapaEmpleados = new Map(), mapaProductos = new Map()) => {
  const baseDe = (clave) => {
    if (eje === 'mes') return { mes: clave };
    if (eje === 'semana') return { semana: clave };
    return { fecha: clave };
  };

  const crearPunto = (clave) => {
    const punto = { ...baseDe(clave), total: 0, unidades: 0 };
    for (const id of mapaEmpleados.values()) punto[id] = 0;
    for (const id of mapaProductos.values()) punto[id] = 0;
    return punto;
  };

  const mapa = new Map();
  const puntoDe = (clave) => {
    if (!mapa.has(clave)) mapa.set(clave, crearPunto(clave));
    return mapa.get(clave);
  };

  for (const venta of ventas) {
    const neto = totalNetoVenta(venta);
    const unidades = unidadesNetasVenta(venta);
    if (neto <= 0 && unidades <= 0) continue;

    const punto = puntoDe(claveEje(venta.fechaCreacion, offset, eje));
    punto.total += neto;
    punto.unidades += unidades;

    const claveEmpleado = mapaEmpleados.get(String(venta.empleado || '').trim() || 'Sin asignar');
    if (claveEmpleado) punto[claveEmpleado] += neto;

    if (mapaProductos.size > 0) {
      for (const item of unidadesEfectivasDeVenta(venta)) {
        const claveProducto = mapaProductos.get(item.productoId);
        if (claveProducto) punto[claveProducto] += item.cantidad;
      }
    }
  }

  const redondearPunto = (punto) => {
    const salida = {};
    for (const [clave, valor] of Object.entries(punto)) {
      salida[clave] = typeof valor === 'number' ? redondear(valor) : valor;
    }
    return salida;
  };

  if (mapa.size === 0) return [];
  const claves = [...mapa.keys()].sort();
  const primera = claves[0];
  const ultima = claves[claves.length - 1];
  const config = {
    dia: { contar: contarDias, sumar: sumarDia, maxPuntos: 366 },
    semana: { contar: contarSemanas, sumar: sumarSemana, maxPuntos: 260 },
    mes: { contar: contarMeses, sumar: sumarMes, maxPuntos: 120 },
  }[eje] || { contar: contarDias, sumar: sumarDia, maxPuntos: 366 };
  if (config.contar(primera, ultima) > config.maxPuntos) return [];
  const puntos = [];
  let clave = primera;
  while (true) {
    puntos.push(redondearPunto(mapa.get(clave) || crearPunto(clave)));
    if (clave === ultima) break;
    clave = config.sumar(clave);
  }
  return puntos;
};
