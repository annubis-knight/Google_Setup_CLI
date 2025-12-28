/**
 * Client IA multi-modèles pour l'analyse de tracking
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
    costPer1kTokens: 0.000075, // Très économique
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

/**
 * Prompt système pour l'analyse de tracking
 */
const SYSTEM_PROMPT = `Tu es un expert Google Tag Manager et Google Analytics 4.
Ta mission est d'analyser la structure HTML d'un site web et de MODIFIER un fichier YAML existant pour y ajouter les events pertinents.

RÈGLES CRITIQUES:
1. Tu DOIS conserver EXACTEMENT la structure et le format du YAML template fourni
2. Tu ne fais QUE activer (enabled: true) ou ajouter des events dans les sections existantes
3. CONSOLIDE les événements similaires dans la section "consolidated_events" existante
4. Garde SÉPARÉS les événements de conversion critiques (form_submit, purchase) dans la section "events"
5. NE SUPPRIME JAMAIS d'events existants, ne modifie que "enabled" et les paramètres si nécessaire
6. Respecte l'indentation et les commentaires du fichier original

FORMAT DE SORTIE: Tu dois répondre UNIQUEMENT avec du YAML valide complet, sans markdown, sans explication.`;

/**
 * Génère le prompt utilisateur pour l'ÉTAPE 1 : Analyse HTML
 * @param {Object} htmlAnalysis - Données de l'analyse HTML
 * @param {Object} options - Options (type de site, etc.)
 * @returns {string} Prompt formaté
 */
function buildAnalysisPrompt(htmlAnalysis, options = {}) {
  const siteType = options.siteType || 'lead-gen';

  return `ÉTAPE 1 - ANALYSE DES ÉLÉMENTS À TRACKER

Type de site: ${siteType}
Nom du projet: ${options.projectName || 'Mon Site'}
Domaine: ${options.domain || '(non spécifié)'}

ÉLÉMENTS HTML DÉTECTÉS:
${JSON.stringify(htmlAnalysis.elements, null, 2)}

TÂCHE:
Analyse ces éléments et liste les events GA4 à implémenter.
Pour chaque catégorie d'éléments, indique:
1. L'event GA4 recommandé (nom)
2. Si c'est un event simple ou consolidé
3. Les paramètres pertinents à capturer
4. Si c'est une conversion ou non

Réponds en JSON structuré comme ceci:
{
  "recommendations": [
    {
      "category": "cta",
      "event_name": "cta_click",
      "consolidated": true,
      "conversion": true,
      "params": ["cta_location", "cta_type", "button_text"],
      "reason": "Plusieurs CTAs détectés dans navbar, hero, footer"
    }
  ]
}`;
}

/**
 * Génère le prompt utilisateur pour l'ÉTAPE 2 : Édition YAML
 * @param {Object} recommendations - Recommandations de l'étape 1
 * @param {string} templateYaml - Template YAML existant
 * @param {Object} options - Options
 * @returns {string} Prompt formaté
 */
function buildEditPrompt(recommendations, templateYaml, options = {}) {
  return `ÉTAPE 2 - ÉDITION DU YAML EXISTANT

Tu as analysé le site et voici tes recommandations:
${JSON.stringify(recommendations, null, 2)}

YAML TEMPLATE À MODIFIER:
Tu dois éditer CE fichier YAML en:
1. Remplissant la section "project" avec: name="${options.projectName || ''}", domain="${options.domain || ''}"
2. Mettant "enabled: true" sur les events pertinents de la section "events"
3. Mettant "enabled: true" sur les events consolidés pertinents de la section "consolidated_events"
4. Ajoutant de NOUVEAUX events si nécessaire (en suivant EXACTEMENT le même format)
5. NE PAS supprimer les events existants, juste modifier "enabled"

FICHIER YAML À ÉDITER:
${templateYaml}

RÈGLES:
- Conserve TOUS les commentaires existants
- Conserve EXACTEMENT la même indentation (2 espaces)
- Ne modifie PAS la structure des events existants sauf "enabled"
- Si tu ajoutes un nouvel event, copie la structure d'un event existant similaire
- Réponds UNIQUEMENT avec le YAML complet modifié, sans explication`;
}

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
        temperature: 0.2,
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
      temperature: 0.2,
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
 * @param {Object} modelConfig - Configuration du modèle
 * @param {string} systemPrompt - Prompt système
 * @param {string} userPrompt - Prompt utilisateur
 * @returns {string} Réponse de l'IA
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
function cleanResponse(response, type = 'yaml') {
  let content = response.trim();

  // Enlever les blocs de code markdown
  const codeBlockRegex = new RegExp(`^\`\`\`${type}?\\n?`, 'i');
  content = content.replace(codeBlockRegex, '');
  content = content.replace(/\n?```$/g, '');

  // Enlever les backticks restants
  if (content.startsWith('```')) {
    content = content.slice(3);
  }
  if (content.endsWith('```')) {
    content = content.slice(0, -3);
  }

  return content.trim();
}

/**
 * Appelle l'IA en 2 étapes :
 * 1. Analyse HTML → recommandations d'events
 * 2. Édition du YAML template avec les recommandations
 *
 * @param {Object} htmlAnalysis - Analyse HTML préparée pour l'IA
 * @param {Object} options - Options (model, siteType, templateYaml, etc.)
 * @returns {Object} Résultat avec le YAML édité
 */
export async function callAI(htmlAnalysis, options = {}) {
  const modelId = options.model || 'gemini-flash';
  const modelConfig = AI_MODELS[modelId];

  if (!modelConfig) {
    throw new Error(`Modèle inconnu: ${modelId}. Disponibles: ${Object.keys(AI_MODELS).join(', ')}`);
  }

  // Vérifier que la clé API existe
  const apiKey = process.env[modelConfig.envKey];
  if (!apiKey) {
    throw new Error(`Clé API manquante. Ajoutez ${modelConfig.envKey} dans votre fichier .env`);
  }

  // Vérifier qu'on a un template YAML
  if (!options.templateYaml) {
    throw new Error('templateYaml est requis pour éditer le fichier YAML');
  }

  // ==========================================
  // ÉTAPE 1 : Analyse HTML → Recommandations
  // ==========================================
  const analysisPrompt = buildAnalysisPrompt(htmlAnalysis, options);
  const analysisSystemPrompt = `Tu es un expert Google Tag Manager et GA4.
Analyse les éléments HTML détectés et recommande les events à tracker.
Réponds UNIQUEMENT en JSON valide, sans markdown.`;

  let analysisResponse = await callModel(modelConfig, analysisSystemPrompt, analysisPrompt);
  analysisResponse = cleanResponse(analysisResponse, 'json');

  // Parser les recommandations
  let recommendations;
  try {
    recommendations = JSON.parse(analysisResponse);
  } catch (e) {
    // Si le JSON est invalide, essayer d'extraire la partie JSON
    const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      recommendations = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error(`Réponse JSON invalide de l'IA: ${analysisResponse.slice(0, 200)}`);
    }
  }

  // ==========================================
  // ÉTAPE 2 : Édition du YAML avec les recommandations
  // ==========================================
  const editPrompt = buildEditPrompt(recommendations, options.templateYaml, options);

  let yamlResponse = await callModel(modelConfig, SYSTEM_PROMPT, editPrompt);
  yamlResponse = cleanResponse(yamlResponse, 'yaml');

  return {
    success: true,
    model: modelConfig.name,
    modelId,
    recommendations: recommendations.recommendations || [],
    yaml: yamlResponse,
    // Debug: réponses brutes pour diagnostic
    debug: {
      step1_prompt: analysisPrompt,
      step1_response: analysisResponse,
      step2_prompt: editPrompt,
      step2_response: yamlResponse
    }
  };
}

/**
 * Liste les modèles disponibles et leur statut (clé API configurée ou non)
 * @returns {Array} Liste des modèles avec leur statut
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
 * Retourne le premier modèle disponible (avec clé API configurée)
 * @returns {string|null} ID du modèle ou null
 */
export function getDefaultModel() {
  for (const [id, config] of Object.entries(AI_MODELS)) {
    if (process.env[config.envKey]) {
      return id;
    }
  }
  return null;
}
