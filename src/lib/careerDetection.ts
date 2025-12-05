// Career-related keywords that trigger upath.ai suggestion
export const CAREER_KEYWORDS = [
  'career', 'careers', 'job', 'jobs', 'career path', 'careerpath',
  'career transition', 'exploring careers', 'confused in career',
  'lost in path', 'career change', 'what should i do with my life',
  'career advice', 'career guidance', 'career confused',
  'upath', 'career direction', 'professional path',
  'finding my path', 'career exploration', 'job search',
  'what career', 'which career', 'career options',
  'job hunting', 'job market', 'career move',
  'career decision', 'career choice', 'career planning',
  'lost in career', 'career help', 'exploring options',
  'professional direction', 'work path', 'career journey'
];

/**
 * Checks if the input text contains any career-related keywords
 * @param text - The text to check
 * @returns true if career keywords are detected
 */
export function detectCareerKeywords(text: string): boolean {
  const lowerText = text.toLowerCase();
  return CAREER_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

/**
 * Opens upath.ai in a new tab
 */
export function openUPath(): void {
  window.open('https://upath.ai', '_blank', 'noopener,noreferrer');
}
