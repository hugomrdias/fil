/**
 * Query key prefixes shared with `@filoz/synapse-react`, used to invalidate
 * its caches after writes.
 */
export const synapseKeys = {
  erc20Balance: ['synapse-erc20-balance'],
  accountInfo: ['synapse-payments-account-info'],
  operatorApprovals: ['synapse-payments-operator-approvals'],
  accountSummary: ['synapse-payments-account-summary'],
  rail: ['synapse-payments-rail'],
  dataSets: ['synapse-warm-storage-data-sets'],
  pdpDataSets: ['synapse-warm-storage-pdp-data-sets'],
  pdpDataSet: ['synapse-warm-storage-pdp-data-set'],
  storageSize: ['synapse-warm-storage-storage-size'],
  uploadCosts: ['synapse-warm-storage-upload-costs'],
  sessionKeyExpirations: ['synapse-session-key-expirations'],
} as const
