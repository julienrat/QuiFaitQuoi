# Gestion des bénévoles — PHP + PostgreSQL (sans Node)

Application web légère pour gérer des bénévoles lors d’un événement :
- **Admin** : création d’événements, tâches, bénévoles, CSV, duplication d’événement.
- **Bénévoles** : inscription, choix de tâches, commentaires, modification ultérieure.

---

## 1) Prérequis serveur

- **PHP 8.x** avec extensions :
  - `pdo`
  - `pdo_pgsql`
- **PostgreSQL 13+**
- Un serveur web (Apache/Nginx) ou le serveur PHP intégré pour test local

---

## 2) Installation rapide (serveur local)

```bash
# 1) Lancer PHP en local
php -S 127.0.0.1:8000 -t .

# 2) Ouvrir l’admin
http://127.0.0.1:8000/public/admin.html
```

---

## 3) Création de la base PostgreSQL

### a) Créer un utilisateur et une base

```bash
sudo -u postgres psql
```

```sql
create user benevoles with password 'benevoles';
create database benevoles owner benevoles;
\q
```

### b) Charger le schéma

```bash
psql -U benevoles -d benevoles -h 127.0.0.1 -f sql/schema.sql
```

---

## 4) Variables d’environnement

Définissez ces variables avant de lancer PHP :

```bash
export PGHOST=127.0.0.1
export PGPORT=5432
export PGDATABASE=benevoles
export PGUSER=benevoles
export PGPASSWORD=benevoles

# Token pour créer le 1er compte admin (une seule fois)
export ADMIN_SETUP_TOKEN="change-moi"
```

---

## 5) Création du compte admin (une seule fois)

```bash
curl -X POST http://127.0.0.1:8000/api/index.php?action=admin_setup \
  -H 'Content-Type: application/json' \
  -d '{"token":"change-moi","username":"admin","password":"admin123"}'
```

Ensuite, connectez-vous sur :

```
http://127.0.0.1:8000/public/admin.html
```

---

## 6) Déploiement sur un serveur PHP (Apache / Nginx)

### Apache (exemple)
- DocumentRoot vers le dossier du projet
- Activer PHP et `pdo_pgsql`

Exemple simplifié :

```
/var/www/gestion-benevoles
├── api
├── public
├── sql
└── README.md
```

URL admin :
```
https://votre-domaine/public/admin.html
```

### Nginx (exemple)
Assurez-vous que :
- `root` pointe vers le dossier projet
- `index` autorise `.html`
- PHP-FPM est actif

---

## 7) CSV — Import / Export

### Import bénévoles (onglet Bénévoles)
Colonnes attendues :
```
prenom,nom,email,telephone
```
`email` et `telephone` sont facultatifs.

### Import tâches (onglet Tâches)
Colonnes attendues :
```
tache,date,total_attendu
```
`date` doit être compatible avec PostgreSQL (`YYYY-MM-DD HH:MM`).

### Export
- **CSV bénévoles** : un bénévole par ligne
- **CSV tâches** : une tâche par ligne avec les bénévoles affectés

---

## 8) Gestion des événements

- **Dupliquer un événement** : copie l’événement et ses tâches
- **Suppression** : disponible dans la fenêtre « Modifier l’événement »

---

## 9) Côté bénévoles

- Le lien public est généré pour chaque événement
- Les choix sont mémorisés en `localStorage`
- Les commentaires par tâche sont possibles
- Les bénévoles peuvent **récupérer leurs données** via leur numéro de téléphone

---

## 10) Markdown dans la description d’événement

La description d’événement supporte :
- Titres `#`, `##`, `###`
- Gras `**texte**`
- Italique `*texte*`
- Code `` `code` ``
- Listes à puces `- item`
- Liens `https://...`

---

## 10.1) Thème par événement

Le thème (couleurs) est lié à chaque événement et affecte :
- l’interface admin
- la page bénévole

Si vous mettez à jour une base existante :

```sql
alter table events add column if not exists theme text not null default 'sand';
```

---

## 11) Dépannage

### Erreur : `could not find driver`
Installez l’extension :

```bash
sudo apt install php-pgsql
```

### Erreur : `password authentication failed`
Vérifiez vos variables `PGUSER/PGPASSWORD`.

---

## 12) Sécurité (recommandé en prod)

- Protéger l’admin par HTTPS
- Choisir un mot de passe admin fort
- Limiter l’accès à `/api` si besoin

---

Si tu veux, je peux ajouter :
- Docker (PHP + Postgres)
- Auth admin plus robuste
- Exports CSV personnalisés
