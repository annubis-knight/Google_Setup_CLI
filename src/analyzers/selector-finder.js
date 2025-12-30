/**
 * Selector Finder - Trouve les meilleurs sélecteurs CSS pour GTM
 * Pipeline Étape 4: Sélecteurs robustes avec niveaux de confiance
 *
 * Priorité des sélecteurs:
 * 1. data-track-* attributes (high confidence)
 * 2. ID unique et sémantique (medium-high confidence)
 * 3. Classe sémantique + contexte (medium confidence)
 * 4. Click Text pour GTM (low-medium confidence)
 * 5. Fallback générique (low confidence)
 */

/**
 * Classes Tailwind et utilitaires à ignorer
 */
const TAILWIND_PATTERNS = [
  /^(px|py|pt|pb|pl|pr|p)-/,
  /^(mx|my|mt|mb|ml|mr|m)-/,
  /^(w|h|min-w|min-h|max-w|max-h)-/,
  /^(bg|text|border|ring|shadow)-/,
  /^(flex|grid|block|inline|hidden)/,
  /^(items|justify|content|self)-/,
  /^(gap|space)-/,
  /^(rounded|opacity|z|order)-/,
  /^(col|row)-span-/,
  /^(sm|md|lg|xl|2xl):/,
  /^hover:|^focus:|^active:|^group-/,
  /^transition|^duration|^ease|^delay/,
  /^font-(thin|light|normal|medium|semibold|bold)/,
  /^text-(xs|sm|base|lg|xl|2xl|3xl)/,
  /^leading-|^tracking-/,
  /^cursor-|^pointer-events-/,
  /^overflow-|^whitespace-/,
  /^transform|^rotate|^scale|^translate/
];

/**
 * Classes sémantiques à privilégier
 */
const SEMANTIC_CLASS_PATTERNS = [
  'btn', 'button', 'cta', 'link',
  'nav', 'menu', 'header', 'footer',
  'form', 'input', 'submit',
  'card', 'modal', 'popup', 'dialog',
  'hero', 'banner', 'section',
  'primary', 'secondary', 'action',
  'download', 'contact', 'phone', 'email'
];

/**
 * Niveaux de confiance
 */
export const CONFIDENCE_LEVELS = {
  HIGH: 'high',
  MEDIUM_HIGH: 'medium-high',
  MEDIUM: 'medium',
  LOW_MEDIUM: 'low-medium',
  LOW: 'low'
};

/**
 * Filtre les classes Tailwind et garde les classes sémantiques
 * @param {string} classString - Chaîne de classes CSS
 * @returns {string[]} Classes sémantiques uniquement
 */
function filterSemanticClasses(classString) {
  if (!classString) return [];

  return classString
    .split(/\s+/)
    .filter(cls => {
      // Ignorer les classes vides ou très courtes
      if (!cls || cls.length < 2) return false;

      // Ignorer les patterns Tailwind
      for (const pattern of TAILWIND_PATTERNS) {
        if (pattern.test(cls)) return false;
      }

      return true;
    })
    .filter(cls => {
      // Privilégier les classes sémantiques
      const lowerCls = cls.toLowerCase();
      return SEMANTIC_CLASS_PATTERNS.some(semantic =>
        lowerCls.includes(semantic)
      ) || cls.length > 3; // Garder aussi les classes "longues" non-Tailwind
    });
}

/**
 * Vérifie si un ID est sémantique et exploitable
 * @param {string} id - ID de l'élément
 * @returns {boolean}
 */
function isSemanticId(id) {
  if (!id || id.length < 3) return false;

  // Rejeter les IDs générés automatiquement
  if (/^[0-9]+$/.test(id)) return false;
  if (/^(id|el|element|item)[_-]?\d+$/i.test(id)) return false;
  if (/^[a-f0-9]{8,}$/i.test(id)) return false; // Hash-like
  if (/^react|^vue|^ng-|^__/i.test(id)) return false; // Framework-generated

  return true;
}

/**
 * Trouve le meilleur sélecteur CSS pour un élément
 * @param {Object} element - Élément scanné
 * @returns {Object} Sélecteur recommandé avec métadonnées
 */
export function findBestSelector(element) {
  const selectors = [];

  // === PRIORITÉ 1: data-track-* attributes ===
  if (element.dataAttributes) {
    for (const [key, value] of Object.entries(element.dataAttributes)) {
      if (key.startsWith('data-track')) {
        selectors.push({
          selector: `[${key}="${value}"]`,
          confidence: CONFIDENCE_LEVELS.HIGH,
          type: 'data-attribute',
          reason: 'Attribut de tracking dédié, le plus stable',
          gtmConfig: {
            triggerType: 'Click - All Elements',
            matchType: 'CSS Selector'
          }
        });
      }
    }

    // data-cta, data-modal, etc.
    for (const [key, value] of Object.entries(element.dataAttributes)) {
      if (!key.startsWith('data-track') && value) {
        selectors.push({
          selector: `[${key}="${value}"]`,
          confidence: CONFIDENCE_LEVELS.MEDIUM_HIGH,
          type: 'data-attribute',
          reason: `Data attribute ${key} présent`,
          gtmConfig: {
            triggerType: 'Click - All Elements',
            matchType: 'CSS Selector'
          }
        });
      }
    }
  }

  // === PRIORITÉ 2: ID unique et sémantique ===
  if (element.id && isSemanticId(element.id)) {
    selectors.push({
      selector: `#${element.id}`,
      confidence: CONFIDENCE_LEVELS.MEDIUM_HIGH,
      type: 'id',
      reason: 'ID présent et sémantique',
      gtmConfig: {
        triggerType: 'Click - All Elements',
        matchType: 'ID equals',
        value: element.id
      }
    });
  }

  // === PRIORITÉ 3: Classe sémantique + contexte ===
  const semanticClasses = filterSemanticClasses(element.class);
  if (semanticClasses.length > 0 && element.context && element.context !== 'body') {
    const classSelector = semanticClasses.slice(0, 2).map(c => `.${c}`).join('');
    selectors.push({
      selector: `.${element.context} ${classSelector}`,
      confidence: CONFIDENCE_LEVELS.MEDIUM,
      type: 'class-context',
      reason: 'Combinaison classe sémantique + contexte de page',
      gtmConfig: {
        triggerType: 'Click - All Elements',
        matchType: 'CSS Selector'
      }
    });
  }

  // Classe seule si sémantique
  if (semanticClasses.length > 0) {
    const uniqueClass = semanticClasses.find(c =>
      ['cta', 'submit', 'primary-action', 'contact-btn'].some(s => c.toLowerCase().includes(s))
    );
    if (uniqueClass) {
      selectors.push({
        selector: `.${uniqueClass}`,
        confidence: CONFIDENCE_LEVELS.MEDIUM,
        type: 'class',
        reason: `Classe sémantique unique: ${uniqueClass}`,
        gtmConfig: {
          triggerType: 'Click - All Elements',
          matchType: 'CSS Selector'
        }
      });
    }
  }

  // === PRIORITÉ 4: Click Text (pour GTM auto-event) ===
  if (element.text && element.text.length > 2 && element.text.length < 50) {
    // Nettoyer le texte
    const cleanText = element.text.trim().replace(/\s+/g, ' ');
    selectors.push({
      selector: `Click Text contains "${cleanText}"`,
      confidence: CONFIDENCE_LEVELS.LOW_MEDIUM,
      type: 'click-text',
      reason: 'Texte du bouton (fragile si le texte change)',
      gtmConfig: {
        triggerType: 'Click - All Elements',
        matchType: 'Click Text',
        operator: 'contains',
        value: cleanText
      }
    });
  }

  // === PRIORITÉ 5: href pour les liens ===
  if (element.href && element.tag === 'a') {
    // Liens tel: ou mailto:
    if (element.href.startsWith('tel:') || element.href.startsWith('mailto:')) {
      selectors.push({
        selector: `a[href^="${element.href.split(':')[0]}:"]`,
        confidence: CONFIDENCE_LEVELS.MEDIUM,
        type: 'href-protocol',
        reason: `Lien ${element.href.split(':')[0]}: détecté`,
        gtmConfig: {
          triggerType: 'Click - Just Links',
          matchType: 'Click URL',
          operator: 'starts with',
          value: element.href.split(':')[0] + ':'
        }
      });
    }
    // Liens de téléchargement
    else if (/\.(pdf|doc|docx|xls|xlsx|zip)$/i.test(element.href)) {
      const ext = element.href.match(/\.(\w+)$/)[1].toLowerCase();
      selectors.push({
        selector: `a[href$=".${ext}"]`,
        confidence: CONFIDENCE_LEVELS.MEDIUM,
        type: 'href-extension',
        reason: `Lien de téléchargement .${ext}`,
        gtmConfig: {
          triggerType: 'Click - Just Links',
          matchType: 'Click URL',
          operator: 'ends with',
          value: `.${ext}`
        }
      });
    }
  }

  // === FALLBACK ===
  if (selectors.length === 0) {
    const fallbackSelector = element.class
      ? `.${element.class.split(' ')[0]}`
      : element.tag;

    selectors.push({
      selector: fallbackSelector,
      confidence: CONFIDENCE_LEVELS.LOW,
      type: 'fallback',
      reason: 'Aucun sélecteur robuste trouvé',
      suggestion: `Ajouter data-track="${element.elementId || 'unknown'}" dans le HTML`,
      needsManualAction: true,
      gtmConfig: {
        triggerType: 'Click - All Elements',
        matchType: 'CSS Selector'
      }
    });
  }

  // Trier par confiance et retourner le meilleur + alternatives
  const sorted = selectors.sort((a, b) => {
    const order = {
      [CONFIDENCE_LEVELS.HIGH]: 5,
      [CONFIDENCE_LEVELS.MEDIUM_HIGH]: 4,
      [CONFIDENCE_LEVELS.MEDIUM]: 3,
      [CONFIDENCE_LEVELS.LOW_MEDIUM]: 2,
      [CONFIDENCE_LEVELS.LOW]: 1
    };
    return order[b.confidence] - order[a.confidence];
  });

  return {
    recommended: sorted[0],
    alternatives: sorted.slice(1, 3),
    allSelectors: sorted
  };
}

/**
 * Analyse tous les éléments et trouve leurs sélecteurs
 * @param {Object[]} elements - Liste des éléments scannés
 * @returns {Object} Map elementId → sélecteurs
 */
export function findSelectorsForElements(elements) {
  const results = {
    selectors: {},
    summary: {
      total: elements.length,
      byConfidence: {
        [CONFIDENCE_LEVELS.HIGH]: 0,
        [CONFIDENCE_LEVELS.MEDIUM_HIGH]: 0,
        [CONFIDENCE_LEVELS.MEDIUM]: 0,
        [CONFIDENCE_LEVELS.LOW_MEDIUM]: 0,
        [CONFIDENCE_LEVELS.LOW]: 0
      },
      needsManualAction: []
    }
  };

  for (const element of elements) {
    const selectorResult = findBestSelector(element);
    const elementId = element.elementId || `unknown-${Math.random().toString(36).slice(2, 8)}`;

    results.selectors[elementId] = {
      element: {
        category: element.category,
        context: element.context,
        text: element.text,
        sourceFile: element.sourceFile
      },
      ...selectorResult
    };

    // Mettre à jour les stats
    const confidence = selectorResult.recommended.confidence;
    results.summary.byConfidence[confidence]++;

    // Marquer les éléments nécessitant une action manuelle
    if (selectorResult.recommended.needsManualAction) {
      results.summary.needsManualAction.push({
        elementId,
        sourceFile: element.sourceFile,
        suggestion: selectorResult.recommended.suggestion,
        context: element.context,
        text: element.text?.slice(0, 30)
      });
    }
  }

  return results;
}

/**
 * Génère un rapport de qualité des sélecteurs
 * @param {Object} selectorResults - Résultat de findSelectorsForElements
 * @returns {Object} Rapport de qualité
 */
export function generateSelectorReport(selectorResults) {
  const { summary } = selectorResults;

  const highQuality = summary.byConfidence[CONFIDENCE_LEVELS.HIGH] +
    summary.byConfidence[CONFIDENCE_LEVELS.MEDIUM_HIGH];
  const mediumQuality = summary.byConfidence[CONFIDENCE_LEVELS.MEDIUM] +
    summary.byConfidence[CONFIDENCE_LEVELS.LOW_MEDIUM];
  const lowQuality = summary.byConfidence[CONFIDENCE_LEVELS.LOW];

  const qualityScore = Math.round(
    ((highQuality * 100) + (mediumQuality * 60) + (lowQuality * 20)) / summary.total
  );

  return {
    score: qualityScore,
    grade: qualityScore >= 80 ? 'A' : qualityScore >= 60 ? 'B' : qualityScore >= 40 ? 'C' : 'D',
    breakdown: {
      highConfidence: highQuality,
      mediumConfidence: mediumQuality,
      lowConfidence: lowQuality
    },
    recommendations: summary.needsManualAction,
    message: lowQuality > 0
      ? `${lowQuality} élément(s) nécessitent l'ajout de data-track dans le HTML`
      : 'Tous les sélecteurs sont de qualité suffisante'
  };
}
