import { Router } from 'express';
import { inscripcionesController } from '../controllers/inscripciones.controller';

const router = Router();

router.get('/', (req, res) => inscripcionesController.listar(req, res));
router.post('/', (req, res) => inscripcionesController.inscribir(req, res));
// Cancelar es un cambio de estado (baja lógica), no un borrado físico.
router.delete('/:id', (req, res) => inscripcionesController.cancelar(req, res));

export default router;