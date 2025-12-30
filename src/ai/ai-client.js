/**
 * Client IA multi-modèles pour l'analyse de tracking
 * Pipeline: 3 étapes IA
 *   1. Analyse métier → Identifier les events pertinents
 *   2. Grouping → Consolider les events similaires
 *   3. YAML Generation → Générer la configuration finale
 *
 * Supporte: Gemini Flash (défaut), Claude Haiku, GPT-4o-mini
 */

import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

// Charger le .env du projet courant (où la commande est exécutée)
const projectEnvPath = join(process.cwd(), '.env');
if (existsSync(projectEnvPath)) {
  dotenv.config({ path: projectEnvPath });
} else {
  // Fallback sur le .env du dossier de l'outil
  dotenv.config();
}

/**
 * Configuration des modèles disponibles
 * Classés par rapport qualité/prix (meilleur en premier)
 */
const AI_MODELS = {
  'gemini-flash': {
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    model: 'gemini-2.0-flash-exp',
    envKey: 'GOOGLE_AI_API_KEY',
    costPer1kTokens: 0.000075,
    maxTokens: 8192
  },
  'gemini-pro': {
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    model: 'gemini-1.5-pro',
    envKey: 'GOOGLE_AI_API_KEY',
    costPer1kTokens: 0.00125,
    maxTokens: 8192
  },
  'claude-haiku': {
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    envKey: 'ANTHROPIC_API_KEY',
    costPer1kTokens: 0.001,
    maxTokens: 4096
  },
  'gpt-4o-mini': {
    name: 'GPT-4o Mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    envKey: 'OPENAI_API_KEY',
    costPer1kTokens: 0.00015,
    maxTokens: 4096
  }
};

// ============================================================
// PROMPTS POUR LE PIPELINE 3 ÉTAPES
// ============================================================

/**
 * ÉTAPE 1: Prompt d'analyse métier
 * Input: Éléments HTML scannés
 * Output: Events GA4 recommandés avec importance
 */
function buildAnalysisPrompt(htmlAnalysis, options = {}) {
  const siteType = options.siteType || 'lead-gen';
  const projectName = options.projectName || 'Mon Site';
  const domain = options.domain || '(non spécifié)';

  return `Tu es un expert Google Analytics 4 et tracking web.
Analyse ces éléments interactifs détectés et détermine quels événements GA4 tracker.

## CONTEXTE DU SITE
- Type: ${siteType}
- Nom: ${projectName}
- Domaine: ${domain}

## ÉLÉMENTS DÉTECTÉS
${JSON.stringify(htmlAnalysis, null, 2)}

## TÂCHE
Analyse TOUS les éléments et pour chacun détermine:
1. S'il mérite d'être tracké (importance: high/medium/low)
2. Le nom d'événement GA4 approprié (snake_case, max 40 caractères)
3. La catégorie (conversion, engagement, navigation, contact)
4. Les paramètres pertinents à capturer

## CRITÈRES DE PRIORISATION
- HIGH: Conversions directes (formulaires contact/devis, CTA principaux, achats, liens tel/mailto)
- MEDIUM: Engagement fort (vidéo, FAQ, téléchargements PDF, specs produit)
- LOW: Navigation générique, liens sociaux, scroll anchors

## IMPORTANT
- Inclus TOUS les éléments high et medium dans ta réponse
- Pour les éléments low, inclus seulement les plus pertinents (max 10)
- Pour les liens tel: et mailto:, utilise les events "phone_click" et "email_click"
- Pour les PDF, utilise "file_download"

## FORMAT DE RÉPONSE (JSON strict, sans markdown)
{
  "analysis_summary": {
    "total_elements_analyzed": 0,
    "recommended_events": 0,
    "high_priority": 0,
    "medium_priority": 0,
    "low_priority": 0
  },
  "events": [
    {
      "element_id": "cta-hero",
      "importance": "high",
      "event_name": "cta_click",
      "category": "conversion",
      "reason": "Bouton CTA principal dans le hero",
      "html_context": "hero",
      "parameters": [
        {"name": "cta_location", "source": "context", "value": "hero"},
        {"name": "button_text", "source": "click_text"}
      ],
      "is_conversion": true
    },
    {
      "element_id": "phone-link",
      "importance": "high",
      "event_name": "phone_click",
      "category": "contact",
      "reason": "Lien téléphone - intention de contact directe",
      "html_context": "header",
      "parameters": [],
      "is_conversion": true
    }
  ]
}

IMPORTANT: Réponds UNIQUEMENT avec du JSON valide, sans backticks ni markdown.`;
}

/**
 * ÉTAPE 2: Prompt de consolidation/grouping
 * Input: Events de l'étape 1
 * Output: Events groupés + events standalone
 */
function buildGroupingPrompt(analysisResult, options = {}) {
  return `Tu reçois une liste d'événements GA4 recommandés.
Identifie les opportunités de CONSOLIDATION pour réduire le nombre de tags GTM.

## ÉVÉNEMENTS À ANALYSER
${JSON.stringify(analysisResult.events, null, 2)}

## RÈGLES DE CONSOLIDATION

### À CONSOLIDER (1 tag GTM pour plusieurs actions similaires):
- Plusieurs CTA dans différents contextes → "cta_click" + param "cta_location"
- Plusieurs interactions FAQ → "faq_interaction" + param "faq_action"
- Plusieurs interactions vidéo → "video_interaction" + param "video_action"
- Plusieurs téléchargements de fichiers → "file_download" + param "file_type"
- Navigation menu → peut être ignorée ou consolidée en "navigation_click"

### À GARDER SÉPARÉS (events standalone):
- Formulaires (generate_lead, form_submit) - conversions critiques
- Téléphone (phone_click) - conversion contact
- Email (email_click) - conversion contact
- Achat (purchase) - conversion e-commerce

### EVENTS À INCLURE DÉSACTIVÉS (enabled: false):
- Tous les events "low" priority dans les standalone avec enabled: false

## FORMAT DE RÉPONSE (JSON strict)
{
  "grouping_summary": {
    "original_events": 0,
    "consolidated_groups": 0,
    "standalone_events": 0,
    "disabled_events": 0,
    "reduction_percentage": 0
  },
  "event_groups": [
    {
      "group_id": "cta_clicks",
      "strategy": "consolidated_by_location",
      "event_name": "cta_click",
      "description": "Tous les clics CTA consolidés avec paramètre location",
      "source_events": ["cta-hero", "cta-navbar", "cta-footer"],
      "source_contexts": ["hero", "navbar", "footer"],
      "dynamic_param": "cta_location",
      "is_conversion": true,
      "category": "Lead Generation",
      "parameters": [
        {"name": "cta_location", "type": "dynamic", "values": ["hero", "navbar", "footer"]},
        {"name": "button_text", "type": "gtm_builtin", "variable": "{{Click Text}}"}
      ]
    }
  ],
  "standalone_events": [
    {
      "element_id": "contact-form",
      "event_name": "generate_lead",
      "category": "Lead Generation",
      "reason": "Formulaire de contact - conversion critique",
      "is_conversion": true,
      "enabled": true,
      "importance": "high",
      "parameters": [
        {"name": "form_name", "value": "contact"}
      ]
    },
    {
      "element_id": "social-facebook",
      "event_name": "social_click",
      "category": "Engagement",
      "reason": "Clic réseau social - faible priorité",
      "is_conversion": false,
      "enabled": false,
      "importance": "low",
      "parameters": []
    }
  ]
}

IMPORTANT:
- Inclus TOUS les events dans ta réponse (soit dans event_groups, soit dans standalone_events)
- Les events "low" importance doivent avoir enabled: false
- Réponds UNIQUEMENT avec du JSON valide, sans backticks ni markdown.`;
}

/**
 * ÉTAPE 3: Génération YAML programmatique (pas d'IA)
 * Construit le YAML directement depuis les données JSON
 */
function buildYAMLConfig(analysisResult, groupingResult, selectorResults, options = {}) {
  const config = {
    project: {
      name: options.projectName || '',
      domain: options.domain || '',
      ga4_measurement_id: '',
      gtm_container_id: '',
      updated: new Date().toISOString().split('T')[0],
      generated_by: 'google-setup autoedit'
    },
    events: [],
    consolidated_events: [],
    variables: {
      datalayer: []
    }
  };

  const variablesSet = new Set();

  // Générer les consolidated_events depuis event_groups
  for (const group of (groupingResult.event_groups || [])) {
    const consolidatedEvent = {
      id: group.group_id,
      name: group.description || `Event consolidé: ${group.event_name}`,
      category: group.category || 'Engagement',
      objective: group.description,
      enabled: true,
      consolidated: true,

      // Actions regroupées
      actions: (group.source_contexts || group.source_events || []).map(ctx => ({
        id: typeof ctx === 'string' ? ctx : ctx.id,
        description: typeof ctx === 'string' ? `Action: ${ctx}` : ctx.description
      })),

      datalayer: {
        event_name: group.event_name,
        params: (group.parameters || []).map(p => ({
          name: p.name,
          type: p.type === 'dynamic' ? 'string' : 'string',
          description: p.description || `Paramètre ${p.name}`,
          values: p.values || [],
          required: p.type === 'dynamic'
        }))
      },

      gtm: {
        trigger: {
          type: 'Événement personnalisé',
          name: `EV - ${group.event_name}`,
          condition: `event equals ${group.event_name}`
        },
        tag: {
          name: `GA4 - EV - ${formatTagName(group.event_name)}`,
          type: 'Événement GA4'
        }
      },

      ga4: {
        event_name: group.event_name,
        conversion: group.is_conversion || false,
        parameters: (group.parameters || []).map(p => ({
          name: p.name,
          variable: p.variable || `{{DLV - ${p.name}}}`
        }))
      }
    };

    config.consolidated_events.push(consolidatedEvent);

    // Ajouter les variables
    for (const param of (group.parameters || [])) {
      if (!variablesSet.has(param.name) && param.type !== 'gtm_builtin') {
        variablesSet.add(param.name);
        config.variables.datalayer.push({
          name: `DLV - ${param.name}`,
          datalayer_name: param.name,
          type: 'Variable de couche de données'
        });
      }
    }
  }

  // Générer les events standalone
  for (const event of (groupingResult.standalone_events || [])) {
    // Trouver le sélecteur pour cet element
    const selector = selectorResults[event.element_id];
    const selectorInfo = selector?.recommended || { selector: '', confidence: 'low' };

    const standaloneEvent = {
      id: event.element_id || event.event_name,
      name: formatEventName(event.event_name),
      category: event.category || 'Engagement',
      objective: event.reason || '',
      enabled: event.enabled !== false,

      trigger: {
        user_action: event.reason || `Événement ${event.event_name}`,
        html_selector: selectorInfo.selector || ''
      },

      datalayer: {
        event_name: event.event_name,
        params: (event.parameters || []).map(p => ({
          name: p.name,
          type: 'string',
          value: p.value || ''
        }))
      },

      gtm: {
        trigger: {
          type: 'Événement personnalisé',
          name: `EV - ${event.event_name}`,
          condition: `event equals ${event.event_name}`
        },
        tag: {
          name: `GA4 - EV - ${formatTagName(event.event_name)}`,
          type: 'Événement GA4'
        }
      },

      ga4: {
        event_name: event.event_name,
        conversion: event.is_conversion || false,
        parameters: (event.parameters || []).map(p => ({
          name: p.name,
          value: p.value || `{{DLV - ${p.name}}}`
        }))
      }
    };

    // Ajouter le selector_confidence si présent
    if (selectorInfo.confidence) {
      standaloneEvent.selector_confidence = selectorInfo.confidence;
    }

    config.events.push(standaloneEvent);

    // Ajouter les variables
    for (const param of (event.parameters || [])) {
      if (!variablesSet.has(param.name)) {
        variablesSet.add(param.name);
        config.variables.datalayer.push({
          name: `DLV - ${param.name}`,
          datalayer_name: param.name,
          type: 'Variable de couche de données'
        });
      }
    }
  }

  return config;
}

/**
 * Formate un nom d'event en nom lisible
 */
function formatEventName(eventName) {
  const names = {
    'cta_click': 'CTA - Clic',
    'generate_lead': 'Formulaire - Génération de lead',
    'form_submit': 'Formulaire - Soumission',
    'phone_click': 'Contact - Téléphone',
    'email_click': 'Contact - Email',
    'whatsapp_click': 'Contact - WhatsApp',
    'file_download': 'Téléchargement - Fichier',
    'video_interaction': 'Vidéo - Interaction',
    'faq_interaction': 'FAQ - Interaction',
    'scroll_depth': 'Scroll - Profondeur',
    'social_click': 'Réseaux sociaux - Clic'
  };
  return names[eventName] || eventName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Formate un nom d'event pour le nom de tag GTM
 */
function formatTagName(eventName) {
  return eventName.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// ============================================================
// FONCTIONS D'APPEL AUX APIs
// ============================================================

/**
 * Appelle l'API Google Gemini
 */
async function callGemini(modelConfig, systemPrompt, userPrompt) {
  const apiKey = process.env[modelConfig.envKey];
  if (!apiKey) {
    throw new Error(`Clé API manquante: ${modelConfig.envKey}`);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelConfig.model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
        }
      ],
      generationConfig: {
        temperature: 0.1, // Plus déterministe pour la génération de code
        maxOutputTokens: modelConfig.maxTokens
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erreur Gemini API: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Appelle l'API Anthropic Claude
 */
async function callClaude(modelConfig, systemPrompt, userPrompt) {
  const apiKey = process.env[modelConfig.envKey];
  if (!apiKey) {
    throw new Error(`Clé API manquante: ${modelConfig.envKey}`);
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: modelConfig.model,
      max_tokens: modelConfig.maxTokens,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erreur Claude API: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

/**
 * Appelle l'API OpenAI
 */
async function callOpenAI(modelConfig, systemPrompt, userPrompt) {
  const apiKey = process.env[modelConfig.envKey];
  if (!apiKey) {
    throw new Error(`Clé API manquante: ${modelConfig.envKey}`);
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelConfig.model,
      max_tokens: modelConfig.maxTokens,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erreur OpenAI API: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Appelle l'IA pour un provider donné
 */
async function callModel(modelConfig, systemPrompt, userPrompt) {
  switch (modelConfig.provider) {
    case 'google':
      return await callGemini(modelConfig, systemPrompt, userPrompt);
    case 'anthropic':
      return await callClaude(modelConfig, systemPrompt, userPrompt);
    case 'openai':
      return await callOpenAI(modelConfig, systemPrompt, userPrompt);
    default:
      throw new Error(`Provider non supporté: ${modelConfig.provider}`);
  }
}

/**
 * Nettoie la réponse IA (enlève les backticks markdown)
 */
function cleanResponse(response, type = 'json') {
  let content = response.trim();

  // Enlever les blocs de code markdown
  const patterns = [
    new RegExp(`^\`\`\`${type}?\\s*\\n?`, 'i'),
    new RegExp(`^\`\`\`\\s*\\n?`, 'i'),
    /\n?\`\`\`$/g
  ];

  for (const pattern of patterns) {
    content = content.replace(pattern, '');
  }

  return content.trim();
}

/**
 * Parse JSON avec fallback
 */
function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    // Essayer d'extraire le JSON du texte
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error(`JSON invalide: ${text.slice(0, 200)}`);
  }
}

// ============================================================
// FONCTION PRINCIPALE DU PIPELINE
// ============================================================

/**
 * Exécute le pipeline IA en 2 étapes + génération programmatique
 *
 * Pipeline:
 *   1. IA: Analyse métier → Events GA4 recommandés
 *   2. IA: Grouping → Consolidation des events similaires
 *   3. Code: Génération YAML programmatique (pas d'IA)
 *
 * @param {Object} htmlAnalysis - Données préparées par prepareForAI()
 * @param {Object} selectorResults - Résultats de findSelectorsForElements()
 * @param {Object} options - Options de configuration
 * @returns {Object} Résultat avec config structurée et données intermédiaires
 */
export async function runAIPipeline(htmlAnalysis, selectorResults, options = {}) {
  const modelId = options.model || 'gemini-flash';
  const modelConfig = AI_MODELS[modelId];

  if (!modelConfig) {
    throw new Error(`Modèle inconnu: ${modelId}. Disponibles: ${Object.keys(AI_MODELS).join(', ')}`);
  }

  const apiKey = process.env[modelConfig.envKey];
  if (!apiKey) {
    throw new Error(`Clé API manquante. Ajoutez ${modelConfig.envKey} dans votre fichier .env`);
  }

  const debug = {
    steps: [],
    model: modelConfig.name,
    modelId,
    timestamp: new Date().toISOString()
  };

  // ==========================================
  // ÉTAPE 1: Analyse métier (IA)
  // ==========================================
  const step1Prompt = buildAnalysisPrompt(htmlAnalysis, options);
  const step1System = 'Tu es un expert GA4 et GTM. Analyse les éléments HTML et recommande les events à tracker. Réponds en JSON strict.';

  let step1Response = await callModel(modelConfig, step1System, step1Prompt);
  step1Response = cleanResponse(step1Response, 'json');

  let analysisResult;
  try {
    analysisResult = safeParseJSON(step1Response);
  } catch (e) {
    throw new Error(`Étape 1 - Analyse: Réponse JSON invalide - ${e.message}`);
  }

  debug.steps.push({
    step: 1,
    name: 'analysis',
    prompt: step1Prompt,
    response: step1Response,
    result: analysisResult
  });

  // ==========================================
  // ÉTAPE 2: Grouping / Consolidation (IA)
  // ==========================================
  const step2Prompt = buildGroupingPrompt(analysisResult, options);
  const step2System = 'Tu es un expert GTM. Consolide les events similaires pour optimiser le nombre de tags. Réponds en JSON strict.';

  let step2Response = await callModel(modelConfig, step2System, step2Prompt);
  step2Response = cleanResponse(step2Response, 'json');

  let groupingResult;
  try {
    groupingResult = safeParseJSON(step2Response);
  } catch (e) {
    throw new Error(`Étape 2 - Grouping: Réponse JSON invalide - ${e.message}`);
  }

  debug.steps.push({
    step: 2,
    name: 'grouping',
    prompt: step2Prompt,
    response: step2Response,
    result: groupingResult
  });

  // ==========================================
  // ÉTAPE 3: Génération YAML (programmatique)
  // ==========================================
  const yamlConfig = buildYAMLConfig(analysisResult, groupingResult, selectorResults, options);

  debug.steps.push({
    step: 3,
    name: 'yaml_generation',
    prompt: '(Génération programmatique - pas de prompt IA)',
    response: JSON.stringify(yamlConfig, null, 2),
    result: yamlConfig
  });

  // Calculer les stats
  const enabledStandalone = (groupingResult.standalone_events || []).filter(e => e.enabled !== false).length;
  const disabledStandalone = (groupingResult.standalone_events || []).filter(e => e.enabled === false).length;

  return {
    success: true,
    model: modelConfig.name,
    modelId,

    // Résultats intermédiaires
    analysis: analysisResult,
    grouping: groupingResult,

    // Résultat final (objet, pas YAML string)
    config: yamlConfig,

    // Stats
    stats: {
      eventsAnalyzed: analysisResult.analysis_summary?.total_elements_analyzed || 0,
      eventsRecommended: analysisResult.analysis_summary?.recommended_events || analysisResult.events?.length || 0,
      consolidatedGroups: groupingResult.event_groups?.length || 0,
      standaloneEvents: enabledStandalone,
      disabledEvents: disabledStandalone,
      reductionPercent: groupingResult.grouping_summary?.reduction_percentage || 0
    },

    // Debug (pour --debug)
    debug
  };
}

/**
 * Fonction legacy pour compatibilité avec l'ancien code
 * @deprecated Utiliser runAIPipeline à la place
 */
export async function callAI(htmlAnalysis, options = {}) {
  // Créer des sélecteurs factices pour compatibilité
  const fakeSelectorResults = {};
  return await runAIPipeline(htmlAnalysis, fakeSelectorResults, options);
}

/**
 * Liste les modèles disponibles et leur statut
 */
export function listAvailableModels() {
  return Object.entries(AI_MODELS).map(([id, config]) => ({
    id,
    name: config.name,
    provider: config.provider,
    available: !!process.env[config.envKey],
    envKey: config.envKey,
    costPer1kTokens: config.costPer1kTokens
  }));
}

/**
 * Retourne le premier modèle disponible
 */
export function getDefaultModel() {
  for (const [id, config] of Object.entries(AI_MODELS)) {
    if (process.env[config.envKey]) {
      return id;
    }
  }
  return null;
}

/**
 * Récupère la config d'un modèle
 */
export function getModelConfig(modelId) {
  return AI_MODELS[modelId] || null;
}
