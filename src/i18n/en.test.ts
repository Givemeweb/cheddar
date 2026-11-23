import en from './en.json';

describe('english strings', () => {
  it('provides both plural forms for the bank-connections account count', () => {
    expect(en.bankConnections.accountsReady_one).toContain('{{count}}');
    expect(en.bankConnections.accountsReady_other).toContain('{{count}}');
    // The unsuffixed key must be gone so i18next only resolves the plurals.
    expect(en.bankConnections).not.toHaveProperty('accountsReady');
  });
});
