/**
 * Commande html-layer (Étape 5)
 * Ajoute les attributs data-track aux éléments HTML
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join, extname, relative } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import yaml from 'js-yaml';
import * as cheerio from 'cheerio';

/**
 * Structure pour le rapport de debug
 */
function createDebugReport() {
  return {
    timestamp: new Date().toISOString(),
    summary: {
      eventsProcessed: 0,
      eventsMatched: 0,
      eventsNotMatched: 0,
      elementsModified: 0,
      filesModified: 0
    },
    events: [],
    files: {}
  };
}

/**
 * Trouve tous les fichiers HTML dans un répertoire
 */
function findHtmlFiles(dir, excludeDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'vendor']) {
  const files = [];

  function scan(currentDir) {
    const items = readdirSync(currentDir);
    for (const item of items) {
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        if (!excludeDirs.includes(item)) {
          scan(fullPath);
        }
      } else if (extname(item).toLowerCase() === '.html') {
        files.push(fullPath);
      }
    }
  }

  scan(dir);
  return files;
}

/**
 * Extrait l'attribut data-track attendu du sélecteur
 */
function extractDataTrackValue(selector) {
  // Patterns possibles:
  // [data-track='value'] -> value
  // [data-track="value"] -> value
  // form[data-track='value'] -> value
  const match = selector.match(/\[data-track=['"]([^'"]+)['"]\]/);
  return match ? match[1] : null;
}

/**
 * Génère un hash court (4 caractères) à partir d'une chaîne
 * @param {string} str - Chaîne à hasher
 * @returns {string} Hash de 4 caractères hexadécimaux
 */
function shortHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).substring(0, 4).padStart(4, '0');
}

/**
 * Génère un data-track-id unique pour un élément
 * Format: {section}_{dataTrack}_{hash}
 * @param {cheerio} $ - Instance cheerio
 * @param {cheerio.Element} element - Élément cheerio
 * @param {string} dataTrackValue - Valeur de data-track
 * @param {number} index - Index de l'élément dans la page
 * @returns {string} Identifiant unique généré
 */
function generateDataTrackId($, element, dataTrackValue, index) {
  const $el = $(element);

  // 1. Trouver la section parent avec un id
  const sectionId = $el.closest('section[id]').attr('id') || 'main';

  // 2. Générer un hash basé sur le contenu unique de l'élément
  const uniqueContent = [
    $el.text().trim().substring(0, 50),
    $el.attr('href') || '',
    $el.attr('class') || '',
    index.toString()
  ].join('|');
  const hash = shortHash(uniqueContent);

  // 3. Construire l'identifiant
  return `${sectionId}_${dataTrackValue}_${hash}`;
}

/**
 * Détermine le type d'élément à chercher selon le trigger
 */
function getElementHints(event) {
  const hints = {
    suggestedTags: [],
    description: ''
  };

  switch (event.trigger) {
    case 'submit':
      hints.suggestedTags = ['form'];
      hints.description = 'formulaire';
      break;
    case 'click':
      if (event.event_name.includes('phone')) {
        hints.suggestedTags = ['a[href^="tel:"]'];
        hints.description = 'lien téléphone';
      } else if (event.event_name.includes('email')) {
        hints.suggestedTags = ['a[href^="mailto:"]'];
        hints.description = 'lien email';
      } else if (event.event_name.includes('cta')) {
        hints.suggestedTags = ['button', 'a.btn', 'a.button', '.cta', '[class*="cta"]', '[class*="btn"]'];
        hints.description = 'bouton CTA';
      } else if (event.event_name.includes('video')) {
        hints.suggestedTags = ['video', 'iframe[src*="youtube"]', 'iframe[src*="vimeo"]', '[class*="video"]'];
        hints.description = 'lecteur vidéo';
      } else if (event.event_name.includes('menu')) {
        hints.suggestedTags = ['nav a', 'header a', '.menu a', '.nav a'];
        hints.description = 'lien de navigation';
      } else if (event.event_name.includes('footer')) {
        hints.suggestedTags = ['footer a'];
        hints.description = 'lien du footer';
      } else if (event.event_name.includes('logo')) {
        hints.suggestedTags = ['.logo', '[class*="logo"]', 'header a:first-child'];
        hints.description = 'logo';
      } else if (event.event_name.includes('social')) {
        hints.suggestedTags = ['[class*="social"] a', 'a[href*="facebook"]', 'a[href*="linkedin"]', 'a[href*="twitter"]', 'a[href*="instagram"]'];
        hints.description = 'lien réseau social';
      } else if (event.event_name.includes('download')) {
        hints.suggestedTags = ['a[href$=".pdf"]', 'a[href$=".doc"]', 'a[download]', '[class*="download"]'];
        hints.description = 'lien de téléchargement';
      } else if (event.event_name.includes('accordion') || event.event_name.includes('faq')) {
        hints.suggestedTags = ['[class*="accordion"]', '[class*="faq"]', 'details summary'];
        hints.description = 'accordéon/FAQ';
      } else if (event.event_name.includes('tab')) {
        hints.suggestedTags = ['[class*="tab"]', '[role="tab"]'];
        hints.description = 'onglet';
      } else if (event.event_name.includes('modal')) {
        hints.suggestedTags = ['[data-toggle="modal"]', '[class*="modal-trigger"]', 'button[class*="open"]'];
        hints.description = 'déclencheur de modale';
      } else if (event.event_name.includes('gallery')) {
        hints.suggestedTags = ['[class*="gallery"]', '[class*="lightbox"]', '.gallery img'];
        hints.description = 'galerie d\'images';
      } else if (event.event_name.includes('share')) {
        hints.suggestedTags = ['[class*="share"]', 'a[href*="share"]'];
        hints.description = 'bouton de partage';
      } else if (event.event_name.includes('cookie')) {
        hints.suggestedTags = ['[class*="cookie"]', '[id*="cookie"]', '[class*="consent"]'];
        hints.description = 'bouton cookie';
      } else if (event.event_name.includes('whatsapp')) {
        hints.suggestedTags = ['a[href*="whatsapp"]', 'a[href*="wa.me"]', '[class*="whatsapp"]', '[id*="whatsapp"]'];
        hints.description = 'lien WhatsApp';
      } else if (event.event_name.includes('messenger')) {
        hints.suggestedTags = ['a[href*="messenger"]', 'a[href*="m.me"]', '[class*="messenger"]'];
        hints.description = 'lien Messenger';
      } else if (event.event_name.includes('chat')) {
        hints.suggestedTags = ['[class*="chat"]', '[id*="chat"]', '[class*="livechat"]'];
        hints.description = 'widget chat';
      } else if (event.event_name.includes('calendly') || event.event_name.includes('booking') || event.event_name.includes('rdv')) {
        hints.suggestedTags = ['a[href*="calendly"]', '[class*="calendly"]', '[class*="booking"]', '[class*="rdv"]'];
        hints.description = 'lien de réservation';
      } else {
        // Fallback : aucune suggestion automatique, forcer sélecteur manuel
        hints.suggestedTags = [];
        hints.description = 'élément non reconnu (sélecteur manuel requis)';
      }
      break;
    case 'change':
      hints.suggestedTags = ['select', 'input[type="checkbox"]', 'input[type="radio"]', '[class*="filter"]'];
      hints.description = 'champ de sélection';
      break;
    case 'load':
      hints.suggestedTags = ['body', 'main', '[class*="error"]', '[class*="404"]'];
      hints.description = 'page/section';
      break;
    default:
      hints.suggestedTags = [];
      hints.description = 'élément';
  }

  return hints;
}

/**
 * Cherche les éléments correspondants dans le HTML
 */
function findMatchingElements($, hints, limit = 10) {
  const matches = [];

  for (const selector of hints.suggestedTags) {
    try {
      $(selector).each((i, el) => {
        if (matches.length >= limit) return false;

        const $el = $(el);
        // Ignorer les éléments déjà marqués
        if ($el.attr('data-track')) return;

        const tag = el.tagName.toLowerCase();
        const id = $el.attr('id') || '';
        const classes = $el.attr('class') || '';
        const text = $el.text().trim().substring(0, 50);
        const href = $el.attr('href') || '';

        // Créer un identifiant unique pour l'élément
        const identifier = id || (classes ? `.${classes.split(' ')[0]}` : '') || text || href;

        matches.push({
          selector,
          tag,
          id,
          classes,
          text,
          href,
          identifier,
          element: $el
        });
      });
    } catch (e) {
      // Ignorer les sélecteurs invalides
    }
  }

  return matches;
}

/**
 * Commande principale html-layer
 */
export async function runHtmlLayer(options) {
  const projectPath = options.path || process.cwd();
  const sourcePath = options.source || projectPath;
  const yamlPath = join(projectPath, 'tracking', 'tracking-events.yaml');
  const debugMode = options.debug || false;

  // Initialiser le rapport de debug
  const report = createDebugReport();
  report.config = { projectPath, sourcePath, debugMode };

  console.log();
  console.log(chalk.cyan.bold('🏷️  [Étape 5/8] Ajout des Attributs HTML'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log();

  // Vérifier que le fichier tracking existe
  if (!existsSync(yamlPath)) {
    console.log(chalk.red('✗ Fichier tracking-events.yaml non trouvé.'));
    console.log(chalk.gray('  Lancez d\'abord: google-setup init-tracking'));
    return;
  }

  // Lire les events
  const yamlContent = readFileSync(yamlPath, 'utf8');
  const parsed = yaml.load(yamlContent);

  if (!parsed.events || parsed.events.length === 0) {
    console.log(chalk.red('✗ Aucun event configuré.'));
    return;
  }

  // Filtrer les events qui ont un sélecteur data-track
  const eventsWithDataTrack = parsed.events.filter(e => {
    return e.selector && e.selector.includes('data-track');
  });

  if (eventsWithDataTrack.length === 0) {
    console.log(chalk.yellow('⚠️  Aucun event avec sélecteur data-track trouvé.'));
    return;
  }

  console.log(chalk.gray(`   ${eventsWithDataTrack.length} events nécessitent un attribut data-track`));

  // Scanner les fichiers HTML
  console.log(chalk.gray(`   Scan des fichiers HTML dans: ${sourcePath}`));
  const htmlFiles = findHtmlFiles(sourcePath);
  report.htmlFilesScanned = htmlFiles.map(f => relative(sourcePath, f));

  if (htmlFiles.length === 0) {
    console.log(chalk.yellow('⚠️  Aucun fichier HTML trouvé.'));
    return;
  }

  console.log(chalk.gray(`   ${htmlFiles.length} fichiers HTML trouvés\n`));

  // Charger tous les fichiers HTML
  const htmlContents = {};
  for (const file of htmlFiles) {
    htmlContents[file] = readFileSync(file, 'utf8');
  }

  // Pour chaque event, chercher les éléments correspondants
  const modifications = [];

  for (const event of eventsWithDataTrack) {
    const dataTrackValue = extractDataTrackValue(event.selector);
    if (!dataTrackValue) continue;

    const hints = getElementHints(event);
    report.summary.eventsProcessed++;

    // Préparer l'entrée du rapport pour cet event
    const eventReport = {
      event_name: event.event_name,
      description: event.description || null,
      selector: event.selector,
      dataTrackValue,
      trigger: event.trigger,
      searchedSelectors: hints.suggestedTags,
      elementType: hints.description,
      status: 'pending',
      matchesFound: 0,
      matchesSelected: 0,
      matches: []
    };

    console.log(chalk.cyan(`\n📍 ${event.event_name}`));
    if (event.description) {
      console.log(chalk.white(`   ${event.description}`));
    }
    console.log(chalk.gray(`   Type: ${hints.description}`));
    console.log(chalk.gray(`   Sélecteurs testés: ${hints.suggestedTags.length > 0 ? hints.suggestedTags.join(', ') : '(aucun - sélecteur manuel requis)'}`));
    console.log(chalk.gray(`   Attribut: data-track="${dataTrackValue}"`));

    // Chercher dans tous les fichiers HTML
    const allMatches = [];

    for (const [file, content] of Object.entries(htmlContents)) {
      const $ = cheerio.load(content);
      const matches = findMatchingElements($, hints);

      for (const match of matches) {
        allMatches.push({
          ...match,
          file,
          relativePath: relative(sourcePath, file)
        });
      }
    }

    eventReport.matchesFound = allMatches.length;

    if (allMatches.length === 0) {
      console.log(chalk.yellow(`   ⚠️  Aucun élément trouvé automatiquement`));
      eventReport.status = 'no_match';
      report.summary.eventsNotMatched++;

      const { manualSelector } = await inquirer.prompt([{
        type: 'input',
        name: 'manualSelector',
        message: `   Sélecteur CSS manuel (ou Entrée pour ignorer) :`,
        default: ''
      }]);

      if (manualSelector) {
        eventReport.manualSelector = manualSelector;
        // Chercher avec le sélecteur manuel
        for (const [file, content] of Object.entries(htmlContents)) {
          const $ = cheerio.load(content);
          $(manualSelector).each((i, el) => {
            const $el = $(el);
            if (!$el.attr('data-track')) {
              modifications.push({
                file,
                relativePath: relative(sourcePath, file),
                selector: manualSelector,
                dataTrackValue,
                event: event.event_name
              });
              eventReport.matchesSelected++;
            }
          });
        }
        if (eventReport.matchesSelected > 0) {
          eventReport.status = 'manual_match';
          report.summary.eventsMatched++;
        }
      } else {
        eventReport.status = 'skipped';
      }

      report.events.push(eventReport);
      continue;
    }

    // Afficher les éléments trouvés
    console.log(chalk.green(`   ✓ ${allMatches.length} élément(s) trouvé(s)`));

    // Stocker les détails des matches dans le rapport
    eventReport.matches = allMatches.map(m => ({
      file: m.relativePath,
      tag: m.tag,
      id: m.id,
      classes: m.classes,
      text: m.text?.substring(0, 50),
      href: m.href,
      matchedSelector: m.selector
    }));

    // Créer les choix pour le prompt avec affichage enrichi
    const choices = allMatches.map((match, i) => {
      // Construire un affichage plus informatif
      const lines = [];

      // Ligne 1: Fichier
      lines.push(chalk.cyan(`[${i + 1}] ${match.relativePath}`));

      // Ligne 2: Tag HTML avec attributs clés
      let tagPreview = `    <${match.tag}`;
      if (match.id) tagPreview += ` id="${match.id}"`;
      if (match.classes) tagPreview += ` class="${match.classes.substring(0, 30)}${match.classes.length > 30 ? '...' : ''}"`;
      if (match.href) tagPreview += ` href="${match.href.substring(0, 50)}${match.href.length > 50 ? '...' : ''}"`;
      tagPreview += '>';
      lines.push(chalk.gray(tagPreview));

      // Ligne 3: Texte si présent
      if (match.text && match.text.length > 0) {
        lines.push(chalk.white(`    Texte: "${match.text.substring(0, 60)}${match.text.length > 60 ? '...' : ''}"`));
      }

      return {
        name: lines.join('\n'),
        value: i,
        checked: true,
        short: `${match.relativePath} <${match.tag}>`  // Version courte pour après sélection
      };
    });

    choices.push({ name: chalk.yellow('Aucun (ignorer cet event)'), value: -1 });

    const { selected } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selected',
      message: `   Sélectionnez les éléments à marquer :`,
      choices,
      pageSize: 10
    }]);

    for (const idx of selected) {
      if (idx === -1) continue;
      const match = allMatches[idx];
      modifications.push({
        file: match.file,
        relativePath: match.relativePath,
        element: match.element,
        dataTrackValue,
        event: event.event_name,
        tag: match.tag,
        identifier: match.identifier
      });
      eventReport.matchesSelected++;
    }

    // Finaliser le rapport pour cet event
    if (eventReport.matchesSelected > 0) {
      eventReport.status = 'matched';
      report.summary.eventsMatched++;
    } else {
      eventReport.status = 'skipped';
    }
    report.events.push(eventReport);
  }

  if (modifications.length === 0) {
    console.log(chalk.yellow('\n⚠️  Aucune modification à effectuer.'));

    // Sauvegarder le rapport même si pas de modifications
    const debugDir = join(projectPath, 'tracking', 'debug');
    if (!existsSync(debugDir)) {
      mkdirSync(debugDir, { recursive: true });
    }
    const reportPath = join(debugDir, 'html-layer-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(chalk.gray(`   Rapport: tracking/debug/html-layer-report.json`));
    return;
  }

  // Résumé des modifications
  console.log();
  console.log(chalk.cyan.bold(`📝 ${modifications.length} modifications à effectuer :`));

  const byFile = {};
  for (const mod of modifications) {
    if (!byFile[mod.file]) byFile[mod.file] = [];
    byFile[mod.file].push(mod);
  }

  for (const [file, mods] of Object.entries(byFile)) {
    const relPath = relative(sourcePath, file);
    console.log(chalk.gray(`   ${relPath}: ${mods.length} élément(s)`));
  }

  // Confirmation
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'Appliquer les modifications ?',
    default: true
  }]);

  if (!confirm) {
    console.log(chalk.gray('\nOpération annulée.'));
    return;
  }

  // Appliquer les modifications
  let modifiedFiles = 0;
  let dataTrackIdCount = 0;

  for (const [file, mods] of Object.entries(byFile)) {
    let content = htmlContents[file];
    const $ = cheerio.load(content, { decodeEntities: false });
    const relPath = relative(sourcePath, file);

    // Initialiser l'entrée du fichier dans le rapport
    report.files[relPath] = { modifications: [] };

    for (let i = 0; i < mods.length; i++) {
      const mod = mods[i];
      if (mod.element) {
        // Ajouter data-track
        mod.element.attr('data-track', mod.dataTrackValue);

        // Générer et ajouter data-track-id (seulement si pas déjà présent)
        let trackId = mod.element.attr('data-track-id');
        if (!trackId) {
          trackId = generateDataTrackId($, mod.element, mod.dataTrackValue, i);
          mod.element.attr('data-track-id', trackId);
          dataTrackIdCount++;
        }

        // Ajouter au rapport
        report.files[relPath].modifications.push({
          event: mod.event,
          dataTrack: mod.dataTrackValue,
          dataTrackId: trackId,
          tag: mod.tag,
          identifier: mod.identifier
        });
      }
    }

    const newContent = $.html();
    writeFileSync(file, newContent);
    modifiedFiles++;
  }

  // Mettre à jour le résumé
  report.summary.elementsModified = modifications.length;
  report.summary.filesModified = modifiedFiles;

  console.log();
  console.log(chalk.green.bold('✅ Attributs HTML ajoutés !'));
  console.log(chalk.gray(`   ${modifiedFiles} fichier(s) modifié(s)`));
  console.log(chalk.gray(`   ${modifications.length} attribut(s) data-track ajouté(s)`));
  console.log(chalk.gray(`   ${dataTrackIdCount} attribut(s) data-track-id généré(s)`));

  // Sauvegarder le rapport de debug
  const debugDir = join(projectPath, 'tracking', 'debug');
  if (!existsSync(debugDir)) {
    mkdirSync(debugDir, { recursive: true });
  }
  const reportPath = join(debugDir, 'html-layer-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(chalk.gray(`   Rapport: tracking/debug/html-layer-report.json`));

  console.log();
  console.log(chalk.white('Workflow terminé ! Vérifiez vos fichiers HTML.'));
  console.log();
}

/**
 * Mode interactif
 */
export async function handleHtmlLayerInteractive() {
  await runHtmlLayer({});
}
