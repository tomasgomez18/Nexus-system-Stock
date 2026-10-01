import mongoose from 'mongoose';
import SolicitudCliente, { ESTADOS_SOLICITUD } from './SolicitudClienteModel.js';
import { schemaCrearSolicitud, schemaRechazarSolicitud } from './SolicitudClienteSchema.js';
import Cliente from '../Cliente/ClienteModel.js';
import Notificacion from '../Notificacion/NotificacionModel.js';
import { enviarEvento } from '../../services/PushService.js';
import { enSegundoPlano } from '../../utils/TareasUtils.js';
import logger from '../../utils/LoggerUtils.js';

const escaparRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const nombreDuplicado = async (nombre, excluirSolicitudId) => {
  const filter = { nombre: { $regex: `^${escaparRegex(nombre.trim())}$`, $options: 'i' } };
  if (excluirSolicitudId) filter._id = { $ne: excluirSolicitudId };
  return Cliente.findOne(filter);
};

/** Cantidad de altas esperando revision del admin. Solo un numero, para el cartelito del menu. */
export const contarSolicitudesPendientes = async (req, res, next) => {
  try {
    const total = await SolicitudCliente.countDocuments({ estado: 'pendiente' });
    res.json({ total });
  } catch (error) {
    next(error);
  }
};

/**
 * Avisa a los administradores que hay un alta pendiente. Si el aviso falla, la solicitud
 * ya quedo creada y el admin igual la ve por el cartelito del menu, asi que no se corta nada.
 */
const avisarSolicitudPendiente = async (solicitud) => {
  try {
    const nombre = solicitud.datos?.nombre || 'un cliente';
    await Notificacion.create({
      titulo: 'Nueva solicitud de alta de cliente',
      descripcion: `${solicitud.solicitanteNombre || 'Un empleado'} pidió dar de alta a ${nombre}. Revisala en Clientes.`,
      estado: 'pendiente',
      creadoPor: solicitud.solicitante,
      destinatario: null,
      destinatarioNombre: '',
      nuevaParaAdmin: true,
      soloAdmin: true,
      solicitud: solicitud._id,
    });

    enSegundoPlano(
      enviarEvento({
        tipo: 'aviso',
        titulo: 'Nueva solicitud de alta',
        mensaje: `${solicitud.solicitanteNombre || 'Un empleado'} pidió dar de alta a ${nombre}`,
        url: '/clientes',
        para: 'admins',
      }),
      {
        mensaje: 'No se pudo enviar el aviso push de la solicitud de alta',
        lugar: 'SolicitudClienteController.js → avisarSolicitudPendiente',
      }
    );
  } catch (error) {
    logger.error('No se pudo crear el aviso de la solicitud de alta', {
      motivo: error.message,
      origen: 'backend',
      lugar: 'SolicitudClienteController.js → avisarSolicitudPendiente',
      stack: error.stack,
    });
  }
};

/** Al resolver el alta, el aviso se cierra solo dejando claro si fue aprobada o rechazada. */
const cerrarAvisoDeSolicitud = async (solicitudId, usuario, comentario) => {
  if (!solicitudId) return;
  try {
    await Notificacion.updateMany(
      { solicitud: solicitudId, estado: { $ne: 'realizado' } },
      {
        $set: {
          estado: 'realizado',
          comentario,
          realizadoPor: usuario?.id || null,
          realizadoNombre: usuario?.nombre || '',
          realizadoEn: new Date(),
          nuevaParaAdmin: false,
          vistosPor: [],
        },
      }
    );
  } catch (error) {
    logger.error('No se pudo cerrar el aviso de la solicitud de alta', {
      motivo: error.message,
      origen: 'backend',
      lugar: 'SolicitudClienteController.js → cerrarAvisoDeSolicitud',
      stack: error.stack,
    });
  }
};

/** El empleado ve sus propias solicitudes; el admin ve todas. */
export const obtenerSolicitudes = async (req, res, next) => {
  try {
    const { estado, limit = 50, offset = 0 } = req.query;
    const filter = {};

    if (estado) {
      if (!ESTADOS_SOLICITUD.includes(estado)) {
        return res.status(400).json({ message: 'Estado de solicitud inválido' });
      }
      filter.estado = estado;
    }
    if (req.usuario?.rol !== 'admin') {
      filter.solicitante = req.usuario?.id;
    }

    const limite = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const salto = Math.max(Number(offset) || 0, 0);

    const solicitudes = await SolicitudCliente.find(filter).sort({ fechaCreacion: -1 }).skip(salto).limit(limite);

    res.json(solicitudes);
  } catch (error) {
    next(error);
  }
};

export const crearSolicitud = async (req, res, next) => {
  try {
    const data = schemaCrearSolicitud.parse(req.body);
    const pendiente = await SolicitudCliente.findOne({
      solicitante: req.usuario?.id,
      estado: 'pendiente',
      'datos.nombre': { $regex: `^${escaparRegex(data.datos.nombre)}$`, $options: 'i' },
    });
    if (pendiente) {
      return res.status(409).json({ message: 'Ya tenés una solicitud pendiente con ese nombre' });
    }

    const request = await SolicitudCliente.create({
      datos: data.datos,
      estado: 'pendiente',
      solicitante: req.usuario?.id,
      solicitanteNombre: req.usuario?.nombre || '',
    });

    await avisarSolicitudPendiente(request);

    res.status(201).json(request);
  } catch (error) {
    next(error);
  }
};

/** Al aprobar se crea el cliente; si el nombre ya existe, no se duplica ni se pierde la solicitud. */
export const aprobarSolicitud = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Solicitud inválida' });
    }
    const solicitud = await SolicitudCliente.findById(req.params.id);
    if (!solicitud) {
      return res.status(404).json({ message: 'Solicitud no encontrada' });
    }
    if (solicitud.estado !== 'pendiente') {
      return res.status(409).json({ message: 'La solicitud ya fue revisada' });
    }
    const duplicado = await nombreDuplicado(solicitud.datos.nombre);
    if (duplicado) {
      return res.status(409).json({
        message: `Ya existe un cliente llamado "${solicitud.datos.nombre}"`,
        cliente: duplicado._id,
      });
    }

    const cliente = await Cliente.create(solicitud.datos.toObject());
    solicitud.estado = 'aprobada';
    solicitud.cliente = cliente._id;
    solicitud.revisadoPor = req.usuario?.id;
    solicitud.revisadoPorNombre = req.usuario?.nombre || '';
    solicitud.revisadoEn = new Date();
    await solicitud.save();

    await cerrarAvisoDeSolicitud(solicitud._id, req.usuario, 'Solicitud aprobada');

    res.json(solicitud);
  } catch (error) {
    next(error);
  }
};

export const rechazarSolicitud = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Solicitud inválida' });
    }
    const data = schemaRechazarSolicitud.parse(req.body);
    const solicitud = await SolicitudCliente.findById(req.params.id);
    if (!solicitud) {
      return res.status(404).json({ message: 'Solicitud no encontrada' });
    }
    if (solicitud.estado !== 'pendiente') {
      return res.status(409).json({ message: 'La solicitud ya fue revisada' });
    }

    solicitud.estado = 'rechazada';
    solicitud.motivo = data.motivo;
    solicitud.revisadoPor = req.usuario?.id;
    solicitud.revisadoPorNombre = req.usuario?.nombre || '';
    solicitud.revisadoEn = new Date();
    await solicitud.save();

    await cerrarAvisoDeSolicitud(
      solicitud._id,
      req.usuario,
      data.motivo ? `Solicitud rechazada: ${data.motivo}` : 'Solicitud rechazada'
    );

    res.json(solicitud);
  } catch (error) {
    next(error);
  }
};
