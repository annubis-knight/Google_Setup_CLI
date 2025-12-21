import * as cheerio from 'cheerio';

/**
 * Détecte Hotjar via un fetch HTML léger (pas de Chrome/Puppeteer)
 */
export async function detectHotjar(domain) {
  try {
    // Construire l'URL avec https et www
    const urls = [
      `https://www.${domain.replace('www.', '')}`,
      `https://${domain.replace('www.', '')}`
    ];

    let html = null;

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; GoogleSetupBot/2.0; +https://github.com/google-setup)'
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(10000) // 10s timeout
        });

        if (response.ok) {
          html = await response.text();
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!html) {
      return { installed: false, score: 0, error: 'Impossible de charger le site' };
    }

    const $ = cheerio.load(html);
    let siteId = null;

    // Chercher le script Hotjar dans la page
    $('script').each((_, el) => {
      const content = $(el).html() || '';
      const src = $(el).attr('src') || '';

      // Pattern 1: hjid dans le contenu du script inline
      const match1 = content.match(/hjid\s*[=:]\s*(\d+)/i);
      if (match1) siteId = match1[1];

      // Pattern 2: _hjSettings avec hjid
      const match2 = content.match(/_hjSettings\s*=\s*\{[^}]*hjid\s*:\s*(\d+)/i);
      if (match2) siteId = match2[1];

      // Pattern 3: Dans l'URL du script externe
      const match3 = src.match(/hotjar[^"']*?(\d{6,})/i);
      if (match3) siteId = match3[1];
    });

    return {
      installed: !!siteId,
      siteId: siteId || null,
      score: siteId ? 100 : 0
    };
  } catch (error) {
    console.error('Erreur Hotjar detection:', error.message);
    return { installed: false, error: error.message, score: 0 };
  }
}
