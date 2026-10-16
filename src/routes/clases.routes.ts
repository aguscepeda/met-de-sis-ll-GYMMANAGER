import { Router } from 'express';
import { clasesController } from '../controllers/clases.controller';

const router = Router();

router.get('/', (req, res) => clasesController.listar(req, res));
router.post('/', (req, res) => clasesController.crear(req, res));
router.get('/:id', (req, res) => clasesController.obtenerPorId(req, res));
router.patch('/:id/finalizar', (req, res) => clasesController.finalizar(req, res));
router.patch('/:id/cancelar', (req, res) => clasesController.cancelar(req, res));

export default router;