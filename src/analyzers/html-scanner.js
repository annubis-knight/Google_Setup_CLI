/**
 * Scanner HTML - Analyse les fichiers HTML pour détecter les éléments trackables
 * Pipeline Étape 1: Extraction des éléments interactifs avec contexte
 *
 * Utilisé par la commande autoedit pour proposer des events GA4
 */

import { readFileSync, existsSync } from 'fs';
import { join, basename, relative } from 'path';
import { globSync } from 'glob';
import * as cheerio from 'cheerio';

/**
 * Catégories d'éléments interactifs à détecter
 */
const INTERACTIVE_ELEMENTS = {
  cta: {
    selectors: [
      'a.btn', 'a.button', 'a.cta',
      'button:not([type="submit"])', '[role="button"]',
      '[data-track]', '[data-cta]', '[data-track-cta]',
      '.btn-primary', '.btn-cta',
      'a[href*="contact"]', 'a[href*="devis"]', 'a[href*="demo"]', 'a[href*="quote"]'
    ],
    category: 'Lead Generation',
    importance: 'high'
  },
  contact: {
    selectors: [
      'a[href^="tel:"]',
      'a[href^="mailto:"]',
      'a[href*="wa.me"]', 'a[href*="whatsapp"]'
    ],
    category: 'Contact',
    importance: 'high'
  },
  forms: {
    selectors: [
      'form',
      'form[action*="contact"]',
      'form[action*="newsletter"]',
      'form[id*="form"]',
      '[data-form]'
    ],
    category: 'Lead Generation',
    importance: 'high'
  },
  video: {
    selectors: [
      'video',
      'iframe[src*="youtube"]',
      'iframe[src*="vimeo"]',
      '[data-video]',
      '.video-container'
    ],
    category: 'Engagement',
    importance: 'medium'
  },
  faq: {
    selectors: [
      '.faq', '.accordion',
      '[data-faq]', '[data-accordion]',
      'details', 'summary',
      '.question', '.faq-item'
    ],
    category: 'Engagement',
    importance: 'medium'
  },
  modal: {
    selectors: [
      '[data-modal]', '[data-popup]',
      '.modal', '.popup',
      '[role="dialog"]'
    ],
    category: 'Engagement',
    importance: 'medium'
  },
  navigation: {
    selectors: [
      'nav a', 'header a',
      '.navbar a', '.menu a',
      '[role="navigation"] a'
    ],
    category: 'Navigation',
    importance: 'low'
  },
  download: {
    selectors: [
      'a[href$=".pdf"]',
      'a[href$=".doc"]', 'a[href$=".docx"]',
      'a[href$=".xls"]', 'a[href$=".xlsx"]',
      'a[download]',
      '[data-download]'
    ],
    category: 'Engagement',
    importance: 'medium'
  },
  social: {
    selectors: [
      'a[href*="facebook.com"]',
      'a[href*="twitter.com"]', 'a[href*="x.com"]',
      'a[href*="linkedin.com"]',
      'a[href*="instagram.com"]',
      '.social-link', '[data-social]'
    ],
    category: 'Social',
    importance: 'low'
  },
  scroll: {
    selectors: [
      '[data-scroll]',
      'a[href^="#"]'
    ],
    category: 'Engagement',
    importance: 'low'
  }
};

/**
 * Patterns pour détecter le contexte d'un élément (où il se trouve dans la page)
 */
const CONTEXT_PATTERNS = {
  hero: ['hero', 'banner', 'jumbotron', 'masthead', 'splash', 'above-fold'],
  navbar: ['navbar', 'nav', 'header', 'topbar', 'navigation', 'menu'],
  footer: ['footer', 'bottom', 'foot'],
  sidebar: ['sidebar', 'aside', 'side-panel'],
  modal: ['modal', 'popup', 'dialog', 'overlay', 'lightbox'],
  cta_section: ['cta', 'call-to-action', 'action-section'],
  pricing: ['pricing', 'plans', 'tarif'],
  testimonials: ['testimonial', 'review', 'avis', 'temoignage'],
  features: ['features', 'services', 'benefits', 'avantages'],
  contact: ['contact', 'form-section', 'get-in-touch']
};

/**
 * Détecte le contexte d'un élément en remontant l'arbre DOM
 * @param {CheerioAPI} $ - Instance cheerio
 * @param {Element} el - Élément à analyser
 * @returns {Object} Contexte détecté {context: string, contextDetails: string[]}
 */
function getElementContext($, el) {
  const contexts = [];
  let current = $(el).parent();
  let depth = 0;
  const maxDepth = 10;

  while (current.length > 0 && depth < maxDepth) {
    const tagName = current.prop('tagName')?.toLowerCase() || '';
    const cls = (current.attr('class') || '').toLowerCase();
    const id = (current.attr('id') || '').toLowerCase();
    const role = (current.attr('role') || '').toLowerCase();
    const combined = `${tagName} ${cls} ${id} ${role}`;

    // Vérifier chaque pattern de contexte
    for (const [contextName, patterns] of Object.entries(CONTEXT_PATTERNS)) {
      for (const pattern of patterns) {
        if (combined.includes(pattern) && !contexts.includes(contextName)) {
          contexts.push(contextName);
        }
      }
    }

    // Contexte sémantique HTML5
    if (['header', 'nav', 'main', 'aside', 'footer', 'section', 'article'].includes(tagName)) {
      const htmlContext = tagName === 'nav' ? 'navbar' : tagName;
      if (!contexts.includes(htmlContext)) {
        contexts.push(htmlContext);
      }
    }

    current = current.parent();
    depth++;
  }

  return {
    context: contexts[0] || 'body',
    contextPath: contexts.slice(0, 3)
  };
}

/**
 * Extrait tous les data-attributes d'un élément
 */
function extractDataAttributes(el) {
  const attrs = {};
  const attribs = el.attribs || {};
  for (const [key, value] of Object.entries(attribs)) {
    if (key.startsWith('data-')) {
      attrs[key] = value;
    }
  }
  return attrs;
}

/**
 * Génère un ID unique pour un élément basé sur ses caractéristiques
 */
function generateElementId(element, index) {
  if (element.id) return element.id;
  if (element.dataAttributes['data-track']) return element.dataAttributes['data-track'];
  if (element.dataAttributes['data-track-cta']) return `cta-${element.dataAttributes['data-track-cta']}`;

  const base = element.text
    ? element.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)
    : element.tag;

  return `${element.context}-${base}-${index}`.replace(/--+/g, '-');
}

/**
 * Scanne un fichier HTML et extrait les éléments interactifs avec contexte
 * @param {CheerioAPI} $ - Instance cheerio
 * @param {string} filePath - Chemin du fichier HTML
 * @param {string} sourcePath - Chemin racine du scan
 * @returns {Object} Éléments détectés avec contexte enrichi
 */
function scanHTMLFile($, filePath, sourcePath) {
  const fileName = basename(filePath);
  const relativePath = relative(sourcePath, filePath).replace(/\\/g, '/');

  const elements = {
    file: fileName,
    path: filePath,
    relativePath,
    detected: {}
  };

  let globalIndex = 0;

  // Scanner chaque catégorie d'éléments
  for (const [category, config] of Object.entries(INTERACTIVE_ELEMENTS)) {
    const found = [];

    for (const selector of config.selectors) {
      $(selector).each((_, el) => {
        const $el = $(el);
        const contextInfo = getElementContext($, el);

        const element = {
          tag: el.tagName?.toLowerCase() || el.name,
          matchedSelector: selector,
          text: $el.text().trim().slice(0, 80),
          href: $el.attr('href') || null,
          id: $el.attr('id') || null,
          class: $el.attr('class') || null,
          name: $el.attr('name') || null,
          type: $el.attr('type') || null,
          role: $el.attr('role') || null,
          dataAttributes: extractDataAttributes(el),
          context: contextInfo.context,
          contextPath: contextInfo.contextPath,
          importance: config.importance,
          gaCategory: config.category,
          // HTML brut tronqué pour debug
          outerHTML: $.html(el).slice(0, 300)
        };

        // Générer un ID unique
        element.elementId = generateElementId(element, globalIndex++);

        // Pour les formulaires, extraire les inputs
        if (category === 'forms') {
          const inputs = [];
          $el.find('input, select, textarea').each((_, input) => {
            inputs.push({
              type: $(input).attr('type') || 'text',
              name: $(input).attr('name') || null,
              id: $(input).attr('id') || null,
              placeholder: $(input).attr('placeholder') || null,
              required: $(input).attr('required') !== undefined
            });
          });
          element.formInputs = inputs;
          element.formAction = $el.attr('action') || null;
          element.formMethod = ($el.attr('method') || 'GET').toUpperCase();
        }

        // Pour les vidéos, extraire la source
        if (category === 'video') {
          element.videoSrc = $el.attr('src') || $el.find('source').attr('src') || null;
          element.videoProvider = detectVideoProvider(element.videoSrc || element.href);
        }

        // Éviter les doublons basés sur l'outerHTML
        const signature = element.outerHTML;
        if (!found.some(f => f.outerHTML === signature)) {
          found.push(element);
        }
      });
    }

    if (found.length > 0) {
      elements.detected[category] = {
        count: found.length,
        gaCategory: config.category,
        importance: config.importance,
        elements: found
      };
    }
  }

  return elements;
}

/**
 * Détecte le provider vidéo à partir de l'URL
 */
function detectVideoProvider(url) {
  if (!url) return 'unknown';
  if (url.includes('youtube') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('vimeo')) return 'vimeo';
  if (url.includes('wistia')) return 'wistia';
  if (url.includes('dailymotion')) return 'dailymotion';
  return 'self-hosted';
}

/**
 * Dossiers ignorés par défaut (build/prod pour éviter les doublons)
 */
const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/vendor/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/out/**',
  '**/.nuxt/**',
  '**/.output/**',
  '**/public/build/**'
];

/**
 * Scanne tous les fichiers HTML d'un répertoire
 * @param {string} sourcePath - Chemin du répertoire source
 * @param {Object} options - Options de scan
 * @param {string[]} options.exclude - Dossiers additionnels à ignorer
 * @param {boolean} options.includeBuild - Inclure les dossiers de build (dist, build, etc.)
 * @returns {Object} Résultat de l'analyse
 */
export async function analyzeHTMLFiles(sourcePath, options = {}) {
  // Chercher les fichiers HTML
  const patterns = [
    '**/*.html',
    '**/*.htm'
  ];

  // Construire la liste des patterns à ignorer
  let ignorePatterns = [...DEFAULT_IGNORE];

  // Si on veut inclure les builds, retirer ces patterns
  if (options.includeBuild) {
    ignorePatterns = [
      '**/node_modules/**',
      '**/.git/**',
      '**/vendor/**'
    ];
  }

  // Ajouter les exclusions personnalisées
  if (options.exclude && Array.isArray(options.exclude)) {
    for (const pattern of options.exclude) {
      ignorePatterns.push(`**/${pattern}/**`);
    }
  }

  let htmlFiles = [];

  for (const pattern of patterns) {
    const files = globSync(pattern, {
      cwd: sourcePath,
      ignore: ignorePatterns,
      absolute: true
    });
    htmlFiles.push(...files);
  }

  // Dédupliquer
  htmlFiles = [...new Set(htmlFiles)];

  if (htmlFiles.length === 0) {
    return {
      success: false,
      error: 'Aucun fichier HTML trouvé',
      sourcePath
    };
  }

  const result = {
    success: true,
    sourcePath,
    filesScanned: htmlFiles.length,
    files: [],
    summary: {
      totalElements: 0,
      byCategory: {},
      byContext: {},
      byImportance: { high: 0, medium: 0, low: 0 }
    },
    // Liste aplatie de tous les éléments pour l'IA
    allElements: []
  };

  // Scanner chaque fichier
  for (const file of htmlFiles) {
    try {
      const content = readFileSync(file, 'utf8');
      const $ = cheerio.load(content);
      const fileResult = scanHTMLFile($, file, sourcePath);
      result.files.push(fileResult);

      // Agréger les résultats
      for (const [category, data] of Object.entries(fileResult.detected)) {
        result.summary.totalElements += data.count;

        // Par catégorie
        if (!result.summary.byCategory[category]) {
          result.summary.byCategory[category] = {
            count: 0,
            gaCategory: data.gaCategory,
            importance: data.importance,
            files: []
          };
        }
        result.summary.byCategory[category].count += data.count;
        result.summary.byCategory[category].files.push(fileResult.file);

        // Ajouter à la liste aplatie
        for (const el of data.elements) {
          result.allElements.push({
            ...el,
            sourceFile: fileResult.relativePath,
            category
          });

          // Par contexte
          const ctx = el.context || 'body';
          result.summary.byContext[ctx] = (result.summary.byContext[ctx] || 0) + 1;

          // Par importance
          const imp = el.importance || 'medium';
          result.summary.byImportance[imp] = (result.summary.byImportance[imp] || 0) + 1;
        }
      }
    } catch (error) {
      // Ignorer les fichiers qui ne peuvent pas être lus
      console.error(`Erreur lecture ${file}: ${error.message}`);
    }
  }

  return result;
}

/**
 * Génère un résumé lisible de l'analyse HTML
 * @param {Object} analysis - Résultat de analyzeHTMLFiles
 * @returns {string} Résumé formaté
 */
export function generateHTMLSummary(analysis) {
  if (!analysis.success) {
    return `Erreur: ${analysis.error}`;
  }

  const lines = [
    `Fichiers HTML scannés: ${analysis.filesScanned}`,
    `Éléments interactifs détectés: ${analysis.summary.totalElements}`,
    '',
    'Par catégorie:'
  ];

  for (const [category, data] of Object.entries(analysis.summary.byCategory)) {
    lines.push(`  - ${category}: ${data.count} éléments (${data.category})`);
  }

  return lines.join('\n');
}

/**
 * Convertit l'analyse HTML en format enrichi pour le prompt IA
 * @param {Object} analysis - Résultat de analyzeHTMLFiles
 * @returns {Object} Données enrichies pour l'IA
 */
export function prepareForAI(analysis) {
  if (!analysis.success) {
    return { error: analysis.error };
  }

  // Préparer les éléments par importance (high > medium > low)
  const byImportance = {
    high: [],
    medium: [],
    low: []
  };

  for (const el of analysis.allElements) {
    const imp = el.importance || 'medium';
    byImportance[imp].push({
      elementId: el.elementId,
      category: el.category,
      tag: el.tag,
      text: el.text,
      context: el.context,
      contextPath: el.contextPath,
      id: el.id,
      class: el.class,
      href: el.href,
      dataAttributes: el.dataAttributes,
      sourceFile: el.sourceFile,
      // Données spécifiques
      ...(el.formInputs && { formInputs: el.formInputs }),
      ...(el.videoProvider && { videoProvider: el.videoProvider })
    });
  }

  // Limiter le nombre d'éléments pour ne pas surcharger le prompt
  const MAX_ELEMENTS = {
    high: 30,
    medium: 20,
    low: 10
  };

  return {
    filesScanned: analysis.filesScanned,
    summary: {
      totalElements: analysis.summary.totalElements,
      byCategory: Object.fromEntries(
        Object.entries(analysis.summary.byCategory).map(([k, v]) => [k, {
          count: v.count,
          gaCategory: v.gaCategory,
          importance: v.importance
        }])
      ),
      byContext: analysis.summary.byContext,
      byImportance: analysis.summary.byImportance
    },
    elements: {
      high: byImportance.high.slice(0, MAX_ELEMENTS.high),
      medium: byImportance.medium.slice(0, MAX_ELEMENTS.medium),
      low: byImportance.low.slice(0, MAX_ELEMENTS.low)
    }
  };
}
