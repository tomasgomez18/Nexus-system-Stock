import { Router } from 'express';
import {
  obtenerMovimientos,
  crearMovimiento,
  actualizarMovimiento,
  anularMovimiento,
  obtenerSaldo,
} from './MovimientoCuentaCorrienteController.js';
import { proteger } from '../../middlewares/AutenticacionMiddleware.js';

const router = Router();

router.use(proteger);

router.get('/:clienteId/movimientos', obtenerMovimientos);
router.post('/:clienteId/movimientos', crearMovimiento);
router.put('/:clienteId/movimientos/:movimientoId', actualizarMovimiento);
router.patch('/:clienteId/movimientos/:movimientoId/anular', anularMovimiento);
router.get('/:clienteId/saldo', obtenerSaldo);

export default router;
