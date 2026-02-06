const basePath = window.location.pathname.replace(/\/public\/.*$/, '');
const apiBase = window.location.origin === 'null'
  ? `${basePath}/api/index.php`
  : new URL(`${basePath}/api/index.php`, window.location.origin).toString();

const loginSection = document.getElementById('loginSection');
const tabs = document.getElementById('tabs');
const dashboard = document.getElementById('dashboard');
const eventSection = document.getElementById('eventSection');
const taskSection = document.getElementById('taskSection');
const volunteerSection = document.getElementById('volunteerSection');
const logoutBtn = document.getElementById('logoutBtn');
const adminTitle = document.getElementById('adminTitle');

const eventSelect = document.getElementById('eventSelect');
const eventLink = document.getElementById('eventLink');
const dashboardSummary = document.getElementById('dashboardSummary');
const dashboardChat = document.getElementById('dashboardChat');
const dashboardVolunteerTable = document.getElementById('dashboardVolunteerTable');
const duplicateEventBtn = document.getElementById('duplicateEvent');
const importVolunteersCsv = document.getElementById('importVolunteersCsv');
const importTasksCsv = document.getElementById('importTasksCsv');
const exportTasksCsvTab = document.getElementById('exportTasksCsvTab');
const exportTasksCsv = document.getElementById('exportTasksCsv');
const exportCsv = document.getElementById('exportCsv');
const exportMsg = document.getElementById('exportMsg');
const openTaskModalBtn = document.getElementById('openTaskModal');
const taskModal = document.getElementById('taskModal');
const taskModalTitle = document.getElementById('taskModalTitle');
const taskModalMsg = document.getElementById('taskModalMsg');
const openEventModalBtn = document.getElementById('openEventModal');
const editEventModalBtn = document.getElementById('editEventModal');
const eventModal = document.getElementById('eventModal');
const eventModalTitle = document.getElementById('eventModalTitle');
const eventModalMsg = document.getElementById('eventModalMsg');
const saveEventBtn = document.getElementById('saveEvent');
const deleteEventBtn = document.getElementById('deleteEvent');
const cancelEventBtn = document.getElementById('cancelEvent');
const eventTheme = document.getElementById('eventTheme');
const eventThemePreview = document.getElementById('eventThemePreview');
const openVolunteerModalBtn = document.getElementById('openVolunteerModal');

let events = [];
let currentEventId = null;
let editingTaskId = null;
let volunteersMap = new Map();

const volModal = document.getElementById('volModal');
const volModalName = document.getElementById('volModalName');
const volModalTitle = document.getElementById('volModalTitle');
const modalFirst = document.getElementById('modalFirst');
const modalLast = document.getElementById('modalLast');
const modalEmail = document.getElementById('modalEmail');
const modalPhone = document.getElementById('modalPhone');
const modalSave = document.getElementById('modalSave');
const modalClose = document.getElementById('modalClose');
const modalMsg = document.getElementById('modalMsg');
let modalVolunteerId = null;

const manageModal = document.getElementById('manageModal');
const manageTaskName = document.getElementById('manageTaskName');
const manageList = document.getElementById('manageList');
const manageVolunteer = document.getElementById('manageVolunteer');
const manageComment = document.getElementById('manageComment');
const manageAdd = document.getElementById('manageAdd');
const manageClose = document.getElementById('manageClose');
const manageMsg = document.getElementById('manageMsg');
let manageTask = null;

async function api(action, method = 'GET', data = null) {
  const url = new URL(apiBase);
  url.searchParams.set('action', action);
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

function setMessage(el, msg, isError = false) {
  el.textContent = msg;
  el.style.color = isError ? '#a63d40' : '#6b6257';
}

function formatDateInput(value) {
  if (!value) return '';
  const dt = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

async function checkAuth() {
  const res = await api('admin_me');
  if (res.authenticated) {
    loginSection.hidden = true;
    tabs.hidden = false;
    dashboard.hidden = false;
    if (eventSection) {
      eventSection.hidden = false;
    }
    taskSection.hidden = false;
    volunteerSection.hidden = false;
    logoutBtn.hidden = false;
    await loadEvents();
    setTabFromHash();
    if (!location.hash) {
      const savedTab = localStorage.getItem('gbv2_admin_tab') || 'dashboard';
      setActiveTab(savedTab);
    }
  } else {
    loginSection.hidden = false;
    tabs.hidden = true;
    dashboard.hidden = true;
    if (eventSection) {
      eventSection.hidden = true;
    }
    taskSection.hidden = true;
    volunteerSection.hidden = true;
    logoutBtn.hidden = true;
  }
}

async function login() {
  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value;
  const msg = document.getElementById('loginMsg');
  try {
    await api('admin_login', 'POST', { username: user, password: pass });
    setMessage(msg, 'Connecté');
    await checkAuth();
  } catch (e) {
    setMessage(msg, e.message, true);
  }
}

async function logout() {
  await api('admin_logout', 'POST');
  await checkAuth();
}

async function loadEvents(preferredId = null) {
  const res = await api('list_events');
  events = res.events || [];
  eventSelect.innerHTML = '';

  if (events.length === 0) {
    eventSelect.innerHTML = '<option value="">Aucun événement</option>';
    currentEventId = null;
    eventLink.value = '';
    eventInfo.textContent = 'Créez un événement pour obtenir un lien public.';
    renderTasks([]);
    renderVolunteers([]);
    return;
  }

  events.forEach((ev) => {
    const opt = document.createElement('option');
    opt.value = ev.id;
    opt.textContent = ev.title;
    eventSelect.appendChild(opt);
  });

  const savedId = Number(localStorage.getItem('gbv2_admin_event') || 0);
  const usePreferred = preferredId && events.some((e) => e.id === preferredId);
  const hasSaved = events.some((e) => e.id === savedId);
  currentEventId = usePreferred ? preferredId : (hasSaved ? savedId : events[0].id);
  eventSelect.value = String(currentEventId);
  updateEventDisplay();
  await refreshTasks();
  await refreshVolunteers();
}

function updateEventDisplay() {
  const ev = events.find((e) => e.id === currentEventId);
  if (!ev) return;
  const link = `${window.location.origin}${basePath}/public/volunteer.html?token=${ev.public_token}`;
  eventLink.value = link;
  if (adminTitle) {
    adminTitle.textContent = `Administration des bénévoles · ${ev.title}`;
  }
  document.body.setAttribute('data-theme', ev.theme || 'sand');
}

function setEventForm(ev = null) {
  document.getElementById('eventTitle').value = ev ? ev.title : '';
  document.getElementById('eventDesc').value = ev ? (ev.description || '') : '';
  document.getElementById('eventLocation').value = ev ? (ev.location || '') : '';
  document.getElementById('eventStart').value = ev ? formatDateInput(ev.start_at) : '';
  document.getElementById('eventEnd').value = ev ? formatDateInput(ev.end_at) : '';
  if (eventTheme) {
    const value = ev && ev.theme ? ev.theme : 'sand';
    eventTheme.value = value;
    if (eventThemePreview) {
      eventThemePreview.setAttribute('data-theme', value);
    }
  }
  eventModalTitle.textContent = ev ? 'Modifier l’événement' : 'Ajouter un événement';
  eventModalMsg.textContent = '';
}

async function saveEvent() {
  const msg = eventModalMsg;
  const payload = {
    title: document.getElementById('eventTitle').value.trim(),
    description: document.getElementById('eventDesc').value.trim(),
    location: document.getElementById('eventLocation').value.trim(),
    start_at: document.getElementById('eventStart').value || null,
    end_at: document.getElementById('eventEnd').value || null,
    theme: eventTheme ? eventTheme.value : 'sand',
  };
  try {
    if (currentEventId && editEventModalBtn.dataset.mode === 'edit') {
      await api('update_event', 'POST', { ...payload, id: currentEventId });
      setMessage(msg, 'Événement mis à jour');
    } else {
      await api('create_event', 'POST', payload);
      setMessage(msg, 'Événement créé');
    }
    await loadEvents();
    closeEventModal();
  } catch (e) {
    setMessage(msg, e.message, true);
  }
}

function setTaskForm(task = null) {
  document.getElementById('taskTitle').value = task ? task.title : '';
  document.getElementById('taskDesc').value = task ? (task.description || '') : '';
  document.getElementById('taskExpected').value = task ? task.expected_volunteers : 1;
  document.getElementById('taskStart').value = task ? formatDateInput(task.start_at) : '';
  document.getElementById('taskEnd').value = task ? formatDateInput(task.end_at) : '';
  taskModalTitle.textContent = task ? 'Modifier la tâche' : 'Ajouter une tâche';
  taskModalMsg.textContent = '';
}

async function saveTask() {
  if (!currentEventId) return;
  const payload = {
    event_id: currentEventId,
    title: document.getElementById('taskTitle').value.trim(),
    description: document.getElementById('taskDesc').value.trim(),
    expected_volunteers: Number(document.getElementById('taskExpected').value || 1),
    start_at: document.getElementById('taskStart').value,
    end_at: document.getElementById('taskEnd').value || null,
  };

  try {
    if (editingTaskId) {
      await api('update_task', 'POST', { ...payload, id: editingTaskId });
      setMessage(taskModalMsg, 'Tâche mise à jour');
    } else {
      await api('create_task', 'POST', payload);
      setMessage(taskModalMsg, 'Tâche ajoutée');
    }
    editingTaskId = null;
    setTaskForm();
    await refreshTasks();
    closeTaskModal();
    setActiveTab('tasks');
  } catch (e) {
    setMessage(taskModalMsg, e.message, true);
  }
}

async function refreshTasks() {
  if (!currentEventId) return;
  const url = new URL(apiBase);
  url.searchParams.set('action', 'list_tasks_admin');
  url.searchParams.set('event_id', currentEventId);
  const listRes = await fetch(url.toString());
  const json = await listRes.json();
  renderTasks(json.tasks || []);
  renderDashboard(json.tasks || []);
}

function renderTasks(tasks) {
  const list = document.getElementById('taskList');
  list.innerHTML = '';
  if (tasks.length === 0) {
    list.innerHTML = '<div class="notice">Aucune tâche pour le moment.</div>';
    return;
  }
  tasks.forEach((task) => {
    const card = document.createElement('div');
    card.className = 'card';
    const assignedList = task.assigned && task.assigned.length
      ? task.assigned.map((a) => {
          const comment = a.comment ? ` - ${a.comment}` : '';
          return `${a.first_name} ${a.last_name}${comment}`;
        }).join('<br>')
      : 'Personne inscrit pour le moment';
    card.innerHTML = `
      <header>
        <div>
          <h3>${task.title}</h3>
          <p>${task.description || 'Sans description'}</p>
          <span class="badge">${task.expected_volunteers} bénévoles</span>
        </div>
        <div class="card-actions">
          <button class="secondary" data-manage="${task.id}">Gérer bénévoles</button>
          <button class="secondary" data-edit="${task.id}">Modifier</button>
          <button class="danger" data-delete="${task.id}">Supprimer</button>
        </div>
      </header>
      <p class="muted">${task.start_at ? new Date(task.start_at).toLocaleString() : 'Date à définir'}${task.end_at ? ' → ' + new Date(task.end_at).toLocaleString() : ''}</p>
      <div class="muted" style="margin-top:8px;">${assignedList}</div>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll('button[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.edit);
      const task = tasks.find((t) => t.id === id);
      editingTaskId = id;
      setTaskForm(task);
      openTaskModal();
    });
  });

  list.querySelectorAll('button[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.delete);
      if (!confirm('Supprimer cette tâche ?')) return;
      await api('delete_task', 'POST', { id });
      await refreshTasks();
    });
  });
  list.querySelectorAll('button[data-manage]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.manage);
      const task = tasks.find((t) => t.id === id);
      if (task) {
        openManageModal(task);
      }
    });
  });
}

function renderDashboard(tasks) {
  if (!dashboardSummary) return;
  dashboardSummary.innerHTML = '';
  if (dashboardChat) {
    dashboardChat.innerHTML = '';
  }
  if (dashboardVolunteerTable) {
    dashboardVolunteerTable.innerHTML = '';
  }
  if (!tasks.length) {
    dashboardSummary.innerHTML = '<div class="notice">Aucune tâche pour cet événement.</div>';
    if (dashboardChat) {
      dashboardChat.innerHTML = '<div class="notice">Aucun bénévole inscrit.</div>';
    }
    if (dashboardVolunteerTable) {
      dashboardVolunteerTable.innerHTML = '<tr><td colspan="2" class="muted">Aucun bénévole inscrit.</td></tr>';
    }
    return;
  }
  tasks.forEach((task) => {
    const assignedCount = task.assigned ? task.assigned.length : 0;
    const expected = Number(task.expected_volunteers || 0);
    const remaining = Math.max(expected - assignedCount, 0);
    const ratio = expected > 0 ? Math.min(assignedCount / expected, 1) : 0;
    const deg = Math.round(ratio * 360);
    const percent = Math.round(ratio * 100);
    const full = remaining === 0 && expected > 0;

    const card = document.createElement('div');
    card.className = 'dashboard-card';
    card.innerHTML = `
      <div class="task-row">
        <div class="pie" style="background: conic-gradient(${full ? 'var(--ok)' : 'var(--accent)'} ${deg}deg, var(--line) ${deg}deg);">
          ${percent}%
        </div>
        <div>
          <strong>${task.title}</strong>
          <div class="muted">${task.start_at ? new Date(task.start_at).toLocaleString() : 'Date à définir'}</div>
          <div class="muted">${assignedCount} / ${expected} inscrit(s)</div>
        </div>
        <div>
          ${full
            ? '<span class="status-pill ok"><span class="status-dot"></span>Complet</span>'
            : `<span class="status-pill warn"><span class="status-dot"></span>${remaining} manquant(s)</span>`}
        </div>
      </div>
    `;
    dashboardSummary.appendChild(card);
  });

  if (dashboardChat) {
    const entries = [];
    tasks.forEach((task) => {
      (task.assigned || []).forEach((a) => {
        if (a.comment) {
          entries.push({
            name: `${a.first_name} ${a.last_name}`,
            comment: a.comment,
            task: task.title,
            phone: a.phone || '',
            created_at: a.created_at || '',
          });
        }
      });
    });
    if (!entries.length) {
      dashboardChat.innerHTML = '<div class="notice">Aucun bénévole inscrit.</div>';
      if (dashboardVolunteerTable) {
        dashboardVolunteerTable.innerHTML = '<tr><td colspan="2" class="muted">Aucun bénévole inscrit.</td></tr>';
      }
      return;
    }
    entries
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .forEach((e) => {
      const div = document.createElement('div');
      div.innerHTML = `
        <div class="chat-name">${e.name}</div>
        <div class="chat-meta">${e.task}</div>
        ${e.comment ? `<div class="chat-comment">${e.comment}</div>` : ''}
      `;
      dashboardChat.appendChild(div);
    });
    dashboardChat.scrollTop = dashboardChat.scrollHeight;
    if (dashboardVolunteerTable) {
      const unique = new Map();
      entries.forEach((e) => {
        if (!unique.has(e.name)) {
          unique.set(e.name, e.phone || '-');
        }
      });
      Array.from(unique.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([name, phone]) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${name}</td>
            <td>${phone}</td>
          `;
          dashboardVolunteerTable.appendChild(tr);
        });
    }
  }
}


async function refreshVolunteers() {
  if (!currentEventId) return;
  const url = new URL(apiBase);
  url.searchParams.set('action', 'list_volunteers');
  url.searchParams.set('event_id', currentEventId);
  const res = await fetch(url.toString());
  const json = await res.json();
  volunteersMap = new Map((json.volunteers || []).map((v) => [v.id, v]));
  renderVolunteers(json.volunteers || []);
}

function renderVolunteers(vols) {
  const list = document.getElementById('volunteerList');
  list.innerHTML = '';
  if (vols.length === 0) {
    list.innerHTML = '<div class="notice">Aucun bénévole pour le moment.</div>';
    return;
  }
  vols.forEach((vol) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <header>
        <div>
          <h3>${vol.first_name} ${vol.last_name}</h3>
          <p>${vol.email || 'Email non renseigné'}</p>
          <p>${vol.phone || 'Téléphone non renseigné'}</p>
        </div>
        <div class="card-actions">
          <button class="secondary" data-edit="${vol.id}">Modifier</button>
          <button class="danger" data-delete="${vol.id}">Supprimer</button>
        </div>
      </header>
    `;
    list.appendChild(card);
  });

  list.querySelectorAll('button[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.edit);
      const vol = vols.find((v) => v.id === id);
      if (vol) {
        openVolunteerModal(vol);
      }
    });
  });

  list.querySelectorAll('button[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.delete);
      if (!confirm('Supprimer ce bénévole ?')) return;
      await api('delete_volunteer', 'POST', { id });
      await refreshVolunteers();
    });
  });
}

function setActiveTab(tab) {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== tab;
  });
  localStorage.setItem('gbv2_admin_tab', tab);
  if (location.hash !== `#${tab}`) {
    location.hash = tab;
  }
}

function setTabFromHash() {
  const hash = location.hash.replace('#', '');
  if (hash === 'dashboard' || hash === 'tasks' || hash === 'volunteers') {
    setActiveTab(hash);
  }
}

function openVolunteerModal(vol) {
  modalVolunteerId = vol ? vol.id : null;
  volModalTitle.textContent = vol ? 'Modifier le bénévole' : 'Ajouter un bénévole';
  volModalName.textContent = vol ? `${vol.first_name} ${vol.last_name}` : '';
  modalFirst.value = vol ? (vol.first_name || '') : '';
  modalLast.value = vol ? (vol.last_name || '') : '';
  modalEmail.value = vol ? (vol.email || '') : '';
  modalPhone.value = vol ? (vol.phone || '') : '';
  modalMsg.textContent = '';
  volModal.classList.add('open');
  volModal.setAttribute('aria-hidden', 'false');
}

function closeVolunteerModal() {
  volModal.classList.remove('open');
  volModal.setAttribute('aria-hidden', 'true');
  modalVolunteerId = null;
}

async function saveVolunteerModal() {
  try {
    if (modalVolunteerId) {
      await api('update_volunteer', 'POST', {
        id: modalVolunteerId,
        first_name: modalFirst.value.trim(),
        last_name: modalLast.value.trim(),
        email: modalEmail.value.trim(),
        phone: modalPhone.value.trim(),
      });
      modalMsg.textContent = 'Enregistré';
    } else {
      await api('create_volunteer_admin', 'POST', {
        event_id: currentEventId,
        first_name: modalFirst.value.trim(),
        last_name: modalLast.value.trim(),
        email: modalEmail.value.trim(),
        phone: modalPhone.value.trim(),
      });
      modalMsg.textContent = 'Bénévole ajouté';
    }
    await refreshVolunteers();
    await refreshTasks();
    closeVolunteerModal();
    setActiveTab('volunteers');
  } catch (e) {
    modalMsg.textContent = e.message;
    modalMsg.style.color = '#a63d40';
  }
}

function openManageModal(task) {
  manageTask = task;
  manageTaskName.textContent = task.title;
  manageComment.value = '';
  manageMsg.textContent = '';
  renderManageList();
  fillManageSelect();
  manageModal.classList.add('open');
  manageModal.setAttribute('aria-hidden', 'false');
}

function openTaskModal() {
  taskModal.classList.add('open');
  taskModal.setAttribute('aria-hidden', 'false');
}

function closeTaskModal() {
  taskModal.classList.remove('open');
  taskModal.setAttribute('aria-hidden', 'true');
  editingTaskId = null;
  setTaskForm();
}

function openEventModal(editMode = false) {
  editEventModalBtn.dataset.mode = editMode ? 'edit' : 'add';
  if (editMode) {
    const ev = events.find((e) => e.id === currentEventId);
    setEventForm(ev || null);
    deleteEventBtn.hidden = false;
  } else {
    setEventForm();
    deleteEventBtn.hidden = true;
  }
  eventModal.classList.add('open');
  eventModal.setAttribute('aria-hidden', 'false');
}

function closeEventModal() {
  eventModal.classList.remove('open');
  eventModal.setAttribute('aria-hidden', 'true');
}

function closeManageModal() {
  manageModal.classList.remove('open');
  manageModal.setAttribute('aria-hidden', 'true');
  manageTask = null;
}

function renderManageList() {
  manageList.innerHTML = '';
  if (!manageTask || !manageTask.assigned || manageTask.assigned.length === 0) {
    manageList.innerHTML = '<div class="notice">Aucun bénévole inscrit.</div>';
    return;
  }
  manageTask.assigned.forEach((a) => {
    const item = document.createElement('div');
    item.className = 'card';
    item.innerHTML = `
      <div class="inline">
        <div>
          <strong>${a.first_name} ${a.last_name}</strong>
          <div class="muted">
            <input type="text" data-comment="${a.volunteer_id}" value="${a.comment || ''}" placeholder="Commentaire..." />
          </div>
        </div>
        <button class="danger" data-remove="${a.volunteer_id}">Supprimer</button>
      </div>
    `;
    manageList.appendChild(item);
  });
  manageList.querySelectorAll('button[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const vid = Number(btn.dataset.remove);
      await api('admin_remove_assignment', 'POST', { task_id: manageTask.id, volunteer_id: vid });
      manageTask.assigned = manageTask.assigned.filter((a) => a.volunteer_id !== vid);
      await refreshTasks();
      renderManageList();
    });
  });

  manageList.querySelectorAll('input[data-comment]').forEach((input) => {
    input.addEventListener('blur', async (e) => {
      const vid = Number(e.target.dataset.comment);
      const current = manageTask.assigned.find((a) => a.volunteer_id === vid);
      if (!current) return;
      const newComment = e.target.value.trim();
      if ((current.comment || '') === newComment) return;
      try {
        await api('admin_update_assignment_comment', 'POST', {
          task_id: manageTask.id,
          volunteer_id: vid,
          comment: newComment,
        });
        current.comment = newComment;
        await refreshTasks();
      } catch (err) {
        manageMsg.textContent = err.message;
        manageMsg.style.color = '#a63d40';
      }
    });
  });
}

function fillManageSelect() {
  manageVolunteer.innerHTML = '';
  const volunteers = Array.from(volunteersMap.values());
  if (volunteers.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Aucun bénévole';
    manageVolunteer.appendChild(opt);
    return;
  }
  volunteers.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `${v.first_name} ${v.last_name}`;
    manageVolunteer.appendChild(opt);
  });
}

async function saveManageAdd() {
  if (!manageTask) return;
  const volunteerId = Number(manageVolunteer.value || 0);
  if (!volunteerId) {
    manageMsg.textContent = 'Sélectionnez un bénévole.';
    manageMsg.style.color = '#a63d40';
    return;
  }
  try {
    await api('admin_add_assignment', 'POST', {
      task_id: manageTask.id,
      volunteer_id: volunteerId,
      comment: manageComment.value.trim(),
    });
    manageMsg.textContent = 'Ajouté.';
    await refreshTasks();
    closeManageModal();
    setActiveTab('tasks');
  } catch (e) {
    manageMsg.textContent = e.message;
    manageMsg.style.color = '#a63d40';
  }
}

function bindEvents() {
  document.getElementById('loginBtn').addEventListener('click', login);
  logoutBtn.addEventListener('click', logout);
  saveEventBtn.addEventListener('click', saveEvent);
  deleteEventBtn.addEventListener('click', async () => {
    if (!currentEventId) return;
    if (!confirm('Supprimer cet événement ? Cette action est irréversible.')) return;
    await api('delete_event', 'POST', { id: currentEventId });
    closeEventModal();
    await loadEvents();
  });
  cancelEventBtn.addEventListener('click', closeEventModal);
  document.getElementById('saveTask').addEventListener('click', saveTask);
  document.getElementById('cancelTask').addEventListener('click', closeTaskModal);
  openEventModalBtn.addEventListener('click', () => openEventModal(false));
  editEventModalBtn.addEventListener('click', () => {
    if (currentEventId) openEventModal(true);
  });
  if (eventTheme) {
    eventTheme.addEventListener('change', () => {
      if (eventThemePreview) {
        eventThemePreview.setAttribute('data-theme', eventTheme.value);
      }
    });
  }
  openVolunteerModalBtn.addEventListener('click', () => openVolunteerModal(null));
  document.getElementById('copyLink').addEventListener('click', async () => {
    if (eventLink.value) {
      await navigator.clipboard.writeText(eventLink.value);
    }
  });
  eventSelect.addEventListener('change', async () => {
    currentEventId = Number(eventSelect.value || 0);
    localStorage.setItem('gbv2_admin_event', String(currentEventId));
    updateEventDisplay();
    await refreshTasks();
    await refreshVolunteers();
  });
  openTaskModalBtn.addEventListener('click', () => {
    editingTaskId = null;
    setTaskForm();
    openTaskModal();
  });
  exportCsv.addEventListener('click', () => {
    if (!currentEventId) return;
    exportMsg.textContent = '';
    const url = new URL(apiBase);
    url.searchParams.set('action', 'export_volunteers_csv');
    url.searchParams.set('event_id', currentEventId);
    window.location.href = url.toString();
  });
  exportTasksCsv.addEventListener('click', () => {
    if (!currentEventId) return;
    const url = new URL(apiBase);
    url.searchParams.set('action', 'export_tasks_csv');
    url.searchParams.set('event_id', currentEventId);
    window.location.href = url.toString();
  });
  exportTasksCsvTab.addEventListener('click', () => {
    if (!currentEventId) return;
    const url = new URL(apiBase);
    url.searchParams.set('action', 'export_tasks_csv');
    url.searchParams.set('event_id', currentEventId);
    window.location.href = url.toString();
  });
  duplicateEventBtn.addEventListener('click', async () => {
    if (!currentEventId) return;
    const res = await api('duplicate_event', 'POST', { id: currentEventId });
    const newId = res.id;
    await loadEvents(newId);
    setEventForm(events.find((e) => e.id === newId) || null);
    openEventModal(true);
  });
  importVolunteersCsv.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentEventId) return;
    const text = await file.text();
    await api('import_volunteers_csv', 'POST', { event_id: currentEventId, csv: text });
    await refreshVolunteers();
    await refreshTasks();
    e.target.value = '';
  });
  importTasksCsv.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentEventId) return;
    const text = await file.text();
    await api('import_tasks_csv', 'POST', { event_id: currentEventId, csv: text });
    await refreshTasks();
    e.target.value = '';
  });
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });
  window.addEventListener('hashchange', setTabFromHash);
  modalClose.addEventListener('click', closeVolunteerModal);
  modalSave.addEventListener('click', saveVolunteerModal);
  volModal.addEventListener('click', (e) => {
    if (e.target === volModal) {
      closeVolunteerModal();
    }
  });
  manageClose.addEventListener('click', closeManageModal);
  manageAdd.addEventListener('click', saveManageAdd);
  manageModal.addEventListener('click', (e) => {
    if (e.target === manageModal) {
      closeManageModal();
    }
  });
  taskModal.addEventListener('click', (e) => {
    if (e.target === taskModal) {
      closeTaskModal();
    }
  });
  eventModal.addEventListener('click', (e) => {
    if (e.target === eventModal) {
      closeEventModal();
    }
  });
}

bindEvents();
checkAuth();
