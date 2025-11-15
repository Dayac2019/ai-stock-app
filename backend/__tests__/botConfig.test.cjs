const { createRequire } = require('module');
const requireFrom = createRequire(import.meta ? import.meta.url : __filename);
const fs = require('fs');
const path = require('path');

describe('botConfig', () => {
  const cfgPath = path.join(__dirname, '..', 'botConfig.json');
  let botConfig;

  beforeAll(() => {
    botConfig = requireFrom('../botConfig.js');
  });

  afterEach(() => {
    // reset to defaults by removing file
    try { fs.unlinkSync(cfgPath); } catch (e) {}
  });

  test('reads defaults and updates', () => {
    const cfg = botConfig.getConfig();
    expect(cfg).toHaveProperty('strategy');
    expect(cfg).toHaveProperty('amount');

    const updated = botConfig.updateConfig({ strategy: 'percent', percent: 2 });
    expect(updated.strategy).toBe('percent');
    expect(updated.percent).toBe(2);
  });
});
