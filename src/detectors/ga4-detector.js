import { google } from 'googleapis';

export async function detectGA4(accountId, domain) {
  const analyticsAdmin = google.analyticsadmin('v1beta');

  try {
    // 1. Lister les propriétés du compte
    const propertiesRes = await analyticsAdmin.properties.list({
      filter: `parent:accounts/${accountId}`
    });

    const properties = propertiesRes.data.properties || [];

    // 2. Trouver la propriété correspondant au domaine
    const domainClean = domain.toLowerCase().replace('www.', '').replace(/\/$/, '');
    let matchedProperty = null;
    let matchedStream = null;

    for (const property of properties) {
      try {
        const streamsRes = await analyticsAdmin.properties.dataStreams.list({
          parent: property.name
        });

        const streams = streamsRes.data.dataStreams || [];
        const webStream = streams.find(s => {
          const uri = (s.webStreamData?.defaultUri || '').toLowerCase();
          return uri.includes(domainClean) || domainClean.includes(uri.replace('https://', '').replace('http://', '').replace('www.', ''));
        });

        if (webStream) {
          matchedProperty = property;
          matchedStream = webStream;
          break;
        }
      } catch (e) {
        // Ignorer les erreurs de propriétés individuelles
        continue;
      }
    }

    if (!matchedProperty) {
      return { installed: false, score: 0 };
    }

    // 3. Récupérer les conversions
    let conversions = [];
    try {
      const conversionsRes = await analyticsAdmin.properties.conversionEvents.list({
        parent: matchedProperty.name
      });
      conversions = conversionsRes.data.conversionEvents || [];
    } catch (e) {
      // Les conversions peuvent ne pas être accessibles
    }

    // 4. Calculer le score
    const score = calculateGA4Score(conversions);

    return {
      installed: true,
      measurementId: matchedStream.webStreamData?.measurementId,
      propertyId: matchedProperty.name.split('/')[1],
      propertyName: matchedProperty.displayName,
      dataStreamId: matchedStream.name.split('/').pop(),
      dataStreamName: matchedStream.displayName,
      defaultUri: matchedStream.webStreamData?.defaultUri,
      conversions: conversions.map(c => ({ eventName: c.eventName })),
      conversionsCount: conversions.length,
      score
    };
  } catch (error) {
    if (error.code === 403 || error.code === 404) {
      return { installed: false, score: 0 };
    }
    console.error('Erreur GA4 API:', error.message);
    return { installed: false, error: error.message, score: 0 };
  }
}

function calculateGA4Score(conversions) {
  let score = 40; // Base : GA4 présent

  // +15 par conversion configurée (max 45 points pour 3 conversions)
  score += Math.min(conversions.length * 15, 45);

  // +15 bonus si au moins 1 conversion existe
  if (conversions.length > 0) score += 15;

  return Math.min(score, 100);
}
