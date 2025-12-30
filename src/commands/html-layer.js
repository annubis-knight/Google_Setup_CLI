/**
 * Commande html-layer (Étape 5)
 * Ajoute les attributs data-track aux éléments HTML
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import yaml from 'js-yaml';
import * as cheerio from 'cheerio';

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
      } else {
        hints.suggestedTags = ['button', 'a', '[onclick]'];
        hints.description = 'élément cliquable';
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

  console.log();
  console.log(chalk.cyan.bold('🏷️  [Étape 5/5] Ajout des Attributs HTML'));
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

    console.log(chalk.cyan(`\n📍 ${event.event_name}`));
    console.log(chalk.gray(`   Recherche: ${hints.description}`));
    console.log(chalk.gray(`   Attribut à ajouter: data-track="${dataTrackValue}"`));

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

    if (allMatches.length === 0) {
      console.log(chalk.yellow(`   ⚠️  Aucun élément trouvé automatiquement`));

      const { manualSelector } = await inquirer.prompt([{
        type: 'input',
        name: 'manualSelector',
        message: `   Sélecteur CSS manuel (ou Entrée pour ignorer) :`,
        default: ''
      }]);

      if (manualSelector) {
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
            }
          });
        }
      }
      continue;
    }

    // Afficher les éléments trouvés
    console.log(chalk.green(`   ✓ ${allMatches.length} élément(s) trouvé(s)`));

    // Créer les choix pour le prompt
    const choices = allMatches.map((match, i) => {
      const label = `[${match.relativePath}] <${match.tag}> ${match.identifier.substring(0, 40)}`;
      return {
        name: label,
        value: i,
        checked: true
      };
    });

    choices.push({ name: 'Aucun (ignorer cet event)', value: -1 });

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
    }
  }

  if (modifications.length === 0) {
    console.log(chalk.yellow('\n⚠️  Aucune modification à effectuer.'));
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

  for (const [file, mods] of Object.entries(byFile)) {
    let content = htmlContents[file];
    const $ = cheerio.load(content, { decodeEntities: false });

    for (const mod of mods) {
      if (mod.element) {
        mod.element.attr('data-track', mod.dataTrackValue);
      }
    }

    const newContent = $.html();
    writeFileSync(file, newContent);
    modifiedFiles++;
  }

  console.log();
  console.log(chalk.green.bold('✅ Attributs HTML ajoutés !'));
  console.log(chalk.gray(`   ${modifiedFiles} fichier(s) modifié(s)`));
  console.log(chalk.gray(`   ${modifications.length} attribut(s) data-track ajouté(s)`));
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
