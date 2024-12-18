const { assert } = require("chai");
const { utils } = require("@aeternity/aeproject");
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");
const { generateKeyPair } = require("@aeternity/aepp-sdk");
const util = require("util");

chai.use(chaiAsPromised);

const HC_ELECTION_CONTRACT_SOURCE = "./contracts/HCElection.aes";
const MAIN_STAKING_CONTRACT_SOURCE = "./contracts/MainStaking.aes";
const DELEGATED_STAKING_CONTRACT_SOURCE =
  "./contracts/NikitaDelegatedStaking.aes";

BigInt.prototype.toJSON = function () {
  return this.toString();
};

describe("StakingContract", () => {
  let aeSdk;
  let hcElection, mainStaking, delegatedStaking;
  const validator = generateKeyPair();

  async function getEpochInfo() {
    return hcElection.epoch_info().then((res) => res.decodedResult);
  }

  async function nextEpoch() {
    const epochInfo = await getEpochInfo();

    const height = await aeSdk.getHeight();
    const epochEnd = Number(epochInfo[1].start + epochInfo[1].length - 1n);
    await utils.awaitKeyBlocks(aeSdk, Number(epochEnd - height));
    await hcElection.step_eoe(validator.publicKey, 0, 0, 0, false);
    await hcElection.add_reward(await aeSdk.getHeight(), validator.publicKey, {
      amount: 1000n,
    });
  }

  async function getMainStakingState() {
    return mainStaking.get_state().then((res) => res.decodedResult);
  }

  async function getDelegatedStakingState() {
    return delegatedStaking.get_state().then((res) => res.decodedResult);
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
    await mainStaking.init(10);

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
    await delegatedStaking.init(
      validator.publicKey,
      mainStaking.$options.address,
      10,
      100,
      10,
      0,
      { amount: 1000 },
    );

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

  it("DelegatedStaking: stake", async () => {
    console.log("getDelegatedStakingState", await getDelegatedStakingState());
    await delegatedStaking.delegate_stake({
      amount: 100,
      onAccount: utils.getDefaultAccounts()[1],
    });
    console.log("getDelegatedStakingState", await getDelegatedStakingState());
    await nextEpoch();
    await delegatedStaking.delegate_stake({
      amount: 100,
      onAccount: utils.getDefaultAccounts()[1],
    });

    console.log("getDelegatedStakingState", await getDelegatedStakingState());
    await nextEpoch();
    console.log(
      await aeSdk.getBalance(
        delegatedStaking.$options.address.replace("ct_", "ak_"),
      ),
    );
    await nextEpoch();
    console.log("getDelegatedStakingState", await getDelegatedStakingState());
    await delegatedStaking.delegate_stake({
      amount: 100,
      onAccount: utils.getDefaultAccounts()[1],
    });
    console.log("getDelegatedStakingState", await getDelegatedStakingState());
    await nextEpoch();
    console.log("getDelegatedStakingState", await getDelegatedStakingState());
    console.log("getMainStakingState", await getMainStakingState());

    for (const i of [...Array(20)]) {
      await nextEpoch();
    }
  });

  it("DelegatedStaking: request_unstake_delegated_stakes", async () => {
    for (const i of [...Array(20)]) {
      await nextEpoch();
    }
    await delegatedStaking.request_unstake_delegated_stakes({
      onAccount: utils.getDefaultAccounts()[1],
    });
    console.log(
      "getDelegatedStakingState",
      util.inspect(await getDelegatedStakingState(), false, null, true),
    );
    console.log(
      "getMainStakingState",
      util.inspect(await getMainStakingState(), false, null, true),
    );
  });

  it("DelegatedStaking: withdraw", async () => {
    for (const i of [...Array(20)]) {
      await nextEpoch();
    }
    await delegatedStaking.withdraw({
      onAccount: utils.getDefaultAccounts()[1],
    });
    console.log(
      "getDelegatedStakingState",
      util.inspect(await getDelegatedStakingState(), false, null, true),
    );
  });

  it("DelegatedStaking: request_withdraw_rewards", async () => {
    await delegatedStaking.request_withdraw_rewards({
      onAccount: utils.getDefaultAccounts()[1],
    });
    console.log(
      "getDelegatedStakingState",
      util.inspect(await getDelegatedStakingState(), false, null, true),
    );
  });
});
