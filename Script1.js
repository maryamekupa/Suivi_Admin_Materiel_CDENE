/* ========== Modales personnalisées ========== */
function showCustomConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-message">${message}</div>
        <div class="modal-buttons">
          <button class="modal-btn modal-btn-cancel" onclick="this.closest('.modal-overlay').remove(); window._confirmResolve(false);">Annuler</button>
          <button class="modal-btn modal-btn-confirm" onclick="this.closest('.modal-overlay').remove(); window._confirmResolve(true);">Confirmer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    window._confirmResolve = resolve;
  });
}

function showCustomAlert(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-message">${message}</div>
        <div class="modal-buttons">
          <button class="modal-btn modal-btn-confirm" onclick="this.closest('.modal-overlay').remove(); window._alertResolve();">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    window._alertResolve = resolve;
  });
}

/* ========== Supabase (collecte admin) ========== */
const SUPABASE_URL = 'https://wiveffsyxbvfzkdtxhdn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpdmVmZnN5eGJ2ZnprZHR4aGRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwOTUxODgsImV4cCI6MjA4NTY3MTE4OH0._Li96ZKL5gcmYzlBoYe-sViSxAKLNJTzv3kYCp2ogLI';
const SUPABASE_TABLE = 'suivi_admin_materiel';
// Colonne commentaire dans la base :
const COMMENT_COLUMN = 'commentaire';
let supabaseClient = null;
const DEBUG_MODE = new URLSearchParams(window.location.search).get('debug') === '1';
let debugStatusEl = null;

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (!window.supabase || !window.supabase.createClient) return null;
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return supabaseClient;
}

function setDebugStatus(message, isError) {
  if (!DEBUG_MODE) return;
  if (!debugStatusEl) {
    debugStatusEl = document.createElement('div');
    debugStatusEl.style.position = 'fixed';
    debugStatusEl.style.right = '12px';
    debugStatusEl.style.bottom = '12px';
    debugStatusEl.style.zIndex = '9999';
    debugStatusEl.style.padding = '10px 12px';
    debugStatusEl.style.borderRadius = '8px';
    debugStatusEl.style.fontSize = '12px';
    debugStatusEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    document.body.appendChild(debugStatusEl);
  }
  debugStatusEl.style.background = isError ? '#fce4e4' : '#e8f5e9';
  debugStatusEl.style.border = isError ? '1px solid #c0392b' : '1px solid #1e4f38';
  debugStatusEl.style.color = isError ? '#c0392b' : '#1e4f38';
  debugStatusEl.textContent = message;
}

function normalizeText(val) {
  return (val || '').toString().trim();
}

function normalizeInt(val) {
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : null;
}

function cleanRow(row) {
  if (row.comment !== undefined && COMMENT_COLUMN !== 'comment') {
    row[COMMENT_COLUMN] = row.comment;
    delete row.comment;
  }
  const cleaned = {};
  Object.keys(row).forEach(k => {
    const v = row[k];
    cleaned[k] = (v === '' || v === undefined) ? null : v;
  });
  return cleaned;
}

function getPageName() {
  const path = window.location.pathname || '';
  return path.split('/').pop() || path || 'page';
}

function collectAttributionEntries() {
  const form = document.getElementById('blocAttribution');
  if (!form) return [];

  const employe = normalizeText(document.getElementById('nomAttribution')?.value);
  const gestionnaire = normalizeText(document.getElementById('gestionnaireAttribution')?.value);
  const actionDate = normalizeText(document.getElementById('dateRestitution1')?.value);

  const rows = [];
  document.querySelectorAll('#attributionTbody tr').forEach(tr => {
    const type = normalizeText(tr.querySelector('select')?.value);
    const marque = normalizeText(tr.querySelector('.marque')?.value);
    const nom = normalizeText(tr.querySelector('.nom')?.value);
    const serie = normalizeText(tr.querySelector('.serie')?.value);
    const quantite = normalizeInt(tr.querySelector('.quantite')?.value);

    const hasAny = type || marque || nom || serie || quantite !== null;
    if (!hasAny) return;

    rows.push(cleanRow({
      form_type: 'attribution',
      action_type: 'Attribution',
      action_date: actionDate || null,
      role: 'Attribution',
      type: getTypeLabel(type),
      marque,
      nom,
      serie,
      quantite,
      etat: null,
      comment: null,
      employe,
      gestionnaire,
      source_page: getPageName(),
      extra: null
    }));
  });

  return rows;
}

function collectSuiviEntries() {
  const form = document.getElementById('blocSuiviRestitution');
  if (!form) return [];

  const employe = normalizeText(document.getElementById('nomSuivi')?.value);
  const gestionnaire = normalizeText(document.getElementById('gestionnaireSuivi')?.value);

  const rows = [];
  document.querySelectorAll('.action-block').forEach(block => {
    const actionSelect = block.querySelector('.action-header select');
    const actionType = normalizeText(actionSelect?.value);
    if (!actionType) return;

    const actionDate = normalizeText(block.querySelector('.action-header input[type="date"]')?.value);
    const actionId = block.dataset.actionId || '';
    const extraBase = actionId ? JSON.stringify({ action_id: actionId }) : null;

    if (actionType === 'Ajout' || actionType === 'Changement') {
      const nouveauBlock = block.querySelector('.sub-block[data-role="nouveau"]');
      const retourBlock = block.querySelector('.sub-block[data-role="retour"]');

      if (actionType === 'Changement' && retourBlock) {
        const type = normalizeText(readFieldValue(retourBlock, 'type'));
        const row = cleanRow({
          form_type: 'suivi',
          action_type: actionType,
          action_date: actionDate || null,
          role: 'Retourné',
          type: getTypeLabel(type),
          marque: normalizeText(readFieldValue(retourBlock, 'marque')),
          nom: normalizeText(readFieldValue(retourBlock, 'nom')),
          serie: normalizeText(readFieldValue(retourBlock, 'serie')),
          quantite: normalizeInt(readFieldValue(retourBlock, 'quantite')),
          etat: normalizeText(readFieldValue(retourBlock, 'etat')),
          comment: normalizeText(readFieldValue(retourBlock, 'comment')),
          employe,
          gestionnaire,
          source_page: getPageName(),
          extra: extraBase
        });
        const hasAny = row.type || row.marque || row.nom || row.serie || row.quantite !== null || row.etat || row.comment;
        if (hasAny) rows.push(row);
      }

      if (nouveauBlock) {
        const type = normalizeText(readFieldValue(nouveauBlock, 'type'));
        const row = cleanRow({
          form_type: 'suivi',
          action_type: actionType,
          action_date: actionDate || null,
          role: 'Reçu',
          type: getTypeLabel(type),
          marque: normalizeText(readFieldValue(nouveauBlock, 'marque')),
          nom: normalizeText(readFieldValue(nouveauBlock, 'nom')),
          serie: normalizeText(readFieldValue(nouveauBlock, 'serie')),
          quantite: normalizeInt(readFieldValue(nouveauBlock, 'quantite')),
          etat: normalizeText(readFieldValue(nouveauBlock, 'etat')),
          comment: normalizeText(readFieldValue(nouveauBlock, 'comment')),
          employe,
          gestionnaire,
          source_page: getPageName(),
          extra: extraBase
        });
        const hasAny = row.type || row.marque || row.nom || row.serie || row.quantite !== null || row.etat || row.comment;
        if (hasAny) rows.push(row);
      }
    } else if (actionType === 'Retour') {
      const inlineBlocks = block.querySelectorAll('.retour-inline-fields');
      inlineBlocks.forEach(inlineBlock => {
        const type = inlineBlock.dataset.type || '';
        const typeLabel = getRetourTypeLabel(block, type);
        const row = cleanRow({
          form_type: 'suivi',
          action_type: actionType,
          action_date: actionDate || null,
          role: 'Restitué',
          type: typeLabel,
          marque: normalizeText(readFieldValue(inlineBlock, 'marque')),
          nom: normalizeText(readFieldValue(inlineBlock, 'nom')),
          serie: normalizeText(readFieldValue(inlineBlock, 'serie')),
          quantite: normalizeInt(readFieldValue(inlineBlock, 'quantite')),
          etat: normalizeText(readFieldValue(inlineBlock, 'etat')),
          comment: normalizeText(readFieldValue(inlineBlock, 'comment')),
          employe,
          gestionnaire,
          source_page: getPageName(),
          extra: extraBase
        });
        const hasAny = row.type || row.marque || row.nom || row.serie || row.quantite !== null || row.etat || row.comment;
        if (hasAny) rows.push(row);
      });
    } else if (actionType === 'Autre') {
      const otherDesc = normalizeText(block.querySelector('.action-content textarea')?.value);
      if (otherDesc) {
        rows.push(cleanRow({
          form_type: 'suivi',
          action_type: actionType,
          action_date: actionDate || null,
          role: 'Autre',
          type: 'Autre action',
          marque: null,
          nom: null,
          serie: null,
          quantite: null,
          etat: null,
          comment: otherDesc,
          employe,
          gestionnaire,
          source_page: getPageName(),
          extra: extraBase
        }));
      }
    }
  });

  return rows;
}

function collectAllEntries() {
  return [...collectAttributionEntries(), ...collectSuiviEntries()];
}

let saveTimeoutId = null;
const SAVE_DEBOUNCE_MS = 4000;
const LAST_HASH_KEY = `cdene_last_hash_${getPageName()}`;

function scheduleAutoSave() {
  if (saveTimeoutId) clearTimeout(saveTimeoutId);
  saveTimeoutId = setTimeout(() => {
    sendEntriesToSupabase('auto');
  }, SAVE_DEBOUNCE_MS);
}

async function sendEntriesToSupabase(trigger) {
  const client = getSupabaseClient();
  if (!client) {
    setDebugStatus('Supabase non chargé (CDN).', true);
    return;
  }

  const rows = collectAllEntries();
  if (!rows.length) {
    setDebugStatus('Aucune donnée à envoyer.', true);
    return;
  }

  const payloadHash = JSON.stringify(rows);
  const lastHash = localStorage.getItem(LAST_HASH_KEY);
  if (payloadHash === lastHash && trigger === 'auto') return;

  setDebugStatus('Envoi vers Supabase...', false);
  const { error } = await client.from(SUPABASE_TABLE).insert(rows);
  if (!error) {
    localStorage.setItem(LAST_HASH_KEY, payloadHash);
    setDebugStatus(`Envoyé (${rows.length})`, false);
  } else {
    console.error('Supabase insert error:', error);
    setDebugStatus(`Erreur Supabase: ${error.message}`, true);
  }
}

/* ========== Formulaire 1 Attribution du matériel (....) ========== */
const attributionTypes = {
  'Cles': { label:'Clés du bureau', show:{marque:false, nom:false, serie:false, quantite:true} },
  'Badge': { label:'Badge d\'accès', show:{marque:false, nom:false, serie:false, quantite:true} },
  'LigneTel': { label:'Téléphone Cellulaire', show:{marque:true, nom:false, serie:true, quantite:false} },
  'Laptop': { label:'Ordinateur / Laptop', show:{marque:true, nom:true, serie:true, quantite:false} },
  'Moniteur': { label:'Moniteur', show:{marque:true, nom:false, serie:true, quantite:false} },
  'Tablette': { label:'Tablette', show:{marque:true, nom:false, serie:true, quantite:false} },
  'Accessoire': { label:'Accessoires', show:{marque:true, nom:true, serie:true, quantite:false} },
  'Autres': { label:'Autres', show:{marque:true, nom:true, serie:true, quantite:false} }
};

let attrID = 0;

function addAttributionRow() {
  attrID++;
  const tbody = document.getElementById("attributionTbody");
  if (!tbody) return;

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>
      <select class="typeSelect" onchange="updateAttrRow(this)">
        <option value="">--</option>
        ${Object.entries(attributionTypes).map(([key, value]) => `<option value="${key}">${value.label}</option>`).join('')}
      </select>
    </td>
    <td><input type="text" class="marque" placeholder="Marque" /></td>
    <td><input type="text" class="nom" placeholder="Nom" /></td>
    <td><input type="text" class="serie" placeholder="N° de série" /></td>
    <td><input type="number" class="quantite smallQty" min="1" value="1" /></td>
    <td><button type="button" class="no-pdf" onclick="removeAttributionRow(this)">❌</button></td>
  `;
  tbody.appendChild(tr);
  updateAttributionSummary();
}

async function removeAttributionRow(button) {
  const row = button.closest('tr');
  const confirmed = await showCustomConfirm("Êtes-vous sûr de vouloir supprimer cette ligne ?");
  if (confirmed) {
    row.remove();
    updateAttributionSummary();
  }
}

function updateAttrRow(select){
  const tr = select.closest("tr");
  const marque = tr.querySelector(".marque");
  const nom = tr.querySelector(".nom");
  const serie = tr.querySelector(".serie");
  const quantite = tr.querySelector(".quantite");

  const type = attributionTypes[select.value];
  if (!type) {
    if (marque) marque.disabled = nom.disabled = serie.disabled = quantite.disabled = true;
    return;
  }

  if (marque) { marque.disabled = !type.show.marque; if(!type.show.marque) marque.value = ''; }
  if (nom) { nom.disabled = !type.show.nom; if(!type.show.nom) nom.value = ''; }
  if (serie) { serie.disabled = !type.show.serie; if(!type.show.serie) serie.value = ''; }
  if (quantite) { quantite.disabled = !type.show.quantite; if(!type.show.quantite) quantite.value = ''; }

  updateAttributionSummary();
}

function getTypeLabel(type) {
  if (!type) return '';
  if (attributionTypes && attributionTypes[type] && attributionTypes[type].label) return attributionTypes[type].label;
  return type;
}

function buildSummaryTable(headers, rows) {
  const table = document.createElement('table');
  table.className = 'summary-table';

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
    r.forEach(cell => {
      const td = document.createElement('td');
      td.textContent = cell || '';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  return table;
}

function updateAttributionSummary() {
  const container = document.getElementById('attributionSummary');
  if (!container) return;

  const rows = [];
  const trs = document.querySelectorAll('#attributionTbody tr');
  trs.forEach(tr => {
    const type = tr.querySelector('select')?.value || '';
    const marque = tr.querySelector('.marque')?.value?.trim() || '';
    const nom = tr.querySelector('.nom')?.value?.trim() || '';
    const serie = tr.querySelector('.serie')?.value?.trim() || '';
    const quantite = tr.querySelector('.quantite')?.value?.trim() || '';
    const hasAny = type || marque || nom || serie || quantite;
    if (!hasAny) return;

    rows.push([
      getTypeLabel(type),
      marque,
      nom,
      serie,
      quantite
    ]);
  });

  container.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'summary-title';
  title.textContent = 'Résumé - Attribution';
  container.appendChild(title);

  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'summary-empty';
    empty.textContent = 'Aucun élément';
    container.appendChild(empty);
    return;
  }

  const headers = ['Type', 'Marque', 'Nom', 'N° de série', 'Quantité'];
  container.appendChild(buildSummaryTable(headers, rows));
}

function readFieldValue(container, field) {
  if (!container) return '';
  const el = container.querySelector(`[data-field="${field}"]`);
  if (!el) return '';
  return (el.value || '').trim();
}

function getRetourTypeLabel(actionBlock, type) {
  let label = getTypeLabel(type);
  if (type === 'Autres' && actionBlock) {
    const cb = actionBlock.querySelector(`input[type="checkbox"][data-type="${type}"]`);
    const cbLabel = cb ? cb.closest('label') : null;
    const extra = cbLabel ? cbLabel.querySelector('input[type="text"]') : null;
    const extraVal = extra ? extra.value.trim() : '';
    if (extraVal) label = `${label} - ${extraVal}`;
  }
  return label;
}

function updateActionSummary(block) {
  if (!block) return;
  const summary = block.querySelector('.action-summary');
  if (!summary) return;

  const actionSelect = block.querySelector('.action-header select');
  const actionVal = actionSelect ? actionSelect.value : '';
  const actionLabels = { Ajout: 'Ajout du mat\u00e9riel', Changement: 'Changement du mat\u00e9riel', Retour: 'Retour du mat\u00e9riel', Autre: 'Autre action' };

  summary.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'summary-title';
  title.textContent = actionVal ? `R\u00e9sum\u00e9 - ${actionLabels[actionVal] || actionVal}` : 'R\u00e9sum\u00e9 de l\'action';
  summary.appendChild(title);

  const headers = ['R\u00f4le', 'Type', 'Marque', 'Nom', 'N\u00b0 de s\u00e9rie', 'Quantit\u00e9', '\u00c9tat', 'Commentaire'];
  const rows = [];

  if (actionVal === 'Ajout' || actionVal === 'Changement') {
    const nouveauBlock = block.querySelector('.sub-block[data-role="nouveau"]');
    const retourBlock = block.querySelector('.sub-block[data-role="retour"]');

    if (actionVal === 'Changement' && retourBlock) {
      const type = readFieldValue(retourBlock, 'type');
      const hasAny = type || readFieldValue(retourBlock, 'marque') || readFieldValue(retourBlock, 'nom') || readFieldValue(retourBlock, 'serie') || readFieldValue(retourBlock, 'quantite') || readFieldValue(retourBlock, 'etat') || readFieldValue(retourBlock, 'comment');
      if (hasAny) {
        rows.push([
          'Retourn\u00e9',
          getTypeLabel(type),
          readFieldValue(retourBlock, 'marque'),
          readFieldValue(retourBlock, 'nom'),
          readFieldValue(retourBlock, 'serie'),
          readFieldValue(retourBlock, 'quantite'),
          readFieldValue(retourBlock, 'etat'),
          readFieldValue(retourBlock, 'comment')
        ]);
      }
    }

    if (nouveauBlock) {
      const type = readFieldValue(nouveauBlock, 'type');
      const hasAny = type || readFieldValue(nouveauBlock, 'marque') || readFieldValue(nouveauBlock, 'nom') || readFieldValue(nouveauBlock, 'serie') || readFieldValue(nouveauBlock, 'quantite') || readFieldValue(nouveauBlock, 'etat') || readFieldValue(nouveauBlock, 'comment');
      if (hasAny) {
        rows.push([
          'Re\u00e7u',
          getTypeLabel(type),
          readFieldValue(nouveauBlock, 'marque'),
          readFieldValue(nouveauBlock, 'nom'),
          readFieldValue(nouveauBlock, 'serie'),
          readFieldValue(nouveauBlock, 'quantite'),
          readFieldValue(nouveauBlock, 'etat'),
          readFieldValue(nouveauBlock, 'comment')
        ]);
      }
    }
  } else if (actionVal === 'Retour') {
    const inlineBlocks = block.querySelectorAll('.retour-inline-fields');
    inlineBlocks.forEach(inlineBlock => {
      const type = inlineBlock.dataset.type || '';
      const typeLabel = getRetourTypeLabel(block, type);
      const hasAny = type || readFieldValue(inlineBlock, 'marque') || readFieldValue(inlineBlock, 'nom') || readFieldValue(inlineBlock, 'serie') || readFieldValue(inlineBlock, 'quantite') || readFieldValue(inlineBlock, 'etat') || readFieldValue(inlineBlock, 'comment');
      if (!hasAny) return;
      rows.push([
        'Restitu\u00e9',
        typeLabel,
        readFieldValue(inlineBlock, 'marque'),
        readFieldValue(inlineBlock, 'nom'),
        readFieldValue(inlineBlock, 'serie'),
        readFieldValue(inlineBlock, 'quantite'),
        readFieldValue(inlineBlock, 'etat'),
        readFieldValue(inlineBlock, 'comment')
      ]);
    });
  }

  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'summary-empty';
    empty.textContent = 'Aucun \u00e9l\u00e9ment';
    summary.appendChild(empty);
    return;
  }

  summary.appendChild(buildSummaryTable(headers, rows));
}

function attachActionSummaryListeners(block) {
  if (!block) return;
  if (block.dataset.summaryBound === '1') return;
  block.dataset.summaryBound = '1';
  block.addEventListener('input', () => updateActionSummary(block));
  block.addEventListener('change', () => updateActionSummary(block));
}

const btnAddAttr = document.getElementById("btnAddAttributionRow");
if (btnAddAttr) {
  btnAddAttr.onclick = addAttributionRow;
}
const attributionTable = document.getElementById("attributionTable");
if (attributionTable) {
  attributionTable.addEventListener('input', updateAttributionSummary);
  attributionTable.addEventListener('change', updateAttributionSummary);
}
updateAttributionSummary();

/* ========== Bloc 2 (Suivi) ========== */
let actionCounter = 0;
const actionsContainer = document.getElementById('actionsSuiviContainer');
const btnAddAction = document.getElementById('btnAddAction');

if (btnAddAction && actionsContainer) {
  btnAddAction.addEventListener('click', () => {
    const actionId = ++actionCounter;
    const actionBlock = createActionBlock(actionId);
    actionsContainer.appendChild(actionBlock);
  });
}

function createActionBlock(id) {
  const block = document.createElement('div');
  block.className = 'action-block';
  block.dataset.actionId = id;

  const header = document.createElement('div');
  header.className = 'action-header';

  const left = document.createElement('div');
  left.className = 'actions-left';

  const select = document.createElement('select');
  select.className = 'small';
  select.innerHTML = `
    <option value="">-- Sélectionner l'action --</option>
    <option value="Ajout">Ajout du matériel</option>
    <option value="Changement">Changement du matériel</option>
    <option value="Retour">Retour du matériel</option>
    <option value="Autre">Autre Action</option>
  `;
  left.appendChild(select);

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'small';
  dateInput.style.width = '150px';
  left.appendChild(dateInput);

  header.appendChild(left);

  const btns = document.createElement('div');
  btns.style.display = 'flex';
  btns.style.gap = '8px';

  const btnDup = document.createElement('button');
  btnDup.type = 'button';
  btnDup.className = 'no-pdf small';
  btnDup.textContent = 'Dupliquer';
  btnDup.onclick = () => duplicateAction(block);
  btns.appendChild(btnDup);

  const btnRemove = document.createElement('button');
  btnRemove.type = 'button';
  btnRemove.className = 'no-pdf small';
  btnRemove.textContent = 'Supprimer';
  btnRemove.onclick = () => block.remove();
  btns.appendChild(btnRemove);

  header.appendChild(btns);

  const content = document.createElement('div');
  content.className = 'action-content';

  const otherDesc = document.createElement('textarea');
  otherDesc.placeholder = 'Déscription (si Autre)';
  otherDesc.style.display = 'none';

  const retourBlock = createMaterielSubBlock(id, 'retour');
  const nouveauBlock = createMaterielSubBlock(id, 'nouveau');
  const retourCheckboxBlock = createRetourCheckboxBlock(id);

  block.appendChild(header);
  block.appendChild(content);
  content.appendChild(otherDesc);

  const summary = document.createElement('div');
  summary.className = 'summary-block action-summary';
  summary.innerHTML = '<div class="summary-title">Résumé de l\'action</div><div class="summary-empty">Aucun élément</div>';
  block.appendChild(summary);

  select.addEventListener('change', (e) => {
    const val = e.target.value;
    [retourBlock, nouveauBlock, retourCheckboxBlock].forEach(sb => { if (sb.parentNode === content) content.removeChild(sb); });
    otherDesc.style.display = 'none';
    if (val === 'Ajout') content.appendChild(nouveauBlock);
    else if (val === 'Changement') { content.appendChild(retourBlock); content.appendChild(nouveauBlock); }
    else if (val === 'Retour') content.appendChild(retourCheckboxBlock);
    else if (val === 'Autre') otherDesc.style.display = 'block';
    updateActionSummary(block);
  });

  attachActionSummaryListeners(block);
  updateActionSummary(block);
  return block;
}

function duplicateAction(block) {
  // 1. Créer le clone
  const clone = block.cloneNode(true);
  const newId = ++actionCounter;
  clone.dataset.actionId = newId;

  // 2. Gérer les boutons du clone
  const select = clone.querySelector('select');
  const btnDup = clone.querySelector('button:nth-of-type(1)'); // Premier bouton (Dupliquer)
  const btnRemove = clone.querySelector('button:nth-of-type(2)'); // Deuxième bouton (Supprimer)

  // Supprimer le bouton "Dupliquer" du clone
  if (btnDup && btnDup.textContent === 'Dupliquer') {
    btnDup.remove();
  }

  // Ré-attachement de l'événement Supprimer sur le clone
  if (btnRemove) {
    btnRemove.onclick = () => {
      clone.remove();
    };
  }

  // Ré-attachement de l'événement Change du Select
  if (select) {
    select.addEventListener('change', (e) => {
      const val = e.target.value;
      const content = clone.querySelector('.action-content');
      const otherDesc = content.querySelector('textarea');

      // Sous-blocs propres au clone
      const retourBlock = createMaterielSubBlock(newId, 'retour');
      const nouveauBlock = createMaterielSubBlock(newId, 'nouveau');
      const retourCheckboxBlock = createRetourCheckboxBlock(newId);

      // Nettoyage et affichage
      content.querySelectorAll('.sub-block').forEach(sb => sb.remove());
      otherDesc.style.display = 'none';

      if (val === 'Ajout') content.appendChild(nouveauBlock);
      else if (val === 'Changement') { content.appendChild(retourBlock); content.appendChild(nouveauBlock); }
      else if (val === 'Retour') content.appendChild(retourCheckboxBlock);
      else if (val === 'Autre') otherDesc.style.display = 'block';

      updateActionSummary(clone);
    });
  }

  attachActionSummaryListeners(clone);
  updateActionSummary(clone);

  // 3. Insérer le clone dans le DOM
  block.parentNode.insertBefore(clone, block.nextSibling);
}

function createMaterielSubBlock(actionId, role) {
  const container = document.createElement('div');
  container.className = 'sub-block';
  container.dataset.role = role;
  container.style.marginTop = '12px';
  container.style.padding = '15px';
  container.style.background = role === 'nouveau' ? '#e8f5e9' : '#fff3e0';
  container.style.borderRadius = '8px';
  container.style.border = role === 'nouveau' ? '2px solid #1e4f38' : '2px solid #aa711bff';

  const title = document.createElement('strong');
  title.textContent = (role === 'retour') ? 'Matériel retourné' : 'Matériel reçu';
  title.style.display = 'block';
  title.style.marginBottom = '12px';
  title.style.color = role === 'nouveau' ? '#1e4f38' : '#aa711bff';
  container.appendChild(title);

  const typeDiv = document.createElement('div');
  typeDiv.style.marginBottom = '12px';
  typeDiv.innerHTML = '<label style="font-weight:bold;">Type de matériel</label>';
  const typeSelect = document.createElement('select');
  typeSelect.dataset.field = 'type';
  typeSelect.innerHTML = `
    <option value="">-- Sélectionner le type --</option>
    <option value="Cles">Clés du bureau</option>
    <option value="Badge">Badge d'accès</option>
    <option value="LigneTel">Téléphone Cellulaire</option>
    <option value="Laptop">Ordinateur / Laptop</option>
    <option value="Moniteur">Moniteur</option>
    <option value="Tablette">Tablette</option>
    <option value="Accessoire">Accessoires</option>
    <option value="Autres">Autres</option>
  `;
  typeDiv.appendChild(typeSelect);
  container.appendChild(typeDiv);

  const fieldsContainer = document.createElement('div');

  const marqueDiv = document.createElement('div');
  marqueDiv.className = 'materiel-field';
  marqueDiv.style.marginTop = '8px';
  marqueDiv.innerHTML = '<label>Marque</label><input type="text">';
  const marqueInput = marqueDiv.querySelector('input');
  if (marqueInput) marqueInput.dataset.field = 'marque';
  fieldsContainer.appendChild(marqueDiv);

  const nomDiv = document.createElement('div');
  nomDiv.className = 'materiel-field';
  nomDiv.style.marginTop = '8px';
  nomDiv.innerHTML = "<label>Nom de l'ordinateur (si applicable)</label><input type=\"text\">";
  const nomInput = nomDiv.querySelector('input');
  if (nomInput) nomInput.dataset.field = 'nom';
  fieldsContainer.appendChild(nomDiv);

  const serieDiv = document.createElement('div');
  serieDiv.className = 'materiel-field';
  serieDiv.style.marginTop = '8px';
  serieDiv.innerHTML = '<label>N\u00b0 de s\u00e9rie</label><input type="text">';
  const serieInput = serieDiv.querySelector('input');
  if (serieInput) serieInput.dataset.field = 'serie';
  fieldsContainer.appendChild(serieDiv);

  const quantiteDiv = document.createElement('div');
  quantiteDiv.className = 'materiel-field';
  quantiteDiv.style.marginTop = '8px';
  quantiteDiv.innerHTML = '<label>Quantit\u00e9</label><input type="number" min="1" value="1" style="width:80px;">';
  const quantiteInput = quantiteDiv.querySelector('input');
  if (quantiteInput) quantiteInput.dataset.field = 'quantite';
  fieldsContainer.appendChild(quantiteDiv);

  const etatDiv = document.createElement('div');
  etatDiv.className = 'materiel-field';
  etatDiv.style.marginTop = '8px';
  etatDiv.innerHTML = '<label>\u00c9tat</label><select><option value="">-- S\u00e9lectionner --</option><option value="Bon">Bon</option><option value="Moyen">Moyen</option><option value="Mauvais">Mauvais</option></select>';
  const etatSelect = etatDiv.querySelector('select');
  if (etatSelect) etatSelect.dataset.field = 'etat';
  fieldsContainer.appendChild(etatDiv);

  const commentDiv = document.createElement('div');
  commentDiv.className = 'materiel-field';
  commentDiv.style.marginTop = '8px';
  commentDiv.innerHTML = '<label>Commentaire</label><textarea style="width:100%;min-height:60px;"></textarea>';
  const commentInput = commentDiv.querySelector('textarea');
  if (commentInput) commentInput.dataset.field = 'comment';
  fieldsContainer.appendChild(commentDiv);

  container.appendChild(fieldsContainer);

  const fieldConfig = {
    'Cles': { marque: false, nom: false, serie: false, quantite: true, etat: false, comment: false },
    'Badge': { marque: false, nom: false, serie: false, quantite: true, etat: false, comment: false },
    'LigneTel': { marque: true, nom: false, serie: true, quantite: false, etat: true, comment: true },
    'Laptop': { marque: true, nom: true, serie: true, quantite: false, etat: true, comment: true },
    'Moniteur': { marque: true, nom: false, serie: true, quantite: false, etat: true, comment: true },
    'Tablette': { marque: true, nom: false, serie: true, quantite: false, etat: true, comment: true },
    'Accessoire': { marque: true, nom: true, serie: true, quantite: false, etat: true, comment: true },
    'Autres': { marque: true, nom: true, serie: true, quantite: false, etat: true, comment: true }
  };

  const fieldRefs = [
    { key: 'marque', wrapper: marqueDiv, input: marqueDiv.querySelector('input') },
    { key: 'nom', wrapper: nomDiv, input: nomDiv.querySelector('input') },
    { key: 'serie', wrapper: serieDiv, input: serieDiv.querySelector('input') },
    { key: 'quantite', wrapper: quantiteDiv, input: quantiteDiv.querySelector('input') },
    { key: 'etat', wrapper: etatDiv, input: etatDiv.querySelector('select') },
    { key: 'comment', wrapper: commentDiv, input: commentDiv.querySelector('textarea') }
  ];

  function setFieldState(wrapper, input, enabled) {
    if (!wrapper || !input) return;
    wrapper.classList.toggle('field-disabled', !enabled);
    input.disabled = !enabled;
    if (!enabled) {
      input.value = '';
    }
  }

  function applyTypeConfig(typeValue) {
    const config = fieldConfig[typeValue];
    if (!config) {
      fieldRefs.forEach(f => setFieldState(f.wrapper, f.input, false));
      return;
    }
    fieldRefs.forEach(f => {
      setFieldState(f.wrapper, f.input, !!config[f.key]);
    });
  }

  typeSelect.addEventListener('change', function() {
    applyTypeConfig(this.value);
  });

  applyTypeConfig(typeSelect.value);
  // Signatures
  const sigDiv = document.createElement('div');
  sigDiv.className = 'two-col';
  sigDiv.style.marginTop = '12px';
  sigDiv.innerHTML = '<div><label style="font-weight:bold;">Signature de l\'employé</label><input type="text"></div><div><label style="font-weight:bold;">Signature du gestionnaire</label><input type="text"></div>';
  container.appendChild(sigDiv);


  return container;
}

/* ========== Bloc 3 Restitution ========== */
function createRetourCheckboxBlock(actionId) {
  const container = document.createElement('div');
  container.className = 'sub-block retour-checkbox-block';
  container.style.marginTop = '12px';
  container.style.padding = '15px';
  container.style.background = '#fef9f0';
  container.style.borderRadius = '8px';
  container.style.border = '2px solid #c0392b';

  const title = document.createElement('h4');
  title.textContent = 'Restitution du Matériel';
  title.style.margin = '0 0 15px 0';
  title.style.color = '#c0392b';
  title.style.borderBottom = '2px solid #c0392b';
  title.style.paddingBottom = '8px';
  container.appendChild(title);

  const labelCheck = document.createElement('label');
  labelCheck.textContent = 'Matériel restitué (Sélectionnez tous les matériels correspondants)';
  labelCheck.style.fontWeight = 'bold';
  labelCheck.style.display = 'block';
  labelCheck.style.marginBottom = '10px';
  container.appendChild(labelCheck);

  const checkboxesDiv = document.createElement('div');
  checkboxesDiv.style.display = 'flex';
  checkboxesDiv.style.flexWrap = 'wrap';
  checkboxesDiv.style.gap = '10px';
  checkboxesDiv.style.marginBottom = '12px';

  const materialTypes = [
    { type: 'Cles', label: 'Clés du bureau' },
    { type: 'Badge', label: 'Badge d\'accès' },
    { type: 'LigneTel', label: 'Téléphone Cellulaire' },
    { type: 'Laptop', label: 'Ordinateur / Laptop' },
    { type: 'Moniteur', label: 'Moniteur' },
    { type: 'Tablette', label: 'Tablette' },
    { type: 'Accessoire', label: 'Accessoires' },
    { type: 'Autres', label: 'Autres' }
  ];

  const tablesContainer = document.createElement('div');
  tablesContainer.style.marginTop = '12px';

  materialTypes.forEach(mat => {
    const label = document.createElement('label');
    label.className = 'checkbox-item';
    // Forcer le style pour que le label s'élargisse quand l'input apparaît
    label.style.display = 'inline-flex';
    label.style.alignItems = 'center';
    label.style.whiteSpace = 'nowrap';
    label.style.minHeight = '30px';
    label.style.padding = '5px 10px';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.type = mat.type;
    checkbox.dataset.actionId = actionId;
    checkbox.style.marginRight = '8px';

    const textSpan = document.createElement('span');
    textSpan.textContent = mat.label;

    label.appendChild(checkbox);
    label.appendChild(textSpan);

    // Champ auto-extensible pour "Autres"
    if (mat.type === 'Autres') {
      const preciserInput = document.createElement('input');
      preciserInput.type = 'text';
      preciserInput.placeholder = 'Précisez...';
      preciserInput.style.display = 'none'; // Caché par défaut
      preciserInput.style.marginLeft = '10px';
      preciserInput.style.border = '1px solid #ccc';
      preciserInput.style.borderRadius = '4px';
      preciserInput.style.padding = '2px 5px';
      preciserInput.style.width = '150px'; // largeur minimale de départ

      label.appendChild(preciserInput);

      // Auto-élargissement
      preciserInput.addEventListener('input', function() {
        const textLength = this.value.length;
        const newWidth = Math.max(150, textLength * 8 + 20);
        this.style.width = newWidth + 'px';
      });

      // Déclencheur
      checkbox.addEventListener('change', function() {
        if (this.checked) {
          preciserInput.style.display = 'inline-block';
          preciserInput.focus();
        } else {
          preciserInput.style.display = 'none';
        }

        if (typeof handleRetourActionToggle === "function") {
          handleRetourActionToggle(this, tablesContainer, actionId);
        }
      });
    } else {
      // Comportement normal pour les autres cases
      checkbox.addEventListener('change', function() {
        if (typeof handleRetourActionToggle === "function") {
          handleRetourActionToggle(this, tablesContainer, actionId);
        }
      });
    }

    checkboxesDiv.appendChild(label);
  });

  container.appendChild(checkboxesDiv);
  container.appendChild(tablesContainer);

  // Motif
  const motifDiv = document.createElement('div');
  motifDiv.style.marginTop = '15px';
  motifDiv.innerHTML = '<label style="font-weight:bold;">Motif de restitution :</label>';
  const motifSelect = document.createElement('select');
  motifSelect.innerHTML = '<option value="">-- Sélectionner --</option><option value="Reparation">En Réparation</option><option value="Endommager">Endommager</option><option value="Départ">Départ</option><option value="Autres">Autres</option>';
  motifDiv.appendChild(motifSelect);
  container.appendChild(motifDiv);

  const ReparationDiv = document.createElement('div');
  ReparationDiv.style.display = 'none';
  ReparationDiv.style.marginTop = '8px';
  ReparationDiv.innerHTML = '<label>Déscription:</label><input type="text" style="width:100%;">';
  container.appendChild(ReparationDiv);

  const EndommagerDiv = document.createElement('div');
  EndommagerDiv.style.display = 'none';
  EndommagerDiv.style.marginTop = '8px';
  EndommagerDiv.innerHTML = '<label>Déscription:</label><input type="text" style="width:100%;">';
  container.appendChild(EndommagerDiv);

  const autresDiv = document.createElement('div');
  autresDiv.style.display = 'none';
  autresDiv.style.marginTop = '8px';
  autresDiv.innerHTML = '<label>Veuillez préciser :</label><input type="text" style="width:100%;">';
  container.appendChild(autresDiv);

  const dateDiv = document.createElement('div');
  dateDiv.style.display = 'none';
  dateDiv.style.marginTop = '8px';
  dateDiv.innerHTML = '<label>Date de départ :</label><input type="date">';
  container.appendChild(dateDiv);

  motifSelect.addEventListener('change', function() {
    dateDiv.style.display = this.value === 'Départ' ? 'block' : 'none';
    autresDiv.style.display = this.value === 'Autres' ? 'block' : 'none';
    ReparationDiv.style.display = this.value === 'Reparation' ? 'block' : 'none';
    EndommagerDiv.style.display = this.value === 'Endommager' ? 'block' : 'none';
  });

  // Déclaration (texte simple sans cadre, comme Attribution)
  const declDiv = document.createElement('div');
  declDiv.style.marginTop = '15px';

  const declLabel = document.createElement('label');
  declLabel.style.fontWeight = 'bold';
  declLabel.style.display = 'block';
  declLabel.style.marginBottom = '8px';
  declLabel.textContent = 'Déclaration de l\'employé';
  declDiv.appendChild(declLabel);

  const declText = document.createElement('div');
  declText.className = 'declaration-text';
  declText.style.fontFamily = 'Segoe UI, Arial, sans-serif';
  declText.style.fontSize = '18px';
  declText.style.lineHeight = '1.7';
  declText.style.color = '#222';
  declText.style.whiteSpace = 'pre-wrap';
  declText.style.wordWrap = 'break-word';
  declText.style.padding = '0';
  declText.style.margin = '8px 0';
  declText.style.background = 'transparent';
  declText.style.border = 'none';
  declText.style.textAlign = 'justify';
  declText.textContent = 'L\'employé déclare avoir restitué tout matériel appartenant au CDÉNÉ et avoir complété la passation de consignes.';
  declDiv.appendChild(declText);

  container.appendChild(declDiv);

  // Réserves
  const resDiv = document.createElement('div');
  resDiv.style.marginTop = '12px';

  const resLabel = document.createElement('label');
  resLabel.style.fontWeight = 'bold';
  resLabel.style.display = 'block';
  resLabel.style.marginBottom = '8px';
  resLabel.textContent = 'Réserves éventuelles (Remplie par le (a) gestionnaire)';
  resDiv.appendChild(resLabel);

  const resTextarea = document.createElement('textarea');
  resTextarea.className = 'reserve-textarea';
  resTextarea.style.width = '100%';
  resTextarea.style.minHeight = '80px';
  resTextarea.placeholder = 'Entrez vos réserves éventuelles ici...';
  resDiv.appendChild(resTextarea);

  container.appendChild(resDiv);

  // Date restitution
  const dateRestDiv = document.createElement('div');
  dateRestDiv.style.marginTop = '12px';
  dateRestDiv.innerHTML = '<label style="font-weight:bold;">Date de restitution</label><input type="date">';
  container.appendChild(dateRestDiv);

  // Signatures
  const sigDiv = document.createElement('div');
  sigDiv.className = 'two-col';
  sigDiv.style.marginTop = '12px';
  sigDiv.innerHTML = '<div><label style="font-weight:bold;">Signature de l\'employé</label><input type="text"></div><div><label style="font-weight:bold;">Signature du gestionnaire</label><input type="text"></div>';
  container.appendChild(sigDiv);

  return container;
}

function handleRetourActionToggle(checkbox, tablesContainer, actionId) {
  const type = checkbox.dataset.type;
  const blockId = `retourInline-${actionId}-${type}`;
  const anchor = checkbox.closest('label');
  if (checkbox.checked) {
    if (!document.getElementById(blockId)) {
      const block = createRetourInlineFields(type, actionId);
      block.id = blockId;
      if (anchor && anchor.parentNode) {
        anchor.insertAdjacentElement('afterend', block);
      } else if (tablesContainer) {
        tablesContainer.appendChild(block);
      }
    }
  } else {
    const b = document.getElementById(blockId);
    if (b) b.remove();
  }

  const actionBlock = checkbox.closest('.action-block');
  if (actionBlock) updateActionSummary(actionBlock);
}

function createRetourInlineFields(type, actionId) {
  const container = document.createElement('div');
  container.className = 'retour-inline-fields';
  container.dataset.type = type;
  container.dataset.actionId = actionId;

  const title = document.createElement('div');
  title.className = 'retour-inline-title';
  const label = (attributionTypes && attributionTypes[type] && attributionTypes[type].label) ? attributionTypes[type].label : type;
  title.textContent = `D\u00e9tails - ${label}`;
  container.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'retour-inline-grid';
  container.appendChild(grid);

  const marqueDiv = document.createElement('div');
  marqueDiv.className = 'retour-field';
  marqueDiv.innerHTML = '<label>Marque</label><input type="text">';
  const marqueInput = marqueDiv.querySelector('input');
  if (marqueInput) marqueInput.dataset.field = 'marque';
  grid.appendChild(marqueDiv);

  const nomDiv = document.createElement('div');
  nomDiv.className = 'retour-field';
  nomDiv.innerHTML = "<label>Nom de l'ordinateur (si applicable)</label><input type=\"text\">";
  const nomInput = nomDiv.querySelector('input');
  if (nomInput) nomInput.dataset.field = 'nom';
  grid.appendChild(nomDiv);

  const serieDiv = document.createElement('div');
  serieDiv.className = 'retour-field';
  serieDiv.innerHTML = '<label>N\u00b0 de s\u00e9rie</label><input type="text">';
  const serieInput = serieDiv.querySelector('input');
  if (serieInput) serieInput.dataset.field = 'serie';
  grid.appendChild(serieDiv);

  const quantiteDiv = document.createElement('div');
  quantiteDiv.className = 'retour-field';
  quantiteDiv.innerHTML = '<label>Quantit\u00e9</label><input type="number" min="1" value="1" style="width:80px;">';
  const quantiteInput = quantiteDiv.querySelector('input');
  if (quantiteInput) quantiteInput.dataset.field = 'quantite';
  grid.appendChild(quantiteDiv);

  const etatDiv = document.createElement('div');
  etatDiv.className = 'retour-field';
  etatDiv.innerHTML = '<label>\u00c9tat</label><select><option value="">-- S\u00e9lectionner --</option><option value="Bon">Bon</option><option value="Moyen">Moyen</option><option value="Mauvais">Mauvais</option></select>';
  const etatSelect = etatDiv.querySelector('select');
  if (etatSelect) etatSelect.dataset.field = 'etat';
  grid.appendChild(etatDiv);

  const commentDiv = document.createElement('div');
  commentDiv.className = 'retour-field field-full';
  commentDiv.innerHTML = '<label>Commentaire</label><textarea style="width:100%;min-height:60px;"></textarea>';
  const commentInput = commentDiv.querySelector('textarea');
  if (commentInput) commentInput.dataset.field = 'comment';
  grid.appendChild(commentDiv);

  const fieldConfig = {
    'Cles': { marque: false, nom: false, serie: false, quantite: true, etat: false, comment: false },
    'Badge': { marque: false, nom: false, serie: false, quantite: true, etat: false, comment: false },
    'LigneTel': { marque: true, nom: false, serie: true, quantite: false, etat: true, comment: true },
    'Laptop': { marque: true, nom: true, serie: true, quantite: false, etat: true, comment: true },
    'Moniteur': { marque: true, nom: false, serie: true, quantite: false, etat: true, comment: true },
    'Tablette': { marque: true, nom: false, serie: true, quantite: false, etat: true, comment: true },
    'Accessoire': { marque: true, nom: true, serie: true, quantite: false, etat: true, comment: true },
    'Autres': { marque: true, nom: true, serie: true, quantite: false, etat: true, comment: true }
  };

  const fieldRefs = [
    { key: 'marque', wrapper: marqueDiv, input: marqueDiv.querySelector('input') },
    { key: 'nom', wrapper: nomDiv, input: nomDiv.querySelector('input') },
    { key: 'serie', wrapper: serieDiv, input: serieDiv.querySelector('input') },
    { key: 'quantite', wrapper: quantiteDiv, input: quantiteDiv.querySelector('input') },
    { key: 'etat', wrapper: etatDiv, input: etatDiv.querySelector('select') },
    { key: 'comment', wrapper: commentDiv, input: commentDiv.querySelector('textarea') }
  ];

  function setFieldState(wrapper, input, enabled) {
    if (!wrapper || !input) return;
    wrapper.classList.toggle('field-disabled', !enabled);
    input.disabled = !enabled;
    if (!enabled) {
      input.value = '';
    }
  }

  const config = fieldConfig[type];
  if (!config) {
    fieldRefs.forEach(f => setFieldState(f.wrapper, f.input, false));
  } else {
    fieldRefs.forEach(f => setFieldState(f.wrapper, f.input, !!config[f.key]));
  }

  return container;
}

function createReturnTable(type) {
  const cfg = returnConfig[type];
  const wrap = document.createElement('div');
  wrap.id = `returnTableBlock-${type}`;
  wrap.className = 'material-table-block';
  wrap.style.margin = '10px 0 18px 0';
  wrap.style.padding = '10px';
  wrap.style.border = '1px solid #7a9ab8';
  wrap.style.borderRadius = '8px';
  wrap.style.background = '#eef6fb';

  const header = document.createElement('div');
  header.style.display='flex';
  header.style.justifyContent='space-between';
  header.style.alignItems='center';

  const t = document.createElement('strong');
  t.textContent = (returnConfig[type].title || type);
  header.appendChild(t);

  const controls = document.createElement('div');
  controls.className = 'controls';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = '➕ Ajouter';
  addBtn.style.marginRight = '8px';
  addBtn.classList.add('no-pdf');
  addBtn.onclick = () => addReturnRow(type);
  controls.appendChild(addBtn);

  const removeBlockBtn = document.createElement('button');
  removeBlockBtn.type = 'button';
  removeBlockBtn.textContent = '❌';
  removeBlockBtn.classList.add('no-pdf');
  removeBlockBtn.onclick = () => {
    const cb = document.querySelector(`#returnMaterialCheckboxes input[data-type="${type}"]`);
    if (cb) { cb.checked = false; }
    wrap.remove();
  };
  controls.appendChild(removeBlockBtn);

  header.appendChild(controls);
  wrap.appendChild(header);

  const table = document.createElement('table');
  table.style.width='100%';
  table.style.borderCollapse='collapse';
  table.style.marginTop='10px';
  table.dataset.type = type;

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  cfg.columns.forEach(c => {
    const th = document.createElement('th');
    th.textContent = c.label;
    th.style.borderBottom='2px solid #b8d5e8';
    th.style.padding='6px';
    trh.appendChild(th);
  });
  const thd = document.createElement('th'); thd.style.width='60px'; trh.appendChild(thd);
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  wrap.appendChild(table);

  addReturnRow(type);
  return wrap;
}

function addReturnRow(type) {
  const cfg = returnConfig[type];
  const block = document.querySelector(`#returnTableBlock-${type}`);
  if (!block) return;
  const table = block.querySelector('table');
  const tbody = table.querySelector('tbody');

  const tr = document.createElement('tr');
  tr.style.borderBottom='1px solid #e0eef7';

  cfg.columns.forEach(col => {
    const td = document.createElement('td');
    td.style.padding='6px';
    const input = document.createElement('input');
    input.type='text';
    input.name=`restitution[${type}][][${col.key}]`;
    input.value=cfg.defaultRow[col.key] || '';
    input.style.width='100%';
    input.style.boxSizing='border-box';
    input.style.padding='6px';
    input.style.border='1px solid #9fb7cc';
    input.style.borderRadius='6px';
    td.appendChild(input);
    tr.appendChild(td);
  });

  const tdDel = document.createElement('td');
  tdDel.style.padding='6px';
  const delBtn = document.createElement('button');
  delBtn.type='button';
  delBtn.textContent='Supprimer';
  delBtn.classList.add('no-pdf');
  delBtn.onclick = () => tr.remove();
  tdDel.appendChild(delBtn);
  tr.appendChild(tdDel);

  tbody.appendChild(tr);
}

function toggleDepartDateReturn() {
  const motif = document.getElementById('motifRestitution');
  if (!motif) return;

  const dateDepartBlock = document.getElementById('dateDepartBlock');
  const dernierBlock = document.getElementById('dernierJourBlock');
  if (motif.value === 'Départ') {
    if (dernierBlock) dernierBlock.style.display = 'block';
    if (dateDepartBlock) dateDepartBlock.style.display = 'block';
  } else {
    if (dernierBlock) dernierBlock.style.display = 'none';
    if (dateDepartBlock) dateDepartBlock.style.display = 'none';
    const dj = document.getElementById('dernierJour'); if (dj) dj.value = '';
    const dd = document.getElementById('dateDepart'); if (dd) dd.value = '';
  }
}

// Auto-ajustement des textareas à la hauteur du contenu
function autoResizeTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  const scrollHeight = textarea.scrollHeight;
  const newHeight = Math.max(60, Math.min(scrollHeight, 400));
  textarea.style.height = newHeight + 'px';
}

// Fonction globale pour redimensionner tous les textareas
function resizeAllTextareas() {
  document.querySelectorAll('textarea').forEach(ta => {
    autoResizeTextarea(ta);
  });
}

// Événement input pour le redimensionnement en temps réel
document.addEventListener('input', (e) => {
  if (e.target && e.target.tagName === 'TEXTAREA') {
    autoResizeTextarea(e.target);
  }
});

// Observer pour détecter les nouveaux textareas ajoutés dynamiquement
const mutationObserver = new MutationObserver((mutations) => {
  let hasNewTextarea = false;
  mutations.forEach((mutation) => {
    if (mutation.addedNodes.length > 0) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Node.ELEMENT_NODE
          if (node.tagName === 'TEXTAREA') {
            hasNewTextarea = true;
            setTimeout(() => autoResizeTextarea(node), 10);
            node.addEventListener('input', () => autoResizeTextarea(node));
          } else if (node.querySelectorAll) {
            const textareas = node.querySelectorAll('textarea');
            if (textareas.length > 0) {
              hasNewTextarea = true;
              textareas.forEach(ta => {
                setTimeout(() => autoResizeTextarea(ta), 10);
                ta.addEventListener('input', () => autoResizeTextarea(ta));
              });
            }
          }
        }
      });
    }
  });
});

// Initialiser l'observateur au chargement du DOM
function initTextareaObserver() {
  const form = document.querySelector('form') || document.body;
  mutationObserver.observe(form, {
    childList: true,
    subtree: true,
    characterData: false,
    attributes: false
  });
  
  // Redimensionner tous les textareas existants
  resizeAllTextareas();
  document.querySelectorAll('textarea').forEach(ta => {
    ta.addEventListener('input', () => autoResizeTextarea(ta));
    ta.addEventListener('change', () => autoResizeTextarea(ta));
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTextareaObserver);
} else {
  initTextareaObserver();
}

const btnPDF = document.getElementById('btnDownloadPDF');
if (btnPDF) {
  btnPDF.addEventListener('click', async () => {
    await sendEntriesToSupabase('pdf');
    genererPDFGlobal();
  });
}

const blocAttribution = document.getElementById('blocAttribution');
if (blocAttribution) {
  blocAttribution.addEventListener('input', scheduleAutoSave);
  blocAttribution.addEventListener('change', scheduleAutoSave);
}

const blocSuivi = document.getElementById('blocSuiviRestitution');
if (blocSuivi) {
  blocSuivi.addEventListener('input', scheduleAutoSave);
  blocSuivi.addEventListener('change', scheduleAutoSave);
}


// Generate pdf global ////////////////////////////////
async function genererPDFGlobal() {
  try {
    const { jsPDF } = window.jspdf;
    const element = document.getElementById('formMateriel');
    if (!element) return;

    // --- 1. PRÉPARATION DES STYLES ET NETTOYAGE ---
    const originalStyle = element.style.cssText;
    const inputs = element.querySelectorAll('input, textarea');
    const originalPlaceholders = [];

    // Sauvegarder et vider les placeholders si le champ est vide
    inputs.forEach(input => {
      originalPlaceholders.push({ el: input, txt: input.placeholder });
      if (!input.value.trim()) {
        input.placeholder = ""; 
      }
    });
    
    // Uniformiser le fond pour la capture
    element.style.boxShadow = 'none'; 
    element.style.margin = '0';
    element.style.padding = '20px'; 
    element.style.width = '1000px'; 
    element.style.backgroundColor = '#c9d9e8';

    // --- 2. TRANSFORMATION DU TEXTAREA EN "FICHE" ---
    const reserveTextarea = document.querySelector('.reserve-textarea');
    let tempDiv = null;

    if (reserveTextarea) {
        tempDiv = document.createElement('div');
        tempDiv.innerText = reserveTextarea.value || ""; // Ne pas afficher le placeholder ici non plus
        
        tempDiv.style.width = reserveTextarea.offsetWidth + 'px';
        tempDiv.style.fontSize = window.getComputedStyle(reserveTextarea).fontSize;
        tempDiv.style.fontFamily = window.getComputedStyle(reserveTextarea).fontFamily;
        tempDiv.style.color = "#222";
        tempDiv.style.whiteSpace = "pre-wrap";
        tempDiv.style.background = "transparent";
        tempDiv.style.border = "none";
        tempDiv.style.padding = "0";
        tempDiv.style.marginBottom = "20px";

        reserveTextarea.style.display = 'none';
        reserveTextarea.parentNode.insertBefore(tempDiv, reserveTextarea);
    }

    // --- 3. CAPTURE HAUTE DÉFINITION ---
    // On utilise scrollHeight pour être certain de prendre toute la hauteur, même si c'est long
    const canvas = await html2canvas(element, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#c9d9e8',
      logging: false,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight 
    });

    // --- 4. RESTAURATION DE L'INTERFACE ---
    element.style.cssText = originalStyle;
    
    // Restaurer les placeholders pour l'utilisateur
    originalPlaceholders.forEach(item => {
      item.el.placeholder = item.txt;
    });

    if (reserveTextarea && tempDiv) {
        reserveTextarea.style.display = 'block';
        tempDiv.remove();
    }

    // --- 5. CRÉATION DU PDF ---
    const imgData = canvas.toDataURL('image/png', 1.0);
    const pdfWidth = 595.28; // A4 point width
    const margin = 15;
    const usableWidth = pdfWidth - (margin * 2);
    
    // Calcul de la hauteur proportionnelle
    const imgHeight = (canvas.height * usableWidth) / canvas.width;

    // Création du PDF avec une hauteur dynamique pour éviter les coupures
    const pdf = new jsPDF({
    orientation: 'p',
    unit: 'pt',
    format: [pdfWidth, imgHeight + (margin * 2)],
    compress: true
   });

    // Fond bleu-gris
    pdf.setFillColor(201, 217, 232); 
    pdf.rect(0, 0, pdfWidth, pdf.internal.pageSize.getHeight(), 'F');

    // Image centrée
    pdf.addImage(
  imgData,
  'PNG',
  margin,
  margin,
  usableWidth,
  imgHeight,
  undefined,
  'FAST' // 👈 meilleur rendu / moins de perte
);

    pdf.save('Form_Attribution-Materiel.pdf');

  } catch (error) {
    console.error('Erreur lors de la génération du PDF:', error);
    alert("Une erreur est survenue lors de la création du PDF.");
  }
}
