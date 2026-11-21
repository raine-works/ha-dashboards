import { createContext, useContext } from 'preact/compat';

/**
 * The wall panel this dashboard runs on, by name ("Kitchen wall panel"; the kitchen, basement and
 * hallway tablets, set by `definePanelElement`'s `wallPanel`), else false.
 */
export const WallPanelContext = createContext<string | false>(false);

/** On a wall panel: shared components leave out what only makes sense on a personal device, such as saving a camera clip. */
export const useWallPanel = () => !!useContext(WallPanelContext);

/**
 * The wall panel's name ("Kitchen wall panel"), else undefined: every panel signs in as the same
 * user, so what it changes is noted by name where that matters (arming and disarming).
 */
export const useWallPanelName = () => useContext(WallPanelContext) || undefined;
