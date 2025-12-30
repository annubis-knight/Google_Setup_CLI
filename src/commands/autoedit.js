/**
 * Commande autoedit - Pipeline 8 étapes pour générer le tracking plan
 *
 * Workflow:
 * 1. HTML SCAN      → Extract éléments interactifs avec contexte
 * 2. AI ANALYSIS    → Déduire events pertinents avec priorisation
 * 3. GROUPING       → Consolider en event_groups
 * 4. SELECTOR FINDER → Trouver sélecteurs HTML robustes
 * 5. YAML BUILD     → Construire la config YAML programmatiquement
 * 6. YAML MERGE     → Fusionner avec YAML existant
 * 7. VALIDATION     → Vérifier cohérence
 * 8. GENERATION     → Écrire fichiers finaux + suggestions manuelles
 *
 * Chaque étape peut être exécutée séparément avec --step=N
 * L'état est persisté dans tracking/debug/state.json
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import boxen from 'boxen';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

import { analyzeHTMLFiles, prepareForAI } from '../analyzers/html-scanner.js';
import { findSelectorsForElements, generateSelectorReport } from '../analyzers/selector-finder.js';
import { runAIPipeline, listAvailableModels, getDefaultModel, getModelConfig } from '../ai/ai-client.js';
import { mergeWithExisting, generateYAML, validateTrackingPlan } from '../mergers/yaml-merger.js';

// Chemin du template YAML intégré à l'outil
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATE_YAML_PATH = join(__dirname, '..', 'templates', 'gtm-tracking-plan.yml');

const TOTAL_STEPS = 8;

// ============================================================
// UTILITAIRES
// ============================================================

/**
 * Affiche une étape du pipeline
 */
function stepHeader(stepNum, title, options = {}) {
  const emojis = ['🔍', '🤖', '📊', '🎯', '🔧', '🔀', '✅', '📝'];
  const emoji = emojis[stepNum - 1] || '▶️';

  if (options.skipped) {
    console.log(chalk.gray(`${emoji} [${stepNum}/${TOTAL_STEPS}] ${title} (ignorée)`));
  } else {
    console.log();
    console.log(chalk.cyan(`${emoji} [${stepNum}/${TOTAL_STEPS}] ${title}`));
  }
}

/**
 * Génère un timestamp pour les fichiers debug
 */
function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Sauvegarde l'état du pipeline
 */
function saveState(absolutePath, state) {
  const debugDir = join(absolutePath, 'tracking', 'debug');
  if (!existsSync(debugDir)) {
    mkdirSync(debugDir, { recursive: true });
  }
  writeFileSync(join(debugDir, 'state.json'), JSON.stringify(state, null, 2));
}

/**
 * Charge l'état du pipeline
 */
function loadState(absolutePath) {
  const statePath = join(absolutePath, 'tracking', 'debug', 'state.json');
  if (!existsSync(statePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

/**
 * Sauvegarde les données de debug pour une étape
 */
function saveDebugData(absolutePath, stepNum, stepName, data, format = 'json') {
  const debugDir = join(absolutePath, 'tracking', 'debug');
  if (!existsSync(debugDir)) {
    mkdirSync(debugDir, { recursive: true });
  }

  const timestamp = getTimestamp();
  const ext = format === 'yaml' ? 'yml' : format;
  const filename = `${timestamp}_step${stepNum}_${stepName}.${ext}`;

  let content;
  if (format === 'yaml') {
    content = yaml.dump(data, { indent: 2, lineWidth: 120, noRefs: true });
  } else if (format === 'json') {
    content = JSON.stringify(data, null, 2);
  } else {
    content = data;
  }

  writeFileSync(join(debugDir, filename), content);
  return filename;
}

// ============================================================
// ÉTAPES DU PIPELINE
// ============================================================

/**
 * ÉTAPE 1: HTML SCAN
 * Scanne les fichiers HTML et extrait les éléments interactifs
 */
async function step1_htmlScan(absolutePath, sourcePath, options, state) {
  stepHeader(1, 'Scanning HTML files...');

  const scanOptions = {
    exclude: options.exclude ? options.exclude.split(',') : [],
    includeBuild: options.includeBuild || false
  };

  const excludeInfo = scanOptions.exclude.length > 0
    ? ` (exclu: ${scanOptions.exclude.join(', ')})`
    : ' (dist, build, .next exclus par défaut)';

  const spinner = ora(`Scan des fichiers HTML${excludeInfo}`).start();

  const htmlAnalysis = await analyzeHTMLFiles(sourcePath, scanOptions);

  if (!htmlAnalysis.success) {
    spinner.fail(`Erreur: ${htmlAnalysis.error}`);
    return { success: false, error: htmlAnalysis.error };
  }

  spinner.succeed(`${htmlAnalysis.filesScanned} fichiers HTML scannés`);

  // Afficher le résumé
  console.log(chalk.gray(`   ✓ ${htmlAnalysis.allElements.length} éléments interactifs détectés`));

  const importanceSummary = htmlAnalysis.summary.byImportance;
  console.log(chalk.gray(`   ✓ Priorité: ${importanceSummary.high} high, ${importanceSummary.medium} medium, ${importanceSummary.low} low`));

  if (Object.keys(htmlAnalysis.summary.byContext).length > 0) {
    const contexts = Object.entries(htmlAnalysis.summary.byContext)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ctx, count]) => `${ctx}(${count})`)
      .join(', ');
    console.log(chalk.gray(`   ✓ Contextes: ${contexts}`));
  }

  if (htmlAnalysis.allElements.length === 0) {
    console.log(chalk.yellow('Aucun élément interactif détecté.'));
    return { success: false, error: 'Aucun élément interactif' };
  }

  // Debug
  if (options.debug) {
    const filename = saveDebugData(absolutePath, 1, 'html_scan', htmlAnalysis);
    console.log(chalk.gray(`   → Debug: ${filename}`));
  }

  // Mettre à jour l'état
  state.step1 = {
    completed: true,
    timestamp: new Date().toISOString(),
    htmlAnalysis,
    filesScanned: htmlAnalysis.filesScanned,
    elementsCount: htmlAnalysis.allElements.length
  };

  return { success: true, htmlAnalysis };
}

/**
 * ÉTAPE 2: AI ANALYSIS
 * Analyse IA pour identifier les events pertinents
 */
async function step2_aiAnalysis(absolutePath, options, state) {
  if (!state.step1?.completed) {
    console.log(chalk.red('Erreur: Étape 1 non complétée. Exécutez d\'abord --step=1'));
    return { success: false, error: 'Step 1 required' };
  }

  stepHeader(2, `AI Analysis (${options.modelInfo?.name || options.selectedModel})...`);

  const spinner = ora('Analyse IA - Étape 1/2: Identification des events...').start();

  try {
    const aiInput = prepareForAI(state.step1.htmlAnalysis);

    // On exécute seulement l'étape d'analyse (pas le grouping)
    const { runAIPipeline } = await import('../ai/ai-client.js');

    // Pour l'instant, on fait tout le pipeline mais on pourrait le découper
    const aiResult = await runAIPipeline(aiInput, state.step4?.selectorResults?.selectors || {}, {
      model: options.selectedModel,
      siteType: options.projectInfo?.siteType || 'lead-gen',
      projectName: options.projectInfo?.projectName || '',
      domain: options.projectInfo?.domain || ''
    });

    spinner.succeed('Analyse IA terminée');

    console.log(chalk.gray(`   ✓ ${aiResult.stats.eventsRecommended} events recommandés`));

    // Debug
    if (options.debug) {
      const filename = saveDebugData(absolutePath, 2, 'ai_analysis', aiResult.analysis);
      console.log(chalk.gray(`   → Debug: ${filename}`));
    }

    state.step2 = {
      completed: true,
      timestamp: new Date().toISOString(),
      analysis: aiResult.analysis,
      stats: {
        eventsRecommended: aiResult.stats.eventsRecommended
      }
    };

    // Stocker aussi le résultat complet pour les étapes suivantes
    state.aiResult = aiResult;

    return { success: true, analysis: aiResult.analysis };
  } catch (error) {
    spinner.fail(`Erreur IA: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * ÉTAPE 3: GROUPING
 * Consolide les events similaires
 */
async function step3_grouping(absolutePath, options, state) {
  if (!state.step2?.completed) {
    console.log(chalk.red('Erreur: Étape 2 non complétée. Exécutez d\'abord --step=2'));
    return { success: false, error: 'Step 2 required' };
  }

  stepHeader(3, 'Grouping & consolidation...');

  // Le grouping est déjà fait dans step2 avec le pipeline complet
  // On affiche juste les stats
  const aiResult = state.aiResult;

  if (!aiResult) {
    console.log(chalk.red('Erreur: Résultat AI non disponible'));
    return { success: false, error: 'AI result missing' };
  }

  console.log(chalk.gray(`   ✓ ${aiResult.stats.consolidatedGroups} event_groups créés`));
  console.log(chalk.gray(`   ✓ ${aiResult.stats.standaloneEvents} events standalone`));

  if (aiResult.stats.reductionPercent > 0) {
    console.log(chalk.green(`   ✓ Réduction: ${aiResult.stats.reductionPercent}% moins de tags GTM`));
  }

  // Debug
  if (options.debug) {
    const filename = saveDebugData(absolutePath, 3, 'grouping', aiResult.grouping);
    console.log(chalk.gray(`   → Debug: ${filename}`));
  }

  state.step3 = {
    completed: true,
    timestamp: new Date().toISOString(),
    grouping: aiResult.grouping,
    stats: {
      consolidatedGroups: aiResult.stats.consolidatedGroups,
      standaloneEvents: aiResult.stats.standaloneEvents,
      reductionPercent: aiResult.stats.reductionPercent
    }
  };

  return { success: true, grouping: aiResult.grouping };
}

/**
 * ÉTAPE 4: SELECTOR FINDER
 * Trouve des sélecteurs CSS robustes pour chaque élément
 */
async function step4_selectorFinder(absolutePath, options, state) {
  if (!state.step1?.completed) {
    console.log(chalk.red('Erreur: Étape 1 non complétée. Exécutez d\'abord --step=1'));
    return { success: false, error: 'Step 1 required' };
  }

  stepHeader(4, 'Finding robust selectors...');

  const spinner = ora('Analyse des sélecteurs CSS...').start();

  const selectorResults = findSelectorsForElements(state.step1.htmlAnalysis.allElements);
  const selectorReport = generateSelectorReport(selectorResults);

  spinner.succeed(`Sélecteurs analysés (score: ${selectorReport.score}/100 - ${selectorReport.grade})`);

  console.log(chalk.gray(`   ✓ ${selectorReport.breakdown.highConfidence} éléments avec haute confiance`));
  console.log(chalk.gray(`   ✓ ${selectorReport.breakdown.mediumConfidence} éléments avec confiance moyenne`));

  if (selectorReport.breakdown.lowConfidence > 0) {
    console.log(chalk.yellow(`   ⚠️  ${selectorReport.breakdown.lowConfidence} éléments nécessitent data-track`));
  }

  // Debug
  if (options.debug) {
    const filename = saveDebugData(absolutePath, 4, 'selectors', {
      results: selectorResults,
      report: selectorReport
    });
    console.log(chalk.gray(`   → Debug: ${filename}`));
  }

  state.step4 = {
    completed: true,
    timestamp: new Date().toISOString(),
    selectorResults,
    selectorReport
  };

  return { success: true, selectorResults, selectorReport };
}

/**
 * ÉTAPE 5: YAML BUILD
 * Construit la configuration YAML programmatiquement
 */
async function step5_yamlBuild(absolutePath, options, state) {
  if (!state.step3?.completed) {
    console.log(chalk.red('Erreur: Étape 3 non complétée. Exécutez d\'abord --step=3'));
    return { success: false, error: 'Step 3 required' };
  }

  stepHeader(5, 'Building YAML config...');

  const spinner = ora('Construction de la configuration...').start();

  // La config est déjà construite par le pipeline AI
  const config = state.aiResult?.config;

  if (!config) {
    spinner.fail('Configuration non disponible');
    return { success: false, error: 'Config missing' };
  }

  spinner.succeed('Configuration YAML construite');

  console.log(chalk.gray(`   ✓ ${config.events?.length || 0} events standalone`));
  console.log(chalk.gray(`   ✓ ${config.consolidated_events?.length || 0} events consolidés`));
  console.log(chalk.gray(`   ✓ ${config.variables?.datalayer?.length || 0} variables dataLayer`));

  // Debug
  if (options.debug) {
    const filename = saveDebugData(absolutePath, 5, 'yaml_config', config, 'yaml');
    console.log(chalk.gray(`   → Debug: ${filename}`));
  }

  state.step5 = {
    completed: true,
    timestamp: new Date().toISOString(),
    config
  };

  return { success: true, config };
}

/**
 * ÉTAPE 6: YAML MERGE
 * Fusionne avec le YAML existant
 */
async function step6_yamlMerge(absolutePath, options, state) {
  if (!state.step5?.completed) {
    console.log(chalk.red('Erreur: Étape 5 non complétée. Exécutez d\'abord --step=5'));
    return { success: false, error: 'Step 5 required' };
  }

  stepHeader(6, 'Merging with existing YAML...');

  const spinner = ora('Fusion intelligente...').start();

  const yamlPath = join(absolutePath, 'tracking', 'gtm-tracking-plan.yml');
  let existingYaml = null;

  if (existsSync(yamlPath)) {
    try {
      existingYaml = readFileSync(yamlPath, 'utf8');
    } catch (e) {
      // Ignorer
    }
  }

  let finalConfig;
  try {
    const generatedConfig = state.step5.config;

    if (existingYaml) {
      const existingConfig = yaml.load(existingYaml);
      finalConfig = mergeWithExisting(generatedConfig, existingConfig);
      spinner.succeed('Fusion avec YAML existant réussie');
    } else {
      finalConfig = generatedConfig;
      spinner.succeed('Nouvelle configuration créée');
    }
  } catch (e) {
    spinner.warn(`Erreur de fusion: ${e.message}`);
    finalConfig = state.step5.config;
  }

  // Debug
  if (options.debug) {
    const filename = saveDebugData(absolutePath, 6, 'merged_config', finalConfig, 'yaml');
    console.log(chalk.gray(`   → Debug: ${filename}`));
  }

  state.step6 = {
    completed: true,
    timestamp: new Date().toISOString(),
    finalConfig,
    hadExisting: !!existingYaml
  };
  state.existingYaml = existingYaml;

  return { success: true, finalConfig };
}

/**
 * ÉTAPE 7: VALIDATION
 * Vérifie la cohérence du tracking plan
 */
async function step7_validation(absolutePath, options, state) {
  if (!state.step6?.completed) {
    console.log(chalk.red('Erreur: Étape 6 non complétée. Exécutez d\'abord --step=6'));
    return { success: false, error: 'Step 6 required' };
  }

  stepHeader(7, 'Validation...');

  const spinner = ora('Vérification de cohérence...').start();

  const finalConfig = state.step6.finalConfig;
  const validation = validateTrackingPlan(finalConfig);

  if (validation.valid) {
    spinner.succeed(`Validation OK (${validation.stats?.eventsCount || 0} events, ${validation.stats?.groupsCount || 0} groupes)`);
  } else {
    spinner.warn('Validation avec erreurs');
    for (const error of validation.errors) {
      console.log(chalk.red(`   ✗ ${error}`));
    }
  }

  for (const warning of validation.warnings.slice(0, 3)) {
    console.log(chalk.yellow(`   ⚠️  ${warning}`));
  }

  // Debug
  if (options.debug) {
    const filename = saveDebugData(absolutePath, 7, 'validation', validation);
    console.log(chalk.gray(`   → Debug: ${filename}`));
  }

  state.step7 = {
    completed: true,
    timestamp: new Date().toISOString(),
    validation
  };

  return { success: true, validation };
}

/**
 * ÉTAPE 8: GENERATION
 * Écrit les fichiers finaux et affiche les suggestions
 */
async function step8_generation(absolutePath, options, state) {
  if (!state.step7?.completed) {
    console.log(chalk.red('Erreur: Étape 7 non complétée. Exécutez d\'abord --step=7'));
    return { success: false, error: 'Step 7 required' };
  }

  stepHeader(8, 'Generation...');

  const finalConfig = state.step6.finalConfig;
  const yamlPath = join(absolutePath, 'tracking', 'gtm-tracking-plan.yml');

  // Prévisualisation
  if (options.dryRun) {
    console.log();
    console.log(chalk.white.bold('Prévisualisation (--dry-run):'));
    console.log(chalk.gray('─'.repeat(50)));
    const yamlOutput = generateYAML(finalConfig);
    console.log(yamlOutput.slice(0, 3000));
    if (yamlOutput.length > 3000) {
      console.log(chalk.gray('\n... (tronqué)'));
    }
    console.log(chalk.gray('─'.repeat(50)));
    return { success: true, preview: true, yaml: yamlOutput };
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
      return { success: false, cancelled: true };
    }
  }

  // Créer le dossier tracking
  const trackingDir = join(absolutePath, 'tracking');
  if (!existsSync(trackingDir)) {
    mkdirSync(trackingDir, { recursive: true });
  }

  // Backup si existant
  if (state.existingYaml) {
    const backupPath = yamlPath.replace('.yml', '.backup.yml');
    writeFileSync(backupPath, state.existingYaml);
    console.log(chalk.gray(`   ✓ Backup: ${backupPath}`));
  }

  // Sauvegarder le YAML final
  const yamlOutput = generateYAML(finalConfig);
  writeFileSync(yamlPath, yamlOutput);
  console.log(chalk.green(`   ✓ Sauvegardé: ${yamlPath}`));

  // Debug
  if (options.debug) {
    const filename = saveDebugData(absolutePath, 8, 'final_output', yamlOutput, 'txt');
    console.log(chalk.gray(`   → Debug: ${filename}`));
  }

  state.step8 = {
    completed: true,
    timestamp: new Date().toISOString(),
    yamlPath
  };

  return { success: true, yamlPath };
}

// ============================================================
// FONCTION PRINCIPALE
// ============================================================

/**
 * Commande principale autoedit
 */
export async function runAutoEdit(options) {
  const projectPath = options.path || process.cwd();
  const absolutePath = resolve(projectPath);
  const sourcePath = options.source || absolutePath;

  console.log();
  console.log(boxen(
    chalk.cyan.bold('AUTOEDIT - Pipeline IA 8 étapes'),
    { padding: { left: 2, right: 2, top: 0, bottom: 0 }, borderColor: 'cyan' }
  ));
  console.log();

  // Charger l'état existant ou créer un nouveau
  let state = loadState(absolutePath) || {
    created: new Date().toISOString(),
    projectPath: absolutePath
  };

  // Vérifier si on exécute une étape spécifique
  const targetStep = options.step ? parseInt(options.step, 10) : null;

  if (targetStep) {
    console.log(chalk.cyan(`Mode étape unique: exécution de l'étape ${targetStep}`));
    console.log();
  }

  // ==========================================
  // VÉRIFICATION DES PRÉREQUIS (sauf si on reprend une étape avancée)
  // ==========================================
  if (!targetStep || targetStep <= 2) {
    const models = listAvailableModels();
    const availableModels = models.filter(m => m.available);

    if (availableModels.length === 0) {
      console.log(chalk.red('Aucune clé API IA configurée.'));
      console.log();
      console.log(chalk.yellow('Ajoutez une des clés suivantes dans votre fichier .env :'));
      for (const model of models) {
        console.log(chalk.gray(`   ${model.envKey}=votre_clé  # ${model.name}`));
      }
      return null;
    }

    // Sélectionner le modèle
    let selectedModel = options.ai || getDefaultModel();

    if (!options.ai && !options.auto && !targetStep) {
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

    const modelInfo = getModelConfig(selectedModel);
    options.selectedModel = selectedModel;
    options.modelInfo = modelInfo;

    console.log(chalk.cyan(`Modèle IA: ${modelInfo?.name || selectedModel}`));
  }

  // ==========================================
  // DEMANDER LES INFOS DU PROJET (sauf si on reprend une étape avancée)
  // ==========================================
  let projectInfo = state.projectInfo || {
    projectName: options.name || '',
    domain: options.domain || '',
    siteType: options.type || 'lead-gen'
  };

  if (!options.auto && !targetStep) {
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

  options.projectInfo = projectInfo;
  state.projectInfo = projectInfo;

  // ==========================================
  // EXÉCUTION DES ÉTAPES
  // ==========================================

  const stepFunctions = [
    () => step1_htmlScan(absolutePath, sourcePath, options, state),
    () => step2_aiAnalysis(absolutePath, options, state),
    () => step3_grouping(absolutePath, options, state),
    () => step4_selectorFinder(absolutePath, options, state),
    () => step5_yamlBuild(absolutePath, options, state),
    () => step6_yamlMerge(absolutePath, options, state),
    () => step7_validation(absolutePath, options, state),
    () => step8_generation(absolutePath, options, state)
  ];

  // Déterminer les étapes à exécuter
  let startStep = 1;
  let endStep = TOTAL_STEPS;

  if (targetStep) {
    startStep = targetStep;
    endStep = targetStep;
  }

  // Exécuter les étapes
  let lastResult = null;

  for (let step = startStep; step <= endStep; step++) {
    const stepFn = stepFunctions[step - 1];
    lastResult = await stepFn();

    // Sauvegarder l'état après chaque étape
    saveState(absolutePath, state);

    if (!lastResult.success) {
      console.log();
      console.log(chalk.red(`Pipeline arrêté à l'étape ${step}`));
      return null;
    }
  }

  // ==========================================
  // SUGGESTIONS D'ACTIONS MANUELLES (seulement si on a fait toutes les étapes)
  // ==========================================
  if (!targetStep && state.step4?.selectorReport?.recommendations?.length > 0) {
    const selectorReport = state.step4.selectorReport;
    console.log();
    console.log(chalk.yellow.bold('⚠️  Actions manuelles recommandées:'));
    console.log();

    for (const rec of selectorReport.recommendations.slice(0, 5)) {
      console.log(chalk.yellow(`   → ${rec.suggestion}`));
      console.log(chalk.gray(`     Fichier: ${rec.sourceFile} | Contexte: ${rec.context}`));
      if (rec.text) {
        console.log(chalk.gray(`     Texte: "${rec.text}..."`));
      }
    }

    if (selectorReport.recommendations.length > 5) {
      console.log(chalk.gray(`   ... et ${selectorReport.recommendations.length - 5} autres`));
    }
  }

  // ==========================================
  // RÉSUMÉ FINAL
  // ==========================================
  if (!targetStep) {
    console.log();
    console.log(boxen(
      chalk.green.bold('Pipeline terminé avec succès !') + '\n\n' +
      chalk.white(`Events: ${state.step3?.stats?.standaloneEvents || 0} standalone + ${state.step3?.stats?.consolidatedGroups || 0} groupes\n`) +
      chalk.white(`Sélecteurs: ${state.step4?.selectorReport?.score || 0}/100 (${state.step4?.selectorReport?.grade || 'N/A'})\n`) +
      chalk.white(`Modèle: ${state.aiResult?.model || 'N/A'}\n\n`) +
      chalk.gray('Prochaines étapes:\n') +
      chalk.gray('1. Vérifiez le fichier généré\n') +
      chalk.gray('2. Lancez: google-setup generate-tracking\n') +
      chalk.gray('3. Lancez: google-setup sync'),
      { padding: 1, borderColor: 'green', title: 'Succès', titleAlignment: 'center' }
    ));
  } else {
    console.log();
    console.log(chalk.green(`✓ Étape ${targetStep} terminée avec succès`));
    console.log(chalk.gray(`  État sauvegardé dans: tracking/debug/state.json`));

    if (targetStep < TOTAL_STEPS) {
      console.log(chalk.cyan(`  Prochaine étape: google-setup autoedit --step=${targetStep + 1}`));
    }
  }

  return {
    success: true,
    stats: state.step3?.stats || {},
    selectorScore: state.step4?.selectorReport?.score || 0,
    model: state.aiResult?.model || null,
    yamlPath: state.step8?.yamlPath || null,
    manualActions: state.step4?.selectorReport?.recommendations?.length || 0
  };
}
