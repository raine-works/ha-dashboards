// Who the household is: the people the dashboards list, message, assign chores to and greet. With
// the raineworks_dashboards integration loaded, it says (`raineworks_dashboards/info`: a Warden
// group's members, when one is picked in its options); without it, every person with a device
// tracker, which leaves out the admin account and pets. One list for the page, set by
// definePanelElement once the integration answers.
import type { HassEntity, HomeAssistant } from '../types/homeassistant';
import { setIntegrationHouse } from './house-config';

let members: ReadonlySet<string> | null = null;

/** The integration's household (person entity ids), or null when it hasn't said (or isn't there). */
export const householdIds = (): ReadonlySet<string> | null => members;

/** Set from the integration's answer (null: back to everyone with a device tracker). */
export function setHousehold(ids: readonly string[] | null) {
	members = ids ? new Set(ids) : null;
}

const hasTracker = (person: HassEntity) =>
	Array.isArray(person.attributes.device_trackers) && person.attributes.device_trackers.length > 0;

/** Whether a person entity is a household member. */
export function isHouseholdMember(person: HassEntity | undefined): person is HassEntity {
	if (!person?.entity_id.startsWith('person.')) return false;
	return members ? members.has(person.entity_id) : hasTracker(person);
}

/** The integration's name for itself, in `hass.config.components`. */
export const INTEGRATION = 'raineworks_dashboards';

interface IntegrationInfo {
	version?: string;
	household?: unknown;
	house?: unknown;
}

/**
 * Ask the integration who the household is (when it's loaded) and set it, with its house settings
 * (`setIntegrationHouse()`); resolves true when that changed the household. Without the
 * integration, or when it can't answer, nothing changes.
 */
export async function loadHousehold(hass: Pick<HomeAssistant, 'callWS' | 'config'>): Promise<boolean> {
	if (!hass.callWS || !hass.config?.components?.includes(INTEGRATION)) return false;
	try {
		const info = await hass.callWS<IntegrationInfo>({ type: `${INTEGRATION}/info` });
		const ids = Array.isArray(info?.household)
			? info.household.filter((id): id is string => typeof id === 'string')
			: null;
		setIntegrationHouse(info?.house);
		const before = members;
		setHousehold(ids);
		return before?.size !== members?.size || [...(members ?? [])].some((id) => !before?.has(id));
	} catch (err) {
		console.warn('Raineworks Dashboards: could not read the household', err);
		return false;
	}
}

/**
 * Where one of the house's actions goes: the integration's own (`raineworks_dashboards.<name>`)
 * when it has it, else the house's script of that name (the same fields).
 */
export function houseAction(hass: Pick<HomeAssistant, 'services'>, name: string): [domain: string, service: string] {
	return hass.services?.[INTEGRATION]?.[name] ? [INTEGRATION, name] : ['script', name];
}

/** Where a push to household phones goes (`houseAction()`). */
export const notifyPeopleAction = (hass: Pick<HomeAssistant, 'services'>) => houseAction(hass, 'notify_people');

/** Where a to-do item's push to whom it's for goes (`houseAction()`). */
export const todoAssigneeAction = (hass: Pick<HomeAssistant, 'services'>) => houseAction(hass, 'notify_todo_assignee');
