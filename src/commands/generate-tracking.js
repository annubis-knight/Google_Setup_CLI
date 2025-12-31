/**
 * Commande generate-tracking (Étape 4/6)
 * Génère tracking.js à partir de tracking-events.yaml
 *
 * Lit les events définis dans tracking-events.yaml et génère un fichier
 * JavaScript côté client qui écoute les événements DOM et pousse vers dataLayer.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import yaml from 'js-yaml';

/**
 * Échappe les guillemets simples dans un sélecteur pour l'utiliser dans une chaîne JS
 */
function escapeSelector(selector) {
  // Remplacer les guillemets simples par des guillemets doubles échappés
  return selector.replace(/'/g, "\\'");
}

/**
 * Génère le code JS pour un event de type click/submit/change
 */
function generateDomEventCode(event) {
  const { event_name, trigger, selector, description } = event;
  const escapedSelector = escapeSelector(selector);
  const comment = description ? `${event_name} - ${description}` : event_name;
  return `
    // ${comment}
    document.querySelectorAll('${escapedSelector}').forEach(function(el) {
      el.addEventListener('${trigger}', function(e) {
        pushEvent('${event_name}', this);
      });
    });`;
}

/**
 * Collecte les scroll events pour génération optimisée
 * @param {Array} events - Liste des events de type scroll
 * @returns {string} Code JS optimisé avec un seul listener
 */
function generateScrollEventsCode(events) {
  if (events.length === 0) return '';

  // Construire l'objet des thresholds
  const thresholds = events.map(e => ({
    threshold: e.threshold || 50,
    event_name: e.event_name
  }));

  // Trier par threshold croissant pour optimiser les vérifications
  thresholds.sort((a, b) => a.threshold - b.threshold);

  const thresholdsObj = thresholds
    .map(t => `      ${t.threshold}: { triggered: false, event: '${t.event_name}' }`)
    .join(',\n');

  return `
    // Scroll tracking (optimisé: un seul listener)
    (function() {
      var thresholds = {
${thresholdsObj}
      };
      window.addEventListener('scroll', function() {
        var scrollPercent = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
        for (var t in thresholds) {
          if (!thresholds[t].triggered && scrollPercent >= t) {
            thresholds[t].triggered = true;
            pushEvent(thresholds[t].event, document.body);
          }
        }
      });
    })();`;
}

/**
 * Collecte les timer events pour génération optimisée avec visibilityState
 * @param {Array} events - Liste des events de type timer
 * @returns {string} Code JS optimisé qui pause quand l'onglet est inactif
 */
function generateTimerEventsCode(events) {
  if (events.length === 0) return '';

  // Construire les timers
  const timers = events.map(e => ({
    delay: e.delay || 30,
    event_name: e.event_name
  }));

  // Trier par delay croissant
  timers.sort((a, b) => a.delay - b.delay);

  const timersObj = timers
    .map(t => `      { delay: ${t.delay}, event: '${t.event_name}', triggered: false }`)
    .join(',\n');

  return `
    // Timer tracking (pause quand onglet inactif)
    (function() {
      var timers = [
${timersObj}
      ];
      var startTime = Date.now();
      var pausedTime = 0;
      var isPaused = document.hidden;

      document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
          isPaused = true;
          pausedTime = Date.now();
        } else {
          isPaused = false;
          startTime += (Date.now() - pausedTime);
        }
      });

      setInterval(function() {
        if (isPaused) return;
        var elapsed = (Date.now() - startTime) / 1000;
        for (var i = 0; i < timers.length; i++) {
          if (!timers[i].triggered && elapsed >= timers[i].delay) {
            timers[i].triggered = true;
            pushEvent(timers[i].event, document.body);
          }
        }
      }, 1000);
    })();`;
}

/**
 * Génère le code JS pour un event de type load
 */
function generateLoadEventCode(event) {
  const { event_name, selector, description } = event;
  const comment = description ? `${event_name} - ${description}` : event_name;
  if (selector) {
    const escapedSelector = escapeSelector(selector);
    return `
    // ${comment} (on load)
    document.querySelectorAll('${escapedSelector}').forEach(function(el) {
      pushEvent('${event_name}', el);
    });`;
  }
  return `
    // ${comment} (page load)
    pushEvent('${event_name}', document.body);`;
}

/**
 * Génère le code JS pour un event selon son type de trigger
 * Note: scroll et timer sont traités en groupe par generateTrackingJs
 */
function generateEventCode(event) {
  const { trigger } = event;

  switch (trigger) {
    case 'click':
    case 'submit':
    case 'change':
      return generateDomEventCode(event);
    case 'load':
      return generateLoadEventCode(event);
    default:
      // Par défaut, traiter comme un événement DOM
      return generateDomEventCode(event);
  }
}

/**
 * Génère le fichier tracking.js complet
 */
function generateTrackingJs(projectInfo, events) {
  const date = new Date().toISOString().split('T')[0];
  const projectName = projectInfo?.name || 'Projet';

  // Séparer les events par type spécial (scroll, timer) vs standard
  const scrollEvents = events.filter(e => e.trigger === 'scroll');
  const timerEvents = events.filter(e => e.trigger === 'timer');
  const standardEvents = events.filter(e => e.trigger !== 'scroll' && e.trigger !== 'timer');

  // Grouper les events standard par catégorie
  const eventsByCategory = {};
  for (const event of standardEvents) {
    const cat = event.category || 'engagement';
    if (!eventsByCategory[cat]) eventsByCategory[cat] = [];
    eventsByCategory[cat].push(event);
  }

  // Header
  let code = `/**
 * Tracking DataLayer - ${projectName}
 * ===========================================
 *
 * AUTO-GÉNÉRÉ - NE PAS MODIFIER MANUELLEMENT
 *
 * Source: tracking-events.yaml
 * Commande: google-setup generate-tracking
 * Date: ${date}
 * Events: ${events.length}
 *
 * Pour modifier, éditez tracking-events.yaml
 * puis relancez: google-setup generate-tracking
 */

(function() {
  'use strict';

  // Initialiser dataLayer
  window.dataLayer = window.dataLayer || [];

  /**
   * Pousse un événement vers dataLayer
   * @param {string} eventName - Nom de l'événement
   * @param {HTMLElement} element - Élément déclencheur
   */
  function pushEvent(eventName, element) {
    window.dataLayer.push({
      'event': eventName,
      'element_id': element?.dataset?.trackId || element?.id || 'unknown',
      'page_section': element?.closest('section[id]')?.id || 'unknown',
      'page_path': window.location.pathname
    });
  }

  // Attendre que le DOM soit prêt
  document.addEventListener('DOMContentLoaded', function() {
`;

  // Générer le code pour chaque catégorie (events standard)
  const categoryOrder = ['conversion', 'lead', 'engagement', 'navigation'];
  const categoryLabels = {
    conversion: 'CONVERSIONS',
    lead: 'LEADS',
    engagement: 'ENGAGEMENT',
    navigation: 'NAVIGATION'
  };

  for (const category of categoryOrder) {
    const catEvents = eventsByCategory[category] || [];
    if (catEvents.length === 0) continue;

    code += `
    // ============================================
    // ${categoryLabels[category]}
    // ============================================`;

    for (const event of catEvents) {
      code += generateEventCode(event);
    }
  }

  // Ajouter scroll tracking optimisé (un seul listener)
  if (scrollEvents.length > 0) {
    code += `
    // ============================================
    // SCROLL TRACKING
    // ============================================`;
    code += generateScrollEventsCode(scrollEvents);
  }

  // Ajouter timer tracking optimisé (avec visibilityState)
  if (timerEvents.length > 0) {
    code += `
    // ============================================
    // TIME ON PAGE TRACKING
    // ============================================`;
    code += generateTimerEventsCode(timerEvents);
  }

  // Footer
  code += `

  });
})();
`;

  return code;
}

/**
 * Commande principale generate-tracking
 */
export async function runGenerateTracking(options) {
  const projectPath = options.path || process.cwd();
  const inputPath = join(projectPath, 'tracking', 'tracking-events.yaml');
  const outputPath = join(projectPath, 'tracking', 'tracking.js');

  console.log();
  console.log(chalk.cyan.bold('📜 [Étape 4/6] Génération de tracking.js'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log();

  // Vérifier que le fichier source existe
  if (!existsSync(inputPath)) {
    console.log(chalk.red('✗ Fichier tracking-events.yaml non trouvé.'));
    console.log(chalk.gray('  Lancez d\'abord: google-setup init-tracking'));
    return;
  }

  // Lire et parser le fichier source
  console.log(chalk.gray('   Lecture de tracking-events.yaml...'));
  const yamlContent = readFileSync(inputPath, 'utf8');
  const parsed = yaml.load(yamlContent);

  if (!parsed.events || parsed.events.length === 0) {
    console.log(chalk.red('✗ Aucun event trouvé dans tracking-events.yaml'));
    console.log(chalk.gray('  Lancez: google-setup event-setup pour configurer les events'));
    return;
  }

  // Compter les events par type de trigger
  const triggerCounts = {};
  for (const event of parsed.events) {
    const t = event.trigger || 'click';
    triggerCounts[t] = (triggerCounts[t] || 0) + 1;
  }

  console.log(chalk.gray(`   ${parsed.events.length} events trouvés`));
  for (const [trigger, count] of Object.entries(triggerCounts)) {
    console.log(chalk.gray(`     • ${trigger}: ${count}`));
  }

  // Générer le code JS
  console.log(chalk.gray('   Génération du code JavaScript...'));
  const jsCode = generateTrackingJs(parsed.project || {}, parsed.events);

  // Sauvegarder
  writeFileSync(outputPath, jsCode);

  // Stats par catégorie
  const categoryStats = {};
  for (const event of parsed.events) {
    const cat = event.category || 'engagement';
    categoryStats[cat] = (categoryStats[cat] || 0) + 1;
  }

  console.log();
  console.log(chalk.green.bold('✅ tracking.js généré !'));
  console.log();
  console.log(chalk.white('   Fichier: tracking/tracking.js'));
  console.log(chalk.gray(`   • ${parsed.events.length} événements configurés`));
  for (const [cat, count] of Object.entries(categoryStats)) {
    console.log(chalk.gray(`     - ${cat}: ${count}`));
  }
  console.log();
  console.log(chalk.white('Intégration dans votre HTML :'));
  console.log(chalk.gray('   <script src="/tracking/tracking.js"></script>'));
  console.log();
  console.log(chalk.white('Prochaine étape :'));
  console.log(chalk.gray('   [Étape 5] google-setup deploy → Déployer dans GTM'));
  console.log();
}

/**
 * Mode interactif
 */
export async function handleGenerateTrackingInteractive() {
  await runGenerateTracking({ path: process.cwd() });
}
