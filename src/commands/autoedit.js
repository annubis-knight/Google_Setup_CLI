/**
 * Commande autoedit - Analyse HTML avec IA pour générer le tracking plan
 * Scanne les fichiers HTML, détecte les éléments trackables, et génère le YAML
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import boxen from 'boxen';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

import { analyzeHTMLFiles, prepareForAI, generateHTMLSummary } from '../analyzers/html-scanner.js';
import { callAI, listAvailableModels, getDefaultModel } from '../ai/ai-client.js';

// Chemin du template YAML intégré à l'outil
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATE_YAML_PATH = join(__dirname, '..', 'templates', 'gtm-tracking-plan.yml');

/**
 * Commande principale autoedit
 */
export async function runAutoEdit(options) {
  const projectPath = options.path || process.cwd();
  const absolutePath = resolve(projectPath);
  const sourcePath = options.source || absolutePath;

  console.log();
  console.log(boxen(
    chalk.cyan.bold('AUTOEDIT - Analyse IA du site'),
    { padding: { left: 2, right: 2, top: 0, bottom: 0 }, borderColor: 'cyan' }
  ));
  console.log();

  // 1. Vérifier les modèles IA disponibles
  const models = listAvailableModels();
  const availableModels = models.filter(m => m.available);

  if (availableModels.length === 0) {
    console.log(chalk.red('Aucune clé API IA configurée.'));
    console.log();
    console.log(chalk.yellow('Ajoutez une des clés suivantes dans votre fichier .env :'));
    for (const model of models) {
      console.log(chalk.gray(`   ${model.envKey}=votre_clé  # ${model.name}`));
    }
    console.log();
    console.log(chalk.gray('Exemple .env :'));
    console.log(chalk.gray('   GOOGLE_AI_API_KEY=AIza...'));
    return null;
  }

  // Sélectionner le modèle
  let selectedModel = options.ai || getDefaultModel();

  if (!options.ai && !options.auto) {
    // Mode interactif : demander le modèle
    const modelChoices = availableModels.map(m => ({
      name: `${m.name} (${m.provider}) - $${m.costPer1kTokens}/1k tokens`,
      value: m.id
    }));

    if (modelChoices.length > 1) {
      const answer = await inquirer.prompt([{
        type: 'list',
        name: 'model',
        message: 'Quel modèle IA utiliser ?',
        choices: modelChoices,
        default: selectedModel
      }]);
      selectedModel = answer.model;
    }
  }

  const modelInfo = models.find(m => m.id === selectedModel);
  console.log(chalk.cyan(`Modèle IA: ${modelInfo?.name || selectedModel}`));
  console.log();

  // 2. Scanner les fichiers HTML
  const scanOptions = {
    exclude: options.exclude ? options.exclude.split(',') : [],
    includeBuild: options.includeBuild || false
  };

  const excludeInfo = scanOptions.exclude.length > 0
    ? ` (exclu: ${scanOptions.exclude.join(', ')})`
    : ' (dist, build, .next exclus par défaut)';

  const spinnerScan = ora(`Scan des fichiers HTML${excludeInfo}...`).start();

  const htmlAnalysis = await analyzeHTMLFiles(sourcePath, scanOptions);

  if (!htmlAnalysis.success) {
    spinnerScan.fail(`Erreur: ${htmlAnalysis.error}`);
    return null;
  }

  spinnerScan.succeed(`${htmlAnalysis.filesScanned} fichiers HTML scannés`);

  // Afficher le résumé
  console.log();
  console.log(chalk.white.bold('Éléments interactifs détectés:'));
  console.log();

  for (const [category, data] of Object.entries(htmlAnalysis.summary.byCategory)) {
    const emoji = getCategoryEmoji(category);
    console.log(chalk.gray(`   ${emoji} ${category}: ${data.count} éléments`));
  }

  console.log();
  console.log(chalk.cyan(`   Total: ${htmlAnalysis.summary.totalElements} éléments trackables`));
  console.log();

  if (htmlAnalysis.summary.totalElements === 0) {
    console.log(chalk.yellow('Aucun élément interactif détecté.'));
    console.log(chalk.gray('Vérifiez que le chemin source contient des fichiers HTML.'));
    return null;
  }

  // 3. Demander les infos du projet (mode interactif)
  let projectInfo = {
    projectName: options.name || '',
    domain: options.domain || '',
    siteType: options.type || 'lead-gen'
  };

  if (!options.auto) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Nom du projet:',
        default: projectInfo.projectName || 'Mon Site'
      },
      {
        type: 'input',
        name: 'domain',
        message: 'Domaine (optionnel):',
        default: projectInfo.domain
      },
      {
        type: 'list',
        name: 'siteType',
        message: 'Type de site:',
        choices: [
          { name: 'Lead Generation (formulaires, devis)', value: 'lead-gen' },
          { name: 'E-commerce (produits, panier)', value: 'ecommerce' },
          { name: 'SaaS (inscription, onboarding)', value: 'saas' },
          { name: 'Blog / Média (engagement, lecture)', value: 'media' }
        ],
        default: projectInfo.siteType
      }
    ]);
    projectInfo = { ...projectInfo, ...answers };
  }

  // 4. Charger le template YAML (depuis l'outil ou le projet)
  const yamlPath = join(absolutePath, 'tracking', 'gtm-tracking-plan.yml');
  let templateYaml = null;
  let existingYaml = null;

  // Priorité : YAML existant dans le projet > template intégré
  if (existsSync(yamlPath)) {
    try {
      existingYaml = readFileSync(yamlPath, 'utf8');
      templateYaml = existingYaml;
      console.log(chalk.gray('YAML existant détecté, il sera édité par l\'IA.'));
    } catch (e) {
      // Ignorer
    }
  }

  // Sinon, utiliser le template intégré
  if (!templateYaml) {
    try {
      templateYaml = readFileSync(TEMPLATE_YAML_PATH, 'utf8');
      console.log(chalk.gray('Utilisation du template YAML intégré.'));
    } catch (e) {
      console.log(chalk.red('Erreur: Template YAML introuvable.'));
      return null;
    }
  }

  // 5. Appeler l'IA en 2 étapes
  const spinnerAI = ora(`Analyse avec ${modelInfo?.name || selectedModel}...`).start();

  let aiResult;
  try {
    const aiInput = prepareForAI(htmlAnalysis);
    aiResult = await callAI(aiInput, {
      model: selectedModel,
      siteType: projectInfo.siteType,
      projectName: projectInfo.projectName,
      domain: projectInfo.domain,
      templateYaml
    });

    spinnerAI.succeed('Analyse IA terminée');
  } catch (error) {
    spinnerAI.fail(`Erreur IA: ${error.message}`);
    return null;
  }

  // 5b. Sauvegarder les fichiers debug si --debug
  if (options.debug && aiResult.debug) {
    const debugDir = join(absolutePath, 'tracking', 'debug');
    if (!existsSync(debugDir)) {
      mkdirSync(debugDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    // Sauvegarder les prompts et réponses
    writeFileSync(
      join(debugDir, `${timestamp}_step1_prompt.txt`),
      aiResult.debug.step1_prompt
    );
    writeFileSync(
      join(debugDir, `${timestamp}_step1_response.json`),
      aiResult.debug.step1_response
    );
    writeFileSync(
      join(debugDir, `${timestamp}_step2_prompt.txt`),
      aiResult.debug.step2_prompt
    );
    writeFileSync(
      join(debugDir, `${timestamp}_step2_response.yml`),
      aiResult.debug.step2_response
    );

    console.log(chalk.gray(`Debug sauvegardé dans: tracking/debug/${timestamp}_*`));
  }

  // 5c. Afficher les recommandations de l'IA
  if (aiResult.recommendations && aiResult.recommendations.length > 0) {
    console.log();
    console.log(chalk.white.bold('Recommandations de l\'IA:'));
    console.log();
    for (const rec of aiResult.recommendations) {
      const consolidated = rec.consolidated ? chalk.cyan(' (consolidé)') : '';
      const conversion = rec.conversion ? chalk.yellow(' ★') : '';
      console.log(chalk.gray(`   • ${rec.event_name}${consolidated}${conversion}`));
      if (rec.reason) {
        console.log(chalk.gray(`     └─ ${rec.reason}`));
      }
    }
  }

  // 6. Valider le YAML généré
  let parsedYaml;
  try {
    parsedYaml = yaml.load(aiResult.yaml);
  } catch (e) {
    console.log(chalk.red('Le YAML généré est invalide.'));
    console.log(chalk.gray('Réponse brute:'));
    console.log(aiResult.yaml.slice(0, 500));
    return null;
  }

  // 7. Afficher le résumé
  console.log();
  console.log(chalk.white.bold('Plan de taggage généré:'));
  console.log();

  const eventsCount = (parsedYaml.events || []).length;
  const consolidatedCount = (parsedYaml.consolidated_events || []).length;

  console.log(chalk.green(`   Events simples: ${eventsCount}`));
  console.log(chalk.cyan(`   Events consolidés: ${consolidatedCount}`));

  // Lister les events
  if (eventsCount > 0) {
    console.log();
    console.log(chalk.gray('   Events:'));
    for (const event of (parsedYaml.events || []).slice(0, 5)) {
      const name = event.datalayer?.event_name || event.id;
      const conv = event.ga4?.conversion ? chalk.yellow(' (conversion)') : '';
      console.log(chalk.gray(`     - ${name}${conv}`));
    }
    if (eventsCount > 5) {
      console.log(chalk.gray(`     ... et ${eventsCount - 5} autres`));
    }
  }

  if (consolidatedCount > 0) {
    console.log();
    console.log(chalk.gray('   Events consolidés:'));
    for (const event of (parsedYaml.consolidated_events || [])) {
      const name = event.datalayer?.event_name || event.id;
      const actionsCount = (event.actions || []).length;
      console.log(chalk.cyan(`     - ${name} (${actionsCount} actions)`));
    }
  }

  console.log();

  // 8. Prévisualisation ou sauvegarde
  if (options.dryRun) {
    console.log(chalk.white.bold('Prévisualisation (--dry-run):'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(aiResult.yaml.slice(0, 3000));
    if (aiResult.yaml.length > 3000) {
      console.log(chalk.gray('\n... (tronqué)'));
    }
    console.log(chalk.gray('─'.repeat(50)));
    return { preview: true, yaml: aiResult.yaml };
  }

  // Confirmation
  if (!options.force && !options.auto) {
    const confirm = await inquirer.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: 'Sauvegarder le tracking plan ?',
      default: true
    }]);

    if (!confirm.proceed) {
      console.log(chalk.yellow('Annulé.'));
      return null;
    }
  }

  // 9. Sauvegarder
  const trackingDir = join(absolutePath, 'tracking');
  if (!existsSync(trackingDir)) {
    mkdirSync(trackingDir, { recursive: true });
  }

  // Backup si existant
  if (existingYaml) {
    const backupPath = yamlPath.replace('.yml', '.backup.yml');
    writeFileSync(backupPath, existingYaml);
    console.log(chalk.gray(`Backup: ${backupPath}`));
  }

  // Sauvegarder le nouveau YAML
  writeFileSync(yamlPath, aiResult.yaml);
  console.log(chalk.green(`Sauvegardé: ${yamlPath}`));

  // 10. Résumé final
  console.log();
  console.log(boxen(
    chalk.green.bold('Tracking plan généré avec succès !') + '\n\n' +
    chalk.white(`Events: ${eventsCount} simples + ${consolidatedCount} consolidés\n`) +
    chalk.white(`Modèle: ${aiResult.model}\n\n`) +
    chalk.gray('Prochaines étapes:\n') +
    chalk.gray('1. Vérifiez le fichier généré\n') +
    chalk.gray('2. Lancez: google-setup generate-tracking\n') +
    chalk.gray('3. Lancez: google-setup sync'),
    { padding: 1, borderColor: 'green', title: 'Succès', titleAlignment: 'center' }
  ));

  return {
    success: true,
    eventsCount,
    consolidatedCount,
    model: aiResult.model,
    yamlPath
  };
}

/**
 * Retourne un emoji pour chaque catégorie
 */
function getCategoryEmoji(category) {
  const emojis = {
    cta: '🔘',
    contact: '📞',
    forms: '📝',
    video: '🎬',
    faq: '❓',
    modal: '🪟',
    navigation: '🧭',
    download: '📥',
    social: '🔗',
    scroll: '📜'
  };
  return emojis[category] || '📌';
}
