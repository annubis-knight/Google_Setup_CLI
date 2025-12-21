/**
 * Synchroniseur GTM-Local
 * Crée automatiquement dans GTM les triggers et variables détectés dans le projet local
 */

import { google } from 'googleapis';

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
 * @returns {Object} Tag créé
 */
export async function createGA4EventTag(workspacePath, eventName, measurementId, triggerId) {
  const tagmanager = google.tagmanager('v2');

  const tag = {
    name: `GA4 Event - ${eventName}`,
    type: 'gaawe', // GA4 Event
    parameter: [
      {
        type: 'tagReference',
        key: 'measurementId',
        value: measurementId
      },
      {
        type: 'template',
        key: 'eventName',
        value: eventName
      }
    ],
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
 * @param {Array} eventsToCreate - Liste des events à créer
 * @param {string} measurementId - ID de mesure GA4 (optionnel, pour créer les tags)
 * @returns {Object} Résultat de la synchronisation
 */
export async function syncEventsToGTM(gtmData, eventsToCreate, measurementId = null) {
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
      // Créer le trigger
      const trigger = await createEventTrigger(gtmData.workspacePath, eventName);
      results.triggers.push({ name: eventName, triggerId: trigger.triggerId, success: true });

      // Si measurementId fourni, créer aussi la balise GA4 Event
      if (measurementId) {
        const tag = await createGA4EventTag(
          gtmData.workspacePath,
          eventName,
          measurementId,
          trigger.triggerId
        );
        results.tags.push({ name: eventName, tagId: tag.tagId, success: true });
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
      const variable = await createDataLayerVariable(gtmData.workspacePath, varName);
      results.variables.push({ name: varName, variableId: variable.variableId, success: true });
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
 * @returns {Object} Résultat complet
 */
export async function fullSync(gtmData, comparison, measurementId = null) {
  const results = {
    events: { created: 0, errors: 0 },
    variables: { created: 0, errors: 0 },
    details: []
  };

  // Sync events
  if (comparison.missingInGTM.events.length > 0) {
    const eventResults = await syncEventsToGTM(
      gtmData,
      comparison.missingInGTM.events,
      measurementId
    );

    results.events.created = eventResults.triggers.filter(t => t.success).length;
    results.events.errors = eventResults.errors.length;
    results.details.push(...eventResults.triggers);
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
