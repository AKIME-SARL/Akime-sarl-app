
// A-KIME Admin Dashboard JavaScript
// Keep short-lived access tokens only for the current tab.  The long-lived
// refresh token is an HttpOnly cookie and is never readable by JavaScript.
const sessionStore = window.sessionStorage;
class AdminDashboard {
    constructor() {
        this.token = sessionStore.getItem('akime_token');
        this.user = JSON.parse(sessionStore.getItem('akime_user') || '{}');
        this.currentSection = 'dashboard';
        this.apiBase = '/api';
        this.BASE_URL = '';

        this.init();
    }

    async init() {
        // Check authentication
        if (!this.token) {
            this.redirectToLogin();
            return;
        }

        // Verify token validity
        const isValid = await this.verifyToken();
        if (!isValid) {
            this.redirectToLogin();
            return;
        }

        // Initialize UI
        this.initializeUI();
        this.loadDashboardData();
        this.setupEventListeners();
        this.startTokenRefreshTimer();
    }

    redirectToLogin() {
        this.clearAuthData();
        window.location.href = 'login.html';
    }

    clearAuthData() {
        sessionStore.removeItem('akime_token');
        sessionStore.removeItem('akime_user');
    }

    
    async verifyToken() {
        try {
            const response = await this.apiCall('/api/auth/verify', 'GET');
        
            // Handle the response format
            if (response && response.success !== undefined) {
                return response.success === true;
            }
        
            return false;
        
        } catch (error) {
            console.error('Token verification failed:', error);
            // Try to refresh token before giving up
            const refreshed = await this.refreshAccessToken();
            return refreshed;
        }
    }

    async refreshAccessToken() {
        try {
            const response = await fetch(`${this.apiBase}/auth/refresh`, {
                method: 'POST',
                credentials: 'same-origin'
            });

            const data = await response.json();

            if (data.success) {
                this.token = data.data.accessToken;
                sessionStore.setItem('akime_token', this.token);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Token refresh failed:', error);
            return false;
        }
    }

    startTokenRefreshTimer() {
        // Refresh token every 10 minutes
        setInterval(async () => {
            const refreshed = await this.refreshAccessToken();
            if (!refreshed) {
                this.redirectToLogin();
            }
        }, 10 * 60 * 1000);
    }

    initializeUI() {
        // Set user info
        const userName = document.getElementById('userName');
        const userAvatar = document.getElementById('userAvatar');

        if (userName) userName.textContent = this.user.name || 'Admin';
        if (userAvatar) userAvatar.textContent = (this.user.name || 'A').charAt(0).toUpperCase();
    }

    setupEventListeners() {
        // Sidebar toggle
        const toggleBtn = document.getElementById('toggleBtn');
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('mainContent');

        toggleBtn?.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        });

        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                this.showSection(section);
            });
        });

        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        logoutBtn?.addEventListener('click', () => {
            this.logout();
        });
    }

    showSection(sectionName) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-section="${sectionName}"]`)?.classList.add('active');

        // Update content
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(sectionName)?.classList.add('active');

        this.currentSection = sectionName;

        // Load section data
        this.loadSectionData(sectionName);
    }

    async loadDashboardData() {
        try {
            const [equipment, projects, messages, testimonials, services] = await Promise.all([
                this.apiCall('/api/content/equipment'),
                this.apiCall('/api/content/projects'),
                this.apiCall('/api/contact'),
                this.apiCall('/api/testimonials/admin/all'),
                this.apiCall('/api/content/services'),
            ]);

            document.getElementById('equipmentCount').textContent    = equipment?.length    || 0;
            document.getElementById('projectsCount').textContent     = projects?.length     || 0;
            document.getElementById('messagesCount').textContent     = messages?.length     || 0;
            document.getElementById('testimonialsCount').textContent = testimonials?.length || 0;
            const sc = document.getElementById('servicesCount');
            if (sc) sc.textContent = services?.length || 0;

        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    async loadSectionData(section) {
        const sectionElement = document.getElementById(section);
        if (!sectionElement || section === 'dashboard') return;

        // Show loading
        sectionElement.innerHTML = `
            <h1 class="page-title">${this.getSectionTitle(section)}</h1>
            <div class="loading">
                <div class="spinner"></div>
                <p>Chargement...</p>
            </div>
        `;

        try {
            switch (section) {
                case 'services':
                    await this.loadServicesSection();
                    break;
                case 'equipment':
                    await this.loadEquipmentSection();
                    break;
                case 'projects':
                    await this.loadProjectsSection();
                    break;
                case 'delivery-projects':
                    await window.loadDeliveryProjectsSection(this);
                    break;
                case 'messages':
                    await this.loadMessagesSection();
                    break;
                case 'testimonials':
                    await this.loadTestimonialsSection();
                    updateUnreadBadge();
                    break;
                case 'company':
                    await this.loadCompanySection();
                    break;
                case 'users':
                    await this.loadUsersSection();
                    break;
                case 'audit-logs':
                    await this.loadAuditLogsSection();
                    break;
                case 'backup-restore':
                    await this.loadBackupRestoreSection();
                    break;
                case 'file-manager':
                    await this.loadFileManagerSection();
                    break;
            }
        } catch (error) {
            console.error(`Error loading ${section}:`, error);
            this.showError(sectionElement, 'Erreur lors du chargement des données');
        }
    }

    async loadUsersSection() {
        try {
            const data = await this.apiCall('/api/admin/users');
            const users = data.users || data;
            const sectionElement = document.getElementById('users');

            sectionElement.innerHTML = `
                <div class="section-header">
                    <h1 class="page-title">Gestion des Utilisateurs</h1>
                </div>
                <div class="data-table">
                    <div class="table-header">
                        <h3>Utilisateurs (${users.length})</h3>
                    </div>
                    <div class="table-content">
                        ${this.renderUsersTable(users)}
                    </div>
                </div>
            `;

            this.attachUserEventListeners();
        } catch (error) {
            console.error('Error loading users:', error);
            this.showNotification('Erreur lors du chargement des utilisateurs', 'error');
        }
    }

    renderUsersTable(users) {
        if (!users.length) {
            return '<p style="padding: 20px; text-align: center; color: #666;">Aucun utilisateur trouvé.</p>';
        }

        const roleLabels = {
            admin: 'Administrateur',
            editor: 'Éditeur',
            viewer: 'Lecteur',
            customer: 'Client'
        };

        const roleColors = {
            admin: '#dc3545',
            editor: '#007bff',
            viewer: '#6c757d',
            customer: '#28a745'
        };

        return `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 1px solid #e9ecef; background: #f8f9fa;">
                        <th style="padding: 12px; text-align: left;">Avatar</th>
                        <th style="padding: 12px; text-align: left;">Nom</th>
                        <th style="padding: 12px; text-align: left;">Email</th>
                        <th style="padding: 12px; text-align: left;">Rôle</th>
                        <th style="padding: 12px; text-align: left;">Statut</th>
                        <th style="padding: 12px; text-align: left;">Dernière connexion</th>
                        <th style="padding: 12px; text-align: center;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(user => `
                        <tr style="border-bottom: 1px solid #f8f9fa;">
                            <td style="padding: 12px;">
                                ${user.googleId ? 
                                    `<img src="${user.googleProfile?.picture || ''}" alt="${user.name}" style="width: 36px; height: 36px; border-radius: 50%;">` :
                                    `<div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #0056b3, #004a99); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
                                        ${(user.name || 'A').charAt(0).toUpperCase()}
                                    </div>`
                                }
                            </td>
                            <td style="padding: 12px;">${user.name || '-'}</td>
                            <td style="padding: 12px;">${user.email || '-'}</td>
                            <td style="padding: 12px;">
                                <span style="padding: 4px 10px; border-radius: 4px; background: ${roleColors[user.role]}; color: white; font-size: 12px; font-weight: 500;">
                                    ${roleLabels[user.role] || user.role}
                                </span>
                            </td>
                            <td style="padding: 12px;">
                                <span style="padding: 4px 10px; border-radius: 4px; background: ${user.isActive ? '#28a745' : '#dc3545'}; color: white; font-size: 12px; font-weight: 500;">
                                    ${user.isActive ? 'Actif' : 'Inactif'}
                                </span>
                            </td>
                            <td style="padding: 12px;">${user.lastLogin ? new Date(user.lastLogin).toLocaleDateString('fr-FR', { 
                                year: 'numeric', 
                                month: 'short', 
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            }) : '-'}</td>
                            <td style="padding: 12px; text-align: center;">
                                ${user._id !== this.user.id ? `
                                    <button class="btn btn-sm delete-user-btn" data-id="${user._id}" style="background: #dc3545; color: white; padding: 6px 10px; border: none; border-radius: 4px; cursor: pointer;">
                                        <i class="fas fa-trash"></i> Supprimer
                                    </button>
                                ` : '<span style="color: #666;">Vous</span>'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    attachUserEventListeners() {
        document.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                this.deleteUser(id);
            });
        });
    }

    async deleteUser(userId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur? Cette action est irréversible!')) {
            return;
        }

        try {
            await this.apiCall(`/api/admin/users/${userId}`, { method: 'DELETE' });
            this.showNotification('Utilisateur supprimé avec succès!', 'success');
            this.loadSectionData('users');
        } catch (error) {
            console.error('Error deleting user:', error);
            this.showNotification('Erreur lors de la suppression: ' + (error.message || 'Erreur inconnue'), 'error');
        }
    }

    async loadAuditLogsSection() {
        try {
            const { logs, pagination } = await this.apiCall('/api/auth/audit-logs');
            const sectionElement = document.getElementById('audit-logs');

            sectionElement.innerHTML = `
                <div class="section-header">
                    <h1 class="page-title">Journal d'Audit</h1>
                </div>
                <div class="data-table">
                    <div class="table-header">
                        <h3>Activités (${pagination.total})</h3>
                    </div>
                    <div class="table-content">
                        ${this.renderAuditLogsTable(logs)}
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error loading audit logs:', error);
            this.showNotification('Erreur lors du chargement du journal d\'audit', 'error');
        }
    }

    renderAuditLogsTable(logs) {
        if (!logs.length) {
            return '<p style="padding: 20px; text-align: center; color: #666;">Aucune activité trouvée.</p>';
        }

        const actionColors = {
            CREATE: '#28a745',
            UPDATE: '#007bff',
            DELETE: '#dc3545',
            LOGIN: '#6610f2',
            LOGOUT: '#6c757d',
            APPROVE: '#17a2b8',
            REJECT: '#fd7e14',
            VIEW: '#6c757d'
        };

        return `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 1px solid #e9ecef; background: #f8f9fa;">
                        <th style="padding: 12px; text-align: left;">Date/Heure</th>
                        <th style="padding: 12px; text-align: left;">Utilisateur</th>
                        <th style="padding: 12px; text-align: left;">Action</th>
                        <th style="padding: 12px; text-align: left;">Ressource</th>
                        <th style="padding: 12px; text-align: left;">IP</th>
                        <th style="padding: 12px; text-align: left;">User Agent</th>
                    </tr>
                </thead>
                <tbody>
                    ${logs.map(log => `
                        <tr style="border-bottom: 1px solid #f8f9fa;">
                            <td style="padding: 12px;">${new Date(log.createdAt).toLocaleString()}</td>
                            <td style="padding: 12px;">${log.user?.name || 'Système'}</td>
                            <td style="padding: 12px;">
                                <span style="padding: 4px 8px; border-radius: 4px; background: ${actionColors[log.action] || '#6c757d'}; color: white; font-size: 12px; font-weight: 500;">
                                    ${log.action}
                                </span>
                            </td>
                            <td style="padding: 12px;">${log.resource}</td>
                            <td style="padding: 12px;">${log.ipAddress || '-'}</td>
                            <td style="padding: 12px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.userAgent || ''}">${log.userAgent ? log.userAgent.substring(0, 50) + '...' : '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    async loadBackupRestoreSection() {
        try {
            const data = await this.apiCall('/api/admin/backups');
            const sectionElement = document.getElementById('backup-restore');

            sectionElement.innerHTML = `
                <div class="section-header">
                    <h1 class="page-title">Sauvegarde/Restauration</h1>
                    <button class="btn btn-primary" id="createBackupBtn">
                        <i class="fas fa-plus"></i> Créer une sauvegarde
                    </button>
                </div>
                <div class="data-table">
                    <div class="table-header">
                        <h3>Sauvegardes (${data.backups.length})</h3>
                    </div>
                    <div class="table-content">
                        ${this.renderBackupsTable(data.backups)}
                    </div>
                </div>
            `;

            document.getElementById('createBackupBtn')?.addEventListener('click', () => this.createBackup());
            this.attachBackupEventListeners();
        } catch (error) {
            console.error('Error loading backups:', error);
            this.showNotification('Erreur lors du chargement des sauvegardes', 'error');
        }
    }

    renderBackupsTable(backups) {
        if (!backups.length) {
            return '<p style="padding: 20px; text-align: center; color: #666;">Aucune sauvegarde trouvée.</p>';
        }

        return `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 1px solid #e9ecef; background: #f8f9fa;">
                        <th style="padding: 12px; text-align: left;">Nom</th>
                        <th style="padding: 12px; text-align: left;">Date de création</th>
                        <th style="padding: 12px; text-align: left;">Collections</th>
                        <th style="padding: 12px; text-align: center;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${backups.map(backup => `
                        <tr style="border-bottom: 1px solid #f8f9fa;">
                            <td style="padding: 12px;">${backup.name}</td>
                            <td style="padding: 12px;">${new Date(backup.createdAt).toLocaleString()}</td>
                            <td style="padding: 12px;">
                                ${backup.manifest ? Object.entries(backup.manifest.collections).map(([name, info]) => 
                                    `${name}: ${info.count || 0} docs`
                                ).join(', ') : '-'}
                            </td>
                            <td style="padding: 12px; text-align: center;">
                                <button class="btn btn-sm" data-action="restore" data-backup="${backup.name}" style="background: #28a745; color: white; margin-right: 8px; padding: 6px 10px; border: none; border-radius: 4px; cursor: pointer;">
                                    <i class="fas fa-undo"></i> Restaurer
                                </button>
                                <button class="btn btn-sm" data-action="delete" data-backup="${backup.name}" style="background: #dc3545; color: white; padding: 6px 10px; border: none; border-radius: 4px; cursor: pointer;">
                                    <i class="fas fa-trash"></i> Supprimer
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    attachBackupEventListeners() {
        document.querySelectorAll('[data-action="restore"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const backupName = btn.dataset.backup;
                this.restoreBackup(backupName);
            });
        });

        document.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const backupName = btn.dataset.backup;
                this.deleteBackup(backupName);
            });
        });
    }

    async createBackup() {
        try {
            this.showNotification('Création de la sauvegarde en cours...', 'info');
            await this.apiCall('/api/admin/backup', { method: 'POST' });
            this.showNotification('Sauvegarde créée avec succès!', 'success');
            this.loadSectionData('backup-restore');
        } catch (error) {
            console.error('Error creating backup:', error);
            this.showNotification('Erreur lors de la création de la sauvegarde', 'error');
        }
    }

    async restoreBackup(backupName) {
        if (!confirm(`Êtes-vous sûr de vouloir restaurer la sauvegarde "${backupName}" ? Ceci remplacera toutes les données actuelles!`)) {
            return;
        }

        try {
            this.showNotification('Restauration en cours...', 'info');
            await this.apiCall(`/api/admin/restore/${backupName}`, { method: 'POST' });
            this.showNotification('Restauration terminée avec succès!', 'success');
            this.loadSectionData('backup-restore');
        } catch (error) {
            console.error('Error restoring backup:', error);
            this.showNotification('Erreur lors de la restauration', 'error');
        }
    }

    async deleteBackup(backupName) {
        if (!confirm(`Êtes-vous sûr de vouloir supprimer la sauvegarde "${backupName}" ?`)) {
            return;
        }

        try {
            await this.apiCall(`/api/admin/backups/${backupName}`, { method: 'DELETE' });
            this.showNotification('Sauvegarde supprimée avec succès!', 'success');
            this.loadSectionData('backup-restore');
        } catch (error) {
            console.error('Error deleting backup:', error);
            this.showNotification('Erreur lors de la suppression', 'error');
        }
    }

    async loadFileManagerSection() {
        try {
            const data = await this.apiCall('/api/admin/files');
            const sectionElement = document.getElementById('file-manager');

            sectionElement.innerHTML = `
                <div class="section-header">
                    <h1 class="page-title">Gestionnaire de Fichiers</h1>
                </div>
                <div class="data-table">
                    <div class="table-header">
                        <h3>Fichiers (${data.files.length})</h3>
                    </div>
                    <div class="table-content">
                        ${this.renderFilesTable(data.files)}
                    </div>
                </div>
            `;

            this.attachFileEventListeners();
        } catch (error) {
            console.error('Error loading files:', error);
            this.showNotification('Erreur lors du chargement des fichiers', 'error');
        }
    }

    renderFilesTable(files) {
        if (!files.length) {
            return '<p style="padding: 20px; text-align: center; color: #666;">Aucun fichier trouvé.</p>';
        }

        const formatBytes = (bytes, decimals = 2) => {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        };

        const isImage = filename => /\.(jpg|jpeg|png|gif|webp)$/i.test(filename);

        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; padding: 20px;">
                ${files.map(file => `
                    <div style="background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
                        ${isImage(file.name) ? `
                            <img src="${file.path}" alt="${file.name}" style="width: 100%; height: 150px; object-fit: cover;" />
                        ` : `
                            <div style="width: 100%; height: 150px; background: #f0f0f0; display: flex; align-items: center; justify-content: center;">
                                <i class="fas fa-file" style="font-size: 48px; color: #666;"></i>
                            </div>
                        `}
                        <div style="padding: 12px;">
                            <p style="font-weight: 500; margin: 0 0 8px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${file.name}">${file.name}</p>
                            <p style="font-size: 12px; color: #666; margin: 0 0 8px 0;">${file.directory} • ${formatBytes(file.size)}</p>
                            <p style="font-size: 12px; color: #999; margin: 0 0 12px 0;">${new Date(file.createdAt).toLocaleDateString()}</p>
                            <div style="display: flex; gap: 8px;">
                                <a href="${file.path}" target="_blank" class="btn btn-sm" style="flex: 1; background: #007bff; color: white; padding: 6px 10px; border: none; border-radius: 4px; cursor: pointer; text-align: center; text-decoration: none;">
                                    <i class="fas fa-eye"></i> Voir
                                </a>
                                <button class="btn btn-sm delete-file-btn" data-directory="${file.directory}" data-filename="${file.name}" style="background: #dc3545; color: white; padding: 6px 10px; border: none; border-radius: 4px; cursor: pointer;">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    attachFileEventListeners() {
        document.querySelectorAll('.delete-file-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const directory = btn.dataset.directory;
                const filename = btn.dataset.filename;
                this.deleteFile(directory, filename);
            });
        });
    }

    async deleteFile(directory, filename) {
        if (!confirm(`Êtes-vous sûr de vouloir supprimer le fichier "${filename}" ?`)) {
            return;
        }

        try {
            await this.apiCall(`/api/admin/files/${directory}/${filename}`, { method: 'DELETE' });
            this.showNotification('Fichier supprimé avec succès!', 'success');
            this.loadSectionData('file-manager');
        } catch (error) {
            console.error('Error deleting file:', error);
            this.showNotification('Erreur lors de la suppression', 'error');
        }
    }

    async loadServicesSection() {
        const el = document.getElementById('services');
        el.innerHTML = `<div class="loading"><div class="spinner"></div><p>Chargement des services…</p></div>`;
        try {
            const services = await this.apiCall('/api/content/services');
            const sc = document.getElementById('servicesCount');
            if (sc) sc.textContent = Array.isArray(services) ? services.length : 0;

            el.innerHTML = `
                <div class="section-header" style="margin-bottom:24px;">
                    <div class="page-title"><i class="fas fa-concierge-bell"></i> Services</div>
                    <button class="btn btn-gold" id="addServiceBtn">
                        <i class="fas fa-plus"></i> Nouveau service
                    </button>
                </div>
                ${!services || services.length === 0 ? `
                    <div class="panel-card" style="text-align:center;padding:56px 24px;">
                        <i class="fas fa-concierge-bell" style="font-size:3rem;color:var(--gray);display:block;margin-bottom:16px;"></i>
                        <p style="color:var(--gray-dark);font-size:.92rem;margin-bottom:20px;">Aucun service enregistré.</p>
                        <button class="btn btn-gold" id="addServiceBtnEmpty"><i class="fas fa-plus"></i> Ajouter le premier service</button>
                    </div>
                ` : `
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;">
                        ${services.map(s => `
                            <div class="panel-card" style="padding:0;overflow:hidden;">
                                <div style="height:155px;background:linear-gradient(135deg,var(--navy),#1e3d78);position:relative;overflow:hidden;">
                                    ${s.imageUrl
                                        ? `<img src="${s.imageUrl}" alt="${s.name||s.title||''}"
                                               style="width:100%;height:100%;object-fit:cover;">`
                                        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.2);font-size:2.5rem;">
                                               <i class="fas ${s.icon||'fa-concierge-bell'}"></i>
                                           </div>`
                                    }
                                    ${s.subPages&&s.subPages.length>0 ? `
                                        <div style="position:absolute;bottom:8px;left:8px;display:flex;flex-wrap:wrap;gap:4px;">
                                            ${s.subPages.map(sp=>`
                                                <span style="background:var(--gold);color:var(--navy);font-size:.58rem;font-weight:800;padding:2px 7px;border-radius:3px;text-transform:uppercase;">${sp.title}</span>
                                            `).join('')}
                                        </div>
                                    ` : ''}
                                </div>
                                <div style="padding:16px 18px;">
                                    <div style="font-size:1rem;font-weight:800;color:var(--navy);margin-bottom:4px;">${s.name||s.title||'—'}</div>
                                    <div style="font-size:.78rem;color:var(--gray-dark);line-height:1.5;margin-bottom:14px;min-height:36px;">${(s.description||'').slice(0,90)}${s.description&&s.description.length>90?'…':''}</div>
                                    <div style="display:flex;gap:8px;">
                                        <button class="btn btn-sm btn-primary edit-service-btn" data-id="${s._id}" title="Modifier">
                                            <i class="fas fa-edit"></i> Modifier
                                        </button>
                                        <button class="btn btn-sm btn-danger delete-service-btn" data-id="${s._id}" title="Supprimer">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}`;

            document.getElementById('addServiceBtn')?.addEventListener('click', () => this.showServiceForm());
            document.getElementById('addServiceBtnEmpty')?.addEventListener('click', () => this.showServiceForm());
            this.attachServiceEventListeners();

        } catch (err) {
            console.error('loadServicesSection error:', err);
            el.innerHTML = `<div class="page-title"><i class="fas fa-concierge-bell"></i> Services</div>
                <div class="panel-card" style="padding:24px;color:var(--danger);">
                    <i class="fas fa-exclamation-triangle"></i> Impossible de charger : ${err.message}
                </div>`;
        }
    }

    async loadEquipmentSection() {
        const equipment = await this.apiCall('/api/content/equipment');
        const sectionElement = document.getElementById('equipment');

        sectionElement.innerHTML = `
            <div class="section-header">
                <h1 class="page-title">Gestion des Équipements</h1>
                <button class="btn btn-primary" id="addEquipmentBtn">
                    <i class="fas fa-plus"></i> Ajouter un équipement
                </button>
            </div>
            <div class="data-table">
                <div class="table-header">
                    <h3>Équipements (${equipment.length})</h3>
                </div>
                <div class="table-content">
                    ${this.renderEquipmentTable(equipment)}
                </div>
            </div>
        `;

        // Add event listener for add button
        document.getElementById('addEquipmentBtn')?.addEventListener('click', () => this.addEquipment());

        // Add event listeners for edit/delete buttons
        this.attachEquipmentEventListeners();
    }

    async loadProjectsSection() {
        const el = document.getElementById('projects');
        el.innerHTML = `<div class="loading"><div class="spinner"></div><p>Chargement des projets…</p></div>`;
        try {
            const projects = await this.apiCall('/api/content/projects');
            const pc = document.getElementById('projectsCount');
            if (pc) pc.textContent = Array.isArray(projects) ? projects.length : 0;

            const catLabel = {
                'gros-oeuvre':'Gros Œuvre', civil:'Génie Civil', metal:'Métallique',
                metallique:'Métallique', renovation:'Rénovation', finition:'Finition',
                nettoyage:'Nettoyage', 'pure-water':'Pure Water', divers:'Divers',
            };
            const catColor = {
                'gros-oeuvre':'#1a3560', civil:'#1a5276', metal:'#1a7a4a',
                metallique:'#1a7a4a', renovation:'#7b3f00', finition:'#4a235a',
                nettoyage:'#0e6655', 'pure-water':'#1a5276', divers:'#5a6a7a',
            };

            el.innerHTML = `
                <div class="section-header" style="margin-bottom:24px;">
                    <div class="page-title"><i class="fas fa-hard-hat"></i> Projets</div>
                    <button class="btn btn-gold" id="addProjectBtn">
                        <i class="fas fa-plus"></i> Nouveau projet
                    </button>
                </div>
                ${!projects || projects.length === 0 ? `
                    <div class="panel-card" style="text-align:center;padding:56px 24px;">
                        <i class="fas fa-hard-hat" style="font-size:3rem;color:var(--gray);display:block;margin-bottom:16px;"></i>
                        <p style="color:var(--gray-dark);font-size:.92rem;margin-bottom:20px;">Aucun projet enregistré.</p>
                        <button class="btn btn-gold" id="addProjectBtnEmpty"><i class="fas fa-plus"></i> Ajouter le premier projet</button>
                    </div>
                ` : `
                    <div class="data-table">
                        <div class="table-header">
                            <h3>Projets (${projects.length})</h3>
                        </div>
                        <div class="table-content">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Image</th>
                                        <th>Titre</th>
                                        <th>Catégorie</th>
                                        <th>Localisation</th>
                                        <th>Date</th>
                                        <th style="text-align:center;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${projects.map(p => {
                                        const cat   = (p.category||'').toLowerCase();
                                        const label = catLabel[cat] || p.category || '—';
                                        const color = catColor[cat] || '#5a6a7a';
                                        const date  = p.date
                                            ? new Date(p.date).getFullYear()
                                            : (p.createdAt ? new Date(p.createdAt).getFullYear() : '—');
                                        return `
                                        <tr>
                                            <td>
                                                ${p.imageUrl
                                                    ? `<img src="${p.imageUrl}" alt="${p.title||''}"
                                                           style="width:60px;height:42px;object-fit:cover;border-radius:5px;">
                                                       <div style="display:none;width:60px;height:42px;background:var(--gray-light);border-radius:5px;align-items:center;justify-content:center;color:var(--gray);font-size:.7rem;">
                                                           <i class="fas fa-image"></i>
                                                       </div>`
                                                    : `<div style="width:60px;height:42px;background:var(--gray-light);border-radius:5px;display:flex;align-items:center;justify-content:center;color:var(--gray);"><i class="fas fa-image"></i></div>`
                                                }
                                            </td>
                                            <td style="font-weight:600;color:var(--navy);">${p.title||'—'}</td>
                                            <td>
                                                <span style="background:${color};color:#fff;font-size:.68rem;font-weight:700;padding:3px 9px;border-radius:12px;">${label}</span>
                                            </td>
                                            <td style="color:var(--gray-dark);font-size:.82rem;">${p.location||'—'}</td>
                                            <td style="color:var(--gray-dark);">${date}</td>
                                            <td style="text-align:center;">
                                                <div style="display:flex;gap:6px;justify-content:center;">
                                                    <button class="btn btn-sm btn-primary edit-project-btn" data-id="${p._id}" title="Modifier">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button class="btn btn-sm btn-danger delete-project-btn" data-id="${p._id}" title="Supprimer">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>`;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `}`;

            document.getElementById('addProjectBtn')?.addEventListener('click', () => this.showProjectForm());
            document.getElementById('addProjectBtnEmpty')?.addEventListener('click', () => this.showProjectForm());
            this.attachProjectEventListeners();

        } catch (err) {
            console.error('loadProjectsSection error:', err);
            el.innerHTML = `<div class="page-title"><i class="fas fa-hard-hat"></i> Projets</div>
                <div class="panel-card" style="padding:24px;color:var(--danger);">
                    <i class="fas fa-exclamation-triangle"></i> Impossible de charger : ${err.message}
                </div>`;
        }
    }

  // ================== MESSAGES ===================
    async loadMessagesSection() {
    try {
        const token = sessionStore.getItem("akime_token"); // ✅ use your token
        if (!token) {
            document.querySelector("#messages").innerHTML = `<p>Non autorisé. Veuillez vous reconnecter.</p>`;
            return;
        }

        const res = await fetch(`${this.apiBase}/contact`, {
            headers: { 
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json"
            }
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();

        if (result.success) {
            const container = document.querySelector("#messages");
            if (container) {
                container.querySelector(".loading")?.remove(); // ✅ remove loader if exists
                container.innerHTML = this.renderMessagesTable(result.data);
                this.attachMessageBulkEventListeners();
                this.attachMessageEventListeners();
            }
        } else {
            throw new Error(result.message || "Erreur lors du chargement");
        }
    } catch (err) {
        console.error("Error loading messages:", err);
        document.querySelector("#messages").innerHTML = `<p>Impossible de charger les messages.</p>`;
    }
}

    attachMessageBulkEventListeners() {
        const selectAllCheckbox = document.getElementById('selectAllMessages');
        const checkboxes = document.querySelectorAll('.message-checkbox');
        const bulkActionsDiv = document.getElementById('messageBulkActions');
        
        if (!selectAllCheckbox || !bulkActionsDiv) return;
        
        // Select all
        selectAllCheckbox.addEventListener('change', (e) => {
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            this.toggleMessageBulkActions(bulkActionsDiv, checkboxes);
        });
        
        // Individual checkboxes
        checkboxes.forEach(cb => {
            cb.addEventListener('change', () => this.toggleMessageBulkActions(bulkActionsDiv, checkboxes));
        });
        
        // Bulk mark as read
        document.getElementById('bulkMarkReadBtn')?.addEventListener('click', () => this.bulkMarkAsRead());
        
        // Bulk delete
        document.getElementById('bulkDeleteMessageBtn')?.addEventListener('click', () => this.bulkDeleteMessages());
    }
    
    toggleMessageBulkActions(bulkActionsDiv, checkboxes) {
        const anyChecked = Array.from(checkboxes).some(cb => cb.checked);
        bulkActionsDiv.style.display = anyChecked ? 'flex' : 'none';
    }
    
    async bulkMarkAsRead() {
        const checkboxes = document.querySelectorAll('.message-checkbox:checked');
        const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
        
        if (ids.length === 0) return;
        
        try {
            await this.apiCall('/api/contact/bulk/read', { 
                method: 'PUT', 
                body: JSON.stringify({ ids }) 
            });
            this.showNotification(`${ids.length} messages marqués comme lus ✅`, 'success');
            this.loadMessagesSection();
            updateUnreadBadge();
        } catch (error) {
            console.error('Bulk mark as read error:', error);
            this.showNotification('Erreur lors de la mise à jour en masse', 'error');
        }
    }
    
    async bulkDeleteMessages() {
        const checkboxes = document.querySelectorAll('.message-checkbox:checked');
        const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
        
        if (ids.length === 0) return;
        
        if (confirm(`Êtes-vous sûr de vouloir supprimer ${ids.length} messages ?`)) {
            try {
                await this.apiCall('/api/contact/bulk/delete', { 
                    method: 'DELETE', 
                    body: JSON.stringify({ ids }) 
                });
                this.showNotification(`${ids.length} messages supprimés 🗑`, 'success');
                this.loadMessagesSection();
                updateUnreadBadge();
            } catch (error) {
                console.error('Bulk delete messages error:', error);
                this.showNotification('Erreur lors de la suppression en masse', 'error');
            }
        }
    }

    renderMessagesTable(messages) {
    if (!messages.length) {
        return '<p>Aucun message trouvé.</p>';
    }

    return `
        <div style="padding: 15px; border-bottom: 1px solid #e9ecef; display:flex; gap:8px; align-items:center;">
          <div id="messageBulkActions" style="display:none; gap:8px;">
            <button class="btn btn-sm" id="bulkMarkReadBtn" style="background: #007bff; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">
              <i class="fas fa-check"></i> Marquer comme lus
            </button>
            <button class="btn btn-sm" id="bulkDeleteMessageBtn" style="background: #dc3545; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">
              <i class="fas fa-trash"></i> Supprimer sélectionnés
            </button>
          </div>
        </div>
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="border-bottom: 1px solid #e9ecef;">
                    <th style="padding: 12px; text-align: left;">
                      <input type="checkbox" id="selectAllMessages" style="width:18px; height:18px; cursor:pointer;">
                    </th>
                    <th style="padding: 12px; text-align: left;">Nom</th>
                    <th style="padding: 12px; text-align: left;">Email</th>
                    <th style="padding: 12px; text-align: left;">Téléphone</th>
                    <th style="padding: 12px; text-align: left;">Entreprise</th>
                    <th style="padding: 12px; text-align: left;">Sujet</th>
                    <th style="padding: 12px; text-align: left;">Message</th>
                    <th style="padding: 12px; text-align: left;">Date</th>
                    <th style="padding: 12px; text-align: center;">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${messages.map(msg => `
                    <tr style="border-bottom: 1px solid #f8f9fa; ${msg.read ? '' : 'background: #f0f8ff;'}">
                        <td style="padding:12px;">
                          <input type="checkbox" class="message-checkbox" data-id="${msg._id}" style="width:18px; height:18px; cursor:pointer;">
                        </td>
                        <td style="padding: 12px;">${msg.name || '-'}</td>
                        <td style="padding: 12px;">${msg.email || '-'}</td>
                        <td style="padding: 12px;">${msg.phone || '-'}</td>
                        <td style="padding: 12px;">${msg.company || '-'}</td>
                        <td style="padding: 12px;">${msg.subject || '(Sans sujet)'}</td>
                        <td style="padding: 12px;">${msg.content?.substring(0, 100) || ''}...</td>
                        <td style="padding: 12px;">${new Date(msg.createdAt).toLocaleDateString()}</td>
                        <td style="padding: 12px; text-align: center;">
                            ${!msg.read ? `
                                <button class="btn btn-sm view-unread-message-btn" data-id="${msg._id}"
                                    style="background: #007bff; color: white; margin-right: 5px;">
                                    <i class="fas fa-eye"></i>
                                </button>
                            ` : `
                                <button class="btn btn-sm view-message-btn" data-id="${msg._id}"
                                    style="background: #6c757d; color: white; margin-right: 5px;">
                                    <i class="fas fa-eye"></i>
                                </button>
                            `}
                            <button class="btn btn-sm delete-message-btn" data-id="${msg._id}"
                                style="background: #dc3545; color: white;">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Add inside AdminDashboard class
async openAndMarkAsRead(messageId) {
    try {
        // Mark as read first
        await this.markAsRead(messageId);

        // Then show full message
        await this.showFullMessage(messageId);
    } catch (err) {
        console.error("Erreur openAndMarkAsRead:", err);
    }
}




    // ============= SIMPLE MODAL ==============
    showModal(title, content) {
        const modal = document.createElement("div");
        modal.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;";
        modal.innerHTML = `
            <div style="background:white;padding:20px;border-radius:8px;max-width:600px;width:100%;">
                <h2>${title}</h2>
                <div>${content}</div>
                <button class="simple-modal-close" style="margin-top:15px;background:#333;color:white;padding:8px 12px;border:none;border-radius:4px;">Fermer</button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('.simple-modal-close')?.addEventListener('click', () => modal.remove());
    }

    
// ✅ Mark message as read
async markAsRead(messageId) {
    try {
        const res = await fetch(`${this.apiBase}/contact/${messageId}/read`, {
            method: "PUT",
            headers: {
                "Authorization": "Bearer " + sessionStore.getItem("akime_token"),
                "Content-Type": "application/json"
            }
        });

        const result = await res.json();
        if (result.success) {
            // Refresh messages UI
            this.loadMessagesSection();

            // ✅ Call the global updateUnreadBadge function (not this.updateUnreadBadge)
            if (typeof updateUnreadBadge === "function") {
                updateUnreadBadge();
            }
        } else {
            console.error("Erreur markAsRead:", result.message);
        }
    } catch (err) {
        console.error("Erreur markAsRead:", err);
    }
}






    async loadCompanySection() {
        const company = await this.apiCall('/api/content/company');
        const sectionElement = document.getElementById('company');

        sectionElement.innerHTML = `
            <div class="section-header">
                <h1 class="page-title">Informations de l'Entreprise</h1>
                <button class="btn btn-primary" id="editCompanyBtn">
                    <i class="fas fa-edit"></i> Modifier
                </button>
            </div>
            <div class="data-table">
                <div class="table-content">
                    ${this.renderCompanyInfo(company)}
                </div>
            </div>
        `;

        // Add event listener for edit button
        document.getElementById('editCompanyBtn')?.addEventListener('click', () => this.editCompany());
    }

    renderEquipmentTable(equipment) {
        if (!equipment.length) {
            return '<p>Aucun équipement trouvé.</p>';
        }

        return `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 1px solid #e9ecef;">
                        <th style="padding: 12px; text-align: left;">Nom</th>
                        <th style="padding: 12px; text-align: left;">Catégorie</th>
                        <th style="padding: 12px; text-align: left;">Description</th>
                        <th style="padding: 12px; text-align: center;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${equipment.map(item => `
                        <tr style="border-bottom: 1px solid #f8f9fa;">
                            <td style="padding: 12px;">${item.name}</td>
                            <td style="padding: 12px;">${item.category}</td>
                            <td style="padding: 12px;">${item.description?.substring(0, 100) || ''}...</td>
                            <td style="padding: 12px; text-align: center;">
                                <button class="btn btn-sm edit-equipment-btn" data-id="${item._id}" style="background: #28a745; color: white; margin-right: 5px;">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm delete-equipment-btn" data-id="${item._id}" style="background: #dc3545; color: white;">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }


// ===========================
// ---- Témoignages CRUD -----
// ===========================

async loadTestimonialsSection() {
    const sectionElement = document.getElementById('testimonials');
    
    try {
        // ✅ CORRECT ENDPOINT - Use the testimonials route
        const testimonials = await this.apiCall('/api/testimonials/admin/all');
        
        sectionElement.innerHTML = `
            <div class="section-header" style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                <h1 class="page-title">Gestion des Témoignages</h1>
                <div style="display:flex; gap:8px; align-items:center;">
                    <div id="testimonialBulkActions" style="display:none; gap:8px;">
                      <button class="btn btn-sm" id="bulkApproveTestimonialBtn" style="background: #28a745; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">
                        <i class="fas fa-check"></i> Approuver sélectionnés
                      </button>
                      <button class="btn btn-sm" id="bulkDeleteTestimonialBtn" style="background: #dc3545; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">
                        <i class="fas fa-trash"></i> Supprimer sélectionnés
                      </button>
                    </div>
                    <button class="btn btn-primary" id="addTestimonialBtn">
                        <i class="fas fa-plus"></i> Ajouter un témoignage
                    </button>
                </div>
            </div>
            <div class="data-table">
                <div class="table-header">
                    <h3>Témoignages (${testimonials.length})</h3>
                </div>
                <div class="table-content">
                    ${this.renderTestimonialsTable(testimonials)}
                </div>
            </div>
        `;

        document.getElementById('addTestimonialBtn')?.addEventListener('click', () => this.addTestimonial());
        this.attachTestimonialEventListeners();
        this.attachTestimonialBulkEventListeners();

    } catch (error) {
        console.error('Error loading testimonials:', error);
        this.showError(sectionElement, 'Erreur lors du chargement des témoignages');
    }
}

renderTestimonialsTable(testimonials) {
  if (!testimonials.length) {
    return '<p style="padding:20px; text-align:center; color:#666;">Aucun témoignage trouvé.</p>';
  }

  return `
    <table style="width:100%; border-collapse: collapse;">
      <thead>
        <tr style="background:#f8f9fa; border-bottom:1px solid #ddd;">
          <th style="padding:12px; text-align:left;">
            <input type="checkbox" id="selectAllTestimonials" style="width:18px; height:18px; cursor:pointer;">
          </th>
          <th style="padding:12px; text-align:left;">Nom</th>
          <th style="padding:12px; text-align:left;">Entreprise</th>
          <th style="padding:12px; text-align:left;">Message</th>
          <th style="padding:12px; text-align:left;">Note</th>
          <th style="padding:12px; text-align:center;">Statut</th>
          <th style="padding:12px; text-align:center;">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${testimonials.map(t => `
          <tr>
            <td style="padding:12px;">
              <input type="checkbox" class="testimonial-checkbox" data-id="${t._id}" style="width:18px; height:18px; cursor:pointer;">
            </td>
            <td style="padding:12px;">${t.name}</td>
            <td style="padding:12px;">${t.company || '-'}</td>
            <td style="padding:12px; max-width:300px;">${t.message}</td>
            <td style="padding:12px;">${t.rating ? '⭐'.repeat(t.rating) : '-'}</td>
            <td style="padding:12px; text-align:center;">
              ${t.approved 
                ? '<span style="color:green; font-weight:bold;">Approuvé</span>'
                : '<span style="color:orange; font-weight:bold;">En attente</span>'}
            </td>
            <td style="padding:12px; text-align:center;">
              <button class="btn btn-sm edit-testimonial-btn" data-id="${t._id}" style="background:#17a2b8; color:white; margin-right:5px;">
                <i class="fas fa-edit"></i>
              </button>
              ${!t.approved 
                ? `<button class="btn btn-sm approve-testimonial-btn" data-id="${t._id}" style="background:#28a745; color:white; margin-right:5px;">
                     <i class="fas fa-check"></i>
                   </button>` 
                : ''}
              <button class="btn btn-sm delete-testimonial-btn" data-id="${t._id}" style="background:#dc3545; color:white;">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}



    

    renderCompanyInfo(company) {
        return `
            <div style="padding: 20px;">
                <h3>Informations générales</h3>
                <p><strong>Nom:</strong> ${company.name || 'A-KIME Sarl'}</p>
                <p><strong>Email:</strong> ${company.email || 'infosakime@gmail.com'}</p>
                <p><strong>Téléphone:</strong> ${company.phone || '+237 698 01 20 93'}</p>
                <p><strong>Adresse:</strong> ${company.address || 'Yaoundé, Pont Emana, Cameroun'}</p>
                <p><strong>Description:</strong> ${company.description || 'Entreprise de génie civil et construction métallique'}</p>
            </div>
        `;
    }

    

    async apiCall(endpoint, options = {}) {
        const defaultOptions = {
            headers: {
                'Authorization': `Bearer ${this.token}`
            }
        };
        if (!(options.body instanceof FormData)) {
            defaultOptions.headers['Content-Type'] = 'application/json';
        }

        let response = await fetch(endpoint, { ...defaultOptions, ...options });

        // If unauthorized, try to refresh token once
        if (response.status === 401) {
            const refreshed = await this.refreshAccessToken();
            if (refreshed) {
                // Retry the request with new token
                defaultOptions.headers['Authorization'] = `Bearer ${this.token}`;
                response = await fetch(endpoint, { ...defaultOptions, ...options });
            } else {
                this.redirectToLogin();
                return;
            }
        }

        // Handle other error statuses
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Network error' }));
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.success === false) {
            throw new Error(data.message);
        }

        return data.data || data;
    }

    getSectionTitle(section) {
        const titles = {
            services: 'Gestion des Services',
            equipment: 'Gestion des Équipements',
            projects: 'Gestion des Projets',
            'delivery-projects': 'Gestion des Projets Internes',
            messages: 'Messages de Contact',
            testimonials: 'Gestion des Témoignages',
            company: 'Informations de l\'Entreprise',
            users: 'Gestion des Utilisateurs',
            'audit-logs': 'Journal d\'Audit',
            'backup-restore': 'Sauvegarde/Restauration',
            'file-manager': 'Gestionnaire de Fichiers'
        };
        return titles[section] || section;
    }

    showError(element, message) {
        element.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #dc3545;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px;"></i>
                <p>${message}</p>
            </div>
        `;
    }

    async logout() {
        try {
            // Call server logout endpoint to invalidate tokens
            await fetch(`${this.apiBase}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                credentials: 'same-origin'
            });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.clearAuthData();
            window.location.href = 'login.html';
        }
    }

    // Event listener attachment methods
    attachServiceEventListeners() {
        document.querySelectorAll('.edit-service-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.showServiceForm(btn.dataset.id);
            });
        });
        document.querySelectorAll('.delete-service-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.deleteService(btn.dataset.id);
            });
        });
    }
    attachEquipmentEventListeners() {
        document.querySelectorAll('.edit-equipment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                this.editEquipment(id);
            });
        });

        document.querySelectorAll('.delete-equipment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                this.deleteEquipment(id);
            });
        });
    }

    attachTestimonialEventListeners() {
  document.querySelectorAll('.edit-testimonial-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      this.editTestimonial(id);
    });
  });

  document.querySelectorAll('.approve-testimonial-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (confirm("Approuver ce témoignage ?")) {
        await this.approveTestimonial(id);
      }
    });
  });

  document.querySelectorAll('.delete-testimonial-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (confirm("Supprimer ce témoignage ?")) {
        await this.deleteTestimonial(id);
      }
    });
  });
}

    attachTestimonialBulkEventListeners() {
        const selectAllCheckbox = document.getElementById('selectAllTestimonials');
        const checkboxes = document.querySelectorAll('.testimonial-checkbox');
        const bulkActionsDiv = document.getElementById('testimonialBulkActions');
        
        // Select all
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                checkboxes.forEach(cb => cb.checked = e.target.checked);
                this.toggleTestimonialBulkActions(bulkActionsDiv, checkboxes);
            });
        }
        
        // Individual checkboxes
        checkboxes.forEach(cb => {
            cb.addEventListener('change', () => this.toggleTestimonialBulkActions(bulkActionsDiv, checkboxes));
        });
        
        // Bulk approve
        document.getElementById('bulkApproveTestimonialBtn')?.addEventListener('click', () => this.bulkApproveTestimonials());
        
        // Bulk delete
        document.getElementById('bulkDeleteTestimonialBtn')?.addEventListener('click', () => this.bulkDeleteTestimonials());
    }
    
    toggleTestimonialBulkActions(bulkActionsDiv, checkboxes) {
        const anyChecked = Array.from(checkboxes).some(cb => cb.checked);
        bulkActionsDiv.style.display = anyChecked ? 'flex' : 'none';
    }
    
    async bulkApproveTestimonials() {
        const checkboxes = document.querySelectorAll('.testimonial-checkbox:checked');
        const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
        
        if (ids.length === 0) return;
        
        if (confirm(`Êtes-vous sûr de vouloir approuver ${ids.length} témoignages ?`)) {
            try {
                const result = await this.apiCall('/api/testimonials/bulk/approve', {
                    method: 'PUT', 
                    body: JSON.stringify({ ids }) 
                });
                this.showNotification(`${result.approvedCount} témoignages approuvés ✅`, 'success');
                this.loadSectionData('testimonials');
                updateUnreadBadge();
            } catch (error) {
                console.error('Bulk approve error:', error);
                this.showNotification('Erreur lors de l\'approbation en masse', 'error');
            }
        }
    }
    
    async bulkDeleteTestimonials() {
        const checkboxes = document.querySelectorAll('.testimonial-checkbox:checked');
        const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
        
        if (ids.length === 0) return;
        
        if (confirm(`Êtes-vous sûr de vouloir supprimer ${ids.length} témoignages ?`)) {
            try {
                const result = await this.apiCall('/api/testimonials/bulk/delete', {
                    method: 'DELETE', 
                    body: JSON.stringify({ ids }) 
                });
                this.showNotification(`${result.deletedCount} témoignages supprimés 🗑`, 'success');
                this.loadSectionData('testimonials');
                updateUnreadBadge();
            } catch (error) {
                console.error('Bulk delete error:', error);
                this.showNotification('Erreur lors de la suppression en masse', 'error');
            }
        }
    }

    attachProjectEventListeners() {
        document.querySelectorAll('.edit-project-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.showProjectForm(btn.dataset.id);
            });
        });
        document.querySelectorAll('.delete-project-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.deleteProject(btn.dataset.id);
            });
        });
    }



    attachMessageEventListeners() {
        document.querySelectorAll('.view-unread-message-btn').forEach(btn => {
            btn.addEventListener('click', () => this.openAndMarkAsRead(btn.dataset.id));
        });

        document.querySelectorAll('.view-message-btn').forEach(btn => {
            btn.addEventListener('click', () => this.showFullMessage(btn.dataset.id));
        });

        document.querySelectorAll('.mark-read-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                this.markAsRead(id);
            });
        });

        document.querySelectorAll('.delete-message-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.closest('button').dataset.id;
                this.deleteMessage(id);
            });
        });
    }
    

    async addTestimonial() {
    const modal = this.createModal('Ajouter un témoignage', this.getTestimonialForm());
    document.body.appendChild(modal);

    setTimeout(() => {
      const saveBtn = modal.querySelector('#saveTestimonialBtn');
      const closeBtn = modal.querySelector('.modal-close');

      if (saveBtn) {
        saveBtn.addEventListener('click', () => this.saveTestimonial(modal));
      }
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.closeModal(modal));
      }

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeModal(modal);
        }
      });
    }, 10);
}

async editTestimonial(id) {
    try {
        // Get all testimonials and find the specific one
        const testimonials = await this.apiCall('/api/testimonials/admin/all');
        const testimonial = testimonials.find(t => t._id === id);
        
        if (!testimonial) {
            this.showNotification('Témoignage non trouvé', 'error');
            return;
        }

        const modal = this.createModal('Modifier le témoignage', this.getTestimonialForm(testimonial));
        document.body.appendChild(modal);

        // Add event listeners for the modal
        setTimeout(() => {
            const saveBtn = modal.querySelector('#saveTestimonialBtn');
            const closeBtn = modal.querySelector('.modal-close');
            const overlay = modal.querySelector('.modal-overlay');

            if (saveBtn) {
                saveBtn.addEventListener('click', () => this.saveTestimonial(modal, id));
            }
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeModal(modal));
            }
            if (overlay) {
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) {
                        this.closeModal(modal);
                    }
                });
            }
        }, 10);

    } catch (error) {
        console.error('Error loading testimonial:', error);
        this.showNotification('Erreur lors du chargement du témoignage', 'error');
    }
}

async deleteTestimonial(id) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce témoignage ?')) {
        try {
            await this.apiCall(`/api/testimonials/${id}`, { method: 'DELETE' });
            this.showNotification('Témoignage supprimé avec succès', 'success');
            this.loadSectionData('testimonials');
        } catch (error) {
            console.error('Testimonial deletion failed:', error);
            this.showNotification(`Erreur lors de la suppression: ${error.message}`, 'error');
        }
    }
}

async approveTestimonial(id) {
    try {
        await this.apiCall(`/api/testimonials/${id}/approve`, { method: 'PUT' });
        this.showNotification('Témoignage approuvé', 'success');
        this.loadSectionData('testimonials');
    } catch (error) {
        console.error('Testimonial approval failed:', error);
        this.showNotification(`Erreur lors de l'approbation: ${error.message}`, 'error');
    }
}



    // Services CRUD operations
    // ══ showServiceForm — add (no id) or edit (with id) ══════════════
    async showServiceForm(serviceId = null) {
        let service = {};
        if (serviceId) {
            try {
                const res = await this.apiCall(`/api/content/services/${serviceId}`);
                service = res || {};
            } catch (e) {
                // fallback: get from list
                const all = await this.apiCall('/api/content/services');
                service = (all || []).find(s => s._id === serviceId) || {};
            }
        }

        // Build the full-page form overlay (not a small modal)
        const overlay = document.createElement('div');
        overlay.id = 'serviceFormOverlay';
        overlay.style.cssText = `
            position:fixed;inset:0;background:var(--off-white);z-index:600;
            overflow-y:auto;padding:0;
        `;

        const subPagesJson = JSON.stringify(service.subPages || []);

        overlay.innerHTML = `
        <div style="background:var(--white);border-bottom:1px solid var(--gray-light);
                    padding:16px 32px;display:flex;align-items:center;gap:16px;
                    position:sticky;top:0;z-index:10;box-shadow:var(--shadow-sm);">
            <button id="svcBackBtn" style="display:inline-flex;align-items:center;gap:8px;
                    padding:8px 16px;border-radius:var(--radius-sm);background:var(--off-white);
                    border:1.5px solid var(--gray-light);color:var(--navy);font-size:.8rem;
                    font-weight:700;cursor:pointer;font-family:var(--font);">
                <i class="fas fa-arrow-left"></i> Retour aux services
            </button>
            <span style="font-size:1rem;font-weight:800;color:var(--navy);">
                ${serviceId ? 'Modifier le service' : 'Nouveau service'}
            </span>
            <button id="svcSaveBtn" style="margin-left:auto;display:inline-flex;align-items:center;
                    gap:8px;padding:10px 24px;border-radius:var(--radius-sm);
                    background:var(--gold);color:var(--navy);font-size:.8rem;font-weight:800;
                    cursor:pointer;border:none;font-family:var(--font);">
                <i class="fas fa-save"></i> Enregistrer
            </button>
        </div>

        <div style="max-width:900px;margin:0 auto;padding:32px 24px;display:grid;
                    grid-template-columns:1fr 1fr;gap:24px;">

            <!-- Left column: main info -->
            <div>
                <div class="panel-card">
                    <div class="panel-card-title"><i class="fas fa-info-circle"></i> Informations principales</div>

                    <div class="form-group">
                        <label>NOM DU SERVICE <span style="color:var(--gold)">*</span></label>
                        <input id="svcName" type="text" value="${service.name || service.title || ''}"
                               placeholder="ex: Gros Œuvre">
                    </div>
                    <div class="form-group">
                        <label>CATÉGORIE (slug) <span style="color:var(--gold)">*</span></label>
                        <input id="svcCategory" type="text" value="${service.category || ''}"
                               placeholder="ex: gros-oeuvre">
                        <span style="font-size:.7rem;color:var(--gray);">Utilisé comme identifiant. Sans espaces, en minuscules.</span>
                    </div>
                    <div class="form-group">
                        <label>DESCRIPTION <span style="color:var(--gold)">*</span></label>
                        <textarea id="svcDesc" rows="4"
                                  placeholder="Description affichée sur le site public…">${service.description || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label>ICÔNE FONT-AWESOME</label>
                        <input id="svcIcon" type="text" value="${service.icon || 'fa-cogs'}"
                               placeholder="ex: fa-building">
                        <span style="font-size:.7rem;color:var(--gray);">Classe Font Awesome sans "fas" (ex: fa-hard-hat)</span>
                    </div>
                </div>
            </div>

            <!-- Right column: image + sub-pages -->
            <div style="display:flex;flex-direction:column;gap:24px;">

                <!-- Image upload -->
                <div class="panel-card">
                    <div class="panel-card-title"><i class="fas fa-image"></i> Image du service</div>
                    <div id="svcImgPreview" style="width:100%;height:160px;border-radius:8px;
                         overflow:hidden;background:var(--off-white);border:2px dashed var(--gray-light);
                         display:flex;align-items:center;justify-content:center;margin-bottom:12px;
                         color:var(--gray);font-size:.85rem;position:relative;">
                        ${service.imageUrl
                            ? `<img src="${service.imageUrl}" style="width:100%;height:100%;object-fit:cover;">`
                            : `<div style="text-align:center;"><i class="fas fa-image" style="font-size:2rem;display:block;margin-bottom:8px;"></i>Aucune image</div>`
                        }
                    </div>
                    <label style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;
                           background:var(--navy);color:var(--white);border-radius:var(--radius-sm);
                           font-size:.75rem;font-weight:700;cursor:pointer;letter-spacing:.04em;">
                        <i class="fas fa-upload"></i> CHOISIR UNE IMAGE
                        <input type="file" id="svcImageFile" accept="image/*" style="display:none;">
                    </label>
                    <span id="svcImageName" style="font-size:.75rem;color:var(--gray);margin-left:8px;"></span>
                </div>

                <!-- Sub-pages builder -->
                <div class="panel-card">
                    <div class="panel-card-title"><i class="fas fa-layer-group"></i> Sous-pages
                        <button id="addSubPageBtn" style="margin-left:auto;padding:5px 12px;
                                background:var(--gold-soft);border:1px solid var(--gold);
                                color:var(--gold-dark);border-radius:var(--radius-sm);
                                font-size:.7rem;font-weight:700;cursor:pointer;font-family:var(--font);">
                            <i class="fas fa-plus"></i> Ajouter
                        </button>
                    </div>
                    <p style="font-size:.75rem;color:var(--gray);margin-bottom:12px;">
                        Ex: FONDATIONS, BÉTON ARMÉ, MAÇONNERIE — apparaissent comme tags cliquables sous l'image.
                    </p>
                    <div id="subPagesList" style="display:flex;flex-direction:column;gap:10px;">
                        <!-- populated by JS -->
                    </div>
                </div>
            </div>

            <!-- Full-width: preview of how it looks on public site -->
            <div style="grid-column:1/-1;">
                <div class="panel-card">
                    <div class="panel-card-title"><i class="fas fa-eye"></i> Aperçu public</div>
                    <div style="display:grid;grid-template-columns:200px 1fr;border-radius:10px;
                                overflow:hidden;border:1px solid var(--gray-light);">
                        <!-- Image preview side -->
                        <div id="previewImg" style="background:var(--navy);min-height:180px;
                             display:flex;align-items:center;justify-content:center;
                             color:rgba(255,255,255,.3);position:relative;overflow:hidden;">
                            ${service.imageUrl
                                ? `<img src="${service.imageUrl}" style="width:100%;height:100%;object-fit:cover;">`
                                : `<i class="fas fa-concierge-bell" style="font-size:2rem;"></i>`
                            }
                            <div id="previewTags" style="position:absolute;bottom:10px;left:10px;
                                 display:flex;flex-wrap:wrap;gap:4px;">
                                ${(service.subPages||[]).map(sp => `
                                    <span style="background:var(--gold);color:var(--navy);
                                          font-size:.6rem;font-weight:800;padding:3px 8px;
                                          border-radius:3px;text-transform:uppercase;">${sp.title}</span>
                                `).join('')}
                            </div>
                        </div>
                        <!-- Text side -->
                        <div style="padding:20px;background:var(--white);">
                            <div id="previewTitle" style="font-size:1.1rem;font-weight:800;
                                 color:var(--navy);margin-bottom:8px;">
                                ${service.name || service.title || 'Nom du service'}
                            </div>
                            <div id="previewDesc" style="font-size:.85rem;color:var(--gray-dark);
                                 line-height:1.6;margin-bottom:16px;">
                                ${service.description || 'Description du service…'}
                            </div>
                            <div id="previewSubNav" style="display:flex;flex-wrap:wrap;gap:6px;">
                                ${(service.subPages||[]).map((sp,i) => `
                                    <button style="padding:6px 14px;border-radius:4px;font-size:.75rem;
                                            font-weight:700;cursor:pointer;border:none;
                                            background:${i===0?'var(--navy)':'var(--gray-light)'};
                                            color:${i===0?'var(--white)':'var(--gray-dark)'};">
                                        ${sp.title}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div><!-- /grid -->
        `;

        document.body.appendChild(overlay);

        // ── Populate sub-pages ─────────────────────────────────────────
        const subPages = service.subPages ? [...service.subPages] : [];
        const subList  = overlay.querySelector('#subPagesList');

        const renderSubList = () => {
            subList.innerHTML = subPages.map((sp, i) => `
                <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:start;"
                     data-idx="${i}">
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        <input class="sp-title" type="text" value="${sp.title}"
                               placeholder="Titre ex: FONDATIONS"
                               style="padding:8px 10px;border:1.5px solid var(--gray-light);
                                      border-radius:var(--radius-sm);font-size:.82rem;
                                      font-family:var(--font);width:100%;outline:none;">
                        <textarea class="sp-desc" rows="2" placeholder="Description (optionnel)"
                                  style="padding:8px 10px;border:1.5px solid var(--gray-light);
                                         border-radius:var(--radius-sm);font-size:.78rem;
                                         font-family:var(--font);width:100%;resize:none;outline:none;"
                                  >${sp.description || ''}</textarea>
                    </div>
                    <button class="sp-del" data-idx="${i}"
                            style="padding:6px 10px;background:rgba(192,57,43,.1);
                                   border:1px solid rgba(192,57,43,.2);border-radius:var(--radius-sm);
                                   color:var(--danger);cursor:pointer;font-size:.8rem;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `).join('') || '<p style="font-size:.8rem;color:var(--gray);">Aucune sous-page.</p>';

            // Bind delete
            subList.querySelectorAll('.sp-del').forEach(btn => {
                btn.addEventListener('click', () => {
                    subPages.splice(+btn.dataset.idx, 1);
                    renderSubList();
                    updatePreview();
                });
            });
            // Live update preview on input change
            subList.querySelectorAll('.sp-title,.sp-desc').forEach(inp => {
                inp.addEventListener('input', () => {
                    subList.querySelectorAll('[data-idx]').forEach(row => {
                        const idx  = +row.dataset.idx;
                        const t    = row.querySelector('.sp-title')?.value || '';
                        const d    = row.querySelector('.sp-desc')?.value  || '';
                        if (subPages[idx]) { subPages[idx].title = t; subPages[idx].description = d; }
                    });
                    updatePreview();
                });
            });
        };
        renderSubList();

        // ── Live preview updater ───────────────────────────────────────
        const updatePreview = () => {
            const name = overlay.querySelector('#svcName')?.value || '';
            const desc = overlay.querySelector('#svcDesc')?.value || '';
            const titleEl    = overlay.querySelector('#previewTitle');
            const descEl     = overlay.querySelector('#previewDesc');
            const tagsEl     = overlay.querySelector('#previewTags');
            const subNavEl   = overlay.querySelector('#previewSubNav');
            if (titleEl)  titleEl.textContent  = name || 'Nom du service';
            if (descEl)   descEl.textContent   = desc || 'Description du service…';
            if (tagsEl)   tagsEl.innerHTML     = subPages.map(sp =>
                `<span style="background:var(--gold);color:var(--navy);font-size:.6rem;
                 font-weight:800;padding:3px 8px;border-radius:3px;text-transform:uppercase;">
                 ${sp.title}</span>`
            ).join('');
            if (subNavEl) subNavEl.innerHTML   = subPages.map((sp, i) =>
                `<button style="padding:6px 14px;border-radius:4px;font-size:.75rem;font-weight:700;
                  border:none;background:${i===0?'var(--navy)':'var(--gray-light)'};
                  color:${i===0?'var(--white)':'var(--gray-dark)'};">${sp.title}</button>`
            ).join('');
        };

        overlay.querySelector('#svcName')?.addEventListener('input', updatePreview);
        overlay.querySelector('#svcDesc')?.addEventListener('input', updatePreview);

        // ── Add sub-page ──────────────────────────────────────────────
        overlay.querySelector('#addSubPageBtn').addEventListener('click', () => {
            subPages.push({ title: '', description: '' });
            renderSubList();
        });

        // ── Image file preview ────────────────────────────────────────
        overlay.querySelector('#svcImageFile').addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            overlay.querySelector('#svcImageName').textContent = file.name;
            const reader = new FileReader();
            reader.onload = ev => {
                overlay.querySelector('#svcImgPreview').innerHTML =
                    `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
                overlay.querySelector('#previewImg').innerHTML =
                    `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
            };
            reader.readAsDataURL(file);
        });

        // ── Back button ───────────────────────────────────────────────
        overlay.querySelector('#svcBackBtn').addEventListener('click', () => {
            overlay.remove();
        });

        // ── Save ──────────────────────────────────────────────────────
        overlay.querySelector('#svcSaveBtn').addEventListener('click', async () => {
            console.log('--- Save button clicked ---');
            // Collect sub-pages from DOM before saving
            subList.querySelectorAll('[data-idx]').forEach(row => {
                const idx = +row.dataset.idx;
                if (subPages[idx]) {
                    subPages[idx].title       = row.querySelector('.sp-title')?.value.trim() || '';
                    subPages[idx].description = row.querySelector('.sp-desc')?.value.trim()  || '';
                }
            });
            console.log('subPages before filter:', subPages);
            const validSubPages = subPages.filter(sp => sp.title);
            console.log('validSubPages:', validSubPages);

            const name     = overlay.querySelector('#svcName').value.trim();
            const category = overlay.querySelector('#svcCategory').value.trim();
            const desc     = overlay.querySelector('#svcDesc').value.trim();
            const icon     = overlay.querySelector('#svcIcon').value.trim() || 'fa-cogs';
            const imgFile  = overlay.querySelector('#svcImageFile').files[0];

            if (!name || !category || !desc) {
                this.showNotification('Nom, catégorie et description sont obligatoires.', 'error');
                return;
            }

            const saveBtn = overlay.querySelector('#svcSaveBtn');
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement…';
            saveBtn.disabled  = true;

            try {
                const token = sessionStore.getItem('akime_token');
                const fd    = new FormData();
                fd.append('name',        name);
                fd.append('title',       name);
                fd.append('category',    category);
                fd.append('description', desc);
                fd.append('icon',        icon);
                fd.append('subPages',    JSON.stringify(validSubPages));
                if (imgFile) fd.append('image', imgFile);

                console.log('FormData entries:');
                for (let [key, value] of fd.entries()) {
                    console.log(`- ${key}:`, value);
                }

                const url    = serviceId ? `${this.apiBase}/content/services/${serviceId}` : `${this.apiBase}/content/services`;
                const method = serviceId ? 'PUT' : 'POST';
                console.log('Request URL:', url, 'Method:', method);

                const res = await fetch(url, {
                    method,
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: fd,
                });
                const result = await res.json();
                console.log('Server response:', result);
                
                if (!result.success) throw new Error(result.message || 'Erreur serveur');

                this.showNotification(serviceId ? '✅ Service modifié !' : '✅ Service ajouté !', 'success');
                overlay.remove();
                await this.loadServicesSection();
                this.refreshPreview();

            } catch (err) {
                this.showNotification('❌ ' + err.message, 'error');
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Enregistrer';
                saveBtn.disabled  = false;
            }
        });
    }

    // Keep addService / editService as aliases for backward compat
    addService()        { this.showServiceForm(); }
    async editService(id) { this.showServiceForm(id); }

    async deleteService(id) {
        if (!confirm("Voulez-vous vraiment supprimer ce service ?")) return;

        try {
            const res = await fetch(`${this.apiBase}/content/services/${id}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${sessionStore.getItem("akime_token")}`,
                    "Content-Type": "application/json"
                }
            });

            const result = await res.json().catch(() => ({}));

            if (!res.ok || result.success !== true) {
                throw new Error(result.message || `Erreur ${res.status}`);
            }

            // Both success and already-gone cases — refresh the UI
            const msg = result.alreadyGone
                ? "ℹ️ Service déjà supprimé. Liste mise à jour."
                : "✅ Service supprimé avec succès.";
            this.showNotification(msg, "success");
            await this.loadServicesSection();
            this.refreshPreview?.();

        } catch (err) {
            console.error("Erreur deleteService:", err);
            this.showNotification("❌ " + err.message, "error");
        }
    }
    // Equipment CRUD operations
    addEquipment() {
        const modal = this.createModal('Ajouter un équipement', this.getEquipmentForm());
        document.body.appendChild(modal);

        setTimeout(() => {
            const saveBtn = modal.querySelector('#saveEquipmentBtn');
            const closeBtn = modal.querySelector('.modal-close');
            const overlay = modal.querySelector('.modal-overlay');

            if (saveBtn) {
                saveBtn.addEventListener('click', () => this.saveEquipment(modal));
            }
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeModal(modal));
            }
            if (overlay) {
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) {
                        this.closeModal(modal);
                    }
                });
            }
        }, 10);
    }

    async editEquipment(id) {
        try {
            const equipment = await this.apiCall('/api/content/equipment');
            const item = equipment.find(e => e._id === id);
            if (!item) {
                this.showNotification('Équipement non trouvé', 'error');
                return;
            }

            const modal = this.createModal('Modifier l\'équipement', this.getEquipmentForm(item));
            document.body.appendChild(modal);

            setTimeout(() => {
                const saveBtn = modal.querySelector('#saveEquipmentBtn');
                const closeBtn = modal.querySelector('.modal-close');
                const overlay = modal.querySelector('.modal-overlay');

                if (saveBtn) {
                    saveBtn.addEventListener('click', () => this.saveEquipment(modal, id));
                }
                if (closeBtn) {
                    closeBtn.addEventListener('click', () => this.closeModal(modal));
                }
                if (overlay) {
                    overlay.addEventListener('click', (e) => {
                        if (e.target === overlay) {
                            this.closeModal(modal);
                        }
                    });
                }
            }, 10);
        } catch (error) {
            console.error('Error loading equipment:', error);
            this.showNotification('Erreur lors du chargement de l\'équipement', 'error');
        }
    }

    async deleteEquipment(id) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cet équipement ?')) {
            return;
        }

        try {
            await this.apiCall(`/api/content/equipment/${id}`, {
                method: 'DELETE'
            });

            this.showNotification('Équipement supprimé avec succès', 'success');
            this.loadSectionData('equipment');
        } catch (error) {
            console.error('Error deleting equipment:', error);
            this.showNotification('Erreur lors de la suppression', 'error');
        }
    }


  addProject()          { this.showProjectForm(); }
  async editProject(id) { this.showProjectForm(id); }

  // ═══════════════════════════════════════════════════════════
  // showProjectForm — full-page overlay, create or edit
  // ═══════════════════════════════════════════════════════════
  async showProjectForm(projectId = null) {
    let project = {};
    if (projectId) {
      try {
        const res = await this.apiCall(`/api/content/projects/${projectId}`);
        project = res || {};
      } catch {
        const all = await this.apiCall('/api/content/projects').catch(() => []);
        project = (all || []).find(p => p._id === projectId) || {};
      }
    }

    const cats = [
      { value:'gros-oeuvre', label:'Gros Œuvre'             },
      { value:'civil',       label:'Génie Civil'             },
      { value:'metallique',  label:'Construction Métallique' },
      { value:'renovation',  label:'Rénovation'              },
      { value:'finition',    label:'Finition'                },
      { value:'nettoyage',   label:'Nettoyage'               },
      { value:'pure-water',  label:'Pure Water'              },
      { value:'divers',      label:'Divers'                  },
    ];
    const statuses = [
      { value:'completed', label:'Terminé'  },
      { value:'ongoing',   label:'En cours' },
      { value:'planned',   label:'Planifié' },
    ];

    const overlay = document.createElement('div');
    overlay.id = 'projectFormOverlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:var(--off-white,#f7f8fc);
      z-index:600;overflow-y:auto;
    `;

    overlay.innerHTML = `
      <div style="position:sticky;top:0;z-index:10;background:var(--white);
                  border-bottom:1px solid var(--gray-light);padding:14px 28px;
                  display:flex;align-items:center;gap:14px;
                  box-shadow:0 2px 8px rgba(0,0,0,.07);">
        <button id="projBackBtn" style="display:inline-flex;align-items:center;gap:7px;
                padding:8px 16px;border-radius:6px;background:var(--off-white,#f7f8fc);
                border:1.5px solid var(--gray-light);color:var(--navy);font-size:.8rem;
                font-weight:700;cursor:pointer;font-family:inherit;">
          <i class="fas fa-arrow-left"></i> Retour aux projets
        </button>
        <span style="font-size:1rem;font-weight:800;color:var(--navy);">
          ${projectId ? 'Modifier le projet' : 'Nouveau projet'}
        </span>
        <button id="projSaveBtn" style="margin-left:auto;display:inline-flex;align-items:center;
                gap:8px;padding:10px 26px;border-radius:6px;background:var(--gold);
                color:var(--navy);font-size:.8rem;font-weight:800;cursor:pointer;
                border:none;font-family:inherit;">
          <i class="fas fa-save"></i> Enregistrer
        </button>
      </div>

      <div style="max-width:860px;margin:0 auto;padding:28px 20px;
                  display:grid;grid-template-columns:1fr 1fr;gap:22px;">

        <div>
          <div class="panel-card">
            <div class="panel-card-title"><i class="fas fa-info-circle"></i> Informations</div>
            <div class="form-group">
              <label>TITRE <span style="color:var(--gold)">*</span></label>
              <input id="projTitle" type="text" value="${project.title||''}"
                     placeholder="ex: Immeuble R+3 Bastos">
            </div>
            <div class="form-group">
              <label>CATÉGORIE <span style="color:var(--gold)">*</span></label>
              <select id="projCategory">
                <option value="">Sélectionner…</option>
                ${cats.map(c=>`
                  <option value="${c.value}" ${(project.category||'')==c.value?'selected':''}>
                    ${c.label}
                  </option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>DESCRIPTION <span style="color:var(--gold)">*</span></label>
              <textarea id="projDesc" rows="4"
                        placeholder="Décrivez le projet…">${project.description||''}</textarea>
            </div>
            <div class="form-group">
              <label>LOCALISATION</label>
              <input id="projLocation" type="text" value="${project.location||''}"
                     placeholder="ex: Douala, Cameroun">
            </div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:20px;">
          <div class="panel-card">
            <div class="panel-card-title"><i class="fas fa-image"></i> Image principale</div>
            <div id="projImgPreview" style="width:100%;height:150px;border-radius:8px;
                 overflow:hidden;background:var(--off-white,#f7f8fc);
                 border:2px dashed var(--gray-light);margin-bottom:12px;
                 display:flex;align-items:center;justify-content:center;
                 color:var(--gray);font-size:.82rem;">
              ${project.imageUrl
                ? `<img src="${project.imageUrl}" style="width:100%;height:100%;object-fit:cover;"
                        >`
                : `<div style="text-align:center;"><i class="fas fa-image" style="font-size:2rem;display:block;margin-bottom:6px;"></i>Aucune image</div>`
              }
            </div>
            <label style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;
                   background:var(--navy);color:var(--white);border-radius:6px;
                   font-size:.75rem;font-weight:700;cursor:pointer;">
              <i class="fas fa-upload"></i> CHOISIR UNE IMAGE
              <input type="file" id="projImageFile" accept="image/*" style="display:none;">
            </label>
            <span id="projImageName" style="font-size:.73rem;color:var(--gray);margin-left:8px;"></span>
          </div>

          <div class="panel-card">
            <div class="panel-card-title"><i class="fas fa-images"></i> Galerie photos</div>
            <p style="margin:0 0 12px;color:var(--gray);font-size:.78rem;line-height:1.45;">
              Ajoutez jusqu'à 10 photos supplémentaires. Elles seront visibles dans la galerie du projet sur le site.
            </p>
            <div id="projGalleryExisting" style="display:none;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px;margin-bottom:12px;"></div>
            <div id="projGalleryPreview" style="display:none;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px;margin-bottom:12px;"></div>
            <label style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;
                   background:var(--navy);color:var(--white);border-radius:6px;
                   font-size:.75rem;font-weight:700;cursor:pointer;">
              <i class="fas fa-images"></i> AJOUTER DES PHOTOS
              <input type="file" id="projGalleryFiles" accept="image/*" multiple style="display:none;">
            </label>
            <span id="projGalleryCount" style="font-size:.73rem;color:var(--gray);margin-left:8px;"></span>
          </div>

          <div class="panel-card">
            <div class="panel-card-title"><i class="fas fa-calendar"></i> Détails</div>
            <div class="form-group">
              <label>CLIENT</label>
              <input id="projClient" type="text" value="${project.client||''}"
                     placeholder="ex: Privé, Mairie de Douala">
            </div>
            <div class="form-group">
              <label>STATUT</label>
              <select id="projStatus">
                ${statuses.map(s=>`
                  <option value="${s.value}" ${(project.status||'completed')==s.value?'selected':''}>
                    ${s.label}
                  </option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>ANNÉE</label>
              <input id="projYear" type="number" value="${project.year||new Date().getFullYear()}"
                     min="1990" max="2099">
            </div>
            <div class="form-group">
              <label>SUPERFICIE (m²)</label>
              <input id="projArea" type="text" value="${project.area||''}"
                     placeholder="ex: 450 m²">
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Image preview
    overlay.querySelector('#projImageFile').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      overlay.querySelector('#projImageName').textContent = file.name;
      const reader = new FileReader();
      reader.onload = ev => {
        overlay.querySelector('#projImgPreview').innerHTML =
          `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
      };
      reader.readAsDataURL(file);
    });

    // Gallery images are kept separately so the admin can add images in several selections.
    // The API accepts up to 10 new gallery files per save operation.
    const galleryFiles = [];
    const existingGallery = Array.isArray(project.gallery) ? [...project.gallery] : [];
    const existingGalleryPreview = overlay.querySelector('#projGalleryExisting');
    const galleryPreview = overlay.querySelector('#projGalleryPreview');
    const galleryCount = overlay.querySelector('#projGalleryCount');

    const renderExistingGallery = () => {
      if (!existingGallery.length) {
        existingGalleryPreview.style.display = 'none';
        existingGalleryPreview.innerHTML = '';
        return;
      }

      existingGalleryPreview.style.display = 'grid';
      existingGalleryPreview.innerHTML = existingGallery.map((url, index) => `
        <div style="position:relative;aspect-ratio:1;">
          <img src="${url}" alt="Photo de galerie" style="width:100%;height:100%;object-fit:cover;border-radius:5px;border:1px solid var(--gray-light);">
          <button type="button" class="remove-existing-gallery-file" data-index="${index}" title="Supprimer cette photo"
                  style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;padding:0;border:0;border-radius:50%;background:#c0392b;color:#fff;cursor:pointer;font-size:12px;line-height:20px;">×</button>
        </div>
      `).join('');
    };

    const renderGalleryFiles = () => {
      if (!galleryFiles.length) {
        galleryPreview.style.display = 'none';
      } else {
        galleryPreview.style.display = 'grid';
        galleryPreview.innerHTML = galleryFiles.map(({ file, previewUrl }, index) => `
          <div style="position:relative;aspect-ratio:1;">
            <img src="${previewUrl}" alt="${file.name}" style="width:100%;height:100%;object-fit:cover;border-radius:5px;border:1px solid var(--gray-light);">
            <button type="button" class="remove-gallery-file" data-index="${index}" title="Retirer cette photo"
                    style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;padding:0;border:0;border-radius:50%;background:#c0392b;color:#fff;cursor:pointer;font-size:12px;line-height:20px;">×</button>
          </div>
        `).join('');
      }

      const total = existingGallery.length + galleryFiles.length;
      galleryCount.textContent = total
        ? `${total} photo(s) dans la galerie${galleryFiles.length ? ` (${galleryFiles.length} nouvelle(s))` : ''}`
        : '';
    };

    renderExistingGallery();
    renderGalleryFiles();

    existingGalleryPreview.addEventListener('click', e => {
      const button = e.target.closest('.remove-existing-gallery-file');
      if (!button) return;
      existingGallery.splice(Number(button.dataset.index), 1);
      renderExistingGallery();
      renderGalleryFiles();
    });

    overlay.querySelector('#projGalleryFiles').addEventListener('change', e => {
      const selected = Array.from(e.target.files || []);
      const available = 10 - galleryFiles.length;
      if (selected.length > available) {
        this.showNotification(`Vous pouvez ajouter au maximum 10 nouvelles photos à la fois.`, 'error');
      }

      selected.slice(0, Math.max(0, available)).forEach(file => {
        galleryFiles.push({ file, previewUrl: URL.createObjectURL(file) });
      });
      e.target.value = '';
      renderGalleryFiles();
    });

    galleryPreview.addEventListener('click', e => {
      const button = e.target.closest('.remove-gallery-file');
      if (!button) return;
      const index = Number(button.dataset.index);
      const [removed] = galleryFiles.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      renderGalleryFiles();
    });

    const releaseGalleryPreviews = () => {
      galleryFiles.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
    };

    // Back
    overlay.querySelector('#projBackBtn').addEventListener('click', () => {
      releaseGalleryPreviews();
      overlay.remove();
    });

    // Save
    overlay.querySelector('#projSaveBtn').addEventListener('click', async () => {
      const title    = overlay.querySelector('#projTitle').value.trim();
      const category = overlay.querySelector('#projCategory').value;
      const desc     = overlay.querySelector('#projDesc').value.trim();
      const location = overlay.querySelector('#projLocation').value.trim();
      const client   = overlay.querySelector('#projClient').value.trim();
      const status   = overlay.querySelector('#projStatus').value;
      const year     = overlay.querySelector('#projYear').value;
      const area     = overlay.querySelector('#projArea').value.trim();
      const imgFile  = overlay.querySelector('#projImageFile').files[0];

      if (!title || !category || !desc) {
        this.showNotification('Titre, catégorie et description sont obligatoires.', 'error');
        return;
      }

      const saveBtn = overlay.querySelector('#projSaveBtn');
      saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement…';
      saveBtn.disabled  = true;

      try {
        const token = sessionStore.getItem('akime_token');
        const fd    = new FormData();
        fd.append('title',       title);
        fd.append('category',    category);
        fd.append('description', desc);
        if (location) fd.append('location',    location);
        if (client)   fd.append('client',      client);
        if (status)   fd.append('status',      status);
        if (year)     fd.append('year',        year);
        if (area)     fd.append('area',        area);
        if (imgFile)  fd.append('image',       imgFile);
        // Sending the retained URLs lets the API remove photos deleted in this editor.
        fd.append('gallery', JSON.stringify(existingGallery));
        galleryFiles.forEach(({ file }) => fd.append('gallery', file));

        const url    = projectId
          ? `${this.apiBase}/content/projects/${projectId}`
          : `${this.apiBase}/content/projects`;
        const method = projectId ? 'PUT' : 'POST';

        const res    = await fetch(url, {
          method,
          headers: { 'Authorization': `Bearer ${token}` },
          body: fd,
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.message || 'Erreur serveur');

        this.showNotification(
          projectId ? '✅ Projet modifié !' : '✅ Projet ajouté !',
          'success'
        );
        releaseGalleryPreviews();
        overlay.remove();
        await this.loadProjectsSection();
        this.refreshPreview?.();

      } catch (err) {
        this.showNotification('❌ ' + err.message, 'error');
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Enregistrer';
        saveBtn.disabled  = false;
      }
    });
  }

  async deleteProject(id) {
    if (!confirm('Supprimer ce projet définitivement ?')) return;
    try {
      const res    = await fetch(`${this.apiBase}/content/projects/${id}`, {
        method:  'DELETE',
        headers: { 'Authorization': `Bearer ${sessionStore.getItem('akime_token')}` }
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.success !== true)
        throw new Error(result.message || `Erreur ${res.status}`);
      this.showNotification(
        result.alreadyGone ? 'ℹ️ Projet déjà supprimé.' : '✅ Projet supprimé.',
        'success'
      );
      await this.loadProjectsSection();
      this.refreshPreview?.();
    } catch (err) {
      console.error('deleteProject error:', err);
      this.showNotification('❌ ' + err.message, 'error');
    }
  }



// ✅ Show full message AND mark as read
async showFullMessage(messageId) {
    try {
        const token = sessionStore.getItem("akime_token");
        if (!token) {
            this.showNotification("Non autorisé. Veuillez vous reconnecter.", "error");
            return;
        }

        const res = await fetch(`${this.apiBase}/contact/${messageId}`, {
            headers: { "Authorization": "Bearer " + token }
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();

        if (result.success) {
            const msg = result.data;

            // Open modal with full details
            this.showModal("📩 Message complet", `
                <p><strong>Nom:</strong> ${msg.name}</p>
                <p><strong>Email:</strong> ${msg.email}</p>
                <p><strong>Téléphone:</strong> ${msg.phone || '-'}</p>
                <p><strong>Entreprise:</strong> ${msg.company || '-'}</p>
                <p><strong>Sujet:</strong> ${msg.subject || '(Sans sujet)'}</p>
                <p><strong>Service:</strong> ${msg.serviceType || '-'}</p>
                <hr>
                <p><strong>Message:</strong><br>${msg.content || msg.message}</p>
            `);

            // ✅ Auto-mark as read
            await this.markAsRead(messageId);

        } else {
            this.showNotification("Impossible de charger le message", "error");
        }
    } catch (err) {
        console.error("Erreur showFullMessage:", err);
        this.showNotification("Erreur lors du chargement du message", "error");
    }
}

// Replace the alert placeholder for deleting a message
// ✅ Delete message
async deleteMessage(messageId) {
    if (!confirm("Voulez-vous vraiment supprimer ce message ?")) return;

    try {
        const token = sessionStore.getItem("akime_token");
        if (!token) {
            this.showNotification("Non autorisé. Veuillez vous reconnecter.", "error");
            return;
        }

        const res = await fetch(`${this.apiBase}/contact/${messageId}`, {
            method: "DELETE",
            headers: {
                "Authorization": "Bearer " + token
            }
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();

        if (result.success) {
            this.showNotification("Message supprimé 🗑", "success");
            this.loadMessagesSection(); // refresh after deletion
            updateUnreadBadge();   // refresh unread badge
        } else {
            throw new Error(result.message || "Erreur lors de la suppression");
        }
    } catch (err) {
        console.error("Erreur deleteMessage:", err);
        this.showNotification("Impossible de supprimer le message", "error");
    }
}



    // Modal management methods
    showCompanyEditModal(company) {
        const modal = this.createModal('Modifier les informations de l\'entreprise', this.getCompanyEditForm(company));
        document.body.appendChild(modal);

        // Add event listeners with timeout to ensure DOM is ready
        setTimeout(() => {
            const saveBtn = modal.querySelector('#saveCompanyBtn');
            const closeBtn = modal.querySelector('.modal-close');
            const overlay = modal.querySelector('.modal-overlay');

            if (saveBtn) {
                saveBtn.addEventListener('click', () => this.saveCompany(modal));
            }
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeModal(modal));
            }
            if (overlay) {
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) {
                        this.closeModal(modal);
                    }
                });
            }
        }, 10);
    }

    createModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.3s ease;
    `;

    modal.innerHTML = `
        <div class="modal-content" style="
            background: white;
            border-radius: 12px;
            width: 90%;
            max-width: 600px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            animation: slideUp 0.3s ease;
        ">
            <div class="modal-header" style="
                padding: 20px 30px;
                border-bottom: 1px solid #e9ecef;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <h3 style="margin: 0; color: #333;">${title}</h3>
                <button class="modal-close" style="
                    background: none;
                    border: none;
                    font-size: 24px;
                    color: #666;
                    cursor: pointer;
                    padding: 5px;
                    border-radius: 4px;
                ">&times;</button>
            </div>
            <div class="modal-body" style="padding: 30px;">
                ${content}
            </div>
        </div>
    `;

    // MAKE SURE TO ADD THE MODAL TO THE DOM
    document.body.appendChild(modal);
    
    return modal;
}
    

    getTestimonialForm(testimonial = {}) {
    return `
        <form id="testimonialEditForm" style="max-width: 600px; margin: 0 auto;">
            <div class="form-group" style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #333;">Nom *</label>
                <input type="text" id="testimonialName" value="${testimonial.name || ''}" required 
                       style="width: 100%; padding: 12px 15px; border: 2px solid #e1e5e9; border-radius: 8px; 
                              font-size: 16px; transition: border-color 0.3s ease;">
            </div>

            <div class="form-group" style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #333;">Entreprise</label>
                <input type="text" id="testimonialCompany" value="${testimonial.company || ''}"
                       style="width: 100%; padding: 12px 15px; border: 2px solid #e1e5e9; border-radius: 8px; 
                              font-size: 16px; transition: border-color 0.3s ease;">
            </div>

            <div class="form-group" style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #333;">Message *</label>
                <textarea id="testimonialMessage" rows="4" required 
                          style="width: 100%; padding: 12px 15px; border: 2px solid #e1e5e9; border-radius: 8px; 
                                 font-size: 16px; transition: border-color 0.3s ease; resize: vertical; min-height: 120px;">${testimonial.message || ''}</textarea>
            </div>

            <div class="form-group" style="margin-bottom: 25px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #333;">Note (1-5)</label>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="number" id="testimonialRating" value="${testimonial.rating || 5}" min="1" max="5"
                           style="width: 80px; padding: 12px 15px; border: 2px solid #e1e5e9; border-radius: 8px; 
                                  font-size: 16px; transition: border-color 0.3s ease;">
                    <div style="font-size: 18px; color: #ffb400; margin-left: 10px;">
                        ${'⭐'.repeat(testimonial.rating || 5)}
                    </div>
                </div>
                <div style="font-size: 12px; color: #666; margin-top: 5px;">
                    1 = Très mauvais, 5 = Excellent
                </div>
            </div>

            <div class="form-actions" style="display: flex; gap: 15px; justify-content: flex-end; padding-top: 20px; border-top: 1px solid #e9ecef;">
                <button type="button" class="modal-close" 
                        style="padding: 12px 24px; border: 2px solid #e1e5e9; background: white; color: #666; 
                               border-radius: 8px; cursor: pointer; font-weight: 500; transition: all 0.3s ease;">
                    Annuler
                </button>
                <button type="button" id="saveTestimonialBtn"
                        style="padding: 12px 24px; border: none; background: linear-gradient(135deg, #0056b3, #004a99); 
                               color: white; border-radius: 8px; cursor: pointer; font-weight: 500; transition: all 0.3s ease;">
                    <i class="fas fa-save" style="margin-right: 8px;"></i>
                    ${testimonial._id ? 'Modifier' : 'Enregistrer'}
                </button>
            </div>

            <style>
                .form-group input:focus,
                .form-group textarea:focus {
                    border-color: #0056b3 !important;
                    box-shadow: 0 0 0 3px rgba(0,86,179,0.1) !important;
                    outline: none;
                }
                
                .form-group input:invalid,
                .form-group textarea:invalid {
                    border-color: #dc3545;
                }
                
                .form-group input:valid,
                .form-group textarea:valid {
                    border-color: #28a745;
                }
            </style>
        </form>
    `;
}

async saveTestimonial(modal, testimonialId = null) {
    const formData = {
        name: modal.querySelector('#testimonialName').value,
        company: modal.querySelector('#testimonialCompany').value,
        message: modal.querySelector('#testimonialMessage').value,
        rating: parseInt(modal.querySelector('#testimonialRating').value) || 5
    };

    try {
        const saveBtn = modal.querySelector('#saveTestimonialBtn');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        saveBtn.disabled = true;

        let result;
        if (testimonialId) {
            // Update existing testimonial
            result = await this.apiCall(`/api/testimonials/${testimonialId}`, {
                method: 'PUT',
                body: JSON.stringify(formData)
            });
        } else {
            // Create new testimonial
            result = await this.apiCall('/api/testimonials', {
                method: 'POST',
                body: JSON.stringify(formData)
            });
        }

        this.closeModal(modal);
        this.loadSectionData('testimonials');
        this.showNotification(
            testimonialId ? 'Témoignage modifié avec succès!' : 'Témoignage ajouté avec succès!', 
            'success'
        );

    } catch (error) {
        console.error('Error saving testimonial:', error);
        this.showNotification('Erreur lors de la sauvegarde', 'error');
        
        // Reset button
        const saveBtn = modal.querySelector('#saveTestimonialBtn');
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}





    getCompanyEditForm(company) {
        return `
            <form id="companyEditForm">
                <div class="form-group" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">Nom de l'entreprise</label>
                    <input type="text" id="companyName" value="${company.name || 'A-KIME Sarl'}" style="
                        width: 100%;
                        padding: 12px 15px;
                        border: 2px solid #e1e5e9;
                        border-radius: 8px;
                        font-size: 16px;
                        transition: border-color 0.3s ease;
                    ">
                </div>

                <div class="form-group" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">Email</label>
                    <input type="email" id="companyEmail" value="${company.email || 'infosakime@gmail.com'}" style="
                        width: 100%;
                        padding: 12px 15px;
                        border: 2px solid #e1e5e9;
                        border-radius: 8px;
                        font-size: 16px;
                        transition: border-color 0.3s ease;
                    ">
                </div>

                <div class="form-group" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">Téléphone</label>
                    <input type="tel" id="companyPhone" value="${company.phone || '+237 698 01 20 93'}" style="
                        width: 100%;
                        padding: 12px 15px;
                        border: 2px solid #e1e5e9;
                        border-radius: 8px;
                        font-size: 16px;
                        transition: border-color 0.3s ease;
                    ">
                </div>

                <div class="form-group" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">Adresse</label>
                    <input type="text" id="companyAddress" value="${company.address || 'Yaoundé, Pont Emana, Cameroun'}" style="
                        width: 100%;
                        padding: 12px 15px;
                        border: 2px solid #e1e5e9;
                        border-radius: 8px;
                        font-size: 16px;
                        transition: border-color 0.3s ease;
                    ">
                </div>

                <div class="form-group" style="margin-bottom: 30px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">Description</label>
                    <textarea id="companyDescription" rows="4" style="
                        width: 100%;
                        padding: 12px 15px;
                        border: 2px solid #e1e5e9;
                        border-radius: 8px;
                        font-size: 16px;
                        transition: border-color 0.3s ease;
                        resize: vertical;
                    ">${company.description || 'Entreprise de génie civil et construction métallique'}</textarea>
                </div>

                <div class="form-actions" style="display: flex; gap: 15px; justify-content: flex-end;">
                    <button type="button" class="modal-close" style="
                        padding: 12px 24px;
                        border: 2px solid #e1e5e9;
                        background: white;
                        color: #666;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 500;
                        transition: all 0.3s ease;
                    ">Annuler</button>
                    <button type="button" id="saveCompanyBtn" style="
                        padding: 12px 24px;
                        border: none;
                        background: linear-gradient(135deg, #0056b3, #004a99);
                        color: white;
                        border-radius: 8px;
                        cursor: pointer;
                        font-weight: 500;
                        transition: all 0.3s ease;
                    ">
                        <i class="fas fa-save"></i> Enregistrer
                    </button>
                </div>
            </form>
        `;
    }

    async saveCompany(modal) {
        const formData = {
            name: modal.querySelector('#companyName').value,
            email: modal.querySelector('#companyEmail').value,
            phone: modal.querySelector('#companyPhone').value,
            address: modal.querySelector('#companyAddress').value,
            description: modal.querySelector('#companyDescription').value
        };

        try {
            // Show loading state
            const saveBtn = modal.querySelector('#saveCompanyBtn');
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
            saveBtn.disabled = true;

            await this.apiCall('/api/content/company', {
                method: 'PUT',
                body: JSON.stringify(formData)
            });

            // Close modal and refresh section
            this.closeModal(modal);
            this.loadSectionData('company');

            // Show success message
            this.showNotification('Informations de l\'entreprise mises à jour avec succès!', 'success');

        } catch (error) {
            console.error('Error saving company data:', error);
            this.showNotification('Erreur lors de la sauvegarde', 'error');

            // Reset button
            const saveBtn = modal.querySelector('#saveCompanyBtn');
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    }

    getEquipmentForm(equipment = {}) {
    return `
        <form id="equipmentEditForm" enctype="multipart/form-data">
            <div class="form-group" style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">Nom de l'équipement</label>
                <input type="text" id="equipmentName" value="${equipment.name || ''}" required style="
                    width: 100%;
                    padding: 12px 15px;
                    border: 2px solid #e1e5e9;
                    border-radius: 8px;
                    font-size: 16px;
                    transition: border-color 0.3s ease;
                ">
            </div>

            <div class="form-group" style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">Catégorie</label>
                <select id="equipmentCategory" required style="
                    width: 100%;
                    padding: 12px 15px;
                    border: 2px solid #e1e5e9;
                    border-radius: 8px;
                    font-size: 16px;
                    transition: border-color 0.3s ease;
                ">
                    <option value="">Sélectionner une catégorie</option>
                    <option value="excavation" ${equipment.category === 'excavation' ? 'selected' : ''}>Excavation</option>
                    <option value="levage" ${equipment.category === 'levage' ? 'selected' : ''}>Levage</option>
                    <option value="transport" ${equipment.category === 'transport' ? 'selected' : ''}>Transport</option>
                    <option value="compactage" ${equipment.category === 'compactage' ? 'selected' : ''}>Compactage</option>
                    <option value="outillage" ${equipment.category === 'outillage' ? 'selected' : ''}>Outillage</option>
                    <option value="divers" ${equipment.category === 'divers' ? 'selected' : ''}>Divers</option>
                </select>
            </div>

            <div class="form-group" style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">Marque</label>
                <input type="text" id="equipmentBrand" value="${equipment.brand || ''}" style="
                    width: 100%;
                    padding: 12px 15px;
                    border: 2px solid #e1e5e9;
                    border-radius: 8px;
                    font-size: 16px;
                    transition: border-color 0.3s ease;
                ">
            </div>

            <div class="form-group" style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">Modèle</label>
                <input type="text" id="equipmentModel" value="${equipment.model || ''}" style="
                    width: 100%;
                    padding: 12px 15px;
                    border: 2px solid #e1e5e9;
                    border-radius: 8px;
                    font-size: 16px;
                    transition: border-color 0.3s ease;
                ">
            </div>

            <div class="form-group" style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">Année</label>
                <input type="number" id="equipmentYear" value="${equipment.year || ''}" min="1900" max="2030" style="
                    width: 100%;
                    padding: 12px 15px;
                    border: 2px solid #e1e5e9;
                    border-radius: 8px;
                    font-size: 16px;
                    transition: border-color 0.3s ease;
                ">
            </div>

            <div class="form-group" style="margin-bottom: 30px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">Description</label>
                <textarea id="equipmentDescription" rows="4" required style="
                    width: 100%;
                    padding: 12px 15px;
                    border: 2px solid #e1e5e9;
                    border-radius: 8px;
                    font-size: 16px;
                    transition: border-color 0.3s ease;
                    resize: vertical;
                ">${equipment.description || ''}</textarea>
            </div>

            <!-- ✅ New Image Upload -->
            <div class="form-group" style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #333;">Image</label>
                <input type="file" id="equipmentImage" accept="image/*" style="
                    width: 100%;
                    padding: 12px 15px;
                    border: 2px solid #e1e5e9;
                    border-radius: 8px;
                    font-size: 16px;
                ">
                ${equipment.imageUrl ? `<img src="${equipment.imageUrl}" alt="Preview" style="margin-top:10px; max-width:150px; border:1px solid #ccc; border-radius:5px;">` : ''}
            </div>

            <div class="form-actions" style="display: flex; gap: 15px; justify-content: flex-end;">
                <button type="button" class="modal-close" style="
                    padding: 12px 24px;
                    border: 2px solid #e1e5e9;
                    background: white;
                    color: #666;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: all 0.3s ease;
                ">Annuler</button>
                <button type="button" id="saveEquipmentBtn" style="
                    padding: 12px 24px;
                    border: none;
                    background: linear-gradient(135deg, #0056b3, #004a99);
                    color: white;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: all 0.3s ease;
                ">
                    <i class="fas fa-save"></i> Enregistrer
                </button>
            </div>
        </form>
    `;
}

    async saveEquipment(modal, equipmentId = null) {
    const formData = new FormData();
    formData.append('name', modal.querySelector('#equipmentName').value.trim());
    formData.append('category', modal.querySelector('#equipmentCategory').value.trim());
    formData.append('brand', modal.querySelector('#equipmentBrand').value.trim());
    formData.append('model', modal.querySelector('#equipmentModel').value.trim());
    formData.append('year', modal.querySelector('#equipmentYear').value.trim());
    formData.append('description', modal.querySelector('#equipmentDescription').value.trim());

    // ✅ Handle image upload
    const imageInput = modal.querySelector('#equipmentImage');
    if (imageInput && imageInput.files.length > 0) {
        formData.append('image', imageInput.files[0]); // backend will save this file
    }

    // Debug log to confirm what is sent
    console.group("📦 Equipment FormData being sent");
    for (let pair of formData.entries()) {
        console.log(pair[0], pair[1]);
    }
    console.groupEnd();

    const saveBtn = modal.querySelector('#saveEquipmentBtn');
    const originalText = saveBtn.innerHTML;

    try {
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        saveBtn.disabled = true;

        const url = equipmentId 
            ? `/api/content/equipment/${equipmentId}` 
            : '/api/content/equipment';

        const method = equipmentId ? 'PUT' : 'POST';
        const token = sessionStore.getItem("akime_token");

        if (!token) {
            throw new Error("Aucun token trouvé - connectez-vous d'abord");
        }

        // ✅ Don't set Content-Type manually, let fetch handle multipart/form-data
        const response = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${token}`
            },
            body: formData, // includes text + image
            credentials: "include"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || `Erreur serveur: ${response.status}`);
        }

        this.closeModal(modal);
        this.loadSectionData('equipment');

        const message = equipmentId 
            ? 'Équipement modifié avec succès!' 
            : 'Équipement ajouté avec succès!';
        this.showNotification(message, 'success');

    } catch (error) {
        console.error("❌ Error saving equipment:", error);
        this.showNotification(error.message || "Erreur lors de la sauvegarde", "error");
    } finally {
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

    closeModal(modal) {
        modal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10001;
            animation: slideInRight 0.3s ease;
            max-width: 400px;
        `;

        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#007bff'
        };

        notification.style.background = colors[type] || colors.info;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : 'info'}"></i>
            ${message}
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // Preview functionality
    initializePreview() {
        const previewBtn = document.getElementById('previewBtn');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => this.openPreview());
        }
    }

    openPreview() {
        // Open the main website in a new tab/window
        const previewWindow = window.open('/', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');

        if (previewWindow) {
            // Store reference for real-time updates
            this.previewWindow = previewWindow;

            // Show notification
            this.showNotification('Aperçu ouvert dans un nouvel onglet', 'success');

            // Add real-time update listener
            this.setupRealTimeUpdates();
        } else {
            this.showNotification('Impossible d\'ouvrir l\'aperçu. Vérifiez les paramètres de votre navigateur.', 'error');
        }
    }

    setupRealTimeUpdates() {
    // Sauvegarde des méthodes originales
    const originalSaveCompany    = this.saveCompany?.bind(this);
    const originalSaveService    = this.saveService?.bind(this);
    const originalDeleteService  = this.deleteService?.bind(this);
    const originalSaveEquipment  = this.saveEquipment?.bind(this);
    const originalSaveProject    = this.saveProject?.bind(this);
    const originalDeleteProject  = this.deleteProject?.bind(this);

    // Company
    if (originalSaveCompany) {
        this.saveCompany = async (modal) => {
            await originalSaveCompany(modal);
            this.refreshPreview();
        };
    }

    // Services
    if (originalSaveService) {
        this.saveService = async (modal, serviceId) => {
            await originalSaveService(modal, serviceId);
            this.refreshPreview();
        };
    }
    if (originalDeleteService) {
        this.deleteService = async (serviceId) => {
            await originalDeleteService(serviceId);
            this.refreshPreview();
        };
    }

    // Equipments
    if (originalSaveEquipment) {
        this.saveEquipment = async (modal, equipmentId) => {
            await originalSaveEquipment(modal, equipmentId);
            this.refreshPreview();
        };
    }

    // Projects
    if (originalSaveProject) {
        this.saveProject = async (modal, projectId) => {
            await originalSaveProject(modal, projectId);
            this.refreshPreview(); // 🔄 mise à jour portfolio.html
        };
    }
    if (originalDeleteProject) {
        this.deleteProject = async (projectId) => {
            await originalDeleteProject(projectId);
            this.refreshPreview(); // 🔄 mise à jour après suppression
        };
    }
}

refreshPreview() {
    if (this.previewWindow && !this.previewWindow.closed) {
        this.previewWindow.location.reload();
        this.showNotification('Aperçu mis à jour!', 'info');
    }
}
}

// --- Unread badge + message count updater ---
async function updateUnreadBadge() {
  try {
    const token = sessionStore.getItem('akime_token');
    const BASE_URL = window.adminDashboard ? window.adminDashboard.apiBase.replace('/api', '') : '';
    if (!token) {
      showOrHideUnreadBadge(0); // Hide badge if not authenticated
      showOrHideTestimonialBadge(0);
      setMessagesCount('-');
      return;
    }

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    const [messagesRes, testimonialsRes] = await Promise.all([
      fetch(`${BASE_URL}/api/contact`, {
        method: 'GET',
        headers,
        credentials: 'include'
      }),
      fetch(`${BASE_URL}/api/testimonials/admin/all`, {
        method: 'GET',
        headers,
        credentials: 'include'
      })
    ]);

    if (messagesRes.ok) {
      const json = await messagesRes.json();
      const list = (json && json.data) ? json.data : [];
      const unread = list.filter(m => m && m.read === false).length;
      const total = list.length;
      setMessagesCount(total);
      showOrHideUnreadBadge(unread);
    } else {
      setMessagesCount('-');
      showOrHideUnreadBadge(0);
    }

    if (testimonialsRes.ok) {
      const json = await testimonialsRes.json();
      const testimonials = (json && json.data) ? json.data : [];
      const pending = testimonials.filter(t => t && t.approved === false).length;
      showOrHideTestimonialBadge(pending);
    } else {
      showOrHideTestimonialBadge(0);
    }
  } catch (err) {
    console.error('updateUnreadBadge error:', err);
    showOrHideUnreadBadge(0); // hide on error
    showOrHideTestimonialBadge(0);
  }
}

// Helper: updates the “Messages” dashboard card if it exists
function setMessagesCount(value) {
  const el = document.getElementById('messagesCount');
  if (el) el.textContent = String(value);
}

function showOrHideTestimonialBadge(pending) {
  const badge = document.getElementById('testimonialBadge');
  if (!badge) return;
  if (pending > 0) {
    badge.textContent = pending;
    badge.style.display = 'inline-block';
  } else {
    badge.textContent = '';
    badge.style.display = 'none';
  }
}

function showOrHideUnreadBadge(unread) {
  const badge = document.getElementById('unreadBadge');
  if (!badge) return;

  if (unread > 0) {
    badge.textContent = unread;
    badge.style.display = 'inline-block';
  } else {
    badge.textContent = '';
    badge.style.display = 'none';
  }
}




document.addEventListener("DOMContentLoaded", () => {
  // Initialize dashboard
  window.adminDashboard = new AdminDashboard();

  // Preview window init
  setTimeout(() => {
    window.adminDashboard.initializePreview();
  }, 100);

  // Unread badge init + auto-refresh every 30s
  updateUnreadBadge();
  setInterval(updateUnreadBadge, 30000);
});
