import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Crée un conteneur GTM et configure les balises/triggers/variables
 */
export async function deployGTM(domain, projectName, accountId, ga4MeasurementId, templateName = 'lead-gen') {
  const tagmanager = google.tagmanager('v2');

  console.log('🏷️  Création conteneur GTM...');

  // 1. Créer le conteneur
  const container = await tagmanager.accounts.containers.create({
    parent: `accounts/${accountId}`,
    requestBody: {
      name: projectName,
      usageContext: ['WEB']
    }
  });

  const containerId = container.data.publicId;
  console.log(`   ✓ Conteneur créé: ${containerId}`);

  // 2. Récupérer le workspace par défaut
  const workspacesRes = await tagmanager.accounts.containers.workspaces.list({
    parent: container.data.path
  });
  const workspace = workspacesRes.data.workspace[0];

  // 3. Charger le template
  const templatePath = join(__dirname, '../templates', `gtm-${templateName}.json`);
  let template;
  try {
    template = JSON.parse(readFileSync(templatePath, 'utf8'));
  } catch (e) {
    console.log(`   ⚠️  Template ${templateName} non trouvé, utilisation du template par défaut`);
    template = getDefaultTemplate();
  }

  console.log('   ⏳ Création des éléments GTM...');

  // 4. Créer les éléments du template
  const stats = await createGTMElements(tagmanager, workspace.path, template, {
    GA4_MEASUREMENT_ID: ga4MeasurementId,
    DOMAIN: domain,
    PROJECT_NAME: projectName
  });

  console.log(`   ✓ ${stats.tags} balises, ${stats.triggers} déclencheurs, ${stats.variables} variables`);

  // 5. Créer et publier une version
  console.log('   ⏳ Publication de la version...');

  try {
    const versionRes = await tagmanager.accounts.containers.workspaces.create_version({
      path: workspace.path,
      requestBody: {
        name: 'v1.0 - Setup initial',
        notes: 'Créé automatiquement par google-setup-cli'
      }
    });

    if (versionRes.data.containerVersion) {
      await tagmanager.accounts.containers.versions.publish({
        path: versionRes.data.containerVersion.path
      });
      console.log('   ✓ Version v1.0 publiée');
    }
  } catch (e) {
    console.log(`   ⚠️  Publication échouée: ${e.message}`);
  }

  return {
    containerId,
    containerPath: container.data.path,
    workspacePath: workspace.path
  };
}

/**
 * Crée les éléments GTM depuis un template
 */
async function createGTMElements(tagmanager, workspacePath, template, variables) {
  // Remplacer les variables dans le template
  let templateStr = JSON.stringify(template);
  for (const [key, value] of Object.entries(variables)) {
    templateStr = templateStr.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  const processed = JSON.parse(templateStr);

  const stats = { variables: 0, triggers: 0, tags: 0 };

  // Créer les variables
  const varIdMap = {};
  for (const variable of processed.variables || []) {
    try {
      const created = await tagmanager.accounts.containers.workspaces.variables.create({
        parent: workspacePath,
        requestBody: variable
      });
      varIdMap[variable.name] = created.data.variableId;
      stats.variables++;
    } catch (e) {
      console.log(`   ⚠️  Variable ${variable.name}: ${e.message}`);
    }
  }

  // Créer les déclencheurs
  const triggerIdMap = {};
  for (const trigger of processed.triggers || []) {
    try {
      const created = await tagmanager.accounts.containers.workspaces.triggers.create({
        parent: workspacePath,
        requestBody: trigger
      });
      triggerIdMap[trigger.name] = created.data.triggerId;
      stats.triggers++;
    } catch (e) {
      console.log(`   ⚠️  Trigger ${trigger.name}: ${e.message}`);
    }
  }

  // Créer les balises
  for (const tag of processed.tags || []) {
    try {
      // Remplacer la référence au trigger par son ID
      if (tag.firingTriggerName && triggerIdMap[tag.firingTriggerName]) {
        tag.firingTriggerId = [triggerIdMap[tag.firingTriggerName]];
        delete tag.firingTriggerName;
      }

      await tagmanager.accounts.containers.workspaces.tags.create({
        parent: workspacePath,
        requestBody: tag
      });
      stats.tags++;
    } catch (e) {
      console.log(`   ⚠️  Tag ${tag.name}: ${e.message}`);
    }
  }

  return stats;
}

/**
 * Template par défaut si le fichier n'existe pas
 */
function getDefaultTemplate() {
  return {
    variables: [
      {
        name: 'DLV - cta_location',
        type: 'v',
        parameter: [
          { type: 'INTEGER', key: 'dataLayerVersion', value: '2' },
          { type: 'TEMPLATE', key: 'name', value: 'cta_location' }
        ]
      }
    ],
    triggers: [
      {
        name: 'All Pages',
        type: 'pageview'
      },
      {
        name: 'Event - clic_cta',
        type: 'customEvent',
        customEventFilter: [
          {
            type: 'equals',
            parameter: [
              { type: 'template', key: 'arg0', value: '{{_event}}' },
              { type: 'template', key: 'arg1', value: 'clic_cta' }
            ]
          }
        ]
      }
    ],
    tags: [
      {
        name: 'GA4 - Configuration - {{PROJECT_NAME}}',
        type: 'gaawc',
        parameter: [
          { type: 'TEMPLATE', key: 'measurementId', value: '{{GA4_MEASUREMENT_ID}}' }
        ],
        firingTriggerName: 'All Pages'
      },
      {
        name: 'GA4 - Event - CTA Click',
        type: 'gaawe',
        parameter: [
          { type: 'TEMPLATE', key: 'eventName', value: 'clic_cta' },
          { type: 'TEMPLATE', key: 'measurementIdOverride', value: '{{GA4_MEASUREMENT_ID}}' }
        ],
        firingTriggerName: 'Event - clic_cta'
      }
    ]
  };
}
