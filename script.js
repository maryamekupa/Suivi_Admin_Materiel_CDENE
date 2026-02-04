const SUPABASE_URL = 'https://wiveffsyxbvfzkdtxhdn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpdmVmZnN5eGJ2ZnprZHR4aGRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwOTUxODgsImV4cCI6MjA4NTY3MTE4OH0._Li96ZKL5gcmYzlBoYe-sViSxAKLNJTzv3kYCp2ogLI';
const SUPABASE_TABLE = 'suivi_admin_materiel';
const COMMENT_COLUMN = 'commentaire';

if (!window.supabase || !window.supabase.createClient) {
  console.error('Supabase JS non chargé. Vérifiez le script CDN.');
}
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const adminStatus = document.getElementById('adminStatus');
const loginSection = document.getElementById('loginSection');
const adminSection = document.getElementById('adminSection');
const loginEmail = document.getElementById('adminEmail');
const loginPassword = document.getElementById('adminPassword');
const btnLogin = document.getElementById('btnAdminLogin');
const btnLogout = document.getElementById('btnAdminLogout');
const btnRefresh = document.getElementById('btnAdminRefresh');
const btnExport = document.getElementById('btnAdminExport');
const filterFrom = document.getElementById('filterFrom');
const filterTo = document.getElementById('filterTo');
const filterText = document.getElementById('filterText');
const tableWrap = document.getElementById('adminTableWrap');

let cachedRows = [];

function setStatus(text, isError) {
  if (!adminStatus) return;
  adminStatus.textContent = text;
  adminStatus.style.color = isError ? '#b00020' : '#1e4f38';
}

async function refreshSession() {
  if (!supabase) {
    setStatus('Erreur: Supabase non chargé (CDN).', true);
    return;
  }
  if (!loginSection || !adminSection) {
    setStatus('Erreur: sections admin introuvables.', true);
    return;
  }
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (session?.user) {
    loginSection.style.display = 'none';
    adminSection.style.display = 'block';
    setStatus(`Connecté: ${session.user.email}`, false);
    await loadData();
  } else {
    loginSection.style.display = 'block';
    adminSection.style.display = 'none';
    setStatus('Déconnecté', false);
  }
}

async function login() {
  if (!supabase) {
    setStatus('Erreur: Supabase non chargé (CDN).', true);
    return;
  }
  if (!loginEmail || !loginPassword) {
    setStatus('Erreur: champs login introuvables.', true);
    return;
  }
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  if (!email || !password) {
    setStatus('Email et mot de passe requis.', true);
    return;
  }
  setStatus('Connexion en cours...', false);
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus(error.message || 'Erreur de connexion.', true);
      return;
    }
    await refreshSession();
  } catch (err) {
    setStatus(`Erreur: ${err?.message || err}`, true);
  }
}

async function logout() {
  if (!supabase) {
    setStatus('Erreur: Supabase non chargé (CDN).', true);
    return;
  }
  await supabase.auth.signOut();
  await refreshSession();
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('fr-CA');
  } catch {
    return value;
  }
}

function normalizeCell(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function applyFilters(rows) {
  const search = (filterText.value || '').trim().toLowerCase();
  return rows.filter(r => {
    if (!search) return true;
    return JSON.stringify(r).toLowerCase().includes(search);
  });
}

function renderTable(rows) {
  tableWrap.innerHTML = '';

  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'summary-empty';
    empty.textContent = 'Aucune donnée';
    tableWrap.appendChild(empty);
    return;
  }

  const table = document.createElement('table');
  table.className = 'summary-table';

  const headers = [
    'Date',
    'Formulaire',
    'Action',
    'Rôle',
    'Type',
    'Marque',
    'Nom',
    'N° de série',
    'Quantité',
    'État',
    'Commentaire',
    'Employé',
    'Gestionnaire',
    'Source',
    'Extra'
  ];

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach(r => {
    const tr = document.createElement('tr');
    const commentVal = r[COMMENT_COLUMN] ?? r.commentaire ?? r.comment ?? '';
    const cells = [
      formatDate(r.created_at),
      r.form_type,
      r.action_type,
      r.role,
      r.type,
      r.marque,
      r.nom,
      r.serie,
      r.quantite,
      r.etat,
      commentVal,
      r.employe,
      r.gestionnaire,
      r.source_page,
      r.extra
    ];
    cells.forEach(c => {
      const td = document.createElement('td');
      td.textContent = normalizeCell(c);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
}

async function loadData() {
  if (!supabase) {
    setStatus('Erreur: Supabase non chargé (CDN).', true);
    return;
  }
  setStatus('Chargement...', false);
  let query = supabase.from(SUPABASE_TABLE).select('*').order('created_at', { ascending: false }).limit(1000);
  if (filterFrom.value) {
    query = query.gte('created_at', filterFrom.value);
  }
  if (filterTo.value) {
    query = query.lte('created_at', filterTo.value);
  }
  const { data, error } = await query;
  if (error) {
    setStatus(`Erreur: ${error.message}`, true);
    return;
  }
  cachedRows = data || [];
  const filtered = applyFilters(cachedRows);
  renderTable(filtered);
  setStatus(`Chargé: ${filtered.length} entrée(s)`, false);
}

function exportCSV() {
  const rows = applyFilters(cachedRows);
  if (!rows.length) return;

  const headers = [
    'created_at',
    'form_type',
    'action_type',
    'role',
    'type',
    'marque',
    'nom',
    'serie',
    'quantite',
    'etat',
    COMMENT_COLUMN,
    'employe',
    'gestionnaire',
    'source_page',
    'extra'
  ];

  const lines = [];
  lines.push(headers.join(','));
  rows.forEach(r => {
    const line = headers.map(h => {
      const val = r[h] ?? r.commentaire ?? r.comment ?? '';
      const str = normalizeCell(val).replace(/"/g, '""');
      return `"${str}"`;
    });
    lines.push(line.join(','));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `suivi_admin_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

btnLogin.addEventListener('click', login);
btnLogout.addEventListener('click', logout);
btnRefresh.addEventListener('click', loadData);
btnExport.addEventListener('click', exportCSV);
filterText.addEventListener('input', () => renderTable(applyFilters(cachedRows)));
filterFrom.addEventListener('change', loadData);
filterTo.addEventListener('change', loadData);

const adminForm = document.getElementById('adminPanel');
if (adminForm) {
  adminForm.addEventListener('submit', (e) => e.preventDefault());
}
if (loginPassword) {
  loginPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      login();
    }
  });
}

if (supabase) {
  supabase.auth.onAuthStateChange(() => {
    refreshSession();
  });
}

window.addEventListener('unhandledrejection', (e) => {
  setStatus(`Erreur: ${e.reason?.message || e.reason}`, true);
});

refreshSession();

async function loadData() {
  // ... (ton code existant)
  const { data, error } = await query;

  if (error) {
    console.error("Erreur Supabase détaillée:", error.message, error.details);
    alert("Erreur de chargement: " + error.message);
    return;
  }
  // ...
}