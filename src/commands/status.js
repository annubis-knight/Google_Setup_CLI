/**
 * Commande status - Affiche la checklist de progression d'un site
 */

import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import { loadConfig, getAuthClient } from '../utils/auth.js';
import { detectGTM } from '../detectors/gtm-detector.js';
import { detectGA4 } from '../detectors/ga4-detector.js';
import { detectDataLayer } from '../detectors/datalayer-detector.js';
import { detectSearchConsole } from '../detectors/search-console-detector.js';
import { detectHotjar } from '../detectors/hotjar-detector.js';
import { detectLocalProject, compareLocalWithGTM } from '../detectors/local-project-detector.js';
import { calculateProgress, getProgressSummary } from '../utils/checklist.js';

/**
 * Exécute un audit et retourne les données + progression
 * @param {string} domain - Domaine à analyser
 * @param {Object} config - Configuration
 * @returns {Object} { auditData, progress }
 */
export async function getFullStatus(domain, config) {
  // Audit complet en parallèle
  const [gtmData, ga4Data, scData, hotjarData] = await Promise.all([
    detectGTM(config.credentials.gtmAccountId, domain),
    detectGA4(config.credentials.ga4AccountId, domain),
    detectSearchConsole(domain),
    detectHotjar(domain)
  ]);

  const dataLayerData = detectDataLayer(gtmData);

  const auditData = {
    gtm: gtmData,
    ga4: ga4Data,
    dataLayer: dataLayerData,
    searchConsole: scData,
    hotjar: hotjarData
  };

  const progress = calculateProgress(auditData);

  return { auditData, progress };
}

/**
 * Commande principale status
 */
export async function runStatus(options) {
  const domain = options.domain || options.domains?.split(',')[0];

  if (!domain) {
    console.error(chalk.red('\n❌ Domaine requis. Utilisez: google-setup status -d "mon-site.fr"\n'));
    process.exit(1);
  }

  const spinner = ora(`Analyse de ${domain}...`).start();

  try {
    // Auth
    await getAuthClient();
    const config = loadConfig();

    if (!config) {
      spinner.fail('Configuration manquante. Lancez: google-setup init');
      return null;
    }

    // Récupérer le statut complet
    const { auditData, progress } = await getFullStatus(domain, config);

    spinner.stop();

    // Afficher la checklist
    displayChecklist(progress, domain, auditData);

    return { auditData, progress };

  } catch (error) {
    spinner.fail(`Erreur: ${error.message}`);
    return null;
  }
}

/**
 * Affiche la checklist formatée
 */
function displayChecklist(progress, domain, auditData) {
  console.log();
  console.log(chalk.cyan('═'.repeat(70)));
  console.log(chalk.cyan.bold(`  📋 CHECKLIST - ${domain}`));
  console.log(chalk.cyan('═'.repeat(70)));
  console.log();

  progress.steps.forEach((step, i) => {
    const icon = step.isComplete ? '✅' : (step.blocked ? '⏸️' : '⏳');
    const color = step.isComplete ? 'green' : (step.blocked ? 'gray' : 'yellow');

    console.log(chalk[color].bold(`${icon} ${i + 1}. ${step.name} (${step.progress}%)`));

    if (step.blocked) {
      const depName = progress.steps.find(s => s.id === step.dependsOn)?.name || step.dependsOn;
      console.log(chalk.gray(`   └─ Bloqué par : ${depName}`));
    }

    step.tasksStatus.forEach(task => {
      const taskIcon = task.done ? '✓' : (task.optional ? '○' : '✗');
      const taskColor = task.done ? 'green' : (task.optional ? 'gray' : 'red');

      // Ajouter des détails pour certaines tâches
      let detail = '';
      if (!task.done) {
        detail = getTaskDetail(task.id, auditData);
      }

      console.log(chalk[taskColor](`   ${taskIcon} ${task.name}${detail}`));
    });

    // Afficher les détails techniques pour cette étape
    const techDetails = getTechDetails(step.id, auditData);
    if (techDetails.length > 0) {
      console.log(chalk.gray(`   ┌─ Détails :`));
      techDetails.forEach(detail => {
        console.log(chalk.gray(`   │  ${detail}`));
      });
    }

    console.log();
  });

  // Barre de progression
  console.log(chalk.cyan('─'.repeat(70)));
  const progressBar = createProgressBar(progress.globalProgress, 50);
  console.log(chalk.bold(`🎯 Progression globale : ${progressBar} ${progress.globalProgress}%`));
  console.log(chalk.cyan('─'.repeat(70)));
  console.log();

  // Message selon l'état
  if (progress.isComplete) {
    console.log(boxen(
      chalk.green.bold('🎉 CONFIGURATION 100% COMPLÈTE !') + '\n\n' +
      chalk.white('Tous les outils KPI sont correctement configurés.'),
      { padding: 1, borderColor: 'green', title: '✅ Succès', titleAlignment: 'center' }
    ));
  } else if (progress.nextStep) {
    const nextActions = progress.nextStep.tasksStatus
      .filter(t => !t.done && !t.optional)
      .map(t => `• ${t.name}`)
      .join('\n');

    console.log(boxen(
      chalk.yellow.bold(`🔧 Prochaine étape : ${progress.nextStep.name}`) + '\n\n' +
      chalk.white('Actions requises :\n') +
      chalk.gray(nextActions) + '\n\n' +
      chalk.cyan('💡 Pour continuer automatiquement :') + '\n' +
      chalk.white(`   google-setup continue -d "${domain}"`),
      { padding: 1, borderColor: 'yellow', title: '📍 À faire', titleAlignment: 'center' }
    ));
  }

  // Détection projet local (si présent)
  displayLocalProjectSync(auditData);

  console.log();
}

/**
 * Affiche la synchronisation avec le projet local si détecté
 */
function displayLocalProjectSync(auditData) {
  const localData = detectLocalProject(process.cwd());

  if (!localData.found) {
    return;
  }

  console.log();
  console.log(chalk.cyan('─'.repeat(70)));
  console.log(chalk.cyan.bold('📁 PROJET LOCAL DÉTECTÉ'));
  console.log(chalk.cyan('─'.repeat(70)));
  console.log();

  if (localData.containerId) {
    console.log(chalk.gray(`   Container: ${localData.containerId}`));
  }

  if (localData.trackingFiles.length > 0) {
    console.log(chalk.gray(`   Fichiers: ${localData.trackingFiles.map(f => f.split(/[/\\]/).pop()).join(', ')}`));
  }

  if (localData.dataLayerEvents.length > 0) {
    console.log(chalk.white(`   Events locaux: ${localData.dataLayerEvents.join(', ')}`));
  }

  // Comparer avec GTM
  if (auditData.gtm?.installed) {
    const comparison = compareLocalWithGTM(localData, auditData.gtm);

    if (comparison.missingInGTM.events.length > 0) {
      console.log();
      console.log(chalk.yellow(`   ⚠️ Events à synchroniser vers GTM: ${comparison.missingInGTM.events.length}`));
      comparison.missingInGTM.events.forEach(e => console.log(chalk.gray(`      • ${e}`)));
      console.log();
      console.log(chalk.cyan(`   💡 Lancez: google-setup sync`));
    } else if (localData.dataLayerEvents.length > 0) {
      console.log(chalk.green(`   ✅ Tous les events sont synchronisés avec GTM`));
    }
  }
}

/**
 * Crée une barre de progression visuelle
 */
function createProgressBar(percent, width) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  const filledChar = '█';
  const emptyChar = '░';

  let color = 'red';
  if (percent >= 80) color = 'green';
  else if (percent >= 50) color = 'yellow';

  return chalk[color](filledChar.repeat(filled)) + chalk.gray(emptyChar.repeat(empty));
}

/**
 * Retourne des détails supplémentaires pour une tâche
 */
function getTaskDetail(taskId, auditData) {
  switch (taskId) {
    case 'gtm_events': {
      const count = auditData.gtm?.tags?.filter(t => t.type === 'gaawe').length || 0;
      return count > 0 ? chalk.gray(` [${count}/3]`) : '';
    }
    case 'dl_variables': {
      const count = auditData.dataLayer?.variablesCount || 0;
      return count > 0 ? chalk.gray(` [${count}/5]`) : '';
    }
    case 'dl_triggers': {
      const count = auditData.dataLayer?.customEventTriggers || 0;
      return count > 0 ? chalk.gray(` [${count}/3]`) : '';
    }
    case 'ga4_conversions': {
      const count = auditData.ga4?.conversionsCount || 0;
      return count > 0 ? chalk.gray(` [${count}]`) : '';
    }
    default:
      return '';
  }
}

/**
 * Retourne les détails techniques pour une étape
 */
function getTechDetails(stepId, auditData) {
  const details = [];

  switch (stepId) {
    case 'ga4':
      if (auditData.ga4?.propertyId) {
        details.push(`Property ID: ${auditData.ga4.propertyId}`);
      }
      if (auditData.ga4?.measurementId) {
        details.push(`Measurement ID: ${auditData.ga4.measurementId}`);
      }
      if (auditData.ga4?.dataStreamId) {
        details.push(`Stream: ${auditData.ga4.dataStreamName || auditData.ga4.dataStreamId}`);
      }
      break;

    case 'gtm':
      if (auditData.gtm?.containerId) {
        details.push(`Container: ${auditData.gtm.containerId}`);
      }
      if (auditData.gtm?.tags?.length > 0) {
        details.push(`Balises (${auditData.gtm.tags.length}):`);
        auditData.gtm.tags.forEach(tag => {
          const typeLabel = getTagTypeLabel(tag.type);
          details.push(`  • ${tag.name} [${typeLabel}]`);
        });
      }
      if (auditData.gtm?.triggersCount > 0) {
        details.push(`Triggers: ${auditData.gtm.triggersCount}`);
      }
      if (auditData.gtm?.variablesCount > 0) {
        details.push(`Variables: ${auditData.gtm.variablesCount}`);
      }
      break;

    case 'datalayer':
      if (auditData.dataLayer?.variablesCount > 0) {
        details.push(`Variables DataLayer: ${auditData.dataLayer.variablesCount}`);
      }
      if (auditData.dataLayer?.customEventTriggers > 0) {
        details.push(`Triggers custom events: ${auditData.dataLayer.customEventTriggers}`);
      }
      break;

    case 'search_console':
      if (auditData.searchConsole?.verified) {
        details.push(`Vérifié: Oui`);
      }
      if (auditData.searchConsole?.sitemaps?.length > 0) {
        details.push(`Sitemaps: ${auditData.searchConsole.sitemaps.join(', ')}`);
      }
      break;

    case 'hotjar':
      if (auditData.hotjar?.siteId) {
        details.push(`Site ID: ${auditData.hotjar.siteId}`);
      }
      break;
  }

  return details;
}

/**
 * Convertit le type de balise en label lisible
 */
function getTagTypeLabel(type) {
  const labels = {
    'googtag': 'Google Tag',
    'gaawc': 'GA4 Config',
    'gaawe': 'GA4 Event',
    'html': 'HTML Custom',
    'img': 'Image/Pixel',
    'ua': 'Universal Analytics',
    'awct': 'Google Ads Conversion',
    'sp': 'Google Ads Remarketing',
    'flc': 'Floodlight Counter',
    'fls': 'Floodlight Sales',
    'gclidw': 'GCLID',
    'hjtc': 'Hotjar',
  };
  return labels[type] || type;
}
