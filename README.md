<<<<<<< HEAD
# A-KIME Sarl — Plateforme Web Officielle

> Version **6.2.0** — GitHub Initial Release

## Périmètre de cette version

Cette version (V6.2) inclut :
- ✅ **Page d'accueil** (`public/index.html`) — design Figma complet
- ✅ **Panel d'administration** (`public/admin/`) — redesign complet, design system unifié
- ✅ **Backend API** (Node.js / Express / MongoDB) — 28 endpoints
- ✅ **Auth JWT dual-token** — Access + Refresh + vérification rôle

Non inclus dans ce push (à venir) :
- `public/welcome.html` — espace client
- `public/login.html` — page de connexion publique
- `public/signup.html` — inscription

## Stack

| Couche | Technologie |
|--------|-------------|
| Runtime | Node.js ≥ 18 LTS |
| Framework | Express 4.x |
| Base de données | MongoDB + Mongoose |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Frontend | HTML5 / CSS3 / Vanilla JS |
| Font | Montserrat (Google Fonts) |

## Installation

```bash
# 1. Cloner le dépôt
git clone https://github.com/votre-org/akime-website.git
cd akime-website

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp .env.example .env
# Remplir MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET, EMAIL_*

# 4. Promouvoir les admins en base
npm run fix-admin-roles

# 5. (Optionnel) Peupler les données de démonstration
npm run seed

# 6. Démarrer
npm start
```

## Scripts disponibles

| Commande | Description |
|----------|-------------|
| `npm start` | Démarrage production |
| `npm run dev` | Mode développement (nodemon) |
| `npm run fix-admin-roles` | Promouvoir les emails ALLOWED_ADMIN_EMAILS en admin |
| `npm run seed` | Peupler la base avec des données de démo |
| `npm run backup` | Sauvegarder toutes les collections MongoDB |
| `npm run restore` | Restaurer depuis un dossier de backup |
| `npm run create-admin` | Créer un administrateur interactif |

## Accès admin

1. S'assurer que l'email est dans `ALLOWED_ADMIN_EMAILS` dans `.env`
2. Lancer `npm run fix-admin-roles`
3. Aller sur `/admin/login` ou `/admin`
4. Se connecter — le panel redirige automatiquement les non-admins

## Variables d'environnement

```env
MONGODB_URI=mongodb://127.0.0.1:27017/akime
JWT_SECRET=votre_secret_long
JWT_REFRESH_SECRET=votre_refresh_secret_long
ALLOWED_ADMIN_EMAILS=admin@akime.cm,infosakime@gmail.com
PORT=4000
NODE_ENV=development
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=votre@gmail.com
EMAIL_PASS=votre_app_password
COMPANY_EMAIL=infosakime@gmail.com
```
=======
# AKIME-SARL
>>>>>>> e39c538f993f8017d504a47751a2d6d18c4e26e8
