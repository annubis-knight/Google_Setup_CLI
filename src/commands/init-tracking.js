/**
 * Commande init-tracking (Étape 1)
 * Déploie le dossier tracking/ avec tracking-events.yaml et tracking-rules.yaml
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import inquirer from 'inquirer';

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
 * Charge la config locale .google-setup.json si elle existe
 */
function loadLocalConfig(projectPath) {
  const configPath = join(projectPath, '.google-setup.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      return {
        projectName: config.projectName || '',
        domain: config.domain || '',
        ga4Id: config.ga4?.measurementId || config.ga4MeasurementId || '',
        gtmId: config.gtm?.containerId || config.gtmContainerId || ''
      };
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Commande principale init-tracking
 */
export async function runInitTracking(options) {
  const projectPath = options.path || process.cwd();
  const outputDir = 'tracking';
  const debugDir = 'tracking/debug';
  const force = options.force || false;

  console.log();
  console.log(chalk.cyan.bold('📋 [Étape 1/8] Initialisation du Tracking'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log();

  // Vérifier si les fichiers existent déjà
  const eventsPath = join(projectPath, outputDir, 'tracking-events.yaml');
  const rulesPath = join(projectPath, outputDir, 'tracking-rules.yaml');

  if (!force && (existsSync(eventsPath) || existsSync(rulesPath))) {
    console.log(chalk.yellow('⚠️  Des fichiers tracking existent déjà :'));
    if (existsSync(eventsPath)) console.log(chalk.gray(`   • ${eventsPath}`));
    if (existsSync(rulesPath)) console.log(chalk.gray(`   • ${rulesPath}`));
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

  // Charger la config locale si elle existe
  const localConfig = loadLocalConfig(projectPath);

  let projectName, domain, ga4Id, gtmId;

  if (localConfig && localConfig.projectName && localConfig.domain) {
    // Config locale trouvée - utiliser directement
    console.log(chalk.green('✓ Configuration locale détectée (.google-setup.json)'));
    console.log(chalk.gray(`   Projet: ${localConfig.projectName}`));
    console.log(chalk.gray(`   Domaine: ${localConfig.domain}`));
    if (localConfig.ga4Id) console.log(chalk.gray(`   GA4: ${localConfig.ga4Id}`));
    if (localConfig.gtmId) console.log(chalk.gray(`   GTM: ${localConfig.gtmId}`));
    console.log();

    projectName = localConfig.projectName;
    domain = localConfig.domain;
    ga4Id = localConfig.ga4Id || '';
    gtmId = localConfig.gtmId || '';
  } else {
    // Pas de config locale - demander les infos
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Nom du projet :',
        default: projectPath.split(/[/\\]/).pop()
      },
      {
        type: 'input',
        name: 'domain',
        message: 'Domaine :',
        validate: v => v.length > 0 || 'Domaine requis'
      },
      {
        type: 'input',
        name: 'ga4Id',
        message: 'GA4 Measurement ID (G-XXXXXXXXXX) - optionnel :',
        default: ''
      },
      {
        type: 'input',
        name: 'gtmId',
        message: 'GTM Container ID (GTM-XXXXXXX) - optionnel :',
        default: ''
      }
    ]);

    projectName = answers.projectName;
    domain = answers.domain;
    ga4Id = answers.ga4Id;
    gtmId = answers.gtmId;
  }

  // Créer les dossiers
  const fullOutputDir = join(projectPath, outputDir);
  const fullDebugDir = join(projectPath, debugDir);

  if (!existsSync(fullOutputDir)) {
    mkdirSync(fullOutputDir, { recursive: true });
  }
  if (!existsSync(fullDebugDir)) {
    mkdirSync(fullDebugDir, { recursive: true });
  }

  // Charger et personnaliser le template
  console.log();
  console.log(chalk.cyan('📝 Génération des fichiers...'));

  try {
    // 1. Charger et déployer tracking-events.yaml
    let eventsContent = loadTemplate('tracking-events.yaml');

    // Remplacer les placeholders dans la section project
    eventsContent = eventsContent
      .replace(/^  name: ""$/m, `  name: "${projectName}"`)
      .replace(/^  gtm_container_id: ""$/m, `  gtm_container_id: "${gtmId}"`)
      .replace(/^  ga4_measurement_id: ""$/m, `  ga4_measurement_id: "${ga4Id}"`)
      .replace(/\{\{DOMAIN\}\}/g, domain);

    writeFileSync(eventsPath, eventsContent);
    console.log(chalk.green(`   ✓ ${outputDir}/tracking-events.yaml (56 events)`));

    // === Toujours créer/mettre à jour .google-setup.json ===
    const configPath = join(projectPath, '.google-setup.json');
    let existingConfig = {};
    if (existsSync(configPath)) {
      try {
        existingConfig = JSON.parse(readFileSync(configPath, 'utf8'));
      } catch (e) {
        // Fichier corrompu, on repart de zéro
      }
    }

    const newConfig = {
      ...existingConfig,
      version: existingConfig.version || '2.0.0',
      projectName: projectName,
      domain: domain,
      createdAt: existingConfig.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // GA4 (uniquement si fourni ou existant)
    if (ga4Id || existingConfig.ga4?.measurementId) {
      newConfig.ga4 = {
        ...existingConfig.ga4,
        measurementId: ga4Id || existingConfig.ga4?.measurementId
      };
    }

    // GTM (uniquement si fourni ou existant)
    if (gtmId || existingConfig.gtm?.containerId) {
      newConfig.gtm = {
        ...existingConfig.gtm,
        containerId: gtmId || existingConfig.gtm?.containerId
      };
    }

    // Préserver thirdParty existant
    if (existingConfig.thirdParty) {
      newConfig.thirdParty = existingConfig.thirdParty;
    }

    writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    console.log(chalk.green('   ✓ .google-setup.json (source de vérité)'));

    // 2. Charger et déployer tracking-rules.yaml
    const rulesContent = loadTemplate('tracking-rules.yaml');
    writeFileSync(rulesPath, rulesContent);
    console.log(chalk.green(`   ✓ ${outputDir}/tracking-rules.yaml (5 rulesets)`));

    // 3. Créer un fichier .gitkeep dans debug/
    const gitkeepPath = join(fullDebugDir, '.gitkeep');
    if (!existsSync(gitkeepPath)) {
      writeFileSync(gitkeepPath, '');
      console.log(chalk.green(`   ✓ ${debugDir}/.gitkeep`));
    }

  } catch (error) {
    console.error(chalk.red(`   ✗ Erreur: ${error.message}`));
    return;
  }

  console.log();
  console.log(chalk.green.bold('✅ Tracking initialisé !'));
  console.log();
  console.log(chalk.white('Prochaines étapes :'));
  console.log(chalk.gray('   [Étape 2] google-setup event-setup     → Sélectionner les events à tracker'));
  console.log(chalk.gray('   [Étape 3] google-setup gtm-config-setup → Générer la config GTM'));
  console.log(chalk.gray('   [Étape 4] google-setup deploy           → Déployer dans GTM'));
  console.log(chalk.gray('   [Étape 5] google-setup html-layer       → Ajouter les attributs HTML'));
  console.log();
}

/**
 * Mode interactif
 */
export async function handleInitTrackingInteractive() {
  await runInitTracking({});
}
