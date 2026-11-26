export const carriers = Object.freeze({ 'canada-post': 'Canada Post', ups: 'UPS', fedex: 'FedEx' });

export function trackingUrl(tracking) {
  if (!tracking || !Object.hasOwn(carriers, tracking.carrier) || !/^[A-Z0-9]{6,40}$/.test(tracking.number)) return null;
  const number = encodeURIComponent(tracking.number);
  if (tracking.carrier === 'canada-post') return `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${number}`;
  if (tracking.carrier === 'ups') return `https://www.ups.com/track?loc=en_CA&tracknum=${number}`;
  return `https://www.fedex.com/fedextrack/?trknbr=${number}`;
}
