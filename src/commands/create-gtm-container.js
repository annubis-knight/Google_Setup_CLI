import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import inquirer from 'inquirer';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';
import { getAuthClient, loadConfig } from '../utils/auth.js';
import { detectGTM } from '../detectors/gtm-detector.js';
import { detectGA4 } from '../detectors/ga4-detector.js';
import { deployGA4 } from '../deployers/ga4-deployer.js';
import { deployGTM } from '../deployers/gtm-deployer.js';
import { generateGTMFiles } from '../utils/file-generator.js';

export async function runCreateGtmContainer(options) {
  const projectPath = options.path || process.cwd();
  const gtmConfigPath = join(projectPath, 'tracking', 'gtm-config.yaml');
  const localConfigPath = join(projectPath, '.google-setup.json');

  console.log();
  console.log(chalk.cyan.bold('🚀 [Étape 7/8] Création Conteneur GTM'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log();

  // Vérifier que gtm-config.yaml existe
  if (!existsSync(gtmConfigPath)) {
    console.log(chalk.red('✗ Fichier gtm-config.yaml non trouvé.'));
    console.log(chalk.gray('  Lancez d\'abord: google-setup gtm-config-setup'));
    return;
  }

  // Lire la config GTM locale
  let gtmConfig;
  try {
    const yamlContent = readFileSync(gtmConfigPath, 'utf8');
    gtmConfig = yaml.load(yamlContent);
  } catch (e) {
    console.log(chalk.red(`✗ Erreur lecture gtm-config.yaml: ${e.message}`));
    return;
  }

  // Essayer de charger la config locale pour les IDs
  let localConfig = null;
  if (existsSync(localConfigPath)) {
    try {
      localConfig = JSON.parse(readFileSync(localConfigPath, 'utf8'));
    } catch (e) {
      // Ignore
    }
  }

  // Déterminer domain et projectName
  let domain = options.domain || localConfig?.domain || gtmConfig.project?.domain;
  let projectName = options.name || localConfig?.projectName || gtmConfig.project?.name;

  if (!domain) {
    console.log(chalk.red('✗ Domaine non spécifié.'));
    console.log(chalk.gray('  Utilisez: google-setup deploy -d example.com'));
    return;
  }

  if (!projectName) {
    projectName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  }

  const spinner = ora('Initialisation...').start();

  try {
    // Charger config Google API
    const config = loadConfig();
    if (!config) {
      spinner.fail('Configuration manquante. Lancez: google-setup init');
      return;
    }

    // Authentification
    spinner.text = 'Authentification Google API...';
    await getAuthClient();

    spinner.text = `Audit rapide de ${domain}...`;

    // 1. Audit rapide pour voir ce qui existe déjà
    const existingGTM = await detectGTM(config.credentials.gtmAccountId, domain);
    const existingGA4 = await detectGA4(config.credentials.ga4AccountId, domain);

    spinner.stop();

    // Compter les éléments dans gtm-config.yaml
    const triggerCount = (gtmConfig.triggers || []).filter(t => !t._category).length;
    const tagCount = (gtmConfig.tags || []).length;
    const varCount = (gtmConfig.variables || []).length;

    // 2. Résumé de l'état actuel
    console.log(chalk.cyan('\n📋 État actuel :'));
    console.log(`   GTM: ${existingGTM.installed ? chalk.green('✓ ' + existingGTM.containerId) : chalk.red('✗ Non installé')}`);
    console.log(`   GA4: ${existingGA4.installed ? chalk.green('✓ ' + existingGA4.measurementId) : chalk.red('✗ Non configuré')}`);
    console.log(`   Config: ${chalk.cyan(`${triggerCount} triggers, ${tagCount} tags, ${varCount} variables`)}`);
    console.log(`   Projet: ${chalk.cyan(projectName)}`);

    // 3. Confirmation si pas en mode auto
    if (!options.auto) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Continuer le déploiement ?',
        default: true
      }]);

      if (!confirm) {
        console.log(chalk.yellow('\nDéploiement annulé.'));
        return;
      }
    }

    console.log(chalk.cyan('\n🚀 Déploiement en cours...\n'));

    const startTime = Date.now();
    let ga4Data = existingGA4;
    let gtmData = existingGTM;

    // 4. Déployer GA4 si nécessaire
    if (!existingGA4.installed) {
      ga4Data = await deployGA4(domain, projectName, config.credentials.ga4AccountId);
    } else {
      console.log(chalk.gray('📊 GA4 déjà configuré, utilisation de ' + existingGA4.measurementId));
    }

    // 5. Déployer GTM si nécessaire
    if (!existingGTM.installed) {
      gtmData = await deployGTM(
        domain,
        projectName,
        config.credentials.gtmAccountId,
        ga4Data.measurementId,
        gtmConfig  // Passer la config YAML au lieu du template
      );
    } else {
      console.log(chalk.gray('🏷️  GTM déjà installé, utilisation de ' + existingGTM.containerId));
    }

    // 6. Générer les fichiers GTM (snippets HTML)
    console.log('\n📁 Génération des fichiers...');
    const containerId = gtmData.containerId || existingGTM.containerId;
    generateGTMFiles(containerId);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // 7. Afficher le résumé
    const displayConfig = {
      ga4: { measurementId: ga4Data.measurementId },
      gtm: { containerId: containerId }
    };
    displayDeploymentSummary(displayConfig, elapsed, gtmConfig);

    return displayConfig;

  } catch (error) {
    spinner.fail(`Erreur: ${error.message}`);
    console.error(chalk.red(error.stack));
  }
}

function displayDeploymentSummary(config, elapsed, gtmConfig) {
  const triggerCount = (gtmConfig.triggers || []).filter(t => !t._category).length;
  const tagCount = (gtmConfig.tags || []).length;
  const varCount = (gtmConfig.variables || []).length;

  let output = `${chalk.bold.green('✅ Déploiement terminé en ' + elapsed + 's')}\n\n`;

  output += `${chalk.bold('Configuration :')}\n`;
  output += `   📊 GA4: ${chalk.cyan(config.ga4.measurementId)}\n`;
  output += `   🏷️  GTM: ${chalk.cyan(config.gtm.containerId)}\n`;
  output += `   📋 ${triggerCount} triggers, ${tagCount} tags, ${varCount} variables\n\n`;

  output += `${chalk.bold('Fichiers générés :')}\n`;
  output += `   • components/gtm-head.html\n`;
  output += `   • components/gtm-body.html\n\n`;

  output += `${chalk.bold('Prochaines étapes :')}\n`;
  output += `   1. ${chalk.white('Inclure gtm-head.html dans <head>')}\n`;
  output += `   2. ${chalk.white('Inclure gtm-body.html juste après <body>')}\n`;
  output += `   3. ${chalk.white('[Étape 5] google-setup html-layer → Ajouter data-track au HTML')}\n`;

  output += `\n${chalk.gray('Vérifiez dans GA4 Temps Réel : https://analytics.google.com')}`;

  console.log('\n' + boxen(output, {
    padding: 1,
    margin: 0,
    borderColor: 'green',
    borderStyle: 'round',
    title: '🚀 Résumé du déploiement',
    titleAlignment: 'center'
  }));
}
