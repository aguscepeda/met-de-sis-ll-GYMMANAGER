const sections = {
  alumnos: {
    title: 'Alumnos',
    description: 'Alumnos registrados en el gimnasio.',
    columns: ['Nombre', 'Apellido', 'Email', 'Teléfono'],
  },
  profesores: {
    title: 'Profesores',
    description: 'Profesores y sus especialidades.',
    columns: ['Nombre', 'Especialidad'],
  },
  clases: {
    title: 'Clases',
    description: 'Actividades y horarios del gimnasio.',
    columns: [
      'Clase', 'Profesor', 'Horario', 'Cupo máximo', 'Estado', 'Acciones',
    ],
  },
  inscripciones: {
    title: 'Inscripciones',
    description: 'Inscripciones e historial de cancelaciones.',
    columns: ['Alumno', 'Clase', 'Inicio', 'Estado', 'Acciones'],
  },
  clasesAsignadas: {
    title: 'Mis clases',
    description: 'Clases del profesor seleccionado para la demostración.',
    columns: ['Clase', 'Profesor', 'Horario', 'Cupo máximo', 'Estado'],
  },
  alumnosInscriptos: {
    title: 'Mis alumnos',
    description: 'Inscripciones activas en las clases del profesor seleccionado.',
    columns: ['Alumno', 'Clase', 'Inicio', 'Estado'],
  },
  clasesDisponibles: {
    title: 'Clases disponibles',
    description: 'Clases programadas que todavía no comenzaron.',
    columns: ['Clase', 'Profesor', 'Horario', 'Cupo máximo', 'Estado'],
  },
  misInscripciones: {
    title: 'Mis inscripciones',
    description: 'Inscripciones del alumno seleccionado para la demostración.',
    columns: ['Alumno', 'Clase', 'Inicio', 'Estado', 'Acciones'],
  },
};

const profiles = {
  recepcionista: {
    label: 'Recepcionista',
    sections: ['alumnos', 'profesores', 'clases', 'inscripciones'],
  },
  profesor: {
    label: 'Profesor',
    sections: ['clasesAsignadas', 'alumnosInscriptos'],
  },
  alumno: {
    label: 'Alumno',
    sections: ['clasesDisponibles', 'misInscripciones'],
  },
};

const role = new URLSearchParams(location.search).get('rol');
const $ = (selector) => document.querySelector(selector);

const navigation = $('#role-navigation');
const classForm = $('#class-form');
const classFormSection = $('#class-form-section');
const classFormMessage = $('#class-form-message');
const classActions = $('#class-actions');
const openClassFormButton = $('#open-class-form');
const saveClassButton = $('#save-class-button');
const tableBody = $('#table-body');
const listBadge = $('#list-title').parentElement.querySelector('.badge');
const listNote = $('.panel > .panel-note');

let activeSection = null;
let requestVersion = 0;
let professors = [];
let isSaving = false;
let referenceLoading = true;
let demoPersonId = '';
let actionPending = false;
let enrollmentPending = false;

let demoSelect;
let enrollmentPanel;
let enrollmentForm;
let enrollmentMessage;
let pageMessage;

function element(tag, text, className) {
  const node = document.createElement(tag);

  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;

  return node;
}

function setFormMessage(message, isError = false) {
  classFormMessage.textContent = message;
  classFormMessage.className =
    `form-message ${isError ? 'error' : 'success'}`;
}

function clearFormMessage() {
  classFormMessage.textContent = '';
  classFormMessage.className = 'form-message';
}

function setPageMessage(message, isError = false) {
  pageMessage.textContent = message;
  pageMessage.className =
    `form-message ${isError ? 'error' : 'success'}`;
}

async function api(path, options = {}) {
  const isRead = !options.method || options.method === 'GET';
  const controller = isRead ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), 10000)
    : null;

  let response;

  try {
    response = await fetch(path, {
      cache: 'no-store',
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch {
    throw new Error(
      isRead
        ? 'No se pudo consultar el servidor.'
        : 'No se pudo confirmar la operación. Actualizá el listado antes de volver a intentar.',
    );
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      isRead
        ? 'El servidor devolvió una respuesta inesperada.'
        : 'Respuesta inesperada. Actualizá el listado para comprobar el resultado de la operación.',
    );
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || 'No se pudo completar la operación.');
  }

  return data;
}

async function getList(path) {
  const data = await api(path);

  if (!Array.isArray(data)) {
    throw new Error('El servidor no devolvió un listado válido.');
  }

  return data;
}

function fillSelect(select, items, label, placeholder, selected = '') {
  const first = element('option', placeholder);
  first.value = '';

  const options = items.map((item) => {
    const option = element('option', label(item));
    option.value = String(item.id);
    return option;
  });

  select.replaceChildren(first, ...options);
  select.value = String(selected);
}

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha inválida';

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(date);
}

function studentName(student) {
  return `${student.nombre} ${student.apellido}`;
}

function enrollmentStudentName(item) {
  return `${item.alumno_nombre || ''} ${item.alumno_apellido || ''}`.trim()
    || `Alumno #${item.alumno_id}`;
}

function stateLabel(state) {
  return {
    programada: 'Programada',
    finalizada: 'Finalizada',
    cancelada: 'Cancelada',
    activa: 'Activa',
  }[state] || state || '—';
}

function tableMessage(message) {
  const row = element('tr');
  const cell = element('td', message, 'empty-state');

  cell.colSpan = sections[activeSection].columns.length;
  row.append(cell);
  tableBody.replaceChildren(row);
}

function renderRows(rows) {
  if (rows.length === 0) {
    tableMessage('No hay registros para mostrar.');
    return;
  }

  const nodes = rows.map((values) => {
    const row = element('tr');

    values.forEach((value) => {
      const cell = element('td');

      if (value instanceof Node) {
        cell.append(value);
      } else {
        cell.textContent = String(value ?? '—');
      }

      row.append(cell);
    });

    return row;
  });

  tableBody.replaceChildren(...nodes);
}

function actionButton(text, callback, disabled = false) {
  const button = element('button', text, 'button-secondary');
  button.type = 'button';
  button.disabled = disabled;
  button.addEventListener('click', callback);
  return button;
}

function renderClassRows(classes) {
  const rows = classes.map((item) => {
    const values = [
      item.nombre,
      item.profesor_nombre || `Profesor #${item.profesor_id}`,
      `${formatDate(item.inicio)} — ${formatDate(item.fin)}`,
      item.cupo,
      stateLabel(item.estado),
    ];

    if (activeSection === 'clases' && role === 'recepcionista') {
      const actions = element('div');
      actions.style.display = 'flex';
      actions.style.flexWrap = 'wrap';
      actions.style.gap = '8px';

      const now = Date.now();
      const programmed = item.estado === 'programada';

      actions.append(
        actionButton(
          'Finalizar',
          () => changeClassState(item, 'finalizar'),
          actionPending || !programmed ||
            new Date(item.fin).getTime() > now,
        ),
        actionButton(
          'Cancelar',
          () => changeClassState(item, 'cancelar'),
          actionPending || !programmed ||
            new Date(item.inicio).getTime() <= now,
        ),
      );

      values.push(actions);
    }

    return values;
  });

  renderRows(rows);
}

function renderEnrollmentRows(items) {
  const showActions = activeSection !== 'alumnosInscriptos';

  renderRows(items.map((item) => {
    const values = [
      enrollmentStudentName(item),
      item.clase_nombre || `Clase #${item.clase_id}`,
      formatDate(item.clase_inicio),
      stateLabel(item.estado),
    ];

    if (showActions) {
      values.push(
        actionButton(
          'Cancelar inscripción',
          () => cancelEnrollment(item),
          actionPending ||
            item.estado !== 'activa' ||
            new Date(item.clase_inicio).getTime() <= Date.now(),
        ),
      );
    }

    return values;
  }));
}

function buildAdditionalUI() {
  const toolbar = element('div', undefined, 'class-actions');
  toolbar.style.display = 'flex';
  toolbar.style.flexWrap = 'wrap';
  toolbar.style.alignItems = 'center';
  toolbar.style.gap = '12px';

  if (role !== 'recepcionista') {
    const label = element(
      'label',
      role === 'profesor'
        ? 'Profesor de demostración'
        : 'Alumno de demostración',
    );

    label.htmlFor = 'demo-person';

    demoSelect = element('select');
    demoSelect.id = 'demo-person';
    demoSelect.disabled = true;
    demoSelect.style.padding = '10px';

    fillSelect(demoSelect, [], () => '', 'Cargando…');

    demoSelect.addEventListener('change', () => {
      demoPersonId = demoSelect.value;
      syncProfessorSelection();
      showSection(activeSection);
    });

    toolbar.append(label, demoSelect);
  }

  const refresh = actionButton('Actualizar listado', () => {
    setPageMessage('');
    refreshTable();
  });

  toolbar.append(refresh);

  pageMessage = element('p', '', 'form-message');
  pageMessage.setAttribute('role', 'status');

  const panel = $('.panel');
  panel.before(toolbar, pageMessage);

  enrollmentPanel = element('section', undefined, 'form-panel');
  enrollmentPanel.hidden = true;

  // HTML fijo del formulario; los datos de la API se agregan con textContent.
  enrollmentPanel.innerHTML = `
    <div class="panel-heading">
      <h2>Nueva inscripción</h2>
    </div>

    <form id="enrollment-form" style="padding: 0 24px 24px">
      <div class="form-grid">
        <div id="enrollment-student-field" class="form-field">
          <label for="enrollment-student">Alumno</label>
          <select id="enrollment-student" required disabled>
            <option value="">Cargando alumnos…</option>
          </select>
        </div>

        <div class="form-field">
          <label for="enrollment-class">Clase</label>
          <select id="enrollment-class" required disabled>
            <option value="">Cargando clases…</option>
          </select>
        </div>
      </div>

      <p class="field-help">
        El servidor comprueba el cupo y evita inscripciones duplicadas.
      </p>

      <div class="form-buttons">
        <button id="enrollment-save" class="button-primary"
          type="submit" disabled>
          Inscribir
        </button>
      </div>

      <p id="enrollment-message" class="form-message"
        role="status"></p>
    </form>
  `;

  panel.before(enrollmentPanel);

  enrollmentForm = $('#enrollment-form');
  enrollmentMessage = $('#enrollment-message');

  enrollmentForm.addEventListener('submit', saveEnrollment);
  enrollmentForm.addEventListener('input', () => {
    if (!enrollmentPending) enrollmentMessage.textContent = '';
  });

  $('#enrollment-student-field').hidden = role === 'alumno';
  $('#enrollment-student').required = role === 'recepcionista';
}

async function loadReferenceData() {
  referenceLoading = true;

  try {
    const studentsPromise = role === 'alumno'
      ? getList('/api/alumnos')
      : Promise.resolve([]);

    const [professorData, students] = await Promise.all([
      getList('/api/profesores'),
      studentsPromise,
    ]);

    professors = professorData;

    fillSelect(
      $('#class-professor'),
      professors,
      (item) => `${item.nombre} — ${item.especialidad}`,
      professors.length
        ? 'Seleccioná un profesor'
        : 'No hay profesores registrados',
    );

    if (demoSelect) {
      const people = role === 'profesor' ? professors : students;

      fillSelect(
        demoSelect,
        people,
        role === 'profesor' ? (item) => item.nombre : studentName,
        people.length ? 'Seleccioná una persona' : 'No hay registros',
      );

      demoSelect.disabled = people.length === 0;
    }

    $('#save-note').textContent = professors.length
      ? 'El guardado se realiza mediante la API.'
      : 'Necesitás un profesor registrado para crear clases.';
  } catch (error) {
    setPageMessage(error.message + ' Recargá la página para reintentar.', true);
    $('#save-note').textContent = 'No se pudo cargar el listado de profesores.';
  } finally {
    referenceLoading = false;
    syncProfessorSelection();
  }
}

function syncProfessorSelection() {
  const select = $('#class-professor');

  if (role === 'profesor') {
    select.value = demoPersonId;
    select.disabled = true;
  } else {
    select.disabled = referenceLoading || professors.length === 0;
    select.required = true;
  }

  if (saveClassButton) {
    saveClassButton.disabled =
      isSaving ||
      referenceLoading ||
      professors.length === 0 ||
      (role === 'profesor' && !demoPersonId);
  }
}

function showSection(sectionName) {
  if (!profiles[role]?.sections.includes(sectionName)) return;

  activeSection = sectionName;

  // Invalida cualquier respuesta de la sección anterior.
  requestVersion++;

  const section = sections[sectionName];

  $('#section-title').textContent = section.title;
  $('#section-description').textContent = section.description;
  $('#list-title').textContent = section.title;
  $('#table-caption').textContent = section.title;

  navigation.querySelectorAll('button').forEach((button) => {
    const selected = button.dataset.section === sectionName;

    button.classList.toggle('active', selected);

    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  const canCreate =
    (role === 'recepcionista' && sectionName === 'clases') ||
    (role === 'profesor' && sectionName === 'clasesAsignadas');

  classActions.hidden = !canCreate;
  setClassFormVisibility(false);

  const canEnroll =
    (role === 'recepcionista' && sectionName === 'inscripciones') ||
    (role === 'alumno' && sectionName === 'clasesDisponibles');

  enrollmentPanel.hidden = !canEnroll;
  enrollmentMessage.textContent = '';

  const headerRow = element('tr');

  section.columns.forEach((name) => {
    const heading = element('th', name);
    heading.scope = 'col';
    headerRow.append(heading);
  });

  $('#table-head').replaceChildren(headerRow);

  refreshTable();
}

async function refreshTable() {
  const sectionName = activeSection;
  const version = ++requestVersion;
  const selectedPerson = demoPersonId;

  const isCurrent = () =>
    version === requestVersion && activeSection === sectionName;

  const needsPerson = [
    'clasesAsignadas',
    'alumnosInscriptos',
    'clasesDisponibles',
    'misInscripciones',
  ].includes(sectionName);

  if (needsPerson && !selectedPerson) {
    tableMessage('Seleccioná una persona de demostración para continuar.');
    if (listBadge) listBadge.textContent = 'Seleccioná un perfil';
    if (listNote) {
      listNote.textContent =
        'La selección es de demostración; no representa autenticación.';
    }

    $('#enrollment-save').disabled = true;
    $('#enrollment-class').disabled = true;
    return;
  }

  tableMessage('Cargando…');
  if (listBadge) listBadge.textContent = 'Cargando…';

  const canEnroll = !enrollmentPanel.hidden;
  const classSelect = $('#enrollment-class');
  const studentSelect = $('#enrollment-student');

  if (canEnroll) {
    classSelect.disabled = true;
    $('#enrollment-save').disabled = true;

    if (role === 'recepcionista') studentSelect.disabled = true;
  }

  try {
    let data;
    let classesForEnrollment = null;
    let studentsForEnrollment = null;

    switch (sectionName) {
      case 'alumnos':
        data = await getList('/api/alumnos');
        break;

      case 'profesores':
        data = await getList('/api/profesores');
        break;

      case 'clases':
        data = await getList('/api/clases');
        break;

      case 'clasesAsignadas':
        data = await getList(
          `/api/clases?profesor_id=${encodeURIComponent(selectedPerson)}`,
        );
        break;

      case 'clasesDisponibles': {
        const classes = await getList('/api/clases');

        data = classes.filter((item) =>
          item.estado === 'programada' &&
          new Date(item.inicio).getTime() > Date.now(),
        );

        classesForEnrollment = data;
        break;
      }

      case 'inscripciones': {
        const results = await Promise.all([
          getList('/api/inscripciones'),
          getList('/api/clases'),
          getList('/api/alumnos'),
        ]);

        data = results[0];
        classesForEnrollment = results[1];
        studentsForEnrollment = results[2];
        break;
      }

      case 'misInscripciones':
        data = await getList(
          `/api/inscripciones?alumno_id=${encodeURIComponent(selectedPerson)}`,
        );
        break;

      case 'alumnosInscriptos': {
        const [ownClasses, enrollments] = await Promise.all([
          getList(
            `/api/clases?profesor_id=${encodeURIComponent(selectedPerson)}`,
          ),
          getList('/api/inscripciones?estado=activa'),
        ]);

        const ownIds = new Set(ownClasses.map((item) => Number(item.id)));

        data = enrollments.filter((item) =>
          ownIds.has(Number(item.clase_id)),
        );
        break;
      }
    }

    if (!isCurrent()) return;

    if (sectionName === 'alumnos') {
      renderRows(data.map((item) => [
        item.nombre, item.apellido, item.email, item.telefono || '—',
      ]));
    } else if (sectionName === 'profesores') {
      renderRows(data.map((item) => [item.nombre, item.especialidad]));
    } else if ([
      'clases', 'clasesAsignadas', 'clasesDisponibles',
    ].includes(sectionName)) {
      renderClassRows(data);
    } else {
      renderEnrollmentRows(data);
    }

    if (listBadge) listBadge.textContent = `${data.length} registros`;

    if (listNote) {
      listNote.textContent =
        'Datos de la API. Horarios en hora argentina. El cupo máximo no indica lugares disponibles. Perfiles de demostración.';
    }

    if (canEnroll && classesForEnrollment) {
      const available = classesForEnrollment.filter((item) =>
        item.estado === 'programada' &&
        new Date(item.inicio).getTime() > Date.now(),
      );

      fillSelect(
        classSelect,
        available,
        (item) => `${item.nombre} · ${formatDate(item.inicio)}`,
        available.length
          ? 'Seleccioná una clase'
          : 'No hay clases futuras disponibles',
        classSelect.value,
      );

      classSelect.disabled = enrollmentPending || available.length === 0;

      let studentAvailable = Boolean(selectedPerson);

      if (role === 'recepcionista') {
        fillSelect(
          studentSelect,
          studentsForEnrollment,
          studentName,
          studentsForEnrollment.length
            ? 'Seleccioná un alumno'
            : 'No hay alumnos registrados',
          studentSelect.value,
        );

        studentAvailable = studentsForEnrollment.length > 0;
        studentSelect.disabled = enrollmentPending || !studentAvailable;
      }

      $('#enrollment-save').disabled =
        enrollmentPending || !studentAvailable || available.length === 0;
    }
  } catch (error) {
    if (!isCurrent()) return;

    tableMessage(error.message);
    if (listBadge) listBadge.textContent = 'Error';
    if (listNote) listNote.textContent = 'Presioná Actualizar listado para reintentar.';
  }
}

async function runAction(path, method, confirmation, successMessage) {
  if (actionPending || !window.confirm(confirmation)) return;

  actionPending = true;
  setPageMessage('');

  try {
    await api(path, { method });
    setPageMessage(successMessage);
  } catch (error) {
    setPageMessage(error.message, true);
  } finally {
    actionPending = false;
    await refreshTable();
  }
}

function changeClassState(item, action) {
  return runAction(
    `/api/clases/${item.id}/${action}`,
    'PATCH',
    action === 'cancelar'
      ? `¿Cancelar "${item.nombre}" y sus inscripciones activas?`
      : `¿Marcar "${item.nombre}" como finalizada?`,
    action === 'cancelar'
      ? 'Clase cancelada.'
      : 'Clase finalizada.',
  );
}

function cancelEnrollment(item) {
  return runAction(
    `/api/inscripciones/${item.id}`,
    'DELETE',
    `¿Cancelar la inscripción de ${enrollmentStudentName(item)} a "${item.clase_nombre}"?`,
    'Inscripción cancelada.',
  );
}

async function saveEnrollment(event) {
  event.preventDefault();

  if (enrollmentPending || !enrollmentForm.reportValidity()) return;

  const alumnoId = Number(
    role === 'alumno' ? demoPersonId : $('#enrollment-student').value,
  );
  const claseId = Number($('#enrollment-class').value);

  if (
    !Number.isSafeInteger(alumnoId) || alumnoId <= 0 ||
    !Number.isSafeInteger(claseId) || claseId <= 0
  ) {
    enrollmentMessage.textContent = 'Seleccioná un alumno y una clase válidos.';
    enrollmentMessage.className = 'form-message error';
    return;
  }

  enrollmentPending = true;
  $('#enrollment-save').disabled = true;
  $('#enrollment-student').disabled = true;
  $('#enrollment-class').disabled = true;
  enrollmentMessage.textContent = 'Inscribiendo…';

  try {
    await api('/api/inscripciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alumno_id: alumnoId,
        clase_id: claseId,
      }),
    });

    enrollmentMessage.textContent = 'Inscripción guardada correctamente.';
    enrollmentMessage.className = 'form-message success';
  } catch (error) {
    enrollmentMessage.textContent = error.message;
    enrollmentMessage.className = 'form-message error';
  } finally {
    enrollmentPending = false;
    await refreshTable();
  }
}

function setClassFormVisibility(visible) {
  classFormSection.hidden = !visible;
  openClassFormButton.setAttribute('aria-expanded', String(visible));
}

function configureClassForm() {
  $('#professor-field').hidden = false;
  $('#professor-note').textContent =
    'En esta demostración, la identidad seleccionada no constituye un permiso real.';

  openClassFormButton.addEventListener('click', () => {
    if (!isSaving) clearFormMessage();
    setClassFormVisibility(true);
    $('#class-name').focus();
  });

  $('#close-class-form').addEventListener('click', () => {
    setClassFormVisibility(false);
    openClassFormButton.focus();
  });

  classForm.addEventListener('input', () => {
    if (!isSaving) clearFormMessage();
  });

  classForm.addEventListener('invalid', clearFormMessage, true);
  classForm.addEventListener('submit', handleClassValidation);

  if (saveClassButton) {
    saveClassButton.addEventListener('click', saveClass);
  }
}

function readClassForm() {
  const values = new FormData(classForm);

  return {
    nombre: String(values.get('nombre') || '').trim(),
    inicio: String(values.get('inicio') || ''),
    fin: String(values.get('fin') || ''),
    cupo: Number(values.get('cupo')),
  };
}

function validateClassData(data) {
  if (!data.nombre) {
    return {
      field: '#class-name',
      message: 'Ingresá un nombre que no esté compuesto solo por espacios.',
    };
  }

  const start = new Date(data.inicio).getTime();
  const end = new Date(data.fin).getTime();

  if (!Number.isFinite(start) || start <= Date.now()) {
    return {
      field: '#class-start',
      message: 'El inicio debe ser una fecha y hora futuras.',
    };
  }

  if (!Number.isFinite(end) || end <= start) {
    return {
      field: '#class-end',
      message: 'La fecha y hora de fin deben ser posteriores al inicio.',
    };
  }

  if (!Number.isSafeInteger(data.cupo) || data.cupo <= 0) {
    return {
      field: '#class-capacity',
      message: 'El cupo debe ser un número entero mayor que cero.',
    };
  }

  return null;
}

function readValidatedClassData() {
  if (!classForm.reportValidity()) return null;

  const data = readClassForm();
  const error = validateClassData(data);

  if (error) {
    setFormMessage(error.message, true);
    $(error.field).focus();
    return null;
  }

  return data;
}

function handleClassValidation(event) {
  event.preventDefault();
  if (isSaving) return;

  clearFormMessage();

  if (readValidatedClassData()) {
    setFormMessage(
      'Nombre, horario y cupo válidos. Guardar clase enviará los datos al servidor.',
    );
  }
}

function buildClassPayload() {
  const data = readValidatedClassData();
  if (!data) return null;

  const professorId = Number(
    role === 'profesor' ? demoPersonId : $('#class-professor').value,
  );

  if (!Number.isSafeInteger(professorId) || professorId <= 0) {
    setFormMessage('Seleccioná un profesor válido.', true);
    return null;
  }

  return {
    nombre: data.nombre,
    profesor_id: professorId,
    inicio: new Date(data.inicio).toISOString(),
    fin: new Date(data.fin).toISOString(),
    cupo: data.cupo,
  };
}

async function createClass(payload) {
  return api('/api/clases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function saveClass() {
  if (isSaving || referenceLoading || !saveClassButton) return;

  clearFormMessage();

  const payload = buildClassPayload();
  if (!payload) return;

  const inputs = [...classForm.querySelectorAll('input, select, button')];
  const previousDisabled = inputs.map((input) => input.disabled);

  isSaving = true;
  inputs.forEach((input) => { input.disabled = true; });
  saveClassButton.textContent = 'Guardando…';

  try {
    const created = await createClass(payload);
    classForm.reset();

    setFormMessage(
      `Clase "${created.nombre}" guardada correctamente. ID: ${created.id}.`,
    );

    await refreshTable();
  } catch (error) {
    setFormMessage(error.message, true);
  } finally {
    inputs.forEach((input, index) => {
      input.disabled = previousDisabled[index];
    });

    isSaving = false;
    saveClassButton.textContent = 'Guardar clase';
    syncProfessorSelection();
  }
}

async function checkConnection() {
  const button = $('#check-connection');
  const status = $('#connection-status');

  button.disabled = true;
  status.className = '';
  status.textContent = 'Comprobando conexión…';

  try {
    const data = await api('/health');

    if (data.status !== 'ok') throw new Error();

    status.textContent = 'Servidor y base de datos conectados.';
    status.className = 'success';
  } catch {
    status.textContent =
      'No se pudo confirmar la conexión con el servidor y PostgreSQL.';
    status.className = 'error';
  } finally {
    button.disabled = false;
  }
}

function initializePanel() {
  if (!Object.hasOwn(profiles, role)) {
    location.replace('/');
    return;
  }

  const profile = profiles[role];

  $('#profile-label').textContent = `${profile.label} · Demo`;
  document.title = `GymManager | ${profile.label}`;

  navigation.replaceChildren(...profile.sections.map((sectionName) => {
    const button = element('button', sections[sectionName].title, 'nav-button');
    button.type = 'button';
    button.dataset.section = sectionName;
    button.addEventListener('click', () => {
      setPageMessage('');
      showSection(sectionName);
    });
    return button;
  }));

  buildAdditionalUI();
  configureClassForm();
  showSection(profile.sections[0]);
  loadReferenceData();

  $('#check-connection').addEventListener('click', checkConnection);
  checkConnection();
}

initializePanel();