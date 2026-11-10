(function () {
  const endpoint = '/api/delivery-projects';
  const statuses = ['BACKLOG', 'PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function pretty(value) {
    return String(value || '').toLowerCase().replaceAll('_', ' ').replace(/^\w/, letter => letter.toUpperCase());
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR');
  }

  function personId(person) {
    return person && typeof person === 'object' ? person._id : person || '';
  }

  function notify(dashboard, message, type) {
    dashboard.showNotification(message, type || 'info');
  }

  async function downloadDocument(url, filename, dashboard) {
    try {
      let response = await fetch(url, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('akime_token')}` }
      });
      if (response.status === 401 && await dashboard.refreshAccessToken()) {
        response = await fetch(url, {
          headers: { Authorization: `Bearer ${sessionStorage.getItem('akime_token')}` }
        });
      }
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || `Téléchargement impossible (${response.status})`);
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      notify(dashboard, error.message, 'error');
    }
  }

  function makeModal(title, content) {
    const overlay = document.createElement('div');
    overlay.className = 'delivery-project-modal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(10,31,68,.68);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px;';
    if (!document.getElementById('deliveryProjectStyles')) {
      const styles = document.createElement('style');
      styles.id = 'deliveryProjectStyles';
      styles.textContent = `
        .delivery-project-modal * { box-sizing:border-box; }
        .delivery-project-dialog { background:#fff;border-radius:16px;width:min(960px,100%);max-height:min(92vh,1000px);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(4,18,43,.3); }
        .delivery-project-header { display:flex;align-items:center;justify-content:space-between;gap:16px;padding:24px 30px;border-bottom:1px solid #e9edf4;background:linear-gradient(110deg,#fff 0%,#f7f9fd 100%); }
        .delivery-project-header h2 { color:#0a1f44;font-size:1.25rem;margin:0; }
        .delivery-project-header p { color:#68778a;font-size:.82rem;margin:5px 0 0; }
        .delivery-project-close { border:0;background:#eef1f7;color:#5a6a7a;border-radius:8px;width:36px;height:36px;font-size:22px;cursor:pointer;flex:none; }
        .delivery-project-dialog > form { display:flex;flex:1;flex-direction:column;min-height:0; }
        .delivery-project-body { min-height:0;overflow:auto;padding:24px 30px;flex:1; }
        .delivery-form-section { border:1px solid #e8edf4;border-radius:12px;padding:18px;margin-bottom:16px;background:#fff; }
        .delivery-form-section-heading { display:flex;align-items:flex-start;gap:12px;margin-bottom:18px; }
        .delivery-form-section-heading > span { width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:#f6f0df;color:#a8873a;flex:none; }
        .delivery-form-section-heading h3 { color:#0a1f44;font-size:.96rem;margin:1px 0 4px; }
        .delivery-form-section-heading p { color:#7b8795;font-size:.78rem;margin:0;line-height:1.5; }
        .delivery-form-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 18px; }
        .delivery-field { min-width:0;display:flex;flex-direction:column;gap:6px;color:#25354a;font-size:.79rem;font-weight:700; }
        .delivery-field small { font-weight:400;color:#8792a0;font-size:.72rem;line-height:1.4; }
        .delivery-field input,.delivery-field select,.delivery-field textarea { width:100%;min-height:42px;border:1px solid #dce2eb;border-radius:8px;padding:10px 12px;background:#fff;color:#25354a;font-family:inherit;font-size:.83rem;font-weight:500;outline:none;transition:border-color .18s,box-shadow .18s; }
        .delivery-field textarea { resize:vertical;min-height:68px; }
        .delivery-field input:focus,.delivery-field select:focus,.delivery-field textarea:focus { border-color:#c9a84c;box-shadow:0 0 0 3px rgba(201,168,76,.14); }
        .delivery-field input::placeholder,.delivery-field textarea::placeholder { color:#a3acb7;font-weight:400; }
        .delivery-team-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:9px; }
        .delivery-team-option { display:flex;align-items:center;gap:9px;border:1px solid #e3e8ef;border-radius:8px;padding:10px 12px;color:#405065;font-size:.8rem;cursor:pointer; }
        .delivery-team-option:has(input:checked) { border-color:#c9a84c;background:#fbf8ef; }
        .delivery-team-option input { accent-color:#0a1f44; }
        .delivery-repeater { display:grid;gap:10px; }
        .delivery-empty-state { border:1px dashed #e0e5ec;border-radius:8px;padding:14px;color:#8a95a3;font-size:.78rem;text-align:center; }
        .delivery-repeater-row { position:relative;border:1px solid #e6ebf2;background:#fafbfd;border-radius:10px;padding:14px; }
        .delivery-repeater-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px 14px;padding-right:28px; }
        .delivery-existing-document { display:flex;align-items:center;justify-content:space-between;gap:12px;padding:5px 28px 5px 4px;flex-wrap:wrap; }
        .delivery-existing-document > div { display:flex;align-items:center;gap:11px;color:#a8873a; }
        .delivery-existing-document > div > div { display:flex;flex-direction:column;gap:3px;color:#25354a; }
        .delivery-existing-document small { font-size:.72rem;color:#8490a0; }
        .delivery-download-document { border:1px solid #dce2eb;background:white;color:#0a1f44;border-radius:7px;padding:8px 11px;font:inherit;font-size:.75rem;font-weight:700;cursor:pointer; }
        .delivery-keep-document { display:flex;align-items:center;gap:6px;color:#536174;font-size:.75rem; }
        .delivery-keep-document input { accent-color:#0a1f44; }
        .delivery-selected-files { grid-column:1/-1;color:#778496;font-size:.73rem;line-height:1.7; }
        .delivery-selected-files span { display:inline-block;background:#eef1f7;padding:2px 8px;margin:2px;border-radius:12px;color:#33435a; }
        .delivery-remove-row { position:absolute;right:10px;top:10px;width:28px;height:28px;border:0;border-radius:7px;background:#fff0ee;color:#b54338;cursor:pointer; }
        .delivery-add-row { border:1px dashed #c9a84c;background:#fbf8ef;color:#725a20;border-radius:8px;padding:10px 13px;font-family:inherit;font-size:.78rem;font-weight:700;cursor:pointer;justify-self:start; }
        .delivery-add-row:hover { background:#f7efd9; }
        .delivery-progress-control { display:flex;align-items:center;gap:12px; }
        .delivery-progress-control input[type=range] { flex:1;min-height:unset;padding:0;accent-color:#c9a84c; }
        .delivery-progress-value { min-width:48px;border-radius:20px;padding:5px 8px;background:#f6f0df;color:#725a20;text-align:center;font-size:.77rem;font-weight:800; }
        .delivery-form-footer { position:sticky;bottom:0;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 30px;border-top:1px solid #e9edf4;background:rgba(255,255,255,.97); }
        .delivery-form-footer-note { color:#788596;font-size:.75rem; }
        .delivery-form-footer-actions { display:flex;gap:9px; }
        .delivery-form-cancel { border:1px solid #dce2eb;background:#fff;color:#536174;border-radius:7px;padding:10px 15px;font-family:inherit;font-size:.76rem;font-weight:700;cursor:pointer; }
        .delivery-form-submit { padding:10px 17px; }
        .delivery-form-submit:disabled { opacity:.7;cursor:wait; }
        .delivery-project-actions { display:flex;align-items:center;justify-content:flex-end;gap:7px;white-space:nowrap; }
        .delivery-action-btn { display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:32px;padding:6px 10px;border:1px solid #dfe5ed;border-radius:7px;background:#fff;color:#34445a;font-family:inherit;font-size:.72rem;font-weight:600;cursor:pointer;transition:background .18s,border-color .18s,color .18s,transform .18s; }
        .delivery-action-btn:hover { transform:translateY(-1px);border-color:#c9a84c;background:#fbf8ef;color:#725a20; }
        .delivery-action-btn:focus-visible { outline:3px solid rgba(201,168,76,.35);outline-offset:2px; }
        .delivery-action-details { border-color:#d6e5ef;background:#f1f7fb;color:#1a5276; }
        .delivery-action-edit { border-color:#eadfbf;background:#fbf8ef;color:#725a20; }
        .delivery-action-delete { border-color:#f0d5d2;background:#fff5f4;color:#b33c32; }
        .delivery-action-delete:hover { border-color:#c0392b;background:#c0392b;color:#fff; }
        .delivery-detail-body { overflow:auto;padding:24px 30px; }
        .delivery-detail-summary { display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:20px; }
        .delivery-detail-card { min-width:0;border:1px solid #e8edf4;border-radius:10px;padding:13px 15px;background:#fafbfd; }
        .delivery-detail-card small { display:block;margin-bottom:6px;color:#7b8795;font-size:.7rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase; }
        .delivery-detail-card strong { color:#25354a;font-size:.86rem;overflow-wrap:anywhere; }
        .delivery-detail-progress { display:flex;align-items:center;gap:10px; }
        .delivery-detail-progress progress { width:100%;height:8px;accent-color:#c9a84c; }
        .delivery-detail-section { margin-top:18px;border:1px solid #e8edf4;border-radius:11px;overflow:hidden; }
        .delivery-detail-section h3 { display:flex;align-items:center;gap:9px;padding:13px 16px;margin:0;border-bottom:1px solid #e8edf4;background:#f7f9fc;color:#0a1f44;font-size:.9rem; }
        .delivery-detail-section h3 i { color:#a8873a; }
        .delivery-detail-list { display:grid;gap:0;margin:0;padding:0;list-style:none; }
        .delivery-detail-list li { padding:12px 16px;border-bottom:1px solid #edf0f5;color:#36465a;font-size:.8rem; }
        .delivery-detail-list li:last-child { border-bottom:0; }
        .delivery-detail-row { display:flex;justify-content:space-between;align-items:flex-start;gap:14px; }
        .delivery-detail-row strong { display:block;color:#24344a;font-size:.81rem; }
        .delivery-detail-meta { display:block;margin-top:4px;color:#7d8997;font-size:.73rem; }
        .delivery-detail-badge { display:inline-flex;border-radius:20px;padding:4px 9px;background:#eef1f7;color:#536174;font-size:.67rem;font-weight:800;white-space:nowrap; }
        .delivery-detail-badge.status-completed { background:#e9f5ee;color:#1a7a4a; }
        .delivery-detail-badge.status-in-progress { background:#eaf2fa;color:#1a5276; }
        .delivery-detail-badge.status-blocked,.delivery-detail-badge.status-cancelled { background:#fff0ee;color:#b33c32; }
        .delivery-detail-document { border:1px solid #dce2eb;background:#fff;color:#0a1f44;border-radius:7px;padding:7px 10px;font-family:inherit;font-size:.73rem;font-weight:700;cursor:pointer; }
        .delivery-detail-notes { display:grid;gap:10px;padding:14px; }
        .delivery-detail-note { padding:12px 14px;border-left:3px solid #c9a84c;border-radius:0 8px 8px 0;background:#fbf9f2;color:#36465a;font-size:.8rem;line-height:1.55; }
        .delivery-detail-note small { display:block;margin-top:7px;color:#7d8997;font-size:.7rem; }
        .delivery-detail-activity { position:relative;padding-left:26px!important; }
        .delivery-detail-activity::before { content:'';position:absolute;left:15px;top:0;bottom:-1px;width:1px;background:#e2e7ef; }
        .delivery-detail-activity::after { content:'';position:absolute;left:11px;top:17px;width:9px;height:9px;border:2px solid #c9a84c;border-radius:50%;background:#fff; }
        .delivery-detail-empty { color:#8a95a3!important;text-align:center; }
        .delivery-detail-note-form { display:flex;gap:9px;padding:14px;border-top:1px solid #e8edf4;background:#fff; }
        .delivery-detail-note-form input { flex:1;min-width:0;border:1px solid #dce2eb;border-radius:8px;padding:10px 12px;font:inherit;font-size:.82rem; }
        .delivery-detail-footer { display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 30px;border-top:1px solid #e9edf4;background:#fff; }
        .delivery-detail-footer-actions { display:flex;gap:8px; }
        @media(max-width:640px) {
          .delivery-project-modal { padding:0!important; }
          .delivery-project-dialog { width:100%;height:100%;max-height:100%;border-radius:0; }
          .delivery-project-header { padding:18px 18px 15px; }
          .delivery-project-body { padding:16px; }
          .delivery-form-section { padding:14px; }
          .delivery-form-grid,.delivery-repeater-grid { grid-template-columns:1fr; }
          .delivery-form-footer { padding:12px 16px; }
          .delivery-form-footer-note { display:none; }
          .delivery-form-footer-actions { width:100%; }
          .delivery-form-footer-actions button { flex:1;justify-content:center; }
          .delivery-detail-body { padding:16px; }
          .delivery-detail-footer { padding:12px 16px; }
          .delivery-detail-footer-actions { width:100%; }
          .delivery-detail-footer-actions button { flex:1; }
          .delivery-project-actions { justify-content:flex-start; }
          .delivery-action-btn { min-width:36px;padding:7px; }
          .delivery-action-btn span { display:none; }
        }`;
      document.head.appendChild(styles);
    }
    overlay.innerHTML = `
      <div class="delivery-project-dialog" role="dialog" aria-modal="true" aria-labelledby="deliveryProjectModalTitle">
        <div class="delivery-project-header">
          <div><h2 id="deliveryProjectModalTitle">${escapeHtml(title)}</h2><p>Organisez les informations, l’équipe et le suivi du chantier.</p></div>
          <button type="button" class="delivery-project-close delivery-modal-close" aria-label="Fermer">&times;</button>
        </div>
        ${content}
      </div>`;
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('.delivery-modal-close')) overlay.remove();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function field(label, input, fullWidth = false) {
    return `<label class="delivery-field"${fullWidth ? ' style="grid-column:1/-1;"' : ''}>
      <span>${escapeHtml(label)}</span>${input}
    </label>`;
  }

  function selectOptions(values, current, blankLabel = '') {
    const blank = blankLabel ? `<option value="">${escapeHtml(blankLabel)}</option>` : '';
    return blank + values.map(value =>
      `<option value="${escapeHtml(value)}" ${value === current ? 'selected' : ''}>${escapeHtml(pretty(value))}</option>`
    ).join('');
  }

  async function loadMembers(dashboard) {
    return dashboard.apiCall(`${endpoint}/members`);
  }

  function actionButton(action, id, label, icon) {
    return `<button type="button" class="delivery-action-btn delivery-action-${action} delivery-${action}" data-id="${escapeHtml(id)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><i class="fas ${icon}"></i><span>${escapeHtml(label)}</span></button>`;
  }

  async function loadProjectList(dashboard, section, members) {
    const projects = await dashboard.apiCall(endpoint);
    section.innerHTML = `
      <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
        <h1 class="page-title"><i class="fas fa-clipboard-list"></i> Projets internes (${projects.length})</h1>
        <button type="button" class="btn btn-primary" id="deliveryProjectCreate"><i class="fas fa-plus"></i> Nouveau projet</button>
      </div>
      <div class="data-table" style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:720px;">
          <thead><tr><th>Projet</th><th>Client</th><th>Responsable</th><th>Statut</th><th>Priorité</th><th>Avancement</th><th>Actions</th></tr></thead>
          <tbody>${projects.length ? projects.map(project => `
            <tr>
              <td><strong>${escapeHtml(project.name)}</strong><br><small>${escapeHtml(project.projectReference || '')}</small></td>
              <td>${escapeHtml(project.client || '—')}</td>
              <td>${escapeHtml(project.projectManager?.name || '—')}</td>
              <td>${escapeHtml(pretty(project.status))}</td>
              <td>${escapeHtml(pretty(project.priority))}</td>
              <td><progress value="${Number(project.progress) || 0}" max="100"></progress> ${Number(project.progress) || 0}%</td>
              <td>
                <div class="delivery-project-actions">
                  ${actionButton('details', project._id, 'Détails', 'fa-eye')}
                  ${actionButton('edit', project._id, 'Modifier', 'fa-pen')}
                  ${actionButton('delete', project._id, 'Supprimer', 'fa-trash')}
                </div>
              </td>
            </tr>`).join('') : '<tr><td colspan="7">Aucun projet interne. Créez votre premier projet.</td></tr>'}</tbody>
        </table>
      </div>`;

    section.querySelector('#deliveryProjectCreate').addEventListener('click', () => openEditor(dashboard, members));
    section.querySelectorAll('.delivery-edit').forEach(button => button.addEventListener('click', async () => {
      try {
        const project = await dashboard.apiCall(`${endpoint}/${button.dataset.id}`);
        openEditor(dashboard, members, project);
      } catch (error) {
        notify(dashboard, error.message, 'error');
      }
    }));
    section.querySelectorAll('.delivery-details').forEach(button => button.addEventListener('click', () => openDetails(dashboard, button.dataset.id)));
    section.querySelectorAll('.delivery-delete').forEach(button => button.addEventListener('click', async () => {
      if (!window.confirm('Supprimer définitivement ce projet interne ?')) return;
      try {
        await dashboard.apiCall(`${endpoint}/${button.dataset.id}`, { method: 'DELETE' });
        notify(dashboard, 'Projet interne supprimé.', 'success');
        await loadProjectList(dashboard, section, members);
      } catch (error) {
        notify(dashboard, error.message, 'error');
      }
    }));
  }

  function openEditor(dashboard, members, project = {}) {
    const isEdit = Boolean(project._id);
    const managerId = personId(project.projectManager);
    const teamIds = (project.teamMembers || []).map(personId);
    const dateValue = value => {
      if (!value) return '';
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    const milestones = (project.milestones || []).map(item => ({
      title: item.title || '', description: item.description || '',
      dueDate: dateValue(item.dueDate), status: item.status || 'PENDING'
    }));
    const tasks = (project.tasks || []).map(item => ({
      title: item.title || '', description: item.description || '',
      assignedTo: personId(item.assignedTo), dueDate: dateValue(item.dueDate), status: item.status || 'TODO'
    }));
    const documents = (project.documents || []).map(item => ({
      name: item.name || '', url: item.url || '', category: item.category || '', existing: true
    }));
    let uploadSequence = 0;
    const pendingUploads = new Map();
    const repeaterKeys = {
      milestones: ['title', 'description', 'dueDate', 'status'],
      tasks: ['title', 'description', 'assignedTo', 'dueDate', 'status']
    };
    const memberOptions = selectedId => members.map(member =>
      `<option value="${escapeHtml(member._id)}" ${String(member._id) === String(selectedId || '') ? 'selected' : ''}>${escapeHtml(member.name)}</option>`
    ).join('');
    const renderRows = (type, items) => {
      const container = modal.querySelector(`[data-repeater="${type}"]`);
      const markup = items.map((item, index) => {
        if (type === 'documents') {
          return `<div class="delivery-repeater-row" data-row="${index}" ${item.existing ? `data-existing-document="true" data-document-name="${escapeHtml(item.name)}" data-document-url="${escapeHtml(item.url)}" data-document-category="${escapeHtml(item.category)}"` : `data-upload-id="${escapeHtml(item.uploadId)}"`}>
            <button type="button" class="delivery-remove-row" data-remove-row="${index}" aria-label="Supprimer ce document" title="Supprimer">&times;</button>
            ${item.existing ? `
              <div class="delivery-existing-document">
                <div><i class="fas fa-file-alt"></i><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category || 'Document')}</small></div></div>
                ${item.url.startsWith('/api/files/delivery-documents/') ? `<button type="button" class="delivery-download-document" data-document-url="${escapeHtml(item.url)}" data-document-name="${escapeHtml(item.name)}"><i class="fas fa-download"></i> Télécharger</button>` : `<a class="delivery-download-document" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Ouvrir</a>`}
                <label class="delivery-keep-document"><input type="checkbox" data-key="keep" checked> Conserver</label>
              </div>` : `
              <div class="delivery-repeater-grid">
                ${field('Fichier *', `<input data-key="file" type="file" multiple accept=".pdf,.docx,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.gif,.webp">`)}
                ${field('Catégorie', `<input data-key="category" maxlength="100" value="${escapeHtml(item.category)}" placeholder="Plans, contrat, rapport…">`)}
                <div class="delivery-selected-files">${(pendingUploads.get(item.uploadId)?.files || []).map(file => `<span><i class="fas fa-paperclip"></i> ${escapeHtml(file.name)}</span>`).join('') || 'Formats acceptés : PDF, DOCX, XLSX, CSV, TXT, JPG, PNG, GIF, WEBP. 20 Mo maximum par fichier.'}</div>
              </div>`}
          </div>`;
        }
        if (type === 'milestones') {
          return `<div class="delivery-repeater-row" data-row="${index}">
            <button type="button" class="delivery-remove-row" data-remove-row="${index}" aria-label="Supprimer ce jalon" title="Supprimer">&times;</button>
            <div class="delivery-repeater-grid">
              ${field('Nom du jalon *', `<input data-key="title" required maxlength="255" value="${escapeHtml(item.title)}" placeholder="Ex. Fondations terminées">`)}
              ${field('Échéance', `<input data-key="dueDate" type="date" value="${escapeHtml(item.dueDate)}">`)}
              ${field('État', `<select data-key="status">${selectOptions(['PENDING', 'IN_PROGRESS', 'COMPLETED'], item.status)}</select>`)}
              ${field('Détails', `<input data-key="description" maxlength="1000" value="${escapeHtml(item.description)}" placeholder="Précisions sur le jalon">`)}
            </div>
          </div>`;
        }
        if (type === 'tasks') {
          return `<div class="delivery-repeater-row" data-row="${index}">
            <button type="button" class="delivery-remove-row" data-remove-row="${index}" aria-label="Supprimer cette tâche" title="Supprimer">&times;</button>
            <div class="delivery-repeater-grid">
              ${field('Nom de la tâche *', `<input data-key="title" required maxlength="255" value="${escapeHtml(item.title)}" placeholder="Ex. Préparer le terrain">`)}
              ${field('Assignée à', `<select data-key="assignedTo">${selectOptions([], '', 'Non assignée')}${memberOptions(item.assignedTo)}</select>`)}
              ${field('Échéance', `<input data-key="dueDate" type="date" value="${escapeHtml(item.dueDate)}">`)}
              ${field('État', `<select data-key="status">${selectOptions(['TODO', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'], item.status)}</select>`)}
              ${field('Détails', `<input data-key="description" maxlength="1000" value="${escapeHtml(item.description)}" placeholder="Informations utiles à l’équipe">`)}
            </div>
          </div>`;
        }
      }).join('');
      container.innerHTML = markup || '<div class="delivery-empty-state">Aucun élément ajouté pour le moment.</div>';
    };

    const modal = makeModal(isEdit ? 'Modifier le projet interne' : 'Créer un projet interne', `
      <form id="deliveryProjectForm">
        <div class="delivery-project-body">
          <section class="delivery-form-section">
            <div class="delivery-form-section-heading"><span><i class="fas fa-building"></i></span><div><h3>Informations générales</h3><p>Identifiez le chantier et les personnes qui le pilotent.</p></div></div>
            <div class="delivery-form-grid">
              ${field('Nom du projet *', `<input name="name" required minlength="2" maxlength="255" value="${escapeHtml(project.name || '')}" placeholder="Ex. Construction du centre administratif">`)}
              ${field('Client', `<input name="client" maxlength="100" value="${escapeHtml(project.client || '')}" placeholder="Nom du client">`)}
              ${field('Responsable de projet', `<select name="projectManager">${selectOptions([], '', 'Choisir un responsable')}${memberOptions(managerId)}</select>`)}
              ${field('Priorité', `<select name="priority">${selectOptions(priorities, project.priority || 'MEDIUM')}</select>`)}
              ${field('Référence client', `<input name="clientReference" maxlength="255" value="${escapeHtml(project.clientReference || '')}" placeholder="Référence du dossier client">`)}
              ${field('Référence projet', `<input name="projectReference" maxlength="255" value="${escapeHtml(project.projectReference || '')}" placeholder="Ex. AK-2026-014">`)}
              <div class="delivery-field" style="grid-column:1/-1;"><span>Équipe du projet</span>
                <small>Sélectionnez les personnes qui participent à ce projet.</small>
                <div class="delivery-team-grid">${members.length ? members.map(member => `
                  <label class="delivery-team-option"><input type="checkbox" name="teamMembers" value="${escapeHtml(member._id)}" ${teamIds.includes(String(member._id)) ? 'checked' : ''}><span>${escapeHtml(member.name)}<small style="display:block;">${escapeHtml(member.role)}</small></span></label>`).join('') : '<small>Aucun membre actif disponible pour l’affectation.</small>'}</div>
              </div>
            </div>
          </section>

          <section class="delivery-form-section">
            <div class="delivery-form-section-heading"><span><i class="fas fa-chart-line"></i></span><div><h3>Planification et suivi</h3><p>Définissez l’état du chantier, son calendrier et son enveloppe.</p></div></div>
            <div class="delivery-form-grid">
              ${field('Statut du projet', `<select name="status">${selectOptions(statuses, project.status || 'BACKLOG')}</select>`)}
              ${field('Budget prévisionnel', `<input name="budget" type="number" min="0" step="0.01" value="${project.budget ?? ''}" placeholder="0,00">`)}
              ${field('Date de début', `<input name="startDate" type="date" value="${dateValue(project.startDate)}">`)}
              ${field('Fin prévue', `<input name="expectedCompletionDate" type="date" value="${dateValue(project.expectedCompletionDate)}">`)}
              ${field('Fin réelle', `<input name="actualCompletionDate" type="date" value="${dateValue(project.actualCompletionDate)}">`)}
              <div class="delivery-field"><span>Avancement du projet</span><div class="delivery-progress-control">
                <input name="progress" type="range" min="0" max="100" step="5" value="${Number(project.progress) || 0}" aria-label="Avancement du projet">
                <output class="delivery-progress-value">${Number(project.progress) || 0}%</output>
              </div></div>
            </div>
          </section>

          <section class="delivery-form-section">
            <div class="delivery-form-section-heading"><span><i class="fas fa-flag-checkered"></i></span><div><h3>Jalons</h3><p>Découpez le projet en étapes clés avec une échéance et un état.</p></div></div>
            <div class="delivery-repeater" data-repeater="milestones"></div>
            <button type="button" class="delivery-add-row" data-add-row="milestones"><i class="fas fa-plus"></i> Ajouter un jalon</button>
          </section>

          <section class="delivery-form-section">
            <div class="delivery-form-section-heading"><span><i class="fas fa-tasks"></i></span><div><h3>Tâches</h3><p>Attribuez les actions à réaliser aux membres du projet.</p></div></div>
            <div class="delivery-repeater" data-repeater="tasks"></div>
            <button type="button" class="delivery-add-row" data-add-row="tasks"><i class="fas fa-plus"></i> Ajouter une tâche</button>
          </section>

          <section class="delivery-form-section">
            <div class="delivery-form-section-heading"><span><i class="fas fa-folder-open"></i></span><div><h3>Documents</h3><p>Importez les plans, contrats et rapports du projet depuis votre appareil.</p></div></div>
            <div class="delivery-repeater" data-repeater="documents"></div>
            <button type="button" class="delivery-add-row" data-add-row="documents"><i class="fas fa-plus"></i> Ajouter un document</button>
          </section>
        </div>
        <div class="delivery-form-footer">
          <span class="delivery-form-footer-note">Les champs marqués * sont obligatoires.</span>
          <div class="delivery-form-footer-actions">
            <button type="button" class="delivery-form-cancel delivery-modal-close">Annuler</button>
            <button type="submit" class="btn btn-primary delivery-form-submit"><i class="fas fa-save"></i> ${isEdit ? 'Enregistrer' : 'Créer le projet'}</button>
          </div>
        </div>
      </form>`);

    modal.querySelector('[name="projectManager"]').value = managerId || '';
    const repeaterData = { milestones, tasks, documents };
    const readRows = type => Array.from(modal.querySelectorAll(`[data-repeater="${type}"] [data-row]`), row => {
      if (type === 'documents') {
        if (row.dataset.existingDocument) {
          return {
            existing: true,
            keep: row.querySelector('[data-key="keep"]').checked,
            name: row.dataset.documentName,
            url: row.dataset.documentUrl,
            category: row.dataset.documentCategory
          };
        }
        const uploadId = row.dataset.uploadId;
        const category = row.querySelector('[data-key="category"]').value;
        const upload = pendingUploads.get(uploadId) || { files: [] };
        pendingUploads.set(uploadId, { ...upload, category });
        return { existing: false, uploadId, category };
      }
      return Object.fromEntries(repeaterKeys[type].map(key => [key, row.querySelector(`[data-key="${key}"]`).value]));
    });
    Object.entries(repeaterData).forEach(([type, items]) => renderRows(type, items));
    modal.querySelectorAll('[data-add-row]').forEach(button => button.addEventListener('click', () => {
      const type = button.dataset.addRow;
      repeaterData[type] = readRows(type);
      const defaults = {
        milestones: { title: '', description: '', dueDate: '', status: 'PENDING' },
        tasks: { title: '', description: '', assignedTo: '', dueDate: '', status: 'TODO' },
        documents: { existing: false, uploadId: `document-${++uploadSequence}`, category: '' }
      };
      repeaterData[type].push(defaults[type]);
      renderRows(type, repeaterData[type]);
    }));
    modal.querySelectorAll('[data-repeater]').forEach(container => container.addEventListener('click', event => {
      const removeButton = event.target.closest('[data-remove-row]');
      if (!removeButton) return;
      const type = container.dataset.repeater;
      const index = Number(removeButton.dataset.removeRow);
      repeaterData[type] = readRows(type);
      if (type === 'documents' && repeaterData[type][index]?.uploadId) {
        pendingUploads.delete(repeaterData[type][index].uploadId);
      }
      repeaterData[type].splice(index, 1);
      renderRows(type, repeaterData[type]);
    }));
    modal.addEventListener('change', event => {
      const row = event.target.closest('[data-upload-id]');
      if (!row) return;
      const uploadId = row.dataset.uploadId;
      const current = pendingUploads.get(uploadId) || { files: [], category: '' };
      if (event.target.matches('[data-key="file"]')) {
        pendingUploads.set(uploadId, { ...current, files: Array.from(event.target.files || []) });
        renderRows('documents', repeaterData.documents);
      } else if (event.target.matches('[data-key="category"]')) {
        pendingUploads.set(uploadId, { ...current, category: event.target.value });
      }
    });
    modal.addEventListener('click', event => {
      const downloadButton = event.target.closest('.delivery-download-document[data-document-url]');
      if (downloadButton) {
        downloadDocument(downloadButton.dataset.documentUrl, downloadButton.dataset.documentName, dashboard);
      }
    });
    const progressInput = modal.querySelector('[name="progress"]');
    const progressOutput = modal.querySelector('.delivery-progress-value');
    progressInput.addEventListener('input', () => { progressOutput.value = `${progressInput.value}%`; });

    modal.querySelector('#deliveryProjectForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const value = name => form.elements[name].value;
      const payload = {
        name: value('name'),
        client: value('client'),
        projectManager: value('projectManager') || null,
        teamMembers: Array.from(modal.querySelectorAll('[name="teamMembers"]:checked'), input => input.value),
        status: value('status'),
        priority: value('priority'),
        progress: Number(value('progress')),
        budget: value('budget') === '' ? null : Number(value('budget')),
        startDate: value('startDate') || null,
        expectedCompletionDate: value('expectedCompletionDate') || null,
        actualCompletionDate: value('actualCompletionDate') || null,
        clientReference: value('clientReference'),
        projectReference: value('projectReference'),
        milestones: readRows('milestones'),
        tasks: readRows('tasks'),
        documents: readRows('documents').filter(document => document.existing && document.keep)
      };
      payload.tasks.forEach(task => { task.assignedTo = task.assignedTo || null; });
      const documentRows = readRows('documents').filter(document => !document.existing);
      const filesToUpload = documentRows.flatMap(row => {
        const upload = pendingUploads.get(row.uploadId);
        return (upload?.files || []).map(file => ({ file, category: upload.category }));
      });
      if (filesToUpload.length > 10) {
        notify(dashboard, 'Vous pouvez importer un maximum de 10 fichiers à la fois.', 'error');
        return;
      }
      const submitButton = form.querySelector('[type="submit"]');
      submitButton.disabled = true;
      submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement…';
      try {
        const savedProject = await dashboard.apiCall(isEdit ? `${endpoint}/${project._id}` : endpoint, {
          method: isEdit ? 'PUT' : 'POST',
          body: JSON.stringify(payload)
        });
        modal.remove();
        if (filesToUpload.length) {
          const formData = new FormData();
          filesToUpload.forEach(({ file, category }) => {
            formData.append('documents', file);
            formData.append('categories', category);
          });
          try {
            await dashboard.apiCall(`${endpoint}/${savedProject._id}/documents`, {
              method: 'POST',
              body: formData
            });
            notify(dashboard, `${filesToUpload.length} document(s) importé(s).`, 'success');
          } catch (uploadError) {
            notify(dashboard, `Projet enregistré, mais l’import des documents a échoué : ${uploadError.message}. Modifiez le projet pour réessayer.`, 'error');
          }
        } else {
          notify(dashboard, isEdit ? 'Projet interne modifié.' : 'Projet interne créé.', 'success');
        }
        await loadDeliveryProjectsSection(dashboard);
      } catch (error) {
        notify(dashboard, error.message, 'error');
      } finally {
        if (modal.isConnected) {
          submitButton.disabled = false;
          submitButton.innerHTML = `<i class="fas fa-save"></i> ${isEdit ? 'Enregistrer' : 'Créer le projet'}`;
        }
      }
    });
  }

  async function openDetails(dashboard, id) {
    try {
      const project = await dashboard.apiCall(`${endpoint}/${id}`);
      const statusClass = value => `status-${String(value || '').toLowerCase().replaceAll('_', '-')}`;
      const detailCard = (label, value) => `
        <div class="delivery-detail-card"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value || '—')}</strong></div>`;
      const renderList = (items, renderItem, emptyText) => items.length
        ? items.map(renderItem).join('')
        : `<li class="delivery-detail-empty">${escapeHtml(emptyText)}</li>`;
      const milestones = project.milestones || [];
      const tasks = project.tasks || [];
      const documents = project.documents || [];
      const notes = project.notes || [];
      const activity = (project.activity || []).slice().reverse();
      const modal = makeModal(project.name, `
        <div class="delivery-detail-body">
          <div class="delivery-detail-summary">
            ${detailCard('Client', project.client)}
            ${detailCard('Responsable', project.projectManager?.name)}
            ${detailCard('Équipe', (project.teamMembers || []).map(member => member.name).join(', '))}
            ${detailCard('Référence client', project.clientReference)}
            ${detailCard('Référence projet', project.projectReference)}
            ${detailCard('Priorité', pretty(project.priority))}
            ${detailCard('Budget', project.budget == null ? '—' : new Intl.NumberFormat('fr-FR').format(project.budget))}
            ${detailCard('Début', formatDate(project.startDate))}
            ${detailCard('Fin prévue', formatDate(project.expectedCompletionDate))}
            ${detailCard('Fin réelle', formatDate(project.actualCompletionDate))}
            <div class="delivery-detail-card"><small>Statut</small><span class="delivery-detail-badge ${statusClass(project.status)}">${escapeHtml(pretty(project.status))}</span></div>
            <div class="delivery-detail-card"><small>Avancement</small><div class="delivery-detail-progress"><progress value="${Number(project.progress) || 0}" max="100"></progress><strong>${Number(project.progress) || 0}%</strong></div></div>
          </div>

          <section class="delivery-detail-section">
            <h3><i class="fas fa-flag-checkered"></i> Jalons <span class="delivery-detail-badge">${milestones.length}</span></h3>
            <ul class="delivery-detail-list">${renderList(milestones, item => `
              <li><div class="delivery-detail-row"><div><strong>${escapeHtml(item.title)}</strong><span class="delivery-detail-meta">${escapeHtml(item.description || 'Aucun détail')} · Échéance : ${formatDate(item.dueDate)}</span></div><span class="delivery-detail-badge ${statusClass(item.status)}">${escapeHtml(pretty(item.status))}</span></div></li>`, 'Aucun jalon ajouté.')}</ul>
          </section>

          <section class="delivery-detail-section">
            <h3><i class="fas fa-tasks"></i> Tâches <span class="delivery-detail-badge">${tasks.length}</span></h3>
            <ul class="delivery-detail-list">${renderList(tasks, item => `
              <li><div class="delivery-detail-row"><div><strong>${escapeHtml(item.title)}</strong><span class="delivery-detail-meta">${escapeHtml(item.description || 'Aucun détail')} · Assignée à : ${escapeHtml(item.assignedTo?.name || 'Non assignée')} · Échéance : ${formatDate(item.dueDate)}</span></div><span class="delivery-detail-badge ${statusClass(item.status)}">${escapeHtml(pretty(item.status))}</span></div></li>`, 'Aucune tâche ajoutée.')}</ul>
          </section>

          <section class="delivery-detail-section">
            <h3><i class="fas fa-folder-open"></i> Documents <span class="delivery-detail-badge">${documents.length}</span></h3>
            <ul class="delivery-detail-list">${renderList(documents, item => `
              <li><div class="delivery-detail-row"><div><strong>${escapeHtml(item.name)}</strong><span class="delivery-detail-meta">${escapeHtml(item.category || 'Document')}</span></div>${item.url.startsWith('/api/files/delivery-documents/') ? `<button type="button" class="delivery-detail-document delivery-download-document" data-document-url="${escapeHtml(item.url)}" data-document-name="${escapeHtml(item.name)}"><i class="fas fa-download"></i> Télécharger</button>` : `<a class="delivery-detail-document" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Ouvrir</a>`}</div></li>`, 'Aucun document importé.')}</ul>
          </section>

          <section class="delivery-detail-section">
            <h3><i class="fas fa-sticky-note"></i> Notes <span class="delivery-detail-badge">${notes.length}</span></h3>
            <div class="delivery-detail-notes">${notes.length ? notes.map(item => `
              <article class="delivery-detail-note">${escapeHtml(item.text)}<small>${escapeHtml(item.authorName)} · ${formatDate(item.createdAt)}</small></article>`).join('') : '<div class="delivery-detail-empty">Aucune note ajoutée.</div>'}</div>
            <form id="deliveryNoteForm" class="delivery-detail-note-form">
              <input name="text" maxlength="10000" required placeholder="Écrire une note sur ce projet…" aria-label="Nouvelle note">
              <button type="submit" class="delivery-action-btn delivery-action-details"><i class="fas fa-paper-plane"></i><span>Ajouter</span></button>
            </form>
          </section>

          <section class="delivery-detail-section">
            <h3><i class="fas fa-history"></i> Historique <span class="delivery-detail-badge">${activity.length}</span></h3>
            <ul class="delivery-detail-list">${renderList(activity, item => `
              <li class="delivery-detail-activity"><strong>${escapeHtml(pretty(item.action))}</strong><span class="delivery-detail-meta">${escapeHtml(item.details)} · ${escapeHtml(item.actorName || 'Système')} · ${formatDate(item.createdAt)}</span></li>`, 'Aucune activité enregistrée.')}</ul>
          </section>
        </div>
        <div class="delivery-detail-footer">
          <span class="delivery-form-footer-note">Créé le ${formatDate(project.createdAt)} · Mis à jour le ${formatDate(project.updatedAt)}</span>
          <div class="delivery-detail-footer-actions">
            ${actionButton('edit', project._id, 'Modifier', 'fa-pen')}
            ${actionButton('delete', project._id, 'Supprimer', 'fa-trash')}
          </div>
        </div>`);

      modal.addEventListener('click', event => {
        const downloadButton = event.target.closest('.delivery-download-document[data-document-url]');
        if (downloadButton) {
          downloadDocument(downloadButton.dataset.documentUrl, downloadButton.dataset.documentName, dashboard);
        }
        if (event.target.closest('.delivery-edit')) {
          modal.remove();
          loadMembers(dashboard)
            .then(members => openEditor(dashboard, members, project))
            .catch(error => notify(dashboard, error.message, 'error'));
        }
        if (event.target.closest('.delivery-delete')) {
          if (!window.confirm(`Supprimer définitivement le projet « ${project.name} » ?`)) return;
          dashboard.apiCall(`${endpoint}/${project._id}`, { method: 'DELETE' })
            .then(() => {
              modal.remove();
              notify(dashboard, 'Projet interne supprimé.', 'success');
              return loadDeliveryProjectsSection(dashboard);
            })
            .catch(error => notify(dashboard, error.message, 'error'));
        }
      });
      modal.querySelector('#deliveryNoteForm').addEventListener('submit', async event => {
        event.preventDefault();
        const input = event.currentTarget.elements.text;
        try {
          await dashboard.apiCall(`${endpoint}/${id}/notes`, {
            method: 'POST',
            body: JSON.stringify({ text: input.value })
          });
          notify(dashboard, 'Note ajoutée.', 'success');
          modal.remove();
          await openDetails(dashboard, id);
        } catch (error) {
          notify(dashboard, error.message, 'error');
        }
      });
    } catch (error) {
      notify(dashboard, error.message, 'error');
    }
  }

  async function loadDeliveryProjectsSection(dashboard) {
    const section = document.getElementById('delivery-projects');
    if (!section) return;
    try {
      const members = await loadMembers(dashboard);
      await loadProjectList(dashboard, section, members);
    } catch (error) {
      console.error('Delivery projects load error:', error);
      dashboard.showError(section, error.message || 'Erreur lors du chargement des projets internes.');
    }
  }

  window.loadDeliveryProjectsSection = loadDeliveryProjectsSection;

  document.addEventListener('DOMContentLoaded', () => {
    try {
      const user = JSON.parse(sessionStorage.getItem('akime_user') || '{}');
      const navigation = document.querySelector('[data-admin-only="true"]');
      if (navigation && user.role !== 'admin') navigation.hidden = true;
    } catch (error) {
      console.error('Unable to determine delivery project access:', error);
    }
    const nav = document.querySelector('[data-section="delivery-projects"]');
    if (nav) nav.addEventListener('click', () => {
      const heading = document.getElementById('topBarSection');
      if (heading) heading.textContent = 'Projets internes';
    });
  });
})();
