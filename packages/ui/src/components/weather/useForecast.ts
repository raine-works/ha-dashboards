import { useEffect, useState } from 'preact/compat';
import { useHassConnection } from '../../context/HassContext';
import type { WeatherForecast } from '../../lib/weather';

/**
 * A weather entity's daily or hourly forecast, live (`weather/subscribe_forecast` pushes each
 * update) while `enabled`; `failed` when Home Assistant refused the subscription, `retry` to ask again.
 */
export function useForecast(entityId: string | undefined, type: 'daily' | 'hourly', enabled: boolean) {
	const [forecast, setForecast] = useState<WeatherForecast[]>([]);
	const [failed, setFailed] = useState(false);
	const [attempt, setAttempt] = useState(0);
	const connection = useHassConnection();

	useEffect(() => {
		if (!enabled || !entityId || !connection?.subscribeMessage) return;
		let cancelled = false;
		let unsubscribe: (() => void) | undefined;
		setFailed(false);
		connection
			.subscribeMessage<{ forecast?: WeatherForecast[] | null }>(
				(event) => !cancelled && setForecast(event.forecast ?? []),
				{ type: 'weather/subscribe_forecast', entity_id: entityId, forecast_type: type },
			)
			.then((unsub) => {
				if (cancelled) unsub();
				else unsubscribe = unsub;
			})
			.catch(() => {
				if (cancelled) return;
				setForecast([]);
				setFailed(true);
			});
		return () => {
			cancelled = true;
			unsubscribe?.();
		};
	}, [enabled, entityId, type, connection, attempt]);

	return { forecast, failed, retry: () => setAttempt((n) => n + 1) };
}
