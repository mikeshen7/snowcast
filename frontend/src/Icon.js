import clearday from '../src/weatherIcons/clearday.png';
import clearnight from '../src/weatherIcons/clearnight.png';
import cloudy from '../src/weatherIcons/cloudy.png';
import fog from '../src/weatherIcons/fog.png';
import hail from '../src/weatherIcons/hail.png';
import partlycloudyday from '../src/weatherIcons/partlycloudyday.png';
import partlycloudynight from '../src/weatherIcons/partlycloudynight.png';
import rain from '../src/weatherIcons/rain.png';
import rainsnow from '../src/weatherIcons/rainsnow.png';
import rainsnowshowersday from '../src/weatherIcons/rainsnowshowersday.png';
import rainsnowshowersnight from '../src/weatherIcons/rainsnowshowersnight.png';
import showersday from '../src/weatherIcons/showersday.png';
import showersnight from '../src/weatherIcons/showersnight.png';
import sleet from '../src/weatherIcons/sleet.png';
import snow from '../src/weatherIcons/snow.png';
import snowshowersday from '../src/weatherIcons/snowshowersday.png';
import snowshowersnight from '../src/weatherIcons/snowshowersnight.png';
import thunder from '../src/weatherIcons/thunder.png';
import thunderrain from '../src/weatherIcons/thunderrain.png';
import thundershowersday from '../src/weatherIcons/thundershowersday.png';
import thundershowersnight from '../src/weatherIcons/thundershowersnight.png';
import wind from '../src/weatherIcons/wind.png';

function Icon (icon) {
  if (icon === 'clear-day') return clearday;
  else if (icon === 'clear-night') return clearnight;
  else if (icon === 'cloudy') return cloudy;
  else if (icon === 'fog') return fog;
  else if (icon === 'hail') return hail;
  else if (icon === 'partly-cloudy-day') return partlycloudyday;
  else if (icon === 'partly-cloudy-night') return partlycloudynight;
  else if (icon === 'rain') return rain;
  else if (icon === 'rain-snow') return rainsnow;
  else if (icon === 'rain-snow-showers-day') return rainsnowshowersday;
  else if (icon === 'rain-snow-showers-night') return rainsnowshowersnight;
  else if (icon === 'showers-day') return showersday;
  else if (icon === 'showers-night') return showersnight;
  else if (icon === 'sleet') return sleet;
  else if (icon === 'snow') return snow;
  else if (icon === 'snow-showers-day') return snowshowersday;
  else if (icon === 'snow-showers-night') return snowshowersnight;
  else if (icon === 'thunder') return thunder;
  else if (icon === 'thunder-rain') return thunderrain;
  else if (icon === 'thunder-showers-day') return thundershowersday;
  else if (icon === 'thunder-showers-night') return thundershowersnight;
  else if (icon === 'wind') return wind;
}

export default Icon;
