import express from 'express';
import { pool } from './db';
import clasesRoutes from './routes/clases.routes';
import inscripcionesRoutes from './routes/inscripciones.routes'; 

const app = express();

// Middlewares globales
app.use(express.json());
app.use(express.static('public'));

// Rutas de la API
app.get('/api/profesores', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nombre, especialidad FROM profesor ORDER BY nombre',
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'No se pudo cargar el listado de profesores.',
    });
  }
});
app.get('/api/alumnos', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, apellido, email, telefono
       FROM alumno
       ORDER BY apellido, nombre`,
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'No se pudo cargar el listado de alumnos.',
    });
  }
});
app.use('/api/clases', clasesRoutes);
app.use('/api/inscripciones', inscripcionesRoutes); 

// Endpoint de diagnóstico del sistema
app.get('/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      status: 'ok',
      db_time: result.rows[0].now,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'No se pudo conectar a la base de datos',
    });
  }
});

export default app;