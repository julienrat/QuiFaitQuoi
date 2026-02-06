const basePath = window.location.pathname.replace(/\/public\/.*$/, '');
const apiBase = window.location.origin === 'null'
  ? `${basePath}/api/index.php`
  : new URL(`${basePath}/api/index.php`, window.location.origin).toString();
const params = new URLSearchParams(window.location.search);
const token = params.get('token');

const storageKey = token ? `gbv2_${token}` : null;
let state = {
  volunteer_id: null,
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  task_ids: [],
  task_comments: {},
};
let currentEvent = null;
let tasksCache = [];

function loadLocal() {
  if (!storageKey) return;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const data = JSON.parse(raw);
      state = { ...state, ...data };
    }
  } catch (_) {}
}

function saveLocal() {
  if (!storageKey) return;
  localStorage.setItem(storageKey, JSON.stringify(state));
}

async function api(action, method = 'GET', data = null, query = null) {
  const url = new URL(apiBase);
  url.searchParams.set('action', action);
  if (query) {
    Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (data) {
    options.body = JSON.stringify(data);
  }
  const res = await fetch(url.toString(), options);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Erreur serveur');
  }
  return json;
}

function setMessage(id, msg, isError = false) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.color = isError ? '#a63d40' : '#6b6257';
}

function fillForm() {
  document.getElementById('firstName').value = state.first_name || '';
  document.getElementById('lastName').value = state.last_name || '';
  document.getElementById('email').value = state.email || '';
  document.getElementById('phone').value = formatPhone(state.phone || '');
}

function readForm() {
  state.first_name = document.getElementById('firstName').value.trim();
  state.last_name = document.getElementById('lastName').value.trim();
  state.email = document.getElementById('email').value.trim();
  state.phone = formatPhone(document.getElementById('phone').value.trim());
}

function renderTasks(tasks) {
  const grid = document.getElementById('taskGrid');
  grid.innerHTML = '';
  if (tasks.length === 0) {
    grid.innerHTML = '<div class="notice">Aucune tâche disponible.</div>';
    return;
  }

  tasks.forEach((task) => {
    const isSelected = state.task_ids.includes(task.id);
    const alreadyAssigned = state.volunteer_id
      ? (task.assigned || []).some((a) => a.volunteer_id === state.volunteer_id)
      : false;
    let delta = 0;
    if (state.volunteer_id) {
      if (isSelected && !alreadyAssigned) delta = -1;
      if (!isSelected && alreadyAssigned) delta = 1;
    }
    const displayRemaining = Math.max(task.remaining + delta, 0);
    const isFull = displayRemaining <= 0 && !isSelected;
    const card = document.createElement('div');
    card.className = 'card task-card';
    card.style.borderColor = isSelected ? '#d66b2f' : '#e3d9cc';
    card.style.opacity = isFull ? '0.6' : '1';
    const commentValue = state.task_comments[task.id] || '';
    card.innerHTML = `
      <div class="task-check">
        <input type="checkbox" aria-label="Je m'inscris" data-task-checkbox="${task.id}" ${isSelected ? 'checked' : ''} ${isFull ? 'disabled' : ''}/>
      </div>
      <div>
        <header>
          <div>
            <h3>${task.title}</h3>
            <p>${task.description || 'Sans description'}</p>
            <span class="badge">${displayRemaining} restant(s)</span>
          </div>
        </header>
        <p class="muted">${task.start_at ? new Date(task.start_at).toLocaleString() : 'Date à définir'}${task.end_at ? ' → ' + new Date(task.end_at).toLocaleString() : ''}</p>
        <label style="margin-top:8px; display:block;">Commentaire pour cette tâche</label>
        <textarea data-task-comment="${task.id}" placeholder="Ex: dispo 2h, besoin de matériel..." ${isSelected ? '' : 'disabled'}>${commentValue}</textarea>
        <div style="margin-top:8px; font-weight:700;">Liste des participants</div>
        <div class="muted" style="margin-top:8px;">
          ${task.assigned && task.assigned.length ? task.assigned.map(a => `<strong>${a.first_name} ${a.last_name}</strong>${a.comment ? ' - ' + a.comment : ''}`).join('<br>') : 'Personne inscrit pour le moment'}
        </div>
      </div>
    `;

    grid.appendChild(card);
  });

  grid.querySelectorAll('input[data-task-checkbox]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const taskId = Number(e.target.dataset.taskCheckbox);
      const checked = e.target.checked;
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;
      const isSelected = state.task_ids.includes(taskId);
      const alreadyAssigned = state.volunteer_id
        ? (task.assigned || []).some((a) => a.volunteer_id === state.volunteer_id)
        : false;
      let delta = 0;
      if (state.volunteer_id) {
        if (isSelected && !alreadyAssigned) delta = -1;
        if (!isSelected && alreadyAssigned) delta = 1;
      }
      const displayRemaining = Math.max(task.remaining + delta, 0);
      if (displayRemaining <= 0 && checked) {
        setMessage('taskMsg', 'Cette tâche est complète.', true);
        e.target.checked = false;
        return;
      }
      if (!state.volunteer_id) {
        setMessage('taskMsg', 'Enregistrez d’abord vos coordonnées.', true);
        e.target.checked = false;
        return;
      }
      if (checked) {
        if (!state.task_ids.includes(taskId)) {
          state.task_ids.push(taskId);
        }
      } else {
        state.task_ids = state.task_ids.filter((id) => id !== taskId);
      }
      saveLocal();
      renderTasks(tasks);
    });
  });

  grid.querySelectorAll('textarea[data-task-comment]').forEach((textarea) => {
    textarea.addEventListener('input', (e) => {
      const taskId = Number(e.target.dataset.taskComment);
      state.task_comments[taskId] = e.target.value;
      saveLocal();
    });
  });
}

async function loadEvent() {
  if (!token) {
    document.getElementById('eventTitle').textContent = 'Lien invalide';
    return;
  }
  const res = await api('get_event_public', 'GET', null, { token });
  const ev = res.event;
  currentEvent = ev;
  document.body.setAttribute('data-theme', ev.theme || 'sand');
  document.getElementById('eventTitle').textContent = ev.title;
  const meta = [ev.location, ev.start_at ? new Date(ev.start_at).toLocaleString() : null]
    .filter(Boolean)
    .join(' · ');
  document.getElementById('eventMeta').textContent = meta;
  document.getElementById('eventDesc').innerHTML = renderMarkdown(ev.description || '');
}

async function loadVolunteerFromServer() {
  if (!state.volunteer_id || !token) return;
  try {
    const res = await api('get_volunteer_public', 'GET', null, { token, volunteer_id: state.volunteer_id });
    state.first_name = res.volunteer.first_name;
    state.last_name = res.volunteer.last_name;
    state.email = res.volunteer.email || '';
    state.phone = res.volunteer.phone || '';
    state.task_ids = res.task_ids || [];
    state.task_comments = res.task_comments || {};
    saveLocal();
  } catch (_) {}
}

async function loadTasks() {
  if (!token) return;
  const res = await api('list_tasks_public', 'GET', null, { token });
  tasksCache = res.tasks || [];
  renderTasks(res.tasks || []);
}

async function saveProfile() {
  readForm();
  if (!state.first_name || !state.last_name) {
    setMessage('profileMsg', 'Nom et prénom obligatoires.', true);
    return;
  }
  if (state.phone) {
    try {
      const res = await api('lookup_volunteer_by_phone', 'POST', { token, phone: state.phone });
      if (res.volunteer && res.volunteer.id && res.volunteer.id !== state.volunteer_id) {
        const doImport = confirm('Même numéro détecté. Voulez-vous importer les données existantes ?');
        if (doImport) {
          state.volunteer_id = res.volunteer.id;
          state.first_name = res.volunteer.first_name;
          state.last_name = res.volunteer.last_name;
          state.email = res.volunteer.email || '';
          state.phone = res.volunteer.phone || state.phone;
          state.task_ids = res.task_ids || [];
          state.task_comments = res.task_comments || {};
          saveLocal();
          fillForm();
          await loadTasks();
          setMessage('profileMsg', 'Données importées.');
          return;
        } else {
          // Continue with a new volunteer record
          state.volunteer_id = null;
        }
      }
    } catch (_) {
      // ignore if not found
    }
  }
  try {
    const res = await api('upsert_volunteer_public', 'POST', {
      token,
      volunteer_id: state.volunteer_id,
      first_name: state.first_name,
      last_name: state.last_name,
      email: state.email,
      phone: state.phone,
    });
    state.volunteer_id = res.volunteer_id;
    saveLocal();
    setMessage('profileMsg', 'Coordonnées enregistrées.');
  } catch (e) {
    setMessage('profileMsg', e.message, true);
  }
}

function formatPhone(input) {
  const digits = (input || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return digits.replace(/(\d{2})(?=\d)/g, '$1.').slice(0, 14);
  }
  return input;
}

async function lookupByPhone() {
  const raw = document.getElementById('lookupPhone').value.trim();
  const phone = formatPhone(raw);
  document.getElementById('lookupPhone').value = phone;
  if (!phone) {
    setMessage('lookupMsg', 'Renseignez un numéro.', true);
    return;
  }
  try {
    const res = await api('lookup_volunteer_by_phone', 'POST', { token, phone });
    state.volunteer_id = res.volunteer.id;
    state.first_name = res.volunteer.first_name;
    state.last_name = res.volunteer.last_name;
    state.email = res.volunteer.email || '';
    state.phone = res.volunteer.phone || phone;
    state.task_ids = res.task_ids || [];
    state.task_comments = res.task_comments || {};
    saveLocal();
    fillForm();
    await loadTasks();
    setMessage('lookupMsg', 'Données importées.');
  } catch (e) {
    setMessage('lookupMsg', e.message, true);
  }
}

async function saveTasks() {
  if (!state.volunteer_id) {
    setMessage('taskMsg', 'Enregistrez d’abord vos coordonnées.', true);
    return;
  }
  try {
    await api('set_assignments_public', 'POST', {
      token,
      volunteer_id: state.volunteer_id,
      task_ids: state.task_ids,
      task_comments: state.task_comments,
    });
    setMessage('taskMsg', 'Choix enregistrés.');
    await loadVolunteerFromServer();
    await loadTasks();
  } catch (e) {
    setMessage('taskMsg', e.message, true);
  }
}

async function init() {
  loadLocal();
  fillForm();
  await loadEvent();
  await loadVolunteerFromServer();
  fillForm();
  await loadTasks();
}

document.getElementById('saveProfile').addEventListener('click', saveProfile);
document.getElementById('saveTasks').addEventListener('click', saveTasks);
document.getElementById('lookupBtn').addEventListener('click', lookupByPhone);
document.getElementById('addToCalendar').addEventListener('click', () => {
  if (!currentEvent) {
    setMessage('taskMsg', 'Événement non disponible.', true);
    return;
  }
  downloadIcsForTasks(currentEvent, tasksCache, state.task_ids);
});

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdown(text) {
  if (!text) return '';
  let out = escapeHtml(text);
  out = out.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  out = out.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  out = out.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
  out = out.replace(/`(.+?)`/g, '<code>$1</code>');
  out = out.replace(/(?:^|\n)(?:- .+(?:\n- .+)*)/g, (block) => {
    const items = block.trim().split('\n').map((line) => line.replace(/^-\\s+/, ''));
    return '<ul>' + items.map((i) => `<li>${i}</li>`).join('') + '</ul>';
  });
  out = out.replace(/\n/g, '<br>');
  out = out.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return out;
}

function formatIcsDate(date) {
  const d = new Date(date);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function sanitizeIcs(text) {
  return String(text || '').replace(/\r?\n/g, '\\n');
}

function stripMarkdown(text) {
  return String(text || '')
    .replace(/^###\s+(.+)$/gm, '$1')
    .replace(/^##\s+(.+)$/gm, '$1')
    .replace(/^#\s+(.+)$/gm, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^-\\s+/gm, '');
}

function downloadIcsForTasks(ev, tasks, selectedIds) {
  const chosen = (tasks || []).filter((t) => selectedIds.includes(t.id));
  if (!chosen.length) {
    setMessage('taskMsg', 'Sélectionnez au moins une tâche.', true);
    return;
  }
  const eol = '\r\n';
  const url = sanitizeIcs(window.location.href);
  const location = sanitizeIcs(ev.location || '');
  const dtStamp = formatIcsDate(new Date());

  const events = chosen
    .filter((t) => t.start_at)
    .map((t, idx) => {
      const start = formatIcsDate(t.start_at);
      const endDate = t.end_at ? new Date(t.end_at) : new Date(new Date(t.start_at).getTime() + 2 * 60 * 60 * 1000);
      const end = formatIcsDate(endDate);
      const uid = `${ev.id || 'event'}-${t.id || idx}-${Date.now()}@quifaitquoi`;
      const title = sanitizeIcs(`${ev.title} — ${t.title}`);
      const participants = (t.assigned || []).map((a) => `${a.first_name} ${a.last_name}`).join(', ');
      const descParts = [];
      const taskDesc = stripMarkdown(t.description || '');
      if (taskDesc) descParts.push(taskDesc);
      if (participants) descParts.push(`Participants: ${participants}`);
      const desc = sanitizeIcs(descParts.join('\\n'));
      return [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${title}`,
        `DESCRIPTION:${desc}`,
        `LOCATION:${location}`,
        `URL;VALUE=URI:${url}`,
        'END:VEVENT',
      ].join(eol);
    });

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//QuiFaitQuoi//FR',
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR',
  ].join(eol);

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(ev.title || 'evenement').replace(/\\s+/g, '_')}_taches.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

init();
