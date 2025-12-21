/**
 * Détecteur de projet local
 * Scanne un répertoire projet pour trouver les fichiers GTM et dataLayer
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { globSync } from 'glob';

// Patterns de fichiers à rechercher
const FILE_PATTERNS = {
  gtmHead: ['**/gtm-head.html', '**/gtm_head.html', '**/gtm.head.html'],
  gtmBody: ['**/gtm-body.html', '**/gtm_body.html', '**/gtm.body.html'],
  tracking: ['**/tracking.js', '**/gtm-tracking.js', '**/datalayer.js', '**/dataLayer.js']
};

/**
 * Détecte les fichiers GTM et tracking dans un projet local
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
    trackingFiles: [],
    containerId: null,
    dataLayerEvents: [],
    dataLayerVariables: []
  };

  // Chercher gtm-head.html
  for (const pattern of FILE_PATTERNS.gtmHead) {
    const files = globSync(pattern, { cwd: absolutePath, ignore: ['**/node_modules/**'] });
    if (files.length > 0) {
      result.gtmHead = join(absolutePath, files[0]);
      result.found = true;

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
      result.found = true;
      break;
    }
  }

  // Chercher les fichiers tracking/dataLayer
  for (const pattern of FILE_PATTERNS.tracking) {
    const files = globSync(pattern, { cwd: absolutePath, ignore: ['**/node_modules/**'] });
    for (const file of files) {
      const fullPath = join(absolutePath, file);
      result.trackingFiles.push(fullPath);
      result.found = true;

      // Analyser le contenu pour extraire les events et variables
      const content = readFileSync(fullPath, 'utf8');
      const analysis = analyzeTrackingFile(content);
      result.dataLayerEvents.push(...analysis.events);
      result.dataLayerVariables.push(...analysis.variables);
    }
  }

  // Dédupliquer
  result.dataLayerEvents = [...new Set(result.dataLayerEvents)];
  result.dataLayerVariables = [...new Set(result.dataLayerVariables)];

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
 * Analyse un fichier tracking.js pour extraire les events et variables dataLayer
 * @param {string} content - Contenu du fichier
 * @returns {Object} { events: [], variables: [] }
 */
function analyzeTrackingFile(content) {
  const events = [];
  const variables = [];

  // Pattern pour les dataLayer.push avec event
  // Matche: dataLayer.push({ event: 'nom_event', ... })
  const eventPatterns = [
    /dataLayer\.push\(\s*\{\s*event\s*:\s*['"`]([^'"`]+)['"`]/g,
    /event\s*:\s*['"`]([^'"`]+)['"`]/g
  ];

  for (const pattern of eventPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1] && !events.includes(match[1])) {
        events.push(match[1]);
      }
    }
  }

  // Pattern pour les variables dans dataLayer.push
  // Matche: variable_name: value
  const variablePattern = /(\w+)\s*:\s*(?:['"`][^'"`]*['"`]|\w+|{)/g;
  let match;
  while ((match = variablePattern.exec(content)) !== null) {
    const varName = match[1];
    // Exclure les mots-clés JS et event
    const excluded = ['event', 'function', 'return', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'true', 'false', 'null', 'undefined', 'items', 'value', 'currency'];
    if (!excluded.includes(varName) && !variables.includes(varName)) {
      variables.push(varName);
    }
  }

  return { events, variables };
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
