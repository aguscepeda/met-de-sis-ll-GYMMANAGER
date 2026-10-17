// Prueba de humo de inscripciones contra el servidor en marcha.
// Uso:  npm run dev   (en otra terminal)   y luego:   npm run probar:inscripciones
// Requiere los alumnos de sql/init.sql (ids 1 a 4 en una base nueva).
// Variables opcionales: BASE_URL, ALUMNOS=1,2,3,4  PROFESOR_ID=1

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const ALUMNOS = (process.env.ALUMNOS ?? '1,2,3,4').split(',').map(Number);
const PROFESOR_ID = Number(process.env.PROFESOR_ID ?? 1);

let fallos = 0;
function chequear(descripcion, ok, detalle = '') {
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${descripcion}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos++;
}

async function api(metodo, ruta, cuerpo) {
  const res = await fetch(BASE + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

const enHoras = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();

async function crearClase(nombre, cupo, inicioHoras, finHoras) {
  const r = await api('POST', '/api/clases', {
    nombre, profesor_id: PROFESOR_ID, cupo, inicio: enHoras(inicioHoras), fin: enHoras(finHoras),
  });
  if (r.status !== 201) throw new Error(`No se pudo crear la clase: ${JSON.stringify(r.data)}`);
  return r.data;
}

async function main() {
  console.log(`Probando contra ${BASE}\n`);

  // 1. Carrera por el último lugar: cupo 1, todos los alumnos a la vez.
  const clase = await crearClase('Prueba último lugar', 1, 24, 25);
  const respuestas = await Promise.all(
    ALUMNOS.map((alumno_id) => api('POST', '/api/inscripciones', { alumno_id, clase_id: clase.id })),
  );
  const creadas = respuestas.filter((r) => r.status === 201).length;
  const rechazadas = respuestas.filter((r) => r.status === 409).length;
  chequear(
    `${ALUMNOS.length} solicitudes simultáneas por 1 lugar: exactamente 1 inscripto`,
    creadas === 1 && rechazadas === ALUMNOS.length - 1,
    `201 x${creadas}, 409 x${rechazadas}`,
  );

  // 2. Duplicado.
  const ganador = respuestas.findIndex((r) => r.status === 201);
  const dup = await api('POST', '/api/inscripciones', { alumno_id: ALUMNOS[ganador], clase_id: clase.id });
  chequear('Inscripción duplicada devuelve 409', dup.status === 409, dup.data?.error);

  // 3. Cancelar libera el lugar y permite que otro (o el mismo) se anote.
  const inscripcionId = respuestas[ganador].data.id;
  const canc = await api('DELETE', `/api/inscripciones/${inscripcionId}`);
  chequear('Cancelar devuelve 200 y estado cancelada', canc.status === 200 && canc.data?.estado === 'cancelada');

  const canc2 = await api('DELETE', `/api/inscripciones/${inscripcionId}`);
  chequear('Cancelar dos veces devuelve 409', canc2.status === 409, canc2.data?.error);

  const reinsc = await api('POST', '/api/inscripciones', { alumno_id: ALUMNOS[ganador], clase_id: clase.id });
  chequear('Tras cancelar se puede volver a inscribir (201)', reinsc.status === 201);

  // 4. Clase ya iniciada (empezó hace 1 hora).
  const pasada = await crearClase('Prueba clase iniciada', 5, -1, 1);
  const enPasada = await api('POST', '/api/inscripciones', { alumno_id: ALUMNOS[0], clase_id: pasada.id });
  chequear('Inscribirse a una clase iniciada devuelve 409', enPasada.status === 409, enPasada.data?.error);

  // 5. Inexistentes e inválidos.
  const sinClase = await api('POST', '/api/inscripciones', { alumno_id: ALUMNOS[0], clase_id: 999999 });
  chequear('Clase inexistente devuelve 404', sinClase.status === 404);
  const sinAlumno = await api('POST', '/api/inscripciones', { alumno_id: 999999, clase_id: clase.id });
  chequear('Alumno inexistente devuelve 404', sinAlumno.status === 404);
  const invalido = await api('POST', '/api/inscripciones', { alumno_id: 'abc', clase_id: clase.id });
  chequear('Datos inválidos devuelven 400', invalido.status === 400);

  console.log(fallos === 0 ? '\nTodo correcto.' : `\n${fallos} verificación(es) fallaron.`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('No se pudo ejecutar la prueba:', e.message);
  process.exit(1);
});