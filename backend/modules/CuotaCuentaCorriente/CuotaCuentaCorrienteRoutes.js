import { Router } from 'express';
import {
  obtenerCuotasDeCliente,
  obtenerResumenCuotas,
  revisarAhora,
} from './CuotaCuentaCorrienteController.js';
import { proteger, admin } from '../../middlewares/AutenticacionMiddleware.js';

/** Se monta bajo /api/clientes: cuotas de un cliente puntual. */
export const cuotasDeClienteRoutes = Router();
cuotasDeClienteRoutes.use(proteger);
cuotasDeClienteRoutes.get('/:clienteId/cuotas', obtenerCuotasDeCliente);

/** Se monta bajo /api/cuotas. */
const router = Router();
router.use(proteger);
router.get('/resumen', obtenerResumenCuotas);
router.post('/revisar', admin, revisarAhora);

export default router;
