import { google } from 'googleapis';
import { getAuthClient, getAccountIds } from '../utils/auth.js';
import chalk from 'chalk';
import ora from 'ora';
import input from '@inquirer/input';

/**
 * Incrémente le numéro de version sémantique
 * v1.0.2 -> v1.0.3
 */
function incrementVersion(versionName) {
  const match = versionName.match(/v?(\d+)\.(\d+)\.(\d+)/);
  if (match) {
    const [, major, minor, patch] = match;
    return `v${major}.${minor}.${parseInt(patch) + 1}`;
  }
  // Si pas de format reconnu, commencer à v1.0.1
  return 'v1.0.1';
}

/**
 * Génère le diff entre le workspace actuel et la dernière version
 */
function generateDiff(workspaceData, lastVersionData) {
  const current = {
    tags: workspaceData.tag || [],
    triggers: workspaceData.trigger || [],
    variables: workspaceData.variable || []
  };

  const previous = {
    tags: lastVersionData?.tag || [],
    triggers: lastVersionData?.trigger || [],
    variables: lastVersionData?.variable || []
  };

  // Tags
  const addedTags = current.tags.filter(t => !previous.tags.find(p => p.tagId === t.tagId));
  const modifiedTags = current.tags.filter(t => {
    const prev = previous.tags.find(p => p.tagId === t.tagId);
    return prev && prev.fingerprint !== t.fingerprint;
  });
  const deletedTags = previous.tags.filter(t => !current.tags.find(c => c.tagId === t.tagId));

  // Triggers
  const addedTriggers = current.triggers.filter(t => !previous.triggers.find(p => p.triggerId === t.triggerId));
  const modifiedTriggers = current.triggers.filter(t => {
    const prev = previous.triggers.find(p => p.triggerId === t.triggerId);
    return prev && prev.fingerprint !== t.fingerprint;
  });
  const deletedTriggers = previous.triggers.filter(t => !current.triggers.find(c => c.triggerId === t.triggerId));

  // Variables
  const addedVars = current.variables.filter(v => !previous.variables.find(p => p.variableId === v.variableId));
  const modifiedVars = current.variables.filter(v => {
    const prev = previous.variables.find(p => p.variableId === v.variableId);
    return prev && prev.fingerprint !== v.fingerprint;
  });
  const deletedVars = previous.variables.filter(v => !current.variables.find(c => c.variableId === v.variableId));

  // Construire la description
  const parts = [];

  if (addedTags.length) parts.push(`+${addedTags.length} tag${addedTags.length > 1 ? 's' : ''}`);
  if (modifiedTags.length) parts.push(`~${modifiedTags.length} tag${modifiedTags.length > 1 ? 's' : ''}`);
  if (deletedTags.length) parts.push(`-${deletedTags.length} tag${deletedTags.length > 1 ? 's' : ''}`);

  if (addedTriggers.length) parts.push(`+${addedTriggers.length} trigger${addedTriggers.length > 1 ? 's' : ''}`);
  if (modifiedTriggers.length) parts.push(`~${modifiedTriggers.length} trigger${modifiedTriggers.length > 1 ? 's' : ''}`);
  if (deletedTriggers.length) parts.push(`-${deletedTriggers.length} trigger${deletedTriggers.length > 1 ? 's' : ''}`);

  if (addedVars.length) parts.push(`+${addedVars.length} variable${addedVars.length > 1 ? 's' : ''}`);
  if (modifiedVars.length) parts.push(`~${modifiedVars.length} variable${modifiedVars.length > 1 ? 's' : ''}`);
  if (deletedVars.length) parts.push(`-${deletedVars.length} variable${deletedVars.length > 1 ? 's' : ''}`);

  return {
    added: { tags: addedTags, triggers: addedTriggers, variables: addedVars },
    modified: { tags: modifiedTags, triggers: modifiedTriggers, variables: modifiedVars },
    deleted: { tags: deletedTags, triggers: deletedTriggers, variables: deletedVars },
    description: parts.length ? parts.join(', ') : 'No changes detected',
    hasChanges: parts.length > 0
  };
}

/**
 * Trouve un conteneur GTM par domaine ou GTM-ID
 */
async function findContainer(tagmanager, accountId, domain, gtmId) {
  const containersRes = await tagmanager.accounts.containers.list({
    parent: `accounts/${accountId}`
  });

  const containers = containersRes.data.container || [];

  if (gtmId) {
    // Chercher par GTM-ID (publicId)
    const container = containers.find(c => c.publicId === gtmId);
    if (!container) {
      throw new Error(`Conteneur GTM ${gtmId} non trouvé`);
    }
    return container;
  }

  if (domain) {
    // Chercher par domaine dans le nom ou les notes
    const normalizedDomain = domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '');
    const container = containers.find(c => {
      const name = (c.name || '').toLowerCase();
      const notes = (c.notes || '').toLowerCase();
      return name.includes(normalizedDomain) || notes.includes(normalizedDomain);
    });
    if (!container) {
      throw new Error(`Conteneur GTM pour "${domain}" non trouvé`);
    }
    return container;
  }

  throw new Error('Domaine ou GTM-ID requis');
}

/**
 * Publie les modifications GTM en production
 */
export async function runPublish({ domain, gtmId }) {
  console.log();

  const spinner = ora('Connexion à GTM...').start();

  try {
    // 1. Auth
    await getAuthClient();
    const tagmanager = google.tagmanager('v2');
    const { gtmAccountId } = getAccountIds();

    if (!gtmAccountId) {
      spinner.fail('GTM Account ID non configuré. Lancez: google-setup init');
      return;
    }

    // 2. Trouver le conteneur
    spinner.text = 'Recherche du conteneur...';
    const container = await findContainer(tagmanager, gtmAccountId, domain, gtmId);
    spinner.succeed(`Conteneur trouvé: ${container.name} (${container.publicId})`);

    // 3. Récupérer la dernière version publiée
    spinner.start('Analyse des versions...');
    const versionsRes = await tagmanager.accounts.containers.version_headers.list({
      parent: container.path
    });

    const versionHeaders = versionsRes.data.containerVersionHeader || [];
    const lastPublishedHeader = versionHeaders.find(v => v.numContainerVersionsPublished > 0) || versionHeaders[0];

    let lastVersionData = null;
    let lastVersionName = 'v1.0.0';

    if (lastPublishedHeader) {
      // Récupérer les détails de la dernière version pour le diff
      const versionRes = await tagmanager.accounts.containers.versions.get({
        path: `${container.path}/versions/${lastPublishedHeader.containerVersionId}`
      });
      lastVersionData = versionRes.data;
      lastVersionName = lastVersionData.name || `v1.0.${lastPublishedHeader.containerVersionId}`;
    }

    // 4. Récupérer le workspace actuel
    const workspacesRes = await tagmanager.accounts.containers.workspaces.list({
      parent: container.path
    });
    const workspace = workspacesRes.data.workspace?.[0];

    if (!workspace) {
      spinner.fail('Aucun workspace trouvé');
      return;
    }

    // Récupérer les détails du workspace pour le diff
    const [tagsRes, triggersRes, varsRes] = await Promise.all([
      tagmanager.accounts.containers.workspaces.tags.list({ parent: workspace.path }),
      tagmanager.accounts.containers.workspaces.triggers.list({ parent: workspace.path }),
      tagmanager.accounts.containers.workspaces.variables.list({ parent: workspace.path })
    ]);

    const workspaceData = {
      tag: tagsRes.data.tag || [],
      trigger: triggersRes.data.trigger || [],
      variable: varsRes.data.variable || []
    };

    // 5. Générer le diff
    const diff = generateDiff(workspaceData, lastVersionData);
    const nextVersion = incrementVersion(lastVersionName);

    spinner.succeed(`Analyse terminée (depuis ${lastVersionName})`);

    // Afficher le diff
    console.log();
    if (diff.hasChanges) {
      console.log(chalk.cyan('📋 Changements détectés:'));

      if (diff.added.tags.length) {
        console.log(chalk.green(`   + ${diff.added.tags.length} tag(s): ${diff.added.tags.map(t => t.name).join(', ')}`));
      }
      if (diff.modified.tags.length) {
        console.log(chalk.yellow(`   ~ ${diff.modified.tags.length} tag(s) modifié(s): ${diff.modified.tags.map(t => t.name).join(', ')}`));
      }
      if (diff.deleted.tags.length) {
        console.log(chalk.red(`   - ${diff.deleted.tags.length} tag(s) supprimé(s): ${diff.deleted.tags.map(t => t.name).join(', ')}`));
      }

      if (diff.added.triggers.length) {
        console.log(chalk.green(`   + ${diff.added.triggers.length} trigger(s): ${diff.added.triggers.map(t => t.name).join(', ')}`));
      }
      if (diff.modified.triggers.length) {
        console.log(chalk.yellow(`   ~ ${diff.modified.triggers.length} trigger(s) modifié(s): ${diff.modified.triggers.map(t => t.name).join(', ')}`));
      }
      if (diff.deleted.triggers.length) {
        console.log(chalk.red(`   - ${diff.deleted.triggers.length} trigger(s) supprimé(s): ${diff.deleted.triggers.map(t => t.name).join(', ')}`));
      }

      if (diff.added.variables.length) {
        console.log(chalk.green(`   + ${diff.added.variables.length} variable(s): ${diff.added.variables.map(v => v.name).join(', ')}`));
      }
      if (diff.modified.variables.length) {
        console.log(chalk.yellow(`   ~ ${diff.modified.variables.length} variable(s) modifiée(s): ${diff.modified.variables.map(v => v.name).join(', ')}`));
      }
      if (diff.deleted.variables.length) {
        console.log(chalk.red(`   - ${diff.deleted.variables.length} variable(s) supprimée(s): ${diff.deleted.variables.map(v => v.name).join(', ')}`));
      }
    } else {
      console.log(chalk.yellow('⚠️  Aucun changement détecté depuis la dernière version'));
      return;
    }

    console.log();

    // 6. Créer la version
    spinner.start(`Création de la version ${nextVersion}...`);

    const versionRes = await tagmanager.accounts.containers.workspaces.create_version({
      path: workspace.path,
      requestBody: {
        name: nextVersion,
        notes: `Auto-published by google-setup\n\nChanges: ${diff.description}`
      }
    });

    if (!versionRes.data.containerVersion) {
      spinner.fail('Erreur lors de la création de la version');
      if (versionRes.data.syncStatus) {
        console.log(chalk.red('   Conflits détectés:', versionRes.data.syncStatus.mergeConflict ? 'Oui' : 'Non'));
      }
      return;
    }

    spinner.succeed(`Version ${nextVersion} créée`);

    // 7. Publier
    spinner.start('Publication en production...');

    await tagmanager.accounts.containers.versions.publish({
      path: versionRes.data.containerVersion.path
    });

    spinner.succeed(chalk.green(`Version ${nextVersion} publiée en production !`));

    console.log();
    console.log(chalk.gray(`   Container: ${container.publicId}`));
    console.log(chalk.gray(`   Version: ${nextVersion}`));
    console.log(chalk.gray(`   Changes: ${diff.description}`));

  } catch (error) {
    spinner.fail(`Erreur: ${error.message}`);

    // Logs détaillés pour debug
    console.log();
    console.log(chalk.yellow('🔍 Debug info:'));

    if (error.response) {
      console.log(chalk.gray(`   Status: ${error.response.status}`));
      console.log(chalk.gray(`   Status Text: ${error.response.statusText}`));

      if (error.response.data) {
        console.log(chalk.gray(`   Error Code: ${error.response.data.error?.code}`));
        console.log(chalk.gray(`   Error Message: ${error.response.data.error?.message}`));
        console.log(chalk.gray(`   Error Status: ${error.response.data.error?.status}`));

        if (error.response.data.error?.details) {
          console.log(chalk.gray(`   Details:`));
          for (const detail of error.response.data.error.details) {
            console.log(chalk.gray(`     - ${JSON.stringify(detail)}`));
          }
        }
      }
    }

    // Afficher le scope requis si c'est un problème de permission
    if (error.message.includes('Insufficient') || error.message.includes('Permission')) {
      console.log();
      console.log(chalk.yellow('💡 Solution possible:'));
      console.log(chalk.white('   1. Vérifiez que le compte de service a le rôle "Publish" dans GTM'));
      console.log(chalk.white('      → tagmanager.google.com → Admin → User Management'));
      console.log(chalk.white('   2. Le scope requis est: tagmanager.publish'));
      console.log();
      console.log(chalk.gray('   Email du compte de service dans: ~/.google-credentials.json'));
    }

    // Stack trace si besoin
    if (process.env.DEBUG) {
      console.log();
      console.log(chalk.gray('Stack trace:'));
      console.log(chalk.gray(error.stack));
    }
  }
}

/**
 * Handler interactif pour le menu
 */
export async function handlePublishInteractive() {
  console.log();
  console.log(chalk.cyan.bold('🚀 Publier GTM en production'));
  console.log(chalk.gray('Crée une nouvelle version et la publie automatiquement.\n'));

  const domainOrId = await input({
    message: 'Domaine ou GTM-ID (ex: example.com ou GTM-XXXXX) :',
    validate: v => v.length > 0 || 'Requis'
  });

  // Détecter si c'est un GTM-ID ou un domaine
  const isGtmId = /^GTM-[A-Z0-9]+$/i.test(domainOrId);

  await runPublish({
    domain: isGtmId ? null : domainOrId,
    gtmId: isGtmId ? domainOrId.toUpperCase() : null
  });
}
