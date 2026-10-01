import { Router } from 'express';
import { obtenerClientes, obtenerCliente, crearCliente, actualizarCliente, eliminarCliente } from './ClienteController.js';
import { proteger, admin } from '../../middlewares/AutenticacionMiddleware.js';

const router = Router();

router.use(proteger);

router.get('/', obtenerClientes);
router.get('/:id', obtenerCliente);
router.post('/', admin, crearCliente);
router.put('/:id', admin, actualizarCliente);
router.delete('/:id', admin, eliminarCliente);

export default router;
