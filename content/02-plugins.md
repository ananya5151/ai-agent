# Plugin Execution System

The agent's plugin system is designed for safety and reliability. Plugins are defined as simple objects with a name, description, parameter schema, and an `execute` function. This modular design allows new tools to be added with minimal effort.

# Currently, two plugins are implemented:

1.  **Math Evaluator**: This plugin uses the `math.js` library, which provides a sandboxed execution environment. It explicitly avoids using JavaScript's native `eval()` function, which is a major security vulnerability, to safely compute mathematical expressions.
2.  **Weather Plugin**: This tool fetches real-time weather data from the `WeatherAPI.com` service. It includes robust error handling for cases where the API key is missing or the requested location is not found.