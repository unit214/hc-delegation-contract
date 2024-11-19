const { assert } = require("chai");
const { utils } = require("@aeternity/aeproject");
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");

chai.use(chaiAsPromised);

const HC_ELECTION_CONTRACT_SOURCE = "./contracts/HCElection.aes";
const MAIN_STAKING_CONTRACT_SOURCE = "./contracts/MainStaking.aes";
const DELEGATED_STAKING_CONTRACT_SOURCE = "./contracts/DelegatedStaking.aes";

BigInt.prototype.toJSON = function () {
  return this.toString();
};

describe("StakingContract", () => {
  let aeSdk;
  let hcElection, mainStaking, delegatedStaking;

  async function getEpochInfo() {
    return hcElection.epoch_info().then((res) => res.decodedResult);
  }

  async function nextEpoch() {
    const epochInfo = await getEpochInfo();

    const height = await aeSdk.getHeight();
    const epochEnd = Number(epochInfo[1].start + epochInfo[1].length - 1n);
    await utils.awaitKeyBlocks(aeSdk, Number(epochEnd - height));
    await hcElection.step_eoe(aeSdk.address, 0, 0, 0, false);
  }

  async function getStakingState() {
    return mainStaking.get_state().then((res) => res.decodedResult);
  }

  before(async () => {
    aeSdk = utils.getSdk();
    await utils.rollbackHeight(aeSdk, 0);

    mainStaking = await aeSdk.initializeContract({
      sourceCode: utils
        .getContractContent(MAIN_STAKING_CONTRACT_SOURCE)
        .replace("contract MainStaking", "main contract MainStaking"),
      fileSystem: utils.getFilesystem(MAIN_STAKING_CONTRACT_SOURCE),
    });
    await mainStaking.init(10, 10, 0, 0, 0, 0);

    hcElection = await aeSdk.initializeContract({
      sourceCode: utils
        .getContractContent(HC_ELECTION_CONTRACT_SOURCE)
        .replace("contract HCElection", "main contract HCElection"),
      fileSystem: utils.getFilesystem(HC_ELECTION_CONTRACT_SOURCE),
    });
    await hcElection.init(mainStaking.$options.address);
    await hcElection.init_epochs(10, 10000);

    delegatedStaking = await aeSdk.initializeContract({
      sourceCode: utils
        .getContractContent(DELEGATED_STAKING_CONTRACT_SOURCE)
        .replace("contract DelegatedStaking", "main contract DelegatedStaking"),
      fileSystem: utils.getFilesystem(DELEGATED_STAKING_CONTRACT_SOURCE),
    });
    await delegatedStaking.init(mainStaking.$options.address, { amount: 10 });

    await utils.createSnapshot(aeSdk);
  });

  afterEach(async () => {
    //await utils.rollbackSnapshot(aeSdk);
  });

  it("HCElection: epoch", async () => {
    const getBefore = await hcElection.epoch();
    assert.equal(getBefore.decodedResult, 1n);

    await nextEpoch();

    const getAfter = await hcElection.epoch();
    assert.equal(getAfter.decodedResult, 2n);
  });

  it("DelegatedStaking: register_validator", async () => {
    await delegatedStaking.register_validator({ amount: 10 });
    console.log(JSON.stringify(await getStakingState(), null, 2));
  });

  it("MainStaking: reward", async () => {
    await mainStaking.reward(
      delegatedStaking.$options.address.replace("ct_", "ak_"),
      {
        amount: 1000,
      },
    );

    console.log(JSON.stringify(await getStakingState(), null, 2));
  });

  it("DelegatedStaking: stake", async () => {
    await delegatedStaking.stake({ amount: 100 });
    console.log(JSON.stringify(await getStakingState(), null, 2));
  });
});
