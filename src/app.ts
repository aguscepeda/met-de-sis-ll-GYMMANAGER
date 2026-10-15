import express from 'express';
import { pool } from './db';

const app = express();

// Middlewares globales
app.use(express.json());
app.use(express.static('public'));

// Endpoint de diagnóstico del sistema
app.get('/health', async (req, res) => {
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