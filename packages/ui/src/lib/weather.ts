import { capitalize } from './text';

// Home Assistant weather conditions (weather entity states) as display text
const CONDITIONS: Record<string, string> = {
	'clear-night': 'Clear',
	cloudy: 'Cloudy',
	exceptional: 'Exceptional',
	fog: 'Fog',
	hail: 'Hail',
	lightning: 'Lightning',
	'lightning-rainy': 'Thunderstorms',
	partlycloudy: 'Partly cloudy',
	pouring: 'Pouring',
	rainy: 'Rainy',
	snowy: 'Snowy',
	'snowy-rainy': 'Sleet',
	sunny: 'Sunny',
	windy: 'Windy',
	'windy-variant': 'Windy',
};

/** "partlycloudy" → "Partly cloudy"; unknown conditions get dashes turned into spaces and a capital. */
export function formatWeatherCondition(condition: string): string {
	const known = CONDITIONS[condition];
	if (known) return known;
	return capitalize(condition.replace(/[-_]/g, ' '));
}

/** One entry of a `weather/subscribe_forecast` (or `weather.get_forecasts`) forecast. */
export interface WeatherForecast {
	datetime: string;
	condition?: string;
	temperature?: number;
	/** Daily forecasts' low. */
	templow?: number;
	apparent_temperature?: number;
	precipitation?: number;
	precipitation_probability?: number;
	humidity?: number;
	wind_speed?: number;
	wind_gust_speed?: number;
	wind_bearing?: number;
	uv_index?: number;
	cloud_coverage?: number;
	/** Hourly forecasts: day or night, for the icon. */
	is_daytime?: boolean;
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** Wind bearing in degrees (where it blows from) → "WSW". */
export function formatWindDirection(bearing?: number | null): string {
	if (bearing == null || Number.isNaN(bearing)) return '';
	return COMPASS[Math.round((((bearing % 360) + 360) % 360) / 22.5) % 16];
}

/** The UV index's WHO band: Low, Moderate, High, Very high, Extreme. */
export function uvLevel(uv?: number | null): string {
	if (uv == null) return '';
	if (uv < 3) return 'Low';
	if (uv < 6) return 'Moderate';
	if (uv < 8) return 'High';
	if (uv < 11) return 'Very high';
	return 'Extreme';
}

/** An hourly forecast's hour: "Now" for the current hour, then "3 PM". */
export function formatForecastHour(datetime: string, now = new Date()): string {
	const date = new Date(datetime);
	if (date <= now && now.getTime() - date.getTime() < 3_600_000) return 'Now';
	return date.toLocaleTimeString('en-US', { hour: 'numeric' });
}

/** A daily forecast's day: "Today", then "Tue". */
export function formatForecastDay(datetime: string, now = new Date()): string {
	const date = new Date(datetime);
	if (date.toDateString() === now.toDateString()) return 'Today';
	return date.toLocaleDateString('en-US', { weekday: 'short' });
}

/** The lowest low and highest high across daily forecasts, for their range bars. */
export function forecastRange(days: WeatherForecast[]): { min: number; max: number } | undefined {
	const lows = days.map((d) => d.templow ?? d.temperature).filter((t): t is number => t != null);
	const highs = days.map((d) => d.temperature).filter((t): t is number => t != null);
	if (lows.length === 0 || highs.length === 0) return undefined;
	return { min: Math.min(...lows), max: Math.max(...highs) };
}

/** Where a day's low-to-high bar sits on the week's range, as left/width percentages. */
export function rangeBar(
	low: number,
	high: number,
	range: { min: number; max: number },
): { left: number; width: number } {
	const span = range.max - range.min || 1;
	const width = Math.max(((high - low) / span) * 100, 4);
	// The minimum width never pushes a day at the top of the range past the track's end
	return { left: Math.min(((low - range.min) / span) * 100, 100 - width), width };
}

/** Hourly forecasts from the current hour on (HA's list can start with an hour that has passed). */
export function upcomingHours(hours: WeatherForecast[], now = new Date(), count = 24): WeatherForecast[] {
	return hours.filter((h) => new Date(h.datetime).getTime() > now.getTime() - 3_600_000).slice(0, count);
}

/** A temperature, rounded: "67°" (an em dash for none). */
export const formatDegrees = (value?: number | null) => (value == null ? '—' : `${Math.round(value)}°`);

/** A rounded reading with its unit, or an em dash: "8 mph", "30.06 inHg". */
export function formatReading(value: unknown, unit?: string, digits = 0): string {
	if (typeof value !== 'number' || Number.isNaN(value)) return '—';
	const text = value.toFixed(digits);
	return unit ? `${text} ${unit}` : text;
}

/** An hour on the weather charts: when (ms), its readings (null when the forecast lacks one), and its icon. */
export interface HourlyRow {
	at: number;
	temperature: number | null;
	feelsLike: number | null;
	rainChance: number | null;
	rainAmount: number | null;
	wind: number | null;
	gusts: number | null;
	condition?: string;
	night: boolean;
}

const reading = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** The hourly forecast as chart rows. */
export const hourlyRows = (hours: WeatherForecast[]): HourlyRow[] =>
	hours.map((h) => ({
		at: Date.parse(h.datetime),
		temperature: reading(h.temperature),
		feelsLike: reading(h.apparent_temperature),
		rainChance: reading(h.precipitation_probability),
		rainAmount: reading(h.precipitation),
		wind: reading(h.wind_speed),
		gusts: reading(h.wind_gust_speed),
		condition: h.condition,
		night: h.is_daytime === false,
	}));
