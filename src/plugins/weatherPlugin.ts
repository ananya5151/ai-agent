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
    // Simple in-memory cache to avoid repeated calls for the same location
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    type CacheEntry = { value: string; expiresAt: number };
    // Using a global variable on the module scope by attaching to globalThis to persist across hot reloads
    const cache: Map<string, CacheEntry> = (globalThis as any).__weatherCache || new Map();
    (globalThis as any).__weatherCache = cache;

    const norm = (location || '').trim().toLowerCase();

    const now = Date.now();
    const cached = cache.get(norm);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const apiKey = process.env.WEATHER_API_KEY;

    if (!apiKey) {
      const fallback = `Weather service is currently unavailable. Here's a mock weather report for ${location}: It's partly cloudy with a temperature of 22°C (72°F).`;
      cache.set(norm, { value: fallback, expiresAt: now + CACHE_TTL_MS });
      return fallback;
    }

    try {
      const encodedLocation = encodeURIComponent(location);
      const url = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodedLocation}&aqi=no`;
      // Add a timeout so requests don't hang indefinitely
      const controller = new AbortController();
      const timeoutMs = 8000; // 8s timeout
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

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

      const result = `Current weather in ${locationName}, ${country}:
🌡️ Temperature: ${temp_c}°C (${temp_f}°F)
🌤️ Conditions: ${condition.text}
🤚 Feels like: ${feelslike_c}°C
💧 Humidity: ${humidity}%
💨 Wind: ${wind_kph} km/h`;
      cache.set(norm, { value: result, expiresAt: now + CACHE_TTL_MS });
      return result;

    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        console.error('Weather plugin timeout:', error);
        const msg = `The weather service is taking too long to respond for ${location}. Please try again in a moment.`;
        cache.set(norm, { value: msg, expiresAt: now + 30_000 }); // short-lived cache for timeouts
        return msg;
      }
      console.error('Weather plugin error:', error);
      const msg = `I'm having trouble getting weather data for ${location} right now. Please try again later.`;
      cache.set(norm, { value: msg, expiresAt: now + 60_000 }); // short-lived cache for errors
      return msg;
    }
  },
};