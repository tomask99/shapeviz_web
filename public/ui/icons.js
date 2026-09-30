// App-authored icons are SVG, never Unicode glyphs that a mobile font can
// substitute with emoji. Keep the geometry shared by static and dynamic UI.
const paths={
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
  pause:'M8 5v14M16 5v14'
};
export function svgIcon(name,className='ui-icon') {
  if(!Object.hasOwn(paths,name)||!/^[a-zA-Z0-9 _-]+$/.test(className))throw new Error('Unknown SVG icon');
  return `<svg class="${className}" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${paths[name]}"/></svg>`;
}
