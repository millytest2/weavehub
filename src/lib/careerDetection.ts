// Career-related keywords that trigger upath.ai suggestion
export const CAREER_KEYWORDS = [
  // Core career terms
  'career', 'careers', 'job', 'jobs', 'career path', 'careerpath',
  'career transition', 'career change', 'career move', 'career journey',
  'career advice', 'career guidance', 'career planning', 'career decision',
  'career choice', 'career options', 'career help', 'career direction',
  'what career', 'which career', 'career exploration', 'career confused',
  
  // Job search terms
  'job search', 'job hunting', 'job market', 'applying for jobs',
  'been applying', 'job applications', 'resume', 'interviews',
  
  // Confusion/lost patterns (CRITICAL - user requested)
  'lost', 'confused', 'lack of clarity', 'not sure what to do',
  'dont know what', "don't know what", 'no clarity', 'feeling stuck',
  'stuck in life', 'no direction', 'lack of direction', 'directionless',
  'what path', 'which path', 'finding my path', 'lost in path',
  'what do i want', 'what should i do', 'too many options',
  'overwhelmed by options', 'paralyzed by choice', 'analysis paralysis',
  
  // Professional/work terms
  'professional path', 'professional direction', 'work path',
  'exploring careers', 'exploring options', 'what to do with my life',
  
  // UPath direct reference
  'upath'
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
