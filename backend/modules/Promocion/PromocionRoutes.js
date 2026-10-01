import { Router } from 'express';
import {
  obtenerPromociones,
  crearPromocion,
  cancelarPromocion,
  eliminarPromocion,
} from './PromocionController.js';
import { proteger, admin } from '../../middlewares/AutenticacionMiddleware.js';

const router = Router();

router.use(proteger);
router.use(admin);

router.get('/', obtenerPromociones);
router.post('/', crearPromocion);
router.patch('/:id/cancelar', cancelarPromocion);
router.delete('/:id', eliminarPromocion);

export default router;
