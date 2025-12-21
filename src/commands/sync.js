/**
 * Commande sync - Synchronise le projet local avec GTM
 * Détecte les dataLayer dans le code et les crée dans GTM
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import boxen from 'boxen';
import { loadConfig, getAuthClient } from '../utils/auth.js';
import { detectGTM } from '../detectors/gtm-detector.js';
import { detectGA4 } from '../detectors/ga4-detector.js';
import { detectLocalProject, compareLocalWithGTM, generateSyncReport } from '../detectors/local-project-detector.js';
import { fullSync } from '../deployers/gtm-sync.js';

/**
 * Commande principale sync
 */
export async function runSync(options) {
  const projectPath = options.path || process.cwd();
  const domain = options.domain;
  const autoMode = options.auto || false;

  console.log();
  console.log(chalk.cyan.bold('🔄 SYNCHRONISATION PROJET LOCAL → GTM'));
  console.log(chalk.cyan('─'.repeat(50)));
  console.log();

  // 1. Détecter le projet local
  const spinnerLocal = ora('Analyse du projet local...').start();

  const localData = detectLocalProject(projectPath);

  if (!localData.found) {
    spinnerLocal.fail('Aucun fichier GTM/tracking trouvé dans le projet');
    console.log(chalk.gray('\nFichiers recherchés:'));
    console.log(chalk.gray('  • gtm-head.html'));
    console.log(chalk.gray('  • gtm-body.html'));
    console.log(chalk.gray('  • tracking.js / gtm-tracking.js / datalayer.js'));
    console.log();
    console.log(chalk.yellow('💡 Conseil: Lancez "google-setup deploy" pour générer ces fichiers'));
    return null;
  }

  spinnerLocal.succeed('Projet local analysé');

  // Afficher les infos du projet local
  console.log();
  console.log(chalk.white.bold('📁 Projet local:'));
  console.log(chalk.gray(`   Chemin: ${localData.projectPath}`));

  if (localData.containerId) {
    console.log(chalk.gray(`   Container GTM: ${localData.containerId}`));
  }

  if (localData.trackingFiles.length > 0) {
    console.log(chalk.gray(`   Fichiers tracking: ${localData.trackingFiles.length}`));
  }

  if (localData.dataLayerEvents.length > 0) {
    console.log(chalk.green(`   Events détectés: ${localData.dataLayerEvents.length}`));
    localData.dataLayerEvents.forEach(e => console.log(chalk.gray(`     • ${e}`)));
  }

  if (localData.dataLayerVariables.length > 0) {
    console.log(chalk.green(`   Variables détectées: ${localData.dataLayerVariables.length}`));
    localData.dataLayerVariables.forEach(v => console.log(chalk.gray(`     • ${v}`)));
  }

  console.log();

  // 2. Connexion à GTM
  const spinnerGTM = ora('Connexion à GTM...').start();

  try {
    await getAuthClient();
    const config = loadConfig();

    if (!config) {
      spinnerGTM.fail('Configuration manquante. Lancez: google-setup init');
      return null;
    }

    // Détecter le domaine (depuis option, config locale, ou demander)
    let targetDomain = domain;

    if (!targetDomain && localData.localConfig?.domain) {
      targetDomain = localData.localConfig.domain;
    }

    if (!targetDomain) {
      spinnerGTM.stop();
      const answer = await inquirer.prompt([{
        type: 'input',
        name: 'domain',
        message: 'Domaine cible (pour trouver le conteneur GTM):',
        validate: v => /^[a-z0-9\-\.]+\.[a-z]{2,}$/i.test(v) || 'Domaine invalide'
      }]);
      targetDomain = answer.domain;
      spinnerGTM.start('Connexion à GTM...');
    }

    // Récupérer les données GTM
    const gtmData = await detectGTM(config.credentials.gtmAccountId, targetDomain);

    if (!gtmData.installed) {
      spinnerGTM.fail(`Conteneur GTM non trouvé pour ${targetDomain}`);
      return null;
    }

    // Récupérer GA4 pour le measurementId
    const ga4Data = await detectGA4(config.credentials.ga4AccountId, targetDomain);

    spinnerGTM.succeed(`GTM connecté: ${gtmData.containerId}`);

    // 3. Comparer local vs GTM
    console.log();
    const comparison = compareLocalWithGTM(localData, gtmData);

    // Afficher le rapport
    console.log(chalk.white.bold('📊 Comparaison Local ↔ GTM:'));
    console.log();

    if (comparison.missingInGTM.events.length > 0) {
      console.log(chalk.yellow(`   ⚠️ Events à créer dans GTM: ${comparison.missingInGTM.events.length}`));
      comparison.missingInGTM.events.forEach(e => console.log(chalk.gray(`     • ${e}`)));
    } else {
      console.log(chalk.green('   ✅ Tous les events sont dans GTM'));
    }

    if (comparison.missingInGTM.variables.length > 0) {
      console.log(chalk.yellow(`   ⚠️ Variables à créer dans GTM: ${comparison.missingInGTM.variables.length}`));
      comparison.missingInGTM.variables.forEach(v => console.log(chalk.gray(`     • ${v}`)));
    } else {
      console.log(chalk.green('   ✅ Toutes les variables sont dans GTM'));
    }

    if (comparison.synced.events.length > 0) {
      console.log(chalk.green(`   ✅ Events synchronisés: ${comparison.synced.events.length}`));
    }

    console.log();

    // 4. Synchronisation
    const hasMissing = comparison.missingInGTM.events.length > 0 ||
                       comparison.missingInGTM.variables.length > 0;

    if (!hasMissing) {
      console.log(boxen(
        chalk.green.bold('✅ Tout est déjà synchronisé !') + '\n\n' +
        chalk.white('Le projet local et GTM sont alignés.'),
        { padding: 1, borderColor: 'green', title: '🎉 Sync OK', titleAlignment: 'center' }
      ));
      return { synced: true, created: 0 };
    }

    // Demander confirmation
    let proceed = autoMode;

    if (!autoMode) {
      const confirm = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: 'Voulez-vous créer ces éléments dans GTM ?',
        default: true
      }]);
      proceed = confirm.proceed;
    }

    if (!proceed) {
      console.log(chalk.yellow('\n⏹️ Synchronisation annulée'));
      return { synced: false, created: 0 };
    }

    // Exécuter la synchronisation
    const spinnerSync = ora('Synchronisation en cours...').start();

    const measurementId = ga4Data?.measurementId || null;
    const syncResults = await fullSync(gtmData, comparison, measurementId);

    spinnerSync.succeed('Synchronisation terminée');

    // Afficher le résultat
    console.log();
    console.log(chalk.white.bold('📋 Résultat:'));

    if (syncResults.events.created > 0) {
      console.log(chalk.green(`   ✅ Triggers créés: ${syncResults.events.created}`));
    }

    if (syncResults.variables.created > 0) {
      console.log(chalk.green(`   ✅ Variables créées: ${syncResults.variables.created}`));
    }

    if (syncResults.events.errors > 0 || syncResults.variables.errors > 0) {
      console.log(chalk.red(`   ❌ Erreurs: ${syncResults.events.errors + syncResults.variables.errors}`));
    }

    console.log();
    console.log(boxen(
      chalk.yellow.bold('⚠️ N\'oubliez pas de PUBLIER dans GTM !') + '\n\n' +
      chalk.white('Les changements sont en brouillon.\n') +
      chalk.gray('Allez dans GTM → Envoyer → Publier'),
      { padding: 1, borderColor: 'yellow', title: '📤 Publication', titleAlignment: 'center' }
    ));

    return syncResults;

  } catch (error) {
    spinnerGTM.fail(`Erreur: ${error.message}`);
    return null;
  }
}
