export const PUBLIC_JUDGE_DATES = {
  executionDate: '2040-03-12',
  planningDate: '2040-03-13',
  historyDate: '2040-03-05'
} as const;

export const PUBLIC_JUDGE_OPERATING_DATES = [...Object.values(PUBLIC_JUDGE_DATES), '2040-03-14'] as const;
