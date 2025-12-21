import inquirer from 'inquirer';
import chalk from 'chalk';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export async function runInit() {
  console.log(chalk.cyan('\n🔐 Configuration des credentials Google API\n'));

  console.log(chalk.gray(`Étapes préalables :
  1. Allez sur : https://console.cloud.google.com
  2. Créez un projet "google-setup-cli"
  3. Activez les APIs : Tag Manager, Analytics Admin, Search Console, Site Verification
  4. Créez un Service Account et téléchargez le JSON
  5. Donnez accès au Service Account à vos comptes GTM/GA4
`));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'credentialsPath',
      message: 'Chemin vers le fichier credentials.json :',
      validate: v => existsSync(v) || 'Fichier non trouvé'
    },
    {
      type: 'input',
      name: 'gtmAccountId',
      message: 'GTM Account ID :',
      validate: v => /^\d+$/.test(v) || 'ID numérique requis'
    },
    {
      type: 'input',
      name: 'ga4AccountId',
      message: 'GA4 Account ID :',
      validate: v => /^\d+$/.test(v) || 'ID numérique requis'
    }
  ]);

  // Copier les credentials
  const credContent = JSON.parse(readFileSync(answers.credentialsPath, 'utf8'));
  const credPath = join(homedir(), '.google-credentials.json');
  writeFileSync(credPath, JSON.stringify(credContent, null, 2));

  // Sauvegarder la config
  const config = {
    version: '2.0.0',
    credentials: {
      gtmAccountId: answers.gtmAccountId,
      ga4AccountId: answers.ga4AccountId
    },
    defaults: {
      timeZone: 'Europe/Paris',
      currencyCode: 'EUR',
      template: 'lead-gen'
    }
  };

  const configPath = join(homedir(), '.google-setup-config.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(chalk.green(`\n✅ Configuration sauvegardée !`));
  console.log(chalk.gray(`   Credentials : ${credPath}`));
  console.log(chalk.gray(`   Config : ${configPath}\n`));
}
