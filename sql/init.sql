CREATE TABLE IF NOT EXISTS profesor (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  especialidad VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS alumno (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  telefono VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS clase (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  profesor_id INT NOT NULL REFERENCES profesor(id) ON DELETE RESTRICT,
  inicio TIMESTAMP NOT NULL,
  fin TIMESTAMP NOT NULL,
  cupo INT NOT NULL CHECK (cupo > 0),
  estado VARCHAR(20) NOT NULL DEFAULT 'programada' CHECK (estado IN ('programada', 'finalizada', 'cancelada'))
);

CREATE TABLE IF NOT EXISTS inscripcion (
  id SERIAL PRIMARY KEY,
  alumno_id INT NOT NULL REFERENCES alumno(id) ON DELETE RESTRICT,
  clase_id INT NOT NULL REFERENCES clase(id) ON DELETE RESTRICT,
  fecha TIMESTAMP NOT NULL DEFAULT NOW(),
  estado VARCHAR(20) NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'cancelada')),
  cancelada_en TIMESTAMP
);

-- Un alumno no puede tener dos inscripciones ACTIVAS a la misma clase.
-- Índice parcial: las canceladas quedan como historial y no impiden volver a anotarse.
CREATE UNIQUE INDEX IF NOT EXISTS ux_inscripcion_activa_alumno_clase
  ON inscripcion (alumno_id, clase_id)
  WHERE estado = 'activa';

-- Acelera el conteo de cupo ocupado por clase.
CREATE INDEX IF NOT EXISTS ix_inscripcion_clase_estado
  ON inscripcion (clase_id, estado);

-- Semillas iniciales para demostración y desarrollo (idempotentes: se pueden re-ejecutar)
INSERT INTO profesor (nombre, especialidad)
SELECT v.nombre, v.especialidad
FROM (VALUES
  ('Martín Silva', 'Crossfit'),
  ('Laura Gómez', 'Spinning'),
  ('Carlos Benítez', 'Musculación')
) AS v(nombre, especialidad)
WHERE NOT EXISTS (
  SELECT 1 FROM profesor p
  WHERE p.nombre = v.nombre AND p.especialidad = v.especialidad
);

INSERT INTO alumno (nombre, apellido, email, telefono)
VALUES
  ('Ana', 'Pérez', 'ana.perez@example.com', '1155550001'),
  ('Bruno', 'Díaz', 'bruno.diaz@example.com', '1155550002'),
  ('Camila', 'Ruiz', 'camila.ruiz@example.com', '1155550003'),
  ('Diego', 'Torres', 'diego.torres@example.com', '1155550004')
ON CONFLICT (email) DO NOTHING;