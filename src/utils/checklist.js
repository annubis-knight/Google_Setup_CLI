/**
 * Checklist intelligente pour le suivi de progression KPI
 * Gère les dépendances entre étapes et calcule la progression globale
 */

export const STEPS = [
  {
    id: 'ga4',
    name: 'Google Analytics 4',
    weight: 0.30,
    tasks: [
      { id: 'ga4_exists', name: 'Propriété GA4 existe', check: (audit) => audit.ga4?.installed },
      { id: 'ga4_stream', name: 'Flux de données configuré', check: (audit) => audit.ga4?.dataStreamId != null },
      { id: 'ga4_conversions', name: 'Conversions marquées', check: (audit) => audit.ga4?.conversionsCount > 0, optional: true }
    ]
  },
  {
    id: 'gtm',
    name: 'Google Tag Manager',
    weight: 0.20,
    dependsOn: 'ga4',
    tasks: [
      { id: 'gtm_exists', name: 'Conteneur GTM existe', check: (audit) => audit.gtm?.installed },
      { id: 'gtm_ga4_tag', name: 'Balise GA4 Config', check: (audit) => audit.gtm?.tags?.some(t => t.type === 'gaawc' || t.type === 'googtag') },
      { id: 'gtm_events', name: 'Balises événements (min 3)', check: (audit) => (audit.gtm?.tags?.filter(t => t.type === 'gaawe').length || 0) >= 3 }
    ]
  },
  {
    id: 'datalayer',
    name: 'DataLayer Custom',
    weight: 0.30,
    dependsOn: 'gtm',
    tasks: [
      { id: 'dl_variables', name: 'Variables dataLayer (min 5)', check: (audit) => (audit.dataLayer?.variablesCount || 0) >= 5 },
      { id: 'dl_triggers', name: 'Déclencheurs custom (min 3)', check: (audit) => (audit.dataLayer?.customEventTriggers || 0) >= 3 }
    ]
  },
  {
    id: 'search_console',
    name: 'Search Console',
    weight: 0.15,
    tasks: [
      { id: 'sc_verified', name: 'Site vérifié', check: (audit) => audit.searchConsole?.verified },
      { id: 'sc_sitemap', name: 'Sitemap soumis', check: (audit) => audit.searchConsole?.sitemapSubmitted }
    ]
  },
  {
    id: 'hotjar',
    name: 'Hotjar',
    weight: 0.05,
    dependsOn: 'gtm',
    tasks: [
      { id: 'hj_installed', name: 'Hotjar installé', check: (audit) => audit.hotjar?.installed }
    ]
  }
];

/**
 * Calcule la progression globale et par étape
 * @param {Object} auditData - Données d'audit du site
 * @returns {Object} Progression détaillée
 */
export function calculateProgress(auditData) {
  const results = STEPS.map(step => {
    const completedTasks = step.tasks.filter(task => task.check(auditData));
    const requiredTasks = step.tasks.filter(t => !t.optional);
    const requiredCompleted = completedTasks.filter(t => {
      const taskDef = step.tasks.find(st => st.id === t.id);
      return !taskDef?.optional;
    });

    const progress = step.tasks.length > 0
      ? Math.round((completedTasks.length / step.tasks.length) * 100)
      : 0;

    const isComplete = requiredCompleted.length === requiredTasks.length;

    return {
      id: step.id,
      name: step.name,
      weight: step.weight,
      dependsOn: step.dependsOn,
      progress,
      isComplete,
      completedCount: completedTasks.length,
      totalCount: step.tasks.length,
      tasksStatus: step.tasks.map(task => ({
        id: task.id,
        name: task.name,
        optional: task.optional || false,
        done: task.check(auditData)
      }))
    };
  });

  // Vérifier les dépendances
  results.forEach(step => {
    if (step.dependsOn) {
      const dependency = results.find(s => s.id === step.dependsOn);
      step.blocked = !dependency?.isComplete;
    } else {
      step.blocked = false;
    }
  });

  // Calculer la progression globale pondérée
  const globalProgress = results.reduce((sum, step) =>
    sum + (step.progress * step.weight), 0
  );

  // Trouver la prochaine étape à faire
  const nextStep = results.find(s => !s.isComplete && !s.blocked);

  // Trouver toutes les étapes incomplètes non bloquées
  const pendingSteps = results.filter(s => !s.isComplete && !s.blocked);

  return {
    steps: results,
    globalProgress: Math.round(globalProgress),
    nextStep,
    pendingSteps,
    isComplete: globalProgress >= 100
  };
}

/**
 * Retourne les actions à effectuer pour une étape donnée
 * @param {string} stepId - ID de l'étape
 * @param {Object} auditData - Données d'audit
 * @returns {Array} Liste des actions à effectuer
 */
export function getActionsForStep(stepId, auditData) {
  const step = STEPS.find(s => s.id === stepId);
  if (!step) return [];

  return step.tasks
    .filter(task => !task.check(auditData) && !task.optional)
    .map(task => ({
      stepId,
      taskId: task.id,
      taskName: task.name
    }));
}

/**
 * Génère un résumé textuel de la progression
 * @param {Object} progress - Résultat de calculateProgress
 * @returns {string} Résumé texte
 */
export function getProgressSummary(progress) {
  const completed = progress.steps.filter(s => s.isComplete).length;
  const total = progress.steps.length;

  if (progress.isComplete) {
    return `Configuration complète (${total}/${total} étapes)`;
  }

  if (progress.globalProgress === 0) {
    return `Aucune configuration (0/${total} étapes)`;
  }

  return `En cours (${completed}/${total} étapes, ${progress.globalProgress}%)`;
}
