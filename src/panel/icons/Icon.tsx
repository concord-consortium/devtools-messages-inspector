import centerFocusRaw from './material-symbols/center_focus_strong_24dp_1F1F1F_FILL0_wght400_GRAD0_opsz24.svg?raw';
import downloadRaw from './material-symbols/download_24dp_1F1F1F_FILL0_wght400_GRAD0_opsz24.svg?raw';
import filterListRaw from './material-symbols/filter_list_24dp_1F1F1F_FILL0_wght400_GRAD0_opsz24.svg?raw';
import refreshRaw from './material-symbols/refresh_24dp_1F1F1F_FILL0_wght400_GRAD0_opsz24.svg?raw';
import settingsRaw from './material-symbols/settings_24dp_1F1F1F_FILL0_wght400_GRAD0_opsz24.svg?raw';
import viewListRaw from './material-symbols/view_list_24dp_1F1F1F_FILL0_wght400_GRAD0_opsz24.svg?raw';

const extractPath = (svg: string): string => {
  const match = svg.match(/<path\s+d="([^"]+)"/);
  if (!match) throw new Error('No <path d="..."> found in SVG');
  return match[1];
};

const paths = {
  centerFocus: extractPath(centerFocusRaw),
  download: extractPath(downloadRaw),
  filterList: extractPath(filterListRaw),
  refresh: extractPath(refreshRaw),
  settings: extractPath(settingsRaw),
  viewList: extractPath(viewListRaw),
} as const;

export type IconName = keyof typeof paths;

export const Icon = ({ name, size = 16 }: { name: IconName; size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 -960 960 960"
    width={size}
    height={size}
    fill="currentColor"
    aria-hidden
  >
    <path d={paths[name]} />
  </svg>
);
