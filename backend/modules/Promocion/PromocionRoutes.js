import { Router } from 'express';
import {
  obtenerPromociones,
  obtenerPromocionesVigentes,
  obtenerProductosDePromocion,
  crearPromocion,
  cancelarPromocion,
  eliminarPromocion,
} from './PromocionController.js';
import { proteger, admin } from '../../middlewares/AutenticacionMiddleware.js';

const router = Router();

router.use(proteger);
router.get('/vigentes', obtenerPromocionesVigentes);
router.get('/vigentes/:id/productos', obtenerProductosDePromocion);
router.use(admin);

router.get('/', obtenerPromociones);
router.post('/', crearPromocion);
router.patch('/:id/cancelar', cancelarPromocion);
router.delete('/:id', eliminarPromocion);

export default router;
