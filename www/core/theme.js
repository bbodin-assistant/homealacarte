export const COLOR_THEMES = [
  {
    paper: "#f7f4ed", surface: "#fffdf8", surfaceStrong: "#ffffff",
    ink: "#2f2b27", muted: "#746e66", line: "#e5dfd4", lineStrong: "#d6cdbf",
    accent: "#b45e46", accentDark: "#8e4533", accentSoft: "#f3dfd8",
    green: "#557763", greenSoft: "#e2ece5", gold: "#c38a39",
  },
  {
    paper: "#eef6f8", surface: "#fbfeff", surfaceStrong: "#ffffff",
    ink: "#17343c", muted: "#5e7780", line: "#d4e4e8", lineStrong: "#bfd4d9",
    accent: "#167d91", accentDark: "#0d5b6c", accentSoft: "#d4edf2",
    green: "#6c7f3f", greenSoft: "#e7edd8", gold: "#d69035",
  },
  {
    paper: "#f6f1fa", surface: "#fefbff", surfaceStrong: "#ffffff",
    ink: "#34283c", muted: "#786a80", line: "#e6dbea", lineStrong: "#d6c7dc",
    accent: "#7c4d9e", accentDark: "#5f347e", accentSoft: "#eadcf2",
    green: "#477d70", greenSoft: "#dcedea", gold: "#c28a34",
  },
  {
    paper: "#f8f6e9", surface: "#fffef8", surfaceStrong: "#ffffff",
    ink: "#333225", muted: "#76725d", line: "#e7e1c6", lineStrong: "#d8d0aa",
    accent: "#d46a1f", accentDark: "#a94b0c", accentSoft: "#f8e1ce",
    green: "#54813d", greenSoft: "#e3efd9", gold: "#c79416",
  },
  {
    paper: "#faf1f4", surface: "#fffafd", surfaceStrong: "#ffffff",
    ink: "#3d2630", muted: "#806b73", line: "#ead9df", lineStrong: "#d9c3cb",
    accent: "#b33967", accentDark: "#8a244b", accentSoft: "#f2d8e2",
    green: "#477966", greenSoft: "#dcebe5", gold: "#bd8536",
  },
  {
    paper: "#eef5ef", surface: "#fbfefb", surfaceStrong: "#ffffff",
    ink: "#26362b", muted: "#68786d", line: "#d8e4da", lineStrong: "#c3d3c6",
    accent: "#39745a", accentDark: "#285841", accentSoft: "#d7e9df",
    green: "#8a6b35", greenSoft: "#eee5d3", gold: "#c27b32",
  },
];

export function vividRandomTheme() {
  const hue = Math.floor(Math.random() * 360);
  const secondary = (hue + 110 + Math.floor(Math.random() * 70)) % 360;
  const tertiary = (hue + 225 + Math.floor(Math.random() * 45)) % 360;
  const lightBackground = Math.random() > 0.22;
  if (lightBackground) {
    return {
      paper: `hsl(${hue} 88% 72%)`,
      surface: `hsl(${secondary} 92% 90%)`,
      surfaceStrong: `hsl(${tertiary} 95% 86%)`,
      ink: `hsl(${tertiary} 82% 12%)`,
      muted: `hsl(${secondary} 68% 25%)`,
      line: `hsl(${hue} 72% 43%)`,
      lineStrong: `hsl(${tertiary} 76% 35%)`,
      accent: `hsl(${secondary} 92% 40%)`,
      accentDark: `hsl(${secondary} 95% 23%)`,
      accentSoft: `hsl(${secondary} 95% 78%)`,
      green: `hsl(${tertiary} 82% 31%)`,
      greenSoft: `hsl(${tertiary} 82% 78%)`,
      gold: `hsl(${(hue + 45) % 360} 96% 43%)`,
    };
  }
  return {
    paper: `hsl(${hue} 72% 13%)`,
    surface: `hsl(${secondary} 66% 20%)`,
    surfaceStrong: `hsl(${tertiary} 72% 25%)`,
    ink: `hsl(${(hue + 55) % 360} 96% 88%)`,
    muted: `hsl(${secondary} 78% 77%)`,
    line: `hsl(${tertiary} 72% 48%)`,
    lineStrong: `hsl(${secondary} 82% 59%)`,
    accent: `hsl(${secondary} 96% 64%)`,
    accentDark: `hsl(${secondary} 98% 83%)`,
    accentSoft: `hsl(${secondary} 75% 31%)`,
    green: `hsl(${tertiary} 92% 68%)`,
    greenSoft: `hsl(${tertiary} 65% 30%)`,
    gold: `hsl(${(hue + 45) % 360} 100% 68%)`,
  };
}

export function createThemeController(state, storage, rootStyle) {
  function apply(index) {
    const numericIndex = Number(index);
    const safeIndex = Number.isInteger(numericIndex) && numericIndex >= 0 && numericIndex < 12
      ? numericIndex
      : 0;
    while (state.randomThemes.length < 6) state.randomThemes.push(vividRandomTheme());
    if (state.randomThemes.length > 6) state.randomThemes = state.randomThemes.slice(0, 6);
    storage.setItem("homealacarte-random-themes", JSON.stringify(state.randomThemes));
    const theme = safeIndex < COLOR_THEMES.length
      ? COLOR_THEMES[safeIndex]
      : state.randomThemes[safeIndex - COLOR_THEMES.length];
    Object.entries(theme).forEach(([key, value]) => {
      const property = `--${key.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)}`;
      rootStyle.setProperty(property, value);
    });
    state.colorTheme = safeIndex;
  }

  function randomize() {
    const next = (Number(state.colorTheme) + 1) % 12;
    storage.setItem("homealacarte-color-theme", String(next));
    apply(next);
  }

  return { apply, randomize };
}
