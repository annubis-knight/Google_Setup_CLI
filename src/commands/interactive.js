import inquirer from 'inquirer';
import pkg from 'enquirer';
const { Select } = pkg;
import chalk from 'chalk';
import figlet from 'figlet';
import { runAudit } from './audit.js';
import { runDeploy } from './deploy.js';
import { runSync } from './sync.js';
import { handleInitTrackingInteractive } from './init-tracking.js';
import { handleEventSetupInteractive } from './event-setup.js';
import { handleGtmConfigSetupInteractive } from './gtm-config-setup.js';
import { handleHtmlLayerInteractive } from './html-layer.js';
import { handleCleanInteractive } from './clean.js';
import { runAutoEdit } from './autoedit.js';
import { handleGenerateTrackingInteractive } from './generate-tracking.js';
import { handleVerifyTrackingInteractive } from './verify-tracking.js';

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
 * Afficher le panneau d'aide pour une commande
 */
function displayHelpPanel(commandValue) {
  const help = COMMAND_HELP[commandValue];
  if (!help || commandValue === 'exit') return '';

  const lines = [
    '',
    chalk.cyan('┌' + '─'.repeat(70) + '┐'),
    chalk.cyan('│') + chalk.bold.white(` ${help.description}`.padEnd(70)) + chalk.cyan('│'),
    chalk.cyan('├' + '─'.repeat(70) + '┤'),
    chalk.cyan('│') + chalk.gray(` Objectif: ${help.objectif}`.padEnd(70)) + chalk.cyan('│'),
    chalk.cyan('│') + chalk.gray(` Input:    ${help.input}`.padEnd(70)) + chalk.cyan('│'),
    chalk.cyan('│') + chalk.gray(` Output:   ${help.output}`.padEnd(70)) + chalk.cyan('│'),
    chalk.cyan('├' + '─'.repeat(70) + '┤'),
  ];

  // Ajouter le schéma ASCII
  const schemaLines = help.schema.split('\n').filter(l => l.trim());
  for (const line of schemaLines) {
    lines.push(chalk.cyan('│') + chalk.yellow(line.padEnd(70)) + chalk.cyan('│'));
  }

  lines.push(chalk.cyan('└' + '─'.repeat(70) + '┘'));

  return lines.join('\n');
}

/**
 * Menu principal avec descriptions dynamiques
 */
const MENU_CHOICES = [
  { message: chalk.cyan.bold('─── PRÉPARATION ───'), role: 'separator' },
  { name: '0️⃣  [Étape 0] AutoEdit - Générer tracking IA', value: 'autoedit' },
  { name: '0️⃣ᵇ [Étape 0bis] Auditer un domaine existant', value: 'audit' },
  { message: chalk.cyan.bold('─── WORKFLOW TRACKING ───'), role: 'separator' },
  { name: '1️⃣  [Étape 1] Initialiser tracking/ (init-tracking)', value: 'init-tracking' },
  { name: '2️⃣  [Étape 2] Sélectionner les events (event-setup)', value: 'event-setup' },
  { name: '3️⃣  [Étape 3] Générer config GTM (gtm-config-setup)', value: 'gtm-config-setup' },
  { name: '4️⃣  [Étape 4] Générer tracking.js (generate-tracking)', value: 'generate-tracking' },
  { name: '5️⃣  [Étape 5] Ajouter attributs HTML (html-layer)', value: 'html-layer' },
  { name: '6️⃣  [Étape 6] Déployer dans GTM (deploy)', value: 'deploy' },
  { name: '6️⃣ᵇ [Étape 6bis] Synchroniser projet → GTM (sync)', value: 'sync' },
  { name: '7️⃣  [Étape 7] Vérifier production-ready (verify-tracking)', value: 'verify-tracking' },
  { message: chalk.cyan.bold('─── UTILITAIRES ───'), role: 'separator' },
  { name: '🧹 Nettoyer GTM (clean)', value: 'clean' },
  { message: '', role: 'separator' },
  { name: '❌ Quitter', value: 'exit' }
];

export async function interactiveMode() {
  console.clear();

  // Logo ASCII
  console.log(chalk.cyan(figlet.textSync('Google Setup', { font: 'Standard' })));
  console.log(chalk.gray('Audit & Déploiement automatique Google Analytics\n'));

  while (true) {
    // Utiliser enquirer Select avec footer dynamique
    const prompt = new Select({
      name: 'action',
      message: 'Que voulez-vous faire ?',
      choices: MENU_CHOICES,
      footer() {
        return displayHelpPanel(this.focused?.value);
      }
    });

    let action;
    try {
      action = await prompt.run();
    } catch (e) {
      // Ctrl+C
      console.log(chalk.green('\n✨ À bientôt !\n'));
      process.exit(0);
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
      case 'deploy':
        await handleDeployInteractive();
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
    }

    // Ré-afficher le header après une commande
    console.log();
    console.log(chalk.cyan(figlet.textSync('Google Setup', { font: 'Standard' })));
    console.log(chalk.gray('Audit & Déploiement automatique Google Analytics\n'));
  }
}

async function handleAuditInteractive() {
  const { domains } = await inquirer.prompt([{
    type: 'input',
    name: 'domains',
    message: 'Domaine(s) à auditer (séparés par des virgules) :',
    validate: v => v.length > 0 || 'Au moins un domaine requis'
  }]);

  await runAudit({ domains });
  console.log('');
}

async function handleDeployInteractive() {
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

    const { useLocal } = await inquirer.prompt([{
      type: 'confirm',
      name: 'useLocal',
      message: 'Utiliser cette configuration ?',
      default: true
    }]);

    if (useLocal) {
      await runDeploy({
        domain: localConfig.domain,
        name: localConfig.projectName,
        path: process.cwd()
      });
      console.log('');
      return;
    }
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'domain',
      message: 'Domaine cible :',
      validate: v => /^[a-z0-9\-\.]+\.[a-z]{2,}$/i.test(v) || 'Domaine invalide'
    },
    {
      type: 'input',
      name: 'name',
      message: 'Nom du projet :',
      default: (ans) => ans.domain.split('.')[0]
    }
  ]);

  await runDeploy({ ...answers, path: process.cwd() });
  console.log('');
}

async function handleSyncInteractive() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'path',
      message: 'Chemin du projet local (entrée = répertoire courant) :',
      default: process.cwd()
    },
    {
      type: 'input',
      name: 'domain',
      message: 'Domaine cible (pour le conteneur GTM) :',
      validate: v => /^[a-z0-9\-\.]+\.[a-z]{2,}$/i.test(v) || 'Domaine invalide'
    }
  ]);

  await runSync(answers);
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

  const { mode } = await inquirer.prompt([{
    type: 'list',
    name: 'mode',
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
  }]);

  if (mode === 'back') {
    return;
  }

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'path',
      message: 'Chemin du projet (entrée = répertoire courant) :',
      default: process.cwd()
    },
    {
      type: 'input',
      name: 'source',
      message: 'Chemin des fichiers HTML à scanner (entrée = même que projet) :',
      default: ''
    },
    {
      type: 'confirm',
      name: 'debug',
      message: 'Activer le mode debug (sauvegarder les données intermédiaires) ?',
      default: true
    }
  ]);

  const options = {
    path: answers.path,
    source: answers.source || answers.path,
    debug: answers.debug,
    step: mode !== 'all' ? mode : undefined
  };

  await runAutoEdit(options);
  console.log('');
}
