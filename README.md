# Google Setup CLI v2.0

```
   ____                   _        ____       _
  / ___| ___   ___   __ _| | ___  / ___|  ___| |_ _   _ _ __
 | |  _ / _ \ / _ \ / _` | |/ _ \ \___ \ / _ \ __| | | | '_ \
 | |_| | (_) | (_) | (_| | |  __/  ___) |  __/ |_| |_| | |_) |
  \____|\___/ \___/ \__, |_|\___| |____/ \___|\__|\__,_| .__/
                    |___/                              |_|
```

**Automatisez la configuration complète de vos outils Google Analytics.**

GTM + GA4 + Search Console + Tracking Code — en quelques commandes.

---

## Quick Start

```bash
# Installation
npm install -g google-setup

# Lancer le mode interactif
google-setup
```

---

## Workflow en 8 Etapes

| Etape | Commande | Description |
|-------|----------|-------------|
| 0 | `autoedit` | Analyse HTML avec IA → tracking plan auto |
| 0bis | `audit` | Auditer un site existant (score A+ → F) |
| 1 | `init-tracking` | Creer tracking/ avec events + rules |
| 2 | `event-setup` | Selectionner les events a tracker |
| 3 | `gtm-config-setup` | Generer gtm-config.yaml |
| 4 | `generate-tracking` | Creer tracking.js |
| 5 | `html-layer` | Ajouter data-track au HTML |
| 6 | `deploy` | Deployer dans GTM (tags, triggers, variables) |
| 6bis | `sync` | Synchroniser code local → GTM |
| 7 | `verify-tracking` | Verifier que tout est production-ready |
| **8** | **`publish`** | **Publier GTM en production** |

---

## Installation

### Prerequis

- Node.js 18+
- npm

### Installation globale

```bash
npm install -g google-setup
```

### Depuis les sources

```bash
git clone https://github.com/annubis-knight/Google_Setup_CLI.git
cd Google_Setup_CLI
npm install
npm link
```

---

## Configuration initiale

### 1. Creer un projet Google Cloud

1. Allez sur [console.cloud.google.com](https://console.cloud.google.com)
2. Creez un nouveau projet
3. Activez les APIs :
   - Tag Manager API
   - Google Analytics Admin API
   - Search Console API
   - Site Verification API

### 2. Creer un Service Account

1. APIs et services → Identifiants → Creer → Compte de service
2. Telechargez la cle JSON

### 3. Donner les permissions

Copiez l'email du Service Account (`xxx@xxx.iam.gserviceaccount.com`)

- **GTM** : Admin → Gestion des utilisateurs → Ajouter → Droits "Publier"
- **GA4** : Admin → Gestion des acces → Ajouter → Droits "Editeur"

### 4. Initialiser l'outil

```bash
google-setup init
```

---

## Commandes principales

### Mode interactif (recommande)

```bash
google-setup
```

Affiche un menu avec toutes les etapes et une aide contextuelle.

### Deploiement rapide

```bash
google-setup deploy --domain mon-site.fr --name "Mon Site"
```

Cree automatiquement :
- Container GTM
- Propriete GA4
- Tags, triggers, variables

### Audit d'un site

```bash
google-setup audit --domains mon-site.fr
```

Analyse la configuration existante et donne un score (A+ a F).

### Publication GTM (Etape 8)

```bash
google-setup publish --domain mon-site.fr
# ou
google-setup publish --gtm-id GTM-XXXXX
```

Publie automatiquement les modifications GTM en production :
- **Version semantique** : v1.0.0 → v1.0.1 → v1.0.2...
- **Description auto** : liste les tags/triggers/variables ajoutes/modifies
- **One-shot** : cree la version et publie en une commande

```
📋 Changements detectes:
   + 4 tag(s): GA4 - Config, GA4 Event - Conversions...
   + 27 trigger(s): CE - form_submit, CE - phone_click...
   + 4 variable(s): Constant - GA4 Measurement ID...

✓ Version v1.0.1 creee
✓ Publiee en production !
```

---

## Workflow complet

```bash
# 1. Initialiser le tracking
google-setup init-tracking

# 2. Selectionner les events
google-setup event-setup

# 3. Generer la config GTM
google-setup gtm-config-setup

# 4. Generer tracking.js
google-setup generate-tracking

# 5. Ajouter data-track au HTML
google-setup html-layer

# 6. Deployer dans GTM
google-setup deploy --domain mon-site.fr

# 7. Verifier que tout est pret
google-setup verify-tracking

# 8. Publier en production
google-setup publish --domain mon-site.fr
```

---

## Structure des fichiers

```
mon-projet/
├── tracking/
│   ├── tracking-events.yaml   # Definition des events
│   ├── tracking-rules.yaml    # Regles de detection
│   └── gtm-config.yaml        # Config GTM (tags, triggers)
├── public/
│   └── tracking.js            # Script de tracking
└── .google-setup.json         # Config locale
```

---

## Reference des commandes

| Commande | Options | Description |
|----------|---------|-------------|
| `init` | - | Configurer les credentials |
| `autoedit` | `--path` `--source` `--step` `--ai` `--debug` | Analyse IA du HTML |
| `audit` | `--domains` `--output` | Auditer des sites |
| `init-tracking` | `--path` `--force` | Creer tracking/ |
| `event-setup` | `--path` | Selectionner events |
| `gtm-config-setup` | `--path` | Generer gtm-config.yaml |
| `generate-tracking` | `--path` | Generer tracking.js |
| `html-layer` | `--path` `--source` | Ajouter data-track |
| `deploy` | `--domain` `--name` `--auto` | Deployer dans GTM |
| `sync` | `--path` `--domain` `--auto` | Sync local → GTM |
| `verify-tracking` | `--path` | Verifier setup |
| `publish` | `--domain` `--gtm-id` | Publier GTM en prod |
| `clean` | `--domain` `--dry-run` `--force` | Nettoyer GTM |

---

## OAuth Scopes requis

Pour la commande `publish`, le compte de service doit avoir ces scopes :

```
tagmanager.edit.containers
tagmanager.edit.containerversions
tagmanager.publish
```

Et le role "Publier" dans GTM.

---

## FAQ

### Ou executer les commandes ?

| Commande | Ou l'executer |
|----------|---------------|
| `init` | N'importe ou (config globale) |
| `autoedit`, `init-tracking`, `verify-tracking` | Dans le dossier du projet |
| `deploy`, `audit`, `publish` | N'importe ou (specifier le domaine) |

### Mes fichiers existants seront ecrases ?

Non. L'outil detecte les fichiers existants et les ignore. Utilisez `--force` pour ecraser.

### Ou sont stockees mes credentials ?

```
~/.google-credentials.json     # Credentials Google API
~/.google-setup-config.json    # Configuration (Account IDs)
```

---

## Developpement

```bash
git clone https://github.com/annubis-knight/Google_Setup_CLI.git
cd Google_Setup_CLI
npm install
npm test
node bin/cli.js
```

---

## Licence

MIT

**Cree par [Arnaud Gutierrez](mailto:arnaud.g.motiv@gmail.com)**
