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

## Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Installation](#installation)
- [Configuration initiale](#configuration-initiale)
- [Workflows par cas d'usage](#workflows-par-cas-dusage)
- [Toutes les commandes](#toutes-les-commandes)
- [Structure des fichiers générés](#structure-des-fichiers-générés)
- [FAQ](#faq)

---

## Vue d'ensemble

### Qu'est-ce que cet outil fait ?

```
┌─────────────────────────────────────────────────────────────────────┐
│                         GOOGLE SETUP CLI                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  📋 AUDIT          →  Analyse votre config existante (score A+ → F) │
│  🚀 DEPLOY         →  Crée GTM + GA4 + balises from scratch         │
│  📄 INIT-TRACKING  →  Génère le plan de taggage (YAML + MD)         │
│  ⚡ GENERATE       →  Crée gtm-tracking.js depuis le YAML           │
│  🔄 SYNC           →  Synchronise votre code local avec GTM         │
│  📊 STATUS         →  Affiche la progression et les manques         │
│  ▶️ CONTINUE       →  Reprend le déploiement là où il s'est arrêté  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Pourquoi utiliser cet outil ?

| Problème | Solution |
|----------|----------|
| Configuration GTM manuelle longue et source d'erreurs | Déploiement automatisé en 1 commande |
| Pas de documentation tracking | Génération de tracking-plan.yml + .md |
| Code tracking à écrire à la main | Auto-génération de gtm-tracking.js |
| Synchronisation code ↔ GTM manuelle | Commande `sync` automatique |
| Pas de vision de ce qui manque | Checklist interactive avec `status` |

---

## Installation

### Prérequis

- Node.js 18+
- npm

### Option 1 : Installation globale (recommandé)

```bash
npm install -g google-setup
```

### Option 2 : Depuis les sources

```bash
git clone https://github.com/annubis-knight/Google_Setup_CLI.git
cd Google_Setup_CLI
npm install
npm link
```

### Vérification

```bash
google-setup --version
# → 2.0.0
```

---

## Configuration initiale

### Étape 1 : Créer un projet Google Cloud

```
┌──────────────────────────────────────────────────────────────┐
│  Google Cloud Console                                        │
│  https://console.cloud.google.com                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Cliquez "Créer un projet"                                │
│  2. Nom : "Mon Analytics Automation"                         │
│  3. Cliquez "Créer"                                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Étape 2 : Activer les APIs

Dans **APIs et services > Bibliothèque**, activez :

```
☑ Tag Manager API
☑ Google Analytics Admin API
☑ Search Console API
☑ Site Verification API
```

### Étape 3 : Créer un Service Account

```
┌──────────────────────────────────────────────────────────────┐
│  APIs et services > Identifiants > Créer > Compte de service │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Nom : google-setup-bot                                      │
│  ↓                                                           │
│  Cliquez sur le compte créé                                  │
│  ↓                                                           │
│  Onglet "Clés" > "Ajouter une clé" > "Créer une clé" > JSON  │
│  ↓                                                           │
│  📥 Téléchargez le fichier .json (gardez-le en sécurité!)    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Étape 4 : Donner les permissions

Copiez l'email du Service Account : `xxx@xxx.iam.gserviceaccount.com`

**Dans GTM** ([tagmanager.google.com](https://tagmanager.google.com)) :
```
Admin > Gestion des utilisateurs > + > Coller l'email > Droits "Publier"
```

**Dans GA4** ([analytics.google.com](https://analytics.google.com)) :
```
Admin > Gestion des accès > + > Coller l'email > Droits "Éditeur"
```

### Étape 5 : Initialiser l'outil

```bash
google-setup init
```

```
┌──────────────────────────────────────────────────────────────┐
│  🔧 Configuration de Google Setup CLI                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ? Chemin du fichier credentials JSON :                      │
│    → /path/to/mon-projet-xxxxx.json                          │
│                                                              │
│  ? GTM Account ID :                                          │
│    → 1234567890  (visible dans l'URL GTM)                    │
│                                                              │
│  ? GA4 Account ID :                                          │
│    → 9876543210  (Admin > Détails du compte)                 │
│                                                              │
│  ✅ Configuration sauvegardée !                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Workflows par cas d'usage

### Cas 1 : Nouveau projet — Déploiement complet

**Situation** : Vous avez un nouveau site sans aucun tracking.

```bash
# 1. Depuis le dossier de votre projet web
cd /mon-nouveau-projet

# 2. Déployer tout automatiquement
google-setup deploy -d "mon-site.fr" -n "Mon Site"

# 3. Intégrer les fichiers générés dans votre HTML
```

**Ce qui est créé :**
- Container GTM (GTM-XXXXXX)
- Propriété GA4 (G-XXXXXXXXXX)
- Balise GA4 Config
- Triggers et tags selon le template

---

### Cas 2 : Projet existant — Créer le plan de taggage

**Situation** : Vous avez un projet et voulez documenter/générer le tracking.

```bash
# 1. Depuis le dossier de votre projet
cd /mon-projet-existant

# 2. Générer le plan de taggage
google-setup init-tracking

# 3. Éditer le YAML pour activer les events voulus
#    → Ouvrez tracking/tracking-plan.yml
#    → Mettez enabled: true sur les events à utiliser

# 4. Générer le code JavaScript
google-setup generate-tracking --force

# 5. Le fichier gtm-tracking.js est prêt à l'emploi !
```

**Fichiers générés :**

```
mon-projet/
├── tracking/
│   ├── tracking-plan.yml    ← Configuration (source de vérité)
│   └── tracking-plan.md     ← Documentation lisible
└── gtm-tracking.js          ← Code JS prêt à utiliser
```

---

### Cas 3 : Synchroniser le code local avec GTM

**Situation** : Vous avez un fichier tracking.js local et voulez créer les triggers GTM correspondants.

```bash
# 1. Depuis le dossier contenant vos fichiers tracking
cd /mon-projet

# 2. Synchroniser avec GTM
google-setup sync -d "mon-site.fr"
```

```
┌──────────────────────────────────────────────────────────────┐
│  🔄 Synchronisation Local → GTM                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  📁 Fichier trouvé: ./src/gtm-tracking.js                    │
│                                                              │
│  Events détectés:                                            │
│    • clic_cta                                                │
│    • form_submit                                             │
│    • phone_click                                             │
│    • scroll_depth                                            │
│                                                              │
│  ✅ Trigger créé: EV - clic_cta                              │
│  ✅ Trigger créé: EV - form_submit                           │
│  ✅ Variable créée: DLV - cta_location                       │
│  ✅ Tag GA4 créé: GA4 - EV - CTA Click                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

### Cas 4 : Voir ce qui manque

**Situation** : Vous voulez savoir où en est la configuration d'un site.

```bash
google-setup status -d "mon-site.fr"
```

```
═══════════════════════════════════════════════════════════════════════
  CHECKLIST - mon-site.fr
═══════════════════════════════════════════════════════════════════════

✅ 1. Google Analytics 4 (100%)
   ✓ Propriété GA4 existe
   ✓ Data Stream configuré
   ✓ Measurement ID récupéré

✅ 2. Google Tag Manager (100%)
   ✓ Conteneur GTM existe (GTM-XXXXXXX)
   ✓ Balise GA4 Config présente

⏳ 3. DataLayer Custom (60%)
   ✓ Variables DataLayer (8)
   ✓ Triggers custom events (5)
   ✗ Tag GA4 pour scroll_depth
   ✗ Tag GA4 pour video_play

⏳ 4. Search Console (50%)
   ✓ Site vérifié
   ✗ Sitemap soumis

───────────────────────────────────────────────────────────────────────
🎯 Progression globale : ████████████████░░░░ 78%  [Grade: B]
───────────────────────────────────────────────────────────────────────

💡 Conseil: Lancez "google-setup continue" pour compléter automatiquement
```

---

### Cas 5 : Continuer un déploiement incomplet

**Situation** : Un déploiement a été interrompu ou vous voulez compléter ce qui manque.

```bash
# Mode interactif (confirmation à chaque étape)
google-setup continue -d "mon-site.fr"

# Mode automatique (tout d'un coup)
google-setup continue -d "mon-site.fr" --auto
```

---

### Cas 6 : Auditer plusieurs sites

**Situation** : Vous gérez plusieurs sites et voulez un état des lieux.

```bash
google-setup audit -d "site1.fr,site2.fr,site3.fr"
```

```
┌─────────────────────────────────────────────────────────────┐
│  AUDIT MULTI-SITES                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  site1.fr ............... 92% [A+] ████████████████████░░  │
│  site2.fr ............... 75% [B]  ███████████████░░░░░░░  │
│  site3.fr ............... 45% [D]  █████████░░░░░░░░░░░░░  │
│                                                             │
│  📊 Moyenne : 71% [B]                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### Cas 7 : Nettoyer GTM (supprimer les orphelins)

**Situation** : Votre GTM contient des triggers/tags/variables qui ne sont plus utilisés dans votre code.

```bash
# 1. Voir ce qui serait supprimé (sans supprimer)
google-setup clean -d "mon-site.fr" --dry-run

# 2. Supprimer après confirmation
google-setup clean -d "mon-site.fr"

# 3. Supprimer sans confirmation (dangereux)
google-setup clean -d "mon-site.fr" --force
```

```
┌──────────────────────────────────────────────────────────────┐
│  🧹 Nettoyage GTM - mon-site.fr                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Comparaison Local ↔ GTM...                                  │
│                                                              │
│  📁 Source locale: ./gtm-tracking.js                         │
│     Events locaux: clic_cta, form_submit, phone_click        │
│                                                              │
│  🏷️  Éléments orphelins dans GTM (non utilisés en local):    │
│                                                              │
│  ⚠️  Triggers à supprimer:                                   │
│      • EV - old_event_1                                      │
│      • EV - deprecated_click                                 │
│                                                              │
│  ⚠️  Tags à supprimer:                                       │
│      • GA4 - EV - Old Event                                  │
│                                                              │
│  ⚠️  Variables à supprimer:                                  │
│      • DLV - unused_var                                      │
│                                                              │
│  ─────────────────────────────────────────────────────────── │
│  Total: 4 éléments à supprimer                               │
│                                                              │
│  ? Confirmer la suppression ? (y/N)                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

> **Attention** : Cette commande supprime des éléments dans GTM. Utilisez `--dry-run` d'abord !

---

## Toutes les commandes

### Mode interactif

```bash
google-setup
```

Affiche un menu avec toutes les options :

```
   ____                   _        ____       _
  / ___| ___   ___   __ _| | ___  / ___|  ___| |_ _   _ _ __
 | |  _ / _ \ / _ \ / _` | |/ _ \ \___ \ / _ \ __| | | | '_ \
 | |_| | (_) | (_) | (_| | |  __/  ___) |  __/ |_| |_| | |_) |
  \____|\___/ \___/ \__, |_|\___| |____/ \___|\__|\__,_| .__/
                    |___/                              |_|

Audit & Déploiement automatique Google Analytics

? Que voulez-vous faire ?
  📋 Voir la progression d'un site (status)
  ▶️  Continuer le déploiement (continue)
  🔄 Synchroniser projet local → GTM (sync)
  📄 Générer plan de taggage (init-tracking)
  ⚡ Générer gtm-tracking.js (generate-tracking)
  🧹 Nettoyer GTM (clean)
  🔍 Auditer un ou plusieurs domaines
  🚀 Déployer from scratch
  ❌ Quitter
```

### Référence des commandes

| Commande | Description | Options |
|----------|-------------|---------|
| `init` | Configurer les credentials | - |
| `status` | Voir la checklist | `-d, --domain` |
| `continue` | Reprendre le déploiement | `-d, --domain` `--auto` |
| `sync` | Sync local → GTM | `-p, --path` `-d, --domain` `--auto` |
| `init-tracking` | Générer YAML + MD | `-p, --path` `-o, --output` `--force` |
| `generate-tracking` | Générer JS depuis YAML | `-p, --path` `-i, --input` `-o, --output` `--force` |
| `audit` | Auditer un/plusieurs sites | `-d, --domains` `-o, --output` |
| `deploy` | Déploiement complet | `-d, --domain` `-n, --name` `--auto` |
| `clean` | Nettoyer GTM (supprimer orphelins) | `-d, --domain` `-p, --path` `--dry-run` `--force` |

### Template modulable

Le fichier `tracking-plan.yml` contient **tous les events possibles** avec un flag `enabled: true/false` :

```yaml
events:
  # Lead Generation
  - id: "cta_click"
    enabled: true       # ← Activé

  # E-commerce
  - id: "purchase"
    enabled: false      # ← Désactivé (pas e-commerce)

  # Engagement
  - id: "scroll_depth"
    enabled: true       # ← Activé
```

**Catégories disponibles :**
| Catégorie | Events | Activer si... |
|-----------|--------|---------------|
| Lead Generation | cta_click, form_submit | Site vitrine, landing pages |
| Contact | phone_click, email_click, whatsapp_click | Coordonnées cliquables |
| Engagement | scroll_depth | Mesure de l'engagement |
| Funnel | funnel_step | Parcours multi-étapes |
| Ecommerce | view_item, add_to_cart, purchase... | Boutique en ligne |

---

## Structure des fichiers générés

### Dans votre projet

```
mon-projet/
├── tracking/
│   ├── tracking-plan.yml      # Source de vérité (config)
│   └── tracking-plan.md       # Documentation client
├── gtm-tracking.js            # Code JS auto-généré
├── components/
│   ├── gtm-head.html          # Script GTM pour <head>
│   └── gtm-body.html          # Noscript pour <body>
└── .google-setup.json         # Config locale du projet
```

### Le fichier tracking-plan.yml

```yaml
project:
  name: "Mon Site"
  domain: "mon-site.fr"
  ga4_measurement_id: "G-XXXXXXXXXX"
  gtm_container_id: "GTM-XXXXXXX"

events:
  - id: "cta_click"
    name: "CTA - Clic"
    enabled: true              # ← Activer/désactiver ici
    category: "Lead Generation"

    datalayer:
      event_name: "clic_cta"
      params:
        - name: "cta_location"
          type: "string"
          values: ["hero", "footer", "sidebar"]

    ga4:
      event_name: "clic_cta"
      conversion: true
```

### Le fichier gtm-tracking.js généré

```javascript
/**
 * GTM Tracking - Mon Site
 * Généré automatiquement par google-setup-cli
 */

function pushEvent(eventName, eventData = {}) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: eventName,
    ...eventData,
    timestamp: new Date().toISOString()
  });
}

// Fonctions exportées
export function trackCTA(cta_location) {
  pushEvent('clic_cta', { cta_location });
}

export function trackFormSubmit(form_name, lead_value) {
  pushEvent('form_submit', { form_name, lead_value: lead_value ?? 0 });
}

export function trackPhoneClick() {
  pushEvent('phone_click');
}

// Auto-tracking des liens tel: et mailto:
export function initAutoTracking() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    if (href.startsWith('tel:')) trackPhoneClick();
    if (href.startsWith('mailto:')) trackEmailClick();
  });
}

// Scroll tracking automatique
export function initScrollTracking() {
  // Track 25%, 50%, 75%, 100%
}
```

### Intégration HTML

```html
<!DOCTYPE html>
<html>
<head>
  <!-- GTM Head (copier depuis components/gtm-head.html) -->
  <script>(function(w,d,s,l,i){...})(window,document,'script','dataLayer','GTM-XXXXX');</script>
</head>
<body>
  <!-- GTM Body (juste après <body>) -->
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXXX"></iframe></noscript>

  <!-- Votre contenu -->
  <button onclick="trackCTA('hero')">Demander un devis</button>

  <!-- Avant </body> -->
  <script type="module">
    import { initAutoTracking, initScrollTracking } from './gtm-tracking.js';
    initAutoTracking();
    initScrollTracking();
  </script>
</body>
</html>
```

---

## FAQ

### Où exécuter les commandes ?

| Commande | Où l'exécuter |
|----------|---------------|
| `init` | N'importe où (config globale) |
| `init-tracking` | Dans le dossier de votre projet web |
| `generate-tracking` | Dans le dossier de votre projet web |
| `sync` | Dans le dossier de votre projet web |
| `status`, `continue`, `deploy`, `audit` | N'importe où (spécifier le domaine) |

### Mes fichiers existants vont être écrasés ?

Non. L'outil détecte les fichiers existants :
```
⏭️ gtm-head.html existe déjà: ./components/gtm-head.html
⏭️ Fichier tracking existe déjà: ./src/gtm-tracking.js
```

Utilisez `--force` pour écraser volontairement.

### Comment détecter les events de mon code existant ?

La commande `sync` détecte automatiquement :

```javascript
// ✅ Détecté : dataLayer.push direct
dataLayer.push({ event: 'clic_cta' });

// ✅ Détecté : fonctions wrapper communes
pushEvent('clic_cta');
trackEvent('form_submit');
sendEvent('phone_click');

// ✅ Détecté : wrapper custom
function track(eventName) { dataLayer.push({ event: eventName }); }
track('custom_event');
```

### Où sont stockées mes credentials ?

```
~/.google-credentials.json     # Credentials Google API
~/.google-setup-config.json    # Configuration (Account IDs)
```

### Comment mettre à jour les triggers après modification ?

```bash
google-setup sync -d "mon-site.fr"
```

La commande compare votre code avec GTM et crée uniquement ce qui manque.

### Le status affiche "Bloqué par X" ?

C'est normal. Les étapes ont des dépendances :
```
GA4 → GTM → DataLayer → Conversions
```

Si GA4 n'est pas configuré, GTM sera "bloqué". Utilisez `continue` pour déployer dans l'ordre.

---

## Développement

```bash
git clone https://github.com/annubis-knight/Google_Setup_CLI.git
cd Google_Setup_CLI
npm install
npm test        # 42 tests
node bin/cli.js # Lancer en dev
```

### Structure du projet

```
src/
├── commands/       # Commandes CLI
│   ├── audit.js
│   ├── deploy.js
│   ├── status.js
│   ├── continue.js
│   ├── sync.js
│   ├── init-tracking.js
│   └── generate-tracking.js
├── detectors/      # Analyse existant (GTM, GA4, Search Console)
├── deployers/      # Création (triggers, tags, variables)
├── templates/      # Templates YAML/MD
└── utils/          # Auth, checklist, helpers
```

---

## Licence

MIT — Utilisez librement dans vos projets.

---

**Créé par [Arnaud Gutierrez](mailto:arnaud.g.motiv@gmail.com)**

