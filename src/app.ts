import express from 'express';
import { pool } from './db';
import clasesRoutes from './routes/clases.routes';
import inscripcionesRoutes from './routes/inscripciones.routes'; 

const app = express();

// Middlewares globales
app.use(express.json());
app.use(express.static('public'));

// Rutas de la API
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