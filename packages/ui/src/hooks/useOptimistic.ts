/** Optimistic state: a pick shown at once, before Home Assistant reports it. */

import { useEffect, useState } from 'preact/compat';
import { CONFIRM_TIMEOUT_MS } from '../context/HassContext';

/**
 * A control showing what was picked (a mode, a preset) at once, until Home Assistant reports it
 * (or the confirm timeout passes), instead of waiting seconds for the device. `pending` is true
 * meanwhile, for a quiet "on its way" hint.
 */
export function useOptimistic<T>(reported: T, isEqual: (a: T, b: T) => boolean = Object.is) {
	// `hold`: picked back to what's reported while another pick was still on its way, so the device
	// will report that other one first; kept until the report moves off it, then cleared as usual
	const [target, setTarget] = useState<{ value: T; hold?: boolean } | null>(null);

	useEffect(() => {
		if (!target) return;
		const same = isEqual(target.value, reported);
		if (target.hold) {
			if (!same) setTarget({ value: target.value });
		} else if (same) setTarget(null);
	}, [reported, target]);

	useEffect(() => {
		if (!target) return;
		const timer = setTimeout(() => setTarget(null), CONFIRM_TIMEOUT_MS);
		return () => clearTimeout(timer);
	}, [target]);

	return {
		value: target ? target.value : reported,
		set: (value: T) =>
			setTarget(
				!isEqual(value, reported) ? { value } : target && !isEqual(target.value, value) ? { value, hold: true } : null,
			),
		pending: target !== null,
	};
}
