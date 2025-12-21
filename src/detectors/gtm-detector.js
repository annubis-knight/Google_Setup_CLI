import { google } from 'googleapis';

export async function detectGTM(accountId, domain) {
  const tagmanager = google.tagmanager('v2');

  try {
    // 1. Lister les conteneurs
    const containersRes = await tagmanager.accounts.containers.list({
      parent: `accounts/${accountId}`
    });

    const containers = containersRes.data.container || [];

    // 2. Trouver le conteneur correspondant au domaine
    const domainClean = domain.toLowerCase().replace('www.', '').replace(/\/$/, '');
    const container = containers.find(c => {
      const name = c.name.toLowerCase();
      // Match si le nom contient le domaine ou inversement
      return name.includes(domainClean) ||
             domainClean.includes(name.split(' ')[0]) ||
             name.includes(domainClean.split('.')[0]);
    });

    if (!container) {
      return { installed: false, score: 0 };
    }

    // 3. Récupérer les workspaces
    const workspacesRes = await tagmanager.accounts.containers.workspaces.list({
      parent: container.path
    });

    const workspace = workspacesRes.data.workspace?.[0];
    if (!workspace) {
      return {
        installed: true,
        containerId: container.publicId,
        containerName: container.name,
        tags: [],
        triggers: [],
        variables: [],
        score: 50
      };
    }

    // 4. Récupérer balises, déclencheurs, variables en parallèle
    const [tagsRes, triggersRes, variablesRes] = await Promise.all([
      tagmanager.accounts.containers.workspaces.tags.list({ parent: workspace.path }),
      tagmanager.accounts.containers.workspaces.triggers.list({ parent: workspace.path }),
      tagmanager.accounts.containers.workspaces.variables.list({ parent: workspace.path })
    ]);

    const tags = tagsRes.data.tag || [];
    const triggers = triggersRes.data.trigger || [];
    const variables = variablesRes.data.variable || [];

    // 5. Calculer le score
    const score = calculateGTMScore(tags, triggers, variables);

    return {
      installed: true,
      containerId: container.publicId,
      containerName: container.name,
      containerPath: container.path,
      workspacePath: workspace.path,
      tags: tags.map(t => ({ name: t.name, type: t.type, tagId: t.tagId })),
      triggers: triggers.map(t => ({ name: t.name, type: t.type, triggerId: t.triggerId })),
      variables: variables.map(v => ({ name: v.name, type: v.type, variableId: v.variableId })),
      tagsCount: tags.length,
      triggersCount: triggers.length,
      variablesCount: variables.length,
      score
    };
  } catch (error) {
    // Si erreur 403/404, le conteneur n'existe probablement pas pour ce compte
    if (error.code === 403 || error.code === 404) {
      return { installed: false, score: 0 };
    }
    console.error('Erreur GTM API:', error.message);
    return { installed: false, error: error.message, score: 0 };
  }
}

function calculateGTMScore(tags, triggers, variables) {
  let score = 50; // Base : GTM présent

  // +10 si balise GA4 config présente
  // Types possibles: gaawc (legacy GA4 Config), googtag (nouvelle Balise Google)
  if (tags.some(t => t.type === 'gaawc' || t.type === 'googtag')) score += 10;

  // +10 si > 3 déclencheurs custom
  const customTriggers = triggers.filter(t =>
    t.type === 'customEvent' ||
    t.type === 'CUSTOM_EVENT' ||
    t.type === 'formSubmission' ||
    t.type === 'FORM_SUBMISSION'
  );
  if (customTriggers.length > 3) score += 10;

  // +15 si > 5 variables dataLayer (type v = Data Layer Variable)
  const dlVars = variables.filter(v => v.type === 'v');
  if (dlVars.length > 5) score += 15;

  // +15 si > 3 balises événements GA4 (type gaawe = GA4 Event)
  const eventTags = tags.filter(t => t.type === 'gaawe');
  if (eventTags.length > 3) score += 15;

  return Math.min(score, 100);
}
