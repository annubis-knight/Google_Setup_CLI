import inquirer from 'inquirer';
import chalk from 'chalk';
import figlet from 'figlet';
import { runAudit } from './audit.js';
import { runDeploy } from './deploy.js';
import { runStatus } from './status.js';
import { runContinue } from './continue.js';
import { runSync } from './sync.js';
import { handleInitTrackingInteractive } from './init-tracking.js';
import { handleEventSetupInteractive } from './event-setup.js';
import { handleGtmConfigSetupInteractive } from './gtm-config-setup.js';
import { handleHtmlLayerInteractive } from './html-layer.js';
import { handleCleanInteractive } from './clean.js';
import { runAutoEdit } from './autoedit.js';
import { handleGenerateTrackingInteractive } from './generate-tracking.js';
import { handleVerifyTrackingInteractive } from './verify-tracking.js';

export async function interactiveMode() {
  console.clear();

  // Logo ASCII
  console.log(chalk.cyan(figlet.textSync('Google Setup', { font: 'Standard' })));
  console.log(chalk.gray('Audit & Déploiement automatique Google Analytics\n'));

  while (true) {
    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Que voulez-vous faire ?',
      choices: [
        new inquirer.Separator(chalk.cyan('─── WORKFLOW TRACKING (7 étapes) ───')),
        { name: '1️⃣  [Étape 1] Initialiser tracking/ (init-tracking)', value: 'init-tracking' },
        { name: '2️⃣  [Étape 2] Sélectionner les events (event-setup)', value: 'event-setup' },
        { name: '3️⃣  [Étape 3] Générer config GTM (gtm-config-setup)', value: 'gtm-config-setup' },
        { name: '4️⃣  [Étape 4] Générer tracking.js (generate-tracking)', value: 'generate-tracking' },
        { name: '5️⃣  [Étape 5] Ajouter attributs HTML (html-layer)', value: 'html-layer' },
        { name: '6️⃣  [Étape 6] Déployer dans GTM (deploy)', value: 'deploy' },
        { name: '7️⃣  [Étape 7] Vérifier production-ready (verify-tracking)', value: 'verify-tracking' },
        new inquirer.Separator(chalk.cyan('─── AUTRES COMMANDES ───')),
        { name: '🤖 AutoEdit - Générer tracking avec IA', value: 'autoedit' },
        { name: '📋 Voir la progression KPI (status)', value: 'status' },
        { name: '▶️  Continuer le déploiement (continue)', value: 'continue' },
        { name: '🔄 Synchroniser projet → GTM (sync)', value: 'sync' },
        { name: '🧹 Nettoyer GTM (clean)', value: 'clean' },
        { name: '🔍 Auditer un domaine', value: 'audit' },
        new inquirer.Separator(''),
        { name: '❌ Quitter', value: 'exit' }
      ]
    }]);

    if (action === 'exit') {
      console.log(chalk.green('\n✨ À bientôt !\n'));
      process.exit(0);
    }

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
      case 'status':
        await handleStatusInteractive();
        break;
      case 'continue':
        await handleContinueInteractive();
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

async function handleStatusInteractive() {
  const { domain } = await inquirer.prompt([{
    type: 'input',
    name: 'domain',
    message: 'Domaine à analyser :',
    validate: v => /^[a-z0-9\-\.]+\.[a-z]{2,}$/i.test(v) || 'Domaine invalide'
  }]);

  await runStatus({ domain });
  console.log('');
}

async function handleContinueInteractive() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'domain',
      message: 'Domaine cible :',
      validate: v => /^[a-z0-9\-\.]+\.[a-z]{2,}$/i.test(v) || 'Domaine invalide'
    },
    {
      type: 'confirm',
      name: 'auto',
      message: 'Mode automatique (sans confirmation à chaque étape) ?',
      default: false
    }
  ]);

  await runContinue({ ...answers, path: process.cwd() });
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
