#!/usr/bin/env node
import { Command } from 'commander';
import { interactiveMode } from '../src/commands/interactive.js';
import { runAudit } from '../src/commands/audit.js';
import { runCreateGtmContainer } from '../src/commands/create-gtm-container.js';
import { runInit } from '../src/commands/init.js';
import { runSync } from '../src/commands/sync.js';
import { runInitTracking } from '../src/commands/init-tracking.js';
import { runEventSetup } from '../src/commands/event-setup.js';
import { runGtmConfigSetup } from '../src/commands/gtm-config-setup.js';
import { runHtmlLayer } from '../src/commands/html-layer.js';
import { runClean } from '../src/commands/clean.js';
import { runAutoEdit } from '../src/commands/autoedit.js';
import { runGenerateTracking } from '../src/commands/generate-tracking.js';
import { runVerifyTracking } from '../src/commands/verify-tracking.js';
import { runPublish } from '../src/commands/publish.js';

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
  .command('create-gtm-container')
  .alias('deploy')  // Rétrocompatibilité
  .description('[Étape 7/8] Créer le conteneur GTM et la propriété GA4')
  .option('-d, --domain <domain>', 'Domaine cible')
  .option('-n, --name <name>', 'Nom du projet')
  .option('-p, --path <path>', 'Chemin du projet (défaut: répertoire courant)')
  .option('--auto', 'Mode automatique sans confirmation')
  .action(runCreateGtmContainer);

program
  .command('sync')
  .description('Synchroniser le projet local avec GTM (dataLayer → triggers/variables)')
  .option('-p, --path <path>', 'Chemin du projet (défaut: répertoire courant)')
  .option('-d, --domain <domain>', 'Domaine cible')
  .option('--auto', 'Mode automatique sans confirmation')
  .action(runSync);

// ============================================
// WORKFLOW TRACKING (Étapes 1-8)
// ============================================

program
  .command('init-tracking')
  .description('[Étape 1/8] Initialiser le dossier tracking/ avec events + rules')
  .option('-p, --path <path>', 'Chemin du projet (défaut: répertoire courant)')
  .option('--force', 'Écraser les fichiers existants')
  .action(runInitTracking);

program
  .command('event-setup')
  .description('[Étape 2/8] Sélectionner les events à tracker')
  .option('-p, --path <path>', 'Chemin du projet (défaut: répertoire courant)')
  .action(runEventSetup);

program
  .command('gtm-config-setup')
  .description('[Étape 3/8] Générer gtm-config.yaml depuis tracking-events.yaml')
  .option('-p, --path <path>', 'Chemin du projet (défaut: répertoire courant)')
  .action(runGtmConfigSetup);

program
  .command('generate-tracking')
  .description('[Étape 4/8] Générer tracking.js depuis tracking-events.yaml')
  .option('-p, --path <path>', 'Chemin du projet (défaut: répertoire courant)')
  .action(runGenerateTracking);

program
  .command('html-layer')
  .description('[Étape 5/8] Ajouter les attributs data-track au HTML')
  .option('-p, --path <path>', 'Chemin du projet (défaut: répertoire courant)')
  .option('-s, --source <path>', 'Chemin des fichiers HTML (défaut: même que path)')
  .action(runHtmlLayer);

program
  .command('verify-tracking')
  .description('[Étape 6/8] Vérifier que tout le setup tracking est complet')
  .option('-p, --path <path>', 'Chemin du projet (défaut: répertoire courant)')
  .action(runVerifyTracking);

program
  .command('publish')
  .description('[Étape 8/8] Publier les modifications GTM en production')
  .option('-d, --domain <domain>', 'Domaine du site')
  .option('-g, --gtm-id <id>', 'GTM Container ID (GTM-XXXXX)')
  .action(runPublish);

// ============================================
// COMMANDES UTILITAIRES
// ============================================

program
  .command('clean')
  .description('Nettoyer GTM : supprimer triggers/tags/variables orphelins')
  .option('-d, --domain <domain>', 'Domaine cible')
  .option('-p, --path <path>', 'Chemin du projet local (défaut: répertoire courant)')
  .option('--dry-run', 'Voir ce qui serait supprimé sans supprimer')
  .option('--force', 'Supprimer sans confirmation')
  .action(runClean);

program
  .command('autoedit')
  .description('Analyser le HTML avec IA et générer le tracking plan automatiquement')
  .option('-p, --path <path>', 'Chemin du projet (défaut: répertoire courant)')
  .option('-s, --source <path>', 'Chemin des fichiers HTML à scanner (défaut: même que --path)')
  .option('--step <number>', 'Exécuter une étape spécifique (1-8)')
  .option('--ai <model>', 'Modèle IA (gemini-flash, claude-haiku, gpt-4o-mini)')
  .option('-n, --name <name>', 'Nom du projet')
  .option('-d, --domain <domain>', 'Domaine du site')
  .option('-t, --type <type>', 'Type de site (lead-gen, ecommerce, saas, media)', 'lead-gen')
  .option('--exclude <folders>', 'Dossiers à exclure (séparés par virgules, ex: "temp,backup")')
  .option('--include-build', 'Inclure les dossiers de build (dist, build, .next sont exclus par défaut)')
  .option('--auto', 'Mode automatique sans confirmation')
  .option('--dry-run', 'Prévisualiser sans sauvegarder')
  .option('--force', 'Sauvegarder sans confirmation')
  .option('--debug', 'Sauvegarder les données de debug dans tracking/debug/')
  .action(runAutoEdit);

// Mode interactif par défaut si aucun argument
if (process.argv.length === 2) {
  interactiveMode();
} else {
  program.parse();
}
