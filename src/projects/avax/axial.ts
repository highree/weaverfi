
// Imports:
import { minABI, axial } from '../../ABIs';
import { query, addToken, addLPToken, addAxialToken } from '../../functions';
import type { Chain, Address, Token, LPToken } from '../../types';

// Initializations:
const chain: Chain = 'avax';
const project = 'axial';
const masterChef: Address = '0x958C0d0baA8F220846d3966742D4Fb5edc5493D3';
const axialToken: Address = '0xcF8419A615c57511807236751c0AF38Db4ba3351';

/* ========================================================================================================================================================================= */

// Function to get project balance:
export const get = async (wallet: Address) => {
  let balance: (Token | LPToken)[] = [];
  try {
    balance.push(...(await getPoolBalances(wallet)));
  } catch {
    console.error(`Error fetching ${project} balances on ${chain.toUpperCase()}.`);
  }
  return balance;
}

/* ========================================================================================================================================================================= */

// Function to get all pool balances:
const getPoolBalances = async (wallet: Address) => {
  let balances: (Token | LPToken)[] = [];
  let poolCount = parseInt(await query(chain, masterChef, axial.masterChefABI, 'poolLength', []));
  let pools = [...Array(poolCount).keys()];
  let promises = pools.map(poolID => (async () => {
    let balance = parseInt((await query(chain, masterChef, axial.masterChefABI, 'userInfo', [poolID, wallet])).amount);
    if(balance > 0) {
      let token = (await query(chain, masterChef, axial.masterChefABI, 'poolInfo', [poolID])).lpToken;
      let symbol = await query(chain, token, minABI, 'symbol', []);

      // Standard LPs:
      if(symbol === 'JLP' || symbol === 'PGL') {
        let newToken = await addLPToken(chain, project, 'staked', token, balance, wallet);
        balances.push(newToken);

      // Axial LPs:
      } else {
        let newToken = await addAxialToken(chain, project, 'staked', token, balance, wallet);
        balances.push(newToken);
      }

      // Pending Rewards:
      let rewards = await query(chain, masterChef, axial.masterChefABI, 'pendingTokens', [poolID, wallet]);
      if(rewards.pendingAxial > 0) {
        let newToken = await addToken(chain, project, 'unclaimed', axialToken, rewards.pendingAxial, wallet);
        balances.push(newToken);
      }
      if(rewards.pendingBonusToken > 0) {
        let newToken = await addToken(chain, project, 'unclaimed', rewards.bonusTokenAddress, rewards.pendingBonusToken, wallet);
        balances.push(newToken);
      }
    }
  })());
  await Promise.all(promises);
  return balances;
}