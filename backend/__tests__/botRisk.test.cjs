const { createRequire } = require('module');
const requireFrom = createRequire(import.meta ? import.meta.url : __filename);
const botRisk = requireFrom('../botRisk.js');
const fs = require('fs');
const path = require('path');

describe('botRisk', () => {
  const riskPath = path.join(__dirname, '..', 'botRisk.json');
  afterEach(() => {
    try { fs.unlinkSync(riskPath); } catch (e) {}
  });

  test('canPlaceTrade respects perTradeMaxShares and cooldown', () => {
    const cfgMod = requireFrom('../botConfig.js');
    cfgMod.updateConfig({ perTradeMaxShares: 5, cooldownSeconds: 10 });
    const ok1 = botRisk.canPlaceTrade({ symbol: 'AAPL', qty: 3 });
    expect(ok1.ok).toBe(true);
    const ok2 = botRisk.canPlaceTrade({ symbol: 'AAPL', qty: 10 });
    expect(ok2.ok).toBe(false);
    // note trade and ensure cooldown enforces
    botRisk.noteTrade({ symbol: 'AAPL' });
    const ok3 = botRisk.canPlaceTrade({ symbol: 'AAPL', qty: 1 });
    expect(ok3.ok).toBe(false);
  });
});
