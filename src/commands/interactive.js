import select, { Separator } from '@inquirer/select';
import input from '@inquirer/input';
import confirm from '@inquirer/confirm';
import chalk from 'chalk';
import figlet from 'figlet';
import { runAudit } from './audit.js';
import { runCreateGtmContainer } from './create-gtm-container.js';
import { runSync } from './sync.js';
import { handleInitTrackingInteractive } from './init-tracking.js';
import { handleEventSetupInteractive } from './event-setup.js';
import { handleGtmConfigSetupInteractive } from './gtm-config-setup.js';
import { handleHtmlLayerInteractive } from './html-layer.js';
import { handleCleanInteractive } from './clean.js';
import { runAutoEdit } from './autoedit.js';
import { handleGenerateTrackingInteractive } from './generate-tracking.js';
import { handleVerifyTrackingInteractive } from './verify-tracking.js';
import { handlePublishInteractive } from './publish.js';
import { getStepsStatus } from '../utils/step-validator.js';

/**
 * Descriptions détaillées pour chaque commande
 */
const COMMAND_HELP = {
  autoedit: {
    description: 'Analyse automatique du HTML avec IA pour générer le tracking plan',
    objectif: 'Identifier les éléments trackables et créer tracking-events.yaml',
    input: 'Fichiers HTML du projet',
    output: 'tracking/tracking-events.yaml, tracking/gtm-config.yaml',
    schema: `
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │  HTML Scan  │ ──▶ │  IA Gemini  │ ──▶ │  YAML Gen   │
    └─────────────┘     └─────────────┘     └─────────────┘`
  },
  audit: {
    description: 'Auditer la configuration analytics existante d\'un domaine',
    objectif: 'Obtenir un score (A+ à F) et identifier les manques',
    input: 'Domaine(s) à auditer',
    output: 'Rapport avec score GTM, GA4, DataLayer, Search Console',
    schema: `
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │   Domain    │ ──▶ │  Google API │ ──▶ │   Score     │
    └─────────────┘     └─────────────┘     └─────────────┘`
  },
  'init-tracking': {
    description: 'Créer le dossier tracking/ avec les fichiers de base',
    objectif: 'Initialiser la structure pour le tracking',
    input: 'Aucun (utilise le répertoire courant)',
    output: 'tracking/tracking-events.yaml, tracking/tracking-rules.yaml',
    schema: `
    ┌─────────────┐     ┌─────────────────────────────────┐
    │  Commande   │ ──▶ │  tracking/                      │
    └─────────────┘     │  ├── tracking-events.yaml       │
                        │  └── tracking-rules.yaml        │
                        └─────────────────────────────────┘`
  },
  'event-setup': {
    description: 'Sélectionner interactivement les events à tracker',
    objectif: 'Activer/désactiver les events dans tracking-events.yaml',
    input: 'tracking/tracking-events.yaml existant',
    output: 'tracking/tracking-events.yaml mis à jour',
    schema: `
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │  56 events  │ ──▶ │  Sélection  │ ──▶ │  N activés  │
    │  possibles  │     │  checkbox   │     │             │
    └─────────────┘     └─────────────┘     └─────────────┘`
  },
  'gtm-config-setup': {
    description: 'Générer la configuration GTM depuis les events sélectionnés',
    objectif: 'Créer gtm-config.yaml avec tags, triggers, variables',
    input: 'tracking/tracking-events.yaml',
    output: 'tracking/gtm-config.yaml',
    schema: `
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │   Events    │ ──▶ │  Génération │ ──▶ │  GTM Config │
    │   YAML      │     │  Tags/Trig  │     │    YAML     │
    └─────────────┘     └─────────────┘     └─────────────┘`
  },
  'generate-tracking': {
    description: 'Générer le fichier tracking.js depuis la config',
    objectif: 'Créer le code JavaScript de tracking dataLayer',
    input: 'tracking/tracking-events.yaml',
    output: 'src/tracking.js (ou public/tracking.js)',
    schema: `
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │   Events    │ ──▶ │  Code Gen   │ ──▶ │ tracking.js │
    │   YAML      │     │  dataLayer  │     │  pushEvent  │
    └─────────────┘     └─────────────┘     └─────────────┘`
  },
  'html-layer': {
    description: 'Ajouter les attributs data-track aux éléments HTML',
    objectif: 'Préparer le HTML pour le tracking automatique',
    input: 'Fichiers HTML + tracking-events.yaml',
    output: 'Fichiers HTML modifiés avec data-track="event-name"',
    schema: `
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │   <button>  │ ──▶ │  + data-    │ ──▶ │  <button    │
    │             │     │    track    │     │  data-track>│
    └─────────────┘     └─────────────┘     └─────────────┘`
  },
  deploy: {
    description: 'Déployer la configuration dans GTM via l\'API Google',
    objectif: 'Créer conteneur GTM, propriété GA4, tags et triggers',
    input: 'tracking/gtm-config.yaml + credentials Google',
    output: 'GTM Container, GA4 Property, Tags/Triggers créés',
    schema: `
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │  GTM Config │ ──▶ │  Google API │ ──▶ │  GTM Live   │
    │    YAML     │     │  Tag Mgr    │     │  GA4 Live   │
    └─────────────┘     └─────────────┘     └─────────────┘`
  },
  sync: {
    description: 'Synchroniser le code local avec GTM existant',
    objectif: 'Créer les triggers/variables manquants dans GTM',
    input: 'tracking.js local + conteneur GTM',
    output: 'Triggers et variables créés dans GTM',
    schema: `
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │ tracking.js │ ──▶ │   Compare   │ ──▶ │  GTM Sync   │
    │   local     │     │   diff      │     │  créations  │
    └─────────────┘     └─────────────┘     └─────────────┘`
  },
  'verify-tracking': {
    description: 'Vérifier que tout le setup est production-ready',
    objectif: 'Checklist de 14 points avant mise en production',
    input: 'Projet complet (tracking/, HTML, JS)',
    output: 'Rapport ✓/✗ avec recommandations',
    schema: `
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │   Projet    │ ──▶ │ 14 checks   │ ──▶ │  ✓ READY    │
    │   complet   │     │   config    │     │  ou ✗ TODO  │
    └─────────────┘     └─────────────┘     └─────────────┘`
  },
  publish: {
    description: 'Publier les modifications GTM en production',
    objectif: 'Créer une version et la publier automatiquement',
    input: 'Domaine ou GTM-ID',
    output: 'Version publiée en production',
    schema: `
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │  Workspace  │ ──▶ │  Version    │ ──▶ │    LIVE     │
    │   (draft)   │     │  (v1.0.x)   │     │  Production │
    └─────────────┘     └─────────────┘     └─────────────┘`
  },
  clean: {
    description: 'Nettoyer GTM en supprimant les éléments orphelins',
    objectif: 'Supprimer triggers/tags/variables non utilisés',
    input: 'Conteneur GTM + code local',
    output: 'Éléments orphelins supprimés de GTM',
    schema: `
    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
    │  GTM Live   │ ──▶ │   Compare   │ ──▶ │  Supprime   │
    │  + Local    │     │  orphelins  │     │  obsolètes  │
    └─────────────┘     └─────────────┘     └─────────────┘`
  },
  exit: {
    description: 'Quitter le programme',
    objectif: '',
    input: '',
    output: '',
    schema: ''
  }
};

/**
 * Générer la description pour le help panel
 */
function getHelpDescription(value) {
  const help = COMMAND_HELP[value];
  if (!help || value === 'exit' || !help.description) return '';

  const lines = [
    chalk.bold.white(help.description),
    chalk.gray(`Objectif: ${help.objectif}`),
    chalk.gray(`Input: ${help.input}`),
    chalk.gray(`Output: ${help.output}`),
  ];

  if (help.schema) {
    const schemaLines = help.schema.split('\n').filter(l => l.trim());
    lines.push('');
    lines.push(...schemaLines.map(l => chalk.yellow(l)));
  }

  return lines.join('\n');
}

/**
 * Génère les choix du menu avec état activé/désactivé selon les prérequis
 */
function getMenuChoices() {
  const status = getStepsStatus();

  // Helper pour créer un choix désactivé
  const disabled = (name, reason) => ({
    name: chalk.gray(name),
    value: 'disabled',
    disabled: reason
  });

  return [
    new Separator(chalk.cyan.bold('─── PRÉPARATION ───')),
    { name: '0️⃣  [Étape 0] AutoEdit - Générer tracking IA', value: 'autoedit', description: getHelpDescription('autoedit') },
    { name: '0️⃣ᵇ [Étape 0bis] Auditer un domaine existant', value: 'audit', description: getHelpDescription('audit') },

    new Separator(chalk.cyan.bold('─── WORKFLOW TRACKING ───')),
    { name: '1️⃣  [Étape 1] Initialiser tracking/ (init-tracking)', value: 'init-tracking', description: getHelpDescription('init-tracking') },

    // Étapes 2-5 : requièrent étape 1
    status.steps2to5
      ? { name: '2️⃣  [Étape 2] Sélectionner les events (event-setup)', value: 'event-setup', description: getHelpDescription('event-setup') }
      : disabled('2️⃣  [Étape 2] Sélectionner les events', 'Requiert: init-tracking'),

    status.steps2to5
      ? { name: '3️⃣  [Étape 3] Générer config GTM (gtm-config-setup)', value: 'gtm-config-setup', description: getHelpDescription('gtm-config-setup') }
      : disabled('3️⃣  [Étape 3] Générer config GTM', 'Requiert: init-tracking'),

    status.steps2to5
      ? { name: '4️⃣  [Étape 4] Générer tracking.js (generate-tracking)', value: 'generate-tracking', description: getHelpDescription('generate-tracking') }
      : disabled('4️⃣  [Étape 4] Générer tracking.js', 'Requiert: init-tracking'),

    status.steps2to5
      ? { name: '5️⃣  [Étape 5] Ajouter attributs HTML (html-layer)', value: 'html-layer', description: getHelpDescription('html-layer') }
      : disabled('5️⃣  [Étape 5] Ajouter attributs HTML', 'Requiert: init-tracking'),

    // Étape 6 : verify-tracking (avant création GTM)
    status.step6
      ? { name: '6️⃣  [Étape 6] Vérifier production-ready (verify-tracking)', value: 'verify-tracking', description: getHelpDescription('verify-tracking') }
      : disabled('6️⃣  [Étape 6] Vérifier production-ready', 'Requiert: gtm-config-setup'),

    // Étapes 7-8 : requièrent verify-tracking
    status.steps7to8
      ? { name: '7️⃣  [Étape 7] Créer conteneur GTM (create-gtm-container)', value: 'create-gtm-container', description: getHelpDescription('deploy') }
      : disabled('7️⃣  [Étape 7] Créer conteneur GTM', 'Requiert: verify-tracking'),

    status.steps7to8
      ? { name: '7️⃣ᵇ [Étape 7bis] Synchroniser projet → GTM (sync)', value: 'sync', description: getHelpDescription('sync') }
      : disabled('7️⃣ᵇ [Étape 7bis] Synchroniser projet → GTM', 'Requiert: verify-tracking'),

    status.steps7to8
      ? { name: '8️⃣  [Étape 8] Publier GTM en production (publish)', value: 'publish', description: getHelpDescription('publish') }
      : disabled('8️⃣  [Étape 8] Publier GTM en production', 'Requiert: verify-tracking'),

    new Separator(chalk.cyan.bold('─── UTILITAIRES ───')),
    { name: '🧹 Nettoyer GTM (clean)', value: 'clean', description: getHelpDescription('clean') },
    new Separator(''),
    { name: '❌ Quitter', value: 'exit' }
  ];
}

export async function interactiveMode() {
  console.clear();

  // Logo ASCII
  console.log(chalk.cyan(figlet.textSync('Google Setup', { font: 'Standard' })));
  console.log(chalk.gray('Audit & Déploiement automatique Google Analytics\n'));

  while (true) {
    let action;
    try {
      action = await select({
        message: 'Que voulez-vous faire ?',
        choices: getMenuChoices(),
        pageSize: 20
      });
    } catch (e) {
      // Ctrl+C
      console.log(chalk.green('\n✨ À bientôt !\n'));
      process.exit(0);
    }

    // Ignorer les choix désactivés
    if (action === 'disabled') {
      continue;
    }

    if (action === 'exit') {
      console.log(chalk.green('\n✨ À bientôt !\n'));
      process.exit(0);
    }

    console.clear();

    switch (action) {
      case 'init-tracking':
        await handleInitTrackingInteractive();
        break;
      case 'event-setup':
        await handleEventSetupInteractive();
        break;
      case 'gtm-config-setup':
        await handleGtmConfigSetupInteractive();
        break;
      case 'generate-tracking':
        await handleGenerateTrackingInteractive();
        break;
      case 'create-gtm-container':
        await handleCreateGtmContainerInteractive();
        break;
      case 'html-layer':
        await handleHtmlLayerInteractive();
        break;
      case 'verify-tracking':
        await handleVerifyTrackingInteractive();
        break;
      case 'autoedit':
        await handleAutoEditInteractive();
        break;
      case 'sync':
        await handleSyncInteractive();
        break;
      case 'clean':
        await handleCleanInteractive();
        break;
      case 'audit':
        await handleAuditInteractive();
        break;
      case 'publish':
        await handlePublishInteractive();
        break;
    }

    // Ré-afficher le header après une commande
    console.log();
    console.log(chalk.cyan(figlet.textSync('Google Setup', { font: 'Standard' })));
    console.log(chalk.gray('Audit & Déploiement automatique Google Analytics\n'));
  }
}

async function handleAuditInteractive() {
  const domains = await input({
    message: 'Domaine(s) à auditer (séparés par des virgules) :',
    validate: v => v.length > 0 || 'Au moins un domaine requis'
  });

  await runAudit({ domains });
  console.log('');
}

async function handleCreateGtmContainerInteractive() {
  // Essayer de charger la config locale
  const { existsSync, readFileSync } = await import('fs');
  const { join } = await import('path');

  const configPath = join(process.cwd(), '.google-setup.json');
  let localConfig = null;

  if (existsSync(configPath)) {
    try {
      localConfig = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch (e) {
      // Ignore
    }
  }

  if (localConfig && localConfig.domain) {
    console.log(chalk.green('✓ Configuration locale détectée'));
    console.log(chalk.gray(`   Domaine: ${localConfig.domain}`));
    console.log(chalk.gray(`   Projet: ${localConfig.projectName || ''}`));
    console.log();

    const useLocal = await confirm({
      message: 'Utiliser cette configuration ?',
      default: true
    });

    if (useLocal) {
      await runCreateGtmContainer({
        domain: localConfig.domain,
        name: localConfig.projectName,
        path: process.cwd()
      });
      console.log('');
      return;
    }
  }

  const domain = await input({
    message: 'Domaine cible :',
    validate: v => /^[a-z0-9\-\.]+\.[a-z]{2,}$/i.test(v) || 'Domaine invalide'
  });

  const name = await input({
    message: 'Nom du projet :',
    default: domain.split('.')[0]
  });

  await runCreateGtmContainer({ domain, name, path: process.cwd() });
  console.log('');
}

async function handleSyncInteractive() {
  const path = await input({
    message: 'Chemin du projet local (entrée = répertoire courant) :',
    default: process.cwd()
  });

  const domain = await input({
    message: 'Domaine cible (pour le conteneur GTM) :',
    validate: v => /^[a-z0-9\-\.]+\.[a-z]{2,}$/i.test(v) || 'Domaine invalide'
  });

  await runSync({ path, domain });
  console.log('');
}

async function handleAutoEditInteractive() {
  console.log();
  console.log(chalk.cyan.bold('🤖 AutoEdit - Pipeline IA 8 étapes'));
  console.log(chalk.gray('Génère automatiquement un tracking plan en analysant vos fichiers HTML avec l\'IA.\n'));

  console.log(chalk.white('Les 8 étapes du pipeline:'));
  console.log(chalk.gray('  1. HTML Scan      - Scanner les fichiers HTML'));
  console.log(chalk.gray('  2. AI Analysis    - Identifier les events avec l\'IA'));
  console.log(chalk.gray('  3. Grouping       - Consolider les events similaires'));
  console.log(chalk.gray('  4. Selector Finder - Trouver des sélecteurs CSS robustes'));
  console.log(chalk.gray('  5. YAML Build     - Construire la configuration'));
  console.log(chalk.gray('  6. YAML Merge     - Fusionner avec l\'existant'));
  console.log(chalk.gray('  7. Validation     - Vérifier la cohérence'));
  console.log(chalk.gray('  8. Generation     - Écrire les fichiers finaux\n'));

  const mode = await select({
    message: 'Comment voulez-vous exécuter le pipeline ?',
    choices: [
      { name: '🚀 Exécuter toutes les étapes (recommandé)', value: 'all' },
      { name: '1️⃣  Étape 1 - HTML Scan', value: '1' },
      { name: '2️⃣  Étape 2 - AI Analysis', value: '2' },
      { name: '3️⃣  Étape 3 - Grouping', value: '3' },
      { name: '4️⃣  Étape 4 - Selector Finder', value: '4' },
      { name: '5️⃣  Étape 5 - YAML Build', value: '5' },
      { name: '6️⃣  Étape 6 - YAML Merge', value: '6' },
      { name: '7️⃣  Étape 7 - Validation', value: '7' },
      { name: '8️⃣  Étape 8 - Generation', value: '8' },
      { name: '↩️  Retour au menu', value: 'back' }
    ]
  });

  if (mode === 'back') {
    return;
  }

  const projectPath = await input({
    message: 'Chemin du projet (entrée = répertoire courant) :',
    default: process.cwd()
  });

  const source = await input({
    message: 'Chemin des fichiers HTML à scanner (entrée = même que projet) :',
    default: ''
  });

  const debug = await confirm({
    message: 'Activer le mode debug (sauvegarder les données intermédiaires) ?',
    default: true
  });

  const options = {
    path: projectPath,
    source: source || projectPath,
    debug: debug,
    step: mode !== 'all' ? mode : undefined
  };

  await runAutoEdit(options);
  console.log('');
}
