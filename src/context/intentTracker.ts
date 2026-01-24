/**
 * Intent Tracker - Understands Developer Intent from Edit History
 *
 * Inspired by Augment Code's intent-based context system.
 * Tracks recent file edits to understand what the developer is working on
 * and prioritizes related symbols in validation.
 *
 * @format
 */

export interface EditEvent {
  filePath: string;
  timestamp: number;
  symbols: string[]; // Symbols defined or used in the edited file
  language: string;
}

export interface DeveloperIntent {
  recentFiles: string[]; // Files edited in last 5 minutes
  recentSymbols: Set<string>; // Symbols from recent edits
  focusArea: string | null; // Primary directory being worked on
  language: string | null; // Primary language being used
}

class IntentTrackerClass {
  private editHistory: EditEvent[] = [];
  private readonly MAX_HISTORY = 50;
  private readonly INTENT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Record a file edit event
   */
  recordEdit(event: EditEvent): void {
    this.editHistory.push(event);

    // Keep only recent history
    if (this.editHistory.length > this.MAX_HISTORY) {
      this.editHistory.shift();
    }

    // Clean up old events
    this.cleanupOldEvents();
  }

  /**
   * Get current developer intent based on recent edits
   */
  getCurrentIntent(): DeveloperIntent {
    this.cleanupOldEvents();

    const recentEdits = this.getRecentEdits();
    // Reverse so most recent is first
    const recentFiles = recentEdits.map((e) => e.filePath).reverse();
    const recentSymbols = new Set<string>();

    // Collect all symbols from recent edits
    for (const edit of recentEdits) {
      for (const symbol of edit.symbols) {
        recentSymbols.add(symbol);
      }
    }

    // Determine focus area (most common directory)
    const focusArea = this.determineFocusArea(recentFiles);

    // Determine primary language
    const language = this.determinePrimaryLanguage(recentEdits);

    return {
      recentFiles,
      recentSymbols,
      focusArea,
      language,
    };
  }

  /**
   * Check if a file is in the current focus area
   */
  isInFocusArea(filePath: string): boolean {
    const intent = this.getCurrentIntent();
    if (!intent.focusArea) return false;

    return filePath.startsWith(intent.focusArea);
  }

  /**
   * Check if a symbol is recently used
   */
  isRecentlyUsed(symbol: string): boolean {
    const intent = this.getCurrentIntent();
    return intent.recentSymbols.has(symbol);
  }

  /**
   * Get relevance score for a file based on intent
   */
  getFileRelevance(filePath: string): number {
    const intent = this.getCurrentIntent();

    // Recently edited files get highest score
    const recentIndex = intent.recentFiles.indexOf(filePath);
    if (recentIndex !== -1) {
      // More recent = higher score (1.0 for most recent, decaying)
      // recentFiles[0] is most recent, so index 0 = 1.0, index 1 = 0.9, etc.
      return Math.max(0.5, 1.0 - recentIndex * 0.1);
    }

    // Files in focus area get medium score
    if (intent.focusArea && filePath.startsWith(intent.focusArea)) {
      return 0.5;
    }

    return 0.0;
  }

  /**
   * Get relevance score for a symbol based on intent
   */
  getSymbolRelevance(symbol: string): number {
    const intent = this.getCurrentIntent();

    if (intent.recentSymbols.has(symbol)) {
      return 0.8;
    }

    return 0.0;
  }

  /**
   * Clear all edit history
   */
  clear(): void {
    this.editHistory = [];
  }

  /**
   * Get recent edits within the intent window
   */
  private getRecentEdits(): EditEvent[] {
    const now = Date.now();
    return this.editHistory.filter(
      (e) => now - e.timestamp < this.INTENT_WINDOW_MS,
    );
  }

  /**
   * Remove events older than the intent window
   */
  private cleanupOldEvents(): void {
    const now = Date.now();
    this.editHistory = this.editHistory.filter(
      (e) => now - e.timestamp < this.INTENT_WINDOW_MS,
    );
  }

  /**
   * Determine the focus area from recent files
   */
  private determineFocusArea(files: string[]): string | null {
    if (files.length === 0) return null;

    // Count directory frequencies (only immediate parent directory)
    const dirCounts = new Map<string, number>();

    for (const file of files) {
      const parts = file.split("/");
      // Get immediate parent directory (everything except filename)
      if (parts.length > 1) {
        const dir = parts.slice(0, -1).join("/");
        dirCounts.set(dir, (dirCounts.get(dir) || 0) + 1);
      }
    }

    // Find most common directory (prefer deeper paths for ties)
    let maxCount = 0;
    let focusDir: string | null = null;

    for (const [dir, count] of dirCounts.entries()) {
      if (
        count > maxCount ||
        (count === maxCount && dir.length > (focusDir?.length || 0))
      ) {
        maxCount = count;
        focusDir = dir;
      }
    }

    return focusDir;
  }

  /**
   * Determine primary language from recent edits
   */
  private determinePrimaryLanguage(edits: EditEvent[]): string | null {
    if (edits.length === 0) return null;

    const langCounts = new Map<string, number>();

    for (const edit of edits) {
      langCounts.set(edit.language, (langCounts.get(edit.language) || 0) + 1);
    }

    // Find most common language
    let maxCount = 0;
    let primaryLang: string | null = null;

    for (const [lang, count] of langCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        primaryLang = lang;
      }
    }

    return primaryLang;
  }
}

// Singleton instance
export const intentTracker = new IntentTrackerClass();
