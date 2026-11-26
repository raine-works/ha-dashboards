/**
 * Weather conditions' icons and their colors.
 *
 * @module
 */

import {
	AlertTriangle,
	CloudFog,
	CloudHail,
	CloudLightning,
	CloudMoon,
	CloudRain,
	CloudRainWind,
	CloudSnow,
	CloudSun,
	Cloudy,
	type LucideIcon,
	Moon,
	Sun,
	Wind,
} from 'lucide-react';
import type React from 'preact/compat';
import { cn } from '../../lib/utils';

// Small accents from the theme's chart colors (never a status, never a raw palette class: docs/design/color.md),
// so each theme tints them its own way: sun the warm series, rain the blue, night and storms the violet. Snow and
// fog stay neutral; the icon tells them apart.
const SUN = 'text-chart-4';
const NIGHT = 'text-chart-7';
const RAIN = 'text-chart-1';
const STORM = 'text-chart-7';
const MUTED = 'text-muted-foreground';
const SNOW = MUTED;

/** A Home Assistant weather condition's icon and color, by day or night. */
export function weatherIcon(condition: string | undefined, night = false): { icon: LucideIcon; color: string } {
	switch (condition) {
		case 'sunny':
			return night ? { icon: Moon, color: NIGHT } : { icon: Sun, color: SUN };
		case 'clear-night':
			return { icon: Moon, color: NIGHT };
		case 'partlycloudy':
			return night ? { icon: CloudMoon, color: NIGHT } : { icon: CloudSun, color: SUN };
		case 'cloudy':
			return { icon: Cloudy, color: MUTED };
		case 'fog':
			return { icon: CloudFog, color: MUTED };
		case 'rainy':
			return { icon: CloudRain, color: RAIN };
		case 'pouring':
			return { icon: CloudRainWind, color: RAIN };
		case 'lightning':
		case 'lightning-rainy':
			return { icon: CloudLightning, color: STORM };
		case 'snowy':
		case 'snowy-rainy':
			return { icon: CloudSnow, color: SNOW };
		case 'hail':
			return { icon: CloudHail, color: SNOW };
		case 'windy':
		case 'windy-variant':
			return { icon: Wind, color: MUTED };
		case 'exceptional':
			return { icon: AlertTriangle, color: SUN };
		default:
			return night ? { icon: Moon, color: NIGHT } : { icon: Sun, color: SUN };
	}
}

/** A weather condition's icon in its color (`weatherIcon`), hidden from screen readers. */
export const WeatherIcon: React.FC<{ condition?: string; night?: boolean; className?: string }> = ({
	condition,
	night,
	className,
}) => {
	const { icon: Icon, color } = weatherIcon(condition, night);
	return <Icon aria-hidden className={cn('shrink-0', color, className)} />;
};
