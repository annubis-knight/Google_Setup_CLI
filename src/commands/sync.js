/**
 * Commande sync - Synchronise gtm-config.yaml avec GTM
 * Pousse les triggers/tags/variables vers un conteneur GTM existant
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import boxen from 'boxen';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { google } from 'googleapis';
import { loadConfig, getAuthClient } from '../utils/auth.js';
import { detectGTM } from '../detectors/gtm-detector.js';

/**
 * Délai pour éviter de dépasser le quota API GTM
 */
const API_DELAY_MS = 1000;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Récupère les éléments existants dans GTM
 */
async function getExistingGtmElements(containerPath) {
  const tagmanager = google.tagmanager('v2');

  // Récupérer le workspace par défaut
  const workspacesRes = await tagmanager.accounts.containers.workspaces.list({
    parent: containerPath
  });
  const workspace = workspacesRes.data.workspace[0];

  // Récupérer triggers existants
  const triggersRes = await tagmanager.accounts.containers.workspaces.triggers.list({
    parent: workspace.path
  });
  const triggers = (triggersRes.data.trigger || []).map(t => t.name);

  // Récupérer variables existantes
  const variablesRes = await tagmanager.accounts.containers.workspaces.variables.list({
    parent: workspace.path
  });
  const variables = (variablesRes.data.variable || []).map(v => v.name);

  // Récupérer tags existants (avec leur type pour détecter les doublons GA4 Config)
  const tagsRes = await tagmanager.accounts.containers.workspaces.tags.list({
    parent: workspace.path
  });
  const tagsData = tagsRes.data.tag || [];
  const tags = tagsData.map(t => t.name);
  const tagTypes = tagsData.map(t => ({ name: t.name, type: t.type }));

  // Détecter si une balise GA4 Config existe déjà (type gaawc)
  const hasGa4Config = tagsData.some(t => t.type === 'gaawc');
  const ga4ConfigName = tagsData.find(t => t.type === 'gaawc')?.name || null;

  return {
    workspacePath: workspace.path,
    triggers,
    variables,
    tags,
    tagTypes,
    hasGa4Config,
    ga4ConfigName
  };
}

/**
 * Crée les éléments manquants dans GTM depuis gtm-config.yaml
 */
async function syncToGTM(workspacePath, gtmConfig, existing, ga4MeasurementId) {
  const tagmanager = google.tagmanager('v2');
  const results = {
    variables: { created: 0, skipped: 0, errors: [] },
    triggers: { created: 0, skipped: 0, errors: [] },
    tags: { created: 0, skipped: 0, errors: [] }
  };

  // Map pour stocker les IDs des triggers créés (pour lier aux tags)
  const triggerIdMap = {};

  // 1. Créer les variables manquantes
  console.log(chalk.gray('\n   Variables...'));
  for (const v of gtmConfig.variables || []) {
    if (existing.variables.includes(v.name)) {
      results.variables.skipped++;
      continue;
    }

    try {
      let variable;
      if (v.type === 'constant') {
        variable = {
          name: v.name,
          type: 'c',
          parameter: [
            { type: 'TEMPLATE', key: 'value', value: v.value === '{{GA4_MEASUREMENT_ID}}' ? ga4MeasurementId : v.value }
          ]
        };
      } else if (v.type === 'data_layer') {
        variable = {
          name: v.name,
          type: 'v',
          parameter: [
            { type: 'INTEGER', key: 'dataLayerVersion', value: '2' },
            { type: 'TEMPLATE', key: 'name', value: v.data_layer_name }
          ]
        };
      }

      if (variable) {
        await tagmanager.accounts.containers.workspaces.variables.create({
          parent: workspacePath,
          requestBody: variable
        });
        results.variables.created++;
        await delay(API_DELAY_MS);
      }
    } catch (e) {
      results.variables.errors.push({ name: v.name, error: e.message });
    }
  }

  // 2. Créer les triggers manquants
  console.log(chalk.gray('   Triggers...'));
  for (const t of gtmConfig.triggers || []) {
    if (t._category) continue; // Ignorer les séparateurs

    if (existing.triggers.includes(t.name)) {
      results.triggers.skipped++;
      continue;
    }

    try {
      let trigger;
      if (t.type === 'pageview') {
        trigger = {
          name: t.name,
          type: 'pageview'
        };
      } else if (t.type === 'custom_event') {
        trigger = {
          name: t.name,
          type: 'customEvent',
          customEventFilter: [{
            type: 'equals',
            parameter: [
              { type: 'template', key: 'arg0', value: '{{_event}}' },
              { type: 'template', key: 'arg1', value: t.event_name }
            ]
          }]
        };
      }

      if (trigger) {
        const created = await tagmanager.accounts.containers.workspaces.triggers.create({
          parent: workspacePath,
          requestBody: trigger
        });
        triggerIdMap[t.name] = created.data.triggerId;
        results.triggers.created++;
        await delay(API_DELAY_MS);
      }
    } catch (e) {
      results.triggers.errors.push({ name: t.name, error: e.message });
    }
  }

  // Récupérer les IDs des triggers existants
  const triggersRes = await tagmanager.accounts.containers.workspaces.triggers.list({
    parent: workspacePath
  });
  for (const t of triggersRes.data.trigger || []) {
    if (!triggerIdMap[t.name]) {
      triggerIdMap[t.name] = t.triggerId;
    }
  }

  // 3. Créer les tags manquants
  console.log(chalk.gray('   Tags...'));
  for (const tag of gtmConfig.tags || []) {
    // Vérifier si le tag existe déjà par nom
    if (existing.tags.includes(tag.name)) {
      results.tags.skipped++;
      continue;
    }

    // Pour GA4 Config : vérifier si une balise de ce TYPE existe déjà (éviter doublons)
    if (tag.type === 'ga4_configuration' && existing.hasGa4Config) {
      console.log(chalk.yellow(`      ⏭️  GA4 Config déjà présente: "${existing.ga4ConfigName}"`));
      results.tags.skipped++;
      continue;
    }

    try {
      let gtmTag;

      if (tag.type === 'ga4_configuration') {
        gtmTag = {
          name: tag.name,
          type: 'gaawc',
          parameter: [
            { type: 'TEMPLATE', key: 'measurementId', value: ga4MeasurementId }
          ],
          firingTriggerId: [triggerIdMap[tag.triggers?.[0]] || triggerIdMap['All Pages']].filter(Boolean)
        };
      } else if (tag.type === 'ga4_event') {
        // Construire les event parameters
        const eventParams = [];
        for (const param of tag.event_parameters || []) {
          eventParams.push({
            type: 'map',
            map: [
              { type: 'TEMPLATE', key: 'name', value: param.name },
              { type: 'TEMPLATE', key: 'value', value: param.value }
            ]
          });
        }

        // Récupérer les IDs des triggers associés
        const firingTriggerIds = (tag.triggers || [])
          .map(name => triggerIdMap[name])
          .filter(Boolean);

        gtmTag = {
          name: tag.name,
          type: 'gaawe',
          parameter: [
            { type: 'TEMPLATE', key: 'eventName', value: '{{Event}}' },
            { type: 'TAG_REFERENCE', key: 'measurementId', value: tag.configuration_tag || 'GA4 - Config' },
            { type: 'LIST', key: 'eventParameters', list: eventParams }
          ],
          firingTriggerId: firingTriggerIds
        };
      }

      if (gtmTag && gtmTag.firingTriggerId?.length > 0) {
        await tagmanager.accounts.containers.workspaces.tags.create({
          parent: workspacePath,
          requestBody: gtmTag
        });
        results.tags.created++;
        await delay(API_DELAY_MS);
      } else if (gtmTag) {
        results.tags.errors.push({ name: tag.name, error: 'Pas de triggers associés trouvés' });
      }
    } catch (e) {
      results.tags.errors.push({ name: tag.name, error: e.message });
    }
  }

  return results;
}

/**
 * Commande principale sync
 */
export async function runSync(options) {
  const projectPath = options.path || process.cwd();
  const gtmConfigPath = join(projectPath, 'tracking', 'gtm-config.yaml');
  const localConfigPath = join(projectPath, '.google-setup.json');

  console.log();
  console.log(chalk.cyan.bold('🔄 Synchronisation gtm-config.yaml → GTM'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log();

  // 1. Vérifier que gtm-config.yaml existe
  if (!existsSync(gtmConfigPath)) {
    console.log(chalk.red('✗ Fichier gtm-config.yaml non trouvé.'));
    console.log(chalk.gray('  Lancez d\'abord: google-setup gtm-config-setup'));
    return null;
  }

  // 2. Lire la config YAML
  let gtmConfig;
  try {
    const yamlContent = readFileSync(gtmConfigPath, 'utf8');
    gtmConfig = yaml.load(yamlContent);
  } catch (e) {
    console.log(chalk.red(`✗ Erreur lecture gtm-config.yaml: ${e.message}`));
    return null;
  }

  // Compter les éléments
  const triggerCount = (gtmConfig.triggers || []).filter(t => !t._category).length;
  const tagCount = (gtmConfig.tags || []).length;
  const varCount = (gtmConfig.variables || []).length;

  console.log(chalk.white.bold('📁 Configuration locale:'));
  console.log(chalk.gray(`   Fichier: tracking/gtm-config.yaml`));
  console.log(chalk.green(`   ${varCount} variables, ${triggerCount} triggers, ${tagCount} tags`));
  console.log();

  // 3. Charger config locale pour le domaine
  let localConfig = null;
  if (existsSync(localConfigPath)) {
    try {
      localConfig = JSON.parse(readFileSync(localConfigPath, 'utf8'));
    } catch (e) {
      // Ignore
    }
  }

  // 4. Déterminer le domaine
  let domain = options.domain || localConfig?.domain || gtmConfig.project?.domain;

  if (!domain) {
    const answer = await inquirer.prompt([{
      type: 'input',
      name: 'domain',
      message: 'Domaine cible (pour trouver le conteneur GTM):',
      validate: v => /^[a-z0-9\-\.]+\.[a-z]{2,}$/i.test(v) || 'Domaine invalide'
    }]);
    domain = answer.domain;
  }

  // 5. Connexion GTM
  const spinner = ora('Connexion à GTM...').start();

  try {
    await getAuthClient();
    const config = loadConfig();

    if (!config) {
      spinner.fail('Configuration manquante. Lancez: google-setup init');
      return null;
    }

    // Détecter le conteneur GTM
    const gtmData = await detectGTM(config.credentials.gtmAccountId, domain);

    if (!gtmData.installed) {
      spinner.fail(`Conteneur GTM non trouvé pour ${domain}`);
      console.log(chalk.gray('  Lancez d\'abord: google-setup deploy'));
      return null;
    }

    spinner.succeed(`GTM connecté: ${gtmData.containerId}`);

    // 6. Récupérer les éléments existants
    spinner.start('Analyse du conteneur GTM...');
    const existing = await getExistingGtmElements(gtmData.containerPath);
    spinner.succeed('Conteneur GTM analysé');

    // 7. Calculer ce qui manque
    const missingVars = (gtmConfig.variables || []).filter(v => !existing.variables.includes(v.name));
    const missingTriggers = (gtmConfig.triggers || []).filter(t => !t._category && !existing.triggers.includes(t.name));

    // Pour les tags : exclure GA4 Config si une existe déjà (par type, pas par nom)
    const missingTags = (gtmConfig.tags || []).filter(t => {
      // Si le nom existe déjà, pas besoin de créer
      if (existing.tags.includes(t.name)) return false;
      // Si c'est une GA4 Config et qu'il en existe déjà une (peu importe le nom), skip
      if (t.type === 'ga4_configuration' && existing.hasGa4Config) return false;
      return true;
    });

    console.log();
    console.log(chalk.white.bold('📊 Comparaison Local ↔ GTM:'));

    if (missingVars.length > 0) {
      console.log(chalk.yellow(`   ⚠️  Variables à créer: ${missingVars.length}`));
      missingVars.forEach(v => console.log(chalk.gray(`      • ${v.name}`)));
    } else {
      console.log(chalk.green('   ✅ Toutes les variables existent'));
    }

    if (missingTriggers.length > 0) {
      console.log(chalk.yellow(`   ⚠️  Triggers à créer: ${missingTriggers.length}`));
      missingTriggers.slice(0, 5).forEach(t => console.log(chalk.gray(`      • ${t.name}`)));
      if (missingTriggers.length > 5) {
        console.log(chalk.gray(`      ... et ${missingTriggers.length - 5} autres`));
      }
    } else {
      console.log(chalk.green('   ✅ Tous les triggers existent'));
    }

    // Afficher info GA4 Config existante
    if (existing.hasGa4Config) {
      console.log(chalk.green(`   ✅ GA4 Config existante: "${existing.ga4ConfigName}"`));
    }

    if (missingTags.length > 0) {
      console.log(chalk.yellow(`   ⚠️  Tags à créer: ${missingTags.length}`));
      missingTags.forEach(t => console.log(chalk.gray(`      • ${t.name}`)));
    } else {
      console.log(chalk.green('   ✅ Tous les tags existent'));
    }

    console.log();

    // 8. Vérifier s'il y a quelque chose à faire
    const hasMissing = missingVars.length > 0 || missingTriggers.length > 0 || missingTags.length > 0;

    if (!hasMissing) {
      console.log(boxen(
        chalk.green.bold('✅ Tout est déjà synchronisé !') + '\n\n' +
        chalk.white('Le fichier gtm-config.yaml et GTM sont alignés.'),
        { padding: 1, borderColor: 'green', title: '🎉 Sync OK', titleAlignment: 'center' }
      ));
      return { synced: true, created: 0 };
    }

    // 9. Demander confirmation
    if (!options.auto) {
      const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: 'Créer ces éléments dans GTM ?',
        default: true
      }]);

      if (!proceed) {
        console.log(chalk.yellow('\n⏹️ Synchronisation annulée'));
        return { synced: false, created: 0 };
      }
    }

    // 10. Exécuter la synchronisation
    spinner.start('Synchronisation en cours...');

    const ga4MeasurementId = localConfig?.ga4?.measurementId ||
                             gtmConfig.project?.ga4_measurement_id ||
                             'G-XXXXXXXXX';

    const results = await syncToGTM(existing.workspacePath, gtmConfig, existing, ga4MeasurementId);

    spinner.succeed('Synchronisation terminée');

    // 11. Afficher le résultat
    console.log();
    console.log(chalk.white.bold('📋 Résultat:'));

    if (results.variables.created > 0) {
      console.log(chalk.green(`   ✅ Variables créées: ${results.variables.created}`));
    }
    if (results.variables.skipped > 0) {
      console.log(chalk.gray(`   ⏭️  Variables existantes: ${results.variables.skipped}`));
    }

    if (results.triggers.created > 0) {
      console.log(chalk.green(`   ✅ Triggers créés: ${results.triggers.created}`));
    }
    if (results.triggers.skipped > 0) {
      console.log(chalk.gray(`   ⏭️  Triggers existants: ${results.triggers.skipped}`));
    }

    if (results.tags.created > 0) {
      console.log(chalk.green(`   ✅ Tags créés: ${results.tags.created}`));
    }
    if (results.tags.skipped > 0) {
      console.log(chalk.gray(`   ⏭️  Tags existants: ${results.tags.skipped}`));
    }

    // Afficher les erreurs
    const allErrors = [
      ...results.variables.errors,
      ...results.triggers.errors,
      ...results.tags.errors
    ];

    if (allErrors.length > 0) {
      console.log();
      console.log(chalk.red.bold(`   ❌ Erreurs: ${allErrors.length}`));
      allErrors.slice(0, 5).forEach(e => {
        console.log(chalk.red(`      • ${e.name}: ${e.error}`));
      });
      if (allErrors.length > 5) {
        console.log(chalk.gray(`      ... et ${allErrors.length - 5} autres`));
      }
    }

    console.log();
    console.log(boxen(
      chalk.yellow.bold('⚠️ N\'oubliez pas de PUBLIER dans GTM !') + '\n\n' +
      chalk.white('Les changements sont en brouillon.\n') +
      chalk.gray('Allez dans GTM → Envoyer → Publier'),
      { padding: 1, borderColor: 'yellow', title: '📤 Publication', titleAlignment: 'center' }
    ));

    return results;

  } catch (error) {
    spinner.fail(`Erreur: ${error.message}`);
    console.error(chalk.red(error.stack));
    return null;
  }
}
