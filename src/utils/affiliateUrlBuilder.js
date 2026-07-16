// Builds a REAL tracked affiliate URL for a given deal's external link,
// routed through the correct network based on retailer.
//
// eBay deals      → eBay Partner Network (Rover link)
// everything else → Skimlinks (covers Amazon, ASOS, and other merchants)

const EBAY_CAMPAIGN_ID  = process.env.EBAY_CAMPAIGN_ID;
const EBAY_ROTATION_ID  = process.env.EBAY_ROTATION_ID || '710-53481-19255-0'; // UK
const SKIMLINKS_PUB_ID  = process.env.SKIMLINKS_PUBLISHER_ID;

// Build an eBay EPN (Rover) tracking link
const buildEbayLink = (targetUrl, customId) => {
  if (!EBAY_CAMPAIGN_ID) return null; // not set up yet — caller handles fallback

  const encodedTarget = encodeURIComponent(targetUrl);
  return `https://rover.ebay.com/rover/1/${EBAY_ROTATION_ID}/1` +
    `?campid=${EBAY_CAMPAIGN_ID}` +
    `&customid=${customId}` +
    `&toolid=10001` +
    `&mpre=${encodedTarget}`;
};

// Build a Skimlinks tracking link (covers Amazon, ASOS, everything else)
const buildSkimlinksLink = (targetUrl, customId) => {
  if (!SKIMLINKS_PUB_ID) return null; // not approved yet

  const encodedTarget = encodeURIComponent(targetUrl);
  return `https://go.skimresources.com` +
    `?id=${SKIMLINKS_PUB_ID}` +
    `&xs=1` +
    `&url=${encodedTarget}` +
    `&xcust=${customId}`;
};

// Main entry point — call this whenever a real affiliate URL is needed.
// Returns { url, platform } — url is null if that network isn't set up yet.
const buildAffiliateUrl = ({ externalLink, retailer, customId }) => {
  if (retailer === 'ebay') {
    const url = buildEbayLink(externalLink, customId);
    return { url, platform: url ? 'ebay' : null };
  }

  // Everything else routes through Skimlinks
  const url = buildSkimlinksLink(externalLink, customId);
  return { url, platform: url ? 'skimlinks' : null };
};

module.exports = { buildAffiliateUrl };