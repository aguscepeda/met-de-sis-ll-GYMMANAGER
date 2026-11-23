import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../src/app';
import { pool } from '../src/db';
import {
  fechaEnHoras,
  limpiarClasesDePrueba,
  obtenerDatosSemilla,
} from './helpers';

describe('API de Clases - casos normales', () => {
  const clasesCreadas: number[] = [];
  let profesorId: number;

  beforeAll(async () => {
    const semillas = await obtenerDatosSemilla();
    profesorId = semillas.profesorId;
  });

  afterAll(async () => {
    await limpiarClasesDePrueba(clasesCreadas);
    await pool.end();
  });

  it('POST /api/clases crea una clase válida y devuelve 201', async () => {
    const inicio = fechaEnHoras(24);
    const fin = fechaEnHoras(25);

    const res = await request(app).post('/api/clases').send({
      nombre: 'Crossfit Test',
      profesor_id: profesorId,
      inicio,
      fin,
      cupo: 12,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      nombre: 'Crossfit Test',
      profesor_id: profesorId,
      cupo: 12,
      estado: 'programada',
    });
    expect(typeof res.body.id).toBe('number');

    clasesCreadas.push(res.body.id);
  });

  it('GET /api/clases lista las clases incluyendo la creada con datos del profesor', async () => {
    const res = await request(app).get('/api/clases');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const creada = res.body.find((c: { id: number }) => c.id === clasesCreadas[0]);
    expect(creada).toBeDefined();
    expect(creada.nombre).toBe('Crossfit Test');
    expect(typeof creada.profesor_nombre).toBe('string');
    expect(typeof creada.profesor_especialidad).toBe('string');
  });

  it('GET /api/clases?profesor_id filtra las clases por profesor', async () => {
    const res = await request(app).get(`/api/clases?profesor_id=${profesorId}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(
      res.body.every((c: { profesor_id: number }) => c.profesor_id === profesorId),
    ).toBe(true);
  });

  it('GET /api/clases/:id devuelve la clase solicitada con 200', async () => {
    const claseId = clasesCreadas[0];
    const res = await request(app).get(`/api/clases/${claseId}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(claseId);
    expect(res.body.nombre).toBe('Crossfit Test');
  });
});