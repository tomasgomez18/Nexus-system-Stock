const pad = (n) => String(n).padStart(2, '0');
export const formatearRestante = (ms) => {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const dias = Math.floor(total / 86400);
  const horas = Math.floor((total % 86400) / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const segundos = total % 60;

  if (dias > 0) return `${dias}d ${pad(horas)}h ${pad(minutos)}m ${pad(segundos)}s`;
  if (horas > 0) return `${pad(horas)}h ${pad(minutos)}m ${pad(segundos)}s`;
  if (minutos > 0) return `${pad(minutos)}m ${pad(segundos)}s`;
  return `${segundos}s`;
};
