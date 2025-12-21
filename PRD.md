# 📋 PRD - Google Setup CLI v2.0

**Product Requirements Document - API-First Architecture**

***

## 🎯 Executive Summary

### Product Name
**Google Setup CLI** - Outil d'audit et de déploiement automatique des outils Google Analytics via API

### Vision
Automatiser l'audit et le déploiement de Google Tag Manager, Google Analytics 4, Google Search Console, dataLayer custom et Hotjar sur n'importe quel site web en quelques secondes via les APIs Google officielles.

### Target Users
- Développeurs web gérant plusieurs sites
- Agences digitales
- Freelances développeurs
- Chefs de projet digital

### Success Metrics
- Réduction du temps d'audit : de 10s à < 2 secondes
- Réduction du temps de setup : de 2-3h à 3 minutes
- Score KPI moyen des sites audités > 80/100
- Zéro erreur de configuration
- 100% des outils détectés correctement

***

## 🎨 Product Overview

### Problem Statement
La configuration et l'audit de Google Tag Manager, GA4, Search Console et du tracking avancé est :
- **Chronophage** : 2-3 heures de configuration manuelle par site
- **Répétitive** : Mêmes étapes pour chaque nouveau projet
- **Source d'erreurs** : Oublis, mauvaise configuration, IDs incorrects
- **Difficile à auditer** : Pas de vision globale de ce qui est configuré
- **Lent avec scraping** : 10+ secondes par domaine avec Puppeteer

### Solution
Un CLI Node.js utilisant les **APIs Google officielles** qui :
1. **Audite** instantanément (< 2s) un domaine via APIs GTM/GA4/Search Console
2. **Calcule un score KPI** basé sur la complétude et qualité de la configuration
3. **Propose un déploiement automatique** des éléments manquants via APIs
4. **Génère les fichiers de code** prêts à intégrer dans le projet

### Key Differentiators
- ✅ **API-First** : Pas de scraping fragile, données officielles Google
- ✅ **Ultra-rapide** : Audit en < 2 secondes vs 10+ avec scraping
- ✅ **Données complètes** : Accès à toutes les balises/déclencheurs, même non déclenchées
- ✅ **Fiable** : 99% de fiabilité vs 70% avec scraping
- ✅ **Léger** : 50 MB RAM vs 300 MB avec Chrome headless

***

## ⚙️ Core Features

### Feature 1: Audit Multi-Domaines via APIs

**Description:**
Scanner un ou plusieurs domaines pour détecter et analyser la configuration des outils Google en interrogeant directement les APIs officielles.

**User Story:**
> En tant que développeur, je veux auditer mes domaines instantanément via APIs pour voir rapidement et de façon exhaustive ce qui est configuré et ce qui manque.

**Acceptance Criteria:**
- ✅ Détecte GTM via API Tag Manager (ID conteneur + toutes balises/déclencheurs/variables)
- ✅ Détecte GA4 via API Analytics Admin (ID mesure + événements + conversions + dimensions)
- ✅ Détecte dataLayer via analyse des variables GTM (type "Data Layer Variable")
- ✅ Vérifie Search Console via API (domaine vérifié + sitemap soumis)
- ✅ Détecte Hotjar via fetch HTML léger (pas de Chrome) ou GTM API
- ✅ Calcule un score KPI global (/100) avec grades A-F
- ✅ Génère un rapport JSON + affichage console formaté
- ✅ Sauvegarde le rapport dans `./reports/audit-{domain}-{date}.json`
- ✅ Support de plusieurs domaines en parallèle (5 max simultanés)
- ✅ Temps d'audit : < 2 secondes par domaine

**Technical Requirements:**

```javascript
// Détection via APIs Google (méthode primaire)
async function auditDomain(domain, credentials) {
  const { gtmAccountId, ga4AccountId } = credentials;
  
  // 1. GTM via API Tag Manager
  const gtmData = await auditGTMViaAPI(gtmAccountId, domain);
  
  // 2. GA4 via API Analytics Admin
  const ga4Data = await auditGA4ViaAPI(ga4AccountId, domain);
  
  // 3. DataLayer via GTM variables
  const dataLayerData = await detectDataLayerViaGTM(gtmData.containerId);
  
  // 4. Search Console via API
  const scData = await auditSearchConsoleAPI(domain);
  
  // 5. Hotjar via fetch HTML léger
  const hotjarData = await detectHotjarViaHTML(domain);
  
  return { gtm: gtmData, ga4: ga4Data, dataLayer: dataLayerData, searchConsole: scData, hotjar: hotjarData };
}

// Fallback si pas d'accès API (détection légère)
async function auditDomainLightweight(domain) {
  const html = await fetch(`https://${domain}`).then(r => r.text());
  
  return {
    gtm: detectGTMFromHTML(html),
    ga4: detectGA4FromHTML(html),
    hotjar: detectHotjarFromHTML(html),
    limitedData: true,
    message: 'Provide API credentials for full audit'
  };
}
```

**API Calls Required:**

| API | Endpoint | Purpose |
|---|---|---|
| Tag Manager | `GET /accounts/{accountId}/containers` | Liste conteneurs GTM |
| Tag Manager | `GET /workspaces/{workspaceId}/tags` | Liste balises |
| Tag Manager | `GET /workspaces/{workspaceId}/triggers` | Liste déclencheurs |
| Tag Manager | `GET /workspaces/{workspaceId}/variables` | Liste variables |
| Analytics Admin | `GET /accounts/{accountId}/properties` | Liste propriétés GA4 |
| Analytics Admin | `GET /properties/{propertyId}/dataStreams` | Liste flux de données |
| Analytics Admin | `GET /properties/{propertyId}/customEvents` | Liste événements custom |
| Analytics Admin | `GET /properties/{propertyId}/conversionEvents` | Liste conversions |
| Search Console | `GET /sites` | Liste sites vérifiés |
| Search Console | `GET /sites/{siteUrl}/sitemaps` | Liste sitemaps |

***

### Feature 2: Calcul de KPI

**Description:**
Calculer un score de 0 à 100 pour chaque domaine basé sur la complétude et qualité de la configuration détectée via APIs.

**User Story:**
> En tant que chef de projet, je veux un score simple et fiable pour évaluer rapidement la maturité analytics de mes sites.

**Acceptance Criteria:**
- ✅ Score global calculé avec pondération :
  - GTM : 20%
  - GA4 : 30%
  - DataLayer : 30%
  - Search Console : 15%
  - Hotjar : 5%
- ✅ Grades attribués : A+ (90-100), A (80-89), B (70-79), C (60-69), D (40-59), F (0-39)
- ✅ Recommandations générées automatiquement avec priorités (Critique/Important/Moyen)
- ✅ Gain de points estimé pour chaque recommandation
- ✅ Score basé sur données exhaustives des APIs (pas de données partielles du scraping)

**KPI Calculation Logic:**

```javascript
function calculateKPI(auditData) {
  const scores = {
    gtm: calculateGTMScore(auditData.gtm),
    ga4: calculateGA4Score(auditData.ga4),
    dataLayer: calculateDataLayerScore(auditData.dataLayer),
    searchConsole: calculateSearchConsoleScore(auditData.searchConsole),
    hotjar: calculateHotjarScore(auditData.hotjar)
  };
  
  const overallScore = (
    scores.gtm * 0.20 +
    scores.ga4 * 0.30 +
    scores.dataLayer * 0.30 +
    scores.searchConsole * 0.15 +
    scores.hotjar * 0.05
  );
  
  return {
    scores,
    overallScore: Math.round(overallScore),
    grade: getGrade(overallScore),
    recommendations: generateRecommendations(scores, auditData)
  };
}

// GTM Score (max 100)
function calculateGTMScore(gtmData) {
  if (!gtmData.installed) return 0;
  
  let score = 50; // Base : GTM installé
  
  // +10 si balise GA4 présente
  if (gtmData.tags.some(t => t.type === 'gaawc')) score += 10;
  
  // +10 si >3 déclencheurs custom
  const customTriggers = gtmData.triggers.filter(t => 
    t.type === 'CUSTOM_EVENT' || t.type === 'FORM_SUBMISSION'
  );
  if (customTriggers.length > 3) score += 10;
  
  // +15 si >5 variables dataLayer
  const dlVars = gtmData.variables.filter(v => v.type === 'v');
  if (dlVars.length > 5) score += 15;
  
  // +15 si >3 balises événements GA4
  const eventTags = gtmData.tags.filter(t => t.type === 'gaawe');
  if (eventTags.length > 3) score += 15;
  
  return Math.min(score, 100);
}

// GA4 Score (max 100)
function calculateGA4Score(ga4Data) {
  if (!ga4Data.installed) return 0;
  
  let score = 40; // Base : GA4 installé
  
  // +15 par événement custom (max 45)
  const customEventsScore = Math.min(ga4Data.customEvents.length * 15, 45);
  score += customEventsScore;
  
  // +15 si >1 conversion configurée
  if (ga4Data.conversions.length > 0) score += 15;
  
  return Math.min(score, 100);
}

// DataLayer Score (max 100)
function calculateDataLayerScore(dlData) {
  if (!dlData.installed) return 0;
  
  let score = 30; // Base : variables DL déclarées dans GTM
  
  // +20 par variable custom (max 60)
  const customVarsScore = Math.min(dlData.variables.length * 10, 60);
  score += customVarsScore;
  
  // +10 si >3 déclencheurs custom events
  if (dlData.customEventTriggers > 3) score += 10;
  
  return Math.min(score, 100);
}

// Search Console Score (max 100)
function calculateSearchConsoleScore(scData) {
  if (!scData.verified) return 0;
  
  let score = 50; // Base : domaine vérifié
  
  // +50 si sitemap soumis et valide
  if (scData.sitemapSubmitted && scData.sitemapStatus === 'success') {
    score += 50;
  }
  
  return score;
}

// Hotjar Score (max 100)
function calculateHotjarScore(hotjarData) {
  return hotjarData.installed ? 100 : 0;
}

// Grade attribution
function getGrade(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

// Recommandations automatiques
function generateRecommendations(scores, auditData) {
  const recommendations = [];
  
  // GTM
  if (scores.gtm < 80) {
    if (!auditData.gtm.tags.some(t => t.type === 'gaawc')) {
      recommendations.push({
        priority: 'critical',
        category: 'gtm',
        message: 'Aucune balise GA4 configurée dans GTM',
        impact: 10,
        action: 'deploy_ga4_tag'
      });
    }
    if (auditData.gtm.variables.filter(v => v.type === 'v').length < 5) {
      recommendations.push({
        priority: 'high',
        category: 'gtm',
        message: 'Variables dataLayer insuffisantes (< 5)',
        impact: 15,
        action: 'deploy_datalayer_variables'
      });
    }
  }
  
  // GA4
  if (scores.ga4 < 80) {
    if (auditData.ga4.customEvents.length === 0) {
      recommendations.push({
        priority: 'critical',
        category: 'ga4',
        message: 'Aucun événement custom configuré',
        impact: 30,
        action: 'deploy_custom_events'
      });
    }
    if (auditData.ga4.conversions.length === 0) {
      recommendations.push({
        priority: 'high',
        category: 'ga4',
        message: 'Aucune conversion marquée - Impossible de mesurer les objectifs',
        impact: 15,
        action: 'mark_conversions'
      });
    }
  }
  
  // DataLayer
  if (scores.dataLayer < 50) {
    recommendations.push({
      priority: 'critical',
      category: 'datalayer',
      message: 'DataLayer custom non configuré - Perte de données comportementales',
      impact: 30,
      action: 'deploy_datalayer_complete'
    });
  }
  
  // Search Console
  if (scores.searchConsole === 0) {
    recommendations.push({
      priority: 'high',
      category: 'search_console',
      message: 'Search Console non vérifié - Pas de visibilité sur SEO',
      impact: 15,
      action: 'verify_search_console'
    });
  }
  
  // Hotjar
  if (scores.hotjar === 0) {
    recommendations.push({
      priority: 'medium',
      category: 'hotjar',
      message: 'Hotjar non installé - Pas de heatmaps ni enregistrements',
      impact: 5,
      action: 'deploy_hotjar'
    });
  }
  
  return recommendations.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}
```

***

### Feature 3: Déploiement Automatique via APIs

**Description:**
Déployer automatiquement les éléments manquants détectés lors de l'audit en utilisant les APIs Google officielles.

**User Story:**
> En tant que développeur, je veux déployer automatiquement la configuration GTM/GA4/Search Console sur un nouveau site sans manipulation manuelle.

**Acceptance Criteria:**
- ✅ Création automatique propriété GA4 via API Analytics Admin
- ✅ Création automatique conteneur GTM via API Tag Manager
- ✅ Import de template GTM avec remplacement dynamique des IDs
- ✅ Création de toutes les balises/déclencheurs/variables via API
- ✅ Publication automatique de la version GTM
- ✅ Génération du fichier `tracking.js` avec événements dataLayer
- ✅ Génération des fichiers GTM PostHTML (`gtm-head.html`, `gtm-body.html`)
- ✅ Configuration Search Console (ajout domaine + sitemap)
- ✅ Génération du code Hotjar (fichier HTML ou balise GTM)
- ✅ Sauvegarde de la config dans `.google-setup.json`
- ✅ Temps de déploiement total : < 3 minutes

**Deployment Flow:**

```
┌─────────────────────────────────────────────────┐
│ User lance:                                      │
│ google-setup deploy --domain=example.com --auto │
└─────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│ 1. Audit rapide (< 2s)                          │
│    Détecte ce qui manque                        │
└─────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│ 2. GA4 manquant?                                │
│    → API Analytics Admin:                       │
│      • Créer propriété                          │
│      • Créer flux de données web                │
│      • Récupérer ID mesure (G-XXXXXXXXX)        │
└─────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│ 3. GTM manquant?                                │
│    → API Tag Manager:                           │
│      • Créer conteneur                          │
│      • Importer template JSON                   │
│      • Remplacer {{GA4_MEASUREMENT_ID}}         │
│      • Créer balises/déclencheurs/variables     │
│      • Publier version v1.0                     │
│      • Générer gtm-head.html + gtm-body.html    │
└─────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│ 4. DataLayer manquant?                          │
│    → Génération locale:                         │
│      • Générer tracking.js depuis template      │
│      • Créer déclencheurs custom dans GTM       │
│      • Créer variables DL dans GTM              │
│      • Créer balises événements dans GTM        │
└─────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│ 5. Search Console non vérifié?                  │
│    → API Search Console:                        │
│      • Ajouter site                             │
│      • Générer token de vérification META       │
│      • Attendre vérification manuelle           │
│      • Soumettre sitemap.xml                    │
└─────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│ 6. Hotjar manquant?                             │
│    → Génération locale:                         │
│      • Générer code Hotjar HTML                 │
│      • OU créer balise HTML custom dans GTM     │
└─────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│ 7. Sauvegarder config                           │
│    → Créer .google-setup.json:                  │
│      • IDs GA4/GTM                              │
│      • Timestamps                               │
│      • Score KPI final                          │
└─────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│ 8. Afficher rapport                             │
│    • Nouveau score KPI                          │
│    • Fichiers générés                           │
│    • Prochaines étapes manuelles                │
└─────────────────────────────────────────────────┘
```

**Implementation Example:**

```javascript
// deployers/ga4-deployer.js
async function deployGA4(domain, projectName, accountId) {
  const analyticsAdmin = google.analyticsadmin('v1alpha');
  
  console.log('📊 Création propriété GA4...');
  
  // 1. Créer la propriété
  const property = await analyticsAdmin.properties.create({
    requestBody: {
      parent: `accounts/${accountId}`,
      displayName: projectName,
      timeZone: 'Europe/Paris',
      currencyCode: 'EUR',
      industryCategory: 'OTHER'
    }
  });
  
  console.log(`   ✓ Propriété créée: ${property.data.name}`);
  
  // 2. Créer le flux de données web
  const dataStream = await analyticsAdmin.properties.dataStreams.create({
    parent: property.data.name,
    requestBody: {
      type: 'WEB_DATA_STREAM',
      displayName: `${projectName} - Web`,
      webStreamData: {
        defaultUri: `https://${domain}`,
        measurementId: '' // Généré automatiquement
      }
    }
  });
  
  const measurementId = dataStream.data.webStreamData.measurementId;
  console.log(`   ✓ Flux créé: ${measurementId}`);
  
  return {
    propertyId: property.data.name.split('/')[1],
    measurementId,
    dataStreamId: dataStream.data.name.split('/')[3]
  };
}

// deployers/gtm-deployer.js
async function deployGTM(domain, projectName, accountId, ga4MeasurementId, template) {
  const tagmanager = google.tagmanager('v2');
  
  console.log('🏷️  Création conteneur GTM...');
  
  // 1. Créer le conteneur
  const container = await tagmanager.accounts.containers.create({
    parent: `accounts/${accountId}`,
    requestBody: {
      name: projectName,
      usageContext: ['WEB']
    }
  });
  
  const containerId = container.data.publicId;
  console.log(`   ✓ Conteneur créé: ${containerId}`);
  
  // 2. Charger et parser le template
  const templateJson = JSON.parse(readFileSync(template, 'utf8'));
  
  // 3. Remplacer les variables dynamiques
  const processedTemplate = replaceTemplateVariables(templateJson, {
    '{{GA4_MEASUREMENT_ID}}': ga4MeasurementId,
    '{{DOMAIN}}': domain,
    '{{PROJECT_NAME}}': projectName
  });
  
  // 4. Importer le template
  console.log('   ⏳ Import du template...');
  await tagmanager.accounts.containers.versions.import({
    parent: container.data.path,
    requestBody: {
      containerVersion: processedTemplate.containerVersion
    }
  });
  
  console.log(`   ✓ Template importé (${processedTemplate.containerVersion.tag.length} balises)`);
  
  // 5. Publier la version
  const workspace = await tagmanager.accounts.containers.workspaces.get({
    path: `${container.data.path}/workspaces/default`
  });
  
  const version = await tagmanager.accounts.containers.versions.publish({
    path: `${container.data.path}/versions/live`,
    requestBody: {
      name: 'v1.0 - Initial setup',
      description: `Setup automatique via google-setup-cli`
    }
  });
  
  console.log(`   ✓ Version v1.0 publiée`);
  
  // 6. Générer les fichiers code
  generateGTMFiles(containerId);
  
  return {
    containerId,
    containerPath: container.data.path,
    versionNumber: 1
  };
}

// deployers/datalayer-deployer.js
async function deployDataLayer(containerId, events) {
  console.log('📦 Déploiement dataLayer...');
  
  // 1. Générer tracking.js
  const trackingCode = generateTrackingJS(events);
  writeFileSync('./src/tracking.js', trackingCode);
  console.log('   ✓ tracking.js généré');
  
  // 2. Créer déclencheurs custom dans GTM
  const tagmanager = google.tagmanager('v2');
  const workspacePath = `accounts/${accountId}/containers/${containerId}/workspaces/default`;
  
  for (const event of events) {
    await tagmanager.accounts.containers.workspaces.triggers.create({
      parent: workspacePath,
      requestBody: {
        name: `Event - ${event.name}`,
        type: 'CUSTOM_EVENT',
        customEventFilter: [{
          type: 'EQUALS',
          parameter: [
            { type: 'TEMPLATE', key: 'arg0', value: '{{_event}}' },
            { type: 'TEMPLATE', key: 'arg1', value: event.eventName }
          ]
        }]
      }
    });
  }
  
  console.log(`   ✓ ${events.length} déclencheurs créés`);
  
  // 3. Créer variables dataLayer
  const variables = ['cta_location', 'kit_power', 'user_type', 'lead_value'];
  for (const varName of variables) {
    await tagmanager.accounts.containers.workspaces.variables.create({
      parent: workspacePath,
      requestBody: {
        name: `DLV - ${varName}`,
        type: 'v',
        parameter: [
          { type: 'INTEGER', key: 'dataLayerVersion', value: '2' },
          { type: 'BOOLEAN', key: 'setDefaultValue', value: 'false' },
          { type: 'TEMPLATE', key: 'name', value: varName }
        ]
      }
    });
  }
  
  console.log(`   ✓ ${variables.length} variables créées`);
  
  return {
    eventsCreated: events.length,
    variablesCreated: variables.length
  };
}

// deployers/search-console-deployer.js
async function deploySearchConsole(domain) {
  console.log('🔍 Configuration Search Console...');
  
  const searchconsole = google.searchconsole('v1');
  
  // 1. Ajouter le site
  await searchconsole.sites.add({
    siteUrl: `sc-domain:${domain}`
  });
  
  console.log('   ✓ Site ajouté');
  
  // 2. Obtenir token de vérification
  const siteVerification = google.siteVerification('v1');
  const token = await siteVerification.webResource.getToken({
    requestBody: {
      site: {
        type: 'SITE',
        identifier: `https://${domain}`
      },
      verificationMethod: 'META'
    }
  });
  
  console.log('   ℹ  Token de vérification:');
  console.log(`   ${token.data.token}`);
  console.log('   → Ajoutez cette balise dans <head> puis relancez la commande');
  
  return {
    added: true,
    verified: false,
    verificationToken: token.data.token
  };
}
```

***

### Feature 4: CLI Interactif

**Description:**
Interface en ligne de commande interactive avec menu de navigation simplifié et prompts guidés.

**User Story:**
> En tant que user, je veux une interface guidée simple pour auditer et déployer sans mémoriser les commandes CLI.

**Acceptance Criteria:**
- ✅ Menu principal avec 2 options uniquement :
  - 🔍 Auditer un ou plusieurs domaines
  - 🚀 Déployer la configuration complète
  - ❌ Quitter
- ✅ Prompts interactifs pour saisir les domaines
- ✅ Prompts pour Account IDs Google si non configurés
- ✅ Barre de progression pour les opérations longues
- ✅ Affichage formaté avec couleurs et emojis (chalk + boxen)
- ✅ Confirmation avant actions critiques (déploiement, publication GTM)
- ✅ Support de Ctrl+C pour annuler à tout moment

**CLI Menu Structure:**

```
$ google-setup

   ____                   _        ____       _               
  / ___| ___   ___   __ _| | ___  / ___|  ___| |_ _   _ _ __  
 | |  _ / _ \ / _ \ / _` | |/ _ \ \___ \ / _ \ __| | | | '_ \ 
 | |_| | (_) | (_) | (_| | |  __/  ___) |  __/ |_| |_| | |_) |
  \____|\___/ \___/ \__, |_|\___| |____/ \___|\__|\__,_| .__/ 
                    |___/                               |_|    

🎯 Audit & Déploiement automatique Google Analytics

? Que voulez-vous faire ? (Use arrow keys)
❯ 🔍 Auditer un ou plusieurs domaines
  🚀 Déployer la configuration complète
  ❌ Quitter

─────────────────────────────────────────────────

[User sélectionne "Auditer"]

? Combien de domaines voulez-vous auditer ? 2

? Domaine 1 : elisun-toulouse.fr
? Domaine 2 : monsitesolaire.fr

🔍 Audit en cours...
   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 100% (2/2 domaines - 3.2s)

✅ Audit terminé ! Rapport : reports/audit-2025-12-20.json

? Voulez-vous déployer automatiquement les éléments manquants ? (o/n) o

🚀 Déploiement en cours...
   [1/2] elisun-toulouse.fr...
   [2/2] monsitesolaire.fr...

✅ Déploiement terminé !

? Retour au menu principal ? (o/n)
```

**Implementation:**

```javascript
// bin/cli.js
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';

async function interactiveMode() {
  console.clear();
  
  // Logo ASCII
  console.log(chalk.cyan(figlet.textSync('Google Setup', { font: 'Standard' })));
  console.log(chalk.gray('🎯 Audit & Déploiement automatique Google Analytics\n'));
  
  while (true) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Que voulez-vous faire ?',
        choices: [
          { name: '🔍 Auditer un ou plusieurs domaines', value: 'audit' },
          { name: '🚀 Déployer la configuration complète', value: 'deploy' },
          { name: '❌ Quitter', value: 'exit' }
        ]
      }
    ]);
    
    if (action === 'exit') {
      console.log(chalk.green('\n✨ À bientôt !\n'));
      process.exit(0);
    }
    
    if (action === 'audit') {
      await handleAudit();
    }
    
    if (action === 'deploy') {
      await handleDeploy();
    }
  }
}

async function handleAudit() {
  // Demander le nombre de domaines
  const { count } = await inquirer.prompt([
    {
      type: 'number',
      name: 'count',
      message: 'Combien de domaines voulez-vous auditer ?',
      default: 1,
      validate: (value) => value > 0 && value <= 10 || 'Entre 1 et 10 domaines'
    }
  ]);
  
  // Demander chaque domaine
  const domains = [];
  for (let i = 1; i <= count; i++) {
    const { domain } = await inquirer.prompt([
      {
        type: 'input',
        name: 'domain',
        message: `Domaine ${i} :`,
        validate: (value) => /^[a-z0-9\-\.]+\.[a-z]{2,}$/i.test(value) || 'Domaine invalide'
      }
    ]);
    domains.push(domain);
  }
  
  // Lancer l'audit
  const spinner = ora('Audit en cours...').start();
  
  const results = [];
  for (let i = 0; i < domains.length; i++) {
    spinner.text = `Audit en cours... (${i + 1}/${domains.length})`;
    const result = await auditDomain(domains[i], config);
    results.push(result);
  }
  
  spinner.succeed(`Audit terminé ! (${domains.length} domaines en ${results.totalTime}s)`);
  
  // Afficher les résultats
  for (const result of results) {
    displayAuditResult(result);
  }
  
  // Proposer le déploiement
  const { shouldDeploy } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldDeploy',
      message: 'Voulez-vous déployer automatiquement les éléments manquants ?',
      default: false
    }
  ]);
  
  if (shouldDeploy) {
    await handleDeployMultiple(results);
  }
}

function displayAuditResult(result) {
  const { domain, kpi } = result;
  
  const gradeColor = {
    'A+': chalk.green,
    'A': chalk.green,
    'B': chalk.yellow,
    'C': chalk.yellow,
    'D': chalk.red,
    'F': chalk.red
  }[kpi.grade];
  
  console.log('\n' + boxen(
    `${chalk.bold(domain)}\n\n` +
    `Score global : ${gradeColor(kpi.overallScore + '/100')} (${gradeColor(kpi.grade)})\n\n` +
    `${displayScores(result)}\n\n` +
    `${displayRecommendations(kpi.recommendations)}`,
    { padding: 1, borderColor: 'cyan', title: '📊 Rapport d\'audit', titleAlignment: 'center' }
  ));
}
```

***

### Feature 5: Templates Réutilisables

**Description:**
Exporter et importer des templates de configuration GTM pour réutilisation sur plusieurs projets.

**User Story:**
> En tant que développeur avec plusieurs clients, je veux sauvegarder ma config GTM optimale et la réutiliser sur tous mes projets en quelques secondes.

**Acceptance Criteria:**
- ✅ Export de conteneur GTM existant : `google-setup export --gtm-id=GTM-XXX --output=template.json`
- ✅ Templates pré-configurés inclus :
  - `gtm-minimal.json` : GA4 basique (pageviews)
  - `gtm-lead-gen.json` : GA4 + lead tracking (formulaires, CTA, téléphone)
  - `gtm-ecommerce.json` : GA4 + ecommerce tracking (add_to_cart, purchase)
- ✅ Variables dynamiques dans templates remplacées automatiquement :
  - `{{GA4_MEASUREMENT_ID}}` → ID GA4 réel
  - `{{DOMAIN}}` → Domaine du site
  - `{{PROJECT_NAME}}` → Nom du projet
- ✅ Support de templates custom créés par l'utilisateur

**Template Structure:**

```json
{
  "templateName": "Lead Generation Template",
  "templateVersion": "1.0.0",
  "description": "GA4 + tracking CTA, formulaires, appels téléphone",
  "variables": {
    "GA4_MEASUREMENT_ID": "{{GA4_MEASUREMENT_ID}}",
    "DOMAIN": "{{DOMAIN}}",
    "PROJECT_NAME": "{{PROJECT_NAME}}"
  },
  "containerVersion": {
    "tag": [
      {
        "name": "GA4 - Configuration - {{PROJECT_NAME}}",
        "type": "gaawc",
        "parameter": [
          {
            "type": "TEMPLATE",
            "key": "measurementId",
            "value": "{{GA4_MEASUREMENT_ID}}"
          }
        ],
        "firingTriggerId": ["2147479553"]
      },
      {
        "name": "GA4 - Event - CTA Click",
        "type": "gaawe",
        "parameter": [
          { "type": "TEMPLATE", "key": "eventName", "value": "clic_cta_devis" },
          { "type": "TEMPLATE", "key": "measurementId", "value": "{{GA4_MEASUREMENT_ID}}" }
        ],
        "firingTriggerId": ["3"]
      }
    ],
    "trigger": [
      {
        "triggerId": "2147479553",
        "name": "Initialization - All Pages",
        "type": "PAGEVIEW"
      },
      {
        "triggerId": "3",
        "name": "Event - clic_cta_devis",
        "type": "CUSTOM_EVENT",
        "customEventFilter": [
          {
            "type": "EQUALS",
            "parameter": [
              { "type": "TEMPLATE", "key": "arg0", "value": "{{_event}}" },
              { "type": "TEMPLATE", "key": "arg1", "value": "clic_cta_devis" }
            ]
          }
        ]
      }
    ],
    "variable": [
      {
        "variableId": "1",
        "name": "DLV - CTA Location",
        "type": "v",
        "parameter": [
          { "type": "INTEGER", "key": "dataLayerVersion", "value": "2" },
          { "type": "TEMPLATE", "key": "name", "value": "cta_location" }
        ]
      }
    ]
  }
}
```

**Template Replacement Logic:**

```javascript
// utils/template-parser.js
function replaceTemplateVariables(template, variables) {
  const templateStr = JSON.stringify(template);
  
  let processedStr = templateStr;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    processedStr = processedStr.replace(regex, value);
  }
  
  return JSON.parse(processedStr);
}

// Example usage
const template = JSON.parse(readFileSync('./templates/gtm-lead-gen.json'));
const processed = replaceTemplateVariables(template, {
  'GA4_MEASUREMENT_ID': 'G-ABC123DEF',
  'DOMAIN': 'example.com',
  'PROJECT_NAME': 'Example Site'
});
```

***

## 🏗️ Technical Architecture

### Tech Stack

**Core:**
- **Runtime:** Node.js 18+ (ES Modules)
- **Language:** JavaScript (ES2022)
- **CLI Framework:** Commander.js 11+ + Inquirer.js 9+
- **HTTP Client:** Native `fetch()` (Node 18+)
- **File System:** `fs/promises`

**Google APIs:**
- `googleapis` v126+ - Unified Google APIs client
  - Tag Manager API v2
  - Analytics Admin API v1alpha
  - Search Console API v3
  - Site Verification API v1

**CLI UX:**
- `chalk` v5+ - Couleurs terminal
- `ora` v7+ - Spinners
- `cli-progress` v3+ - Barres de progression
- `boxen` v7+ - Encadrés
- `figlet` v1.7+ - ASCII art logo
- `inquirer` v9+ - Prompts interactifs

**Utilities:**
- `cheerio` v1+ - Parse HTML léger (fallback detection)
- `dotenv` v16+ - Variables d'environnement

### Project Structure

```
google-setup/
├── bin/
│   └── cli.js                          # Point d'entrée CLI
│
├── src/
│   ├── commands/
│   │   ├── audit.js                    # Commande audit
│   │   ├── deploy.js                   # Commande deploy
│   │   ├── export.js                   # Commande export template
│   │   └── init.js                     # Commande init config
│   │
│   ├── detectors/
│   │   ├── gtm-detector-api.js         # Détection GTM via API
│   │   ├── gtm-detector-html.js        # Fallback GTM via HTML
│   │   ├── ga4-detector-api.js         # Détection GA4 via API
│   │   ├── ga4-detector-html.js        # Fallback GA4 via HTML
│   │   ├── datalayer-detector.js       # Détection dataLayer (GTM vars)
│   │   ├── hotjar-detector.js          # Détection Hotjar via HTML/GTM
│   │   └── search-console-checker.js   # Check Search Console via API
│   │
│   ├── deployers/
│   │   ├── ga4-deployer.js             # Déploiement GA4 via API
│   │   ├── gtm-deployer.js             # Déploiement GTM via API
│   │   ├── datalayer-deployer.js       # Génération tracking.js
│   │   ├── search-console-deployer.js  # Setup Search Console via API
│   │   └── hotjar-deployer.js          # Setup Hotjar
│   │
│   ├── kpi/
│   │   ├── calculator.js               # Calcul des scores
│   │   └── reporter.js                 # Génération rapports
│   │
│   ├── utils/
│   │   ├── api-client.js               # Client API Google unifié
│   │   ├── auth.js                     # OAuth2 authentication
│   │   ├── file-generator.js           # Génération fichiers code
│   │   ├── template-parser.js          # Parse et remplace variables
│   │   ├── logger.js                   # Logger formaté
│   │   └── config-manager.js           # Gestion config locale
│   │
│   └── templates/
│       ├── gtm-minimal.json            # Template GTM minimal
│       ├── gtm-lead-gen.json           # Template lead generation
│       ├── gtm-ecommerce.json          # Template ecommerce
│       ├── tracking.js.template        # Template dataLayer JS
│       └── hotjar.html.template        # Template Hotjar HTML
│
├── config/
│   ├── .google-credentials.json        # Google OAuth credentials (gitignored)
│   └── .google-setup-config.json       # Config user (Account IDs)
│
├── reports/                            # Rapports d'audit JSON
│
├── tests/
│   ├── detectors.test.js
│   ├── deployers.test.js
│   ├── kpi.test.js
│   └── templates.test.js
│
├── package.json
├── README.md
├── LICENSE
└── .gitignore
```

***

## 📊 Data Models

### Audit Result Schema

```json
{
  "audit": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "version": "2.0.0",
    "date": "2025-12-20T02:53:00Z",
    "method": "api",
    "executionTime": 1.8,
    "domains": [
      {
        "url": "https://www.example.com",
        "domain": "example.com",
        "status": "success",
        "auditTime": 1.8,
        
        "gtm": {
          "installed": true,
          "method": "api",
          "containerId": "GTM-XXXXXXX",
          "containerName": "Example Site",
          "accountId": "6329175537",
          "containerPath": "accounts/6329175537/containers/12345",
          "workspacePath": "accounts/6329175537/containers/12345/workspaces/1",
          "tags": [
            {
              "tagId": "1",
              "name": "GA4 - Configuration",
              "type": "gaawc",
              "active": true,
              "firingTriggerId": ["2147479553"],
              "parameters": {
                "measurementId": "G-XXXXXXXXX"
              }
            },
            {
              "tagId": "2",
              "name": "GA4 - Event - CTA Click",
              "type": "gaawe",
              "active": true,
              "firingTriggerId": ["3"]
            }
          ],
          "triggers": [
            {
              "triggerId": "2147479553",
              "name": "Initialization - All Pages",
              "type": "PAGEVIEW"
            },
            {
              "triggerId": "3",
              "name": "Event - clic_cta_devis",
              "type": "CUSTOM_EVENT"
            }
          ],
          "variables": [
            {
              "variableId": "1",
              "name": "DLV - CTA Location",
              "type": "v",
              "dataLayerVariable": "cta_location"
            }
          ],
          "tagsCount": 2,
          "triggersCount": 2,
          "variablesCount": 1,
          "score": 85.0
        },
        
        "ga4": {
          "installed": true,
          "method": "api",
          "measurementId": "G-XXXXXXXXX",
          "propertyId": "123456789",
          "propertyName": "Example Site",
          "dataStreamId": "987654321",
          "dataStreamName": "Web Stream",
          "defaultUri": "https://www.example.com",
          "customEvents": [
            {
              "eventName": "clic_cta_devis",
              "createdTime": "2025-12-19T10:00:00Z"
            },
            {
              "eventName": "lead_form_submit",
              "createdTime": "2025-12-19T10:05:00Z"
            }
          ],
          "conversions": [
            {
              "eventName": "lead_form_submit",
              "countingMethod": "ONCE_PER_SESSION"
            }
          ],
          "customDimensions": [],
          "customMetrics": [],
          "customEventsCount": 2,
          "conversionsCount": 1,
          "score": 75.0
        },
        
        "dataLayer": {
          "installed": true,
          "method": "gtm_variables",
          "variables": [
            "cta_location",
            "kit_power",
            "user_type",
            "lead_value"
          ],
          "customEventTriggers": 3,
          "variablesCount": 4,
          "score": 80.0
        },
        
        "searchConsole": {
          "verified": true,
          "method": "api",
          "siteUrl": "sc-domain:example.com",
          "permissionLevel": "siteOwner",
          "sitemapSubmitted": true,
          "sitemaps": [
            {
              "path": "https://www.example.com/sitemap.xml",
              "lastSubmitted": "2025-12-15T00:00:00Z",
              "status": "success",
              "errors": 0,
              "warnings": 0
            }
          ],
          "score": 100.0
        },
        
        "hotjar": {
          "installed": true,
          "method": "html",
          "siteId": "3456789",
          "detectedVia": "gtm_tag",
          "score": 100.0
        },
        
        "kpi": {
          "overallScore": 84.5,
          "grade": "A",
          "breakdown": {
            "gtm": { "score": 85.0, "weight": 0.20, "contribution": 17.0 },
            "ga4": { "score": 75.0, "weight": 0.30, "contribution": 22.5 },
            "dataLayer": { "score": 80.0, "weight": 0.30, "contribution": 24.0 },
            "searchConsole": { "score": 100.0, "weight": 0.15, "contribution": 15.0 },
            "hotjar": { "score": 100.0, "weight": 0.05, "contribution": 5.0 }
          },
          "recommendations": [
            {
              "priority": "high",
              "category": "ga4",
              "message": "Augmenter le nombre d'événements custom (seulement 2 détectés)",
              "impact": 10,
              "targetScore": 85.0,
              "action": "deploy_more_custom_events"
            }
          ]
        }
      }
    ],
    "summary": {
      "totalDomains": 1,
      "successfulAudits": 1,
      "failedAudits": 0,
      "averageScore": 84.5,
      "averageGrade": "A",
      "totalExecutionTime": 1.8
    }
  }
}
```

### Deployment Config Schema

```json
{
  "deployment": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "version": "2.0.0",
    "date": "2025-12-20T03:00:00Z",
    "domain": "example.com",
    "projectName": "Example Site",
    "executionTime": 165.3,
    
    "ga4": {
      "action": "created",
      "measurementId": "G-NEWID123",
      "propertyId": "987654321",
      "propertyName": "Example Site",
      "dataStreamId": "123456789",
      "accountId": "123456789",
      "timeZone": "Europe/Paris",
      "currencyCode": "EUR"
    },
    
    "gtm": {
      "action": "created",
      "containerId": "GTM-NEWIDXYZ",
      "containerName": "Example Site",
      "accountId": "6329175537",
      "containerPath": "accounts/6329175537/containers/67890",
      "templateUsed": "gtm-lead-gen.json",
      "tagsCreated": 8,
      "triggersCreated": 6,
      "variablesCreated": 5,
      "versionPublished": true,
      "versionNumber": 1,
      "versionName": "v1.0 - Initial setup"
    },
    
    "dataLayer": {
      "action": "deployed",
      "eventsGenerated": [
        "clic_cta_devis",
        "selection_kit",
        "lead_form_submit",
        "contact_phone_click",
        "contact_email_click"
      ],
      "variablesGenerated": [
        "cta_location",
        "kit_power",
        "user_type",
        "lead_value"
      ],
      "fileGenerated": "src/tracking.js",
      "fileSize": 4567
    },
    
    "searchConsole": {
      "action": "added",
      "siteUrl": "sc-domain:example.com",
      "verified": false,
      "verificationMethod": "META",
      "verificationToken": "<meta name=\"google-site-verification\" content=\"ABC123XYZ\" />",
      "sitemapSubmitted": false,
      "note": "Manual verification required"
    },
    
    "hotjar": {
      "action": "configured",
      "siteId": "4567890",
      "method": "gtm_tag",
      "tagCreated": true
    },
    
    "files": [
      {
        "path": "components/gtm-head.html",
        "size": 523,
        "type": "html"
      },
      {
        "path": "components/gtm-body.html",
        "size": 189,
        "type": "html"
      },
      {
        "path": "src/tracking.js",
        "size": 4567,
        "type": "javascript"
      },
      {
        "path": ".google-setup.json",
        "size": 892,
        "type": "json"
      }
    ],
    
    "postDeployment": {
      "scoreImprovement": {
        "before": 29.0,
        "after": 92.0,
        "delta": 63.0
      },
      "gradeImprovement": {
        "before": "D",
        "after": "A+"
      }
    }
  }
}
```

### Local Config Schema (.google-setup.json)

```json
{
  "version": "2.0.0",
  "domain": "example.com",
  "projectName": "Example Site",
  "createdAt": "2025-12-20T03:00:00Z",
  "lastAudit": "2025-12-20T02:53:00Z",
  "lastDeployment": "2025-12-20T03:00:00Z",
  
  "credentials": {
    "gtmAccountId": "6329175537",
    "ga4AccountId": "123456789"
  },
  
  "ga4": {
    "measurementId": "G-NEWID123",
    "propertyId": "987654321",
    "dataStreamId": "123456789"
  },
  
  "gtm": {
    "containerId": "GTM-NEWIDXYZ",
    "containerPath": "accounts/6329175537/containers/67890",
    "currentVersion": 1
  },
  
  "searchConsole": {
    "siteUrl": "sc-domain:example.com",
    "verified": true,
    "verifiedAt": "2025-12-20T04:00:00Z"
  },
  
  "hotjar": {
    "siteId": "4567890"
  },
  
  "kpi": {
    "currentScore": 92.0,
    "currentGrade": "A+",
    "history": [
      {
        "date": "2025-12-19T10:00:00Z",
        "score": 29.0,
        "grade": "D"
      },
      {
        "date": "2025-12-20T03:00:00Z",
        "score": 92.0,
        "grade": "A+"
      }
    ]
  }
}
```

### Global Config Schema (.google-setup-config.json)

```json
{
  "version": "2.0.0",
  "user": {
    "name": "John Doe",
    "email": "john@example.com"
  },
  "credentials": {
    "gtmAccountId": "6329175537",
    "ga4AccountId": "123456789",
    "credentialsPath": "~/.google-credentials.json"
  },
  "defaults": {
    "timeZone": "Europe/Paris",
    "currencyCode": "EUR",
    "template": "gtm-lead-gen.json"
  },
  "preferences": {
    "autoSaveReports": true,
    "reportsDirectory": "./reports",
    "verboseLogging": false
  }
}
```

***

## 🔌 API Integration Specifications

### Google APIs Required

**1. Tag Manager API v2**
- **Scopes:** `https://www.googleapis.com/auth/tagmanager.edit.containers`
- **Rate Limits:** 100 requests/minute

**2. Analytics Admin API v1alpha**
- **Scopes:** `https://www.googleapis.com/auth/analytics.edit`
- **Rate Limits:** 50 requests/minute

**3. Search Console API v3**
- **Scopes:** `https://www.googleapis.com/auth/webmasters`
- **Rate Limits:** 600 requests/minute

**4. Site Verification API v1**
- **Scopes:** `https://www.googleapis.com/auth/siteverification`
- **Rate Limits:** 100 requests/minute

### Authentication Flow

```javascript
// utils/auth.js
import { google } from 'googleapis';
import { readFileSync } from 'fs/promises';

async function getAuthClient() {
  const credentials = JSON.parse(
    await readFileSync('~/.google-credentials.json', 'utf8')
  );
  
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/tagmanager.edit.containers',
      'https://www.googleapis.com/auth/analytics.edit',
      'https://www.googleapis.com/auth/webmasters',
      'https://www.googleapis.com/auth/siteverification'
    ]
  });
  
  return await auth.getClient();
}

// Usage dans les détecteurs/déployers
const authClient = await getAuthClient();
google.options({ auth: authClient });
```

### API Call Examples

**Tag Manager API:**

```javascript
// Liste des conteneurs
GET https://tagmanager.googleapis.com/tagmanager/v2/accounts/{accountId}/containers

// Créer un conteneur
POST https://tagmanager.googleapis.com/tagmanager/v2/accounts/{accountId}/containers
Body: {
  "name": "Example Site",
  "usageContext": ["WEB"]
}

// Lister les balises
GET https://tagmanager.googleapis.com/tagmanager/v2/accounts/{accountId}/containers/{containerId}/workspaces/{workspaceId}/tags

// Créer une balise
POST https://tagmanager.googleapis.com/tagmanager/v2/accounts/{accountId}/containers/{containerId}/workspaces/{workspaceId}/tags
Body: {
  "name": "GA4 - Configuration",
  "type": "gaawc",
  "parameter": [
    {
      "type": "TEMPLATE",
      "key": "measurementId",
      "value": "G-XXXXXXXXX"
    }
  ],
  "firingTriggerId": ["2147479553"]
}

// Publier une version
POST https://tagmanager.googleapis.com/tagmanager/v2/accounts/{accountId}/containers/{containerId}/versions:publish
Body: {
  "versionName": "v1.0",
  "versionDescription": "Initial setup"
}
```

**Analytics Admin API:**

```javascript
// Créer une propriété GA4
POST https://analyticsadmin.googleapis.com/v1alpha/accounts/{accountId}/properties
Body: {
  "displayName": "Example Site",
  "timeZone": "Europe/Paris",
  "currencyCode": "EUR",
  "industryCategory": "OTHER"
}

// Créer un flux de données
POST https://analyticsadmin.googleapis.com/v1alpha/properties/{propertyId}/dataStreams
Body: {
  "type": "WEB_DATA_STREAM",
  "displayName": "Web Stream",
  "webStreamData": {
    "defaultUri": "https://www.example.com"
  }
}

// Lister les événements custom
GET https://analyticsadmin.googleapis.com/v1alpha/properties/{propertyId}/customEvents

// Créer une conversion
POST https://analyticsadmin.googleapis.com/v1alpha/properties/{propertyId}/conversionEvents
Body: {
  "eventName": "lead_form_submit",
  "countingMethod": "ONCE_PER_SESSION"
}
```

**Search Console API:**

```javascript
// Lister les sites vérifiés
GET https://www.googleapis.com/webmasters/v3/sites

// Ajouter un site
PUT https://www.googleapis.com/webmasters/v3/sites/{siteUrl}

// Lister les sitemaps
GET https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/sitemaps

// Soumettre un sitemap
PUT https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}
```

**Site Verification API:**

```javascript
// Obtenir un token de vérification
POST https://www.googleapis.com/siteVerification/v1/token
Body: {
  "site": {
    "type": "SITE",
    "identifier": "https://www.example.com"
  },
  "verificationMethod": "META"
}

// Vérifier le site
POST https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=META
Body: {
  "site": {
    "type": "SITE",
    "identifier": "https://www.example.com"
  }
}
```

***

## 🎨 User Interface Specifications

### CLI Command Syntax

```bash
# Mode interactif (recommandé)
google-setup

# Initialisation (première utilisation)
google-setup init

# Audit
google-setup audit \
  --domains="example.com,example2.com" \
  [--output=json|console] \
  [--save-report]

# Deploy
google-setup deploy \
  --domain="example.com" \
  [--project-name="Example Site"] \
  [--template=lead-gen|ecommerce|minimal] \
  [--auto]

# Export template
google-setup export \
  --gtm-id="GTM-XXXXXXX" \
  --output="my-template.json"

# Aide
google-setup --help
google-setup audit --help
```

### Console Output Format

**1. Audit Report (Console):**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 RAPPORT D'AUDIT - example.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏷️  Google Tag Manager                               8.5/10
   Conteneur : GTM-KV37SG94
   Balises : 3 actives (1 GA4, 2 événements)
   Déclencheurs : 5 custom
   Variables : 4 dataLayer

📊 Google Analytics 4                                7.5/10
   ID : G-2P2JH4ESZG
   Événements custom : 2
   Conversions : 1 (lead_form_submit)

📦 DataLayer Custom                                  8.0/10
   Variables : 4 (cta_location, kit_power, user_type, lead_value)
   Déclencheurs : 3 événements custom

🔍 Google Search Console                            10.0/10
   Status : ✅ Vérifié
   Sitemap : ✅ Soumis (0 erreurs)

🔥 Hotjar                                           10.0/10
   Status : ✅ Installé (Site ID: 3456789)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 SCORE GLOBAL : 84.5/100 (Note A 🎉)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 RECOMMANDATIONS :

1. 🟡 Augmenter le nombre d'événements custom GA4
   Impact : ⭐⭐⭐ Moyen | Gain : +10 points
   
2. 🟢 Ajouter des dimensions custom GA4
   Impact : ⭐⭐ Utile | Gain : +5 points

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Audit terminé en 1.8s | Rapport : reports/audit-example-com-2025-12-20.json

💡 Déployer automatiquement ? (o/n)
```

**2. Deployment Progress:**

```
🚀 DÉPLOIEMENT EN COURS - example.com

[1/6] Configuration Google Analytics 4...
      ⏳ Création propriété...
      ✓ Propriété créée (G-ABC123DEF)
      ⏳ Création flux de données...
      ✓ Flux créé (ID: 987654321)

[2/6] Configuration Google Tag Manager...
      ⏳ Création conteneur...
      ✓ Conteneur créé (GTM-XYZ789)
      ⏳ Import template (gtm-lead-gen.json)...
      ✓ Template importé (8 balises, 6 déclencheurs, 5 variables)
      ⏳ Remplacement des IDs...
      ✓ ID GA4 remplacé : G-ABC123DEF
      ⏳ Publication version...
      ✓ Version v1.0 publiée

[3/6] Génération fichiers GTM...
      ✓ components/gtm-head.html créé
      ✓ components/gtm-body.html créé

[4/6] Déploiement dataLayer...
      ✓ src/tracking.js généré (5 événements)
      ✓ 3 déclencheurs créés dans GTM
      ✓ 4 variables créées dans GTM

[5/6] Configuration Search Console...
      ✓ Site ajouté (sc-domain:example.com)
      ℹ  Token de vérification généré :
      
      <meta name="google-site-verification" content="ABC123XYZ" />
      
      → Ajoutez cette balise dans <head> puis relancez :
        google-setup deploy --domain=example.com --verify-sc

[6/6] Configuration Hotjar...
      ✓ Balise Hotjar créée dans GTM (Site ID: 4567890)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ DÉPLOIEMENT TERMINÉ EN 2MIN 45S
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 NOUVEAU SCORE : 92/100 (Note A+ 🎉)
   Amélioration : +63 points (29 → 92)

📁 Fichiers générés :
   ✓ components/gtm-head.html (523 bytes)
   ✓ components/gtm-body.html (189 bytes)
   ✓ src/tracking.js (4.5 KB)
   ✓ .google-setup.json (892 bytes)

🎯 Prochaines étapes :

   1. Inclure les fichiers GTM dans vos pages :
      
      <!-- Dans <head> -->
      <include src="components/gtm-head.html"></include>
      
      <!-- Juste après <body> -->
      <include src="components/gtm-body.html"></include>

   2. Ajouter tracking.js dans vos scripts :
      
      <script src="src/tracking.js"></script>

   3. Ajouter les onclick sur vos CTAs :
      
      <button onclick="trackCTADevis('hero')">Obtenir un devis</button>

   4. Vérifier dans Google Analytics Temps Réel :
      https://analytics.google.com/analytics/web/#/p987654321/realtime

   5. Déployer :
      firebase deploy --only hosting

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**3. Export Template:**

```
📦 EXPORT TEMPLATE GTM

Conteneur : GTM-KV37SG94 (Example Site)

⏳ Récupération de la configuration...
   ✓ 8 balises récupérées
   ✓ 6 déclencheurs récupérés
   ✓ 5 variables récupérées

⏳ Génération du template...
   ✓ Variables dynamiques identifiées :
     - G-2P2JH4ESZG → {{GA4_MEASUREMENT_ID}}
     - example.com → {{DOMAIN}}
     - Example Site → {{PROJECT_NAME}}

✅ Template exporté : my-template.json (15.3 KB)

💡 Réutilisez-le avec :
   google-setup deploy --domain=nouveau-site.com --template=my-template.json
```

***

## ✅ Acceptance Criteria (Global)

### Must Have (MVP v2.0)
- ✅ Audit d'un ou plusieurs domaines via APIs Google (GTM + GA4 + Search Console)
- ✅ Fallback détection légère via fetch HTML (si pas d'accès API)
- ✅ Calcul de score KPI avec grades A-F et recommandations
- ✅ Déploiement automatique GA4 + GTM via APIs
- ✅ Création complète des balises/déclencheurs/variables via API Tag Manager
- ✅ Publication automatique version GTM
- ✅ Génération fichiers tracking.js + gtm-head/body.html
- ✅ CLI interactif avec 2 menus (audit + deploy)
- ✅ Sauvegarde rapports dans ./reports/
- ✅ Templates GTM pré-configurés (minimal, lead-gen, ecommerce)
- ✅ Temps d'audit : < 2 secondes par domaine
- ✅ Temps de déploiement : < 3 minutes

### Should Have (v2.1)
- ✅ Export de template GTM personnalisé
- ✅ Variables dynamiques dans templates ({{GA4_ID}}, {{DOMAIN}}, etc.)
- ✅ Configuration Search Console automatique avec vérification
- ✅ Détection et setup Hotjar
- ✅ Support de 10+ domaines en parallèle
- ✅ Historique des scores KPI dans .google-setup.json

### Nice to Have (v2.2+)
- 🔲 Mode watch (re-audit périodique automatique)
- 🔲 Diff entre 2 audits (changements détectés)
- 🔲 Dashboard web React (visualisation des KPIs)
- 🔲 Alertes email si score baisse
- 🔲 Intégration Slack/Discord pour notifications
- 🔲 Support Meta Pixel, LinkedIn Insight Tag
- 🔲 Export des rapports en PDF
- 🔲 CI/CD integration (GitHub Actions)

***

## 🔐 Security & Privacy

### Credentials Management

**OAuth2 Service Account:**
```javascript
// ~/.google-credentials.json (gitignored)
{
  "type": "service_account",
  "project_id": "google-setup-cli",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "google-setup@project.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

**Setup Instructions (Init Command):**
```bash
$ google-setup init

🔐 Configuration des credentials Google API

Étapes :
  1. Allez sur : https://console.cloud.google.com
  2. Créez un projet : "google-setup-cli"
  3. Activez les APIs :
     - Tag Manager API
     - Analytics Admin API
     - Search Console API
     - Site Verification API
  4. Créez un Service Account
  5. Téléchargez le JSON des credentials
  6. Donnez accès au Service Account à vos comptes GTM/GA4

? Chemin vers le fichier credentials.json : ~/.google-credentials.json
? GTM Account ID : 6329175537
? GA4 Account ID : 123456789

✅ Configuration sauvegardée dans ~/.google-setup-config.json
```

### Data Privacy
- ✅ Aucune donnée utilisateur collectée ou envoyée à des tiers
- ✅ Rapports d'audit stockés localement uniquement (./reports/)
- ✅ Credentials stockées localement (~ /.google-credentials.json)
- ✅ Pas de télémétrie, pas d'analytics sur l'outil lui-même
- ✅ Code open-source (audit possible)

### .gitignore

```
# Credentials
config/.google-credentials.json
.google-credentials.json
.google-setup-config.json

# Reports (optionnel, selon préférence)
reports/*.json

# Node
node_modules/
.env

# Build
dist/
```

***

## 🧪 Testing Requirements

### Unit Tests

```javascript
// tests/detectors.test.js
import { describe, it, expect } from 'vitest';
import { detectGTMViaAPI } from '../src/detectors/gtm-detector-api.js';

describe('GTM Detector API', () => {
  it('should detect GTM container via API', async () => {
    const result = await detectGTMViaAPI('6329175537', 'example.com');
    
    expect(result.installed).toBe(true);
    expect(result.containerId).toMatch(/^GTM-[A-Z0-9]+$/);
    expect(result.tags).toBeInstanceOf(Array);
    expect(result.score).toBeGreaterThan(0);
  });
  
  it('should return not installed if container not found', async () => {
    const result = await detectGTMViaAPI('6329175537', 'nonexistent-domain.com');
    
    expect(result.installed).toBe(false);
  });
});

// tests/kpi.test.js
describe('KPI Calculator', () => {
  it('should calculate correct overall score', () => {
    const auditData = {
      gtm: { installed: true, score: 85 },
      ga4: { installed: true, score: 75 },
      dataLayer: { installed: true, score: 80 },
      searchConsole: { verified: true, score: 100 },
      hotjar: { installed: true, score: 100 }
    };
    
    const kpi = calculateKPI(auditData);
    
    expect(kpi.overallScore).toBe(84.5);
    expect(kpi.grade).toBe('A');
  });
  
  it('should assign grade A+ for score >= 90', () => {
    const kpi = { overallScore: 92 };
    expect(getGrade(kpi.overallScore)).toBe('A+');
  });
});

// tests/templates.test.js
describe('Template Parser', () => {
  it('should replace variables in template', () => {
    const template = {
      name: '{{PROJECT_NAME}}',
      measurementId: '{{GA4_MEASUREMENT_ID}}'
    };
    
    const result = replaceTemplateVariables(template, {
      'PROJECT_NAME': 'Example Site',
      'GA4_MEASUREMENT_ID': 'G-ABC123DEF'
    });
    
    expect(result.name).toBe('Example Site');
    expect(result.measurementId).toBe('G-ABC123DEF');
  });
});
```

### Integration Tests

```javascript
// tests/integration/audit-deploy.test.js
describe('Audit → Deploy Flow', () => {
  it('should audit and deploy successfully', async () => {
    // 1. Audit
    const auditResult = await auditDomain('test-domain.com', credentials);
    expect(auditResult.kpi.overallScore).toBeLessThan(50);
    
    // 2. Deploy
    const deployResult = await deployDomain('test-domain.com', {
      projectName: 'Test Site',
      template: 'gtm-minimal.json'
    });
    
    expect(deployResult.ga4.measurementId).toMatch(/^G-[A-Z0-9]+$/);
    expect(deployResult.gtm.containerId).toMatch(/^GTM-[A-Z0-9]+$/);
    
    // 3. Re-audit
    const newAudit = await auditDomain('test-domain.com', credentials);
    expect(newAudit.kpi.overallScore).toBeGreaterThan(80);
  });
});
```

### Test Coverage Target
- **Unit tests:** > 80% coverage
- **Integration tests:** Critical flows (audit, deploy)
- **API mocking:** Use `nock` pour mocker les APIs Google en dev

***

## 📈 Performance Requirements

| Metric | Target | Maximum |
|---|---|---|
| **Audit d'un domaine (API)** | < 1.5s | 3s |
| **Audit d'un domaine (HTML fallback)** | < 3s | 5s |
| **Audit de 5 domaines en parallèle** | < 5s | 10s |
| **Déploiement complet** | < 2 min | 5 min |
| **Taille package NPM** | < 20 MB | 50 MB |
| **Memory usage (audit)** | < 100 MB | 200 MB |
| **Memory usage (deploy)** | < 150 MB | 300 MB |
| **Startup time CLI** | < 500ms | 1s |

### Performance Optimizations

```javascript
// Parallélisation des audits
async function auditMultipleDomains(domains, credentials) {
  const results = await Promise.all(
    domains.map(domain => auditDomain(domain, credentials))
  );
  return results;
}

// Cache des réponses API (optionnel)
const apiCache = new Map();

async function cachedAPICall(key, fn, ttl = 60000) {
  if (apiCache.has(key)) {
    const cached = apiCache.get(key);
    if (Date.now() - cached.timestamp < ttl) {
      return cached.data
```javascript
    }
  }
  
  const data = await fn();
  apiCache.set(key, { data, timestamp: Date.now() });
  return data;
}

// Lazy loading des modules
async function loadGoogleAPIs() {
  const { google } = await import('googleapis');
  return google;
}

// Stream processing pour gros fichiers
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

async function processLargeTemplate(filePath) {
  const fileStream = createReadStream(filePath);
  const rl = createInterface({ input: fileStream });
  
  let content = '';
  for await (const line of rl) {
    content += line;
  }
  
  return JSON.parse(content);
}
```

***

## 🚀 Deployment & Distribution

### NPM Package Configuration

```json
{
  "name": "google-setup-cli",
  "version": "2.0.0",
  "description": "Audit et déploiement automatique Google Analytics via APIs",
  "type": "module",
  "bin": {
    "google-setup": "./bin/cli.js"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "keywords": [
    "google-analytics",
    "google-tag-manager",
    "ga4",
    "gtm",
    "analytics",
    "tracking",
    "audit",
    "deployment",
    "cli"
  ],
  "author": "Your Name",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/google-setup-cli"
  },
  "dependencies": {
    "googleapis": "^126.0.0",
    "commander": "^11.1.0",
    "inquirer": "^9.2.12",
    "chalk": "^5.3.0",
    "ora": "^7.0.1",
    "cli-progress": "^3.12.0",
    "boxen": "^7.1.1",
    "figlet": "^1.7.0",
    "cheerio": "^1.0.0-rc.12",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "vitest": "^1.0.4",
    "nock": "^13.4.0",
    "eslint": "^8.56.0",
    "prettier": "^3.1.1"
  },
  "scripts": {
    "start": "node bin/cli.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/**/*.js",
    "format": "prettier --write src/**/*.js"
  }
}
```

### Installation

```bash
# Installation globale
npm install -g google-setup-cli

# Vérifier l'installation
google-setup --version

# Initialiser les credentials
google-setup init
```

### Distribution

**1. NPM Registry (public)**
```bash
npm publish
```

**2. GitHub Releases**
- Tag de version : `v2.0.0`
- Changelog détaillé
- Binaires compilés pour Linux/macOS/Windows (optionnel avec `pkg`)

**3. Docker Image (optionnel)**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENTRYPOINT ["node", "bin/cli.js"]
```

```bash
docker build -t google-setup-cli:2.0.0 .
docker run -v ~/.google-credentials.json:/root/.google-credentials.json google-setup-cli audit --domains=example.com
```

***

## 📝 Documentation Requirements

### README.md Structure

```markdown
# Google Setup CLI

🎯 Audit et déploiement automatique de Google Analytics, Tag Manager, Search Console en quelques secondes via APIs officielles.

## ✨ Features

- ✅ **Audit ultra-rapide** (< 2s) via APIs Google
- ✅ **Score KPI automatique** (0-100) avec recommandations
- ✅ **Déploiement automatique** GTM + GA4 + Search Console
- ✅ **Templates réutilisables** (lead-gen, ecommerce)
- ✅ **CLI interactif** facile à utiliser
- ✅ **Zéro scraping** : fiable et rapide

## 📦 Installation

```
npm install -g google-setup-cli
```

## 🚀 Quick Start

```
# 1. Configurer les credentials Google API
google-setup init

# 2. Auditer un site
google-setup audit --domains=example.com

# 3. Déployer automatiquement
google-setup deploy --domain=example.com --auto
```

## 📚 Documentation

- [Installation Guide](docs/installation.md)
- [Authentication Setup](docs/authentication.md)
- [CLI Reference](docs/cli-reference.md)
- [Templates Guide](docs/templates.md)
- [API Documentation](docs/api.md)
- [Troubleshooting](docs/troubleshooting.md)

## 🤝 Contributing

[CONTRIBUTING.md](CONTRIBUTING.md)

## 📄 License

MIT
```

### Documentation Files

**1. docs/installation.md**
- Prerequisites (Node.js 18+)
- Installation steps
- First-time setup
- Credential configuration

**2. docs/authentication.md**
- Creating Google Cloud Project
- Enabling APIs (GTM, GA4, Search Console)
- Creating Service Account
- Granting permissions
- Downloading credentials JSON

**3. docs/cli-reference.md**
- All commands with examples
- Flags and options
- Exit codes
- Output formats

**4. docs/templates.md**
- Template structure
- Available templates
- Creating custom templates
- Variable replacement
- Best practices

**5. docs/troubleshooting.md**
- Common errors and solutions
- API rate limits
- Permissions issues
- Network errors
- FAQ

### In-Code Documentation

**JSDoc for all public functions:**

```javascript
/**
 * Audits a domain to detect Google Analytics setup
 * @async
 * @param {string} domain - Domain to audit (e.g., 'example.com')
 * @param {Object} credentials - Google API credentials
 * @param {string} credentials.gtmAccountId - GTM Account ID
 * @param {string} credentials.ga4AccountId - GA4 Account ID
 * @returns {Promise<AuditResult>} Audit result with scores and recommendations
 * @throws {Error} If API calls fail or credentials are invalid
 * @example
 * const result = await auditDomain('example.com', {
 *   gtmAccountId: '6329175537',
 *   ga4AccountId: '123456789'
 * });
 * console.log(result.kpi.overallScore); // 84.5
 */
async function auditDomain(domain, credentials) {
  // ...
}
```

***

## 🎯 Success Metrics (Post-Launch)

### Quantitative Metrics

| Metric | Target (3 months) | Target (6 months) |
|---|---|---|
| **NPM Downloads** | 500+ | 2,000+ |
| **GitHub Stars** | 50+ | 200+ |
| **Active Users** | 100+ | 500+ |
| **Audits/day** | 200+ | 1,000+ |
| **Deployments/day** | 50+ | 200+ |
| **Average Score Improvement** | +50 points | +60 points |
| **Time Saved per User** | 2h → 5min | 2h → 3min |

### Qualitative Metrics

- **User Satisfaction:** NPS > 50
- **Issue Response Time:** < 24h
- **Documentation Quality:** < 5% questions on basic usage
- **API Reliability:** 99.5% uptime

### Success Indicators

- ✅ Featured in Google Tag Manager communities
- ✅ Mentioned in analytics blogs/podcasts
- ✅ Adopted by agencies as standard tool
- ✅ Contributions from external developers
- ✅ Integration requests (CI/CD, dashboards)

***

## 🔄 Roadmap

### Phase 1: MVP (v2.0) - Weeks 1-2

**Week 1:**
- [x] Project setup (structure, dependencies)
- [x] Google APIs authentication
- [x] GTM detector via API
- [x] GA4 detector via API
- [x] Search Console checker
- [x] KPI calculator
- [x] Basic CLI (audit command)

**Week 2:**
- [x] GA4 deployer
- [x] GTM deployer
- [x] Template parser
- [x] File generator (gtm-head, gtm-body, tracking.js)
- [x] CLI interactif
- [x] Reports generator
- [x] Unit tests
- [x] Documentation

### Phase 2: Enhanced Features (v2.1) - Week 3

- [ ] Hotjar detection & deployment
- [ ] Multiple domains parallel audit
- [ ] Export custom templates
- [ ] Search Console verification automation
- [ ] KPI history tracking
- [ ] Integration tests

### Phase 3: Advanced Features (v2.2) - Week 4

- [ ] Watch mode (periodic re-audit)
- [ ] Diff between audits
- [ ] Email alerts
- [ ] Meta Pixel support
- [ ] LinkedIn Insight Tag support
- [ ] PDF export reports

### Phase 4: Ecosystem (v3.0) - Months 2-3

- [ ] Dashboard web (React)
- [ ] API REST (pour intégrations externes)
- [ ] CI/CD plugins (GitHub Actions, GitLab CI)
- [ ] Slack/Discord integration
- [ ] Team collaboration features
- [ ] Multi-user support

***

## 📋 Out of Scope (Not in v2.0)

### Explicitly Not Included

- ❌ **Puppeteer/Scraping** : Architecture 100% API
- ❌ **Interface graphique desktop** (Electron)
- ❌ **Support d'autres analytics** (Matomo, Plausible, Adobe)
- ❌ **Modification de code source automatique** (injection dans fichiers HTML)
- ❌ **Gestion des comptes Google** (création de comptes GA4/GTM)
- ❌ **Support serveurs Windows** (Node.js 18+ Linux/macOS uniquement en priorité)
- ❌ **Base de données** (tout en local JSON)
- ❌ **Multi-langues** (Anglais/Français uniquement)
- ❌ **Mobile app** (iOS/Android)

### Future Consideration

- 🔮 **A/B testing tracking** (Optimizely, VWO)
- 🔮 **CRM integration** (HubSpot, Salesforce)
- 🔮 **E-commerce platforms** (Shopify, WooCommerce plugins)
- 🔮 **No-code integration** (Zapier, Make.com)
- 🔮 **White-label version** for agencies

***

## 💡 Technical Constraints & Limitations

### System Requirements

- **Node.js:** >= 18.0.0 (pour ES Modules + native fetch)
- **OS:** Linux, macOS, Windows 10+
- **RAM:** Minimum 512 MB, Recommended 1 GB
- **Disk Space:** 50 MB for package + 100 MB for reports
- **Network:** Internet connection required (APIs Google)

### API Constraints

| API | Rate Limit | Quota/day | Constraint |
|---|---|---|---|
| **Tag Manager** | 100 req/min | 50,000 | Pas de batch operations |
| **Analytics Admin** | 50 req/min | 25,000 | Créations limitées |
| **Search Console** | 600 req/min | 1,000,000 | Données 48h de retard |
| **Site Verification** | 100 req/min | 10,000 | Vérification manuelle |

### Known Limitations

1. **GTM Detection:** Nécessite l'Account ID utilisateur (pas de découverte automatique)
2. **DataLayer Custom:** Détection partielle (variables GTM uniquement, pas le code JS source)
3. **Search Console:** Vérification manuelle requise (ajout balise META)
4. **Hotjar:** Détection via HTML fetch (pas d'API officielle)
5. **Templates:** Variables dynamiques limitées (3 variables : GA4_ID, DOMAIN, PROJECT_NAME)
6. **Parallel Audits:** Maximum 10 domaines simultanés (rate limits)

### Workarounds

**1. GTM Account ID inconnu:**
```bash
# Solution : Demander à l'user ou détecter via HTML puis confirmer
google-setup audit --domains=example.com --detect-accounts
```

**2. DataLayer custom non détecté:**
```bash
# Solution : Proposer un deep-check optionnel (1 page Puppeteer)
google-setup audit --domains=example.com --deep-check-datalayer
```

**3. Rate limits dépassés:**
```javascript
// Retry avec exponential backoff
async function apiCallWithRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === 429 && i < maxRetries - 1) {
        await sleep(2 ** i * 1000); // 1s, 2s, 4s
        continue;
      }
      throw error;
    }
  }
}
```

***

## 🔧 Development Setup

### Prerequisites

```bash
# Node.js 18+
node --version  # v18.0.0+

# NPM or Yarn
npm --version   # 9.0.0+
```

### Clone & Install

```bash
git clone https://github.com/yourusername/google-setup-cli.git
cd google-setup-cli

npm install
```

### Development

```bash
# Run in dev mode
npm run start

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Format code
npm run format
```

### Environment Variables

```bash
# .env (optionnel)
GOOGLE_APPLICATION_CREDENTIALS=~/.google-credentials.json
GTM_ACCOUNT_ID=6329175537
GA4_ACCOUNT_ID=123456789
LOG_LEVEL=debug
```

### Testing with Local Link

```bash
# Dans le repo google-setup-cli
npm link

# Dans un projet test
cd /path/to/test-project
npm link google-setup-cli

# Utiliser
google-setup audit --domains=localhost:8080
```

***

## 🐛 Error Handling

### Error Categories

```javascript
// src/utils/errors.js

class GoogleSetupError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'GoogleSetupError';
    this.code = code;
    this.details = details;
  }
}

class AuthenticationError extends GoogleSetupError {
  constructor(message, details) {
    super(message, 'AUTH_ERROR', details);
    this.name = 'AuthenticationError';
  }
}

class APIError extends GoogleSetupError {
  constructor(message, details) {
    super(message, 'API_ERROR', details);
    this.name = 'APIError';
  }
}

class ValidationError extends GoogleSetupError {
  constructor(message, details) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}
```

### Error Handling Strategy

```javascript
// Centralized error handler
function handleError(error) {
  if (error instanceof AuthenticationError) {
    console.error(chalk.red('❌ Erreur d\'authentification'));
    console.error(chalk.yellow('Vérifiez vos credentials : ~/.google-credentials.json'));
    console.error(chalk.gray(`Détails : ${error.message}`));
    process.exit(1);
  }
  
  if (error instanceof APIError) {
    console.error(chalk.red('❌ Erreur API Google'));
    
    if (error.code === 429) {
      console.error(chalk.yellow('⚠️  Rate limit atteint, réessayez dans 1 minute'));
    } else if (error.code === 403) {
      console.error(chalk.yellow('⚠️  Permissions insuffisantes'));
      console.error('Vérifiez que le Service Account a accès aux comptes GTM/GA4');
    } else {
      console.error(chalk.gray(`Détails : ${error.message}`));
    }
    
    process.exit(2);
  }
  
  if (error instanceof ValidationError) {
    console.error(chalk.red('❌ Erreur de validation'));
    console.error(chalk.gray(`Détails : ${error.message}`));
    process.exit(3);
  }
  
  // Unknown error
  console.error(chalk.red('❌ Erreur inattendue'));
  console.error(error);
  process.exit(99);
}

// Usage
try {
  const result = await auditDomain(domain, credentials);
} catch (error) {
  handleError(error);
}
```

### User-Friendly Error Messages

```javascript
// Error message mapping
const ERROR_MESSAGES = {
  'CREDENTIALS_NOT_FOUND': {
    message: 'Fichier credentials non trouvé',
    solution: 'Lancez : google-setup init',
    docs: 'https://docs.google-setup-cli.com/authentication'
  },
  'INVALID_DOMAIN': {
    message: 'Domaine invalide',
    solution: 'Format attendu : example.com (sans http://)',
    docs: 'https://docs.google-setup-cli.com/cli-reference#audit'
  },
  'GTM_ACCOUNT_NOT_FOUND': {
    message: 'Compte GTM introuvable',
    solution: 'Vérifiez l\'Account ID dans ~/.google-setup-config.json',
    docs: 'https://docs.google-setup-cli.com/troubleshooting#gtm-account'
  }
};

function displayError(errorCode) {
  const error = ERROR_MESSAGES[errorCode];
  
  console.log('\n' + boxen(
    chalk.red.bold('❌ ' + error.message) + '\n\n' +
    chalk.yellow('💡 Solution : ') + error.solution + '\n\n' +
    chalk.gray('📚 Documentation : ') + chalk.cyan(error.docs),
    { padding: 1, borderColor: 'red' }
  ));
}
```

***

## 📊 Monitoring & Analytics

### Internal Metrics (Optionnel)

```javascript
// src/utils/telemetry.js (opt-in)
async function trackUsage(eventName, properties) {
  if (!config.telemetryEnabled) return;
  
  // Anonymized telemetry
  await fetch('https://telemetry.google-setup-cli.com/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: eventName,
      properties: {
        version: packageJson.version,
        nodeVersion: process.version,
        platform: process.platform,
        ...properties
      },
      userId: hash(os.userInfo().username) // Anonymized
    })
  });
}

// Usage
await trackUsage('audit_completed', {
  domainsCount: 1,
  executionTime: 1.8,
  score: 84.5
});
```

### Opt-out

```bash
# Désactiver la télémétrie
google-setup config set telemetry false

# Réactiver
google-setup config set telemetry true
```

***

## 🎓 Training & Onboarding

### First-Time User Experience

```bash
$ google-setup

🎉 Bienvenue dans Google Setup CLI !

C'est votre première utilisation. Configurons l'outil ensemble.

? Avez-vous déjà des credentials Google API ? Non

📚 Pas de problème ! Suivez ce guide rapide :

1. Allez sur : https://console.cloud.google.com
2. Créez un projet "google-setup-cli"
3. Activez les APIs (GTM, GA4, Search Console)
4. Créez un Service Account
5. Téléchargez le JSON

? Chemin vers credentials.json : ~/Downloads/credentials.json
✓ Credentials sauvegardées

? GTM Account ID : 6329175537
? GA4 Account ID : 123456789

✅ Configuration terminée !

🎯 Commençons par un audit :
   google-setup audit --domains=votre-site.com

💡 Besoin d'aide ? Consultez la doc :
   https://docs.google-setup-cli.com
```

### Interactive Tutorial

```bash
$ google-setup tutorial

📖 TUTORIEL INTERACTIF

[Étape 1/5] Audit d'un site

Un audit détecte les outils Google configurés sur votre site.

? Domaine à auditer : example.com

🔍 Audit en cours...

✅ Résultats :
   - GTM : ✅ Installé (GTM-ABC123)
   - GA4 : ❌ Non installé
   - Score : 40/100

[Étape 2/5] Déploiement automatique

Le déploiement configure automatiquement les outils manquants.

? Lancer le déploiement ? Oui

🚀 Déploiement...

✅ GA4 créé ! (G-XYZ789)

[Suite du tutorial...]
```

***

## 🤝 Contributing Guidelines

### Code Style

```javascript
// ESLint configuration
{
  "extends": ["eslint:recommended"],
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "rules": {
    "indent": ["error", 2],
    "quotes": ["error", "single"],
    "semi": ["error", "always"],
    "no-unused-vars": ["warn"],
    "no-console": "off"
  }
}

// Prettier configuration
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "none",
  "printWidth": 100
}
```

### Pull Request Process

1. Fork le repo
2. Créer une branche : `git checkout -b feature/amazing-feature`
3. Commit : `git commit -m 'Add amazing feature'`
4. Push : `git push origin feature/amazing-feature`
5. Ouvrir une Pull Request

### Commit Message Convention

```
feat: Add export template command
fix: Resolve API rate limit issue
docs: Update authentication guide
test: Add unit tests for KPI calculator
refactor: Improve error handling
chore: Update dependencies
```

***

## 📄 License

```
MIT License

Copyright (c) 2025 [Your Name]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

***

## 📞 Support & Contact

### Support Channels

- **Documentation:** https://docs.google-setup-cli.com
- **GitHub Issues:** https://github.com/yourusername/google-setup-cli/issues
- **Discussions:** https://github.com/yourusername/google-setup-cli/discussions
- **Email:** support@google-setup-cli.com
- **Discord:** https://discord.gg/google-setup-cli

### Response Times

| Channel | Response Time |
|---|---|
| **GitHub Issues (bugs)** | < 24h |
| **GitHub Issues (features)** | < 72h |
| **Email** | < 48h |
| **Discord** | Community-driven |

***

## 🎯 Conclusion & Next Steps

### This PRD is Ready For

✅ **AI-Assisted Development** (Claude, Cursor, Copilot Workspace)
✅ **Team Implementation** (Clear specs for developers)
✅ **Stakeholder Review** (Complete feature descriptions)
✅ **Estimation & Planning** (Phased roadmap)

### Implementation Priority

**1. Core MVP (Week 1-2):**
- API authentication
- GTM/GA4 detectors
- KPI calculator
- Basic audit command

**2. Deployment (Week 2):**
- GA4/GTM deployers
- Template parser
- File generators

**3. Polish (Week 3):**
- CLI interactif
- Error handling
- Documentation

**4. Launch (Week 4):**
- Tests complets
- NPM publish
- Marketing

***

**🚀 Ready to start coding!**

***

**Document Version:** 2.0.0  
**Date:** 2025-12-20  
**Status:** ✅ Ready for Implementation  
**Target:** AI Code Generation (Cursor, Claude, Copilot)  
**Estimated Development Time:** 3-4 weeks  

***

**END OF PRD v2.0 - API-First Architecture**