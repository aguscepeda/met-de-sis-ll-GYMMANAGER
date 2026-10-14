const sections = {
  alumnos: {
    title: 'Alumnos',
    description: 'Consultá los alumnos registrados en el gimnasio.',
    listTitle: 'Listado de alumnos',
    columns: ['Nombre', 'Apellido', 'Email', 'Teléfono'],
  },
  profesores: {
    title: 'Profesores',
    description: 'Consultá los profesores y sus especialidades.',
    listTitle: 'Listado de profesores',
    columns: ['Nombre', 'Especialidad'],
  },
  clases: {
    title: 'Clases',
    description: 'Organizá las actividades y los horarios del gimnasio.',
    listTitle: 'Listado de clases',
    columns: ['Clase', 'Profesor', 'Horario', 'Cupo'],
  },
  inscripciones: {
    title: 'Inscripciones',
    description: 'Consultá las inscripciones del gimnasio.',
    listTitle: 'Listado de inscripciones',
    columns: ['Alumno', 'Clase', 'Fecha'],
  },
  clasesAsignadas: {
    title: 'Mis clases',
    description: 'Consultá las actividades que tenés asignadas.',
    listTitle: 'Clases asignadas',
    columns: ['Clase', 'Horario', 'Cupo'],
  },
  alumnosInscriptos: {
    title: 'Mis alumnos',
    description: 'Consultá los alumnos inscriptos en tus clases.',
    listTitle: 'Alumnos por clase',
    columns: ['Clase', 'Nombre', 'Apellido'],
  },
  clasesDisponibles: {
    title: 'Clases disponibles',
    description: 'Explorá las actividades del gimnasio.',
    listTitle: 'Oferta de clases',
    columns: ['Clase', 'Profesor', 'Horario', 'Cupo'],
  },
  misInscripciones: {
    title: 'Mis inscripciones',
    description: 'Consultá las clases en las que estás inscripto.',
    listTitle: 'Mis inscripciones',
    columns: ['Clase', 'Horario', 'Fecha de inscripción'],
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

const role = new URLSearchParams(window.location.search).get('rol');

const navigation = document.querySelector('#role-navigation');
const connectionStatus = document.querySelector('#connection-status');
const checkConnectionButton = document.querySelector('#check-connection');

const classActions = document.querySelector('#class-actions');
const classFormSection = document.querySelector('#class-form-section');
const classForm = document.querySelector('#class-form');
const classFormMessage = document.querySelector('#class-form-message');
const openClassFormButton = document.querySelector('#open-class-form');

function initializePanel() {
  if (!Object.hasOwn(profiles, role)) {
    window.location.replace('/');
    return;
  }

  const profile = profiles[role];

  document.querySelector('#profile-label').textContent =
    `${profile.label} · Demo`;

  document.title = `GymManager | ${profile.label}`;

  const buttons = profile.sections.map((sectionName) => {
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'nav-button';
    button.dataset.section = sectionName;
    button.textContent = sections[sectionName].title;

    button.addEventListener('click', () => showSection(sectionName));

    return button;
  });

  navigation.replaceChildren(...buttons);

  configureClassForm();
  showSection(profile.sections[0]);

  checkConnectionButton.addEventListener('click', checkConnection);
  checkConnection();
}

function showSection(sectionName) {
  const profile = profiles[role];

  if (!profile || !profile.sections.includes(sectionName)) return;

  const section = sections[sectionName];

  document.querySelector('#section-title').textContent = section.title;
  document.querySelector('#section-description').textContent =
    section.description;
  document.querySelector('#list-title').textContent = section.listTitle;
  document.querySelector('#table-caption').textContent = section.listTitle;

  navigation.querySelectorAll('button').forEach((button) => {
    const isActive = button.dataset.section === sectionName;

    button.classList.toggle('active', isActive);

    if (isActive) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });

  const canCreateHere =
    (role === 'recepcionista' && sectionName === 'clases') ||
    (role === 'profesor' && sectionName === 'clasesAsignadas');

  classActions.hidden = !canCreateHere;
  setClassFormVisibility(false);

  renderEmptyTable(section);
}

function renderEmptyTable(section) {
  const headerRow = document.createElement('tr');

  section.columns.forEach((column) => {
    const heading = document.createElement('th');

    heading.scope = 'col';
    heading.textContent = column;
    headerRow.append(heading);
  });

  document.querySelector('#table-head').replaceChildren(headerRow);

  const row = document.createElement('tr');
  const cell = document.createElement('td');
  const title = document.createElement('strong');
  const description = document.createElement('p');

  cell.colSpan = section.columns.length;
  cell.className = 'empty-state';

  title.textContent = 'Sección en preparación';
  description.textContent =
    'Las funciones estarán disponibles al conectar esta sección con la API.';

  cell.append(title, description);
  row.append(cell);

  document.querySelector('#table-body').replaceChildren(row);
}

function setClassFormVisibility(isVisible) {
  classFormSection.hidden = !isVisible;
  openClassFormButton.setAttribute('aria-expanded', String(isVisible));
}

function clearFormMessage() {
  classFormMessage.textContent = '';
  classFormMessage.className = 'form-message';
}

function configureClassForm() {
  document.querySelector('#professor-field').hidden =
    role !== 'recepcionista';

  document.querySelector('#professor-note').textContent =
    role === 'recepcionista'
      ? 'La selección de profesor se habilitará al cargar el listado desde la API.'
      : 'La clase se asociará al profesor identificado por el sistema. El acceso actual todavía no identifica una cuenta.';

  openClassFormButton.addEventListener('click', () => {
    clearFormMessage();
    setClassFormVisibility(true);
    document.querySelector('#class-name').focus();
  });

  document.querySelector('#close-class-form').addEventListener('click', () => {
    setClassFormVisibility(false);
    openClassFormButton.focus();
  });

  classForm.addEventListener('input', clearFormMessage);
  classForm.addEventListener('change', clearFormMessage);

  // Borra un mensaje anterior si el navegador detecta un campo inválido.
  classForm.addEventListener('invalid', clearFormMessage, true);

  classForm.addEventListener('submit', handleClassValidation);
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

function handleClassValidation(event) {
  event.preventDefault();
  clearFormMessage();

  if (!classForm.reportValidity()) return;

  const data = readClassForm();
  const error = validateClassData(data);

  if (error) {
    classFormMessage.textContent = error.message;
    classFormMessage.className = 'form-message error';
    document.querySelector(error.field).focus();
    return;
  }

  classFormMessage.textContent =
    'Nombre, horario y cupo válidos. La clase no se guardó: falta conectar la API y resolver la identidad o selección del profesor.';
  classFormMessage.className = 'form-message success';
}

async function checkConnection() {
  checkConnectionButton.disabled = true;
  connectionStatus.className = '';
  connectionStatus.textContent = 'Comprobando conexión…';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch('/health', {
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('La API devolvió un error.');
    }

    const data = await response.json();

    if (data.status !== 'ok') {
      throw new Error('El estado del sistema no es correcto.');
    }

    connectionStatus.textContent =
      'Servidor y base de datos conectados.';
    connectionStatus.className = 'success';
  } catch {
    connectionStatus.textContent =
      'No se pudo confirmar la conexión. Revisá el servidor y PostgreSQL.';
    connectionStatus.className = 'error';
  } finally {
    clearTimeout(timeout);
    checkConnectionButton.disabled = false;
  }
}

initializePanel();