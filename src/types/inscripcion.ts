export type EstadoInscripcion = 'activa' | 'cancelada';

export interface Inscripcion {
    id: number;
    alumno_id: number;
    clase_id: number;
    fecha: Date | string;
    estado: EstadoInscripcion;
    cancelada_en: Date | string | null;
}

export interface CrearInscripcionDTO {
    alumno_id: number;
    clase_id: number;
}