/**
 * Commande init-tracking
 * Génère les fichiers de plan de taggage (YAML + MD) dans le projet
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { detectLocalProject } from '../detectors/local-project-detector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Charge un template depuis le dossier templates
 */
function loadTemplate(templateName) {
  const templatePath = join(__dirname, '..', 'templates', templateName);
  return readFileSync(templatePath, 'utf8');
}

/**
 * Remplace les placeholders dans un template
 */
function replacePlaceholders(content, data) {
  return content
    .replace(/\{\{PROJECT_NAME\}\}/g, data.projectName || '')
    .replace(/\{\{DOMAIN\}\}/g, data.domain || '')
    .replace(/\{\{GA4_MEASUREMENT_ID\}\}/g, data.ga4Id || '')
    .replace(/\{\{GTM_CONTAINER_ID\}\}/g, data.gtmId || '')
    .replace(/\{\{DATE\}\}/g, new Date().toISOString().split('T')[0]);
}

/**
 * Détecte les infos existantes dans le projet
 */
function detectExistingInfo(projectPath) {
  const localProject = detectLocalProject(projectPath);
  const info = {
    gtmId: localProject.containerId || '',
    projectName: '',
    domain: ''
  };

  // Essayer de lire .google-setup.json
  const configPath = join(projectPath, '.google-setup.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      info.projectName = config.projectName || '';
      info.domain = config.domain || '';
      info.ga4Id = config.ga4MeasurementId || '';
      info.gtmId = config.gtmContainerId || info.gtmId;
    } catch (e) {
      // Ignore
    }
  }

  return info;
}

/**
 * Commande principale init-tracking
 */
export async function runInitTracking(options) {
  const projectPath = options.path || process.cwd();
  const outputDir = options.output || 'tracking';
  const force = options.force || false;

  console.log();
  console.log(chalk.cyan.bold('📋 Initialisation du Plan de Taggage'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log();

  // Vérifier si les fichiers existent déjà
  const yamlPath = join(projectPath, outputDir, 'gtm-tracking-plan.yml');
  const mdPath = join(projectPath, outputDir, 'gtm-tracking-plan.md');

  if (!force && (existsSync(yamlPath) || existsSync(mdPath))) {
    console.log(chalk.yellow('⚠️  Des fichiers de plan de taggage existent déjà :'));
    if (existsSync(yamlPath)) console.log(chalk.gray(`   • ${yamlPath}`));
    if (existsSync(mdPath)) console.log(chalk.gray(`   • ${mdPath}`));
    console.log();

    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: 'Voulez-vous les écraser ?',
      default: false
    }]);

    if (!overwrite) {
      console.log(chalk.gray('\nOpération annulée.'));
      return;
    }
  }

  // Détecter les infos existantes
  const existingInfo = detectExistingInfo(projectPath);

  // Demander les infos du projet
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectName',
      message: 'Nom du projet :',
      default: existingInfo.projectName || projectPath.split(/[/\\]/).pop()
    },
    {
      type: 'input',
      name: 'domain',
      message: 'Domaine :',
      default: existingInfo.domain,
      validate: v => v.length > 0 || 'Domaine requis'
    },
    {
      type: 'input',
      name: 'ga4Id',
      message: 'GA4 Measurement ID (G-XXXXXXXXXX) :',
      default: existingInfo.ga4Id
    },
    {
      type: 'input',
      name: 'gtmId',
      message: 'GTM Container ID (GTM-XXXXXXX) :',
      default: existingInfo.gtmId
    }
  ]);

  // Créer le dossier de sortie
  const fullOutputDir = join(projectPath, outputDir);
  if (!existsSync(fullOutputDir)) {
    mkdirSync(fullOutputDir, { recursive: true });
  }

  // Charger et personnaliser les templates
  console.log();
  console.log(chalk.cyan('📝 Génération des fichiers...'));

  try {
    // YAML
    let yamlContent = loadTemplate('gtm-tracking-plan.yml');
    yamlContent = yamlContent
      .replace(/^  name: ""$/m, `  name: "${answers.projectName}"`)
      .replace(/^  domain: ""$/m, `  domain: "${answers.domain}"`)
      .replace(/^  ga4_measurement_id: ""$/m, `  ga4_measurement_id: "${answers.ga4Id}"`)
      .replace(/^  gtm_container_id: ""$/m, `  gtm_container_id: "${answers.gtmId}"`)
      .replace(/^  updated: ""$/m, `  updated: "${new Date().toISOString().split('T')[0]}"`);

    writeFileSync(yamlPath, yamlContent);
    console.log(chalk.green(`   ✓ ${outputDir}/gtm-tracking-plan.yml`));

    // Markdown
    let mdContent = loadTemplate('gtm-tracking-plan.md');
    mdContent = replacePlaceholders(mdContent, answers);
    writeFileSync(mdPath, mdContent);
    console.log(chalk.green(`   ✓ ${outputDir}/gtm-tracking-plan.md`));

  } catch (error) {
    console.error(chalk.red(`   ✗ Erreur: ${error.message}`));
    return;
  }

  console.log();
  console.log(chalk.green.bold('✅ Plan de taggage initialisé !'));
  console.log();
  console.log(chalk.white('Prochaines étapes :'));
  console.log(chalk.gray(`   1. Éditez ${outputDir}/gtm-tracking-plan.yml`));
  console.log(chalk.gray('   2. Activez/désactivez les events selon vos besoins (enabled: true/false)'));
  console.log(chalk.gray('   3. Lancez: google-setup sync pour créer les triggers/variables dans GTM'));
  console.log();
}

/**
 * Mode interactif
 */
export async function handleInitTrackingInteractive() {
  await runInitTracking({});
}
