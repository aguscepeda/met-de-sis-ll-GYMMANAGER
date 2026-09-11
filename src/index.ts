import express from 'express';
import dotenv from 'dotenv';
import { pool } from './db';

dotenv.config();

const app = express();

app.use(express.json());

app.get('/health', async (req, res) => {
  const result = await pool.query('SELECT NOW()');

  res.json({
    status: 'ok',
    db_time: result.rows[0].now,
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});