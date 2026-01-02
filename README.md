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
│  🤖 AUTOEDIT       →  Analyse HTML avec IA → tracking plan auto     │
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
| Ne pas savoir quoi tracker | **AutoEdit** scanne votre HTML avec l'IA |
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

### Cas 1 : Analyser automatiquement un site avec l'IA (AutoEdit)

**Situation** : Vous avez un site web et voulez générer automatiquement le plan de taggage.

```bash
# 1. Depuis le dossier de votre projet web
cd /mon-projet

# 2. Lancer l'analyse IA (pipeline 8 étapes)
google-setup autoedit --debug

# 3. Ou exécuter une étape spécifique
google-setup autoedit --step=1   # Juste le scan HTML
google-setup autoedit --step=2   # Analyse IA
```

```
┌──────────────────────────────────────────────────────────────────────┐
│  🤖 AUTOEDIT - Pipeline IA 8 étapes                                  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  🔍 [1/8] Scanning HTML files...                                     │
│     ✓ 12 fichiers HTML scannés                                       │
│     ✓ 68 éléments interactifs détectés                               │
│     ✓ Priorité: 15 high, 20 medium, 33 low                           │
│     → Debug: 2024-01-15T14-30-00_step1_html_scan.json                 │
│                                                                      │
│  🤖 [2/8] AI Analysis (Gemini 2.0 Flash)...                          │
│     ✓ 32 events recommandés                                          │
│     → Debug: 2024-01-15T14-30-05_step2_ai_analysis.json               │
│                                                                      │
│  📊 [3/8] Grouping & consolidation...                                │
│     ✓ 3 event_groups créés                                           │
│     ✓ 8 events standalone                                            │
│     ✓ Réduction: 40% moins de tags GTM                               │
│                                                                      │
│  🎯 [4/8] Finding robust selectors...                                │
│     ✓ Sélecteurs analysés (score: 85/100 - A)                        │
│     ✓ 45 éléments avec haute confiance                               │
│     ⚠️  12 éléments nécessitent data-track                           │
│                                                                      │
│  🔧 [5/8] Building YAML config...                                    │
│     ✓ Configuration YAML construite                                  │
│                                                                      │
│  🔀 [6/8] Merging with existing YAML...                              │
│     ✓ Nouvelle configuration créée                                   │
│                                                                      │
│  ✅ [7/8] Validation...                                              │
│     ✓ Validation OK (8 events, 3 groupes)                            │
│                                                                      │
│  📝 [8/8] Generation...                                              │
│     ✓ Sauvegardé: tracking/gtm-tracking-plan.yml                     │
│                                                                      │
│ ┌────────────────────────────────────────────────────────────────┐   │
│ │  Pipeline terminé avec succès !                                │   │
│ │  Events: 8 standalone + 3 groupes                              │   │
│ │  Sélecteurs: 85/100 (A)                                        │   │
│ │  Modèle: Gemini 2.0 Flash                                      │   │
│ └────────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Les 8 étapes du pipeline :**

| Étape | Nom | Description |
|-------|-----|-------------|
| 1 | HTML Scan | Scanne les fichiers HTML et extrait les éléments interactifs |
| 2 | AI Analysis | Analyse IA pour identifier les events GA4 pertinents |
| 3 | Grouping | Consolide les events similaires (réduction tags GTM) |
| 4 | Selector Finder | Trouve des sélecteurs CSS robustes |
| 5 | YAML Build | Construit la configuration YAML |
| 6 | YAML Merge | Fusionne avec le YAML existant (si présent) |
| 7 | Validation | Vérifie la cohérence du plan |
| 8 | Generation | Écrit les fichiers finaux |

**Options utiles :**

```bash
# Prévisualiser sans sauvegarder
google-setup autoedit --dry-run

# Mode automatique (sans questions)
google-setup autoedit --auto --force

# Choisir le modèle IA
google-setup autoedit --ai=claude-haiku
google-setup autoedit --ai=gpt-4o-mini

# Exclure des dossiers
google-setup autoedit --exclude="temp,backup,old"

# Scanner un dossier différent
google-setup autoedit --source=/path/to/html/files
```

**Modèles IA disponibles :**

| Modèle | Clé API requise | Coût approx. |
|--------|-----------------|--------------|
| `gemini-flash` (défaut) | `GOOGLE_AI_API_KEY` | $0.000075/1k tokens |
| `claude-haiku` | `ANTHROPIC_API_KEY` | $0.001/1k tokens |
| `gpt-4o-mini` | `OPENAI_API_KEY` | $0.00015/1k tokens |

---

### Cas 2 : Nouveau projet — Déploiement complet

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

### Cas 3 : Workflow complet en 7 étapes (recommandé)

**Situation** : Vous avez un projet et voulez un tracking production-ready garanti.

```
┌────────────────────────────────────────────────────────────────────────┐
│  WORKFLOW TRACKING - 7 ÉTAPES                                          │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  1. init-tracking      → Créer tracking/ avec events + rules          │
│  2. event-setup        → Sélectionner les events à activer            │
│  3. gtm-config-setup   → Générer gtm-config.yaml                      │
│  4. generate-tracking  → Générer tracking.js                          │
│  5. html-layer         → Ajouter data-track au HTML                   │
│     OU /track-html-elements dans Claude Code                          │
│  6. deploy             → Déployer dans GTM                            │
│  7. verify-tracking    → Vérifier que tout est prêt                   │
│                                                                        │
│  ✅ Si verify-tracking passe → firebase deploy + publier GTM          │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

```bash
# 1. Initialiser le dossier tracking/
google-setup init-tracking

# 2. Sélectionner les events (interactif)
google-setup event-setup

# 3. Générer la config GTM
google-setup gtm-config-setup

# 4. Générer tracking.js
google-setup generate-tracking

# 5. Ajouter les attributs data-track
google-setup html-layer
# OU utiliser /track-html-elements dans Claude Code (plus intelligent)

# 6. Déployer dans GTM
google-setup deploy

# 7. VÉRIFIER que tout est prêt !
google-setup verify-tracking
```

```
🔍 Vérification Tracking - Production Ready
═══════════════════════════════════════════════════════

  Configuration
  ────────────────────────────────────────
  ✓ tracking-events.yaml
  ✓ tracking-rules.yaml
  ✓ GA4 Measurement ID
      G-A1B2C3D4E5
  ✓ GTM Container ID
      GTM-ABCD123
  ✓ Events activés
      12/56 events activés
  ✓ gtm-config.yaml
      12 tags, 12 triggers

  Fichiers
  ────────────────────────────────────────
  ✓ tracking.js généré
      → public/tracking.js (8KB)
  ✓ tracking.js dans dossier déployable
      → dossier: public

  Intégration HTML
  ────────────────────────────────────────
  ✓ GTM snippet dans HTML
      → index.html
  ✓ GTM ID correct dans snippet
  ✓ tracking.js importé
      → 5 fichier(s)
  ✓ Chemin tracking.js valide
  ✓ Attributs data-track
      28 attributs (12 uniques)

  Production Ready
  ────────────────────────────────────────
  ✓ Events ↔ data-track cohérents
      12 correspondances
  ✓ Pas d'IDs placeholder

═══════════════════════════════════════════════════════

  ✅ PRÊT POUR LA PRODUCTION !

  Prochaines étapes :
    1. google-setup deploy      → Déployer dans GTM
    2. firebase deploy          → Déployer le site
    3. Publier le container GTM → GTM > Submit > Publish

  Votre tracking fonctionnera à 100% après ces étapes.
```

**Fichiers générés :**

```
mon-projet/
├── public/
│   └── tracking.js          ← Script à servir (copié automatiquement)
└── tracking/
    ├── tracking-events.yaml ← Définition des events (56 possibles)
    ├── tracking-rules.yaml  ← Règles auto-détection (pour Claude Code)
    └── gtm-config.yaml      ← Config GTM (tags, triggers, variables)
```

**Ce que verify-tracking vérifie (14 points) :**

| Catégorie | Vérifications |
|-----------|---------------|
| Configuration | tracking-events.yaml, tracking-rules.yaml, GA4 ID valide, GTM ID valide, events activés, gtm-config.yaml |
| Fichiers | tracking.js existe, tracking.js dans dossier déployable |
| Intégration HTML | GTM snippet présent, GTM ID correct, tracking.js importé, chemin valide, data-track présents |
| Production Ready | Events ↔ data-track cohérents, pas d'IDs placeholder |

---

### Cas 4 : Synchroniser le code local avec GTM

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

### Cas 5 : Voir ce qui manque

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

### Cas 6 : Continuer un déploiement incomplet

**Situation** : Un déploiement a été interrompu ou vous voulez compléter ce qui manque.

```bash
# Mode interactif (confirmation à chaque étape)
google-setup continue -d "mon-site.fr"

# Mode automatique (tout d'un coup)
google-setup continue -d "mon-site.fr" --auto
```

---

### Cas 7 : Auditer plusieurs sites

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

### Cas 8 : Nettoyer GTM (supprimer les orphelins)

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
  🤖 AutoEdit - Générer tracking plan avec IA (autoedit)
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
| `autoedit` | Analyser HTML avec IA → tracking plan | `-p, --path` `-s, --source` `--step` `--ai` `--debug` `--dry-run` |
| `status` | Voir la checklist | `-d, --domain` |
| `continue` | Reprendre le déploiement | `-d, --domain` `--auto` |
| `sync` | Sync local → GTM | `-p, --path` `-d, --domain` `--auto` |
| `init-tracking` | [Étape 1/7] Créer tracking/ avec events + rules | `-p, --path` `--force` |
| `event-setup` | [Étape 2/7] Sélectionner les events à tracker | `-p, --path` |
| `gtm-config-setup` | [Étape 3/7] Générer gtm-config.yaml | `-p, --path` |
| `generate-tracking` | [Étape 4/7] Générer tracking.js | `-p, --path` |
| `html-layer` | [Étape 5/7] Ajouter data-track au HTML | `-p, --path` `-s, --source` |
| `deploy` | [Étape 6/7] Déployer dans GTM | `-d, --domain` `-n, --name` `--auto` |
| `verify-tracking` | [Étape 7/7] Vérifier setup prod-ready | `-p, --path` |
| `audit` | Auditer un/plusieurs sites | `-d, --domains` `-o, --output` |
| `clean` | Nettoyer GTM (supprimer orphelins) | `-d, --domain` `-p, --path` `--dry-run` `--force` |

### Template modulable

Le fichier `gtm-tracking-plan.yml` contient **tous les events possibles** avec un flag `enabled: true/false` :

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
│   ├── gtm-tracking-plan.yml  # Source de vérité (config)
│   ├── gtm-tracking-plan.md   # Documentation client
│   └── gtm-tracking.js        # Code JS auto-généré
├── components/
│   ├── gtm-head.html          # Script GTM pour <head>
│   └── gtm-body.html          # Noscript pour <body>
└── .google-setup.json         # Config locale du projet
```

### Le fichier gtm-tracking-plan.yml

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
    import { initAutoTracking, initScrollTracking } from './tracking/gtm-tracking.js';
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
| `autoedit` | Dans le dossier de votre projet web (ou avec `--source`) |
| `init-tracking` | Dans le dossier de votre projet web |
| `generate-tracking` | Dans le dossier de votre projet web |
| `sync` | Dans le dossier de votre projet web |
| `status`, `continue`, `deploy`, `audit` | N'importe où (spécifier le domaine) |

### Comment configurer l'IA pour autoedit ?

Ajoutez une clé API dans un fichier `.env` à la racine de votre projet :

```bash
# Option 1 : Google AI (Gemini) - recommandé, moins cher
GOOGLE_AI_API_KEY=AIza...

# Option 2 : Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-...

# Option 3 : OpenAI (GPT-4)
OPENAI_API_KEY=sk-...
```

L'outil utilise automatiquement la première clé disponible.

### Comment exécuter une seule étape du pipeline autoedit ?

```bash
# Exécuter seulement l'étape 1 (scan HTML)
google-setup autoedit --step=1

# L'état est sauvegardé dans tracking/debug/state.json
# Vous pouvez ensuite exécuter les étapes suivantes
google-setup autoedit --step=2
google-setup autoedit --step=3
# etc.
```

Utile pour :
- Débugger une étape spécifique
- Reprendre après une erreur
- Modifier manuellement les données intermédiaires

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

### Comment déployer le tracking avec Firebase ?

Le fichier `tracking/gtm-tracking.js` doit être accessible depuis le navigateur. Voici comment l'intégrer selon votre architecture :

**Option 1 : Site statique (Firebase Hosting)**

```bash
# Structure de votre projet
mon-projet/
├── public/                    # ou dist/
│   ├── index.html
│   └── tracking/
│       └── gtm-tracking.js    # ← Copier le fichier ici
└── tracking/
    ├── gtm-tracking-plan.yml
    └── gtm-tracking.js        # ← Source générée
```

```bash
# Copier avant déploiement
cp tracking/gtm-tracking.js public/tracking/
firebase deploy
```

**Option 2 : Framework (Vite, Next.js, Nuxt...)**

Importez directement depuis `tracking/` :

```javascript
// src/main.js ou app.js
import { initAutoTracking, trackCTA } from '../tracking/gtm-tracking.js';

initAutoTracking();

// Le bundler incluera le code dans votre build
```

**Option 3 : Firebase Functions (SSR)**

```bash
mon-projet/
├── functions/
│   └── src/
└── public/
    └── tracking/
        └── gtm-tracking.js    # ← Pour le client-side
```

Le tracking s'exécute côté client, donc le fichier doit être servi par Firebase Hosting (pas Functions).

**Conseil** : Ajoutez la copie dans votre script de build :

```json
// package.json
{
  "scripts": {
    "build": "vite build && cp tracking/gtm-tracking.js dist/tracking/"
  }
}
```

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

