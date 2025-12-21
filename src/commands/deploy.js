import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import inquirer from 'inquirer';
import { getAuthClient, loadConfig } from '../utils/auth.js';
import { detectGTM } from '../detectors/gtm-detector.js';
import { detectGA4 } from '../detectors/ga4-detector.js';
import { deployGA4 } from '../deployers/ga4-deployer.js';
import { deployGTM } from '../deployers/gtm-deployer.js';
import { generateGTMFiles, generateTrackingJS, saveLocalConfig } from '../utils/file-generator.js';

export async function runDeploy(options) {
  const spinner = ora('Initialisation...').start();

  try {
    // Charger config
    const config = loadConfig();
    if (!config) {
      spinner.fail('Configuration manquante. Lancez: google-setup init');
      return;
    }

    // Authentification
    spinner.text = 'Authentification Google API...';
    await getAuthClient();

    const domain = options.domain;
    const projectName = options.name || domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
    const template = options.template || 'lead-gen';

    spinner.text = `Audit rapide de ${domain}...`;

    // 1. Audit rapide pour voir ce qui existe déjà
    const existingGTM = await detectGTM(config.credentials.gtmAccountId, domain);
    const existingGA4 = await detectGA4(config.credentials.ga4AccountId, domain);

    spinner.stop();

    // 2. Résumé de l'état actuel
    console.log(chalk.cyan('\n📋 État actuel :'));
    console.log(`   GTM: ${existingGTM.installed ? chalk.green('✓ ' + existingGTM.containerId) : chalk.red('✗ Non installé')}`);
    console.log(`   GA4: ${existingGA4.installed ? chalk.green('✓ ' + existingGA4.measurementId) : chalk.red('✗ Non configuré')}`);
    console.log(`   Template: ${chalk.cyan(template)}`);
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
        template
      );
    } else {
      console.log(chalk.gray('🏷️  GTM déjà installé, utilisation de ' + existingGTM.containerId));
    }

    // 6. Générer les fichiers
    console.log('\n📁 Génération des fichiers...');
    const containerId = gtmData.containerId || existingGTM.containerId;
    generateGTMFiles(containerId);
    generateTrackingJS(template);

    // 7. Sauvegarder la config locale
    const localConfig = {
      version: '2.0.0',
      domain,
      projectName,
      template,
      createdAt: new Date().toISOString(),
      ga4: {
        measurementId: ga4Data.measurementId,
        propertyId: ga4Data.propertyId
      },
      gtm: {
        containerId: containerId
      }
    };
    saveLocalConfig(localConfig);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // 8. Afficher le résumé
    displayDeploymentSummary(localConfig, elapsed, template);

    return localConfig;

  } catch (error) {
    spinner.fail(`Erreur: ${error.message}`);
    console.error(chalk.red(error.stack));
  }
}

function displayDeploymentSummary(config, elapsed, template) {
  let output = `${chalk.bold.green('✅ Déploiement terminé en ' + elapsed + 's')}\n\n`;

  output += `${chalk.bold('Configuration :')}\n`;
  output += `   📊 GA4: ${chalk.cyan(config.ga4.measurementId)}\n`;
  output += `   🏷️  GTM: ${chalk.cyan(config.gtm.containerId)}\n\n`;

  output += `${chalk.bold('Fichiers générés :')}\n`;
  output += `   • components/gtm-head.html\n`;
  output += `   • components/gtm-body.html\n`;
  output += `   • src/tracking.js\n`;
  output += `   • .google-setup.json\n\n`;

  output += `${chalk.bold('Prochaines étapes :')}\n`;
  output += `   1. ${chalk.white('Inclure gtm-head.html dans <head>')}\n`;
  output += `   2. ${chalk.white('Inclure gtm-body.html juste après <body>')}\n`;
  output += `   3. ${chalk.white('Inclure tracking.js dans vos pages')}\n`;

  if (template === 'lead-gen') {
    output += `   4. ${chalk.white('Ajouter onclick="trackCTA(\'hero\')" sur vos CTA')}\n`;
    output += `   5. ${chalk.white('Appeler trackFormSubmit(\'contact\') à la soumission')}\n`;
  } else if (template === 'ecommerce') {
    output += `   4. ${chalk.white('Appeler trackViewItem(product) sur les fiches produit')}\n`;
    output += `   5. ${chalk.white('Appeler trackAddToCart(item) au clic "Ajouter au panier"')}\n`;
    output += `   6. ${chalk.white('Appeler trackPurchase(...) après paiement')}\n`;
  }

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
