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

-- Semillas iniciales para demostración y desarrollo
INSERT INTO profesor (nombre, especialidad) 
VALUES 
  ('Martín Silva', 'Crossfit'),
  ('Laura Gómez', 'Spinning'),
  ('Carlos Benítez', 'Musculación')
ON CONFLICT DO NOTHING;