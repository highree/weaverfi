
// Imports:
import { ethers } from 'ethers';
import { chains } from './chains';
import { projects } from './projects';
import { WeaverError } from './error';
import { minABI, lpABI } from './ABIs';
import { getTokenPrice } from './prices';
import { Multicall } from 'ethereum-multicall';
import { eth_data, bsc_data, poly_data, ftm_data, avax_data, one_data, cronos_data } from './tokens';

// Type Imports:
import type { ContractCallResults, ContractCallContext } from 'ethereum-multicall';
import type { EVMChain, Address, URL, ABI, ENSDomain, TokenData, TokenStatus, TokenType, NativeToken, Token, LPToken, DebtToken, XToken, PricedToken, CallContext } from './types';

// Initializations:
export const defaultTokenLogo: URL = 'https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@d5c68edec1f5eaec59ac77ff2b48144679cebca1/32/icon/generic.png';
export const defaultAddress: Address = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
export const zero: Address = '0x0000000000000000000000000000000000000000';
const maxQueryRetries = 3;

// Ignored Errors On Blockchain Queries:
export const ignoredErrors: { chain: EVMChain, address: Address }[] = [
  {chain: 'poly', address: '0x8aaa5e259f74c8114e0a471d9f2adfc66bfe09ed'}, // QuickSwap Registry
  {chain: 'poly', address: '0x9dd12421c637689c3fc6e661c9e2f02c2f61b3eb'}  // QuickSwap Dual Rewards Registry
];

/* ========================================================================================================================================================================= */

/**
 * Function to make blockchain queries.
 * @param chain - The blockchain to target for this query.
 * @param address - The contract's address to query.
 * @param abi - The contract's ABI from 'ABIs.ts'.
 * @param method - The method to be called from the contract.
 * @param args - Any arguments to pass to the method called.
 * @returns Query results.
 */
export const query = async (chain: EVMChain, address: Address, abi: ABI[], method: string, args: any[]) => {
  let result;
  let errors = 0;
  let rpcID = 0;
  while(!result && errors < maxQueryRetries) {
    try {
      let ethers_provider = new ethers.providers.JsonRpcProvider(chains[chain].rpcs[rpcID]);
      let contract = new ethers.Contract(address, abi, ethers_provider);
      result = await contract[method](...args);
    } catch {
      if(++rpcID >= chains[chain].rpcs.length) {
        if(++errors >= maxQueryRetries) {
          if(!ignoredErrors.find(i => i.chain === chain && i.address === address.toLowerCase())) {
            throw new WeaverError(chain, null, `Querying ${method}(${args}) on ${address}`);
          }
        } else {
          rpcID = 0;
        }
      }
    }
  }
  return result;
}

/* ========================================================================================================================================================================= */

/**
 * Function to make multicall blockchain queries (multiple method calls in one query).
 * @param chain - The blockchain to target for this query.
 * @param queries - The queries to be executed.
 * @returns Query results for all given queries.
 * @see {@link multicallOneMethodQuery}, {@link multicallOneContractQuery} and {@link multicallComplexQuery} for simpler use cases.
 */
export const multicallQuery = async (chain: EVMChain, queries: ContractCallContext[]) => {
  try {
    let ethers_provider = new ethers.providers.JsonRpcProvider(chains[chain].rpcs[0]);
    let multicall = new Multicall({ ethersProvider: ethers_provider, tryAggregate: true, multicallCustomContractAddress: chains[chain].multicall });
    let results: ContractCallResults = await multicall.call(queries);
    return results;
  } catch(err) {
    throw new WeaverError(chain, null, `Invalid multicall query`, err);
  }
}

/* ========================================================================================================================================================================= */

/**
 * Function to make multicall blockchain queries with a singular method call to multiple contracts.
 * @param chain - The blockchain to target for this query.
 * @param contracts - The contracts to query.
 * @param abi - The ABI needed for the given query.
 * @param methodName - The method to call on each contract.
 * @param methodParameters - Any arguments to pass to the method called.
 * @returns Query results for each contract.
 */
export const multicallOneMethodQuery = async (chain: EVMChain, contracts: Address[], abi: ABI[], methodName: string, methodParameters: any[]) => {
  let results: Record<Address, any[]> = {};
  let queries: ContractCallContext[] = [];
  let calls: CallContext[] = [{ reference: '', methodName, methodParameters }];
  contracts.forEach(contract => {
    queries.push({ reference: contract, contractAddress: contract, abi, calls });
  });
  let multicallQueryResults = (await multicallQuery(chain, queries)).results;
  contracts.forEach(contract => {
    let contractResults = multicallQueryResults[contract].callsReturnContext[0];
    if(contractResults && contractResults.success) {
      results[contract] = contractResults.returnValues;
    }
  });
  return results;
}

/* ========================================================================================================================================================================= */

/**
 * Function to make multicall blockchain queries with many method calls to a single contract.
 * @param chain - The blockchain to target for this query.
 * @param contractAddress - The contract to query.
 * @param abi - The aggregated ABI needed for all given queries.
 * @param calls - All method calls to query the target contract.
 * @returns Query results for each method call.
 */
export const multicallOneContractQuery = async (chain: EVMChain, contractAddress: Address, abi: ABI[], calls: CallContext[]) => {
  let results: Record<string, any[]> = {};
  let query: ContractCallContext = { reference: 'oneContractQuery', contractAddress, abi, calls };
  let multicallQueryResults = (await multicallQuery(chain, [query])).results;
  multicallQueryResults['oneContractQuery'].callsReturnContext.forEach(result => {
    if(result.success) {
      results[result.reference] = result.returnValues;
    }
  });
  return results;
}

/* ========================================================================================================================================================================= */

/**
 * Function to make multicall blockchain queries with many method calls to many contracts.
 * @param chain - The blockchain to target for this query.
 * @param contracts - The contracts to query.
 * @param abi - The aggregated ABI needed for all given queries.
 * @param calls - All method calls to query the target contracts.
 * @returns Query results for each method call, for each contract.
 */
export const multicallComplexQuery = async (chain: EVMChain, contracts: Address[], abi: ABI[], calls: CallContext[]) => {
  let results: Record<Address, Record<string, any[]>> = {};
  let queries: ContractCallContext[] = [];
  contracts.forEach(contract => {
    queries.push({ reference: contract, contractAddress: contract, abi, calls });
  });
  let multicallQueryResults = (await multicallQuery(chain, queries)).results;
  contracts.forEach(contract => {
    let contractResults = multicallQueryResults[contract].callsReturnContext;
    let queryResults: Record<string, any[]> = {};
    contractResults.forEach(result => {
      queryResults[result.reference] = result.returnValues;
    });
    results[contract] = queryResults;
  });
  return results;
}

/* ========================================================================================================================================================================= */

/**
 * Function to fetch wallet balances.
 * @param chain - The blockchain to query info from.
 * @param wallet - The wallet to query balances for.
 * @returns All native and token balances for the specified wallet.
 */
export const getWalletBalance = async (chain: EVMChain, wallet: Address) => {
  let walletBalance: (NativeToken | Token)[] = [];
  walletBalance.push(...(await getWalletNativeTokenBalance(chain, wallet)));
  walletBalance.push(...(await getWalletTokenBalance(chain, wallet)));
  return walletBalance;
}

/* ========================================================================================================================================================================= */

/**
 * Function to fetch project balances for a given wallet.
 * @param chain - The blockchain to query info from.
 * @param wallet - The wallet to query balances for.
 * @param project - The project/dapp to query for balances in.
 * @returns A wallet's balance on the specified project/dapp.
 */
export const getProjectBalance = async (chain: EVMChain, wallet: Address, project: string) => {
  let projectBalance: (NativeToken | Token | LPToken | DebtToken | XToken)[] = [];
  if(projects[chain].includes(project)) {
    let dapp = await import(`./projects/${chain}/${project}`);
    let balance = await dapp.get(wallet);
    projectBalance.push(...(balance));
  } else {
    throw new WeaverError(chain, null, `Unknown project: ${project}`);
  }
  return projectBalance;
}

/* ========================================================================================================================================================================= */

/**
 * Function to check if a hash corresponds to a valid wallet/contract address.
 * @param address - The hash to check for validity.
 * @returns True or false, depending on if the hash is a valid address or not.
 */
export const isAddress = (address: Address) => {
  return ethers.utils.isAddress(address);
}

/* ========================================================================================================================================================================= */

/**
 * Function to get all relevant native token info.
 * @param chain - The blockchain to query info from.
 * @param rawBalance - The balance to be assigned to the native token's object, with decimals.
 * @param owner - The native token owner's wallet address.
 * @returns A NativeToken object with all its information.
 */
export const addNativeToken = async (chain: EVMChain, rawBalance: number, owner: Address): Promise<NativeToken> => {

  // Initializing Token Values:
  let type: TokenType = 'nativeToken';
  let location = 'wallet';
  let status: TokenStatus = 'none';
  let address = defaultAddress;
  let decimals = 18;
  let balance = rawBalance / (10 ** decimals);
  let price = await getTokenPrice(chain, defaultAddress, decimals);
  let symbol = getNativeTokenSymbol(chain);

  // Finding Token Logo:
  let logo = getTokenLogo(chain, symbol);

  return { type, chain, location, status, owner, symbol, address, balance, price, logo };
}

/* ========================================================================================================================================================================= */

/**
 * Function to get all relevant token info.
 * @param chain - The blockchain to query info from.
 * @param location - The current location of the token, either in a wallet or in some project's contract.
 * @param status - The current status of the token.
 * @param address - The token's address.
 * @param rawBalance - The balance to be assigned to the token's object, with decimals.
 * @param owner - The token owner's wallet address.
 * @returns A Token object with all its information.
 */
export const addToken = async (chain: EVMChain, location: string, status: TokenStatus, address: Address, rawBalance: number, owner: Address): Promise<Token> => {

  // Initializing Token Values:
  let type: TokenType = 'token';
  let symbol = '';
  let decimals = 18;
  let logo: URL;

  // Initializing Multicall:
  let calls: CallContext[] = [
    { reference: 'symbol', methodName: 'symbol', methodParameters: [] },
    { reference: 'decimals', methodName: 'decimals', methodParameters: [] }
  ];

  // Finding Token Info:
  if(address.toLowerCase() === defaultAddress) {
    symbol = getNativeTokenSymbol(chain);
    logo = getTokenLogo(chain, symbol);
  } else {
    let token = getTrackedTokenInfo(chain, address);
    if(token) {
      symbol = token.symbol;
      decimals = token.decimals;
      logo = token.logo;
    } else {
      let multicallResults = await multicallOneContractQuery(chain, address, minABI, calls);
      symbol = multicallResults['symbol'][0];
      decimals = multicallResults['decimals'][0];
      logo = getTokenLogo(chain, symbol);
    }
  }

  // Finding Missing Token Info:
  let balance = rawBalance / (10 ** decimals);
  let price = await getTokenPrice(chain, address, decimals);

  return { type, chain, location, status, owner, symbol, address, balance, price, logo };
}

/* ========================================================================================================================================================================= */

/**
 * Function to get all relevant liquidity pool token info.
 * @param chain - The blockchain to query info from.
 * @param location - The current location of the token, either in a wallet or in some project's contract.
 * @param status - The current status of the token.
 * @param address - The token's address.
 * @param rawBalance - The balance to be assigned to the token's object, with decimals.
 * @param owner - The token owner's wallet address.
 * @returns A LPToken object with all its information.
 */
export const addLPToken = async (chain: EVMChain, location: string, status: TokenStatus, address: Address, rawBalance: number, owner: Address): Promise<LPToken> => {

  // Initializing Token Values:
  let type: TokenType = 'lpToken';
  let symbol = '';
  let decimals = 18;
  let symbol0 = '';
  let symbol1 = '';
  let decimals0 = 18;
  let decimals1 = 18;

  // Initializing Multicalls:
  let lpCalls: CallContext[] = [
    { reference: 'symbol', methodName: 'symbol', methodParameters: [] },
    { reference: 'decimals', methodName: 'decimals', methodParameters: [] },
    { reference: 'reserves', methodName: 'getReserves', methodParameters: [] },
    { reference: 'totalSupply', methodName: 'totalSupply', methodParameters: [] },
    { reference: 'token0', methodName: 'token0', methodParameters: [] },
    { reference: 'token1', methodName: 'token1', methodParameters: [] }
  ];
  let tokenCalls: CallContext[] = [
    { reference: 'symbol', methodName: 'symbol', methodParameters: [] },
    { reference: 'decimals', methodName: 'decimals', methodParameters: [] }
  ];

  // Finding LP Token Info:
  let lpMulticallResults = await multicallOneContractQuery(chain, address, lpABI, lpCalls);
  symbol = lpMulticallResults['symbol'][0];
  decimals = lpMulticallResults['decimals'][0];
  let balance = rawBalance / (10 ** decimals);
  let lpTokenReserves: any[] = lpMulticallResults['reserves'];
  let lpTokenSupply = parseBN(lpMulticallResults['totalSupply'][0]) / (10 ** decimals);
  let address0: Address = lpMulticallResults['token0'][0];
  let address1: Address = lpMulticallResults['token1'][0];
  let trackedToken0 = getTrackedTokenInfo(chain, address0);
  let trackedToken1 = getTrackedTokenInfo(chain, address1);
  if(trackedToken0) {
    symbol0 = trackedToken0.symbol;
    decimals0 = trackedToken0.decimals;
  } else {
    let tokenMulticallResults = await multicallOneContractQuery(chain, address0, minABI, tokenCalls);
    symbol0 = tokenMulticallResults['symbol'][0];
    decimals0 = tokenMulticallResults['decimals'][0];
  }
  if(trackedToken1) {
    symbol1 = trackedToken1.symbol;
    decimals1 = trackedToken1.decimals;
  } else {
    let tokenMulticallResults = await multicallOneContractQuery(chain, address1, minABI, tokenCalls);
    symbol1 = tokenMulticallResults['symbol'][0];
    decimals1 = tokenMulticallResults['decimals'][0];
  }
  let supply0 = parseBN(lpTokenReserves[0]) / (10 ** decimals0);
  let supply1 = parseBN(lpTokenReserves[1]) / (10 ** decimals1);

  // First Paired Token:
  let token0: PricedToken = {
    symbol: symbol0,
    address: address0,
    balance: (supply0 * (balance / lpTokenSupply)),
    price: await getTokenPrice(chain, address0, decimals0),
    logo: getTokenLogo(chain, symbol0)
  }

  // Second Paired Token:
  let token1: PricedToken = {
    symbol: symbol1,
    address: address1,
    balance: (supply1 * (balance / lpTokenSupply)),
    price: await getTokenPrice(chain, address1, decimals1),
    logo: getTokenLogo(chain, symbol1)
  }

  return { type, chain, location, status, owner, symbol, address, balance, token0, token1 };
}

/* ========================================================================================================================================================================= */

/**
 * Function to get all relevant debt token info.
 * @param chain - The blockchain to query info from.
 * @param location - The current location of the token, either in a wallet or in some project's contract.
 * @param address - The token's address.
 * @param rawBalance - The balance to be assigned to the token's object, with decimals.
 * @param owner - The token owner's wallet address.
 * @returns A DebtToken object with all its information.
 */
export const addDebtToken = async (chain: EVMChain, location: string, address: Address, rawBalance: number, owner: Address): Promise<DebtToken> => {

  // Initializing Token Values:
  let type: TokenType = 'debt';
  let status: TokenStatus = 'borrowed';
  let symbol = '';
  let decimals = 18;
  let logo: URL;

  // Initializing Multicall:
  let calls: CallContext[] = [
    { reference: 'symbol', methodName: 'symbol', methodParameters: [] },
    { reference: 'decimals', methodName: 'decimals', methodParameters: [] }
  ];

  // Finding Token Info:
  if(address.toLowerCase() === defaultAddress) {
    symbol = getNativeTokenSymbol(chain);
    logo = getTokenLogo(chain, symbol);
  } else {
    let token = getTrackedTokenInfo(chain, address);
    if(token) {
      symbol = token.symbol;
      decimals = token.decimals;
      logo = token.logo;
    } else {
      let multicallResults = await multicallOneContractQuery(chain, address, minABI, calls);
      symbol = multicallResults['symbol'][0];
      decimals = multicallResults['decimals'][0];
      logo = getTokenLogo(chain, symbol);
    }
  }

  // Finding Missing Token Info:
  let balance = rawBalance / (10 ** decimals);
  let price = await getTokenPrice(chain, address, decimals);

  return { type, chain, location, status, owner, symbol, address, balance, price, logo };
}

/* ========================================================================================================================================================================= */

/**
 * Function to get all relevant derivative/composite token info (example: xJOE).
 * @param chain - The blockchain to query info from.
 * @param location - The current location of the token, either in a wallet or in some project's contract.
 * @param status - The current status of the token.
 * @param address - The token's address.
 * @param rawBalance - The balance to be assigned to the token's object, with decimals.
 * @param owner - The token owner's wallet address.
 * @param underlyingAddress - The underlying token's address (the token this token is built upon).
 * @param underlyingRawBalance - The equivalent balance of the underlying token this xToken represents.
 * @returns A XToken object with all its information.
 */
export const addXToken = async (chain: EVMChain, location: string, status: TokenStatus, address: Address, rawBalance: number, owner: Address, underlyingAddress: Address, underlyingRawBalance: number): Promise<XToken> => {

  // Initializing Token Values:
  let type: TokenType = 'xToken';
  let symbol = '';
  let decimals = 18;
  let underlyingSymbol = '';
  let underlyingDecimals = 18;
  let underlyingLogo: URL;

  // Initializing Multicall:
  let calls: CallContext[] = [
    { reference: 'symbol', methodName: 'symbol', methodParameters: [] },
    { reference: 'decimals', methodName: 'decimals', methodParameters: [] }
  ];

  // Finding Token Info:
  let multicallResults = await multicallOneContractQuery(chain, address, minABI, calls);
  symbol = multicallResults['symbol'][0];
  decimals = multicallResults['decimals'][0];
  let balance = rawBalance / (10 ** decimals);
  let logo = getTokenLogo(chain, symbol);

  // Finding Underlying Token Info:
  let token = getTrackedTokenInfo(chain, address);
  if(token) {
    underlyingSymbol = token.symbol;
    underlyingDecimals = token.decimals;
    underlyingLogo = token.logo;
  } else {
    let underlyingMulticallResults = await multicallOneContractQuery(chain, underlyingAddress, minABI, calls);
    underlyingSymbol = underlyingMulticallResults['symbol'][0];
    underlyingDecimals = underlyingMulticallResults['decimals'][0];
    underlyingLogo = getTokenLogo(chain, underlyingSymbol);
  }

  // Underlying Token:
  let underlyingToken: PricedToken = {
    symbol: underlyingSymbol,
    address: underlyingAddress,
    balance: underlyingRawBalance / (10 ** underlyingDecimals),
    price: await getTokenPrice(chain, underlyingAddress, underlyingDecimals),
    logo: underlyingLogo
  }

  return { type, chain, location, status, owner, symbol, address, balance, logo, underlyingToken };
}

/* ========================================================================================================================================================================= */

/**
 * Function to get a list of all tracked tokens on any given chain.
 * @param chain - The chain to fetch tracked tokens from.
 * @returns An array of all tracked tokens in the given chain.
 */
export const getTokens = (chain: EVMChain) => {
  let chainTokenData = getChainTokenData(chain);
  if(chainTokenData) {
    return chainTokenData.tokens;
  } else {
    return [];
  }
}

/* ========================================================================================================================================================================= */

/**
 * Helper function to get a given chains' token data.
 * @param chain - The chain to fetch data from.
 * @returns The given chain's token data.
 */
export const getChainTokenData = (chain: EVMChain) => {
  switch(chain) {
    case 'eth':
      return eth_data;
    case 'bsc':
      return bsc_data;
    case 'poly':
      return poly_data;
    case 'ftm':
      return ftm_data;
    case 'avax':
      return avax_data;
    case 'one':
      return one_data;
    case 'cronos':
      return cronos_data;
    default:
      return undefined;
  }
}

/* ========================================================================================================================================================================= */

/**
 * Function to get a token's logo.
 * @param chain - The chain to fetch data from.
 * @param symbol - The token's symbol.
 * @returns The token logo if available, else a generic coin logo.
 */
export const getTokenLogo = (chain: EVMChain, symbol: string) => {

  // Initializing Default Token Logo:
  let logo = defaultTokenLogo;

  // Selecting Token Data:
  let data = getChainTokenData(chain);

  // Finding Token Logo:
  if(data) {
    let trackedToken = data.tokens.find(token => token.symbol === symbol);
    if(trackedToken) {
      logo = trackedToken.logo;
    } else {
      let token = data.logos.find(i => i.symbol === symbol);
      if(token) {
        logo = token.logo;
      }
    }
  }

  return logo;
}

/* ========================================================================================================================================================================= */

/**
 * Function to resolve an ENS domain into an address.
 * @param ensAddress - The ENS domain to resolve.
 * @returns An address if resolvable, else null.
 */
export const resolveENS = async (ensAddress: ENSDomain) => {
  let ethers_provider = new ethers.providers.JsonRpcProvider(chains['eth'].rpcs[0]);
  let address = await ethers_provider.resolveName(ensAddress);
  if(address) {
    return address as Address;
  } else {
    return null;
  }
}

/* ========================================================================================================================================================================= */

/**
 * Function to reverse lookup an ENS domain.
 * @param address - The address to reverse lookup.
 * @returns An ENS domain if resolvable, else null.
 */
export const lookupENS = async (address: Address) => {
  let ethers_provider = new ethers.providers.JsonRpcProvider(chains['eth'].rpcs[0]);
  let ensAddress = await ethers_provider.lookupAddress(address);
  if(ensAddress) {
    return ensAddress as ENSDomain;
  } else {
    return null;
  }
}

/* ========================================================================================================================================================================= */

/**
 * Helper function to parse big numbers from query results.
 * @param bn - The big number to parse.
 * @returns A regular JavaScript number.
 */
export const parseBN = (bn: any) => {
  return parseInt(ethers.BigNumber.from(bn).toString());
}

/* ========================================================================================================================================================================= */

/**
 * Function to get a wallet's native token balance.
 * @param chain - The blockchain to query info from.
 * @param wallet - The wallet to query native balance for.
 * @returns An array of NativeToken objects if any balance is found.
 */
const getWalletNativeTokenBalance = async (chain: EVMChain, wallet: Address) => {
  let balance;
  let errors = 0;
  let rpcID = 0;
  while(!balance && errors < maxQueryRetries) {
    try {
      let ethers_provider = new ethers.providers.JsonRpcProvider(chains[chain].rpcs[rpcID]);
      balance = parseInt((await ethers_provider.getBalance(wallet)).toString());
    } catch {
      if(++rpcID >= chains[chain].rpcs.length) {
        errors++;
        rpcID = 0;
      }
    }
  }
  if(balance && balance > 0) {
    let newToken = await addNativeToken(chain, balance, wallet);
    return [newToken];
  }
  return [];
}

/* ========================================================================================================================================================================= */

/**
 * Function to get a wallet's token balance.
 * @param chain - The blockchain to query info from.
 * @param wallet - The wallet to query token balances for.
 * @returns An array of Token objects if any balances are found.
 */
const getWalletTokenBalance = async (chain: EVMChain, wallet: Address) => {
  let tokens: Token[] = [];
  let data = getChainTokenData(chain);
  if(data) {
    let addresses: Address[] = data.tokens.map(token => token.address);
    let multicallResults = await multicallOneMethodQuery(chain, addresses, minABI, 'balanceOf', [wallet]);
    let promises = data.tokens.map(token => (async () => {
      let balanceResults = multicallResults[token.address];
      if(balanceResults) {
        let rawBalance = parseBN(balanceResults[0]);
        if(rawBalance > 0) {
          let newToken = await addTrackedToken(chain, 'wallet', 'none', token, rawBalance, wallet);
          tokens.push(newToken);
        }
      }
    })());
    await Promise.all(promises);
  }
  return tokens;
}

/* ========================================================================================================================================================================= */

/**
 * Helper function to get an already tracked token's info.
 * @param chain - The chain to fetch data from.
 * @param address - The token's address.
 * @returns The token's data if tracked, else undefined.
 */
const getTrackedTokenInfo = (chain: EVMChain, address: Address) => {
  let data = getChainTokenData(chain);
  if(data) {
    return data.tokens.find(token => token.address.toLowerCase() === address.toLowerCase());
  } else {
    return undefined;
  }
}

/* ========================================================================================================================================================================= */

/**
 * Function to get all relevant info from an already tracked token.
 * @param chain - The chain to fetch data from.
 * @param location - The current location of the token, either in a wallet or in some project's contract.
 * @param status - The current status of the token.
 * @param token - The token's address.
 * @param rawBalance - The balance to be assigned to the token's object, with decimals.
 * @param owner - The token owner's wallet address.
 * @returns A Token object with all its information.
 */
const addTrackedToken = async (chain: EVMChain, location: string, status: TokenStatus, token: TokenData, rawBalance: number, owner: Address): Promise<Token> => {

  // Initializing Token Values:
  let type: TokenType = 'token';
  let address = token.address;
  let symbol = token.symbol;
  let logo = token.logo;
  let decimals = token.decimals;
  let balance = rawBalance / (10 ** decimals);
  let price = await getTokenPrice(chain, address, decimals);

  return { type, chain, location, status, owner, symbol, address, balance, price, logo };
}

/* ========================================================================================================================================================================= */

/**
 * Helper function to get a native token's symbol.
 * @param chain - The blockchain the native token belongs to.
 * @returns The appropriate token's symbol.
 */
const getNativeTokenSymbol = (chain: EVMChain) => {
  if(chain === 'bsc') {
    return 'BNB';
  } else if(chain === 'poly') {
    return 'MATIC';
  } else if(chain === 'cronos') {
    return 'CRO';
  } else {
    return chain.toUpperCase();
  }
}