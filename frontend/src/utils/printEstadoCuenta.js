import { printHtml } from './printHtml';
import { formatMoney } from './format';

const NEGOCIONAME = 'NexusCode';
const NEGOCIO = 'Desarrollo by NexusCode';

const ORIGENES = {
  factura: 'Factura',
  pago: 'Pago',
  ajuste: 'Ajuste',
  devolucion: 'Devolución',
  venta: 'Venta',
  interes: 'Interés financiación',
  mora: 'Mora',
};

const FORMAS_PAGO = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  ninguno: '',
};

const escapeHtml = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

const pad = (n) => String(n).padStart(2, '0');

const formatFechaCalendario = (fecha) => {
  if (!fecha) return '—';
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};

const formatFechaHora = (fecha) => {
  if (!fecha) return '—';
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const estadoCuotaLabel = (cuota) => {
  if (cuota.estado === 'pagada') return 'Pagada';
  if (cuota.estado === 'cancelada') return 'Cancelada';
  if (cuota.vencida) return 'Vencida';
  if (cuota.estado === 'parcial') return 'Parcial';
  return 'Pendiente';
};

const descripcionMovimiento = (m) => {
  const partes = [ORIGENES[m.origen] || m.origen || ''];
  if (m.nota) partes.push(m.nota);
  if (m.registradoPor) partes.push(`(${m.registradoPor})`);
  return partes.join(' · ');
};

const movimientosActivos = (movimientos) =>
  (movimientos || [])
    .filter((m) => m.estado !== 'anulado')
    .slice()
    .sort((a, b) => {
      const fa = new Date(a.fecha || a.fechaCreacion || 0).getTime();
      const fb = new Date(b.fecha || b.fechaCreacion || 0).getTime();
      if (fa !== fb) return fa - fb;
      return new Date(a.fechaCreacion || 0).getTime() - new Date(b.fechaCreacion || 0).getTime();
    });

/** Agrega el saldo acumulado a cada movimiento (positivo = deuda del cliente). */
const conSaldoAcumulado = (movimientos) => {
  let acumulado = 0;
  return movimientosActivos(movimientos).map((m) => {
    const monto = Number(m.monto) || 0;
    acumulado += m.tipo === 'debito' ? monto : -monto;
    return { ...m, montoNum: monto, saldoAcumulado: Math.round(acumulado * 100) / 100 };
  });
};

const cuotasPendientes = (cuotas) =>
  (cuotas || []).filter((c) => c.estado === 'pendiente' || c.estado === 'parcial');

const resumenSaldo = (saldoNum) => {
  if (saldoNum > 0) return { label: 'DEUDA DEL CLIENTE', texto: formatMoney(saldoNum) };
  if (saldoNum < 0) return { label: 'SALDO A FAVOR', texto: formatMoney(Math.abs(saldoNum)) };
  return { label: 'CUENTA AL DÍA', texto: formatMoney(0) };
};

const datosCliente = (cliente) => {
  const filas = [
    ['Documento', cliente?.documento],
    ['Teléfono', cliente?.telefono],
    ['Email', cliente?.email],
    ['Dirección', cliente?.direccion],
  ].filter(([, valor]) => String(valor || '').trim());
  return filas;
};

const cuerpoA4 = ({ cliente, movimientos, cuotas, saldo, emitido }) => {
  const detalle = conSaldoAcumulado(movimientos);
  const pendientes = cuotasPendientes(cuotas);
  const totalDebitos = Number(saldo?.totalDebitos) || 0;
  const totalCreditos = Number(saldo?.totalCreditos) || 0;
  const saldoNum = Number(saldo?.saldo) || 0;
  const resumen = resumenSaldo(saldoNum);

  const movimientosHtml = detalle.length === 0
    ? '<tr><td colspan="7" class="vacio">Sin movimientos registrados</td></tr>'
    : detalle
        .map(
          (m) => `<tr>
      <td class="nowrap">${formatFechaCalendario(m.fecha)}</td>
      <td>${escapeHtml(descripcionMovimiento(m))}</td>
      <td class="nowrap">${escapeHtml(m.referencia || '—')}</td>
      <td class="nowrap">${escapeHtml(FORMAS_PAGO[m.formaPago] || '')}</td>
      <td class="num">${m.tipo === 'debito' ? formatMoney(m.montoNum) : ''}</td>
      <td class="num">${m.tipo === 'credito' ? formatMoney(m.montoNum) : ''}</td>
      <td class="num">${formatMoney(m.saldoAcumulado)}</td>
    </tr>`
        )
        .join('');

  const cuotasHtml = pendientes.length === 0
    ? ''
    : `<h2>Cuotas pendientes</h2>
  <table>
    <thead>
      <tr>
        <th>Cuota</th><th>Ticket</th><th>Vence</th>
        <th class="num">Monto</th><th class="num">Pagado</th><th class="num">Mora</th><th class="num">Saldo</th><th>Estado</th>
      </tr>
    </thead>
    <tbody>
      ${pendientes
        .map(
          (c) => `<tr>
        <td>${c.numero}/${c.totalCuotas}</td>
        <td>${escapeHtml(c.ticketNumero || '—')}</td>
        <td class="nowrap">${formatFechaCalendario(c.fechaVencimiento)}</td>
        <td class="num">${formatMoney(c.monto)}</td>
        <td class="num">${formatMoney(c.pagado)}</td>
        <td class="num">${Number(c.moraAcumulada) > 0 ? formatMoney(c.moraAcumulada) : '—'}</td>
        <td class="num">${formatMoney(c.saldoPendiente ?? c.monto)}</td>
        <td>${estadoCuotaLabel(c)}</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>`;

  const clienteFilas = datosCliente(cliente)
    .map(([label, valor]) => `<p class="dato"><span>${label}:</span> ${escapeHtml(valor)}</p>`)
    .join('');

  return `
<div class="encabezado">
  <div>
    <p class="marca">${NEGOCIONAME.toUpperCase()}</p>
    <p class="marca-sub">${escapeHtml(NEGOCIO)}</p>
  </div>
  <div class="titulo">
    <h1>ESTADO DE CUENTA</h1>
    <p>Comprobante de cuenta corriente</p>
  </div>
</div>

<div class="datos">
  <div>
    <p class="seccion">Cliente</p>
    <p class="dato nombre"><span>Nombre:</span> ${escapeHtml(cliente?.nombre || '—')}</p>
    ${clienteFilas}
  </div>
  <div class="emision">
    <p class="seccion">Emisión</p>
    <p class="dato">${formatFechaHora(emitido)}</p>
  </div>
</div>

<div class="resumen">
  <div class="box"><span class="label">Débitos</span><span class="valor rojo">${formatMoney(totalDebitos)}</span></div>
  <div class="box"><span class="label">Créditos</span><span class="valor verde">${formatMoney(totalCreditos)}</span></div>
  <div class="box"><span class="label">${resumen.label}</span><span class="valor">${resumen.texto}</span></div>
</div>

<h2>Detalle de movimientos</h2>
<table>
  <thead>
    <tr>
      <th>Fecha</th><th>Detalle</th><th>Comprob.</th><th>Pago</th>
      <th class="num">Débito</th><th class="num">Crédito</th><th class="num">Saldo</th>
    </tr>
  </thead>
  <tbody>${movimientosHtml}</tbody>
</table>

${cuotasHtml}

<p class="pie">Documento no válido como factura · Generado por ${escapeHtml(NEGOCIO)}</p>`;
};

const cuerpoTicket = ({ cliente, movimientos, cuotas, saldo, emitido }) => {
  const detalle = conSaldoAcumulado(movimientos);
  const pendientes = cuotasPendientes(cuotas);
  const totalDebitos = Number(saldo?.totalDebitos) || 0;
  const totalCreditos = Number(saldo?.totalCreditos) || 0;
  const saldoNum = Number(saldo?.saldo) || 0;
  const resumen = resumenSaldo(saldoNum);

  const sep = '<div class="sep">==============================</div>';
  const line = (label, value) =>
    `<div class="line"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;

  const movimientosHtml = detalle.length === 0
    ? '<p class="vacio">Sin movimientos registrados</p>'
    : detalle
        .map(
          (m) => `<div class="mov">
    <p class="mov-titulo">${formatFechaCalendario(m.fecha)} · ${escapeHtml(ORIGENES[m.origen] || m.origen || '')}${m.referencia ? ` · ${escapeHtml(m.referencia)}` : ''}</p>
    ${m.nota ? `<p class="mov-nota">${escapeHtml(m.nota)}</p>` : ''}
    ${FORMAS_PAGO[m.formaPago] ? `<p class="mov-nota">Pago: ${escapeHtml(FORMAS_PAGO[m.formaPago])}</p>` : ''}
    <div class="line"><span>${m.tipo === 'debito' ? 'Débito' : 'Crédito'} ${formatMoney(m.montoNum)}</span><span>Saldo ${formatMoney(m.saldoAcumulado)}</span></div>
  </div>`
        )
        .join('');

  const cuotasHtml = pendientes.length === 0
    ? ''
    : `${sep}
<p class="seccion">CUOTAS PENDIENTES</p>
${pendientes
  .map(
    (c) => `<div class="mov">
  <p class="mov-titulo">Cuota ${c.numero}/${c.totalCuotas}${c.ticketNumero ? ` · ${escapeHtml(c.ticketNumero)}` : ''}</p>
  <p class="mov-nota">Vence ${formatFechaCalendario(c.fechaVencimiento)} · ${estadoCuotaLabel(c)}</p>
  ${line('Monto', formatMoney(c.monto))}
  ${line('Pagado', formatMoney(c.pagado))}
  ${Number(c.moraAcumulada) > 0 ? line('Mora', formatMoney(c.moraAcumulada)) : ''}
  ${line('Saldo', formatMoney(c.saldoPendiente ?? c.monto))}
</div>`
  )
  .join('')}`;

  return `
<div class="ticket-body">
  <div class="centro">
    <p class="marca">${NEGOCIONAME.toUpperCase()}</p>
    <p class="subtitulo">ESTADO DE CUENTA</p>
    <p class="chico">Comprobante de cuenta corriente</p>
  </div>
  ${sep}
  <div class="line"><span>Cliente</span><span>${escapeHtml(cliente?.nombre || '—')}</span></div>
  ${cliente?.documento ? line('Documento', cliente.documento) : ''}
  ${cliente?.telefono ? line('Teléfono', cliente.telefono) : ''}
  ${line('Emitido', formatFechaHora(emitido))}
  ${sep}
  <p class="seccion">RESUMEN</p>
  ${line('Débitos', formatMoney(totalDebitos))}
  ${line('Créditos', formatMoney(totalCreditos))}
  ${line(resumen.label, resumen.texto)}
  ${sep}
  <p class="seccion">MOVIMIENTOS</p>
  ${movimientosHtml}
  ${cuotasHtml}
  ${sep}
  <p class="centro chico">Documento no válido como factura</p>
  <p class="centro chico">¡Gracias!</p>
</div>`;
};

/**
 * Imprime el estado de cuenta del cliente.
 * formato: 'a4' (hoja) o 'ticket' (rollo de 80mm).
 */
export const printEstadoCuenta = async ({ cliente, movimientos = [], cuotas = [], saldo = {}, formato = 'a4' }) => {
  const emitido = new Date();
  const esTicket = formato === 'ticket';
  const cuerpo = esTicket
    ? cuerpoTicket({ cliente, movimientos, cuotas, saldo, emitido })
    : cuerpoA4({ cliente, movimientos, cuotas, saldo, emitido });

  const estilos = esTicket
    ? `
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    width: 80mm;
    margin: 0 auto;
    padding: 4mm 3mm;
    background: #fff;
    color: #000;
    font-family: 'Courier New', 'Lucida Console', monospace;
    font-size: 11px;
    line-height: 1.45;
  }
  .ticket-body { width: 100%; }
  .centro { text-align: center; }
  .marca { font-size: 15px; font-weight: bold; letter-spacing: 2px; margin: 0; }
  .subtitulo { font-size: 12px; font-weight: bold; letter-spacing: 1px; margin: 2px 0 0; }
  .chico { font-size: 10px; opacity: 0.75; margin: 0; }
  .sep { text-align: center; opacity: 0.85; letter-spacing: 1px; margin: 6px 0; white-space: pre; }
  .seccion { font-weight: bold; margin: 0 0 2px; }
  .line { display: flex; justify-content: space-between; gap: 8px; }
  .line span:last-child { text-align: right; }
  .mov { margin-bottom: 5px; page-break-inside: avoid; }
  .mov-titulo { font-weight: bold; margin: 0; }
  .mov-nota { opacity: 0.75; margin: 0; }
  .vacio { text-align: center; opacity: 0.75; margin: 6px 0; }
`
    : `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11px; margin: 0; }
  .encabezado { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 8px; }
  .marca { font-size: 20px; font-weight: bold; letter-spacing: 2px; margin: 0; }
  .marca-sub { font-size: 10px; color: #555; margin: 2px 0 0; }
  .titulo { text-align: right; }
  .titulo h1 { font-size: 16px; margin: 0; letter-spacing: 1px; }
  .titulo p { font-size: 10px; color: #555; margin: 2px 0 0; }
  .datos { display: flex; justify-content: space-between; gap: 20px; margin: 12px 0; }
  .seccion { font-weight: bold; text-transform: uppercase; font-size: 10px; color: #555; margin: 0 0 4px; }
  .dato { margin: 1px 0; }
  .dato span { font-weight: bold; }
  .dato.nombre { font-size: 13px; }
  .emision { text-align: right; white-space: nowrap; }
  .resumen { display: flex; gap: 10px; margin: 12px 0 16px; }
  .box { flex: 1; border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 3px; }
  .box .label { font-size: 9px; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
  .box .valor { font-size: 15px; font-weight: bold; }
  .rojo { color: #b91c1c; }
  .verde { color: #15803d; }
  h2 { font-size: 12px; margin: 14px 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #ddd; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { font-size: 9px; text-transform: uppercase; color: #555; letter-spacing: 0.5px; }
  .num { text-align: right; white-space: nowrap; }
  .nowrap { white-space: nowrap; }
  .vacio { text-align: center; color: #777; }
  .pie { margin-top: 18px; font-size: 9px; color: #777; text-align: center; }
`;

  return printHtml(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Estado de cuenta ${escapeHtml(cliente?.nombre || '')}</title>
<style>${estilos}</style>
</head>
<body>
${cuerpo}
</body>
</html>`);
};
