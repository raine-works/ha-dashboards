import { describe, expect, it } from 'bun:test';
import {
	forecastRange,
	formatForecastDay,
	formatForecastHour,
	formatReading,
	formatWeatherCondition,
	formatWindDirection,
	hourlyRows,
	rangeBar,
	upcomingHours,
	uvLevel,
} from '../weather';

describe('formatWeatherCondition', () => {
	it('labels Home Assistant conditions', () => {
		expect(formatWeatherCondition('partlycloudy')).toBe('Partly cloudy');
		expect(formatWeatherCondition('clear-night')).toBe('Clear');
		expect(formatWeatherCondition('snowy-rainy')).toBe('Sleet');
	});

	it('falls back to readable text for unknown conditions', () => {
		expect(formatWeatherCondition('dust-storm')).toBe('Dust storm');
		expect(formatWeatherCondition('')).toBe('');
	});
});

describe('formatWindDirection', () => {
	it('names the compass point', () => {
		expect(formatWindDirection(0)).toBe('N');
		expect(formatWindDirection(252)).toBe('WSW');
		expect(formatWindDirection(359)).toBe('N');
		expect(formatWindDirection(undefined)).toBe('');
	});
});

describe('uvLevel', () => {
	it('uses the WHO bands', () => {
		expect(uvLevel(2)).toBe('Low');
		expect(uvLevel(3)).toBe('Moderate');
		expect(uvLevel(7)).toBe('High');
		expect(uvLevel(10)).toBe('Very high');
		expect(uvLevel(11)).toBe('Extreme');
		expect(uvLevel(undefined)).toBe('');
	});
});

describe('forecast times', () => {
	const now = new Date(2026, 9, 19, 12, 20);
	it('labels the current hour Now', () => {
		expect(formatForecastHour(new Date(2026, 9, 19, 12).toISOString(), now)).toBe('Now');
		expect(formatForecastHour(new Date(2026, 9, 19, 15).toISOString(), now)).toBe('3 PM');
	});

	it('labels today and then weekdays', () => {
		expect(formatForecastDay(new Date(2026, 9, 19, 7).toISOString(), now)).toBe('Today');
		expect(formatForecastDay(new Date(2026, 9, 20, 7).toISOString(), now)).toBe('Tue');
	});

	it('drops hours that have passed', () => {
		const hours = [10, 11, 12, 13, 14].map((h) => ({ datetime: new Date(2026, 9, 19, h).toISOString() }));
		expect(upcomingHours(hours, now, 2).map((h) => new Date(h.datetime).getHours())).toEqual([12, 13]);
	});
});

describe('forecast ranges', () => {
	const days = [
		{ datetime: '', temperature: 66, templow: 46 },
		{ datetime: '', temperature: 71, templow: 51 },
		{ datetime: '', temperature: 54, templow: 41 },
	];
	it('spans the lowest low to the highest high', () => {
		expect(forecastRange(days)).toEqual({ min: 41, max: 71 });
		expect(forecastRange([])).toBeUndefined();
	});

	it('places a day on that range', () => {
		expect(rangeBar(41, 71, { min: 41, max: 71 })).toEqual({ left: 0, width: 100 });
		expect(rangeBar(56, 56, { min: 41, max: 71 })).toEqual({ left: 50, width: 4 });
		// A day at the top of the range keeps its minimum width inside the track
		expect(rangeBar(71, 71, { min: 41, max: 71 })).toEqual({ left: 96, width: 4 });
	});
});

describe('formatReading', () => {
	it('rounds with a unit, or shows a dash', () => {
		expect(formatReading(3.11, 'mph')).toBe('3 mph');
		expect(formatReading(30.06, 'inHg', 2)).toBe('30.06 inHg');
		expect(formatReading(undefined, 'mph')).toBe('—');
	});
});

describe('hourlyRows', () => {
	it('turns the hourly forecast into chart rows, null for a missing reading', () => {
		const [row] = hourlyRows([
			{
				datetime: '2026-11-02T01:00:00Z',
				condition: 'rainy',
				temperature: 47,
				apparent_temperature: 46,
				precipitation_probability: 40,
				precipitation: 0.03,
				wind_speed: 3.73,
				is_daytime: false,
			},
		]);
		expect(row).toEqual({
			at: Date.parse('2026-11-02T01:00:00Z'),
			temperature: 47,
			feelsLike: 46,
			rainChance: 40,
			rainAmount: 0.03,
			wind: 3.73,
			gusts: null,
			condition: 'rainy',
			night: true,
		});
	});
});
