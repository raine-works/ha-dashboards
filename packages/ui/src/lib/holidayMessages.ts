// Quick messages for a holiday's days (lib/holidays.ts): the intercom's announcements and phone
// messages and the printed notes get a category of their own, first and picked, and the cameras'
// talkback leads with the holiday's lines. Spoken ones (announcements, talkback) carry no emoji: TTS
// would read them out. Notes are plain characters: the receipt printer prints in its code page.

import type { HolidayId } from './holidays';
import type { AnnouncementPreset, PresetCategory } from './intercom';

export interface HolidayMessages {
	/** The category chip: "🎃 Halloween". */
	label: string;
	announcements: AnnouncementPreset[];
	/** Pushes to phones (emoji welcome). */
	phone: string[];
	/** Notes for the receipt printer (plain characters only, like `NOTE_PRESETS`). */
	notes: string[];
	/** Talkback at the doorbell, for visitors and trick-or-treaters. */
	doorbell: string[];
	/** Talkback on the indoor cameras, for the family. */
	indoor: string[];
}

export const HOLIDAY_MESSAGES: Record<HolidayId, HolidayMessages> = {
	'new-year': {
		label: "🎉 New Year's",
		announcements: [
			{ label: 'Countdown soon', message: "The New Year's countdown is starting soon! Everyone to the living room." },
			{ label: 'Midnight toast', message: "Grab a glass, it's almost midnight!" },
			{ label: 'Resolutions', message: "Time to share our New Year's resolutions!" },
			{ label: 'Happy New Year', message: 'Happy New Year, everyone!' },
		],
		phone: ['Happy New Year! 🎉', 'Countdown soon, where are you? ⏰', 'Cheers to a great year! 🥂'],
		notes: [
			"Happy New Year! Here's to a great year.",
			'Countdown in the living room at 11:55!',
			'Write down a resolution and bring it to the party.',
			'Cheers to new adventures this year!',
		],
		doorbell: ["Happy New Year! We'll be right there.", 'Happy New Year! Thanks for stopping by.'],
		indoor: ['Happy New Year!', 'Countdown soon!'],
	},
	valentines: {
		label: "💝 Valentine's",
		announcements: [
			{ label: 'Love you all', message: "Happy Valentine's Day! We love you all." },
			{ label: 'Valentine treats', message: "Valentine's treats are in the kitchen!" },
			{ label: 'Date night', message: 'Date night is starting soon. Kids, be good!' },
		],
		phone: ["Happy Valentine's Day! ❤️", 'Be my Valentine? 💌', 'Love you! 💕'],
		notes: [
			"Happy Valentine's Day! I love you.",
			'Be my Valentine?',
			'You make every day sweeter.',
			'Check the fridge for a sweet surprise.',
		],
		doorbell: ["Happy Valentine's Day! We'll be right there.", "Happy Valentine's Day! Please leave it by the door."],
		indoor: ["Happy Valentine's Day!", 'Love you!'],
	},
	'st-patricks': {
		label: "☘️ St. Patrick's",
		announcements: [
			{ label: 'Wear green', message: "Don't forget to wear green today, or you might get pinched!" },
			{ label: 'Leprechaun spotted', message: 'A leprechaun has been spotted in the house! Check for gold.' },
			{ label: 'Lucky breakfast', message: 'A lucky breakfast is served in the kitchen!' },
		],
		phone: ["Happy St. Patrick's Day! ☘️", 'Wear green today! 💚', 'Feeling lucky? 🍀'],
		notes: [
			"Happy St. Patrick's Day! Wear green!",
			"Feeling lucky? Look for the leprechaun's gold.",
			"You're my lucky charm.",
			'Green pancakes for breakfast!',
		],
		doorbell: [
			"Happy St. Patrick's Day! We'll be right there.",
			'Top of the morning! Please leave the package by the door.',
		],
		indoor: ["Happy St. Patrick's Day!", 'Wear green!'],
	},
	easter: {
		label: '🐣 Easter',
		announcements: [
			{ label: 'Egg hunt', message: 'The Easter egg hunt is starting! Grab your baskets.' },
			{ label: 'The Bunny came', message: 'The Easter Bunny has been here! Go see what he left.' },
			{ label: 'Easter dinner', message: 'Easter dinner is ready! Come to the table.' },
			{ label: 'Church time', message: 'Time to get ready for church!' },
		],
		phone: ['Happy Easter! 🐣', 'Egg hunt soon! 🥚', 'Easter dinner is ready! 🍽️'],
		notes: [
			'Happy Easter! The Bunny was here.',
			'Egg hunt starts after breakfast!',
			'Easter baskets are hidden. Happy hunting!',
			'He is risen! Happy Easter.',
		],
		doorbell: ["Happy Easter! We'll be right there.", 'Happy Easter! Please leave the package by the door.'],
		indoor: ['Happy Easter!', 'Egg hunt soon!'],
	},
	'mothers-day': {
		label: "💐 Mother's Day",
		announcements: [
			{ label: 'Thanks, Mom', message: "Happy Mother's Day! Thank you for everything, Mom." },
			{ label: 'Breakfast for Mom', message: "Mother's Day breakfast is ready! Mom, come to the kitchen." },
			{ label: 'Card time', message: 'Time to give Mom her cards!' },
		],
		phone: ["Happy Mother's Day! 💐", 'Love you, Mom! 💖', 'Thanks for everything, Mom 🌷'],
		notes: [
			"Happy Mother's Day! We love you, Mom.",
			"Mom, today you relax. We've got this.",
			'Thank you for everything, Mom.',
			'Breakfast in bed is on its way!',
		],
		doorbell: ["Happy Mother's Day! We'll be right there."],
		indoor: ["Happy Mother's Day!", 'Love you, Mom!'],
	},
	'fathers-day': {
		label: "👔 Father's Day",
		announcements: [
			{ label: 'Thanks, Dad', message: "Happy Father's Day! Thanks for everything, Dad." },
			{ label: 'Barbecue', message: "The grill is fired up! Father's Day barbecue soon." },
			{
				label: 'Dad joke',
				message: "Dad joke time: I'm reading a book about anti-gravity. It's impossible to put down.",
			},
		],
		phone: ["Happy Father's Day! 👔", 'Love you, Dad! 💙', 'Grill master on duty 🍔'],
		notes: [
			"Happy Father's Day! We love you, Dad.",
			"Dad, today you relax. We've got this.",
			'Thanks for everything, Dad.',
			"World's best dad. Officially.",
		],
		doorbell: ["Happy Father's Day! We'll be right there."],
		indoor: ["Happy Father's Day!", 'Love you, Dad!'],
	},
	'independence-day': {
		label: '🎆 4th of July',
		announcements: [
			{ label: 'Fireworks soon', message: 'Fireworks are starting soon! Everyone outside.' },
			{ label: 'Barbecue', message: 'The barbecue is ready! Come grab a plate.' },
			{ label: 'Sparklers', message: 'Sparkler time! Meet in the backyard.' },
			{ label: 'Parade', message: 'Time to head to the parade!' },
		],
		phone: ['Happy 4th of July! 🎆', 'Fireworks soon! 🎇', "The barbecue's ready 🍔"],
		notes: [
			'Happy 4th of July!',
			'Fireworks tonight! Meet outside at dark.',
			'Barbecue at 5. Bring your appetite!',
			'Sparklers are in the garage.',
		],
		doorbell: [
			"Happy 4th of July! We'll be right there.",
			'Happy Independence Day! Please leave the package by the door.',
		],
		indoor: ['Happy 4th of July!', 'Fireworks soon!'],
	},
	halloween: {
		label: '🎃 Halloween',
		announcements: [
			{ label: 'Costume time', message: 'Time to get into your costumes! Trick-or-treating starts soon.' },
			{ label: 'Trick-or-treaters', message: "Trick-or-treaters are at the door! Who's handing out candy?" },
			{ label: 'Candy check', message: 'Candy inspection in the kitchen in five minutes. No sneaking pieces!' },
			{ label: 'Pumpkin carving', message: 'Pumpkin carving is starting in the kitchen. Bring your best ideas!' },
			{ label: 'Something spooky', message: 'Something spooky is lurking in the hallway. Proceed with caution.' },
		],
		phone: ['Happy Halloween! 🎃', 'Costumes on, trick-or-treating soon! 👻', 'Save me some candy 🍬', 'Boo! 👻'],
		notes: [
			'Happy Halloween!',
			'Costumes on by 6. Trick-or-treating soon!',
			'Candy inspection before eating, please.',
			'Boo! Something spooky is in the hallway...',
		],
		doorbell: [
			'Happy Halloween! Please take one piece of candy.',
			'Great costume! Happy Halloween!',
			"Trick or treat! We'll be right there.",
			"Sorry, we're all out of candy. Happy Halloween!",
		],
		indoor: ['Happy Halloween!', 'Save me some candy', 'Boo!'],
	},
	thanksgiving: {
		label: '🦃 Thanksgiving',
		announcements: [
			{ label: 'Dinner is ready', message: 'Thanksgiving dinner is ready! Come to the table.' },
			{ label: 'Pie time', message: 'Pie is served! Pumpkin or apple, take your pick.' },
			{ label: 'Game time', message: 'The game is starting! Grab a snack and a seat.' },
			{ label: 'Thankful', message: "Before we eat, let's each think of one thing we're thankful for." },
			{ label: 'Kitchen help', message: 'The cooks need a hand in the kitchen, please!' },
		],
		phone: ['Happy Thanksgiving! 🦃', 'Dinner is at the table soon 🥧', 'Thankful for you 🧡', 'Bring the rolls! 🍞'],
		notes: [
			'Happy Thanksgiving! Thankful for you.',
			"Dinner is at 3. Don't fill up on snacks!",
			'Please set the table for dinner.',
			'What are you thankful for today?',
		],
		doorbell: [
			'Happy Thanksgiving! Come on in.',
			"Happy Thanksgiving! We'll be right there.",
			'Happy Thanksgiving! Please leave the package by the door.',
		],
		indoor: ['Happy Thanksgiving!', "Dinner's almost ready", 'Thankful for you'],
	},
	christmas: {
		label: '🎄 Christmas',
		announcements: [
			{ label: 'Cookies are ready', message: 'Fresh Christmas cookies are out of the oven! Come and get them.' },
			{ label: 'Present time', message: 'Time to open presents! Everyone to the tree.' },
			{ label: 'Santa is coming', message: "Santa's on his way! Time to get to bed." },
			{ label: 'Carols', message: 'Christmas carols in the living room. Bring your best singing voice!' },
			{ label: 'Movie night', message: 'Christmas movie night is starting. Grab a blanket and some cocoa.' },
		],
		phone: [
			'Merry Christmas! 🎄',
			'Cookies are out of the oven 🍪',
			'Time to open presents! 🎁',
			'Love you, see you soon ❤️',
		],
		notes: [
			'Merry Christmas!',
			'Cookies for Santa are on the counter.',
			'Presents after breakfast!',
			'Merry Christmas! Love you to the North Pole and back.',
		],
		doorbell: [
			"Merry Christmas! We'll be right there.",
			'Merry Christmas! Please leave the package by the door.',
			'Happy holidays! Thanks for stopping by.',
		],
		indoor: ['Merry Christmas!', 'Cookies are ready', 'Love you, see you soon'],
	},
};

/**
 * The intercom's categories with the holiday's first, `featured` (the picker opens on it); just
 * the categories when no holiday is near.
 */
export function withHolidayCategory<T>(
	categories: PresetCategory<T>[],
	holiday: HolidayId | null | undefined,
	presets: (messages: HolidayMessages) => T[],
): PresetCategory<T>[] {
	if (!holiday) return categories;
	const messages = HOLIDAY_MESSAGES[holiday];
	return [{ id: 'holiday', label: messages.label, presets: presets(messages), featured: true }, ...categories];
}
