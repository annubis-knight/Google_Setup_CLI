/**
 * Calcule le KPI global basé sur les résultats d'audit
 */
export function calculateKPI(auditData) {
  const scores = {
    gtm: auditData.gtm?.score || 0,
    ga4: auditData.ga4?.score || 0,
    dataLayer: auditData.dataLayer?.score || 0,
    searchConsole: auditData.searchConsole?.score || 0,
    hotjar: auditData.hotjar?.score || 0
  };

  // Pondération selon le PRD
  // GTM: 20%, GA4: 30%, DataLayer: 30%, Search Console: 15%, Hotjar: 5%
  const overallScore = Math.round(
    scores.gtm * 0.20 +
    scores.ga4 * 0.30 +
    scores.dataLayer * 0.30 +
    scores.searchConsole * 0.15 +
    scores.hotjar * 0.05
  );

  return {
    scores,
    overallScore,
    grade: getGrade(overallScore),
    recommendations: generateRecommendations(scores, auditData)
  };
}

/**
 * Attribue un grade basé sur le score
 */
export function getGrade(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/**
 * Génère des recommandations basées sur les scores
 */
function generateRecommendations(scores, auditData) {
  const recs = [];

  // GTM
  if (!auditData.gtm?.installed) {
    recs.push({
      priority: 'critical',
      category: 'gtm',
      message: 'GTM non installé',
      impact: 20,
      action: 'deploy_gtm'
    });
  } else if (scores.gtm < 80) {
    if (!auditData.gtm.tags?.some(t => t.type === 'gaawc')) {
      recs.push({
        priority: 'critical',
        category: 'gtm',
        message: 'Aucune balise GA4 configurée dans GTM',
        impact: 10,
        action: 'deploy_ga4_tag'
      });
    }
    if ((auditData.gtm.variablesCount || 0) < 5) {
      recs.push({
        priority: 'high',
        category: 'gtm',
        message: 'Variables dataLayer insuffisantes (< 5)',
        impact: 15,
        action: 'deploy_datalayer_vars'
      });
    }
    if ((auditData.gtm.tagsCount || 0) < 4) {
      recs.push({
        priority: 'medium',
        category: 'gtm',
        message: 'Peu de balises configurées',
        impact: 10,
        action: 'add_event_tags'
      });
    }
  }

  // GA4
  if (!auditData.ga4?.installed) {
    recs.push({
      priority: 'critical',
      category: 'ga4',
      message: 'GA4 non configuré',
      impact: 30,
      action: 'deploy_ga4'
    });
  } else {
    if ((auditData.ga4.conversionsCount || 0) === 0) {
      recs.push({
        priority: 'high',
        category: 'ga4',
        message: 'Aucune conversion marquée - Impossible de mesurer les objectifs',
        impact: 15,
        action: 'mark_conversions'
      });
    }
  }

  // DataLayer
  if (!auditData.dataLayer?.installed) {
    recs.push({
      priority: 'critical',
      category: 'datalayer',
      message: 'DataLayer custom non configuré - Perte de données comportementales',
      impact: 30,
      action: 'deploy_datalayer'
    });
  } else if (scores.dataLayer < 60) {
    recs.push({
      priority: 'high',
      category: 'datalayer',
      message: 'DataLayer incomplet - Ajouter plus de variables custom',
      impact: 20,
      action: 'enhance_datalayer'
    });
  }

  // Search Console
  if (!auditData.searchConsole?.verified) {
    recs.push({
      priority: 'high',
      category: 'search_console',
      message: 'Search Console non vérifié - Pas de visibilité sur SEO',
      impact: 15,
      action: 'verify_sc'
    });
  } else if (!auditData.searchConsole?.sitemapSubmitted) {
    recs.push({
      priority: 'medium',
      category: 'search_console',
      message: 'Aucun sitemap soumis',
      impact: 10,
      action: 'submit_sitemap'
    });
  }

  // Hotjar
  if (!auditData.hotjar?.installed) {
    recs.push({
      priority: 'medium',
      category: 'hotjar',
      message: 'Hotjar non installé - Pas de heatmaps ni enregistrements',
      impact: 5,
      action: 'deploy_hotjar'
    });
  }

  // Trier par priorité
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}
