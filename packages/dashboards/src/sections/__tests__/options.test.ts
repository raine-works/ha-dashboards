import { describe, expect, it } from 'bun:test';
import { lightingCardOptions, securityCardOptions } from '../options';

describe("the section cards' options", () => {
	it('give Lighting a title and floor, defaults for anything missing or of the wrong shape', () => {
		expect(lightingCardOptions(undefined)).toEqual({ title: 'Lighting', floor: undefined });
		expect(lightingCardOptions({ title: ' Downstairs ', floor: ' main_floor ' })).toEqual({
			title: 'Downstairs',
			floor: 'main_floor',
		});
		expect(lightingCardOptions({ title: 42, floor: '' })).toEqual({ title: 'Lighting', floor: undefined });
	});

	it('keep the cameras in Security unless turned off', () => {
		expect(securityCardOptions(undefined)).toEqual({ cameras: true });
		expect(securityCardOptions({ cameras: 'no' })).toEqual({ cameras: true });
		expect(securityCardOptions({ cameras: false })).toEqual({ cameras: false });
	});
});
