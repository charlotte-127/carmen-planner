/* App themes.
   Each theme sets the app's colors. A theme can also have a background:
     pattern: a small repeating SVG drawing (see the two cute themes below)
     image:   a picture file in the renderer/themes/ folder, e.g. image: 'themes/my-drawing.jpg'

   To add your own drawing as a theme:
     1. Save the picture (JPG or PNG, about 2400 px wide) in renderer/themes/
     2. Copy one of the entries below, give it a new id and name, and add  image: 'themes/your-file.jpg'
     3. Pick colors that suit the picture (paper = page color, panel = card color, accent = buttons)

   Color names: paper (page), panel (cards), ink / ink2 / ink3 (text, darkest to lightest),
   line / line2 (borders), accent / accentInk / accentWash (buttons, links, highlights),
   onAccent (text on buttons), courses (7 colors for courses). */
(function (root) {
  function svgUrl(svg) {
    return `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}")`;
  }

  // Original drawings: hearts, strawberries, dots.
  const strawberryTile = svgUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150">
      <g opacity="0.38">
        <path d="M22 34c-9-6-10-15-3-17 3-1 5 1 6 3 1-2 3-4 6-3 7 2 6 11-3 17l-3 2z" fill="#f7a6bc"/>
        <g transform="translate(96 30) rotate(12)">
          <path d="M0 4c10 0 15 7 12 16-2 7-7 12-12 15C-5 32-10 27-12 20-15 11-10 4 0 4z" fill="#f58aa7"/>
          <path d="M-7 4l4-2 3-5 3 5 4 2-3 3h-8z" fill="#92d3a3"/>
          <circle cx="-4" cy="14" r="1.1" fill="#fff"/><circle cx="4" cy="12" r="1.1" fill="#fff"/>
          <circle cx="0" cy="21" r="1.1" fill="#fff"/><circle cx="6" cy="20" r="1.1" fill="#fff"/><circle cx="-6" cy="22" r="1.1" fill="#fff"/>
        </g>
        <path d="M62 112c-7-5-8-12-2-13 2 0 4 1 5 3 1-2 2-3 5-3 5 1 4 8-3 13l-2 2z" fill="#fbc3d2"/>
        <g transform="translate(124 112) rotate(-14) scale(.8)">
          <path d="M0 4c10 0 15 7 12 16-2 7-7 12-12 15C-5 32-10 27-12 20-15 11-10 4 0 4z" fill="#f9a3bb"/>
          <path d="M-7 4l4-2 3-5 3 5 4 2-3 3h-8z" fill="#a7dcb4"/>
        </g>
        <circle cx="60" cy="40" r="2.5" fill="#f9c4d2"/><circle cx="18" cy="96" r="2" fill="#f9c4d2"/>
        <circle cx="104" cy="78" r="2" fill="#fbd3de"/><circle cx="38" cy="140" r="2.5" fill="#f9c4d2"/>
        <path d="M140 60l1.6 3.4 3.4 1.6-3.4 1.6L140 70l-1.6-3.4-3.4-1.6 3.4-1.6z" fill="#ffd27a"/>
      </g>
    </svg>`);

  // Original drawings: clouds, stars, sparkles.
  const cottonTile = svgUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
      <g opacity="0.6">
        <g fill="#ffffff">
          <circle cx="30" cy="40" r="11"/><circle cx="44" cy="34" r="14"/><circle cx="60" cy="41" r="10"/><rect x="28" y="40" width="34" height="11" rx="5.5"/>
        </g>
        <g fill="#ffffff" transform="translate(98 120) scale(.8)">
          <circle cx="30" cy="40" r="11"/><circle cx="44" cy="34" r="14"/><circle cx="60" cy="41" r="10"/><rect x="28" y="40" width="34" height="11" rx="5.5"/>
        </g>
        <path d="M134 30l3.5 7.2 7.9 1.1-5.7 5.6 1.3 7.9-7-3.7-7 3.7 1.3-7.9-5.7-5.6 7.9-1.1z" fill="#ffc8de"/>
        <path d="M40 128l2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.9z" fill="#c9d9ff"/>
        <path d="M96 76l1.8 4.2 4.2 1.8-4.2 1.8L96 88l-1.8-4.2-4.2-1.8 4.2-1.8z" fill="#ffffff"/>
        <path d="M160 96l1.4 3.1 3.1 1.4-3.1 1.4-1.4 3.1-1.4-3.1-3.1-1.4 3.1-1.4z" fill="#ffd6e8"/>
        <circle cx="14" cy="92" r="2.2" fill="#ffd6e8"/><circle cx="84" cy="160" r="2" fill="#c9d9ff"/><circle cx="168" cy="160" r="2.4" fill="#ffffff"/>
      </g>
    </svg>`);

  const PASTEL = ['#d94b77', '#5b8fd6', '#3f9e7a', '#d98a3d', '#8f6bd1', '#2f9fa8', '#b97456'];

  const THEMES = [
    { id: 'scarlet', name: 'Scarlet', note: 'Light or dark, like your computer', swatch: ['#f4f3f1', '#ffffff', '#ba0c2f'] },
    {
      id: 'midnight',
      name: 'Midnight',
      dark: true,
      vars: {
        paper: '#121826', panel: '#1a2234', ink: '#e8ecf4', ink2: '#b4bdd0', ink3: '#8a94aa', line: '#2a3550', line2: '#222c42',
        accent: '#8fb0ff', accentInk: '#b3c8ff', accentWash: '#202d4d', onAccent: '#121826',
        courses: ['#ff7b93', '#7fb0ff', '#62c99a', '#f2b25c', '#b394f0', '#4fc6cf', '#d9a07f'],
      },
    },
    {
      id: 'ocean',
      name: 'Ocean',
      vars: {
        paper: '#eef4f8', panel: '#ffffff', ink: '#14212b', ink2: '#45576a', ink3: '#6b7d8f', line: '#d3e0ea', line2: '#e3edf4',
        accent: '#1f6fae', accentInk: '#155a8f', accentWash: '#dcebf7', onAccent: '#ffffff',
        courses: ['#1f6fae', '#d9534f', '#2e8b6a', '#c98a1c', '#7a5cc2', '#138a97', '#a0623f'],
      },
    },
    {
      id: 'forest',
      name: 'Forest',
      vars: {
        paper: '#f1f4ee', panel: '#ffffff', ink: '#1b2a20', ink2: '#4b5d50', ink3: '#6f7f72', line: '#d9e1d4', line2: '#e7ece3',
        accent: '#2f6b45', accentInk: '#235236', accentWash: '#dfeadf', onAccent: '#ffffff',
        courses: ['#2f6b45', '#b5523b', '#3d6fa8', '#b8860b', '#7d5aa6', '#2a8a8a', '#8a6a4a'],
      },
    },
    {
      id: 'lavender',
      name: 'Lavender',
      vars: {
        paper: '#f5f2fa', panel: '#ffffff', ink: '#2a2238', ink2: '#5a4f6e', ink3: '#7a7090', line: '#e3dcef', line2: '#efeaf6',
        accent: '#6c45b0', accentInk: '#56348f', accentWash: '#ebe3f7', onAccent: '#ffffff',
        courses: ['#6c45b0', '#d1477a', '#3f86c4', '#3c9a72', '#d08a2e', '#2f9aa3', '#a8644c'],
      },
    },
    {
      id: 'sunset',
      name: 'Sunset',
      vars: {
        paper: '#fbf3ec', panel: '#ffffff', ink: '#2d1f17', ink2: '#5f4a3d', ink3: '#86705f', line: '#f0dccc', line2: '#f6e8dc',
        accent: '#c2491f', accentInk: '#9e3916', accentWash: '#fbe2d6', onAccent: '#ffffff',
        courses: ['#c2491f', '#3b6fb0', '#2e8a5f', '#b07d12', '#8b55b5', '#1f8f99', '#a5475f'],
      },
    },
    {
      id: 'graphite',
      name: 'Graphite',
      vars: {
        paper: '#f2f2f2', panel: '#ffffff', ink: '#161616', ink2: '#4a4a4a', ink3: '#707070', line: '#dcdcdc', line2: '#e9e9e9',
        accent: '#2b2b2b', accentInk: '#000000', accentWash: '#e4e4e4', onAccent: '#ffffff',
        courses: ['#2b2b2b', '#c0392b', '#2c6fb3', '#2f8a5a', '#b7791f', '#7b52ab', '#16838f'],
      },
    },
    {
      id: 'strawberry',
      name: 'Strawberry Milk',
      cute: true,
      vars: {
        paper: '#fff1f4', panel: '#fffafb', ink: '#4a2b33', ink2: '#7d5560', ink3: '#8f6573', line: '#f6d3dc', line2: '#fbe4ea',
        accent: '#c93f6b', accentInk: '#a92f57', accentWash: '#ffe0ea', onAccent: '#ffffff', mark: '#ffd3e1',
        courses: PASTEL,
      },
      pattern: strawberryTile,
      patternSize: '150px 150px',
    },
    {
      id: 'cotton',
      name: 'Cotton Candy',
      cute: true,
      vars: {
        paper: '#f6f1ff', panel: '#ffffff', ink: '#3b3557', ink2: '#5f587e', ink3: '#77709a', line: '#e4dcf5', line2: '#efe9fa',
        accent: '#b8508a', accentInk: '#963d6f', accentWash: '#fbe3f0', onAccent: '#ffffff', mark: '#e3dcff',
        courses: PASTEL,
      },
      pattern: `${cottonTile}, linear-gradient(160deg, #fde4f0 0%, #efe7ff 50%, #dfeaff 100%)`,
      patternSize: '180px 180px, cover',
    },
  ];

  const VAR_NAMES = {
    paper: '--paper', panel: '--panel', ink: '--ink', ink2: '--ink-2', ink3: '--ink-3', line: '--line', line2: '--line-2',
    accent: '--scarlet', accentInk: '--scarlet-ink', accentWash: '--scarlet-wash', onAccent: '--on-accent',
  };

  function get(id) {
    return THEMES.find((t) => t.id === id) || THEMES[0];
  }

  // picture: a data URL of the student's own background picture, or null
  function apply(id, picture) {
    const t = get(id);
    const el = document.documentElement;
    const st = el.style;
    Object.values(VAR_NAMES).forEach((v) => st.removeProperty(v));
    for (let i = 1; i <= 7; i++) st.removeProperty(`--c${i}`);
    ['--bg-image', '--bg-size', '--bg-repeat', '--bg-position'].forEach((v) => st.removeProperty(v));
    ['--ok', '--warn', '--mark'].forEach((v) => st.removeProperty(v));
    if (t.vars) {
      Object.entries(VAR_NAMES).forEach(([k, v]) => t.vars[k] && st.setProperty(v, t.vars[k]));
      st.setProperty('--ok', t.dark ? '#5cb383' : '#2f7d4f');
      st.setProperty('--warn', t.dark ? '#e09a45' : '#a35a00');
      st.setProperty('--mark', t.vars.mark || (t.dark ? 'rgba(250, 204, 21, 0.32)' : '#ffe58f'));
      (t.vars.courses || []).forEach((c, i) => st.setProperty(`--c${i + 1}`, c));
    }
    el.dataset.theme = t.id;
    el.dataset.scheme = t.vars ? (t.dark ? 'dark' : 'light') : 'auto';
    st.colorScheme = t.vars ? (t.dark ? 'dark' : 'light') : '';
    let bg = 'none';
    if (picture) {
      st.setProperty('--bg-image', `url("${picture}")`);
      st.setProperty('--bg-size', 'cover');
      st.setProperty('--bg-repeat', 'no-repeat');
      st.setProperty('--bg-position', 'center');
      bg = 'picture';
    } else if (t.image) {
      st.setProperty('--bg-image', `url("${t.image}")`);
      st.setProperty('--bg-size', 'cover');
      st.setProperty('--bg-repeat', 'no-repeat');
      st.setProperty('--bg-position', 'center');
      bg = 'picture';
    } else if (t.pattern) {
      st.setProperty('--bg-image', t.pattern);
      st.setProperty('--bg-size', t.patternSize || 'auto');
      st.setProperty('--bg-repeat', 'repeat');
      bg = 'pattern';
    }
    el.dataset.bg = bg;
    return t;
  }

  // Background for the small preview in the theme picker: apply it with element.style.
  function previewStyle(t) {
    const v = t.vars || { paper: '#f4f3f1', panel: '#ffffff', accent: '#ba0c2f', line: '#e2dfda', ink: '#1f1d1b', courses: ['#ba0c2f', '#2f5d8a', '#2f7d4f'] };
    const style = { backgroundColor: v.paper, backgroundImage: 'none', backgroundSize: 'auto', backgroundPosition: 'center' };
    if (t.image) {
      style.backgroundImage = `url("${t.image}")`;
      style.backgroundSize = 'cover';
    } else if (t.pattern) {
      style.backgroundImage = t.pattern;
      style.backgroundSize = (t.patternSize || 'auto').replace(/\d+px \d+px/g, '64px 64px');
    }
    return { style, v };
  }

  const api = { THEMES, get, apply, previewStyle };
  root.Themes = api;
})(window);
