import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tokens } from './tokens';

const GLOBALS_CSS_PATH = join(process.cwd(), 'app', 'globals.css');
const CHECK_MODE = process.argv.includes('--check');

function generateRootCss(): string {
  const lightTokens = tokens.light;
  const lines: string[] = [];

  Object.entries(lightTokens).forEach(([key, value]) => {
    const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    lines.push(`  ${cssVar}: ${value};`);
  });

  return `:root {\n${lines.join('\n')}\n}`;
}

function generateDarkCss(): string {
  const darkTokens = tokens.dark;
  const lines: string[] = [];

  Object.entries(darkTokens).forEach(([key, value]) => {
    const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    lines.push(`  ${cssVar}: ${value};`);
  });

  // Add fonts, radius, shadows to dark (same as light)
  const fonts = [
    `  --font-sans: ${tokens.fonts.sans};`,
    `  --font-mono: ${tokens.fonts.mono};`,
    `  --font-serif: ${tokens.fonts.serif};`,
    `  --radius: 0.5rem;`,
  ];

  Object.values(tokens.shadows).forEach((shadow, idx) => {
    const key = Object.keys(tokens.shadows)[idx];
    fonts.push(`  --shadow-${key}: ${shadow};`);
  });

  return `.dark {\n${lines.join('\n')}\n${fonts.join('\n')}\n}`;
}

function generateThemeInline(): string {
  const theme: string[] = [];

  Object.entries(tokens.light).forEach(([key, _]) => {
    const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    const tailwindKey = key.replace(/([A-Z])/g, '-$1').toLowerCase().slice(1);
    theme.push(`  --color-${tailwindKey}: var(${cssVar});`);
  });

  theme.push('');
  theme.push('  --font-sans: var(--font-sans);');
  theme.push('  --font-mono: var(--font-mono);');
  theme.push('  --font-serif: var(--font-serif);');
  theme.push('');
  theme.push('  --radius-sm: calc(var(--radius) - 4px);');
  theme.push('  --radius-md: calc(var(--radius) - 2px);');
  theme.push('  --radius-lg: var(--radius);');
  theme.push('  --radius-xl: calc(var(--radius) + 4px);');
  theme.push('');

  Object.entries(tokens.shadows).forEach(([key, _]) => {
    theme.push(`  --shadow-${key}: var(--shadow-${key});`);
  });

  return `@theme inline {\n${theme.join('\n')}\n}`;
}

function generateCss(): string {
  return [
    generateRootCss(),
    '',
    generateDarkCss(),
    '',
    generateThemeInline(),
  ].join('\n');
}

function updateGlobalsCss(): void {
  const currentContent = readFileSync(GLOBALS_CSS_PATH, 'utf-8');

  const startMarker = '/* START GENERATED TOKENS */';
  const endMarker = '/* END GENERATED TOKENS */';

  const hasMarkers = currentContent.includes(startMarker) && currentContent.includes(endMarker);

  const newCss = generateCss();
  const generatedContent = `${startMarker}\n${newCss}\n${endMarker}`;

  let newContent: string;

  if (hasMarkers) {
    newContent = currentContent.replace(
      new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`),
      generatedContent
    );
  } else {
    newContent = currentContent;
    const importIndex = currentContent.indexOf('@import');
    if (importIndex !== -1) {
      const endOfImport = currentContent.indexOf(';', importIndex) + 1;
      newContent = currentContent.slice(0, endOfImport) + '\n\n' + generatedContent + '\n\n' + currentContent.slice(endOfImport);
    }
  }

  writeFileSync(GLOBALS_CSS_PATH, newContent, 'utf-8');
  console.log('✅ globals.css updated');
}

function checkSync(): void {
  const currentContent = readFileSync(GLOBALS_CSS_PATH, 'utf-8');
  const expectedCss = generateCss();

  if (currentContent.includes(expectedCss)) {
    console.log('✅ globals.css is in sync');
    process.exit(0);
  } else {
    console.error('❌ globals.css is out of sync');
    console.error('Run: npm run tokens');
    process.exit(1);
  }
}

if (CHECK_MODE) {
  checkSync();
} else {
  updateGlobalsCss();
}
