// =====================================
// src/plugins/weatherPlugin.ts (ENHANCED VERSION)
// =====================================
export const weatherPlugin = {
  name: 'get_weather',
  description: 'Get current weather information for any location worldwide.',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The city name, city and country, or coordinates (e.g., "London", "Paris, France", "New York, NY")',
      },
    },
    required: ['location'],
  },
  execute: async ({ location }: { location: string }): Promise<string> => {
    const apiKey = process.env.WEATHER_API_KEY;
    
    if (!apiKey) {
      return `Weather service is currently unavailable. Here's a mock weather report for ${location}: It's partly cloudy with a temperature of 22°C (72°F).`;
    }

    try {
      const encodedLocation = encodeURIComponent(location);
      const url = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodedLocation}&aqi=no`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 400) {
          return `I couldn't find weather data for "${location}". Please check the location name and try again.`;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      const { 
        temp_c, 
        temp_f, 
        condition, 
        humidity, 
        wind_kph,
        feelslike_c 
      } = data.current;
      
      const locationName = data.location.name;
      const country = data.location.country;
      
      return `Current weather in ${locationName}, ${country}:
🌡️ Temperature: ${temp_c}°C (${temp_f}°F)
🌤️ Conditions: ${condition.text}
🤚 Feels like: ${feelslike_c}°C
💧 Humidity: ${humidity}%
💨 Wind: ${wind_kph} km/h`;
      
    } catch (error) {
      console.error('Weather plugin error:', error);
      return `I'm having trouble getting weather data for ${location} right now. Please try again later.`;
    }
  },
};