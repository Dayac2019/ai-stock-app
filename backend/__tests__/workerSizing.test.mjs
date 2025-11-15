import assert from 'assert';
import sinon from 'sinon';
import botConfig from '../botConfig.js';

// We'll import the worker module and call its runTradeCycle function to test sizing
import { runTradeCycle as runCycle } from '../tradeWorker.js';

// Mock Alpaca client responses by stubbing getAlpacaClient
import * as alpacaClient from '../alpacaClient.js';

describe('worker sizing', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });
  afterEach(() => sandbox.restore());

  test('percent strategy computes amount based on cash and price', async () => {
    botConfig.updateConfig({ strategy: 'percent', percent: 1, amount: 1, symbol: 'AAPL' });

    // stub alpaca client
    const fakeAlpaca = {
      getAccount: async () => ({ cash: '1000' }),
      getLatestTrade: async (s) => ({ Price: 100 }) ,
      getClock: async () => ({ is_open: true })
    };
    sandbox.stub(alpacaClient, 'getAlpacaClient').callsFake(() => fakeAlpaca);

    // run one cycle (it posts to localhost; we'll stub axios.post)
    const axios = await import('axios');
    const postStub = sandbox.stub(axios.default, 'post').resolves({ status: 200 });

    await runCycle();

    // percent =1% of 1000 = 10 budget -> price 100 -> qty = floor(10/100)=0 -> min 1
    assert(postStub.called, 'expected axios.post called');
    const args = postStub.getCall(0).args;
    const body = args[1];
    // amount should be at least 1
    assert(body.amount >= 1, 'amount should be >=1');
  }, 10000);
});
