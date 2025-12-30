/**
 * YAML Merger - Fusion intelligente des tracking plans
 * Pipeline Étape 5: Fusionne les nouvelles données avec le YAML existant
 *
 * Règles de fusion:
 * - Ne jamais supprimer d'events existants (sauf si enabled: false explicite)
 * - Merger les event_groups par group_id
 * - Ajouter les nouveaux events sans doublons
 * - Préserver les commentaires et métadonnées personnalisées
 */

import yaml from 'js-yaml';
import { readFileSync, existsSync } from 'fs';

/**
 * Charge un fichier YAML existant
 * @param {string} yamlPath - Chemin du fichier
 * @returns {Object|null} Contenu parsé ou null
 */
export function loadExistingYAML(yamlPath) {
  try {
    if (!existsSync(yamlPath)) {
      return null;
    }
    const content = readFileSync(yamlPath, 'utf8');
    return yaml.load(content);
  } catch (error) {
    console.error(`Erreur lecture YAML: ${error.message}`);
    return null;
  }
}

/**
 * Fusionne deux configurations de projet
 * @param {Object} existing - Config existante
 * @param {Object} newData - Nouvelles données
 * @returns {Object} Config fusionnée
 */
function mergeProjectConfig(existing, newData) {
  return {
    ...existing,
    ...newData,
    // Préserver le GA4 ID existant s'il est configuré
    ga4_id: existing?.ga4_id || newData?.ga4_id || '',
    // Mettre à jour la date
    updated: new Date().toISOString(),
    // Indiquer qu'il y a eu une fusion
    last_merge: new Date().toISOString()
  };
}

/**
 * Fusionne les event_groups (events consolidés)
 * Supporte à la fois:
 * - Nouveau format: { id, actions: [...] }
 * - Ancien format: { group_id, events: [...] }
 *
 * @param {Array} existingGroups - Groupes existants
 * @param {Array} newGroups - Nouveaux groupes
 * @returns {Array} Groupes fusionnés
 */
function mergeEventGroups(existingGroups = [], newGroups = []) {
  const merged = [...existingGroups];

  for (const newGroup of newGroups) {
    // Support both id (new) and group_id (legacy)
    const newGroupId = newGroup.id || newGroup.group_id;
    const existingIndex = merged.findIndex(g => (g.id || g.group_id) === newGroupId);

    if (existingIndex >= 0) {
      // Le groupe existe → fusionner les actions internes
      const existingGroup = merged[existingIndex];

      // Support both actions (new) and events (legacy)
      const existingActions = existingGroup.actions || existingGroup.events || [];
      const newActions = newGroup.actions || newGroup.events || [];

      // Fusionner les actions
      const mergedActions = [...existingActions];
      for (const newAction of newActions) {
        const actionId = newAction.id || newAction.source_event;
        const actionExists = mergedActions.some(a =>
          (a.id || a.source_event) === actionId
        );
        if (!actionExists) {
          mergedActions.push(newAction);
        }
      }

      // Mettre à jour le groupe
      merged[existingIndex] = {
        ...existingGroup,
        ...newGroup,
        // Préserver enabled si déjà configuré
        enabled: existingGroup.enabled !== undefined ? existingGroup.enabled : newGroup.enabled,
        // Utiliser actions pour le nouveau format
        actions: mergedActions,
        // Nettoyer l'ancien champ events si présent
        events: undefined,
        // Mettre à jour les métadonnées de détection
        detection: {
          ...(existingGroup.detection || {}),
          ...(newGroup.detection || {}),
          last_scan: new Date().toISOString()
        }
      };
    } else {
      // Nouveau groupe → ajouter
      merged.push({
        ...newGroup,
        enabled: true, // Activer par défaut les nouveaux groupes
        detection: {
          ...(newGroup.detection || {}),
          first_detected: new Date().toISOString()
        }
      });
    }
  }

  return merged;
}

/**
 * Fusionne les events standalone (non consolidés)
 * Supporte à la fois:
 * - Nouveau format: { trigger: { html_selector: "..." } }
 * - Ancien format: { html_selector: "..." }
 *
 * @param {Array} existingEvents - Events existants
 * @param {Array} newEvents - Nouveaux events
 * @returns {Array} Events fusionnés
 */
function mergeStandaloneEvents(existingEvents = [], newEvents = []) {
  const merged = [...existingEvents];

  // Helper pour extraire le sélecteur (nouveau ou ancien format)
  const getSelector = (event) => event.trigger?.html_selector || event.html_selector;

  for (const newEvent of newEvents) {
    const newSelector = getSelector(newEvent);

    // Chercher un event similaire par ID, sélecteur HTML, ou event_name
    const existingIndex = merged.findIndex(e =>
      e.id === newEvent.id ||
      (getSelector(e) && getSelector(e) === newSelector) ||
      (e.datalayer?.event_name === newEvent.datalayer?.event_name)
    );

    if (existingIndex >= 0) {
      // L'event existe → mettre à jour en préservant les configs manuelles
      const existing = merged[existingIndex];

      // Préserver le trigger existant, mettre à jour uniquement si nouveau sélecteur
      const mergedTrigger = {
        ...(existing.trigger || {}),
        ...(newEvent.trigger || {}),
        // Préserver le sélecteur existant s'il existe
        html_selector: getSelector(existing) || newSelector
      };

      merged[existingIndex] = {
        ...existing,
        ...newEvent,
        // Préserver enabled si déjà configuré
        enabled: existing.enabled !== undefined ? existing.enabled : newEvent.enabled,
        // Utiliser le trigger fusionné
        trigger: mergedTrigger,
        // Supprimer l'ancien champ html_selector s'il existe
        html_selector: undefined,
        detection: {
          ...(existing.detection || {}),
          ...(newEvent.detection || {}),
          last_scan: new Date().toISOString()
        },
        // Préserver la config GA4 existante
        ga4: {
          ...existing.ga4,
          ...newEvent.ga4,
          // Ne mettre à jour conversion que si pas déjà configuré
          conversion: existing.ga4?.conversion ?? newEvent.ga4?.conversion
        }
      };
    } else {
      // Nouvel event → ajouter (enabled est déjà défini dans la config générée)
      merged.push({
        ...newEvent,
        detection: {
          ...(newEvent.detection || {}),
          first_detected: new Date().toISOString()
        }
      });
    }
  }

  return merged;
}

/**
 * Fusionne les variables dataLayer
 * Structure: { datalayer: [{ name, datalayer_name, type }, ...] }
 *
 * @param {Object} existingVars - Variables existantes
 * @param {Object} newVars - Nouvelles variables
 * @returns {Object} Variables fusionnées
 */
function mergeVariables(existingVars = {}, newVars = {}) {
  const merged = { ...existingVars };

  // Fusionner les tableaux datalayer spécifiquement
  if (newVars.datalayer && Array.isArray(newVars.datalayer)) {
    const existingDatalayer = Array.isArray(merged.datalayer) ? merged.datalayer : [];

    // Fusionner sans doublons basé sur le nom de la variable
    const mergedDatalayer = [...existingDatalayer];
    for (const newVar of newVars.datalayer) {
      const exists = mergedDatalayer.some(v => v.name === newVar.name || v.datalayer_name === newVar.datalayer_name);
      if (!exists) {
        mergedDatalayer.push(newVar);
      }
    }
    merged.datalayer = mergedDatalayer;
  }

  // Fusionner les autres clés
  for (const [key, value] of Object.entries(newVars)) {
    if (key === 'datalayer') continue; // Déjà traité

    if (!merged[key]) {
      merged[key] = value;
    } else if (Array.isArray(value)) {
      // Fusionner les tableaux sans doublons
      const existingArray = Array.isArray(merged[key]) ? merged[key] : [];
      merged[key] = [...new Set([...existingArray, ...value])];
    }
    // Pour les autres types, ne pas écraser l'existant
  }

  return merged;
}

/**
 * Fusionne une nouvelle configuration avec un YAML existant
 * @param {Object} newConfig - Nouvelle configuration générée
 * @param {string|Object} existingYamlOrPath - Chemin du YAML existant ou objet déjà parsé
 * @returns {Object} Configuration fusionnée
 */
export function mergeWithExisting(newConfig, existingYamlOrPath) {
  let existingConfig = {};

  if (typeof existingYamlOrPath === 'string') {
    existingConfig = loadExistingYAML(existingYamlOrPath) || {};
  } else if (typeof existingYamlOrPath === 'object') {
    existingConfig = existingYamlOrPath || {};
  }

  // Si pas de config existante, retourner la nouvelle avec métadonnées
  if (!existingConfig || Object.keys(existingConfig).length === 0) {
    return {
      ...newConfig,
      project: {
        ...(newConfig.project || {}),
        created: new Date().toISOString(),
        generated_by: 'google-setup-cli autoedit'
      }
    };
  }

  // Fusion intelligente
  const merged = {
    project: mergeProjectConfig(existingConfig.project, newConfig.project),

    // Événements consolidés
    consolidated_events: mergeEventGroups(
      existingConfig.consolidated_events || existingConfig.event_groups,
      newConfig.consolidated_events || newConfig.event_groups
    ),

    // Événements standalone
    events: mergeStandaloneEvents(
      existingConfig.events,
      newConfig.events
    ),

    // Variables
    variables: mergeVariables(
      existingConfig.variables,
      newConfig.variables
    ),

    // Métadonnées de fusion
    _merge_info: {
      last_merge: new Date().toISOString(),
      merge_count: (existingConfig._merge_info?.merge_count || 0) + 1,
      previous_events_count: (existingConfig.events || []).length,
      previous_groups_count: (existingConfig.consolidated_events || existingConfig.event_groups || []).length
    }
  };

  return merged;
}

/**
 * Génère le YAML final avec commentaires
 * @param {Object} config - Configuration à convertir
 * @returns {string} YAML formaté
 */
export function generateYAML(config) {
  // Entête avec commentaires
  const header = `# GTM Tracking Plan
# Auto-généré par google-setup autoedit
# Dernière mise à jour: ${new Date().toISOString().split('T')[0]}
#
# Structure:
# - project: Informations du projet
# - consolidated_events: Events groupés (1 tag GTM = plusieurs actions)
# - events: Events individuels (1 tag GTM = 1 action)
# - variables: Variables dataLayer à créer dans GTM
#
# Pour activer/désactiver un event, modifier "enabled: true/false"
# Pour marquer comme conversion GA4, modifier "conversion: true"

`;

  // Convertir en YAML avec options de formatage
  const yamlContent = yaml.dump(config, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false, // Préserver l'ordre
    quotingType: '"',
    forceQuotes: false
  });

  return header + yamlContent;
}

/**
 * Valide la structure d'un tracking plan
 * @param {Object} config - Configuration à valider
 * @returns {Object} Résultat de validation
 */
export function validateTrackingPlan(config) {
  const errors = [];
  const warnings = [];

  // Vérifier la section project
  if (!config.project) {
    errors.push('Section "project" manquante');
  } else {
    if (!config.project.name) warnings.push('project.name non défini');
    if (!config.project.ga4_measurement_id && !config.project.ga4_id) warnings.push('project.ga4_measurement_id non défini');
  }

  // Compter les events et actions
  const standaloneEvents = config.events || [];
  const consolidatedEvents = config.consolidated_events || [];

  // Les consolidated_events utilisent maintenant "actions" au lieu de "events"
  const totalActions = standaloneEvents.length + consolidatedEvents.reduce((sum, g) =>
    sum + (g.actions?.length || g.events?.length || 0), 0
  );

  if (standaloneEvents.length === 0 && consolidatedEvents.length === 0) {
    warnings.push('Aucun event défini');
  }

  // Vérifier chaque event standalone
  for (const event of standaloneEvents) {
    if (!event.id && !event.datalayer?.event_name) {
      errors.push(`Event sans identifiant: ${JSON.stringify(event).slice(0, 50)}`);
    }
    if (!event.trigger?.html_selector && !event.gtm?.trigger) {
      warnings.push(`Event "${event.id || event.datalayer?.event_name}" sans sélecteur HTML`);
    }
  }

  // Vérifier les groupes consolidés
  for (const group of consolidatedEvents) {
    if (!group.id && !group.group_id) {
      errors.push('Event group sans id/group_id');
    }
    // Support both "actions" (new format) and "events" (legacy)
    const actions = group.actions || group.events || [];
    if (actions.length === 0) {
      warnings.push(`Group "${group.id || group.group_id}" sans actions`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      eventsCount: standaloneEvents.length,
      groupsCount: consolidatedEvents.length,
      totalActions
    }
  };
}
