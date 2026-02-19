export const AUTO_FIX_ISSUE_TYPES = [
  "missing_alt",
  "missing_meta_description",
  "thin_content",
  "heading_hierarchy",
] as const;

const AUTO_FIX_ISSUE_TYPE_SET = new Set<string>(AUTO_FIX_ISSUE_TYPES);

export function isIssueTypeAutoFixable(issueType: string): boolean {
  return AUTO_FIX_ISSUE_TYPE_SET.has(issueType);
}

