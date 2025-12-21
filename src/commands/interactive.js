import inquirer from 'inquirer';
import chalk from 'chalk';
import figlet from 'figlet';
import { runAudit } from './audit.js';
import { runDeploy } from './deploy.js';
import { runStatus } from './status.js';
import { runContinue } from './continue.js';
import { runSync } from './sync.js';

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
        { name: '📋 Voir la progression d\'un site (status)', value: 'status' },
        { name: '▶️  Continuer le déploiement (continue)', value: 'continue' },
        { name: '🔄 Synchroniser projet local → GTM (sync)', value: 'sync' },
        { name: '🔍 Auditer un ou plusieurs domaines', value: 'audit' },
        { name: '🚀 Déployer from scratch', value: 'deploy' },
        { name: '❌ Quitter', value: 'exit' }
      ]
    }]);

    if (action === 'exit') {
      console.log(chalk.green('\n✨ À bientôt !\n'));
      process.exit(0);
    }

    if (action === 'status') {
      await handleStatusInteractive();
    }

    if (action === 'continue') {
      await handleContinueInteractive();
    }

    if (action === 'sync') {
      await handleSyncInteractive();
    }

    if (action === 'audit') {
      await handleAuditInteractive();
    }

    if (action === 'deploy') {
      await handleDeployInteractive();
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

  console.log(''); // Ligne vide avant le retour au menu
}

async function handleDeployInteractive() {
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
    },
    {
      type: 'list',
      name: 'template',
      message: 'Template GTM :',
      choices: [
        { name: 'Lead Generation (CTA, formulaires, téléphone)', value: 'lead-gen' },
        { name: 'E-commerce (panier, achat)', value: 'ecommerce' },
        { name: 'Minimal (GA4 pageviews)', value: 'minimal' }
      ]
    }
  ]);

  await runDeploy(answers);

  console.log(''); // Ligne vide avant le retour au menu
}

async function handleStatusInteractive() {
  const { domain } = await inquirer.prompt([{
    type: 'input',
    name: 'domain',
    message: 'Domaine à analyser :',
    validate: v => /^[a-z0-9\-\.]+\.[a-z]{2,}$/i.test(v) || 'Domaine invalide'
  }]);

  await runStatus({ domain });

  console.log(''); // Ligne vide avant le retour au menu
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
      type: 'list',
      name: 'template',
      message: 'Template GTM (si création nécessaire) :',
      choices: [
        { name: 'Lead Generation (CTA, formulaires, téléphone)', value: 'lead-gen' },
        { name: 'E-commerce (panier, achat)', value: 'ecommerce' },
        { name: 'Minimal (GA4 pageviews)', value: 'minimal' }
      ]
    },
    {
      type: 'confirm',
      name: 'auto',
      message: 'Mode automatique (sans confirmation à chaque étape) ?',
      default: false
    }
  ]);

  await runContinue(answers);

  console.log(''); // Ligne vide avant le retour au menu
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

  console.log(''); // Ligne vide avant le retour au menu
}
