# Google Setup CLI v2.0

```
   ____                   _        ____       _
  / ___| ___   ___   __ _| | ___  / ___|  ___| |_ _   _ _ __
 | |  _ / _ \ / _ \ / _` | |/ _ \ \___ \ / _ \ __| | | | '_ \
 | |_| | (_) | (_) | (_| | |  __/  ___) |  __/ |_| |_| | |_) |
  \____|\___/ \___/ \__, |_|\___| |____/ \___|\__|\__,_| .__/
                    |___/                              |_|
```

**Automatisez la configuration complete de vos outils Google Analytics.**

GTM + GA4 + Search Console + DataLayer + Hotjar - en quelques commandes.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Table des matieres

- [Fonctionnalites](#fonctionnalites)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration initiale](#configuration-initiale)
- [Workflow en 8 etapes](#workflow-en-8-etapes)
- [Commandes detaillees](#commandes-detaillees)
- [Systeme de scoring KPI](#systeme-de-scoring-kpi)
- [Events disponibles](#events-disponibles)
- [Structure des fichiers](#structure-des-fichiers)
- [Architecture technique](#architecture-technique)
- [FAQ](#faq)
- [Developpement](#developpement)

---

## Fonctionnalites

### Audit automatique
- Analyse complete via les APIs Google (GTM, GA4, Search Console)
- Detection Hotjar et DataLayer
- Score de maturite analytics (0-100) avec grades A+ a F
- Recommandations priorisees

### Deploiement automatique
- Creation de conteneurs GTM
- Creation de proprietes GA4
- Generation de tags, triggers et variables
- Publication en production en une commande

### Analyse IA
- Scan automatique des fichiers HTML
- Detection des elements trackables (boutons, formulaires, liens)
- Generation du tracking plan via IA (Gemini, Claude, GPT)

### Verification production
- Checklist de 14 points avant mise en prod
- Detection des erreurs de configuration
- Validation des selecteurs CSS

---

## Quick Start

```bash
# Installation globale
npm install -g google-setup

# Lancer le mode interactif (recommande)
google-setup

# Ou deploiement rapide
google-setup deploy --domain mon-site.fr --name "Mon Site"
```

---

## Installation

### Prerequis

- **Node.js 18+** (LTS recommande)
- **npm** ou yarn
- Un compte **Google Cloud** avec les APIs activees

### Installation globale (recommande)

```bash
npm install -g google-setup
```

### Installation depuis les sources

```bash
git clone https://github.com/annubis-knight/Google_Setup_CLI.git
cd Google_Setup_CLI
npm install
npm link
```

### Verification de l'installation

```bash
google-setup --version
# Devrait afficher: 2.0.0
```

---

## Configuration initiale

### Etape 1 : Creer un projet Google Cloud

1. Allez sur [console.cloud.google.com](https://console.cloud.google.com)
2. Creez un nouveau projet ou selectionnez un projet existant
3. Activez les APIs suivantes :

| API | Utilite |
|-----|---------|
| **Tag Manager API** | Gestion des conteneurs GTM |
| **Google Analytics Admin API** | Creation de proprietes GA4 |
| **Search Console API** | Verification et sitemaps |
| **Site Verification API** | Tokens de verification |

### Etape 2 : Creer un Service Account

1. **APIs et services** > **Identifiants**
2. **Creer des identifiants** > **Compte de service**
3. Donnez un nom (ex: `google-setup-cli`)
4. Telechargez la cle JSON

### Etape 3 : Donner les permissions

Copiez l'email du Service Account : `xxx@project.iam.gserviceaccount.com`

#### Permissions GTM
1. Ouvrez [tagmanager.google.com](https://tagmanager.google.com)
2. **Admin** > **Gestion des utilisateurs**
3. Ajoutez l'email avec les droits **Publier**

#### Permissions GA4
1. Ouvrez [analytics.google.com](https://analytics.google.com)
2. **Admin** > **Gestion des acces au compte**
3. Ajoutez l'email avec le role **Editeur**

### Etape 4 : Initialiser l'outil

```bash
google-setup init
```

Suivez les instructions pour :
- Indiquer le chemin vers votre fichier credentials JSON
- Selectionner votre compte GTM
- Selectionner votre compte GA4

Les credentials sont stockes dans :
```
~/.google-credentials.json      # Fichier credentials Google
~/.google-setup-config.json     # Configuration (Account IDs)
```

---

## Workflow en 8 etapes

Le workflow complet pour configurer le tracking d'un site :

| Etape | Commande | Description |
|:-----:|----------|-------------|
| 0 | `autoedit` | Analyse HTML avec IA → tracking plan automatique |
| 0bis | `audit` | Auditer un site existant (score A+ → F) |
| **1** | `init-tracking` | Creer `.google-setup.json` + dossier `tracking/` |
| **2** | `event-setup` | Selectionner les events a tracker |
| **3** | `gtm-config-setup` | Generer `gtm-config.yaml` |
| **4** | `generate-tracking` | Creer `tracking.js` |
| **5** | `html-layer` | Ajouter `data-track` au HTML |
| **6** | `verify-tracking` | Verifier que tout est production-ready |
| **7** | `create-gtm-container` | Creer conteneur GTM + propriete GA4 |
| 7bis | `sync` | Synchroniser code local → GTM |
| **8** | `publish` | Publier GTM en production |

> **Important** : Les etapes sont verrouillees tant que les prerequis ne sont pas completes.
> L'etape 6 (verify-tracking) doit etre passee AVANT de creer le conteneur GTM.

### Exemple de workflow complet

```bash
# 1. Initialiser le tracking (cree .google-setup.json)
google-setup init-tracking

# 2. Selectionner les events (interface interactive)
google-setup event-setup

# 3. Generer la configuration GTM
google-setup gtm-config-setup

# 4. Generer le fichier tracking.js
google-setup generate-tracking

# 5. Ajouter les attributs data-track au HTML
google-setup html-layer

# 6. Verifier la configuration (obligatoire avant creation GTM)
google-setup verify-tracking

# 7. Creer le conteneur GTM
google-setup create-gtm-container

# 8. Publier en production
google-setup publish
```

---

## Commandes detaillees

### `google-setup` (Mode interactif)

Lance le menu interactif avec aide contextuelle pour chaque commande.

```
┌────────────────────────────────────────────┐
│            GOOGLE SETUP CLI                │
├────────────────────────────────────────────┤
│  [0] autoedit    - Analyse IA du HTML      │
│  [1] init-tracking                         │
│  [2] event-setup                           │
│  [3] gtm-config-setup                      │
│  [4] generate-tracking                     │
│  [5] html-layer                            │
│  [6] verify-tracking                       │
│  [7] create-gtm-container                  │
│  [8] publish                               │
└────────────────────────────────────────────┘
```

---

### `init` - Configuration credentials

Configure les credentials Google API.

```bash
google-setup init
```

---

### `audit` - Auditer un domaine

Analyse la configuration analytics existante d'un domaine.

```bash
google-setup audit --domains mon-site.fr
google-setup audit --domains "site1.fr,site2.fr" --output json
```

**Options :**
| Option | Description |
|--------|-------------|
| `-d, --domains` | Domaine(s) a auditer (separes par virgules) |
| `-o, --output` | Format de sortie (`console` ou `json`) |

**Exemple de sortie :**
```
┌─────────────────────────────────────────────────────┐
│  AUDIT: mon-site.fr                                 │
├─────────────────────────────────────────────────────┤
│  Score Global: 72/100  Grade: B                     │
├─────────────────────────────────────────────────────┤
│  GTM:            ✓ GTM-XXXXX      85/100            │
│  GA4:            ✓ G-XXXXXXXXX    90/100            │
│  DataLayer:      ✓ 12 events      60/100            │
│  Search Console: ✓ Verifie        80/100            │
│  Hotjar:         ✗ Non installe   0/100             │
└─────────────────────────────────────────────────────┘
```

---

### `autoedit` - Analyse IA du HTML

Analyse automatique des fichiers HTML pour generer le tracking plan.

```bash
google-setup autoedit
google-setup autoedit --path ./src --ai gemini-flash
google-setup autoedit --step 3 --debug
```

**Options :**
| Option | Description |
|--------|-------------|
| `-p, --path` | Chemin du projet |
| `-s, --source` | Chemin des fichiers HTML a scanner |
| `--ai` | Modele IA (`gemini-flash`, `claude-haiku`, `gpt-4o-mini`) |
| `--step` | Executer une etape specifique (1-8) |
| `--type` | Type de site (`lead-gen`, `ecommerce`, `saas`, `media`) |
| `--exclude` | Dossiers a exclure |
| `--include-build` | Inclure les dossiers de build |
| `--dry-run` | Previsualiser sans sauvegarder |
| `--debug` | Sauvegarder les donnees de debug |

**Pipeline en 8 etapes :**
1. **HTML SCAN** - Extraction des elements interactifs
2. **AI ANALYSIS** - Deduction des events pertinents
3. **GROUPING** - Consolidation en event_groups
4. **SELECTOR FINDER** - Detection des selecteurs CSS robustes
5. **YAML BUILD** - Construction de la config YAML
6. **YAML MERGE** - Fusion avec YAML existant
7. **VALIDATION** - Verification de coherence
8. **GENERATION** - Ecriture des fichiers finaux

---

### `init-tracking` - Initialiser le dossier tracking

Cree la structure de base pour le tracking.

```bash
google-setup init-tracking
google-setup init-tracking --path ./mon-projet --force
```

**Options :**
| Option | Description |
|--------|-------------|
| `-p, --path` | Chemin du projet |
| `--force` | Ecraser les fichiers existants |

**Fichiers crees :**
```
tracking/
├── tracking-events.yaml    # Definition des 56 events disponibles
└── tracking-rules.yaml     # Regles de detection automatique
```

---

### `event-setup` - Selectionner les events

Interface interactive pour choisir les events a tracker.

```bash
google-setup event-setup
```

Les events sont groupes par categorie :
- **Conversions** : form_submit, phone_click, email_click...
- **Leads** : newsletter_submit, download_pdf, demo_request...
- **Engagement** : cta_primary, video_play, scroll_50...
- **Navigation** : menu_click, footer_link, outbound_click...

---

### `gtm-config-setup` - Generer la config GTM

Genere `gtm-config.yaml` a partir des events selectionnes.

```bash
google-setup gtm-config-setup
```

**Sortie :** `tracking/gtm-config.yaml` contenant :
- Tags GA4 Event pour chaque event
- Triggers (Custom Events, Click, Submit)
- Variables DataLayer

---

### `generate-tracking` - Generer tracking.js

Genere le code JavaScript de tracking.

```bash
google-setup generate-tracking
```

**Sortie :** `public/tracking.js` ou `src/tracking.js`

```javascript
// Exemple de code genere
window.dataLayer = window.dataLayer || [];

function trackEvent(eventName, params = {}) {
  dataLayer.push({
    event: eventName,
    ...params
  });
}

// Auto-binding des elements data-track
document.querySelectorAll('[data-track]').forEach(el => {
  el.addEventListener('click', () => {
    trackEvent(el.dataset.track);
  });
});
```

---

### `html-layer` - Ajouter data-track au HTML

Ajoute automatiquement les attributs `data-track` aux elements HTML.

```bash
google-setup html-layer
google-setup html-layer --source ./public
```

**Avant :**
```html
<button class="btn-primary">Demander un devis</button>
```

**Apres :**
```html
<button class="btn-primary" data-track="cta-primary">Demander un devis</button>
```

---

### `create-gtm-container` - Creer le conteneur GTM

Cree le conteneur GTM et la propriete GA4 via l'API Google.

```bash
google-setup create-gtm-container
google-setup create-gtm-container --domain mon-site.fr --name "Mon Site" --auto
```

> **Alias** : `deploy` (pour retrocompatibilite)

**Options :**
| Option | Description |
|--------|-------------|
| `-d, --domain` | Domaine cible |
| `-n, --name` | Nom du projet |
| `-p, --path` | Chemin du projet |
| `--auto` | Mode automatique sans confirmation |

**Actions effectuees :**
- Creation du conteneur GTM (si inexistant)
- Creation de la propriete GA4 (si inexistante)
- Creation des tags, triggers et variables
- Generation des snippets d'installation

> **Prerequis** : L'etape 6 (verify-tracking) doit etre completee avant d'executer cette commande.

---

### `sync` - Synchroniser avec GTM

Synchronise le code local avec un conteneur GTM existant.

```bash
google-setup sync --domain mon-site.fr
```

Detecte les events dans votre code `tracking.js` et cree les triggers/variables correspondants dans GTM.

---

### `verify-tracking` - Verification pre-production

Checklist de 14 points pour valider le setup **avant** de creer le conteneur GTM.

```bash
google-setup verify-tracking
```

> **Important** : Cette etape est obligatoire avant `create-gtm-container`. Elle garantit que votre configuration est valide avant de creer des ressources Google.

**Points verifies :**
- [ ] tracking-events.yaml existe
- [ ] gtm-config.yaml existe
- [ ] tracking.js existe
- [ ] Attributs data-track presents dans le HTML
- [ ] Tous les selecteurs CSS sont valides
- [ ] GA4 Measurement ID configure
- [ ] GTM Container ID configure
- [ ] Snippets GTM installes
- [ ] Pas d'events dupliques
- [ ] Pas de triggers orphelins
- ...

---

### `publish` - Publier en production

Publie les modifications GTM en production.

```bash
google-setup publish --domain mon-site.fr
google-setup publish --gtm-id GTM-XXXXX
```

**Options :**
| Option | Description |
|--------|-------------|
| `-d, --domain` | Domaine du site |
| `-g, --gtm-id` | GTM Container ID |

**Fonctionnalites :**
- **Versioning semantique** : v1.0.0 → v1.0.1 → v1.0.2
- **Description automatique** : Liste les changements (tags/triggers/variables ajoutes/modifies/supprimes)
- **One-shot** : Cree la version et publie en une commande

**Exemple de sortie :**
```
📋 Changements detectes:
   + 4 tag(s): GA4 - Config, GA4 Event - form_submit...
   + 27 trigger(s): CE - form_submit, CE - phone_click...
   + 4 variable(s): Constant - GA4 Measurement ID...

✓ Version v1.0.1 creee
✓ Publiee en production !
```

---

### `clean` - Nettoyer GTM

Supprime les elements orphelins dans GTM.

```bash
google-setup clean --domain mon-site.fr --dry-run
google-setup clean --domain mon-site.fr --force
```

**Options :**
| Option | Description |
|--------|-------------|
| `-d, --domain` | Domaine cible |
| `--dry-run` | Voir ce qui serait supprime |
| `--force` | Supprimer sans confirmation |

---

## Systeme de scoring KPI

L'audit calcule un score de maturite analytics sur 100 points.

### Ponderation

| Composant | Poids | Description |
|-----------|:-----:|-------------|
| **GA4** | 30% | Propriete, data streams, conversions |
| **DataLayer** | 30% | Events custom, variables |
| **GTM** | 20% | Conteneur, tags, triggers |
| **Search Console** | 15% | Verification, sitemaps |
| **Hotjar** | 5% | Heatmaps, recordings |

### Grille de notation

| Score | Grade | Signification |
|:-----:|:-----:|---------------|
| 90-100 | **A+** | Configuration optimale |
| 80-89 | **A** | Tres bonne configuration |
| 70-79 | **B** | Configuration correcte |
| 60-69 | **C** | Configuration incomplete |
| 40-59 | **D** | Configuration insuffisante |
| 0-39 | **F** | Configuration critique |

---

## Events disponibles

56 events pre-configures dans 4 categories :

### Conversions (8 events)
| Event | Description | Trigger |
|-------|-------------|---------|
| `form_submit` | Soumission formulaire contact | submit |
| `form_quote` | Demande de devis | submit |
| `form_callback` | Demande de rappel | submit |
| `phone_click` | Clic telephone | click |
| `email_click` | Clic email | click |
| `whatsapp_click` | Clic WhatsApp | click |
| `booking_click` | Clic reservation | click |
| `appointment_click` | Clic rendez-vous | click |

### Leads (7 events)
| Event | Description | Trigger |
|-------|-------------|---------|
| `newsletter_submit` | Inscription newsletter | submit |
| `download_pdf` | Telechargement PDF | click |
| `download_doc` | Telechargement Word | click |
| `download_file` | Telechargement fichier | click |
| `demo_request` | Demande demo | click |
| `trial_start` | Essai gratuit | click |
| `catalog_request` | Demande catalogue | click |

### Engagement (25 events)
| Event | Description |
|-------|-------------|
| `cta_primary` | CTA principal |
| `cta_secondary` | CTA secondaire |
| `video_play` | Lecture video |
| `accordion_open` | Ouverture accordeon |
| `scroll_25/50/75/100` | Scroll depth |
| `read_30s/60s/120s` | Temps passe |
| `cookie_accept/reject` | Consentement cookies |
| ... | |

### Navigation (12 events)
| Event | Description |
|-------|-------------|
| `menu_click` | Clic menu principal |
| `logo_click` | Clic logo |
| `footer_link` | Clic footer |
| `outbound_click` | Lien externe |
| `error_404` | Page 404 |
| ... | |

---

## Structure des fichiers

### Fichiers du projet

```
mon-projet/
├── tracking/
│   ├── tracking-events.yaml    # Definition des events
│   ├── tracking-rules.yaml     # Regles de detection
│   ├── gtm-config.yaml         # Config GTM (tags, triggers)
│   └── debug/                  # Donnees de debug (autoedit)
├── public/
│   └── tracking.js             # Script de tracking genere
├── index.html                  # HTML avec data-track
└── .google-setup.json          # Config locale du projet
```

### Fichiers globaux

```
~/.google-credentials.json      # Credentials Google API
~/.google-setup-config.json     # Configuration (Account IDs)
```

---

## Architecture technique

### Stack technique

| Composant | Technologie |
|-----------|-------------|
| **Runtime** | Node.js 18+ (ES Modules) |
| **CLI** | Commander.js |
| **Interactivite** | Inquirer.js, Enquirer |
| **Google APIs** | googleapis |
| **Parsing HTML** | Cheerio |
| **UI Terminal** | Chalk, Ora, Boxen, Figlet |
| **Config** | js-yaml |
| **Tests** | Vitest |

### APIs Google utilisees

| API | Utilite |
|-----|---------|
| Tag Manager v2 | Conteneurs, tags, triggers, variables |
| Analytics Admin v1alpha | Proprietes GA4, data streams |
| Search Console v3 | Verification, sitemaps |
| Site Verification v1 | Tokens de verification |

### Scopes OAuth requis

```
tagmanager.edit.containers
tagmanager.edit.containerversions
tagmanager.publish
analytics.edit
webmasters.readonly
siteverification.verify_only
```

---

## FAQ

### Ou executer les commandes ?

| Commande | Ou l'executer |
|----------|---------------|
| `init` | N'importe ou (config globale) |
| `autoedit`, `init-tracking`, `verify-tracking` | Dans le dossier du projet |
| `create-gtm-container`, `audit`, `publish` | N'importe ou (specifier le domaine) |

### Mes fichiers existants seront ecrases ?

Non. L'outil detecte les fichiers existants et les preserve. Utilisez `--force` pour ecraser.

### Comment debugger autoedit ?

```bash
google-setup autoedit --debug
```

Les donnees de debug sont sauvegardees dans `tracking/debug/`.

### Puis-je utiliser l'outil sans IA ?

Oui. Utilisez le workflow manuel :
1. `init-tracking` pour creer les fichiers
2. `event-setup` pour selectionner les events
3. Continuez le workflow normalement

### Comment annuler un deploiement ?

Utilisez `clean` pour supprimer les elements orphelins, ou supprimez manuellement dans l'interface GTM.

### L'outil supporte-t-il plusieurs environnements ?

Oui. Utilisez des fichiers `.google-setup.json` differents par projet, ou specifiez le domaine a chaque commande.

---

## Developpement

### Installation locale

```bash
git clone https://github.com/annubis-knight/Google_Setup_CLI.git
cd Google_Setup_CLI
npm install
```

### Lancer les tests

```bash
npm test           # Mode watch
npm run test:run   # Une seule execution
```

### Lancer en dev

```bash
node bin/cli.js
node bin/cli.js audit --domains example.com
```

### Structure du code

```
src/
├── commands/       # Commandes CLI (audit, deploy, publish...)
├── detectors/      # Detection API (gtm, ga4, hotjar...)
├── deployers/      # Deploiement API (gtm, ga4)
├── analyzers/      # Analyse HTML et selecteurs
├── ai/             # Integration IA (Gemini, Claude, GPT)
├── mergers/        # Fusion YAML
├── kpi/            # Calcul des scores
├── utils/          # Auth, fichiers, templates
└── templates/      # Templates YAML et GTM
```

---

## Contribuer

Les contributions sont les bienvenues !

1. Forkez le projet
2. Creez une branche (`git checkout -b feature/ma-feature`)
3. Commitez (`git commit -m 'Add ma feature'`)
4. Pushez (`git push origin feature/ma-feature`)
5. Ouvrez une Pull Request

---

## Licence

MIT

---

**Cree par [Arnaud Gutierrez](mailto:arnaud.g.motiv@gmail.com)**
