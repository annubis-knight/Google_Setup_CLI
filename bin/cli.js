#!/usr/bin/env node
import { Command } from 'commander';
import { interactiveMode } from '../src/commands/interactive.js';
import { runAudit } from '../src/commands/audit.js';
import { runDeploy } from '../src/commands/deploy.js';
import { runInit } from '../src/commands/init.js';
import { runStatus } from '../src/commands/status.js';
import { runContinue } from '../src/commands/continue.js';
import { runSync } from '../src/commands/sync.js';
import { runInitTracking } from '../src/commands/init-tracking.js';
import { runGenerateTracking } from '../src/commands/generate-tracking.js';
import { runClean } from '../src/commands/clean.js';
import { runEditConfigAuto } from '../src/commands/editconfig-auto.js';
import { runAutoEdit } from '../src/commands/autoedit.js';

const program = new Command();

program
  .name('google-setup')
  .description('Audit & Déploiement automatique Google Analytics')
  .version('2.0.0');

program
  .command('init')
  .description('Configurer les credentials Google API')
  .action(runInit);

program
  .command('audit')
  .description('Auditer un ou plusieurs domaines')
  .option('-d, --domains <domains>', 'Domaines séparés par des virgules')
  .option('-o, --output <type>', 'Format de sortie (console|json)', 'console')
  .action(runAudit);

program
  .command('deploy')
  .description('Déployer la configuration sur un domaine')
  .option('-d, --domain <domain>', 'Domaine cible')
  .option('-n, --name <name>', 'Nom du projet')
  .option('-t, --template <template>', 'Template GTM (minimal|lead-gen|ecommerce)', 'lead-gen')
  .option('--auto', 'Mode automatique sans confirmation')
  .action(runDeploy);

program
  .command('status')
  .description('Voir la checklist de progression KPI')
  .option('-d, --domain <domain>', 'Domaine à analyser')
  .action(runStatus);

program
  .command('continue')
  .description('Continuer le déploiement automatiquement')
  .option('-d, --domain <domain>', 'Domaine cible')
  .option('-t, --template <template>', 'Template GTM (minimal|lead-gen|ecommerce)', 'lead-gen')
  .option('--auto', 'Mode automatique sans confirmation')
  .action(runContinue);

program
  .command('sync')
  .description('Synchroniser le projet local avec GTM (dataLayer → triggers/variables)')
  .option('-p, --path <path>', 'Chemin du projet (défaut: répertoire courant)')
  .option('-d, --domain <domain>', 'Domaine cible')
  .option('--auto', 'Mode automatique sans confirmation')
  .action(runSync);

program
  .command('init-tracking')
  .description('Générer les fichiers de plan de taggage (YAML + Markdown)')
  .option('-p, --path <path>', 'Chemin du projet (défaut: répertoire courant)')
  .option('-o, --output <dir>', 'Dossier de sortie (défaut: tracking)')
  .option('--force', 'Écraser les fichiers existants')
  .action(runInitTracking);

program
  .command('generate-tracking')
  .description('Générer gtm-tracking.js à partir du tracking-plan.yml')
  .option('-p, --path <path>', 'Chemin du projet (défaut: répertoire courant)')
  .option('-i, --input <dir>', 'Dossier du YAML (défaut: tracking)')
  .option('-o, --output <file>', 'Fichier de sortie (défaut: gtm-tracking.js)')
  .option('--force', 'Écraser si le fichier existe')
  .action(runGenerateTracking);

program
  .command('clean')
  .description('Nettoyer GTM : supprimer triggers/tags/variables orphelins')
  .option('-d, --domain <domain>', 'Domaine cible')
  .option('-p, --path <path>', 'Chemin du projet local (défaut: répertoire courant)')
  .option('--dry-run', 'Voir ce qui serait supprimé sans supprimer')
  .option('--force', 'Supprimer sans confirmation')
  .action(runClean);

program
  .command('editconfig-auto')
  .description('Optimiser le tracking plan : consolider les events similaires')
  .option('-p, --path <path>', 'Chemin du projet (défaut: répertoire courant)')
  .option('--auto', 'Appliquer automatiquement les optimisations recommandées')
  .option('--dry-run', 'Prévisualiser sans modifier le fichier')
  .option('--force', 'Sauvegarder sans confirmation')
  .action(runEditConfigAuto);

program
  .command('autoedit')
  .description('Analyser le HTML avec IA et générer le tracking plan automatiquement')
  .option('-p, --path <path>', 'Chemin du projet (défaut: répertoire courant)')
  .option('-s, --source <path>', 'Chemin des fichiers HTML à scanner (défaut: même que --path)')
  .option('--ai <model>', 'Modèle IA (gemini-flash, claude-haiku, gpt-4o-mini)')
  .option('-n, --name <name>', 'Nom du projet')
  .option('-d, --domain <domain>', 'Domaine du site')
  .option('-t, --type <type>', 'Type de site (lead-gen, ecommerce, saas, media)', 'lead-gen')
  .option('--exclude <folders>', 'Dossiers à exclure (séparés par virgules, ex: "temp,backup")')
  .option('--include-build', 'Inclure les dossiers de build (dist, build, .next sont exclus par défaut)')
  .option('--auto', 'Mode automatique sans confirmation')
  .option('--dry-run', 'Prévisualiser sans sauvegarder')
  .option('--force', 'Sauvegarder sans confirmation')
  .option('--debug', 'Sauvegarder les réponses IA brutes dans tracking/debug/')
  .action(runAutoEdit);

// Mode interactif par défaut si aucun argument
if (process.argv.length === 2) {
  interactiveMode();
} else {
  program.parse();
}
