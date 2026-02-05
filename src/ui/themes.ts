import chalk from 'chalk';

/**
 * 颜色主题配置
 */
export interface ColorTheme {
  primary: any;
  secondary: any;
  success: any;
  warning: any;
  error: any;
  info: any;
  muted: any;
  border: any;
  highlight: any;
  background: any;
  text: any;
}

/**
 * 暗色主题
 */
export const darkTheme: ColorTheme = {
  primary: chalk.hex('#00d4ff'),      // 亮青色
  secondary: chalk.hex('#888888'),    // 灰色
  success: chalk.hex('#00ff88'),      // 亮绿色
  warning: chalk.hex('#ffaa00'),      // 橙色
  error: chalk.hex('#ff4444'),        // 红色
  info: chalk.hex('#4488ff'),         // 蓝色
  muted: chalk.hex('#666666'),        // 暗灰色
  border: chalk.hex('#444444'),       // 边框灰色
  highlight: chalk.bold.hex('#ffffff'), // 白色加粗
  background: chalk.hex('#1a1a1a'),   // 深灰色背景
  text: chalk.hex('#cccccc')          // 浅灰色文字
};

/**
 * 亮色主题
 */
export const lightTheme: ColorTheme = {
  primary: chalk.hex('#0066cc'),      // 深蓝色
  secondary: chalk.hex('#666666'),    // 中灰色
  success: chalk.hex('#009900'),      // 深绿色
  warning: chalk.hex('#cc6600'),      // 深橙色
  error: chalk.hex('#cc0000'),        // 深红色
  info: chalk.hex('#0033cc'),         // 深蓝色
  muted: chalk.hex('#999999'),        // 浅灰色
  border: chalk.hex('#cccccc'),       // 浅边框
  highlight: chalk.bold.hex('#000000'), // 黑色加粗
  background: chalk.hex('#ffffff'),   // 白色背景
  text: chalk.hex('#333333')          // 深灰色文字
};

/**
 * 高对比度主题（适合演示）
 */
export const highContrastTheme: ColorTheme = {
  primary: chalk.bold.hex('#00ffff'), // 青色加粗
  secondary: chalk.hex('#aaaaaa'),    // 亮灰色
  success: chalk.bold.hex('#00ff00'), // 绿色加粗
  warning: chalk.bold.hex('#ffff00'), // 黄色加粗
  error: chalk.bold.hex('#ff0000'),   // 红色加粗
  info: chalk.bold.hex('#0080ff'),    // 蓝色加粗
  muted: chalk.hex('#808080'),        // 灰色
  border: chalk.bold.hex('#ffffff'),  // 白色边框
  highlight: chalk.bold.underline.hex('#ffffff'), // 白色加粗下划线
  background: chalk.hex('#000000'),   // 黑色背景
  text: chalk.hex('#ffffff')          // 白色文字
};

/**
 * 专业主题（适合长时间使用）
 */
export const professionalTheme: ColorTheme = {
  primary: chalk.hex('#26c6da'),      // 青色
  secondary: chalk.hex('#78909c'),    // 蓝灰色
  success: chalk.hex('#66bb6a'),      // 柔和绿色
  warning: chalk.hex('#ffa726'),      // 柔和橙色
  error: chalk.hex('#ef5350'),        // 柔和红色
  info: chalk.hex('#42a5f5'),         // 柔和蓝色
  muted: chalk.hex('#90a4ae'),        // 浅蓝灰色
  border: chalk.hex('#cfd8dc'),       // 很浅的蓝灰色
  highlight: chalk.bold.hex('#37474f'), // 深蓝灰色加粗
  background: chalk.hex('#eceff1'),   // 很浅的灰色
  text: chalk.hex('#263238')          // 深蓝灰色
};

/**
 * 霓虹主题（视觉效果好）
 */
export const neonTheme: ColorTheme = {
  primary: chalk.hex('#ff00ff'),      // 品红
  secondary: chalk.hex('#00ffff'),    // 青色
  success: chalk.hex('#00ff00'),      // 绿色
  warning: chalk.hex('#ffff00'),      // 黄色
  error: chalk.hex('#ff0066'),        // 粉红
  info: chalk.hex('#00bfff'),         // 深天蓝
  muted: chalk.hex('#ff69b4'),        // 热粉红
  border: chalk.hex('#ff1493'),       // 深粉红
  highlight: chalk.bold.italic.hex('#ffffff'), // 白色加粗斜体
  background: chalk.hex('#0a0a0a'),   // 近黑色
  text: chalk.hex('#e6e6fa')          // 淡紫色
};

/**
 * 主题管理器
 */
export class ThemeManager {
  private currentTheme: ColorTheme = darkTheme;
  private availableThemes: Map<string, ColorTheme> = new Map([
    ['dark', darkTheme],
    ['light', lightTheme],
    ['high-contrast', highContrastTheme],
    ['professional', professionalTheme],
    ['neon', neonTheme]
  ]);

  /**
   * 获取当前主题
   */
  getCurrentTheme(): ColorTheme {
    return this.currentTheme;
  }

  /**
   * 设置主题
   */
  setTheme(themeName: string): boolean {
    const theme = this.availableThemes.get(themeName);
    if (theme) {
      this.currentTheme = theme;
      return true;
    }
    return false;
  }

  /**
   * 获取可用主题列表
   */
  getAvailableThemes(): string[] {
    return Array.from(this.availableThemes.keys());
  }

  /**
   * 根据时间自动选择主题
   */
  autoSelectTheme(): string {
    const hour = new Date().getHours();
    
    // 白天使用亮色主题，晚上使用暗色主题
    if (hour >= 6 && hour < 18) {
      return this.setTheme('light') ? 'light' : 'dark';
    } else {
      return this.setTheme('dark') ? 'dark' : 'light';
    }
  }

  /**
   * 根据环境检测最佳主题
   */
  detectBestTheme(): string {
    // 检查终端背景色
    if (process.env.TERM_PROGRAM === 'Apple_Terminal') {
      return this.setTheme('professional') ? 'professional' : 'dark';
    }
    
    // 检查颜色支持
    if (process.env.COLORTERM === 'truecolor') {
      return this.setTheme('neon') ? 'neon' : 'dark';
    }
    
    // 默认使用暗色主题
    return this.setTheme('dark') ? 'dark' : 'professional';
  }

  /**
   * 创建自定义主题
   */
  createCustomTheme(name: string, colors: Partial<ColorTheme>): boolean {
    const baseTheme = this.currentTheme;
    const customTheme: ColorTheme = {
      ...baseTheme,
      ...colors
    };
    
    this.availableThemes.set(name, customTheme);
    return true;
  }

  /**
   * 应用颜色渐变效果
   */
  gradient(text: string, colors: string[]): string {
    if (colors.length === 0) return text;
    if (colors.length === 1) return chalk.hex(colors[0])(text);
    
    const step = text.length / (colors.length - 1);
    let result = '';
    
    for (let i = 0; i < text.length; i++) {
      const colorIndex = Math.floor(i / step);
      const nextColorIndex = Math.min(colorIndex + 1, colors.length - 1);
      
      if (colorIndex === nextColorIndex) {
        result += chalk.hex(colors[colorIndex])(text[i]);
      } else {
        // 简单的颜色混合
        result += chalk.hex(colors[colorIndex])(text[i]);
      }
    }
    
    return result;
  }

  /**
   * 创建彩虹效果
   */
  rainbow(text: string): string {
    const rainbowColors = [
      '#ff0000', '#ff8000', '#ffff00', '#80ff00',
      '#00ff00', '#00ff80', '#00ffff', '#0080ff',
      '#0000ff', '#8000ff', '#ff00ff', '#ff0080'
    ];
    
    return this.gradient(text, rainbowColors);
  }

  /**
   * 创建金属效果
   */
  metallic(text: string): string {
    const metallicColors = [
      '#c0c0c0', '#d3d3d3', '#e5e5e5', '#f0f0f0',
      '#ffffff', '#f0f0f0', '#e5e5e5', '#d3d3d3'
    ];
    
    return this.gradient(text, metallicColors);
  }

  /**
   * 创建火焰效果
   */
  fire(text: string): string {
    const fireColors = [
      '#ff0000', '#ff4000', '#ff8000', '#ffbf00', '#ffff00'
    ];
    
    return this.gradient(text, fireColors);
  }

  /**
   * 创建冰效果
   */
  ice(text: string): string {
    const iceColors = [
      '#00ffff', '#40cfff', '#80bfff', '#bfafff', '#ffffff'
    ];
    
    return this.gradient(text, iceColors);
  }

  /**
   * 格式化状态文本
   */
  formatStatus(text: string, status: 'success' | 'warning' | 'error' | 'info' | 'pending'): string {
    const theme = this.getCurrentTheme();
    
    switch (status) {
      case 'success':
        return theme.success(`✓ ${text}`);
      case 'warning':
        return theme.warning(`⚠ ${text}`);
      case 'error':
        return theme.error(`✗ ${text}`);
      case 'info':
        return theme.info(`ℹ ${text}`);
      case 'pending':
        return theme.secondary(`◐ ${text}`);
      default:
        return text;
    }
  }

  /**
   * 创建进度条样式
   */
  createProgressBar(progress: number, width: number = 20): string {
    const theme = this.getCurrentTheme();
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    
    const filledChar = '█';
    const emptyChar = '░';
    
    let color: any;
    if (progress < 30) {
      color = theme.success;
    } else if (progress < 70) {
      color = theme.warning;
    } else {
      color = theme.error;
    }
    
    const bar = filledChar.repeat(filled) + emptyChar.repeat(empty);
    return color(bar) + theme.muted(` ${progress}%`);
  }

  /**
   * 创建边框样式
   */
  createBorderStyle(style: 'single' | 'double' | 'rounded' | 'thick'): Record<string, string> {
    const theme = this.getCurrentTheme();
    
    const styles = {
      single: {
        topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘',
        horizontal: '─', vertical: '│', topJoin: '┬', bottomJoin: '┴',
        leftJoin: '├', rightJoin: '┤', cross: '┼'
      },
      double: {
        topLeft: '╔', topRight: '╗', bottomLeft: '╚', bottomRight: '╝',
        horizontal: '═', vertical: '║', topJoin: '╦', bottomJoin: '╩',
        leftJoin: '╠', rightJoin: '╣', cross: '╬'
      },
      rounded: {
        topLeft: '╭', topRight: '╮', bottomLeft: '╰', bottomRight: '╯',
        horizontal: '─', vertical: '│', topJoin: '┬', bottomJoin: '┴',
        leftJoin: '├', rightJoin: '┤', cross: '┼'
      },
      thick: {
        topLeft: '▛', topRight: '▜', bottomLeft: '▙', bottomRight: '▟',
        horizontal: '▔', vertical: '▏', topJoin: '▁', bottomJoin: '▔',
        leftJoin: '▎', rightJoin: '▕', cross: '▊'
      }
    };
    
    const selectedStyle = styles[style] || styles.single;
    
    // 应用主题颜色
    const coloredStyle: Record<string, string> = {};
    Object.entries(selectedStyle).forEach(([key, value]) => {
      coloredStyle[key] = theme.border(value);
    });
    
    return coloredStyle;
  }
}

// 导出一个主题管理器实例
export const themeManager = new ThemeManager();