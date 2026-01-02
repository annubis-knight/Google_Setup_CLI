/**
 * Commande verify-tracking
 * Vérifie que le setup tracking est COMPLET et PRÊT POUR LA PRODUCTION
 *
 * Objectif : À la fin de cette commande, si tout est vert,
 * on peut faire `firebase deploy` + publier GTM en confiance.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import yaml from 'js-yaml';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Dossiers sources typiques (où tracking.js doit être pour le dev/bundling)
 */
const SOURCE_FOLDERS = ['src', 'js', 'assets/js', 'scripts', '.'];

/**
 * Dossiers à ignorer lors du scan
 */
const IGNORE_PATTERNS = [
  'node_modules/**', '.git/**', 'tracking/**',
  '.firebase/**', '.cache/**', 'coverage/**',
  'dist/**', 'build/**', 'out/**'
];

/**
 * Catégories de vérifications
 */
const CATEGORY = {
  CONFIG: 'Configuration',
  FILES: 'Fichiers',
  INTEGRATION: 'Intégration Code',
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
    description: 'Fichier de règles pour /track-html-elements',
    critical: true, // Maintenant critique
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

        // Extraire les valeurs data-track attendues depuis les selectors
        ctx.expectedDataTrackValues = new Set();
        for (const event of enabled) {
          if (event.selector) {
            const match = event.selector.match(/data-track=["']([^"']+)["']/);
            if (match) {
              ctx.expectedDataTrackValues.add(match[1]);
            }
          }
        }

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
      // Chercher tracking.js dans les dossiers sources (pas dist/build)
      const files = await glob('**/tracking.js', {
        cwd: ctx.projectPath,
        ignore: IGNORE_PATTERNS
      });

      if (files.length === 0) return false;

      ctx.trackingJsFiles = files;
      ctx.trackingJsPath = files[0];
      ctx.trackingJsFolder = dirname(files[0]);

      // Lire le contenu (pas de vérification de taille minimale)
      const content = readFileSync(join(ctx.projectPath, files[0]), 'utf8');
      ctx.trackingJsSize = content.length;
      ctx.trackingJsContent = content;

      return true;
    },
    fix: 'google-setup generate-tracking'
  },
  {
    id: 'tracking_js_in_source_folder',
    name: 'tracking.js dans dossier source',
    category: CATEGORY.FILES,
    description: 'Le script est dans src/, js/, ou racine (pour webpack)',
    critical: true,
    check: (ctx) => {
      if (!ctx.trackingJsPath) return false;

      const folder = ctx.trackingJsFolder;

      // Vérifier si c'est dans un dossier source (pas dist/build)
      const isInSource = SOURCE_FOLDERS.some(d =>
        folder === d || folder.startsWith(d + '/') || folder.startsWith(d + '\\') || folder === '.'
      );

      ctx.trackingJsInSource = isInSource;

      return isInSource;
    },
    fix: 'Placez tracking.js dans src/ ou js/ pour qu\'il soit bundlé par webpack'
  },

  // ═══════════════════════════════════════════════════════════════
  // INTÉGRATION CODE (JS/HTML)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'tracking_js_imported_in_js',
    name: 'tracking.js importé dans JS',
    category: CATEGORY.INTEGRATION,
    description: 'Import dans main.js, app.js ou index.js',
    critical: true,
    check: async (ctx) => {
      // Chercher les fichiers JS d'entrée typiques
      const entryFiles = await glob('**/{main,app,index}.{js,ts,jsx,tsx}', {
        cwd: ctx.projectPath,
        ignore: IGNORE_PATTERNS
      });

      ctx.jsImportFiles = [];

      for (const file of entryFiles) {
        const content = readFileSync(join(ctx.projectPath, file), 'utf8');
        // Chercher import ou require de tracking
        if (content.includes('tracking') &&
            (content.includes('import') || content.includes('require'))) {
          ctx.jsImportFiles.push(file);
        }
      }

      // Si pas trouvé dans les entry files, chercher dans tous les JS
      if (ctx.jsImportFiles.length === 0) {
        const allJsFiles = await glob('**/*.{js,ts,jsx,tsx}', {
          cwd: ctx.projectPath,
          ignore: IGNORE_PATTERNS
        });

        for (const file of allJsFiles) {
          const content = readFileSync(join(ctx.projectPath, file), 'utf8');
          if (content.match(/import\s+.*from\s+['"].*tracking/i) ||
              content.match(/require\s*\(\s*['"].*tracking/i)) {
            ctx.jsImportFiles.push(file);
          }
        }
      }

      return ctx.jsImportFiles.length > 0;
    },
    fix: 'Ajoutez dans main.js: import { initTracking } from \'./tracking.js\''
  },
  {
    id: 'gtm_snippet_in_html',
    name: 'GTM snippet dans HTML',
    category: CATEGORY.INTEGRATION,
    description: 'Code GTM copié depuis tagmanager.google.com',
    critical: true,
    check: async (ctx) => {
      // Chercher dans HTML et templates
      const files = await glob('**/*.{html,ejs,hbs,pug,php}', {
        cwd: ctx.projectPath,
        ignore: IGNORE_PATTERNS
      });

      for (const file of files) {
        const content = readFileSync(join(ctx.projectPath, file), 'utf8');
        // Le snippet GTM contient cette URL
        if (content.includes('googletagmanager.com/gtm.js')) {
          ctx.gtmSnippetFile = file;

          // Vérifier que c'est le bon GTM ID
          if (ctx.gtmId && content.includes(ctx.gtmId)) {
            ctx.gtmSnippetCorrectId = true;
          }
          return true;
        }
      }

      // Si pas trouvé, vérifier aussi dans les JS (certains l'injectent dynamiquement)
      const jsFiles = await glob('**/*.{js,ts}', {
        cwd: ctx.projectPath,
        ignore: IGNORE_PATTERNS
      });

      for (const file of jsFiles) {
        const content = readFileSync(join(ctx.projectPath, file), 'utf8');
        if (content.includes('googletagmanager.com/gtm.js')) {
          ctx.gtmSnippetFile = file + ' (injection JS)';
          if (ctx.gtmId && content.includes(ctx.gtmId)) {
            ctx.gtmSnippetCorrectId = true;
          }
          return true;
        }
      }

      return false;
    },
    fix: 'Copiez le snippet GTM depuis tagmanager.google.com > Admin > Install'
  },
  {
    id: 'gtm_snippet_correct_id',
    name: 'GTM ID correct dans snippet',
    category: CATEGORY.INTEGRATION,
    description: 'Le snippet utilise le bon GTM ID',
    critical: true,
    check: (ctx) => {
      return ctx.gtmSnippetCorrectId === true;
    },
    fix: 'Le snippet GTM doit contenir votre ID (voir tracking-events.yaml)'
  },
  {
    id: 'data_track_per_event',
    name: 'data-track par event activé',
    category: CATEGORY.INTEGRATION,
    description: 'Chaque event activé a au moins 1 élément HTML',
    critical: true,
    check: async (ctx) => {
      if (!ctx.expectedDataTrackValues || ctx.expectedDataTrackValues.size === 0) {
        return false;
      }

      // Scanner tous les fichiers HTML/templates
      const htmlFiles = await glob('**/*.{html,ejs,hbs,pug,php,jsx,tsx,vue}', {
        cwd: ctx.projectPath,
        ignore: IGNORE_PATTERNS
      });

      const foundValues = new Set();
      let totalCount = 0;

      for (const file of htmlFiles) {
        const content = readFileSync(join(ctx.projectPath, file), 'utf8');
        const matches = content.match(/data-track=["']([^"']+)["']/g);
        if (matches) {
          totalCount += matches.length;
          matches.forEach(m => {
            const value = m.match(/["']([^"']+)["']/)[1];
            foundValues.add(value);
          });
        }
      }

      ctx.dataTrackCount = totalCount;
      ctx.dataTrackValues = [...foundValues];

      // Comparer avec les events activés
      const expected = [...ctx.expectedDataTrackValues];
      const missing = expected.filter(e => {
        // Normaliser pour comparaison (cta-primary vs cta_primary)
        const normalized = e.replace(/-/g, '_');
        return ![...foundValues].some(f =>
          f === e || f.replace(/-/g, '_') === normalized || f === e.replace(/_/g, '-')
        );
      });

      ctx.missingDataTrack = missing;
      ctx.matchedDataTrack = expected.length - missing.length;

      // OK si au moins 80% des events ont leur data-track
      const coverage = ctx.matchedDataTrack / expected.length;
      ctx.dataTrackCoverage = Math.round(coverage * 100);

      return coverage >= 0.8;
    },
    fix: '/track-html-elements (Claude Code) ou google-setup html-layer'
  },

  // ═══════════════════════════════════════════════════════════════
  // PRODUCTION READY
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'no_placeholder_ids',
    name: 'Pas d\'IDs placeholder',
    category: CATEGORY.PROD,
    description: 'Vrais IDs GA4 et GTM (pas XXXX)',
    critical: true,
    check: (ctx) => {
      const ga4Valid = ctx.ga4Id && !ctx.ga4Id.includes('XXXX');
      const gtmValid = ctx.gtmId && !ctx.gtmId.includes('XXXX');
      return ga4Valid && gtmValid;
    },
    fix: 'Remplacez les IDs placeholder par vos vrais IDs GA4 et GTM'
  },
  {
    id: 'webpack_config_exists',
    name: 'Config webpack/bundler',
    category: CATEGORY.PROD,
    description: 'webpack.config.js ou vite.config.js présent',
    critical: false, // Warning seulement
    check: async (ctx) => {
      const bundlerConfigs = [
        'webpack.config.js', 'webpack.config.ts',
        'vite.config.js', 'vite.config.ts',
        'rollup.config.js', 'rollup.config.ts',
        'esbuild.config.js', 'parcel.config.js',
        'next.config.js', 'nuxt.config.js'
      ];

      for (const config of bundlerConfigs) {
        if (existsSync(join(ctx.projectPath, config))) {
          ctx.bundlerConfig = config;
          return true;
        }
      }

      // Vérifier package.json pour scripts de build
      const pkgPath = join(ctx.projectPath, 'package.json');
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
          if (pkg.scripts?.build) {
            ctx.bundlerConfig = 'package.json (build script)';
            return true;
          }
        } catch (e) {}
      }

      return false;
    },
    fix: 'Ajoutez webpack/vite si vous utilisez un bundler (optionnel pour sites statiques)'
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
        console.log(chalk.gray(`      → ${ctx.trackingJsPath}`));
        break;
      case 'tracking_js_in_source_folder':
        console.log(chalk.gray(`      → dossier: ${ctx.trackingJsFolder}`));
        break;
      case 'tracking_js_imported_in_js':
        console.log(chalk.gray(`      → ${ctx.jsImportFiles.join(', ')}`));
        break;
      case 'gtm_snippet_in_html':
        console.log(chalk.gray(`      → ${ctx.gtmSnippetFile}`));
        break;
      case 'data_track_per_event':
        console.log(chalk.gray(`      ${ctx.matchedDataTrack}/${ctx.expectedDataTrackValues.size} events couverts (${ctx.dataTrackCoverage}%)`));
        break;
      case 'webpack_config_exists':
        console.log(chalk.gray(`      → ${ctx.bundlerConfig}`));
        break;
    }
  } else {
    // Détails supplémentaires si échoué
    if (check.id === 'data_track_per_event' && ctx.missingDataTrack?.length > 0) {
      console.log(chalk.gray(`      Manquants: ${ctx.missingDataTrack.slice(0, 5).join(', ')}${ctx.missingDataTrack.length > 5 ? '...' : ''}`));
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
    console.log(chalk.cyan('    2. npm run build            → Builder le projet'));
    console.log(chalk.cyan('    3. firebase deploy          → Déployer le site'));
    console.log(chalk.cyan('    4. Publier le container GTM → GTM > Submit > Publish'));
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
