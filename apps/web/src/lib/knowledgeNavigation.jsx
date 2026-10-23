import { createContext } from 'react';

export const KnowledgeNavigationContext = createContext(null);

export function knowledgeCitationPath(href) {
  if (!href?.startsWith('#knowledge?')) return null;
  const path = new URLSearchParams(href.slice('#knowledge?'.length)).get('path');
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(part => part === '..' || part === '.') || !/\.md$/i.test(path)) return null;
  return path;
}
