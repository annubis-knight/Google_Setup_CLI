import { google } from 'googleapis';

export async function detectSearchConsole(domain) {
  const searchconsole = google.searchconsole('v1');

  try {
    // 1. Lister les sites
    const sitesRes = await searchconsole.sites.list();
    const sites = sitesRes.data.siteEntry || [];

    // 2. Trouver le site correspondant au domaine
    const domainClean = domain.toLowerCase().replace('www.', '').replace(/\/$/, '');

    const site = sites.find(s => {
      const siteUrl = s.siteUrl.toLowerCase();
      return siteUrl.includes(domainClean) ||
             siteUrl.includes(`sc-domain:${domainClean}`) ||
             domainClean.includes(siteUrl.replace('https://', '').replace('http://', '').replace('sc-domain:', ''));
    });

    if (!site) {
      return { verified: false, score: 0 };
    }

    // 3. Vérifier les sitemaps
    let sitemaps = [];
    let hasValidSitemap = false;

    try {
      const sitemapsRes = await searchconsole.sitemaps.list({
        siteUrl: site.siteUrl
      });
      sitemaps = sitemapsRes.data.sitemap || [];
      hasValidSitemap = sitemaps.some(s => !s.errors || s.errors === 0);
    } catch (e) {
      // Sitemaps peuvent ne pas être accessibles
    }

    // 4. Calculer le score
    let score = 50; // Base : site vérifié
    if (hasValidSitemap) score += 50;

    return {
      verified: true,
      siteUrl: site.siteUrl,
      permissionLevel: site.permissionLevel,
      sitemapSubmitted: sitemaps.length > 0,
      sitemaps: sitemaps.map(s => ({
        path: s.path,
        status: (!s.errors || s.errors === 0) ? 'success' : 'error',
        errors: s.errors || 0,
        warnings: s.warnings || 0
      })),
      score
    };
  } catch (error) {
    if (error.code === 403 || error.code === 404) {
      return { verified: false, score: 0 };
    }
    console.error('Erreur Search Console API:', error.message);
    return { verified: false, error: error.message, score: 0 };
  }
}
