export const calcularPagina = (total, porPagina, pagina = 1) => {
  const totalNum = Math.max(0, Math.floor(Number(total) || 0));
  const tam = Math.max(1, Math.floor(Number(porPagina) || 1));
  const totalPaginas = Math.max(1, Math.ceil(totalNum / tam));
  const paginaSegura = Math.min(Math.max(Math.floor(Number(pagina) || 1), 1), totalPaginas);
  const desde = totalNum === 0 ? 0 : (paginaSegura - 1) * tam + 1;
  const hasta = Math.min(paginaSegura * tam, totalNum);
  return { total: totalNum, porPagina: tam, totalPaginas, paginaSegura, desde, hasta };
};

export const paginar = (lista, pagina, porPagina) => {
  const items = Array.isArray(lista) ? lista : [];
  const info = calcularPagina(items.length, porPagina, pagina);
  return { ...info, items: items.slice(info.desde === 0 ? 0 : info.desde - 1, info.hasta) };
};

export const rangoPaginas = (pagina, totalPaginas) => {
  const total = Math.max(1, Math.floor(Number(totalPaginas) || 1));
  const actual = Math.min(Math.max(Math.floor(Number(pagina) || 1), 1), total);
  const candidatas = new Set([1, total, actual, actual - 1, actual + 1]);
  const validas = [...candidatas].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const resultado = [];
  let anterior = 0;
  for (const p of validas) {
    if (anterior && p - anterior > 1) resultado.push('…');
    resultado.push(p);
    anterior = p;
  }
  return resultado;
};
