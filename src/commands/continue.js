/**
 * Commande continue - Reprend le déploiement là où on s'est arrêté
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import { loadConfig, getAuthClient } from '../utils/auth.js';
import { getFullStatus } from './status.js';
import { deployGA4 } from '../deployers/ga4-deployer.js';
import { deployGTM } from '../deployers/gtm-deployer.js';
import { generateGTMFiles, generateTrackingJS, saveLocalConfig } from '../utils/file-generator.js';

/**
 * Commande principale continue
 */
export async function runContinue(options) {
  const domain = options.domain || options.domains?.split(',')[0];
  const auto = options.auto || false;

  if (!domain) {
    console.error(chalk.red('\n❌ Domaine requis. Utilisez: google-setup continue -d "mon-site.fr"\n'));
    process.exit(1);
  }

  console.log(chalk.cyan(`\n🚀 Continuation du déploiement pour ${domain}...\n`));

  try {
    // Auth
    await getAuthClient();
    const config = loadConfig();

    if (!config) {
      console.error(chalk.red('Configuration manquante. Lancez: google-setup init'));
      return;
    }

    // 1. Vérifier l'état actuel
    const spinner = ora('Analyse de l\'état actuel...').start();
    const { auditData, progress } = await getFullStatus(domain, config);
    spinner.stop();

    // Afficher résumé
    console.log(chalk.gray(`Progression actuelle : ${progress.globalProgress}%\n`));

    if (progress.isComplete) {
      console.log(boxen(
        chalk.green.bold('✅ Déjà complet !') + '\n\n' +
        chalk.white('Tous les outils KPI sont configurés à 100%.'),
        { padding: 1, borderColor: 'green' }
      ));
      return;
    }

    // 2. Traiter chaque étape
    let currentAuditData = { ...auditData };
    let ga4Data = auditData.ga4;
    let gtmData = auditData.gtm;
    let deployedSomething = false;

    for (const step of progress.steps) {
      // Déjà complet
      if (step.isComplete) {
        console.log(chalk.green(`✅ ${step.name} - Déjà configuré`));
        continue;
      }

      // Bloqué par dépendance
      if (step.blocked) {
        const depName = progress.steps.find(s => s.id === step.dependsOn)?.name || step.dependsOn;
        console.log(chalk.gray(`⏸️  ${step.name} - Bloqué (attend ${depName})`));
        continue;
      }

      // Demander confirmation sauf en mode auto
      if (!auto) {
        const missingTasks = step.tasksStatus
          .filter(t => !t.done && !t.optional)
          .map(t => t.name)
          .join(', ');

        const { confirm } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: `Déployer ${step.name} ? (${missingTasks})`,
          default: true
        }]);

        if (!confirm) {
          console.log(chalk.yellow(`⏭️  ${step.name} - Ignoré\n`));
          continue;
        }
      }

      // Déployer l'étape
      const stepSpinner = ora(`Déploiement de ${step.name}...`).start();

      try {
        switch (step.id) {
          case 'ga4':
            if (!auditData.ga4?.installed) {
              const projectName = domain.split('.')[0];
              ga4Data = await deployGA4Step(domain, projectName, config);
              currentAuditData.ga4 = ga4Data;
            }
            stepSpinner.succeed(chalk.green(`${step.name} - Déployé`));
            deployedSomething = true;
            break;

          case 'gtm':
            if (!auditData.gtm?.installed) {
              const projectName = domain.split('.')[0];
              const measurementId = ga4Data?.measurementId || currentAuditData.ga4?.measurementId;

              if (!measurementId) {
                throw new Error('GA4 Measurement ID requis pour GTM');
              }

              gtmData = await deployGTMStep(domain, projectName, config, measurementId, options.template || 'lead-gen');
              currentAuditData.gtm = gtmData;
            } else {
              // GTM existe mais incomplet - ajouter les éléments manquants
              await completeGTMStep(auditData.gtm, step.tasksStatus, config);
            }
            stepSpinner.succeed(chalk.green(`${step.name} - Déployé`));
            deployedSomething = true;
            break;

          case 'datalayer':
            // Le DataLayer est déployé via GTM, on génère les fichiers locaux
            const containerId = gtmData?.containerId || auditData.gtm?.containerId;
            if (containerId) {
              generateTrackingJS();
              stepSpinner.succeed(chalk.green(`${step.name} - Fichiers générés`));
              deployedSomething = true;
            } else {
              stepSpinner.warn(chalk.yellow(`${step.name} - GTM requis`));
            }
            break;

          case 'search_console':
            // Search Console nécessite une vérification manuelle
            stepSpinner.info(chalk.cyan(`${step.name} - Vérification manuelle requise`));
            console.log(chalk.gray('   → Allez sur https://search.google.com/search-console'));
            console.log(chalk.gray(`   → Ajoutez et vérifiez ${domain}`));
            console.log(chalk.gray('   → Soumettez votre sitemap.xml'));
            break;

          case 'hotjar':
            // Hotjar nécessite un compte séparé
            stepSpinner.info(chalk.cyan(`${step.name} - Configuration manuelle requise`));
            console.log(chalk.gray('   → Créez un compte sur https://www.hotjar.com'));
            console.log(chalk.gray('   → Ajoutez le script Hotjar dans GTM'));
            break;

          default:
            stepSpinner.warn(chalk.yellow(`${step.name} - Action non implémentée`));
        }

      } catch (error) {
        stepSpinner.fail(chalk.red(`${step.name} - Erreur`));
        console.error(chalk.red(`   ${error.message}`));

        if (!auto) {
          const { shouldContinue } = await inquirer.prompt([{
            type: 'confirm',
            name: 'shouldContinue',
            message: 'Continuer malgré l\'erreur ?',
            default: false
          }]);

          if (!shouldContinue) break;
        }
      }

      console.log();
    }

    // 3. Générer les fichiers finaux si on a déployé quelque chose
    if (deployedSomething) {
      console.log(chalk.cyan('\n📁 Génération des fichiers...'));

      const containerId = gtmData?.containerId || auditData.gtm?.containerId;
      if (containerId) {
        generateGTMFiles(containerId);
        generateTrackingJS();

        // Sauvegarder la config locale
        const localConfig = {
          version: '2.0.0',
          domain,
          projectName: domain.split('.')[0],
          updatedAt: new Date().toISOString(),
          ga4: {
            measurementId: ga4Data?.measurementId || auditData.ga4?.measurementId,
            propertyId: ga4Data?.propertyId || auditData.ga4?.propertyId
          },
          gtm: {
            containerId
          }
        };
        saveLocalConfig(localConfig);
      }
    }

    // 4. Afficher résultat final
    console.log(chalk.cyan('\n' + '═'.repeat(70)));
    console.log(chalk.green.bold('  ✅ CONTINUATION TERMINÉE'));
    console.log(chalk.cyan('═'.repeat(70)));

    // Re-vérifier la progression
    const finalSpinner = ora('Vérification finale...').start();
    const { progress: newProgress } = await getFullStatus(domain, config);
    finalSpinner.stop();

    const improvement = newProgress.globalProgress - progress.globalProgress;

    console.log();
    console.log(chalk.bold(`🎯 Progression : ${progress.globalProgress}% → ${newProgress.globalProgress}%`));
    if (improvement > 0) {
      console.log(chalk.green(`   Amélioration : +${improvement} points`));
    }
    console.log();

    if (newProgress.isComplete) {
      console.log(boxen(
        chalk.green.bold('🎉 100% COMPLET !') + '\n\n' +
        chalk.white('Tous les outils KPI sont maintenant configurés.') + '\n\n' +
        chalk.gray('Prochaines étapes :') + '\n' +
        chalk.white('1. Intégrer les fichiers GTM dans votre site') + '\n' +
        chalk.white('2. Vérifier dans GA4 Temps Réel') + '\n' +
        chalk.white('3. Configurer vos conversions dans GA4'),
        { padding: 1, borderColor: 'green', title: '🎉 Succès', titleAlignment: 'center' }
      ));
    } else if (newProgress.nextStep) {
      console.log(boxen(
        chalk.yellow.bold(`Prochaine étape : ${newProgress.nextStep.name}`) + '\n\n' +
        chalk.gray('Relancez pour continuer :') + '\n' +
        chalk.cyan(`google-setup continue -d "${domain}"`),
        { padding: 1, borderColor: 'yellow' }
      ));
    }

    console.log();

  } catch (error) {
    console.error(chalk.red(`\n❌ Erreur: ${error.message}\n`));
  }
}

/**
 * Déploie GA4 (propriété + flux)
 */
async function deployGA4Step(domain, projectName, config) {
  console.log(chalk.gray('   → Création propriété GA4...'));
  return await deployGA4(domain, projectName, config.credentials.ga4AccountId);
}

/**
 * Déploie GTM (conteneur + template)
 */
async function deployGTMStep(domain, projectName, config, measurementId, template) {
  console.log(chalk.gray('   → Création conteneur GTM...'));
  return await deployGTM(domain, projectName, config.credentials.gtmAccountId, measurementId, template);
}

/**
 * Complète un GTM existant avec les éléments manquants
 */
async function completeGTMStep(gtmData, tasksStatus, config) {
  // TODO: Implémenter l'ajout d'éléments manquants à un conteneur existant
  // Pour l'instant on log un message
  const missingTasks = tasksStatus.filter(t => !t.done && !t.optional);

  if (missingTasks.length > 0) {
    console.log(chalk.gray('   → Éléments manquants détectés :'));
    missingTasks.forEach(t => {
      console.log(chalk.gray(`      - ${t.name}`));
    });
    console.log(chalk.gray('   → Ajoutez-les manuellement dans GTM ou relancez deploy'));
  }
}
