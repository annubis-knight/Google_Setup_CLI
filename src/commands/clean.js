/**
 * Commande clean - Nettoie GTM en supprimant les éléments orphelins
 * Compare les triggers/tags/variables GTM avec le code local
 * et supprime ceux qui ne sont plus utilisés
 */

import { google } from 'googleapis';
import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import yaml from 'js-yaml';
import ora from 'ora';
import { detectGTM } from '../detectors/gtm-detector.js';
import { detectLocalProject } from '../detectors/local-project-detector.js';
import { loadConfig, getAuthClient } from '../utils/auth.js';

/**
 * Liste des éléments à ne jamais supprimer (système)
 */
const PROTECTED_ELEMENTS = {
  triggers: ['All Pages', 'DOM Ready', 'Window Loaded', 'Initialization - All Pages'],
  tags: [],
  variables: ['Page URL', 'Page Path', 'Page Hostname', 'Referrer', 'Event']
};

/**
 * Nettoie GTM en supprimant les éléments orphelins
 */
export async function runClean(options = {}) {
  const projectPath = resolve(options.path || process.cwd());
  const domain = options.domain;
  const dryRun = options.dryRun || false;
  const force = options.force || false;

  console.log(chalk.cyan('\n🧹 Nettoyage GTM\n'));

  // Vérifier le domaine
  if (!domain) {
    console.log(chalk.red('❌ Domaine requis. Utilisez --domain ou -d'));
    return;
  }

  // Charger la config et authentification
  const config = loadConfig();
  if (!config.gtmAccountId) {
    console.log(chalk.red('❌ Configuration manquante. Lancez d\'abord: google-setup init'));
    return;
  }

  const spinner = ora('Authentification...').start();

  try {
    await getAuthClient();
    spinner.succeed('Authentifié');
  } catch (error) {
    spinner.fail(`Erreur d'authentification: ${error.message}`);
    return;
  }

  // 1. Récupérer les données GTM
  spinner.start('Récupération des données GTM...');
  const gtmData = await detectGTM(config.gtmAccountId, domain);

  if (!gtmData.installed) {
    spinner.fail(`Conteneur GTM non trouvé pour ${domain}`);
    return;
  }

  spinner.succeed(`Conteneur GTM trouvé: ${gtmData.containerId}`);

  // 2. Récupérer les events locaux
  spinner.start('Analyse du code local...');
  const localEvents = await getLocalEvents(projectPath);

  if (localEvents.length === 0) {
    spinner.warn('Aucun event local détecté');
    console.log(chalk.gray('   Vérifiez que vous êtes dans le bon dossier projet'));
    console.log(chalk.gray('   ou que tracking-plan.yml / gtm-tracking.js existe'));
    return;
  }

  spinner.succeed(`${localEvents.length} events locaux détectés`);
  console.log(chalk.gray(`   Events: ${localEvents.join(', ')}`));

  // 3. Comparer et trouver les orphelins
  console.log(chalk.cyan('\n📊 Comparaison Local ↔ GTM...\n'));

  const orphans = findOrphans(gtmData, localEvents);

  if (orphans.triggers.length === 0 && orphans.tags.length === 0 && orphans.variables.length === 0) {
    console.log(chalk.green('✅ GTM est propre ! Aucun élément orphelin détecté.\n'));
    return;
  }

  // 4. Afficher les orphelins
  displayOrphans(orphans);

  const totalOrphans = orphans.triggers.length + orphans.tags.length + orphans.variables.length;
  console.log(chalk.yellow(`\n⚠️  Total: ${totalOrphans} éléments à supprimer\n`));

  // 5. Mode dry-run : s'arrêter ici
  if (dryRun) {
    console.log(chalk.cyan('ℹ️  Mode --dry-run : aucune suppression effectuée'));
    console.log(chalk.gray('   Relancez sans --dry-run pour supprimer\n'));
    return;
  }

  // 6. Demander confirmation (sauf si --force)
  if (!force) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: chalk.red('⚠️  Êtes-vous sûr de vouloir supprimer ces éléments ?'),
      default: false
    }]);

    if (!confirm) {
      console.log(chalk.gray('\nOpération annulée.\n'));
      return;
    }
  }

  // 7. Supprimer les orphelins
  await deleteOrphans(gtmData.workspacePath, orphans);

  console.log(chalk.green('\n✅ Nettoyage terminé !\n'));
  console.log(chalk.yellow('⚠️  N\'oubliez pas de publier une nouvelle version dans GTM'));
}

/**
 * Récupère les events depuis le code local (YAML ou JS)
 */
async function getLocalEvents(projectPath) {
  const events = [];

  // 1. Essayer tracking-plan.yml
  const yamlPath = resolve(projectPath, 'tracking', 'tracking-plan.yml');
  if (existsSync(yamlPath)) {
    try {
      const yamlContent = readFileSync(yamlPath, 'utf8');
      const config = yaml.load(yamlContent);

      for (const event of config.events || []) {
        if (event.enabled === true && event.datalayer?.event_name) {
          events.push(event.datalayer.event_name);
        }
      }

      if (events.length > 0) {
        console.log(chalk.gray(`   Source: tracking/tracking-plan.yml`));
        return events;
      }
    } catch (e) {
      // Ignorer les erreurs de parsing
    }
  }

  // 2. Essayer la détection automatique des fichiers JS
  const localData = detectLocalProject(projectPath);
  if (localData.found && localData.dataLayerEvents.length > 0) {
    console.log(chalk.gray(`   Source: ${localData.trackingFiles.join(', ')}`));
    return localData.dataLayerEvents;
  }

  return events;
}

/**
 * Trouve les éléments GTM orphelins (non utilisés en local)
 */
function findOrphans(gtmData, localEvents) {
  const orphans = {
    triggers: [],
    tags: [],
    variables: []
  };

  // Normaliser les events locaux
  const localEventsLower = localEvents.map(e => e.toLowerCase());

  // Trouver les triggers orphelins (type customEvent)
  for (const trigger of gtmData.triggers) {
    // Ne garder que les triggers customEvent
    if (trigger.type !== 'customEvent' && trigger.type !== 'CUSTOM_EVENT') {
      continue;
    }

    // Protéger les triggers système
    if (PROTECTED_ELEMENTS.triggers.includes(trigger.name)) {
      continue;
    }

    // Extraire le nom de l'event depuis le trigger
    // Format: "EV - event_name" ou "Event - event_name"
    const eventName = trigger.name
      .replace(/^(EV|Event)\s*-\s*/i, '')
      .toLowerCase();

    // Vérifier si l'event existe en local
    const isUsed = localEventsLower.some(local =>
      local === eventName ||
      local.includes(eventName) ||
      eventName.includes(local)
    );

    if (!isUsed) {
      orphans.triggers.push(trigger);
    }
  }

  // Trouver les tags orphelins (type GA4 Event = gaawe)
  for (const tag of gtmData.tags) {
    // Ne garder que les tags GA4 Event
    if (tag.type !== 'gaawe') {
      continue;
    }

    // Protéger les tags système
    if (PROTECTED_ELEMENTS.tags.includes(tag.name)) {
      continue;
    }

    // Extraire le nom de l'event depuis le tag
    // Format: "GA4 - EV - event_name" ou "GA4 - Event - event_name"
    const eventName = tag.name
      .replace(/^GA4\s*-\s*(EV|Event)\s*-\s*/i, '')
      .toLowerCase();

    // Vérifier si l'event existe en local
    const isUsed = localEventsLower.some(local =>
      local === eventName ||
      local.includes(eventName) ||
      eventName.includes(local)
    );

    if (!isUsed) {
      orphans.tags.push(tag);
    }
  }

  // Trouver les variables orphelines (type dataLayer = v)
  for (const variable of gtmData.variables) {
    // Ne garder que les variables dataLayer
    if (variable.type !== 'v') {
      continue;
    }

    // Protéger les variables système
    if (PROTECTED_ELEMENTS.variables.includes(variable.name)) {
      continue;
    }

    // Extraire le nom de la variable
    // Format: "DLV - var_name"
    const varName = variable.name
      .replace(/^DLV\s*-\s*/i, '')
      .toLowerCase();

    // Pour les variables, on vérifie si elles sont liées à un event existant
    // C'est plus délicat, on garde une approche conservatrice
    // On supprime seulement si le préfixe de la variable ne correspond à aucun event
    const isUsed = localEventsLower.some(local => {
      const localPrefix = local.split('_')[0];
      return varName.startsWith(localPrefix) ||
             local.includes(varName.split('_')[0]);
    });

    if (!isUsed) {
      orphans.variables.push(variable);
    }
  }

  return orphans;
}

/**
 * Affiche les orphelins de manière formatée
 */
function displayOrphans(orphans) {
  if (orphans.triggers.length > 0) {
    console.log(chalk.yellow('⚠️  Triggers à supprimer:'));
    orphans.triggers.forEach(t => {
      console.log(chalk.gray(`   • ${t.name}`));
    });
    console.log('');
  }

  if (orphans.tags.length > 0) {
    console.log(chalk.yellow('⚠️  Tags à supprimer:'));
    orphans.tags.forEach(t => {
      console.log(chalk.gray(`   • ${t.name}`));
    });
    console.log('');
  }

  if (orphans.variables.length > 0) {
    console.log(chalk.yellow('⚠️  Variables à supprimer:'));
    orphans.variables.forEach(v => {
      console.log(chalk.gray(`   • ${v.name}`));
    });
    console.log('');
  }
}

/**
 * Supprime les orphelins dans GTM
 */
async function deleteOrphans(workspacePath, orphans) {
  const tagmanager = google.tagmanager('v2');
  const spinner = ora('Suppression en cours...').start();

  let deleted = 0;
  let errors = 0;

  // Supprimer les tags d'abord (car ils dépendent des triggers)
  for (const tag of orphans.tags) {
    try {
      await tagmanager.accounts.containers.workspaces.tags.delete({
        path: `${workspacePath}/tags/${tag.tagId}`
      });
      deleted++;
      spinner.text = `Suppression... (${deleted} éléments)`;
    } catch (e) {
      errors++;
      console.log(chalk.red(`\n   ✗ Erreur tag ${tag.name}: ${e.message}`));
    }
  }

  // Supprimer les triggers
  for (const trigger of orphans.triggers) {
    try {
      await tagmanager.accounts.containers.workspaces.triggers.delete({
        path: `${workspacePath}/triggers/${trigger.triggerId}`
      });
      deleted++;
      spinner.text = `Suppression... (${deleted} éléments)`;
    } catch (e) {
      errors++;
      console.log(chalk.red(`\n   ✗ Erreur trigger ${trigger.name}: ${e.message}`));
    }
  }

  // Supprimer les variables
  for (const variable of orphans.variables) {
    try {
      await tagmanager.accounts.containers.workspaces.variables.delete({
        path: `${workspacePath}/variables/${variable.variableId}`
      });
      deleted++;
      spinner.text = `Suppression... (${deleted} éléments)`;
    } catch (e) {
      errors++;
      console.log(chalk.red(`\n   ✗ Erreur variable ${variable.name}: ${e.message}`));
    }
  }

  if (errors > 0) {
    spinner.warn(`${deleted} supprimés, ${errors} erreurs`);
  } else {
    spinner.succeed(`${deleted} éléments supprimés`);
  }
}

/**
 * Mode interactif
 */
export async function handleCleanInteractive() {
  console.log(chalk.yellow('\n⚠️  Cette commande supprime des éléments dans GTM !\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'domain',
      message: 'Domaine cible :',
      validate: v => /^[a-z0-9\-\.]+\.[a-z]{2,}$/i.test(v) || 'Domaine invalide'
    },
    {
      type: 'input',
      name: 'path',
      message: 'Chemin du projet local :',
      default: process.cwd()
    },
    {
      type: 'confirm',
      name: 'dryRun',
      message: 'Mode simulation (voir sans supprimer) ?',
      default: true
    }
  ]);

  await runClean(answers);
}
