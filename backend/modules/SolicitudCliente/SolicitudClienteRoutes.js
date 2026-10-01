import { Router } from 'express';
import {
  obtenerSolicitudes,
  crearSolicitud,
  aprobarSolicitud,
  rechazarSolicitud,
  contarSolicitudesPendientes,
} from './SolicitudClienteController.js';
import { proteger, admin } from '../../middlewares/AutenticacionMiddleware.js';

const router = Router();

router.use(proteger);

router.get('/pendientes/count', admin, contarSolicitudesPendientes);
router.get('/', obtenerSolicitudes);
router.post('/', crearSolicitud);
router.patch('/:id/aprobar', admin, aprobarSolicitud);
router.patch('/:id/rechazar', admin, rechazarSolicitud);

export default router;
