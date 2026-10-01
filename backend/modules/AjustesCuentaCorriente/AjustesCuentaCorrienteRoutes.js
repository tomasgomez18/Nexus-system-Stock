import { Router } from 'express';
import { obtener, actualizar } from './AjustesCuentaCorrienteController.js';
import { proteger, admin } from '../../middlewares/AutenticacionMiddleware.js';

const router = Router();

router.use(proteger);

router.get('/', obtener);
router.put('/', admin, actualizar);

export default router;
