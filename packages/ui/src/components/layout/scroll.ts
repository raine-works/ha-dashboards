/**
 * A section's scrolling column in a panel: it scrolls to the screen's bottom edge, through
 * PanelLayout's bottom padding (p-5, p-3 below lg) instead of stopping short of it, and keeps that
 * space under its last card. Every column (Lighting, Security, Climate) uses it, so they all end at
 * the same edge. On a scrolling page the margin and padding cancel out.
 */
export const SECTION_SCROLLER = '-mb-5 overflow-y-auto pb-5 max-lg:-mb-3 max-lg:pb-3';
