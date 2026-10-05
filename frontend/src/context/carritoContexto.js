import { createContext, useContext } from 'react';

export const CarritoContext = createContext(null);

export const METODOS_PAGO = [
  { key: 'efectivo', label: 'Efectivo', activeCls: 'bg-ios-green/25 text-ios-green border-ios-green/50 dark:bg-ios-green/15 dark:border-ios-green/30' },
  { key: 'transferencia', label: 'Transferencia', activeCls: 'bg-ios-tint/25 text-ios-tint border-ios-tint/50 dark:bg-ios-tint/15 dark:border-ios-tint/30' },
  { key: 'tarjeta', label: 'Tarjeta', activeCls: 'bg-ios-purple/25 text-ios-purple border-ios-purple/50 dark:bg-ios-purple/15 dark:border-ios-purple/30' },
  { key: 'cuentaCorriente', label: 'Cta. Cte.', activeCls: 'bg-ios-orange/25 text-ios-orange border-ios-orange/50 dark:bg-ios-orange/15 dark:border-ios-orange/30' },
];

export const useCarrito = () => {
  const ctx = useContext(CarritoContext);
  if (!ctx) throw new Error('useCarrito debe usarse dentro de <CarritoProvider>');
  return ctx;
};
