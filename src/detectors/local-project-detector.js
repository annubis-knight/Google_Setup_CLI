/**
 * Détecteur de projet local
 * Scanne un répertoire projet pour trouver les fichiers GTM et dataLayer
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { globSync } from 'glob';
import yaml from 'js-yaml';

// Patterns de fichiers à rechercher
const FILE_PATTERNS = {
  gtmHead: ['**/gtm-head.html', '**/gtm_head.html', '**/gtm.head.html'],
  gtmBody: ['**/gtm-body.html', '**/gtm_body.html', '**/gtm.body.html']
};

/**
 * Détecte les events et variables depuis le fichier YAML
 * Supporte les events simples ET les events consolidés
 * @param {string} projectPath - Chemin du projet
 * @returns {Object|null} Données extraites ou null si pas de YAML
 */
export function detectFromYAML(projectPath) {
  const yamlPath = join(projectPath, 'tracking', 'gtm-tracking-plan.yml');

  if (!existsSync(yamlPath)) {
    return null;
  }

  try {
    const content = readFileSync(yamlPath, 'utf8');
    const config = yaml.load(content);

    const result = {
      source: 'yaml',
      yamlPath,
      events: [],
      variables: [],
      gtmConfig: [],
      consolidatedEvents: []  // Nouveau : events consolidés
    };

    // Extraire les events simples enabled
    for (const event of config.events || []) {
      if (event.enabled !== true) continue;

      const eventName = event.datalayer?.event_name;
      if (eventName) {
        result.events.push(eventName);
        result.gtmConfig.push({
          event: eventName,
          triggerName: event.gtm?.trigger?.name || `EV - ${eventName}`,
          tagName: event.gtm?.tag?.name || `GA4 - EV - ${eventName}`,
          consolidated: false
        });
      }

      // Extraire les variables des params
      for (const param of event.datalayer?.params || []) {
        if (param.name && !result.variables.includes(param.name)) {
          result.variables.push(param.name);
        }
      }
    }

    // Extraire les events consolidés
    for (const event of config.consolidated_events || []) {
      if (event.enabled !== true) continue;

      const eventName = event.datalayer?.event_name;
      if (eventName) {
        result.events.push(eventName);

        // Récupérer les paramètres GA4 pour les ajouter au tag
        const ga4Params = (event.ga4?.parameters || []).map(p => ({
          name: p.name,
          variable: p.variable
        }));

        result.gtmConfig.push({
          event: eventName,
          triggerName: event.gtm?.trigger?.name || `EV - ${eventName}`,
          tagName: event.gtm?.tag?.name || `GA4 - EV - ${eventName}`,
          consolidated: true,
          actions: event.actions || [],
          params: ga4Params
        });

        // Ajouter aux consolidatedEvents pour référence
        result.consolidatedEvents.push({
          id: event.id,
          eventName,
          actions: event.actions || [],
          description: `${event.actions?.length || 0} actions consolidées`
        });
      }

      // Extraire les variables des params
      for (const param of event.datalayer?.params || []) {
        if (param.name && !result.variables.includes(param.name)) {
          result.variables.push(param.name);
        }
      }
    }

    // Ajouter les variables explicites de la section variables
    for (const v of config.variables?.datalayer || []) {
      const varName = v.datalayer_name || v.name?.replace('DLV - ', '');
      if (varName && !result.variables.includes(varName)) {
        result.variables.push(varName);
      }
    }

    // Ajouter les variables des events consolidés
    for (const v of config.consolidated_events?.consolidated_variables || []) {
      const varName = v.datalayer_name || v.name?.replace('DLV - ', '');
      if (varName && !result.variables.includes(varName)) {
        result.variables.push(varName);
      }
    }

    return result;
  } catch (e) {
    return null;
  }
}

/**
 * Détecte les fichiers GTM et tracking dans un projet local
 * Utilise le YAML comme source de vérité (obligatoire)
 * @param {string} projectPath - Chemin du projet (défaut: répertoire courant)
 * @returns {Object} Données du projet local
 */
export function detectLocalProject(projectPath = process.cwd()) {
  const absolutePath = resolve(projectPath);

  if (!existsSync(absolutePath)) {
    return { found: false, error: `Chemin non trouvé: ${absolutePath}` };
  }

  const result = {
    found: false,
    projectPath: absolutePath,
    gtmHead: null,
    gtmBody: null,
    containerId: null,
    dataLayerEvents: [],
    dataLayerVariables: [],
    gtmConfig: []
  };

  // Chercher gtm-head.html pour extraire le Container ID
  for (const pattern of FILE_PATTERNS.gtmHead) {
    const files = globSync(pattern, { cwd: absolutePath, ignore: ['**/node_modules/**'] });
    if (files.length > 0) {
      result.gtmHead = join(absolutePath, files[0]);

      // Extraire le Container ID
      const content = readFileSync(result.gtmHead, 'utf8');
      const match = content.match(/GTM-[A-Z0-9]+/);
      if (match) {
        result.containerId = match[0];
      }
      break;
    }
  }

  // Chercher gtm-body.html
  for (const pattern of FILE_PATTERNS.gtmBody) {
    const files = globSync(pattern, { cwd: absolutePath, ignore: ['**/node_modules/**'] });
    if (files.length > 0) {
      result.gtmBody = join(absolutePath, files[0]);
      break;
    }
  }

  // YAML OBLIGATOIRE - Source de vérité pour les events et variables
  const yamlData = detectFromYAML(absolutePath);

  if (!yamlData) {
    // YAML absent = projet non initialisé pour sync
    return result; // found: false
  }

  result.found = true;
  result.source = yamlData.source;
  result.yamlPath = yamlData.yamlPath;
  result.dataLayerEvents = yamlData.events;
  result.dataLayerVariables = yamlData.variables;
  result.gtmConfig = yamlData.gtmConfig;
  result.consolidatedEvents = yamlData.consolidatedEvents || [];

  // Chercher aussi le fichier de config local
  const localConfigPath = join(absolutePath, '.google-setup.json');
  if (existsSync(localConfigPath)) {
    try {
      result.localConfig = JSON.parse(readFileSync(localConfigPath, 'utf8'));
    } catch (e) {
      result.localConfig = null;
    }
  }

  return result;
}

/**
 * Compare les events locaux avec ceux configurés dans GTM
 * @param {Object} localData - Données du projet local
 * @param {Object} gtmData - Données GTM (triggers, variables)
 * @returns {Object} Différences à synchroniser
 */
export function compareLocalWithGTM(localData, gtmData) {
  const result = {
    missingInGTM: {
      events: [],
      variables: []
    },
    missingInLocal: {
      events: [],
      variables: []
    },
    synced: {
      events: [],
      variables: []
    }
  };

  if (!localData.found || !gtmData.installed) {
    return result;
  }

  // Récupérer les events GTM (triggers de type customEvent)
  const gtmEvents = (gtmData.triggers || [])
    .filter(t => t.type === 'customEvent' || t.type === 'CUSTOM_EVENT')
    .map(t => {
      // Extraire le nom de l'event depuis le trigger
      // Le nom est souvent dans t.customEventFilter ou t.name
      return t.name?.replace(/^Event - /, '').toLowerCase();
    })
    .filter(Boolean);

  // Récupérer les variables GTM (type dataLayer)
  const gtmVariables = (gtmData.variables || [])
    .filter(v => v.type === 'v')
    .map(v => v.name);

  // Comparer events
  for (const event of localData.dataLayerEvents) {
    const eventLower = event.toLowerCase();
    const foundInGTM = gtmEvents.some(e => e && e.includes(eventLower) || eventLower.includes(e));

    if (foundInGTM) {
      result.synced.events.push(event);
    } else {
      result.missingInGTM.events.push(event);
    }
  }

  // Events dans GTM mais pas en local
  for (const gtmEvent of gtmEvents) {
    if (gtmEvent && !localData.dataLayerEvents.some(e => e.toLowerCase().includes(gtmEvent))) {
      result.missingInLocal.events.push(gtmEvent);
    }
  }

  // Comparer variables
  for (const variable of localData.dataLayerVariables) {
    const varLower = variable.toLowerCase();
    const foundInGTM = gtmVariables.some(v => v.toLowerCase().includes(varLower) || varLower.includes(v.toLowerCase()));

    if (foundInGTM) {
      result.synced.variables.push(variable);
    } else {
      result.missingInGTM.variables.push(variable);
    }
  }

  return result;
}

/**
 * Génère un rapport de synchronisation
 * @param {Object} comparison - Résultat de compareLocalWithGTM
 * @returns {string} Rapport formaté
 */
export function generateSyncReport(comparison) {
  const lines = [];

  lines.push('=== RAPPORT DE SYNCHRONISATION ===\n');

  if (comparison.missingInGTM.events.length > 0) {
    lines.push('❌ Events à créer dans GTM:');
    comparison.missingInGTM.events.forEach(e => lines.push(`   • ${e}`));
    lines.push('');
  }

  if (comparison.missingInGTM.variables.length > 0) {
    lines.push('❌ Variables à créer dans GTM:');
    comparison.missingInGTM.variables.forEach(v => lines.push(`   • ${v}`));
    lines.push('');
  }

  if (comparison.synced.events.length > 0) {
    lines.push('✅ Events synchronisés:');
    comparison.synced.events.forEach(e => lines.push(`   • ${e}`));
    lines.push('');
  }

  if (comparison.missingInLocal.events.length > 0) {
    lines.push('⚠️ Events dans GTM non utilisés en local:');
    comparison.missingInLocal.events.forEach(e => lines.push(`   • ${e}`));
    lines.push('');
  }

  if (comparison.missingInGTM.events.length === 0 &&
      comparison.missingInGTM.variables.length === 0) {
    lines.push('✅ Tout est synchronisé !');
  }

  return lines.join('\n');
}
