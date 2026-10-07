// App-authored icons are SVG, never Unicode glyphs that a mobile font can
// substitute with emoji. Keep the geometry shared by static and dynamic UI.
const paths={
  cloud:'M7 18h11a4 4 0 0 0 .4-8A6.5 6.5 0 0 0 6 8a5 5 0 0 0 1 10Z',
  copy:'M9 9h12v12H9ZM15 9V3H3v12h6',
  edit:'m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15Z',
  check:'m5 12 4 4L19 6',
  trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  folder:'M3 6h7l2 2h9v12H3ZM3 6V4h7l2 2h7v2',
  overview:'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  company:'M4 21V5l8-2v18M12 9h8v12M2 21h20M7 7v1M7 12v1M7 17v1M16 12v1M16 17v1',
  pipeline:'M4 4v16M12 4v16M20 4v16M2 7h4M10 11h4M18 6h4',
  calendar:'M4 5h16v16H4ZM8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 17h2',
  search:'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM16 16l5 5',
  briefcase:'M3 7h18v13H3ZM8 7V3h8v4M3 12c6 4 12 4 18 0M10 14h4',
  chart:'M4 3v18h17M8 16v-5M13 16V6M18 16V9',
  presentation:'M3 4h18v13H3ZM12 17v4M8 21h8M7 12l3-3 3 2 4-4',
  upload:'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
  info:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v6M12 7v.1',
  chevronDown:'m6 9 6 6 6-6',
  settings:'M4 7h16M4 17h16M8 4v6M16 14v6',
  logout:'M9 4H4v16h5M9 12h12m-5-5 5 5-5 5',
  wallet:'M3 6h18v14H3ZM3 6V3h15v3M16 11h5v5h-5Z',
  arrowUpRight:'M5 19 19 5M5 5h14v14',
  arrowRight:'M4 12h16m-7-7 7 7-7 7',
  arrowLeft:'M20 12H4m7-7-7 7 7 7',
  arrowDown:'M12 4v16m-7-7 7 7 7-7',
  arrowUp:'M12 20V4m-7 7 7-7 7 7',
  close:'M6 6l12 12M18 6 6 18',
  plus:'M12 5v14M5 12h14',
  refresh:'M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9',
  templates:'M4 4h16v16H4ZM4 9h16M8 13h8M8 16h8',
  play:'m8 5 11 7-11 7Z',
  pause:'M8 5v14M16 5v14',
  stop:'M6 6h12v12H6Z',
  clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2'
};
export function svgIcon(name,className='ui-icon') {
  if(!Object.hasOwn(paths,name)||!/^[a-zA-Z0-9 _-]+$/.test(className))throw new Error('Unknown SVG icon');
  return `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${paths[name]}"/></svg>`;
}
