/** Format a sum of packet KB as "n KB" or "n.n MB". */
export function formatSize(totalKb: number): string {
  if (totalKb >= 1024) return `${(totalKb / 1024).toFixed(1)} MB`;
  return `${totalKb} KB`;
}
