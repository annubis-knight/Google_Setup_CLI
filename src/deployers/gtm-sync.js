/**
 * Synchroniseur GTM-Local
 * Crée automatiquement dans GTM les triggers et variables détectés dans le projet local
 */

import { google } from 'googleapis';

/**
 * Délai pour éviter de dépasser le quota API GTM (~60 req/min)
 * 1500ms = ~40 req/min, marge de sécurité
 */
const API_DELAY_MS = 1500;

/**
 * Nombre de retries en cas d'erreur quota
 */
const MAX_RETRIES = 3;

/**
 * Délai d'attente en cas d'erreur quota (30 secondes)
 */
const QUOTA_RETRY_DELAY_MS = 30000;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Exécute une fonction API avec retry en cas d'erreur quota
 */
async function withRetry(fn, context = '') {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isQuotaError = error.message?.includes('Quota exceeded') ||
                           error.message?.includes('429') ||
                           error.code === 429;

      if (isQuotaError && attempt < MAX_RETRIES) {
        console.log(`   ⏳ Quota dépassé pour ${context}, attente 30s... (tentative ${attempt}/${MAX_RETRIES})`);
        await delay(QUOTA_RETRY_DELAY_MS);
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}

/**
 * Crée un trigger customEvent dans GTM
 * @param {string} workspacePath - Chemin du workspace GTM
 * @param {string} eventName - Nom de l'événement
 * @returns {Object} Trigger créé
 */
export async function createEventTrigger(workspacePath, eventName) {
  const tagmanager = google.tagmanager('v2');

  const trigger = {
    name: `Event - ${eventName}`,
    type: 'customEvent',
    customEventFilter: [{
      type: 'equals',
      parameter: [
        { type: 'template', key: 'arg0', value: '{{_event}}' },
        { type: 'template', key: 'arg1', value: eventName }
      ]
    }]
  };

  const result = await tagmanager.accounts.containers.workspaces.triggers.create({
    parent: workspacePath,
    requestBody: trigger
  });

  return result.data;
}

/**
 * Crée une variable dataLayer dans GTM
 * @param {string} workspacePath - Chemin du workspace GTM
 * @param {string} variableName - Nom de la variable
 * @returns {Object} Variable créée
 */
export async function createDataLayerVariable(workspacePath, variableName) {
  const tagmanager = google.tagmanager('v2');

  // Format GTM: DLV - nom_variable
  const gtmVarName = `DLV - ${variableName}`;

  const variable = {
    name: gtmVarName,
    type: 'v', // Data Layer Variable
    parameter: [{
      type: 'template',
      key: 'name',
      value: variableName
    }, {
      type: 'integer',
      key: 'dataLayerVersion',
      value: '2'
    }]
  };

  const result = await tagmanager.accounts.containers.workspaces.variables.create({
    parent: workspacePath,
    requestBody: variable
  });

  return result.data;
}

/**
 * Crée une balise GA4 Event pour un événement
 * @param {string} workspacePath - Chemin du workspace GTM
 * @param {string} eventName - Nom de l'événement
 * @param {string} measurementId - ID de mesure GA4 (G-XXXXX)
 * @param {string} triggerId - ID du trigger associé
 * @param {Array} eventParams - Paramètres additionnels pour events consolidés (optionnel)
 * @returns {Object} Tag créé
 */
export async function createGA4EventTag(workspacePath, eventName, measurementId, triggerId, eventParams = []) {
  const tagmanager = google.tagmanager('v2');

  // Paramètres de base
  const parameters = [
    {
      type: 'template',
      key: 'measurementIdOverride',
      value: measurementId  // G-XXXXX passé directement
    },
    {
      type: 'template',
      key: 'eventName',
      value: eventName
    }
  ];

  // Ajouter les event parameters pour events consolidés
  // Format GA4 : liste de {name, value} dans eventParameters
  if (eventParams && eventParams.length > 0) {
    const eventParametersList = eventParams.map(p => ({
      type: 'map',
      map: [
        { type: 'template', key: 'name', value: p.name },
        { type: 'template', key: 'value', value: p.variable || `{{DLV - ${p.name}}}` }
      ]
    }));

    parameters.push({
      type: 'list',
      key: 'eventParameters',
      list: eventParametersList
    });
  }

  const tag = {
    name: `GA4 Event - ${eventName}`,
    type: 'gaawe', // GA4 Event
    parameter: parameters,
    firingTriggerId: [triggerId]
  };

  const result = await tagmanager.accounts.containers.workspaces.tags.create({
    parent: workspacePath,
    requestBody: tag
  });

  return result.data;
}

/**
 * Synchronise les events locaux avec GTM
 * @param {Object} gtmData - Données GTM (avec workspacePath)
 * @param {Array} eventsToCreate - Liste des events à créer (noms simples)
 * @param {string} measurementId - ID de mesure GA4 (optionnel, pour créer les tags)
 * @param {Array} gtmConfig - Configuration GTM complète (optionnel, pour events consolidés)
 * @returns {Object} Résultat de la synchronisation
 */
export async function syncEventsToGTM(gtmData, eventsToCreate, measurementId = null, gtmConfig = []) {
  const results = {
    triggers: [],
    tags: [],
    errors: []
  };

  if (!gtmData.workspacePath) {
    throw new Error('workspacePath manquant dans gtmData');
  }

  for (const eventName of eventsToCreate) {
    try {
      // Créer le trigger avec retry
      const trigger = await withRetry(
        () => createEventTrigger(gtmData.workspacePath, eventName),
        `trigger ${eventName}`
      );
      results.triggers.push({ name: eventName, triggerId: trigger.triggerId, success: true });
      await delay(API_DELAY_MS); // Rate limiting

      // Si measurementId fourni, créer aussi la balise GA4 Event
      if (measurementId) {
        // Chercher les paramètres consolidés pour cet event
        const eventConfig = gtmConfig.find(c => c.event === eventName);
        const eventParams = eventConfig?.consolidated ? eventConfig.params : [];

        const tag = await withRetry(
          () => createGA4EventTag(gtmData.workspacePath, eventName, measurementId, trigger.triggerId, eventParams),
          `tag ${eventName}`
        );

        const tagInfo = {
          name: eventName,
          tagId: tag.tagId,
          success: true
        };

        // Indiquer si c'est un event consolidé
        if (eventConfig?.consolidated) {
          tagInfo.consolidated = true;
          tagInfo.actionsCount = eventConfig.actions?.length || 0;
        }

        results.tags.push(tagInfo);
        await delay(API_DELAY_MS); // Rate limiting
      }
    } catch (error) {
      results.errors.push({
        event: eventName,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Synchronise les variables locales avec GTM
 * @param {Object} gtmData - Données GTM (avec workspacePath)
 * @param {Array} variablesToCreate - Liste des variables à créer
 * @returns {Object} Résultat de la synchronisation
 */
export async function syncVariablesToGTM(gtmData, variablesToCreate) {
  const results = {
    variables: [],
    errors: []
  };

  if (!gtmData.workspacePath) {
    throw new Error('workspacePath manquant dans gtmData');
  }

  for (const varName of variablesToCreate) {
    try {
      const variable = await withRetry(
        () => createDataLayerVariable(gtmData.workspacePath, varName),
        `variable ${varName}`
      );
      results.variables.push({ name: varName, variableId: variable.variableId, success: true });
      await delay(API_DELAY_MS); // Rate limiting
    } catch (error) {
      results.errors.push({
        variable: varName,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Synchronisation complète : events + variables
 * @param {Object} gtmData - Données GTM
 * @param {Object} comparison - Résultat de compareLocalWithGTM
 * @param {string} measurementId - ID de mesure GA4 (optionnel)
 * @param {Array} gtmConfig - Configuration GTM complète (optionnel, pour events consolidés)
 * @returns {Object} Résultat complet
 */
export async function fullSync(gtmData, comparison, measurementId = null, gtmConfig = []) {
  const results = {
    triggers: { created: 0, errors: 0 },
    tags: { created: 0, errors: 0, consolidated: 0 },
    variables: { created: 0, errors: 0 },
    details: []
  };

  // Sync events (triggers + tags)
  if (comparison.missingInGTM.events.length > 0) {
    const eventResults = await syncEventsToGTM(
      gtmData,
      comparison.missingInGTM.events,
      measurementId,
      gtmConfig
    );

    results.triggers.created = eventResults.triggers.filter(t => t.success).length;
    results.tags.created = eventResults.tags.filter(t => t.success).length;
    results.tags.consolidated = eventResults.tags.filter(t => t.success && t.consolidated).length;
    results.triggers.errors = eventResults.errors.length;
    results.details.push(...eventResults.triggers);
    results.details.push(...eventResults.tags);
    results.details.push(...eventResults.errors.map(e => ({ ...e, success: false })));
  }

  // Sync variables
  if (comparison.missingInGTM.variables.length > 0) {
    const varResults = await syncVariablesToGTM(
      gtmData,
      comparison.missingInGTM.variables
    );

    results.variables.created = varResults.variables.filter(v => v.success).length;
    results.variables.errors = varResults.errors.length;
    results.details.push(...varResults.variables);
    results.details.push(...varResults.errors.map(e => ({ ...e, success: false })));
  }

  return results;
}
