import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { getAuthClient, loadConfig } from '../utils/auth.js';
import { detectGTM } from '../detectors/gtm-detector.js';
import { detectGA4 } from '../detectors/ga4-detector.js';
import { detectSearchConsole } from '../detectors/search-console-detector.js';
import { detectDataLayer } from '../detectors/datalayer-detector.js';
import { detectHotjar } from '../detectors/hotjar-detector.js';
import { calculateKPI } from '../kpi/calculator.js';

export async function runAudit(options) {
  const spinner = ora('Initialisation...').start();

  try {
    // Charger config
    const config = loadConfig();
    if (!config) {
      spinner.fail('Configuration manquante. Lancez: google-setup init');
      return;
    }

    // Authentification
    spinner.text = 'Authentification Google API...';
    await getAuthClient();

    // Parser les domaines
    const domains = options.domains.split(',').map(d => d.trim().toLowerCase());

    const results = [];

    for (const domain of domains) {
      spinner.text = `🔍 Audit de ${domain}...`;

      const startTime = Date.now();

      // Exécuter les détecteurs en parallèle
      const [gtm, ga4, searchConsole, hotjar] = await Promise.all([
        detectGTM(config.credentials.gtmAccountId, domain),
        detectGA4(config.credentials.ga4AccountId, domain),
        detectSearchConsole(domain),
        detectHotjar(domain)
      ]);

      // DataLayer est dérivé des données GTM (pas d'appel API supplémentaire)
      const dataLayer = detectDataLayer(gtm);

      // Calculer le KPI global
      const auditData = { gtm, ga4, dataLayer, searchConsole, hotjar };
      const kpi = calculateKPI(auditData);

      const auditTime = ((Date.now() - startTime) / 1000).toFixed(2);

      results.push({
        domain,
        ...auditData,
        kpi,
        auditTime
      });
    }

    spinner.succeed(`Audit terminé ! (${results.length} domaine(s))`);

    // Afficher les résultats
    for (const result of results) {
      displayAuditResult(result);
    }

    // Sauvegarder le rapport JSON
    saveReport(results);

    return results;

  } catch (error) {
    spinner.fail(`Erreur: ${error.message}`);
    console.error(chalk.red(error.stack));
  }
}

function displayAuditResult(result) {
  const { domain, kpi, gtm, ga4, dataLayer, searchConsole, hotjar, auditTime } = result;

  const gradeColors = {
    'A+': chalk.green.bold,
    'A': chalk.green,
    'B': chalk.yellow,
    'C': chalk.yellow,
    'D': chalk.red,
    'F': chalk.red.bold
  };
  const gradeColor = gradeColors[kpi.grade] || chalk.white;

  const status = (ok) => ok ? chalk.green('✓') : chalk.red('✗');
  const scoreBar = (score) => {
    const filled = Math.round(score / 10);
    const empty = 10 - filled;
    return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  };

  let output = `${chalk.bold.white(domain)}\n\n`;

  // GTM
  output += `🏷️  GTM          ${status(gtm.installed)} `;
  output += gtm.installed ? chalk.cyan(gtm.containerId) : chalk.gray('Non installé');
  output += `  ${scoreBar(gtm.score)} ${gtm.score}/100\n`;

  // GA4
  output += `📊 GA4          ${status(ga4.installed)} `;
  output += ga4.installed ? chalk.cyan(ga4.measurementId) : chalk.gray('Non configuré');
  output += `  ${scoreBar(ga4.score)} ${ga4.score}/100\n`;

  // DataLayer
  output += `📦 DataLayer    ${status(dataLayer.installed)} `;
  output += dataLayer.installed ? chalk.cyan(`${dataLayer.variablesCount} vars`) : chalk.gray('Non configuré');
  output += `  ${scoreBar(dataLayer.score)} ${dataLayer.score}/100\n`;

  // Search Console
  output += `🔍 Search Console ${status(searchConsole.verified)} `;
  output += searchConsole.verified ? chalk.cyan(searchConsole.siteUrl?.substring(0, 25)) : chalk.gray('Non vérifié');
  output += `  ${scoreBar(searchConsole.score)} ${searchConsole.score}/100\n`;

  // Hotjar
  output += `🔥 Hotjar       ${status(hotjar.installed)} `;
  output += hotjar.installed ? chalk.cyan(`ID: ${hotjar.siteId}`) : chalk.gray('Non installé');
  output += `  ${scoreBar(hotjar.score)} ${hotjar.score}/100\n\n`;

  // Score global
  output += `${chalk.bold('Score global :')} ${gradeColor(`${kpi.overallScore}/100`)} `;
  output += `(${gradeColor(kpi.grade)}) ${getGradeEmoji(kpi.grade)}\n`;

  // Recommandations
  if (kpi.recommendations.length > 0) {
    output += `\n${chalk.bold('Recommandations :')}\n`;
    kpi.recommendations.slice(0, 5).forEach((r, i) => {
      const icon = r.priority === 'critical' ? '🔴' : r.priority === 'high' ? '🟠' : '🟡';
      output += `${i + 1}. ${icon} ${r.message} ${chalk.gray(`(+${r.impact} pts)`)}\n`;
    });
  }

  output += `\n${chalk.gray(`⏱️  Audit en ${auditTime}s`)}`;

  console.log('\n' + boxen(output, {
    padding: 1,
    margin: 0,
    borderColor: getBorderColor(kpi.grade),
    borderStyle: 'round',
    title: '📊 Rapport d\'audit',
    titleAlignment: 'center'
  }));
}

function getGradeEmoji(grade) {
  const emojis = {
    'A+': '🏆', 'A': '🎉', 'B': '👍', 'C': '😐', 'D': '😞', 'F': '💀'
  };
  return emojis[grade] || '';
}

function getBorderColor(grade) {
  if (grade === 'A+' || grade === 'A') return 'green';
  if (grade === 'B' || grade === 'C') return 'yellow';
  return 'red';
}

function saveReport(results) {
  if (!existsSync('./reports')) {
    mkdirSync('./reports', { recursive: true });
  }

  const date = new Date().toISOString().split('T')[0];
  const time = new Date().toISOString().split('T')[1].substring(0, 5).replace(':', 'h');
  const filename = `./reports/audit-${date}-${time}.json`;

  const report = {
    version: '2.0.0',
    date: new Date().toISOString(),
    summary: {
      totalDomains: results.length,
      averageScore: Math.round(results.reduce((sum, r) => sum + r.kpi.overallScore, 0) / results.length),
      grades: results.map(r => ({ domain: r.domain, grade: r.kpi.grade, score: r.kpi.overallScore }))
    },
    domains: results
  };

  writeFileSync(filename, JSON.stringify(report, null, 2));
  console.log(chalk.gray(`\n📁 Rapport sauvegardé : ${filename}`));
}
