/**
 * Commande editconfig-auto - Optimise le YAML avec l'aide d'une IA
 * Analyse le gtm-tracking-plan.yml et propose des consolidations d'events
 */

import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import boxen from 'boxen';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import yaml from 'js-yaml';

/**
 * Règles de consolidation prédéfinies
 */
const CONSOLIDATION_RULES = {
  video: {
    pattern: /^video_/,
    events: ['video_start', 'video_progress', 'video_complete', 'video_close', 'video_click', 'video_pause', 'video_resume'],
    consolidatedName: 'video_interaction',
    actionParam: 'video_action',
    description: 'Consolide tous les events vidéo en 1 seul avec paramètre video_action'
  },
  faq: {
    pattern: /^faq_/,
    events: ['faq_open', 'faq_close', 'faq_click', 'faq_expand', 'faq_collapse'],
    consolidatedName: 'faq_interaction',
    actionParam: 'faq_action',
    description: 'Consolide les events FAQ (open/close) en 1 seul'
  },
  modal: {
    pattern: /^modal_/,
    events: ['modal_open', 'modal_close', 'modal_submit', 'modal_view'],
    consolidatedName: 'modal_interaction',
    actionParam: 'modal_action',
    description: 'Consolide les events modal en 1 seul'
  },
  cta: {
    pattern: /cta|button_click/,
    events: ['navbar_cta_click', 'footer_cta_click', 'hero_cta_click', 'sidebar_cta_click', 'button_click', 'cta_click'],
    consolidatedName: 'cta_click',
    actionParam: 'cta_location',
    description: 'Consolide les CTAs par location (navbar, footer, hero...)'
  },
  contact: {
    pattern: /^(email|phone|whatsapp|chat)_click$/,
    events: ['email_click', 'phone_click', 'whatsapp_click', 'chat_click'],
    consolidatedName: 'contact_click',
    actionParam: 'contact_method',
    description: 'Consolide les clics de contact en 1 seul avec paramètre method'
  },
  form: {
    pattern: /^form_step|form_field/,
    events: ['form_step', 'form_field_focus', 'form_field_blur', 'form_validation_error'],
    consolidatedName: 'form_interaction',
    actionParam: 'form_action',
    description: 'Consolide les interactions formulaire (garde form_submit séparé)'
  }
};

/**
 * Analyse le YAML et détecte les opportunités de consolidation
 */
function analyzeYAMLForConsolidation(yamlContent) {
  const config = yaml.load(yamlContent);
  const opportunities = [];
  const eventNames = [];

  // Collecter tous les noms d'events enabled
  for (const event of config.events || []) {
    if (event.enabled === true) {
      const eventName = event.datalayer?.event_name || event.id;
      eventNames.push(eventName);
    }
  }

  // Chercher les opportunités de consolidation
  for (const [ruleId, rule] of Object.entries(CONSOLIDATION_RULES)) {
    const matchingEvents = eventNames.filter(e =>
      rule.events.includes(e) || rule.pattern.test(e)
    );

    if (matchingEvents.length >= 2) {
      opportunities.push({
        ruleId,
        rule,
        matchingEvents,
        saving: matchingEvents.length - 1, // Nombre de tags économisés
        priority: matchingEvents.length > 3 ? 'high' : 'medium'
      });
    }
  }

  // Détecter des patterns personnalisés (events similaires)
  const customPatterns = detectCustomPatterns(eventNames);
  opportunities.push(...customPatterns);

  return {
    totalEvents: eventNames.length,
    opportunities,
    potentialSaving: opportunities.reduce((acc, o) => acc + o.saving, 0)
  };
}

/**
 * Détecte des patterns personnalisés dans les noms d'events
 */
function detectCustomPatterns(eventNames) {
  const patterns = [];
  const prefixGroups = {};

  // Grouper par préfixe commun
  for (const name of eventNames) {
    const parts = name.split('_');
    if (parts.length >= 2) {
      const prefix = parts[0];
      if (!prefixGroups[prefix]) {
        prefixGroups[prefix] = [];
      }
      prefixGroups[prefix].push(name);
    }
  }

  // Trouver les groupes avec 3+ events
  for (const [prefix, events] of Object.entries(prefixGroups)) {
    if (events.length >= 3 && !CONSOLIDATION_RULES[prefix]) {
      patterns.push({
        ruleId: `custom_${prefix}`,
        rule: {
          consolidatedName: `${prefix}_interaction`,
          actionParam: `${prefix}_action`,
          description: `Pattern détecté: ${events.length} events commençant par "${prefix}_"`
        },
        matchingEvents: events,
        saving: events.length - 1,
        priority: 'low',
        isCustom: true
      });
    }
  }

  return patterns;
}

/**
 * Génère le YAML consolidé
 */
function generateConsolidatedYAML(originalConfig, selectedOpportunities) {
  const config = JSON.parse(JSON.stringify(originalConfig)); // Deep clone
  const eventsToRemove = new Set();
  const consolidatedEvents = [];

  for (const opp of selectedOpportunities) {
    // Marquer les events originaux pour suppression
    opp.matchingEvents.forEach(e => eventsToRemove.add(e));

    // Créer l'event consolidé
    const consolidated = {
      id: opp.rule.consolidatedName,
      name: `${opp.rule.consolidatedName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} (Consolidé)`,
      category: 'Consolidated',
      objective: opp.rule.description,
      enabled: true,
      consolidated: true,

      actions: opp.matchingEvents.map(e => ({
        id: e.replace(opp.rule.consolidatedName.split('_')[0] + '_', ''),
        description: `Action: ${e}`
      })),

      datalayer: {
        event_name: opp.rule.consolidatedName,
        params: [
          {
            name: opp.rule.actionParam,
            type: 'string',
            description: 'Type d\'action',
            values: opp.matchingEvents.map(e => e.replace(opp.rule.consolidatedName.split('_')[0] + '_', '')),
            required: true
          }
        ]
      },

      gtm: {
        trigger: {
          type: 'Événement personnalisé',
          name: `EV - ${opp.rule.consolidatedName}`,
          condition: `event equals ${opp.rule.consolidatedName}`
        },
        tag: {
          name: `GA4 - EV - ${opp.rule.consolidatedName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
          type: 'Événement GA4'
        }
      },

      ga4: {
        event_name: opp.rule.consolidatedName,
        conversion: false,
        parameters: [
          {
            name: opp.rule.actionParam,
            variable: `{{DLV - ${opp.rule.actionParam}}}`
          }
        ]
      }
    };

    consolidatedEvents.push(consolidated);
  }

  // Filtrer les events qui ont été consolidés
  config.events = (config.events || []).filter(e => {
    const eventName = e.datalayer?.event_name || e.id;
    return !eventsToRemove.has(eventName);
  });

  // Ajouter les events consolidés
  if (!config.consolidated_events) {
    config.consolidated_events = [];
  }
  config.consolidated_events.push(...consolidatedEvents);

  return config;
}

/**
 * Commande principale editconfig-auto
 */
export async function runEditConfigAuto(options) {
  const projectPath = options.path || process.cwd();
  const absolutePath = resolve(projectPath);
  const yamlPath = join(absolutePath, 'tracking', 'gtm-tracking-plan.yml');

  console.log();
  console.log(chalk.cyan.bold('🤖 OPTIMISATION AUTOMATIQUE DU TRACKING PLAN'));
  console.log(chalk.cyan('─'.repeat(50)));
  console.log();

  // 1. Vérifier que le fichier YAML existe
  if (!existsSync(yamlPath)) {
    console.log(chalk.red('❌ Fichier gtm-tracking-plan.yml non trouvé'));
    console.log(chalk.gray(`   Chemin: ${yamlPath}`));
    console.log();
    console.log(chalk.yellow('💡 Lancez d\'abord: google-setup init-tracking'));
    return null;
  }

  // 2. Lire et analyser le YAML
  const spinner = ora('Analyse du tracking plan...').start();

  let yamlContent;
  let config;
  try {
    yamlContent = readFileSync(yamlPath, 'utf8');
    config = yaml.load(yamlContent);
  } catch (error) {
    spinner.fail(`Erreur de lecture: ${error.message}`);
    return null;
  }

  const analysis = analyzeYAMLForConsolidation(yamlContent);

  spinner.succeed(`Analyse terminée: ${analysis.totalEvents} events détectés`);

  // 3. Afficher les opportunités
  console.log();

  if (analysis.opportunities.length === 0) {
    console.log(boxen(
      chalk.green.bold('✅ Aucune optimisation nécessaire !') + '\n\n' +
      chalk.white('Votre tracking plan est déjà bien structuré.\n') +
      chalk.gray('Pas d\'events à consolider.'),
      { padding: 1, borderColor: 'green', title: '🎉 Optimal', titleAlignment: 'center' }
    ));
    return { optimized: false };
  }

  console.log(chalk.white.bold('📊 Opportunités de consolidation détectées:'));
  console.log();

  for (const opp of analysis.opportunities) {
    const priorityColor = opp.priority === 'high' ? 'red' : opp.priority === 'medium' ? 'yellow' : 'gray';
    console.log(chalk[priorityColor](`   ${opp.priority === 'high' ? '🔴' : opp.priority === 'medium' ? '🟡' : '⚪'} ${opp.rule.consolidatedName}`));
    console.log(chalk.gray(`      ${opp.rule.description}`));
    console.log(chalk.gray(`      Events: ${opp.matchingEvents.join(', ')}`));
    console.log(chalk.green(`      → Économie: ${opp.saving} tag(s) GTM`));
    console.log();
  }

  console.log(chalk.cyan(`   📈 Économie totale potentielle: ${analysis.potentialSaving} tags GTM`));
  console.log();

  // 4. Mode automatique ou interactif
  let selectedOpportunities = [];

  if (options.auto) {
    // Mode auto: appliquer toutes les optimisations high/medium
    selectedOpportunities = analysis.opportunities.filter(o => o.priority !== 'low');
    console.log(chalk.cyan(`   Mode automatique: ${selectedOpportunities.length} optimisations sélectionnées`));
  } else {
    // Mode interactif: demander quelles optimisations appliquer
    const choices = analysis.opportunities.map(opp => ({
      name: `${opp.rule.consolidatedName} (${opp.matchingEvents.length} events → 1, économie: ${opp.saving} tags)`,
      value: opp.ruleId,
      checked: opp.priority !== 'low'
    }));

    const answers = await inquirer.prompt([{
      type: 'checkbox',
      name: 'selected',
      message: 'Quelles optimisations voulez-vous appliquer ?',
      choices
    }]);

    selectedOpportunities = analysis.opportunities.filter(o =>
      answers.selected.includes(o.ruleId)
    );
  }

  if (selectedOpportunities.length === 0) {
    console.log(chalk.yellow('\n⏹️ Aucune optimisation sélectionnée'));
    return { optimized: false };
  }

  // 5. Générer le nouveau YAML
  const spinnerGen = ora('Génération du YAML optimisé...').start();

  const newConfig = generateConsolidatedYAML(config, selectedOpportunities);
  const newYamlContent = yaml.dump(newConfig, {
    indent: 2,
    lineWidth: 120,
    quotingType: '"',
    forceQuotes: false
  });

  spinnerGen.succeed('YAML optimisé généré');

  // 6. Prévisualisation ou sauvegarde
  if (options.dryRun) {
    console.log();
    console.log(chalk.white.bold('📄 Prévisualisation (--dry-run):'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(newYamlContent.slice(0, 2000) + (newYamlContent.length > 2000 ? '\n...(tronqué)' : ''));
    console.log(chalk.gray('─'.repeat(50)));
    return { optimized: false, preview: true };
  }

  // Confirmation avant sauvegarde
  if (!options.force) {
    const confirm = await inquirer.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: 'Voulez-vous sauvegarder le fichier optimisé ?',
      default: true
    }]);

    if (!confirm.proceed) {
      console.log(chalk.yellow('\n⏹️ Sauvegarde annulée'));
      return { optimized: false };
    }
  }

  // 7. Backup et sauvegarde
  const backupPath = yamlPath.replace('.yml', '.backup.yml');
  writeFileSync(backupPath, yamlContent);
  console.log(chalk.gray(`   📁 Backup créé: ${backupPath}`));

  writeFileSync(yamlPath, newYamlContent);
  console.log(chalk.green(`   ✅ Fichier sauvegardé: ${yamlPath}`));

  // 8. Résumé
  console.log();
  console.log(boxen(
    chalk.green.bold('✅ Optimisation terminée !') + '\n\n' +
    chalk.white(`Events consolidés: ${selectedOpportunities.reduce((acc, o) => acc + o.matchingEvents.length, 0)}\n`) +
    chalk.white(`Nouveaux events consolidés: ${selectedOpportunities.length}\n`) +
    chalk.cyan(`Tags GTM économisés: ${selectedOpportunities.reduce((acc, o) => acc + o.saving, 0)}\n\n`) +
    chalk.gray('N\'oubliez pas de mettre à jour votre code JS\n') +
    chalk.gray('pour utiliser les nouveaux noms d\'events consolidés.'),
    { padding: 1, borderColor: 'green', title: '🎉 Succès', titleAlignment: 'center' }
  ));

  return {
    optimized: true,
    consolidations: selectedOpportunities.length,
    tagsSaved: selectedOpportunities.reduce((acc, o) => acc + o.saving, 0)
  };
}
