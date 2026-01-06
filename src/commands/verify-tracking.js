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
  '**/node_modules/**', '.git/**', 'tracking/**',
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
    name: 'Events définis',
    category: CATEGORY.CONFIG,
    description: 'Au moins un event dans tracking-events.yaml',
    critical: true,
    check: (ctx) => {
      const eventsPath = join(ctx.projectPath, 'tracking', 'tracking-events.yaml');
      if (!existsSync(eventsPath)) return false;
      try {
        const content = yaml.load(readFileSync(eventsPath, 'utf8'));
        const events = content.events || [];
        // Tous les events présents sont considérés comme activés
        // (pas besoin de propriété "enabled", présence = activé)
        ctx.enabledEvents = events;
        ctx.enabledEventsCount = events.length;

        // Extraire les valeurs data-track attendues depuis les selectors
        // UNIQUEMENT pour les events qui utilisent un selector avec data-track
        // (exclut scroll, timer, load events qui n'ont pas de data-track)
        ctx.dataTrackToEventName = new Map(); // data-track value → event_name
        ctx.eventNameToDataTrack = new Map(); // event_name → data-track value
        ctx.eventsWithDataTrack = [];
        ctx.eventsWithoutDataTrack = [];

        for (const event of events) {
          if (event.selector) {
            const match = event.selector.match(/data-track=["']([^"']+)["']/);
            if (match) {
              const dataTrackValue = match[1];
              ctx.dataTrackToEventName.set(dataTrackValue, event.event_name);
              ctx.eventNameToDataTrack.set(event.event_name, dataTrackValue);
              ctx.eventsWithDataTrack.push(event.event_name);
            } else {
              // Event avec selector mais sans data-track (ex: body.error-404)
              ctx.eventsWithoutDataTrack.push(event.event_name);
            }
          } else {
            // Event sans selector (scroll, timer)
            ctx.eventsWithoutDataTrack.push(event.event_name);
          }
        }

        return events.length > 0;
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
  {
    id: 'third_party_ids',
    name: 'IDs balises tierces',
    category: CATEGORY.CONFIG,
    description: 'IDs balises tierces configurés (si présents)',
    critical: false, // Warning seulement
    check: (ctx) => {
      const configPath = join(ctx.projectPath, '.google-setup.json');
      if (!existsSync(configPath)) {
        ctx.thirdPartyCount = 0;
        return true; // Pas de config = OK
      }

      try {
        const config = JSON.parse(readFileSync(configPath, 'utf8'));
        const thirdParty = config.thirdParty || {};
        ctx.thirdPartyTags = [];
        ctx.invalidThirdPartyTags = [];

        for (const [configKey, value] of Object.entries(thirdParty)) {
          // Vérifier simplement que l'ID n'est pas vide
          const isValid = value && value.length > 0;
          ctx.thirdPartyTags.push({ name: configKey, value, valid: isValid });
          if (!isValid) {
            ctx.invalidThirdPartyTags.push({ name: configKey, value, error: 'ID vide' });
          }
        }

        ctx.thirdPartyCount = ctx.thirdPartyTags.length;
        return ctx.invalidThirdPartyTags.length === 0;
      } catch (e) {
        ctx.thirdPartyCount = 0;
        return true;
      }
    },
    fix: 'Vérifiez les IDs dans .google-setup.json (thirdParty section)'
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
      if (!ctx.dataTrackToEventName || ctx.dataTrackToEventName.size === 0) {
        // Pas d'events avec data-track = OK (scroll, timer only)
        ctx.dataTrackCoverage = 100;
        ctx.matchedDataTrack = 0;
        ctx.missingEvents = [];
        ctx.optionalEvents = [];
        return true;
      }

      // Events facultatifs (injectés par JS, non vérifiables dans HTML statique)
      // Pattern basé sur le NOM de l'event (event_name)
      const OPTIONAL_EVENT_PATTERNS = [
        /^cookie_/i,  // cookie_accept, cookie_reject, etc.
      ];

      const isOptionalEvent = (eventName) => OPTIONAL_EVENT_PATTERNS.some(p => p.test(eventName));

      // Scanner tous les fichiers HTML/templates
      const htmlFiles = await glob('**/*.{html,ejs,hbs,pug,php,jsx,tsx,vue}', {
        cwd: ctx.projectPath,
        ignore: IGNORE_PATTERNS
      });

      const foundDataTrackValues = new Set();
      let totalCount = 0;

      for (const file of htmlFiles) {
        const content = readFileSync(join(ctx.projectPath, file), 'utf8');
        const matches = content.match(/data-track=["']([^"']+)["']/g);
        if (matches) {
          totalCount += matches.length;
          matches.forEach(m => {
            const value = m.match(/["']([^"']+)["']/)[1];
            foundDataTrackValues.add(value);
          });
        }
      }

      ctx.dataTrackCount = totalCount;
      ctx.foundDataTrackValues = [...foundDataTrackValues];

      // Fonction pour vérifier si un data-track value est trouvé dans le HTML
      const isDataTrackFound = (dataTrackValue) => {
        const normalized = dataTrackValue.replace(/-/g, '_');
        return [...foundDataTrackValues].some(f =>
          f === dataTrackValue ||
          f.replace(/-/g, '_') === normalized ||
          f === dataTrackValue.replace(/_/g, '-')
        );
      };

      // Séparer les events en obligatoires et facultatifs (par nom d'event)
      const allEventNames = ctx.eventsWithDataTrack;
      const requiredEvents = allEventNames.filter(e => !isOptionalEvent(e));
      const optionalEventsList = allEventNames.filter(e => isOptionalEvent(e));

      // Trouver les events OBLIGATOIRES dont le data-track est manquant
      const missingEvents = requiredEvents.filter(eventName => {
        const dataTrackValue = ctx.eventNameToDataTrack.get(eventName);
        return !isDataTrackFound(dataTrackValue);
      });

      // Trouver les events FACULTATIFS dont le data-track est manquant
      const optionalMissingEvents = optionalEventsList.filter(eventName => {
        const dataTrackValue = ctx.eventNameToDataTrack.get(eventName);
        return !isDataTrackFound(dataTrackValue);
      });

      ctx.missingEvents = missingEvents;
      ctx.optionalEvents = optionalMissingEvents;
      ctx.requiredEventsCount = requiredEvents.length;
      ctx.matchedEventsCount = requiredEvents.length - missingEvents.length;

      // Calculer la couverture sur les OBLIGATOIRES uniquement
      if (requiredEvents.length === 0) {
        ctx.dataTrackCoverage = 100;
      } else {
        const coverage = ctx.matchedEventsCount / requiredEvents.length;
        ctx.dataTrackCoverage = Math.round(coverage * 100);
      }

      // OK si 100% des events OBLIGATOIRES ont leur data-track
      return missingEvents.length === 0;
    },
    fix: 'Ajoutez les data-track manquants dans votre HTML ou supprimez les events non utilisés de tracking-events.yaml'
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
        console.log(chalk.gray(`      ${ctx.enabledEventsCount} events définis`));
        break;
      case 'gtm_config':
        console.log(chalk.gray(`      ${ctx.gtmTags} tags, ${ctx.gtmTriggers} triggers`));
        break;
      case 'third_party_ids':
        if (ctx.thirdPartyCount > 0) {
          const names = ctx.thirdPartyTags.map(t => t.name).join(', ');
          console.log(chalk.gray(`      ${ctx.thirdPartyCount} balise(s): ${names}`));
        } else {
          console.log(chalk.gray(`      Aucune balise tierce configurée`));
        }
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
        console.log(chalk.gray(`      ${ctx.matchedEventsCount}/${ctx.requiredEventsCount} events obligatoires couverts (${ctx.dataTrackCoverage}%)`));
        if (ctx.optionalEvents?.length > 0) {
          console.log(chalk.hex('#FFA500')(`      ○ Non vérifiables (${ctx.optionalEvents.length}): ${ctx.optionalEvents.join(', ')}`));
          console.log(chalk.gray(`        → Probablement injectés par JavaScript (cookies, etc.)`));
        }
        break;
      case 'webpack_config_exists':
        console.log(chalk.gray(`      → ${ctx.bundlerConfig}`));
        break;
    }
  } else {
    // Détails supplémentaires si échoué
    switch (check.id) {
      case 'data_track_per_event':
        if (ctx.foundDataTrackValues?.length > 0) {
          console.log(chalk.gray(`      Trouvés dans HTML (${ctx.foundDataTrackValues.length}): ${ctx.foundDataTrackValues.join(', ')}`));
        }
        if (ctx.missingEvents?.length > 0) {
          console.log(chalk.red(`      ✗ Manquants (${ctx.missingEvents.length}): ${ctx.missingEvents.join(', ')}`));
        }
        if (ctx.optionalEvents?.length > 0) {
          console.log(chalk.hex('#FFA500')(`      ○ Non vérifiables (${ctx.optionalEvents.length}): ${ctx.optionalEvents.join(', ')}`));
          console.log(chalk.gray(`        → Probablement injectés par JavaScript (cookies, etc.)`));
        }
        break;

      case 'tracking_events':
      case 'tracking_rules':
      case 'gtm_config':
        console.log(chalk.gray(`      Fichier non trouvé dans tracking/`));
        break;

      case 'ga4_id_valid':
        if (ctx.ga4Id) {
          console.log(chalk.gray(`      Valeur actuelle: "${ctx.ga4Id}" (format attendu: G-XXXXXXXXXX)`));
        } else {
          console.log(chalk.gray(`      Aucun GA4 ID défini dans tracking-events.yaml`));
        }
        break;

      case 'gtm_id_valid':
        if (ctx.gtmId) {
          console.log(chalk.gray(`      Valeur actuelle: "${ctx.gtmId}" (format attendu: GTM-XXXXXXX)`));
        } else {
          console.log(chalk.gray(`      Aucun GTM ID défini dans tracking-events.yaml`));
        }
        break;

      case 'events_enabled':
        console.log(chalk.gray(`      Aucun event trouvé dans tracking-events.yaml`));
        break;

      case 'tracking_js_exists':
        console.log(chalk.gray(`      Aucun fichier tracking.js trouvé dans le projet`));
        console.log(chalk.gray(`      Dossiers scannés: ${SOURCE_FOLDERS.join(', ')}`));
        break;

      case 'tracking_js_in_source_folder':
        if (ctx.trackingJsPath) {
          console.log(chalk.gray(`      Trouvé dans: ${ctx.trackingJsPath}`));
          console.log(chalk.gray(`      Dossiers sources attendus: ${SOURCE_FOLDERS.join(', ')}`));
        }
        break;

      case 'tracking_js_imported_in_js':
        console.log(chalk.gray(`      Aucun import de tracking.js trouvé dans main.js/app.js/index.js`));
        break;

      case 'gtm_snippet_in_html':
        console.log(chalk.gray(`      Aucun snippet GTM (googletagmanager.com/gtm.js) trouvé`));
        console.log(chalk.gray(`      Vérifiez vos fichiers HTML ou templates`));
        break;

      case 'gtm_snippet_correct_id':
        if (ctx.gtmSnippetFile) {
          console.log(chalk.gray(`      Snippet trouvé dans: ${ctx.gtmSnippetFile}`));
          console.log(chalk.gray(`      Mais le GTM ID (${ctx.gtmId}) n'y est pas présent`));
        }
        break;

      case 'third_party_ids':
        if (ctx.invalidThirdPartyTags?.length > 0) {
          for (const tag of ctx.invalidThirdPartyTags) {
            console.log(chalk.yellow(`      ○ ${tag.name}: "${tag.value}"`));
            console.log(chalk.gray(`        → ${tag.error}`));
          }
        }
        break;

      case 'no_placeholder_ids':
        if (ctx.ga4Id?.includes('XXXX')) {
          console.log(chalk.gray(`      GA4 ID placeholder: ${ctx.ga4Id}`));
        }
        if (ctx.gtmId?.includes('XXXX')) {
          console.log(chalk.gray(`      GTM ID placeholder: ${ctx.gtmId}`));
        }
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
  console.log(chalk.cyan.bold('🔍 [Étape 6/8] Vérification Tracking - Production Ready'));
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
    console.log(chalk.cyan('    1. google-setup create-gtm-container → Créer le conteneur GTM'));
    console.log(chalk.cyan('    2. npm run build                     → Builder le projet'));
    console.log(chalk.cyan('    3. firebase deploy                   → Déployer le site'));
    console.log(chalk.cyan('    4. google-setup publish              → Publier GTM en production'));
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
