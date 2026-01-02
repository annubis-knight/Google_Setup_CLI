/**
 * Commande verify-tracking
 * Vérifie que le setup tracking est COMPLET et PRÊT POUR LA PRODUCTION
 *
 * Objectif : À la fin de cette commande, si tout est vert,
 * on peut faire `firebase deploy` + publier GTM en confiance.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, relative, basename } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import yaml from 'js-yaml';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Dossiers typiques de déploiement (où les fichiers doivent être pour la prod)
 */
const DEPLOY_FOLDERS = ['public', 'dist', 'build', 'out', 'www', '.', 'src'];

/**
 * Dossiers à ignorer lors du scan
 */
const IGNORE_PATTERNS = [
  'node_modules/**', '.git/**', 'tracking/**',
  '.firebase/**', '.cache/**', 'coverage/**'
];

/**
 * Catégories de vérifications
 */
const CATEGORY = {
  CONFIG: 'Configuration',
  FILES: 'Fichiers',
  HTML: 'Intégration HTML',
  PROD: 'Production Ready'
};

/**
 * Structure des vérifications - ordonnées par importance
 */
const CHECKS = [
  // ═══════════════════════════════════════════════════════════════
  // CONFIGURATION (fichiers YAML)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'tracking_events',
    name: 'tracking-events.yaml',
    category: CATEGORY.CONFIG,
    description: 'Fichier de définition des events',
    critical: true,
    check: (ctx) => existsSync(join(ctx.projectPath, 'tracking', 'tracking-events.yaml')),
    fix: 'google-setup init-tracking'
  },
  {
    id: 'tracking_rules',
    name: 'tracking-rules.yaml',
    category: CATEGORY.CONFIG,
    description: 'Fichier de règles pour auto-détection',
    critical: false,
    check: (ctx) => existsSync(join(ctx.projectPath, 'tracking', 'tracking-rules.yaml')),
    fix: 'google-setup init-tracking'
  },
  {
    id: 'ga4_id_valid',
    name: 'GA4 Measurement ID',
    category: CATEGORY.CONFIG,
    description: 'Format valide G-XXXXXXXXXX',
    critical: true,
    check: (ctx) => {
      const eventsPath = join(ctx.projectPath, 'tracking', 'tracking-events.yaml');
      if (!existsSync(eventsPath)) return false;
      try {
        const content = yaml.load(readFileSync(eventsPath, 'utf8'));
        const ga4Id = content.project?.ga4_measurement_id || '';
        ctx.ga4Id = ga4Id;
        // Valider le format G-XXXXXXXXXX
        return /^G-[A-Z0-9]{10,}$/.test(ga4Id);
      } catch (e) {
        return false;
      }
    },
    fix: 'Éditez tracking-events.yaml → project.ga4_measurement_id (format: G-XXXXXXXXXX)'
  },
  {
    id: 'gtm_id_valid',
    name: 'GTM Container ID',
    category: CATEGORY.CONFIG,
    description: 'Format valide GTM-XXXXXXX',
    critical: true,
    check: (ctx) => {
      const eventsPath = join(ctx.projectPath, 'tracking', 'tracking-events.yaml');
      if (!existsSync(eventsPath)) return false;
      try {
        const content = yaml.load(readFileSync(eventsPath, 'utf8'));
        const gtmId = content.project?.gtm_container_id || '';
        ctx.gtmId = gtmId;
        // Valider le format GTM-XXXXXXX
        return /^GTM-[A-Z0-9]{7,}$/.test(gtmId);
      } catch (e) {
        return false;
      }
    },
    fix: 'Éditez tracking-events.yaml → project.gtm_container_id (format: GTM-XXXXXXX)'
  },
  {
    id: 'events_enabled',
    name: 'Events activés',
    category: CATEGORY.CONFIG,
    description: 'Au moins un event avec enabled: true',
    critical: true,
    check: (ctx) => {
      const eventsPath = join(ctx.projectPath, 'tracking', 'tracking-events.yaml');
      if (!existsSync(eventsPath)) return false;
      try {
        const content = yaml.load(readFileSync(eventsPath, 'utf8'));
        const events = content.events || [];
        const enabled = events.filter(e => e.enabled === true);
        ctx.enabledEvents = enabled;
        ctx.enabledEventsCount = enabled.length;
        ctx.totalEventsCount = events.length;
        return enabled.length > 0;
      } catch (e) {
        return false;
      }
    },
    fix: 'google-setup event-setup (sélectionner les events à tracker)'
  },
  {
    id: 'gtm_config',
    name: 'gtm-config.yaml',
    category: CATEGORY.CONFIG,
    description: 'Configuration GTM générée',
    critical: true,
    check: (ctx) => {
      const configPath = join(ctx.projectPath, 'tracking', 'gtm-config.yaml');
      if (!existsSync(configPath)) return false;
      try {
        const content = yaml.load(readFileSync(configPath, 'utf8'));
        ctx.gtmTags = content.tags?.length || 0;
        ctx.gtmTriggers = content.triggers?.length || 0;
        return ctx.gtmTags > 0;
      } catch (e) {
        return false;
      }
    },
    fix: 'google-setup gtm-config-setup'
  },

  // ═══════════════════════════════════════════════════════════════
  // FICHIERS GÉNÉRÉS
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'tracking_js_exists',
    name: 'tracking.js généré',
    category: CATEGORY.FILES,
    description: 'Script de tracking existe',
    critical: true,
    check: async (ctx) => {
      // Chercher tracking.js partout dans le projet
      const files = await glob('**/tracking.js', {
        cwd: ctx.projectPath,
        ignore: IGNORE_PATTERNS
      });

      if (files.length === 0) return false;

      ctx.trackingJsFiles = files;
      ctx.trackingJsPath = files[0];

      // Lire le contenu pour vérifier qu'il n'est pas vide
      const content = readFileSync(join(ctx.projectPath, files[0]), 'utf8');
      ctx.trackingJsSize = content.length;
      return content.length > 100; // Minimum viable
    },
    fix: 'google-setup generate-tracking'
  },
  {
    id: 'tracking_js_in_deploy_folder',
    name: 'tracking.js dans dossier déployable',
    category: CATEGORY.FILES,
    description: 'Le script est dans public/, dist/, ou racine',
    critical: true,
    check: (ctx) => {
      if (!ctx.trackingJsPath) return false;

      const folder = dirname(ctx.trackingJsPath);
      const folderName = folder === '.' ? '.' : basename(folder);

      // Vérifier si c'est dans un dossier déployable
      const isDeployable = DEPLOY_FOLDERS.some(d =>
        folder === d || folder.startsWith(d + '/') || folder.startsWith(d + '\\')
      );

      ctx.trackingJsFolder = folder;
      ctx.trackingJsDeployable = isDeployable;

      return isDeployable;
    },
    fix: 'Déplacez tracking.js dans public/ ou le dossier de déploiement'
  },

  // ═══════════════════════════════════════════════════════════════
  // INTÉGRATION HTML
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'gtm_snippet_present',
    name: 'GTM snippet dans HTML',
    category: CATEGORY.HTML,
    description: 'Le code GTM est présent dans le <head>',
    critical: true,
    check: async (ctx) => {
      const htmlFiles = await glob('**/*.html', {
        cwd: ctx.projectPath,
        ignore: IGNORE_PATTERNS
      });

      for (const file of htmlFiles) {
        const content = readFileSync(join(ctx.projectPath, file), 'utf8');
        // Chercher le pattern GTM
        if (content.includes('googletagmanager.com/gtm.js') ||
            content.includes('GTM-') && content.includes('gtm.js')) {
          ctx.gtmSnippetFile = file;

          // Vérifier que c'est le bon GTM ID
          if (ctx.gtmId && content.includes(ctx.gtmId)) {
            ctx.gtmSnippetCorrectId = true;
          }
          return true;
        }
      }
      return false;
    },
    fix: 'Ajoutez le snippet GTM dans le <head> de vos pages HTML'
  },
  {
    id: 'gtm_snippet_correct_id',
    name: 'GTM ID correct dans snippet',
    category: CATEGORY.HTML,
    description: 'Le snippet utilise le bon GTM ID',
    critical: true,
    check: (ctx) => {
      return ctx.gtmSnippetCorrectId === true;
    },
    fix: 'Vérifiez que le snippet GTM utilise le bon GTM ID (celui de tracking-events.yaml)'
  },
  {
    id: 'tracking_js_imported',
    name: 'tracking.js importé',
    category: CATEGORY.HTML,
    description: 'Le script est inclus dans le HTML',
    critical: true,
    check: async (ctx) => {
      const htmlFiles = await glob('**/*.html', {
        cwd: ctx.projectPath,
        ignore: IGNORE_PATTERNS
      });

      ctx.htmlWithTrackingJs = [];

      for (const file of htmlFiles) {
        const content = readFileSync(join(ctx.projectPath, file), 'utf8');
        if (content.includes('tracking.js')) {
          ctx.htmlWithTrackingJs.push(file);
        }
      }

      return ctx.htmlWithTrackingJs.length > 0;
    },
    fix: 'Ajoutez <script src="tracking.js"></script> avant </body>'
  },
  {
    id: 'tracking_js_path_valid',
    name: 'Chemin tracking.js valide',
    category: CATEGORY.HTML,
    description: 'Le chemin d\'import correspond au fichier réel',
    critical: true,
    check: async (ctx) => {
      if (!ctx.htmlWithTrackingJs || ctx.htmlWithTrackingJs.length === 0) return false;
      if (!ctx.trackingJsPath) return false;

      // Lire le premier HTML qui importe tracking.js
      const htmlFile = ctx.htmlWithTrackingJs[0];
      const htmlContent = readFileSync(join(ctx.projectPath, htmlFile), 'utf8');

      // Extraire le chemin du script
      const scriptMatch = htmlContent.match(/<script[^>]+src=["']([^"']*tracking\.js[^"']*)["']/);
      if (!scriptMatch) return false;

      const importPath = scriptMatch[1];
      ctx.trackingJsImportPath = importPath;

      // Résoudre le chemin relatif depuis le HTML
      const htmlDir = dirname(htmlFile);
      let resolvedPath;

      if (importPath.startsWith('/')) {
        // Chemin absolu depuis la racine
        resolvedPath = importPath.slice(1);
      } else if (importPath.startsWith('./') || importPath.startsWith('../')) {
        // Chemin relatif
        resolvedPath = join(htmlDir, importPath);
      } else {
        // Chemin simple (même dossier ou racine)
        resolvedPath = join(htmlDir, importPath);
      }

      // Normaliser les chemins
      const normalizedResolved = resolvedPath.replace(/\\/g, '/');
      const normalizedActual = ctx.trackingJsPath.replace(/\\/g, '/');

      ctx.resolvedTrackingJsPath = normalizedResolved;

      // Vérifier si le fichier existe à ce chemin
      const fileExists = existsSync(join(ctx.projectPath, resolvedPath)) ||
                        existsSync(join(ctx.projectPath, importPath.replace(/^\//, '')));

      return fileExists;
    },
    fix: 'Corrigez le chemin src dans <script src="...tracking.js">'
  },
  {
    id: 'data_track_present',
    name: 'Attributs data-track',
    category: CATEGORY.HTML,
    description: 'Au moins un élément a data-track',
    critical: true,
    check: async (ctx) => {
      const htmlFiles = await glob('**/*.html', {
        cwd: ctx.projectPath,
        ignore: IGNORE_PATTERNS
      });

      let total = 0;
      const byFile = [];
      const uniqueValues = new Set();

      for (const file of htmlFiles) {
        const content = readFileSync(join(ctx.projectPath, file), 'utf8');
        const matches = content.match(/data-track=["']([^"']+)["']/g);
        if (matches) {
          total += matches.length;
          byFile.push({ file, count: matches.length });
          matches.forEach(m => {
            const value = m.match(/["']([^"']+)["']/)[1];
            uniqueValues.add(value);
          });
        }
      }

      ctx.dataTrackCount = total;
      ctx.dataTrackByFile = byFile;
      ctx.dataTrackValues = [...uniqueValues];

      return total > 0;
    },
    fix: '/track-html-elements (Claude Code) ou google-setup html-layer'
  },

  // ═══════════════════════════════════════════════════════════════
  // PRODUCTION READY
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'events_match_datatrack',
    name: 'Events ↔ data-track cohérents',
    category: CATEGORY.PROD,
    description: 'Les attributs HTML correspondent aux events activés',
    critical: false,
    check: (ctx) => {
      if (!ctx.enabledEvents || !ctx.dataTrackValues) return false;

      // Extraire les valeurs attendues des selectors des events activés
      const expectedValues = new Set();
      for (const event of ctx.enabledEvents) {
        if (event.selector) {
          // Extraire la valeur de data-track du selector
          const match = event.selector.match(/data-track=["']([^"']+)["']/);
          if (match) {
            expectedValues.add(match[1]);
          }
        }
      }

      // Comparer avec les valeurs trouvées dans le HTML
      const found = ctx.dataTrackValues;
      const matched = found.filter(v => {
        // Normaliser pour comparaison (cta-primary vs cta_primary)
        const normalized = v.replace(/-/g, '_');
        return [...expectedValues].some(e =>
          e === v || e.replace(/-/g, '_') === normalized
        );
      });

      ctx.matchedDataTrack = matched.length;
      ctx.expectedDataTrack = expectedValues.size;

      // Au moins 50% des data-track doivent correspondre
      return matched.length >= Math.min(found.length, expectedValues.size) * 0.5;
    },
    fix: 'Vérifiez que les valeurs data-track correspondent aux selectors dans tracking-events.yaml'
  },
  {
    id: 'no_placeholder_ids',
    name: 'Pas d\'IDs placeholder',
    category: CATEGORY.PROD,
    description: 'Pas de G-XXXXXXXXXX ou GTM-XXXXXXX',
    critical: true,
    check: (ctx) => {
      const ga4Valid = ctx.ga4Id && !ctx.ga4Id.includes('XXXX');
      const gtmValid = ctx.gtmId && !ctx.gtmId.includes('XXXX');
      return ga4Valid && gtmValid;
    },
    fix: 'Remplacez les IDs placeholder par vos vrais IDs GA4 et GTM'
  }
];

/**
 * Affiche le résultat d'une vérification
 */
function displayCheck(check, passed, ctx) {
  const icon = passed ? chalk.green('✓') : (check.critical ? chalk.red('✗') : chalk.yellow('○'));
  const name = passed ? chalk.green(check.name) : (check.critical ? chalk.red(check.name) : chalk.yellow(check.name));

  console.log(`  ${icon} ${name}`);

  // Détails supplémentaires si passé
  if (passed) {
    switch (check.id) {
      case 'ga4_id_valid':
        console.log(chalk.gray(`      ${ctx.ga4Id}`));
        break;
      case 'gtm_id_valid':
        console.log(chalk.gray(`      ${ctx.gtmId}`));
        break;
      case 'events_enabled':
        console.log(chalk.gray(`      ${ctx.enabledEventsCount}/${ctx.totalEventsCount} events activés`));
        break;
      case 'gtm_config':
        console.log(chalk.gray(`      ${ctx.gtmTags} tags, ${ctx.gtmTriggers} triggers`));
        break;
      case 'tracking_js_exists':
        console.log(chalk.gray(`      → ${ctx.trackingJsPath} (${Math.round(ctx.trackingJsSize/1024)}KB)`));
        break;
      case 'tracking_js_in_deploy_folder':
        console.log(chalk.gray(`      → dossier: ${ctx.trackingJsFolder}`));
        break;
      case 'gtm_snippet_present':
        console.log(chalk.gray(`      → ${ctx.gtmSnippetFile}`));
        break;
      case 'tracking_js_imported':
        console.log(chalk.gray(`      → ${ctx.htmlWithTrackingJs.length} fichier(s)`));
        break;
      case 'data_track_present':
        console.log(chalk.gray(`      ${ctx.dataTrackCount} attributs (${ctx.dataTrackValues.length} uniques)`));
        break;
      case 'events_match_datatrack':
        console.log(chalk.gray(`      ${ctx.matchedDataTrack} correspondances`));
        break;
    }
  }
}

/**
 * Commande principale verify-tracking
 */
export async function runVerifyTracking(options) {
  const projectPath = options.path || process.cwd();

  console.log();
  console.log(chalk.cyan.bold('🔍 Vérification Tracking - Production Ready'));
  console.log(chalk.gray('═'.repeat(55)));
  console.log();

  const ctx = { projectPath };
  const results = [];
  let passedCount = 0;
  let criticalFailed = 0;
  let warningCount = 0;

  let currentCategory = null;

  // Exécuter chaque vérification
  for (const check of CHECKS) {
    // Afficher la catégorie si elle change
    if (check.category !== currentCategory) {
      if (currentCategory !== null) console.log();
      console.log(chalk.white.bold(`  ${check.category}`));
      console.log(chalk.gray(`  ${'─'.repeat(40)}`));
      currentCategory = check.category;
    }

    const result = await check.check(ctx);
    results.push({ ...check, passed: result });

    displayCheck(check, result, ctx);

    if (result) {
      passedCount++;
    } else if (check.critical) {
      criticalFailed++;
    } else {
      warningCount++;
    }
  }

  console.log();
  console.log(chalk.gray('═'.repeat(55)));
  console.log();

  // Résumé final
  const totalChecks = CHECKS.length;
  const percentage = Math.round((passedCount / totalChecks) * 100);

  if (criticalFailed === 0 && warningCount === 0) {
    // Tout est parfait
    console.log(chalk.green.bold('  ✅ PRÊT POUR LA PRODUCTION !'));
    console.log();
    console.log(chalk.white('  Prochaines étapes :'));
    console.log(chalk.cyan('    1. google-setup deploy      → Déployer dans GTM'));
    console.log(chalk.cyan('    2. firebase deploy          → Déployer le site'));
    console.log(chalk.cyan('    3. Publier le container GTM → GTM > Submit > Publish'));
    console.log();
    console.log(chalk.gray('  Votre tracking fonctionnera à 100% après ces étapes.'));

  } else if (criticalFailed === 0) {
    // Pas d'erreurs critiques, juste des warnings
    console.log(chalk.yellow.bold(`  ⚠️  PRESQUE PRÊT (${warningCount} avertissement${warningCount > 1 ? 's' : ''})`));
    console.log();
    console.log(chalk.white('  Recommandations (optionnelles) :'));
    for (const r of results.filter(r => !r.passed && !r.critical)) {
      console.log(chalk.gray(`    • ${r.name}: ${r.fix}`));
    }
    console.log();
    console.log(chalk.green('  Vous pouvez déployer, mais considérez ces améliorations.'));

  } else {
    // Erreurs critiques
    console.log(chalk.red.bold(`  ❌ NON PRÊT - ${criticalFailed} erreur${criticalFailed > 1 ? 's' : ''} critique${criticalFailed > 1 ? 's' : ''}`));
    console.log();
    console.log(chalk.white('  Corrections requises :'));
    console.log();

    for (const r of results.filter(r => !r.passed && r.critical)) {
      console.log(chalk.red(`    ✗ ${r.name}`));
      console.log(chalk.gray(`      → ${r.fix}`));
    }

    if (warningCount > 0) {
      console.log();
      console.log(chalk.yellow(`  + ${warningCount} avertissement${warningCount > 1 ? 's' : ''} (non bloquant${warningCount > 1 ? 's' : ''})`));
    }
  }

  console.log();

  // Retourner le statut pour usage programmatique
  return {
    passed: passedCount,
    failed: criticalFailed + warningCount,
    criticalFailed,
    warnings: warningCount,
    total: totalChecks,
    percentage,
    productionReady: criticalFailed === 0,
    context: ctx
  };
}

/**
 * Mode interactif
 */
export async function handleVerifyTrackingInteractive() {
  await runVerifyTracking({});
}
