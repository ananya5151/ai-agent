export const weatherPlugin = {
  name: 'get_weather',
  description: 'Get the current weather for a specific location.',
  parameters: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The city and state, e.g., "San Francisco, CA"',
      },
    },
    required: ['location'],
  },
  execute: async ({ location }: { location: string }) => {
    const apiKey = process.env.WEATHER_API_KEY;
    if (!apiKey) {
      return 'Weather API key is not configured.';
    }
    const url = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${location}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return `Could not fetch weather for ${location}.`;
      }
      const data = await response.json();
      const { temp_c, condition } = data.current;
      return `The current weather in ${location} is ${temp_c}°C and ${condition.text}.`;
    } catch (error) {
      return `Error fetching weather for ${location}.`;
    }
  },
};