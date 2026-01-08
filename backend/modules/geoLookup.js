'use strict';

const axios = require('axios');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';

// lookupCountryRegion calls OpenStreetMap Nominatim to derive country/region.
async function lookupCountryRegion(lat, lon) {
  const params = {
    format: 'jsonv2',
    lat,
    lon,
    zoom: 5,
    addressdetails: 1,
  };

  const response = await axios.get(NOMINATIM_URL, {
    params,
    headers: {
      'User-Agent': 'weather-backend/1.0',
    },
    timeout: 10000,
  });

  const address = response.data?.address || {};
  const country = address.country || (address.country_code ? address.country_code.toUpperCase() : 'Unknown');
  const region = address.state || address.region || address.county || '';
  return { country, region };
}

module.exports = {
  lookupCountryRegion,
};
