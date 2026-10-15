export type EstadoClase = 'programada' | 'finalizada' | 'cancelada';

export interface Clase {
  id: number;
  nombre: string;
  profesor_id: number;
  inicio: Date | string;
  fin: Date | string;
  cupo: number;
  estado: EstadoClase;
}

export interface ClaseConProfesor extends Clase {
  profesor_nombre: string;
  profesor_especialidad: string;
}

export interface CrearClaseDTO {
  nombre: string;
  profesor_id: number;
  inicio: string;
  fin: string;
  cupo: number;
}