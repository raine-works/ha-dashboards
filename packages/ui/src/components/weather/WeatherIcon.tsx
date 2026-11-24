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

// Small semantic accents (both shades): sun amber, night indigo, rain sky, snow cyan, storms violet
const SUN = 'text-amber-500 dark:text-amber-400';
const NIGHT = 'text-indigo-500 dark:text-indigo-300';
const RAIN = 'text-sky-600 dark:text-sky-400';
const SNOW = 'text-cyan-600 dark:text-cyan-300';
const STORM = 'text-violet-600 dark:text-violet-400';
const MUTED = 'text-muted-foreground';

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
