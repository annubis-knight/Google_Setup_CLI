/**
 * Commande gtm-config-setup (Étape 3)
 * Génère gtm-config.yaml à partir de tracking-events.yaml
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import yaml from 'js-yaml';
import inquirer from 'inquirer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Extrait les balises tierces (type: html) depuis le template gtm-config.yaml
 */
function loadThirdPartyTagsFromTemplate() {
  const templatePath = join(__dirname, '..', 'templates', 'gtm-config.yaml');
  const templateContent = readFileSync(templatePath, 'utf8');
  const template = yaml.load(templateContent);

  // Filtrer les tags de type "html" avec un third_party_id
  const thirdPartyTags = (template.tags || []).filter(tag =>
    tag.type === 'html' && tag.third_party_id
  );

  return thirdPartyTags.map(tag => {
    // Extraire le placeholder ID (ex: {{CONTENTSQUARE_TAG_ID}} -> CONTENTSQUARE_TAG_ID)
    const idMatch = tag.third_party_id.match(/\{\{(\w+)\}\}/);
    const configKey = idMatch ? idMatch[1] : tag.third_party_id;

    return {
      name: tag.name.replace(' - Tracking Code', ''),
      configKey: configKey,
      html: tag.html,
      triggers: tag.triggers || ['All Pages']
    };
  });
}

/**
 * Génère la configuration GTM à partir des events
 * @param {Object} projectInfo - Infos projet depuis tracking-events.yaml
 * @param {Array} events - Liste des events
 * @param {Object} thirdPartyConfig - Config balises tierces depuis .google-setup.json
 */
function generateGtmConfig(projectInfo, events, thirdPartyConfig = {}) {
  const date = new Date().toISOString().split('T')[0];

  // Grouper les events par catégorie
  const eventsByCategory = {};
  for (const event of events) {
    const cat = event.category || 'engagement';
    if (!eventsByCategory[cat]) eventsByCategory[cat] = [];
    eventsByCategory[cat].push(event);
  }

  // Construire la config
  const config = {
    _comment: 'AUTO-GÉNÉRÉ - NE PAS MODIFIER MANUELLEMENT',
    _source: 'tracking-events.yaml',
    _command: 'google-setup gtm-config-setup',
    _generated: date,
    _eventCount: events.length,

    project: {
      name: projectInfo.name || '',
      gtm_container_id: projectInfo.gtm_container_id || '',
      ga4_measurement_id: projectInfo.ga4_measurement_id || ''
    },

    variables: [
      {
        name: 'Constant - GA4 Measurement ID',
        type: 'constant',
        value: projectInfo.ga4_measurement_id || '{{GA4_MEASUREMENT_ID}}'
      },
      {
        name: 'dlv - element_id',
        type: 'data_layer',
        data_layer_name: 'element_id'
      },
      {
        name: 'dlv - page_section',
        type: 'data_layer',
        data_layer_name: 'page_section'
      },
      {
        name: 'dlv - page_path',
        type: 'data_layer',
        data_layer_name: 'page_path'
      }
    ],

    triggers: [
      {
        // name: 'All Pages',
        // type: 'pageview'
      }
    ],

    tags: [
      {
        name: 'GA4 - Config',
        type: 'ga4_configuration',
        measurement_id: '{{Constant - GA4 Measurement ID}}',
        triggers: ['All Pages']
      }
    ]
  };

  // Générer les triggers pour chaque event
  const categoryOrder = ['conversion', 'lead', 'engagement', 'navigation'];

  for (const category of categoryOrder) {
    const catEvents = eventsByCategory[category] || [];
    if (catEvents.length === 0) continue;

    // Ajouter un commentaire séparateur (via un objet spécial)
    config.triggers.push({
      _category: category.toUpperCase()
    });

    for (const event of catEvents) {
      config.triggers.push({
        name: `CE - ${event.event_name}`,
        type: 'custom_event',
        event_name: event.event_name,
        description: event.description || null
      });
    }
  }

  // Générer les tags GA4 Event par catégorie
  const categoryLabels = {
    conversion: 'Conversions',
    lead: 'Leads',
    engagement: 'Engagement',
    navigation: 'Navigation'
  };

  for (const category of categoryOrder) {
    const catEvents = eventsByCategory[category] || [];
    if (catEvents.length === 0) continue;

    config.tags.push({
      name: `GA4 Event - ${categoryLabels[category]}`,
      type: 'ga4_event',
      configuration_tag: 'GA4 - Config',
      event_parameters: [
        { name: 'element_id', value: '{{dlv - element_id}}' },
        { name: 'page_section', value: '{{dlv - page_section}}' },
        { name: 'page_path', value: '{{dlv - page_path}}' }
      ],
      triggers: catEvents.map(e => `CE - ${e.event_name}`)
    });
  }

  // === Ajouter les balises tierces sélectionnées ===
  for (const tag of (thirdPartyConfig.selectedTags || [])) {
    // Remplacer le placeholder par l'ID réel
    const html = tag.html.replace(new RegExp(`\\{\\{${tag.configKey}\\}\\}`, 'g'), tag.id);

    config.tags.push({
      name: `${tag.name} - Tracking Code`,
      type: 'html',
      html: html,
      triggers: tag.triggers
    });
  }

  return config;
}

/**
 * Convertit la config en YAML formaté
 */
function configToYaml(config) {
  let content = `# =================================================
# GTM CONFIG - Fichier Généré
# google-setup-cli
# =================================================
#
# AUTO-GÉNÉRÉ - NE PAS MODIFIER MANUELLEMENT
#
# Source: tracking-events.yaml
# Commande: google-setup gtm-config-setup
#
# Pour modifier, éditez tracking-events.yaml
# puis relancez la génération.
#
# =================================================

# Généré depuis: tracking-events.yaml
# Date: ${config._generated}
# Events: ${config._eventCount}

project:
  name: "${config.project.name}"
  gtm_container_id: "${config.project.gtm_container_id}"
  ga4_measurement_id: "${config.project.ga4_measurement_id}"

# ============================================
# VARIABLES GTM
# ============================================
variables:
`;

  for (const variable of config.variables) {
    content += `  - name: "${variable.name}"
    type: "${variable.type}"
`;
    if (variable.value) {
      content += `    value: "${variable.value}"
`;
    }
    if (variable.data_layer_name) {
      content += `    data_layer_name: "${variable.data_layer_name}"
`;
    }
    content += '\n';
  }

  content += `# ============================================
# TRIGGERS GTM
# ============================================
triggers:
`;

  for (const trigger of config.triggers) {
    if (trigger._category) {
      content += `
  # --- ${trigger._category} ---
`;
      continue;
    }
    content += `  - name: "${trigger.name}"
    type: "${trigger.type}"
`;
    if (trigger.event_name) {
      content += `    event_name: "${trigger.event_name}"
`;
    }
    if (trigger.description) {
      content += `    # ${trigger.description}
`;
    }
    content += '\n';
  }

  content += `# ============================================
# BALISES GA4
# ============================================
tags:
`;

  // Séparer tags GA4 et tags tiers
  const ga4Tags = config.tags.filter(t => t.type !== 'html');
  const thirdPartyTags = config.tags.filter(t => t.type === 'html');

  for (const tag of ga4Tags) {
    content += `  - name: "${tag.name}"
    type: "${tag.type}"
`;
    if (tag.measurement_id) {
      content += `    measurement_id: "${tag.measurement_id}"
`;
    }
    if (tag.configuration_tag) {
      content += `    configuration_tag: "${tag.configuration_tag}"
`;
    }
    if (tag.event_parameters) {
      content += `    event_parameters:
`;
      for (const param of tag.event_parameters) {
        content += `      - name: "${param.name}"
        value: "${param.value}"
`;
      }
    }
    content += `    triggers:
`;
    for (const t of tag.triggers) {
      content += `      - "${t}"
`;
    }
    content += '\n';
  }

  // Ajouter les balises tierces (type html)
  if (thirdPartyTags.length > 0) {
    content += `# ============================================
# BALISES TIERCES
# ============================================
`;
    for (const tag of thirdPartyTags) {
      content += `  - name: "${tag.name}"
    type: "${tag.type}"
    html: |
`;
      // Indenter chaque ligne du HTML
      for (const line of tag.html.split('\n')) {
        content += `      ${line}\n`;
      }
      content += `    triggers:
`;
      for (const t of tag.triggers) {
        content += `      - "${t}"
`;
      }
      content += '\n';
    }
  }

  // Résumé
  const triggerCount = config.triggers.filter(t => !t._category).length;
  const tagCount = config.tags.length;

  content += `# ============================================
# RÉSUMÉ
# ============================================
# Variables: ${config.variables.length} (1 constante + ${config.variables.length - 1} DLV)
# Triggers: ${triggerCount} (1 pageview + ${triggerCount - 1} custom events)
# Tags: ${tagCount} (1 Config + ${tagCount - 1} Event)
# ============================================
`;

  return content;
}

/**
 * Commande principale gtm-config-setup
 */
export async function runGtmConfigSetup(options) {
  const projectPath = options.path || process.cwd();
  const inputPath = join(projectPath, 'tracking', 'tracking-events.yaml');
  const outputPath = join(projectPath, 'tracking', 'gtm-config.yaml');

  console.log();
  console.log(chalk.cyan.bold('⚙️  [Étape 3/8] Génération de la Config GTM'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log();

  // Vérifier que le fichier source existe
  if (!existsSync(inputPath)) {
    console.log(chalk.red('✗ Fichier tracking-events.yaml non trouvé.'));
    console.log(chalk.gray('  Lancez d\'abord: google-setup init-tracking'));
    return;
  }

  // Lire et parser le fichier source
  console.log(chalk.gray('   Lecture de tracking-events.yaml...'));
  const yamlContent = readFileSync(inputPath, 'utf8');
  const parsed = yaml.load(yamlContent);

  if (!parsed.events || parsed.events.length === 0) {
    console.log(chalk.red('✗ Aucun event trouvé dans tracking-events.yaml'));
    console.log(chalk.gray('  Lancez: google-setup event-setup pour configurer les events'));
    return;
  }

  // Charger la config locale depuis .google-setup.json
  const localConfigPath = join(projectPath, '.google-setup.json');
  let localConfig = {};
  let existingThirdPartyIds = {};
  if (existsSync(localConfigPath)) {
    try {
      localConfig = JSON.parse(readFileSync(localConfigPath, 'utf8'));
      existingThirdPartyIds = localConfig.thirdParty || {};
    } catch (e) {
      // Ignorer si fichier invalide
    }
  }

  console.log(chalk.gray(`   ${parsed.events.length} events trouvés`));

  // === Charger les balises tierces depuis le template ===
  const availableTags = loadThirdPartyTagsFromTemplate();

  if (availableTags.length > 0) {
    console.log();
    console.log(chalk.cyan('📦 Balises tierces'));

    const tagChoices = availableTags.map(tag => ({
      name: tag.name,
      value: tag.configKey,
      checked: !!existingThirdPartyIds[tag.configKey]  // Pré-coché si ID existant
    }));

    const { selectedTagKeys } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selectedTagKeys',
      message: 'Quelles balises tierces inclure dans GTM ?',
      choices: tagChoices
    }]);

    // Collecter les IDs manquants
    const selectedTagsWithIds = [];
    const newThirdPartyIds = {};

    for (const configKey of selectedTagKeys) {
      const tag = availableTags.find(t => t.configKey === configKey);
      let tagId = existingThirdPartyIds[configKey];

      if (!tagId) {
        const { value } = await inquirer.prompt([{
          type: 'input',
          name: 'value',
          message: `${tag.name} - ID :`,
          validate: v => v.length > 0 || 'ID requis'
        }]);
        tagId = value;
      }

      newThirdPartyIds[configKey] = tagId;
      selectedTagsWithIds.push({
        ...tag,
        id: tagId
      });
    }

    console.log();
    console.log(chalk.gray('   Génération de la configuration GTM...'));

    const gtmConfig = generateGtmConfig(parsed.project || {}, parsed.events, { selectedTags: selectedTagsWithIds });
    const gtmYaml = configToYaml(gtmConfig);

    // Sauvegarder
    writeFileSync(outputPath, gtmYaml);

    // Stats
    const triggerCount = gtmConfig.triggers.filter(t => !t._category).length;
    const tagCount = gtmConfig.tags.length;
    const thirdPartyTagCount = gtmConfig.tags.filter(t => t.type === 'html').length;
    const ga4TagCount = tagCount - thirdPartyTagCount;

    console.log();
    console.log(chalk.green.bold('✅ Configuration GTM générée !'));
    console.log();
    console.log(chalk.white('   Fichier: tracking/gtm-config.yaml'));
    console.log(chalk.gray(`   • ${gtmConfig.variables.length} variables`));
    console.log(chalk.gray(`   • ${triggerCount} triggers (1 pageview + ${triggerCount - 1} custom events)`));
    console.log(chalk.gray(`   • ${ga4TagCount} tags GA4 (1 Config + ${ga4TagCount - 1} Event par catégorie)`));
    if (thirdPartyTagCount > 0) {
      console.log(chalk.gray(`   • ${thirdPartyTagCount} balise(s) tierce(s)`));
    }
    console.log();
    console.log(chalk.white('Prochaine étape :'));
    console.log(chalk.gray('   [Étape 4] google-setup deploy → Déployer dans GTM'));
    console.log();

  } else {
    // Pas de balises tierces disponibles
    console.log();
    console.log(chalk.gray('   Génération de la configuration GTM...'));

    const gtmConfig = generateGtmConfig(parsed.project || {}, parsed.events, {});
    const gtmYaml = configToYaml(gtmConfig);

    writeFileSync(outputPath, gtmYaml);

    const triggerCount = gtmConfig.triggers.filter(t => !t._category).length;
    const tagCount = gtmConfig.tags.length;

    console.log();
    console.log(chalk.green.bold('✅ Configuration GTM générée !'));
    console.log();
    console.log(chalk.white('   Fichier: tracking/gtm-config.yaml'));
    console.log(chalk.gray(`   • ${gtmConfig.variables.length} variables`));
    console.log(chalk.gray(`   • ${triggerCount} triggers (1 pageview + ${triggerCount - 1} custom events)`));
    console.log(chalk.gray(`   • ${tagCount} tags GA4 (1 Config + ${tagCount - 1} Event par catégorie)`));
    console.log();
    console.log(chalk.white('Prochaine étape :'));
    console.log(chalk.gray('   [Étape 4] google-setup deploy → Déployer dans GTM'));
    console.log();
  }
}

/**
 * Mode interactif
 */
export async function handleGtmConfigSetupInteractive() {
  await runGtmConfigSetup({});
}
