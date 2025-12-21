/**
 * Détecte la configuration dataLayer via l'analyse des variables GTM
 * (pas besoin de scraping, on utilise les données GTM déjà récupérées)
 */
export function detectDataLayer(gtmData) {
  if (!gtmData || !gtmData.installed) {
    return { installed: false, score: 0 };
  }

  // Analyser les variables GTM de type dataLayer (type "v")
  const dlVariables = (gtmData.variables || []).filter(v => v.type === 'v');

  // Analyser les déclencheurs custom events
  const customEventTriggers = (gtmData.triggers || []).filter(t =>
    t.type === 'customEvent' ||
    t.type === 'CUSTOM_EVENT'
  );

  // Si aucune variable dataLayer et aucun trigger custom, dataLayer non configuré
  if (dlVariables.length === 0 && customEventTriggers.length === 0) {
    return { installed: false, score: 0 };
  }

  // Calculer le score
  let score = 30; // Base : dataLayer existe

  // +10 points par variable (max 60)
  score += Math.min(dlVariables.length * 10, 60);

  // +10 si plus de 3 déclencheurs custom events
  if (customEventTriggers.length > 3) score += 10;

  return {
    installed: true,
    variables: dlVariables.map(v => v.name),
    customEventTriggers: customEventTriggers.length,
    variablesCount: dlVariables.length,
    score: Math.min(score, 100)
  };
}
