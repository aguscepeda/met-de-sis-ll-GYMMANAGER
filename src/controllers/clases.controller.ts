import { Request, Response } from 'express';
import { clasesService } from '../services/clases.service';

export class ClasesController {
  async crear(req: Request, res: Response): Promise<void> {
    try {
      const nuevaClase = await clasesService.crear(req.body);
      res.status(201).json(nuevaClase);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Datos de clase inválidos.' });
    }
  }

  async listar(req: Request, res: Response): Promise<void> {
    try {
      const profesorId = req.query.profesor_id ? Number(req.query.profesor_id) : undefined;
      const clases = await clasesService.listar(profesorId);
      res.status(200).json(clases);
    } catch (error: any) {
      res.status(500).json({ error: 'Error al listar las clases.' });
    }
  }

  async obtenerPorId(req: Request, res: Response): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'El ID de la clase debe ser un número válido.' });
        return;
      }

      const clase = await clasesService.obtenerPorId(id);
      if (!clase) {
        res.status(404).json({ error: 'Clase no encontrada.' });
        return;
      }

      res.status(200).json(clase);
    } catch (error: any) {
      res.status(500).json({ error: 'Error al obtener la clase.' });
    }
  }
}

export const clasesController = new ClasesController();