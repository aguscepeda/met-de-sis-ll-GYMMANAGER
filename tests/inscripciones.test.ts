import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../src/app';
import { pool } from '../src/db';
import {
  fechaEnHoras,
  limpiarClasesDePrueba,
  obtenerDatosSemilla,
} from './helpers';

describe('API de Inscripciones - casos normales', () => {
  const clasesCreadas: number[] = [];
  let alumnoId: number;
  let claseId: number;
  let inscripcionId: number;

  beforeAll(async () => {
    const { profesorId, alumnoId: semillaAlumnoId } = await obtenerDatosSemilla();
    alumnoId = semillaAlumnoId;

    const claseRes = await request(app).post('/api/clases').send({
      nombre: 'Spinning Test Inscripcion',
      profesor_id: profesorId,
      inicio: fechaEnHoras(48),
      fin: fechaEnHoras(49),
      cupo: 5,
    });

    expect(claseRes.status).toBe(201);
    claseId = claseRes.body.id;
    clasesCreadas.push(claseId);
  });

  afterAll(async () => {
    await limpiarClasesDePrueba(clasesCreadas);
    await pool.end();
  });

  it('POST /api/inscripciones inscribe a un alumno en una clase válida y devuelve 201', async () => {
    const res = await request(app).post('/api/inscripciones').send({
      alumno_id: alumnoId,
      clase_id: claseId,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      alumno_id: alumnoId,
      clase_id: claseId,
      estado: 'activa',
      cancelada_en: null,
    });
    expect(typeof res.body.id).toBe('number');

    inscripcionId = res.body.id;
  });

  it('GET /api/inscripciones lista la inscripción activa con datos de alumno y clase', async () => {
    const res = await request(app).get(
      `/api/inscripciones?clase_id=${claseId}&estado=activa`,
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const encontrada = res.body.find((i: { id: number }) => i.id === inscripcionId);
    expect(encontrada).toBeDefined();
    expect(encontrada.clase_nombre).toBe('Spinning Test Inscripcion');
    expect(typeof encontrada.alumno_nombre).toBe('string');
  });

  it('DELETE /api/inscripciones/:id cancela la inscripción (baja lógica) y devuelve 200', async () => {
    const res = await request(app).delete(`/api/inscripciones/${inscripcionId}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: inscripcionId,
      alumno_id: alumnoId,
      clase_id: claseId,
      estado: 'cancelada',
    });
    expect(res.body.cancelada_en).not.toBeNull();
  });
});