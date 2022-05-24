
// Imports:
import * as ens from './ens';
import * as $ from './prices';
import * as evm from './functions';
import { chains } from './chains';
import { projects } from './projects';
import { chainFunctions } from './chain-functions';

// Type Imports:
import type { Address, ENSDomain, UpperCaseChain } from './types';

/* ========================================================================================================================================================================= */

// WeaverFi Functionality:
export const WeaverFi = {

  // Ethereum Functions:
  ETH: {
    ...chainFunctions('eth'),

    /**
     * Function to resolve an ENS domain name into an address.
     * @param name - The ENS domain name to resolve.
     * @returns An address if resolvable, else null.
     */
    resolveENS: (name: ENSDomain) => {
      return ens.resolveENS(name);
    },

    /**
     * Function to reverse lookup an ENS domain.
     * @param address - The address to reverse lookup.
     * @returns An ENS domain name if resolvable, else null.
     */
    lookupENS: (address: Address) => {
      return ens.lookupENS(address);
    },

    /**
     * Function to fetch an ENS domain's avatar.
     * @param name - The ENS domain name to query info from.
     * @returns An avatar URI if available, else null.
     */
    fetchAvatarENS: (name: ENSDomain) => {
      return ens.fetchAvatarENS(name);
    }
  },

  // Binance Smart Chain Functions:
  BSC: chainFunctions('bsc'),

  // Polygon Functions:
  POLY: chainFunctions('poly'),

  // Fantom Functions:
  FTM: chainFunctions('ftm'),

  // Avalanche Functions:
  AVAX: chainFunctions('avax'),

  // Harmony Functions:
  ONE: chainFunctions('one'),

  // Cronos Functions:
  CRONOS: chainFunctions('cronos'),

  // Optimism Functions:
  OP: chainFunctions('op'),

  // Arbitrum Functions:
  ARB: chainFunctions('arb'),

  /* ================================================== */

  /**
   * Function to get all supported chains.
   * @returns An array of all supported chain abbreviations.
   */
  getAllChains: () => {
    return Object.keys(projects).map(chain => chain.toUpperCase() as UpperCaseChain);
  },

  /**
   * Function to fetch information from all supported chains.
   * @returns A record of chain information in JSON format.
   */
  getAllChainInfo: () => {
    return chains;
  },

  /**
   * Function to get a list of all supported projects.
   * @returns A record of project name arrays for each chain.
   */
  getAllProjects: () => {
    return projects;
  },

  /**
   * Function to get a list of all tracked tokens on all chains.
   * @returns A record of arrays of tracked tokens on every chain.
   */
  getAllTokens: () => {
    return evm.getAllTokens();
  },

  /**
   * Function to populate the `prices` object with all tracked tokens' prices.
   * @returns Current state of the `prices` object post-update.
   */
  getAllTokenPrices: () => {
    return $.getAllTokenPrices();
  },

  /**
   * Function to populate the `prices` object with all native tokens' prices.
   * @returns Current state of the `prices` object post-update.
   */
  getNativeTokenPrices: () => {
    return $.getNativeTokenPrices();
  },

  /**
   * Function to fetch all previously queried token prices.
   * @returns Current state of the `prices` object for all chains.
   */
  fetchPrices: () => {
    return $.prices;
  },

  /**
   * Function to fetch all balances for a given wallet, including in their wallets and in dapps/projects.
   * @param wallet The wallet to query balances for.
   * @returns A wallet's token, project and NFT balances.
   */
  getAllBalances: (wallet: Address) => {
    return evm.getAllBalances(wallet);
  }
}

// Exporting Default Module:
export default WeaverFi;