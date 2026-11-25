import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import app from '../src/app';
import { pool } from '../src/db';
import {
    fechaEnHoras,
    limpiarClasesDePrueba,
    obtenerDatosSemilla,
} from './helpers';

/**
 * Casos límite y de error de Inscripciones.
 * Cada caso sale de la tabla de reglas de docs/decisiones-diseno.md.
 * Los casos normales están en tests/inscripciones.test.ts.
 */
describe('API de Inscripciones - casos límite y de error', () => {
    const clasesCreadas: number[] = [];
    let profesorId: number;
    let alumnoA: number;
    let alumnoB: number;

    /** Crea una clase de prueba y la registra para limpiarla en afterAll. */
    async function crearClase(opciones: {
        inicioEnHoras: number;
        finEnHoras: number;
        cupo?: number;
        nombre?: string;
    }): Promise<number> {
        const res = await request(app)
            .post('/api/clases')
            .send({
                nombre: opciones.nombre ?? 'Clase Test Errores Inscripcion',
                profesor_id: profesorId,
                inicio: fechaEnHoras(opciones.inicioEnHoras),
                fin: fechaEnHoras(opciones.finEnHoras),
                cupo: opciones.cupo ?? 5,
            });

        expect(res.status).toBe(201);
        clasesCreadas.push(res.body.id);
        return res.body.id;
    }

    const inscribir = (alumno_id: unknown, clase_id: unknown) =>
        request(app).post('/api/inscripciones').send({ alumno_id, clase_id });

    beforeAll(async () => {
        const semillas = await obtenerDatosSemilla();
        profesorId = semillas.profesorId;
        alumnoA = semillas.alumnoId;

        // sql/init.sql carga 4 alumnos; se necesita uno más para duplicado y cupo.
        const { rows } = await pool.query(
            'SELECT id FROM alumno WHERE id <> $1 ORDER BY id ASC LIMIT 1',
            [alumnoA],
        );
        if (rows.length === 0) {
            throw new Error('Se necesitan al menos 2 alumnos. Ejecutá sql/init.sql.');
        }
        alumnoB = rows[0].id;
    });

    afterAll(async () => {
        await limpiarClasesDePrueba(clasesCreadas);
        await pool.end();
    });

    describe('POST /api/inscripciones', () => {
        it.each([
            ['alumno_id no numérico', 'abc', 1],
            ['clase_id no numérico', 1, 'abc'],
            ['alumno_id negativo', -1, 1],
            ['clase_id decimal', 1, 1.5],
            ['alumno_id cero', 0, 1],
            ['cuerpo vacío', undefined, undefined],
        ])('devuelve 400 con ID inválido (%s)', async (_caso, alumno, clase) => {
            const res = await inscribir(alumno, clase);

            expect(res.status).toBe(400);
            expect(typeof res.body.error).toBe('string');
        });

        it('devuelve 404 si la clase no existe', async () => {
            const res = await inscribir(alumnoA, 999999999);

            expect(res.status).toBe(404);
            expect(res.body.error).toMatch(/clase/i);
        });

        it('devuelve 404 si el alumno no existe', async () => {
            const claseId = await crearClase({ inicioEnHoras: 48, finEnHoras: 49 });

            const res = await inscribir(999999999, claseId);

            expect(res.status).toBe(404);
            expect(res.body.error).toMatch(/alumno/i);
        });

        it('devuelve 409 si la clase está cancelada', async () => {
            const claseId = await crearClase({ inicioEnHoras: 48, finEnHoras: 49 });
            const cancelar = await request(app).patch(`/api/clases/${claseId}/cancelar`);
            expect(cancelar.status).toBe(200);

            const res = await inscribir(alumnoA, claseId);

            expect(res.status).toBe(409);
            expect(res.body.error).toMatch(/cancelada/i);
        });

        it('devuelve 409 si la clase está finalizada', async () => {
            // La API permite crear una clase con fechas pasadas, así se puede finalizar.
            const claseId = await crearClase({ inicioEnHoras: -3, finEnHoras: -2 });
            const finalizar = await request(app).patch(`/api/clases/${claseId}/finalizar`);
            expect(finalizar.status).toBe(200);

            const res = await inscribir(alumnoA, claseId);

            expect(res.status).toBe(409);
            expect(res.body.error).toMatch(/finaliz/i);
        });

        it('devuelve 409 si la clase ya comenzó', async () => {
            // Inició hace 1 hora y termina en 1 hora: sigue "programada" pero ya empezó.
            const claseId = await crearClase({ inicioEnHoras: -1, finEnHoras: 1 });

            const res = await inscribir(alumnoA, claseId);

            expect(res.status).toBe(409);
            expect(res.body.error).toMatch(/comenz/i);
        });

        it('devuelve 409 si el alumno ya está inscripto en la clase', async () => {
            const claseId = await crearClase({ inicioEnHoras: 48, finEnHoras: 49 });

            const primera = await inscribir(alumnoA, claseId);
            expect(primera.status).toBe(201);

            const segunda = await inscribir(alumnoA, claseId);

            expect(segunda.status).toBe(409);
            expect(segunda.body.error).toMatch(/inscripto/i);
        });

        it('devuelve 409 cuando el cupo está completo (caso límite: cupo 1)', async () => {
            const claseId = await crearClase({
                inicioEnHoras: 48,
                finEnHoras: 49,
                cupo: 1,
            });

            const ultimoLugar = await inscribir(alumnoA, claseId);
            expect(ultimoLugar.status).toBe(201);

            const sinLugar = await inscribir(alumnoB, claseId);

            expect(sinLugar.status).toBe(409);
            expect(sinLugar.body.error).toMatch(/cupo/i);
        });

        it('permite volver a inscribirse después de cancelar (índice único parcial)', async () => {
            const claseId = await crearClase({ inicioEnHoras: 48, finEnHoras: 49 });

            const primera = await inscribir(alumnoA, claseId);
            expect(primera.status).toBe(201);
            const baja = await request(app).delete(`/api/inscripciones/${primera.body.id}`);
            expect(baja.status).toBe(200);

            const otraVez = await inscribir(alumnoA, claseId);

            expect(otraVez.status).toBe(201);
            expect(otraVez.body.id).not.toBe(primera.body.id);
        });
    });

    describe('DELETE /api/inscripciones/:id', () => {
        it('devuelve 400 con un ID de inscripción inválido', async () => {
            const res = await request(app).delete('/api/inscripciones/abc');

            expect(res.status).toBe(400);
        });

        it('devuelve 404 si la inscripción no existe', async () => {
            const res = await request(app).delete('/api/inscripciones/999999999');

            expect(res.status).toBe(404);
        });

        it('devuelve 409 si la inscripción ya estaba cancelada', async () => {
            const claseId = await crearClase({ inicioEnHoras: 48, finEnHoras: 49 });
            const alta = await inscribir(alumnoA, claseId);
            expect(alta.status).toBe(201);

            const primera = await request(app).delete(`/api/inscripciones/${alta.body.id}`);
            expect(primera.status).toBe(200);

            const segunda = await request(app).delete(`/api/inscripciones/${alta.body.id}`);

            expect(segunda.status).toBe(409);
            expect(segunda.body.error).toMatch(/cancelada/i);
        });
    });

    describe('GET /api/inscripciones', () => {
        it('devuelve 400 si alumno_id o clase_id no son números', async () => {
            const res = await request(app).get('/api/inscripciones?alumno_id=abc');

            expect(res.status).toBe(400);
        });
    });
});