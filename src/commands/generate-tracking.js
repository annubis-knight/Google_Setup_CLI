/**
 * Génère le fichier gtm-tracking.js à partir du tracking-plan.yml
 * Lit les events activés (enabled: true) et génère le code JS correspondant
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import chalk from 'chalk';
import yaml from 'js-yaml';
import inquirer from 'inquirer';

/**
 * Génère le fichier gtm-tracking.js
 * @param {Object} options - Options de la commande
 */
export async function runGenerateTracking(options = {}) {
  const projectPath = resolve(options.path || process.cwd());
  const trackingDir = options.input || 'tracking';
  const outputFile = options.output || 'gtm-tracking.js';

  const yamlPath = join(projectPath, trackingDir, 'gtm-tracking-plan.yml');
  const outputPath = join(projectPath, trackingDir, outputFile);

  console.log(chalk.cyan('\n📝 Génération du fichier gtm-tracking.js\n'));

  // Vérifier que le dossier tracking/ existe
  const trackingDirPath = join(projectPath, trackingDir);
  if (!existsSync(trackingDirPath)) {
    console.log(chalk.red(`❌ Dossier non trouvé: ${trackingDirPath}`));
    console.log(chalk.yellow('\n💡 Étapes à suivre:'));
    console.log(chalk.gray('   1. Lancez: google-setup init-tracking'));
    console.log(chalk.gray('   2. Éditez tracking/gtm-tracking-plan.yml (enabled: true/false)'));
    console.log(chalk.gray('   3. Relancez: google-setup generate-tracking'));
    return;
  }

  // Vérifier que le YAML existe
  if (!existsSync(yamlPath)) {
    console.log(chalk.red(`❌ Fichier non trouvé: ${yamlPath}`));
    console.log(chalk.yellow('\n💡 Le dossier tracking/ existe mais pas le fichier gtm-tracking-plan.yml'));
    console.log(chalk.gray('   Lancez: google-setup init-tracking'));
    return;
  }

  console.log(chalk.gray(`📁 Source: ${yamlPath}\n`));

  // Vérifier si le fichier de sortie existe déjà
  if (existsSync(outputPath) && !options.force) {
    console.log(chalk.yellow(`⚠️  Le fichier ${outputFile} existe déjà.`));
    console.log(chalk.gray('   Utilisez --force pour écraser.'));
    return;
  }

  // Lire et parser le YAML
  let config;
  try {
    const yamlContent = readFileSync(yamlPath, 'utf8');
    config = yaml.load(yamlContent);
  } catch (error) {
    console.log(chalk.red(`❌ Erreur de parsing YAML: ${error.message}`));
    return;
  }

  // Filtrer les events activés
  const enabledEvents = (config.events || []).filter(e => e.enabled === true);

  if (enabledEvents.length === 0) {
    console.log(chalk.yellow('⚠️  Aucun event activé dans le gtm-tracking-plan.yml'));
    console.log(chalk.gray('   Mettez enabled: true sur les events à générer.'));
    return;
  }

  console.log(chalk.gray(`📋 ${enabledEvents.length} events activés trouvés\n`));

  // Générer le code JS
  const jsCode = generateJavaScript(config, enabledEvents);

  // Écrire le fichier
  writeFileSync(outputPath, jsCode, 'utf8');

  console.log(chalk.green(`✅ Fichier généré: ${outputPath}`));
  console.log(chalk.gray(`   ${enabledEvents.length} fonctions de tracking créées\n`));

  // Afficher les fonctions générées
  console.log(chalk.cyan('Fonctions disponibles:'));
  enabledEvents.forEach(event => {
    const funcName = event.datalayer?.javascript_function?.split('(')[0] || `track${toPascalCase(event.id)}`;
    console.log(chalk.gray(`   • ${funcName}()`));
  });
  console.log('');
}

/**
 * Génère le code JavaScript
 */
function generateJavaScript(config, events) {
  const projectName = config.project?.name || 'Mon Projet';
  const domain = config.project?.domain || '';

  // Séparer les events par type
  const standardEvents = events.filter(e => !isEcommerceEvent(e));
  const ecommerceEvents = events.filter(e => isEcommerceEvent(e));

  let code = `/**
 * GTM Tracking - ${projectName}
 * ${domain ? `Domaine: ${domain}` : ''}
 * Généré automatiquement par google-setup-cli
 *
 * Ce fichier contient les fonctions de tracking dataLayer
 * À importer dans votre application et appeler aux moments appropriés
 */

// ============================================
// CONFIGURATION
// ============================================

const DEBUG = false; // Mettre à true pour logger les events

// ============================================
// FONCTION UTILITAIRE - PUSH EVENT
// ============================================

/**
 * Push un event dans le dataLayer
 * @param {string} eventName - Nom de l'event
 * @param {Object} eventData - Données additionnelles
 */
function pushEvent(eventName, eventData = {}) {
  window.dataLayer = window.dataLayer || [];

  const payload = {
    event: eventName,
    ...eventData,
    timestamp: new Date().toISOString()
  };

  window.dataLayer.push(payload);

  if (DEBUG) {
    console.log('[GTM]', eventName, eventData);
  }
}

`;

  // Générer les fonctions pour les events standards
  if (standardEvents.length > 0) {
    code += `// ============================================
// FONCTIONS DE TRACKING
// ============================================

`;

    for (const event of standardEvents) {
      code += generateEventFunction(event);
    }
  }

  // Générer les fonctions e-commerce
  if (ecommerceEvents.length > 0) {
    code += `// ============================================
// E-COMMERCE
// ============================================

`;

    for (const event of ecommerceEvents) {
      code += generateEcommerceFunction(event);
    }
  }

  // Ajouter l'auto-tracking pour les contacts
  const hasPhoneClick = events.some(e => e.id === 'phone_click');
  const hasEmailClick = events.some(e => e.id === 'email_click');
  const hasWhatsAppClick = events.some(e => e.id === 'whatsapp_click');

  if (hasPhoneClick || hasEmailClick || hasWhatsAppClick) {
    code += `// ============================================
// AUTO-TRACKING (LIENS TEL/MAILTO)
// ============================================

/**
 * Initialise le tracking automatique des liens
 * Appeler au chargement de la page
 */
export function initAutoTracking() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href') || '';

`;

    if (hasPhoneClick) {
      code += `    if (href.startsWith('tel:')) {
      trackPhoneClick();
    }

`;
    }

    if (hasEmailClick) {
      code += `    if (href.startsWith('mailto:')) {
      trackEmailClick();
    }

`;
    }

    if (hasWhatsAppClick) {
      code += `    if (href.includes('wa.me') || href.includes('whatsapp')) {
      trackWhatsAppClick();
    }

`;
    }

    code += `  });
}

`;
  }

  // Scroll tracking
  const hasScrollDepth = events.some(e => e.id === 'scroll_depth');
  if (hasScrollDepth) {
    code += `// ============================================
// SCROLL TRACKING
// ============================================

const scrollThresholds = [25, 50, 75, 100];
const scrollTracked = new Set();

/**
 * Initialise le tracking du scroll
 * Appeler au chargement de la page
 */
export function initScrollTracking() {
  window.addEventListener('scroll', () => {
    const scrollPercent = Math.round(
      (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
    );

    for (const threshold of scrollThresholds) {
      if (scrollPercent >= threshold && !scrollTracked.has(threshold)) {
        scrollTracked.add(threshold);
        trackScrollDepth(threshold);
      }
    }
  }, { passive: true });
}

`;
  }

  // Exports
  code += `// ============================================
// EXPORTS
// ============================================

export {
  pushEvent,
`;

  for (const event of events) {
    const funcName = getFunctionName(event);
    code += `  ${funcName},\n`;
  }

  code += `};
`;

  return code;
}

/**
 * Génère une fonction pour un event standard
 */
function generateEventFunction(event) {
  const funcName = getFunctionName(event);
  const eventName = event.datalayer?.event_name || event.id;
  const params = event.datalayer?.params || [];

  // Construire les paramètres de fonction
  const funcParams = params
    .filter(p => p.required !== false)
    .map(p => p.name)
    .join(', ');

  const optionalParams = params.filter(p => p.required === false);
  const allParams = params.map(p => p.name).join(', ');

  let code = `/**
 * ${event.name}
 * ${event.objective || ''}
`;

  // Documenter les paramètres
  for (const param of params) {
    const required = param.required !== false ? '' : ' (optionnel)';
    code += ` * @param {${param.type || 'any'}} ${param.name} - ${param.description || ''}${required}\n`;
  }

  code += ` */
export function ${funcName}(${allParams || ''}) {
  pushEvent('${eventName}'`;

  if (params.length > 0) {
    code += `, {\n`;
    for (const param of params) {
      if (param.default !== undefined) {
        code += `    ${param.name}: ${param.name} ?? ${JSON.stringify(param.default)},\n`;
      } else {
        code += `    ${param.name},\n`;
      }
    }
    code += `  }`;
  }

  code += `);
}

`;

  return code;
}

/**
 * Génère une fonction pour un event e-commerce
 */
function generateEcommerceFunction(event) {
  const funcName = getFunctionName(event);
  const eventName = event.datalayer?.event_name || event.id;

  let code = `/**
 * ${event.name}
 * ${event.objective || ''}
 * @param {Object} ecommerce - Objet ecommerce GA4
 */
export function ${funcName}(ecommerce) {
  // Clear previous ecommerce data
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ ecommerce: null });

  pushEvent('${eventName}', { ecommerce });
}

`;

  return code;
}

/**
 * Vérifie si un event est de type e-commerce
 */
function isEcommerceEvent(event) {
  return event.category === 'Ecommerce' ||
         event.ga4?.ecommerce === true ||
         ['view_item', 'add_to_cart', 'begin_checkout', 'purchase'].includes(event.id);
}

/**
 * Récupère le nom de fonction depuis l'event
 */
function getFunctionName(event) {
  // Si une fonction est définie dans le YAML, l'utiliser
  if (event.datalayer?.javascript_function) {
    return event.datalayer.javascript_function.split('(')[0];
  }
  // Sinon, générer depuis l'id
  return `track${toPascalCase(event.id)}`;
}

/**
 * Convertit snake_case en PascalCase
 */
function toPascalCase(str) {
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Mode interactif
 */
export async function handleGenerateTrackingInteractive() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'path',
      message: 'Chemin du projet :',
      default: process.cwd()
    },
    {
      type: 'input',
      name: 'output',
      message: 'Nom du fichier de sortie :',
      default: 'gtm-tracking.js'
    },
    {
      type: 'confirm',
      name: 'force',
      message: 'Écraser si le fichier existe ?',
      default: false
    }
  ]);

  await runGenerateTracking(answers);
}
