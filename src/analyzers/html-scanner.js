/**
 * Scanner HTML - Analyse les fichiers HTML pour détecter les éléments trackables
 * Utilisé par la commande autoedit pour proposer des events GA4
 */

import { readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { globSync } from 'glob';
import * as cheerio from 'cheerio';

/**
 * Catégories d'éléments interactifs à détecter
 */
const INTERACTIVE_ELEMENTS = {
  cta: {
    selectors: [
      'a.btn', 'a.button', 'a.cta',
      'button', '[role="button"]',
      '[data-track]', '[data-cta]',
      '.btn-primary', '.btn-cta',
      'a[href*="contact"]', 'a[href*="devis"]', 'a[href*="demo"]'
    ],
    category: 'Lead Generation'
  },
  contact: {
    selectors: [
      'a[href^="tel:"]',
      'a[href^="mailto:"]',
      'a[href*="wa.me"]', 'a[href*="whatsapp"]'
    ],
    category: 'Contact'
  },
  forms: {
    selectors: [
      'form',
      'form[action*="contact"]',
      'form[action*="newsletter"]',
      'form[id*="form"]',
      '[data-form]'
    ],
    category: 'Lead Generation'
  },
  video: {
    selectors: [
      'video',
      'iframe[src*="youtube"]',
      'iframe[src*="vimeo"]',
      '[data-video]',
      '.video-container'
    ],
    category: 'Engagement'
  },
  faq: {
    selectors: [
      '.faq', '.accordion',
      '[data-faq]', '[data-accordion]',
      'details', 'summary',
      '.question', '.faq-item'
    ],
    category: 'Engagement'
  },
  modal: {
    selectors: [
      '[data-modal]', '[data-popup]',
      '.modal', '.popup',
      '[role="dialog"]'
    ],
    category: 'Engagement'
  },
  navigation: {
    selectors: [
      'nav a', 'header a',
      '.navbar a', '.menu a',
      '[role="navigation"] a'
    ],
    category: 'Navigation'
  },
  download: {
    selectors: [
      'a[href$=".pdf"]',
      'a[href$=".doc"]', 'a[href$=".docx"]',
      'a[href$=".xls"]', 'a[href$=".xlsx"]',
      'a[download]',
      '[data-download]'
    ],
    category: 'Engagement'
  },
  social: {
    selectors: [
      'a[href*="facebook.com"]',
      'a[href*="twitter.com"]', 'a[href*="x.com"]',
      'a[href*="linkedin.com"]',
      'a[href*="instagram.com"]',
      '.social-link', '[data-social]'
    ],
    category: 'Social'
  },
  scroll: {
    selectors: [
      '[data-scroll]',
      'a[href^="#"]'
    ],
    category: 'Engagement'
  }
};

/**
 * Scanne un fichier HTML et extrait les éléments interactifs
 * @param {string} filePath - Chemin du fichier HTML
 * @returns {Object} Éléments détectés
 */
function scanHTMLFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const $ = cheerio.load(content);
  const fileName = basename(filePath);

  const elements = {
    file: fileName,
    path: filePath,
    detected: {}
  };

  // Scanner chaque catégorie d'éléments
  for (const [category, config] of Object.entries(INTERACTIVE_ELEMENTS)) {
    const found = [];

    for (const selector of config.selectors) {
      $(selector).each((_, el) => {
        const $el = $(el);
        const element = {
          tag: el.tagName?.toLowerCase() || el.name,
          selector: selector,
          text: $el.text().trim().slice(0, 50),
          href: $el.attr('href') || null,
          id: $el.attr('id') || null,
          class: $el.attr('class') || null,
          dataAttributes: {}
        };

        // Extraire les data-attributes
        const attrs = el.attribs || {};
        for (const [key, value] of Object.entries(attrs)) {
          if (key.startsWith('data-')) {
            element.dataAttributes[key] = value;
          }
        }

        // Éviter les doublons
        const signature = `${element.tag}-${element.text}-${element.href}`;
        if (!found.some(f => `${f.tag}-${f.text}-${f.href}` === signature)) {
          found.push(element);
        }
      });
    }

    if (found.length > 0) {
      elements.detected[category] = {
        count: found.length,
        category: config.category,
        elements: found
      };
    }
  }

  return elements;
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
      byCategory: {}
    }
  };

  // Scanner chaque fichier
  for (const file of htmlFiles) {
    try {
      const fileResult = scanHTMLFile(file);
      result.files.push(fileResult);

      // Agréger les résultats
      for (const [category, data] of Object.entries(fileResult.detected)) {
        result.summary.totalElements += data.count;

        if (!result.summary.byCategory[category]) {
          result.summary.byCategory[category] = {
            count: 0,
            category: data.category,
            files: []
          };
        }
        result.summary.byCategory[category].count += data.count;
        result.summary.byCategory[category].files.push(fileResult.file);
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
 * Convertit l'analyse HTML en format pour le prompt IA
 * @param {Object} analysis - Résultat de analyzeHTMLFiles
 * @returns {Object} Données simplifiées pour l'IA
 */
export function prepareForAI(analysis) {
  if (!analysis.success) {
    return { error: analysis.error };
  }

  const simplified = {
    filesScanned: analysis.filesScanned,
    elements: {}
  };

  for (const [category, data] of Object.entries(analysis.summary.byCategory)) {
    simplified.elements[category] = {
      count: data.count,
      gaCategory: data.category,
      examples: []
    };

    // Extraire quelques exemples de chaque catégorie
    for (const file of analysis.files) {
      const detected = file.detected[category];
      if (detected) {
        for (const el of detected.elements.slice(0, 3)) {
          simplified.elements[category].examples.push({
            text: el.text,
            href: el.href,
            tag: el.tag
          });
        }
      }
    }

    // Limiter à 5 exemples par catégorie
    simplified.elements[category].examples =
      simplified.elements[category].examples.slice(0, 5);
  }

  return simplified;
}
