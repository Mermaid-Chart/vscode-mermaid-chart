/**
 * Shared theme configuration for VS Code Mermaid extension
 * Shared between the extension host and the webview bundle (webview imports via ../../src/shared/...).
 */

export interface ThemeColors {
  primaryBackground: string;
  secondaryBackground: string;
  modalBackground: string;
  accentColor: string;
  /** True for dark VS Code themes, false for light. Used to decide chrome colors when diagram is dark. */
  isDark: boolean;
}

/**
 * Maps VS Code theme IDs to our internal theme names
 */
export const VSCODE_THEME_MAPPING: { [vscodeThemeId: string]: ThemeColors } = {
  // Dark themes
  'Default Dark+': {
    primaryBackground: '#1E1E1E',
    secondaryBackground: '#252526',
    modalBackground: '#333333',
    accentColor: '#0078D4',
    isDark: true
  },
  'Default Dark Modern': {
    primaryBackground: '#1F1F1F',
    secondaryBackground: '#181818',
    modalBackground: '#181818',
    accentColor: '#0078D4',
    isDark: true
  },
  'Dark+': {
    primaryBackground: '#1E1E1E',
    secondaryBackground: '#252526',
    modalBackground: '#333333',
    accentColor: '#0078D4',
    isDark: true
  },
  'Dark (Visual Studio)': {
    primaryBackground: '#1E1E1E',
    secondaryBackground: '#252526',
    modalBackground: '#333333',
    accentColor: '#0078D4',
    isDark: true
  },
  'Kimbie Dark': {
    primaryBackground: '#221A0F',
    secondaryBackground: '#362712',
    modalBackground: '#221A0F',
    accentColor: '#7C5021',
    isDark: true
  },
  'Monokai': {
    primaryBackground: '#272822',
    secondaryBackground: '#1E1F1C',
    modalBackground: '#272822',
    accentColor: '#75715E',
    isDark: true
  },
  'Monokai Dimmed': {
    primaryBackground: '#1E1E1E',
    secondaryBackground: '#272727',
    modalBackground: '#353535',
    accentColor: '#707070',
    isDark: true
  },
  'Red': {
    primaryBackground: '#390000',
    secondaryBackground: '#330000',
    modalBackground: '#580000',
    accentColor: '#770000',
    isDark: true
  },
  'Solarized Dark': {
    primaryBackground: '#002B36',
    secondaryBackground: '#00212B',
    modalBackground: '#003847',
    accentColor: '#005A6F',
    isDark: true
  },
  // Light themes
  'Default Light+': {
    primaryBackground: '#FFFFFF',
    secondaryBackground: '#F3F3F3',
    modalBackground: '#F8F8F8',
    accentColor: '#0060C0',
    isDark: false
  },
  'Default Light Modern': {
    primaryBackground: '#FFFFFF',
    secondaryBackground: '#F8F8F8',
    modalBackground: '#F8F8F8',
    accentColor: '#0060C0',
    isDark: false
  },
  'Light+': {
    primaryBackground: '#FFFFFF',
    secondaryBackground: '#F3F3F3',
    modalBackground: '#F8F8F8',
    accentColor: '#0060C0',
    isDark: false
  },
  'Light (Visual Studio)': {
    primaryBackground: '#FFFFFF',
    secondaryBackground: '#F3F3F3',
    modalBackground: '#F8F8F8',
    accentColor: '#0060C0',
    isDark: false
  },
  'Quiet Light': {
    primaryBackground: '#FFFFFF',
    secondaryBackground: '#F2F2F2',
    modalBackground: '#EDEDF5',
    accentColor: '#C4D9B1',
    isDark: false
  },
  'Solarized Light': {
    primaryBackground: '#FDF6E3',
    secondaryBackground: '#EEE8D5',
    modalBackground: '#DDD6C1',
    accentColor: '#DFCA88',
    isDark: false
  },
  // High contrast
  'Default High Contrast': {
    primaryBackground: '#000000',
    secondaryBackground: '#1C1C1C',
    modalBackground: '#1C1C1C',
    accentColor: '#FFFFFF',
    isDark: true
  },
  'Default High Contrast Light': {
    primaryBackground: '#FFFFFF',
    secondaryBackground: '#F3F3F3',
    modalBackground: '#F8F8F8',
    accentColor: '#0060C0',
    isDark: false
  }
};

/**
 * Gets theme colors - always use VS Code theme for UI elements
 */
export function getThemeColors(vscodeThemeName: string): ThemeColors {
  if (VSCODE_THEME_MAPPING[vscodeThemeName]) {
    return VSCODE_THEME_MAPPING[vscodeThemeName];
  }

  return VSCODE_THEME_MAPPING['Default Dark+'];
}

/**
 * Icon / control foreground: white on dark diagram canvas, VS Code accent on light diagram canvas.
 */
export function getIconColor(diagramTheme: string, vscodeAccentColor: string): string {
  if (diagramTheme?.includes('dark') || diagramTheme === 'dark') {
    return '#ffffff';
  }
  return vscodeAccentColor;
}
