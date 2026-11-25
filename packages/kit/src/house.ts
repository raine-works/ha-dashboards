/**
 * What a house's own config repository checks its settings against: the parser the dashboards read
 * `house.yaml` with, and the bedtime routines they describe. Published as `@raineworks/ha-dashboards/house`.
 *
 * @module
 */

export {
	BEDTIME_STEP_KINDS,
	type BedtimeRoutine,
	type BedtimeStep,
	type BedtimeStepKind,
	HOME_ROUTINE,
} from '../../ui/src/lib/bedtime';
export { type HouseConfig, mergeHouseSources, parseHouseConfig } from '../../ui/src/lib/house-config';
