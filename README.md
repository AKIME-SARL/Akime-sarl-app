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
| `npm test` | Exécuter les tests unitaires Node.js |
| `npm run fix-admin-roles` | Promouvoir les emails ALLOWED_ADMIN_EMAILS en admin |
| `npm run seed` | Peupler la base avec des données de démo |
| `npm run backup` | Sauvegarder toutes les collections MongoDB |
| `npm run restore` | Restaurer depuis un dossier de backup |
| `npm run create-admin` | Créer un administrateur interactif |

## Intégration continue gratuite

GitHub Actions exécute les vérifications sur les pushes vers `main` et `develop`,
les pull requests, ainsi que sur lancement manuel. Le workflow installe les
dépendances verrouillées, vérifie la syntaxe de tous les fichiers JavaScript et
lance les tests unitaires sur Node.js 18, 20, 22 et 24 avec des runners
GitHub-hosted.

Ce dépôt est privé : les exécutions consomment les minutes incluses dans le
forfait GitHub du propriétaire du dépôt. Elles ne sont donc gratuites que dans
la limite de l'allocation mensuelle; l'usage au-delà peut être facturé si les
dépenses Actions sont autorisées. Vérifier **Settings → Billing and licensing →
Budgets and alerts** pour surveiller l'usage et configurer un budget.

Les tests automatisés ne nécessitent pas de base de données ni de secrets. Les
tests réels qui nécessitent MongoDB ou des identifiants ne sont donc pas lancés
dans ce workflow sans service de test dédié.

Le workflow `Secret scan` existant utilise également un runner GitHub-hosted et
compte dans la même allocation du forfait.

## Accès admin

1. S'assurer que l'email est dans `ALLOWED_ADMIN_EMAILS` dans `.env`
2. Lancer `npm run fix-admin-roles`
3. Aller sur `/admin/login` ou `/admin`
4. Se connecter — le panel redirige automatiquement les non-admins

## Gestion privée des projets

Les projets de livraison interne sont stockés dans la collection `deliveryprojects`, séparée de `projects` qui reste le portfolio public. La rubrique **Projets internes** du tableau de bord est réservée aux administrateurs. Son API exige également le rôle `admin` pour chaque requête :

| Méthode | Route | Action |
|---------|-------|--------|
| `GET` | `/api/delivery-projects` | Lister les projets internes |
| `GET` | `/api/delivery-projects/:id` | Consulter détails, notes et historique |
| `POST` | `/api/delivery-projects` | Créer un projet |
| `PUT` | `/api/delivery-projects/:id` | Modifier les champs, jalons, tâches et documents |
| `POST` | `/api/delivery-projects/:id/documents` | Importer jusqu'à 10 documents sur un projet |
| `POST` | `/api/delivery-projects/:id/notes` | Ajouter une note et une entrée d'historique |
| `DELETE` | `/api/delivery-projects/:id` | Supprimer un projet |
| `GET` | `/api/delivery-projects/members` | Lister les administrateurs et éditeurs actifs assignables |

Les statuts disponibles sont `BACKLOG`, `PLANNED`, `IN_PROGRESS`, `ON_HOLD`, `COMPLETED` et `CANCELLED`. Le modèle suit aussi la priorité, les affectations, les dates, le budget, le pourcentage d'avancement, les jalons, les tâches, les documents et les références client/projet. Les changements et les notes créent des entrées dans l'historique.

Les documents sont importés en fichiers PDF, DOCX, XLSX, CSV, TXT ou image (JPG, PNG, GIF, WEBP), avec une limite de 20 Mo par fichier par défaut. Ils sont stockés sous `uploads/delivery-documents` et ne peuvent être téléchargés que par un administrateur authentifié.

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
