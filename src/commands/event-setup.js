/**
 * Commande event-setup (Étape 2)
 * Sélection interactive des events à tracker
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import yaml from 'js-yaml';

/**
 * Parse le fichier YAML et extrait les events
 * Utilise js-yaml pour un parsing fiable
 */
function parseEvents(yamlContent) {
  const parsed = yaml.load(yamlContent);
  return parsed.events || [];
}

/**
 * Regroupe les events par catégorie
 */
function groupByCategory(events) {
  const groups = {};
  for (const event of events) {
    const cat = event.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(event);
  }
  return groups;
}

/**
 * Génère le contenu YAML à partir des events sélectionnés
 */
function generateYamlContent(projectInfo, selectedEvents) {
  let content = `# TRACKING EVENTS - Configuration personnalisée
# google-setup generate-tracking

project:
  name: "${projectInfo.name}"
  gtm_container_id: "${projectInfo.gtm_container_id}"
  ga4_measurement_id: "${projectInfo.ga4_measurement_id}"

events:
`;

  // Grouper par catégorie
  const grouped = groupByCategory(selectedEvents);
  const categoryOrder = ['conversion', 'lead', 'engagement', 'navigation'];

  for (const category of categoryOrder) {
    if (!grouped[category] || grouped[category].length === 0) continue;

    content += `
  # ============================================
  # ${category.toUpperCase()}
  # ============================================
`;

    for (const event of grouped[category]) {
      content += `
  - event_name: "${event.event_name}"`;

      // Description en deuxième position (après event_name)
      if (event.description) {
        content += `
    description: "${event.description}"`;
      }

      content += `
    category: "${event.category}"
    trigger: "${event.trigger}"`;

      if (event.selector) {
        content += `
    selector: "${event.selector}"`;
      }
      if (event.threshold) {
        content += `
    threshold: ${event.threshold}`;
      }
      if (event.delay) {
        content += `
    delay: ${event.delay}`;
      }
      content += '\n';
    }
  }

  return content;
}

/**
 * Prompt pour ajouter un nouvel event personnalisé
 */
async function promptNewEvent() {
  console.log();
  console.log(chalk.cyan('➕ Ajout d\'un nouvel event'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'event_name',
      message: 'Nom de l\'event (snake_case) :',
      validate: v => /^[a-z][a-z0-9_]*$/.test(v) || 'Format snake_case requis (ex: mon_event)'
    },
    {
      type: 'list',
      name: 'category',
      message: 'Catégorie :',
      choices: [
        { name: 'Conversion (formulaires, appels, emails)', value: 'conversion' },
        { name: 'Lead (newsletter, téléchargements)', value: 'lead' },
        { name: 'Engagement (CTAs, vidéos, scroll)', value: 'engagement' },
        { name: 'Navigation (menu, footer, liens)', value: 'navigation' }
      ]
    },
    {
      type: 'list',
      name: 'trigger',
      message: 'Type de trigger :',
      choices: [
        { name: 'click - Clic sur un élément', value: 'click' },
        { name: 'submit - Soumission de formulaire', value: 'submit' },
        { name: 'change - Changement de valeur (select, checkbox)', value: 'change' },
        { name: 'scroll - Scroll à un pourcentage', value: 'scroll' },
        { name: 'timer - Temps passé sur la page', value: 'timer' },
        { name: 'load - Chargement de page', value: 'load' }
      ]
    },
    {
      type: 'input',
      name: 'selector',
      message: 'Sélecteur CSS (ex: [data-track=\'mon-element\']) :',
      when: (ans) => ['click', 'submit', 'change', 'load'].includes(ans.trigger),
      validate: v => v.length > 0 || 'Sélecteur requis'
    },
    {
      type: 'number',
      name: 'threshold',
      message: 'Pourcentage de scroll (1-100) :',
      when: (ans) => ans.trigger === 'scroll',
      validate: v => (v >= 1 && v <= 100) || 'Valeur entre 1 et 100'
    },
    {
      type: 'number',
      name: 'delay',
      message: 'Délai en secondes :',
      when: (ans) => ans.trigger === 'timer',
      validate: v => v > 0 || 'Valeur positive requise'
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description (optionnel) :'
    }
  ]);

  return answers;
}

/**
 * Commande principale event-setup
 */
export async function runEventSetup(options) {
  const projectPath = options.path || process.cwd();
  const yamlPath = join(projectPath, 'tracking', 'tracking-events.yaml');

  console.log();
  console.log(chalk.cyan.bold('🎯 [Étape 2/8] Sélection des Events'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log();

  // Vérifier que le fichier existe
  if (!existsSync(yamlPath)) {
    console.log(chalk.red('✗ Fichier tracking-events.yaml non trouvé.'));
    console.log(chalk.gray('  Lancez d\'abord: google-setup init-tracking'));
    return;
  }

  // Lire et parser le fichier
  const yamlContent = readFileSync(yamlPath, 'utf8');
  const parsed = yaml.load(yamlContent);
  const events = parseEvents(yamlContent);

  console.log(chalk.gray(`   ${events.length} events disponibles dans le template\n`));

  // Grouper par catégorie pour l'affichage
  const grouped = groupByCategory(events);
  const categoryLabels = {
    conversion: '🎯 CONVERSIONS',
    lead: '📧 LEADS',
    engagement: '💡 ENGAGEMENT',
    navigation: '🧭 NAVIGATION'
  };

  // Sélection par catégorie
  const selectedEvents = [];

  for (const [category, label] of Object.entries(categoryLabels)) {
    if (!grouped[category] || grouped[category].length === 0) continue;

    console.log(chalk.cyan.bold(`\n${label}`));

    const choices = grouped[category].map(event => ({
      name: `${event.event_name} - ${event.description || event.selector || ''}`,
      value: event,
      checked: false // Par défaut non sélectionné
    }));

    const { selected } = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selected',
      message: `Sélectionnez les events ${category} (espace pour sélectionner) :`,
      choices,
      pageSize: 15
    }]);

    selectedEvents.push(...selected);
  }

  console.log();
  console.log(chalk.green(`✓ ${selectedEvents.length} events sélectionnés`));

  // Proposer d'ajouter des events personnalisés
  let addMore = true;
  while (addMore) {
    const { wantMore } = await inquirer.prompt([{
      type: 'confirm',
      name: 'wantMore',
      message: 'Voulez-vous ajouter un event personnalisé ?',
      default: false
    }]);

    if (wantMore) {
      const newEvent = await promptNewEvent();
      selectedEvents.push(newEvent);
      console.log(chalk.green(`   ✓ Event "${newEvent.event_name}" ajouté`));
    } else {
      addMore = false;
    }
  }

  // Vérifier qu'on a au moins un event
  if (selectedEvents.length === 0) {
    console.log(chalk.yellow('\n⚠️  Aucun event sélectionné. Opération annulée.'));
    return;
  }

  // Générer le nouveau YAML
  const projectInfo = parsed.project || {};
  const newYamlContent = generateYamlContent(projectInfo, selectedEvents);

  // Sauvegarder
  writeFileSync(yamlPath, newYamlContent);

  console.log();
  console.log(chalk.green.bold('✅ Configuration sauvegardée !'));
  console.log(chalk.gray(`   ${selectedEvents.length} events dans tracking/tracking-events.yaml`));
  console.log();
  console.log(chalk.white('Prochaine étape :'));
  console.log(chalk.gray('   [Étape 3] google-setup gtm-config-setup → Générer la config GTM'));
  console.log();
}

/**
 * Mode interactif
 */
export async function handleEventSetupInteractive() {
  await runEventSetup({});
}
