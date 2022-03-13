
// Required Packages:
const fs = require('fs');

// Imports:
import { ethers } from 'ethers';
import { query } from './functions';
import { beethovenx } from './ABIs';
import type { Chain, ChainData, Address, Hash } from './types';

// Required JSON Files:
const chains: Record<Chain, ChainData> = require('../static/chains.json');

// Initializations:
const projectsFile = 'projects.json';
const beethovenFile = 'beethovenx-pools.json';
const beethovenVault = '0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce';
const beethovenMaxInactiveBlocks = 30000;
const beethovenFactoryAddresses: Address[] = [
  '0x60467cb225092cE0c989361934311175f437Cf53',
  '0x92b377187bcCC6556FceD2f1e6DAd65850C20630',
  '0x55df810876354Fc3e249f701Dd78DeDE57991F8D',
  '0x2C774732c93CE393eC8125bDA49fb3737Ae6F473',
  '0x70b55Af71B29c5Ca7e67bD1995250364C4bE5554'
];

// Setting Up Optional Args:
let quickUpdate = false;
const args = process.argv.slice(2);
if(args.length > 0) {
  if(args[0] === 'quick') {
    quickUpdate = true;
  }
}

/* ========================================================================================================================================================================= */

// Function to update 'projects.json' file:
const updateProjects = () => {

  // Initializing Project List:
  let projectList: Record<Chain, string[]> = { 'eth': [], 'bsc': [], 'poly': [], 'ftm': [], 'avax': [], 'one': [], 'terra': [] };

  // Update Alert:
  console.info(`Updating projects file...`);

  // Fetching Data:
  let chains: string[] = fs.readdirSync('./dist/projects');
  chains.forEach(stringChain => {
    let chain = stringChain as Chain;
    let projects = fs.readdirSync(`./dist/projects/${chain}`).filter((project: string) => !project.endsWith('.d.ts')).map((project: string) => project.slice(0, -3));
    projectList[chain].push(...projects);
  });

  // Writing File:
  fs.writeFile(`./static/${projectsFile}`, JSON.stringify(projectList, null, ' '), 'utf8', (err: any) => {
    if(err) {
      console.error(err);
    } else {
      console.info(`Successfully updated ${projectsFile}.`);
    }
  });
}

/* ========================================================================================================================================================================= */

// Function to update 'beethovenx-pools.json' file:
const updateBeethovenxPools = async () => {

  // Initializing Pools List:
  let beethovenxPools: Hash[] = [];

  // Update Alert:
  console.info('Updating Beethoven X pools file...');

  // Ethers Setup:
  let ftm = new ethers.providers.JsonRpcProvider(chains['ftm'].rpcs[0]);
  let ftmBackup = new ethers.providers.JsonRpcProvider(chains['ftm'].rpcs[1]);

  // Fetching Current Block:
  let currentBlock = await ftm.getBlockNumber();

  // Fetching Data:
  beethovenxPools.push(...(await fetchPoolIDsFromFactory(beethovenFactoryAddresses[0], currentBlock, ftm, ftmBackup)));
  beethovenxPools.push(...(await fetchPoolIDsFromFactory(beethovenFactoryAddresses[1], currentBlock, ftm, ftmBackup)));
  beethovenxPools.push(...(await fetchPoolIDsFromFactory(beethovenFactoryAddresses[2], currentBlock, ftm, ftmBackup)));
  beethovenxPools.push(...(await fetchPoolIDsFromFactory(beethovenFactoryAddresses[3], currentBlock, ftm, ftmBackup)));
  beethovenxPools.push(...(await fetchPoolIDsFromFactory(beethovenFactoryAddresses[4], currentBlock, ftm, ftmBackup)));

  // Writing File:
  beethovenxPools.sort();
  fs.writeFile(`./static/${beethovenFile}`, JSON.stringify(beethovenxPools, null, ' '), 'utf8', (err: any) => {
    if(err) {
      console.error(err);
    } else {
      console.info(`Successfully updated ${beethovenFile}.`);
    }
  });
}

// Helper function to fetch pool IDs from factory addresses:
const fetchPoolIDsFromFactory = async (factory: Address, currentBlock: number, ftm: ethers.providers.JsonRpcProvider, ftmBackup: ethers.providers.JsonRpcProvider) => {

  // Initializations:
  let poolIDs: Hash[] = [];
  let creationEvents;
  let batchSize = 50;
  let startBatch = 0;
  let endBatch = batchSize;

  // Events Setup:
  let factoryEvents = new ethers.Contract(factory, ['event PoolCreated(address indexed pool)'], ftm);
  let factoryEventsBackup = new ethers.Contract(factory, ['event PoolCreated(address indexed pool)'], ftmBackup);

  // Fetching Pool IDs:
  try {
    while(!creationEvents) {
      try {
        creationEvents = await factoryEvents.queryFilter(factoryEvents.filters.PoolCreated());
      } catch {
        console.warn(`Retrying Pool Creation Query: ${factory}...`);
        creationEvents = await factoryEventsBackup.queryFilter(factoryEventsBackup.filters.PoolCreated());
      }
    }
    if(creationEvents.length <= batchSize) {
      let promises = creationEvents.map(event => (async () => {
        if(event.args) {
          let address: Address = event.args[0];
          let poolID = await query('ftm', address, beethovenx.poolABI, 'getPoolId', []);
          let lastChangeBlock = parseInt((await query('ftm', beethovenVault, beethovenx.vaultABI, 'getPoolTokens', [poolID])).lastChangeBlock);
          if(lastChangeBlock > currentBlock - beethovenMaxInactiveBlocks) {
            poolIDs.push(poolID);
          }
        }
      })());
      await Promise.all(promises);
    } else {
      while(endBatch < creationEvents.length + batchSize) {
        let promises = creationEvents.slice(startBatch, endBatch).map(event => (async () => {
          if(event.args) {
            let address: Address = event.args[0];
            let poolID = await query('ftm', address, beethovenx.poolABI, 'getPoolId', []);
            let lastChangeBlock = parseInt((await query('ftm', beethovenVault, beethovenx.vaultABI, 'getPoolTokens', [poolID])).lastChangeBlock);
            if(lastChangeBlock > currentBlock - beethovenMaxInactiveBlocks) {
              poolIDs.push(poolID);
            }
          }
        })());
        await Promise.all(promises);
        startBatch += batchSize;
        endBatch += batchSize;
      }
    }
    console.info(`Successfully fetched pool IDs for factory: ${factory}`);
  } catch(err) {
    console.error(err);
  }

  return poolIDs;
}

/* ========================================================================================================================================================================= */

// Performing quick updates when deploying:
updateProjects();

// Other updates to run through 'npm run update':
if(!quickUpdate) {
  updateBeethovenxPools();
}