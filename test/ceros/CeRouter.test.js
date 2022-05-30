const ceVault = artifacts.require('CeVault');
const CeToken = artifacts.require("CeToken");
const CeRouter = artifacts.require("CerosRouter");
const aBNBc = artifacts.require("aBNBc");
// for testing
const wBNB = artifacts.require("wBNB");
const aBNBb = artifacts.require("aBNBb");
const Usb = artifacts.require("Usb");
const hBNB = artifacts.require("hBNB");
const BinancePool = artifacts.require("BinancePool");
const ceDao = artifacts.require("Interaction");
const Router = artifacts.require("PancakeRouter");
const Factory = artifacts.require("PancakeFactory");
const Spot = artifacts.require("Spotter");
const Jug = artifacts.require("Jug");
const Vat = artifacts.require("Vat");
const Dog = artifacts.require("Dog");
const Clipper = artifacts.require("Clipper");
const UsbJoin = artifacts.require("UsbJoin");
const GemJoin = artifacts.require("GemJoin");

const toBN = web3.utils.toBN;
const ethers = require("ethers");
const { constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { poll } = require("ethers/lib/utils");

let owner, staker_1, staker_2,
    amount_1, amount_2, deposited_amount,
    abnbc, abnbb, wbnb, hbnb, usb, join_address,
    ce_vault, ce_token, ce_router, ce_dao, pool;


async function init() {
    ratio_1 = toBN(1e18);
    ratio_2 = toBN(1e17);
    ratio_3 = toBN(1e15);

    amount_1 = toBN('10000000020000000000');
    amount_2 = toBN('20000000020000000000');

    /* ceVault */
    ce_vault = await ceVault.new();
    await ce_vault.initialize("CeVault", ce_token.address, abnbc.address);
    // set vault for ceABNBc
    await ce_token.changeVault(ce_vault.address);
    /* CeRouter */
    ce_router = await CeRouter.new();
    await ce_router.initialize(abnbc.address, wbnb.address, ce_token.address, abnbb.address,
        ce_vault.address, dex.address, pool.address);

    await hbnb.changeMinter(ce_router.address);
    await ce_vault.changeRouter(ce_router.address);
}

async function deployTokensDexDao(accounts) {
    [owner, intermediary, bc_operator, staker_1, staker_2, staker_3, operator] = accounts;

    /* ceToken */
    ce_token = await CeToken.new();
    await ce_token.initialize("Ceros token", "ceAbnbc");

    /* aBNBb */
    abnbb = await aBNBb.new();
    await abnbb.initialize(owner);
    /* aBNBc */
    abnbc = await aBNBc.new("aBNBc test token", "aBNBc");
    await abnbc.initialize(constants.ZERO_ADDRESS, abnbb.address);
    await abnbb.changeABNBcToken(abnbc.address);
    /* wBNB */
    wbnb = await wBNB.new();
    /* USB */
    usb = await Usb.new(97, "testUSB");
    /* hBNB */
    hbnb = await hBNB.new();
    await hbnb.initialize();

    const factory = await Factory.new(owner);
    dex = await Router.new(factory.address, wbnb.address);
    // mint tokens
    await abnbc.mint(owner, toBN(5e18).toString());
    await wbnb.mint(owner, toBN(5e18).toString());
    // approve
    await abnbc.approve(dex.address, toBN(5e18).toString());
    await wbnb.approve(dex.address, toBN(5e18).toString());

    const reserve_0 = toBN('1000000000000000000');
    await dex.addLiquidityETH(abnbc.address,
        reserve_0.toString(), reserve_0.div(toBN(2)).toString(), reserve_0.toString(),
        owner, 9999999999, { value: reserve_0.toString() }
    );

    /* vat */
    const vat = await Vat.new();
    /* dog */
    const dog = await Dog.new(vat.address);
    /* spot */
    const spot = await Spot.new(vat.address);
    /* usbJoin */
    const usbJoin = await UsbJoin.new(vat.address, usb.address);
    /* jug */
    const jug = await Jug.new(vat.address);
    /* DAO */
    ce_dao = await ceDao.new();
    await ce_dao.initialize(
        vat.address,
        spot.address,
        usb.address,
        usbJoin.address,
        jug.address,
        dog.address,
        '0x76c2f516E814bC6B785Dfe466760346a5aa7bbD1',
        constants.ZERO_ADDRESS
    );
    // add dao to vat
    await vat.rely(ce_dao.address);
    //
    const collateral = ethers.utils.formatBytes32String("ceABNBc");
    /* clip */
    clip = await Clipper.new(vat.address, spot.address, dog.address, collateral);
    /* gemJoin */
    const ce_Abnbc_join = await GemJoin.new(vat.address, collateral, ce_token.address);
    join_address = ce_Abnbc_join.address;
    await ce_dao.setCollateralType(ce_token.address, ce_Abnbc_join.address, collateral, clip.address);

    /* BinancePool */
    pool = await BinancePool.new();
    await pool.initialize(owner, bc_operator, 60 * 60);

    await pool.changeBondContract(abnbb.address);
    await abnbb.changeBinancePool(pool.address);
    await abnbb.changeABNBcToken(abnbc.address);
    await abnbb.changeSwapFeeParams(owner, '10000000000000000');
    await pool.changeCertContract(abnbc.address);
}


async function mintTokens() {
    await abnbc.mint(staker_1, amount_2.mul(toBN(2)), { from: staker_1 });
}

async function initWithDexes(accounts) {
    await deployTokensDexDao(accounts);
    await init();
    await mintTokens();
}

contract('CeRouter', (accounts) => {
    xdescribe('Withdrawal', async () => {
        before(async function () {
            return initWithDexes(accounts);
        });
        it('deposit', async () => {
            // await ce_token.approve(ce_dao.address, amount_2.toString(), { from: staker_1 });
            tx = await ce_router.deposit({ from: staker_1, value: amount_2.toString() });
            deposited_amount = tx.logs['0'].args.amount;
        });
        xit('verify balances after deposit in BNB and tokens supplies', async () => {
            bnb_balance = await web3.eth.getBalance(staker_1);
            console.log(`BNB balance(staker_1): ${bnb_balance.toString()}`);
            // hBNB
            assert.equal(
                (await hbnb.balanceOf(staker_1)).toString(),
                deposited_amount.toString(),
                'balance of staker_1 in hBNB is wrong'
            );
            // aBNBc
            assert.equal(
                (await abnbc.balanceOf(staker_1)).toString(),
                amount_2.mul(toBN(2)).toString(),
                'balance of staker_1 in aBNBc is wrong'
            );
            // ceToken
            assert.equal(
                (await ce_token.balanceOf(staker_1)).toString(), '0',
                'balance of staker_1 in ce_token is wrong'
            );
            // verify supplies
            assert.equal(
                (await ce_token.totalSupply()).toString(),
                (await hbnb.totalSupply()).toString(),
                'supplies of ceToken and hBNB should be equal'
            );
        });
        xit('withdrawal BNB', async () => {
            await ce_router.withdrawWithSlippage(staker_1, deposited_amount.div(toBN(3)).toString(), { from: staker_1 });
        });
        xit('verify balances after deposit in BNB and tokens supplies', async () => {
            bnb_balance = await web3.eth.getBalance(staker_1);
            console.log(`BNB balance(staker_1): ${bnb_balance.toString()}`);
            // hBNB
            assert.equal(
                (await hbnb.balanceOf(staker_1)).toString(),
                deposited_amount.sub(deposited_amount.div(toBN(3))).toString(),
                'balance of staker_1 in hBNB is wrong'
            );
            // aBNBc
            assert.equal(
                (await abnbc.balanceOf(staker_1)).toString(),
                amount_2.mul(toBN(2)).toString(),
                'balance of staker_1 in aBNBc is wrong'
            );
            // ceToken
            assert.equal(
                (await ce_token.balanceOf(staker_1)).toString(), '0',
                'balance of staker_1 in ceToken is wrong'
            );
            // verify supplies
            assert.equal(
                (await ce_token.totalSupply()).toString(),
                (await hbnb.totalSupply()).toString(),
                'supplies of ceToken and hBNB should be equal'
            );
        });
        it('withdrawal BNB via pool', async () => {
            await ce_router.withdraw(staker_1, deposited_amount.div(toBN(3)).toString(), { from: staker_1 });
        });
        xit('verify balances after deposit in BNB and tokens supplies', async () => {
            bnb_balance = await web3.eth.getBalance(staker_1);
            console.log(`BNB balance(staker_1): ${bnb_balance.toString()}`);
            // hBNB
            assert.equal(
                (await hbnb.balanceOf(staker_1)).toString(),
                deposited_amount.sub(deposited_amount.mul(toBN(2)).div(toBN(3))).toString(),
                'balance of staker_1 in hBNB is wrong'
            );
            // aBNBc
            assert.equal(
                (await abnbc.balanceOf(staker_1)).toString(),
                amount_2.mul(toBN(2)).toString(),
                'balance of staker_1 in aBNBc is wrong'
            );
            // ceToken
            assert.equal(
                (await ce_token.balanceOf(staker_1)).toString(), '0',
                'balance of staker_1 in ce_token is wrong'
            );
            // check pending claimers
            console.log(`pending unstakes of staker_1: ${(await pool.pendingUnstakesOf(staker_1)).toString()}`);
            // verify supplies
            assert.equal(
                (await ce_token.totalSupply()).toString(),
                (await hbnb.totalSupply()).toString(),
                'supplies of ceToken and hBNB should be equal'
            );
        });
        it('withdrawal aBNBc', async () => {
            await ce_router.withdrawABNBc(staker_1, deposited_amount.div(toBN(3)).toString(), { from: staker_1 });
        });
        xit('verify balances after deposit in BNB and tokens supplies', async () => {
            hBNB
            assert.equal(
                (await hbnb.balanceOf(staker_1)).toString(), '0',
                'balance of staker_1 in hBNB is wrong'
            );
            // aBNBc
            assert.equal(
                (await abnbc.balanceOf(staker_1)).toString(),
                amount_2.mul(toBN(2)).add(deposited_amount.div(toBN(3))).toString(),
                'balance of staker_1 in aBNBc is wrong'
            );
            // ceToken
            assert.equal(
                (await ce_token.balanceOf(staker_1)).toString(), '0',
                'balance of staker_1 in ce_token is wrong'
            );
            // verify supplies
            assert.equal(
                (await ce_token.totalSupply()).toString(),
                (await hbnb.totalSupply()).toString(),
                'supplies of ceToken and hBNB should be equal'
            );
        });
    });
    describe('Deposit', async () => {
        let bnb_balance, dexABNBc, poolABNBc, profit;
        before(async function () {
            return initWithDexes(accounts);
        });
        it('verify init balances', async () => {
            bnb_balance = await web3.eth.getBalance(staker_1);
            console.log(`BNB balance(staker_1): ${bnb_balance.toString()}`);
            // hBNB
            console.log(`hBNB balance(staker_1): ${(await hbnb.balanceOf(staker_1)).toString()}`);
            assert.equal((await hbnb.balanceOf(staker_1)).toString(), '0', 'balance of staker_1 in hBNB is wrong');
            // aBNBc
            console.log(`aBNBc balance(staker_1): ${(await abnbc.balanceOf(staker_1)).toString()}`);
            assert.equal(
                (await abnbc.balanceOf(staker_1)).toString(),
                amount_2.mul(toBN(2)).toString(),
                'balance of staker_1 in hBNB is wrong'
            );
            // ce_token
            console.log(`ceABNBc balance(staker_1): ${(await ce_token.balanceOf(staker_1)).toString()}`);
            assert.equal(
                (await hbnb.balanceOf(staker_1)).toString(), '0',
                'balance of staker_1 in hBNB is wrong'
            );
            // verify supplies
            assert.equal(
                (await ce_token.totalSupply()).toString(),
                (await hbnb.totalSupply()).toString(),
                'supplies of ce_token and hBNB should be equal'
            );
        });
        it('deposit via BinancePool(returned amount higher than on DEX)', async () => {
            resp = await dex.getAmountsOut(amount_1.toString(), [wbnb.address, abnbc.address]);
            console.log(`returned amount from DEX(in aBNBc): ${resp[1].toString()}`);
            dexABNBc = resp[1];
            // get returned amount from BinancePool
            // poolABNBcAmount = amount - relayerFee - amount*(1-ratio);
            const ratio = await abnbb.ratio();
            const relayerFee = await pool.getRelayerFee();
            poolABNBc = amount_1.sub(relayerFee).sub(amount_1.mul(toBN(1e18).sub(ratio).div(toBN(1e18))));
            console.log(`returned amount from BinancePool(in aBNBc): ${poolABNBc.toString()}`);
            console.log(`dexABNBc > poolABNBc: ${dexABNBc.cmp(poolABNBc).toString()}`)

            // await expectRevert(
            //     ce_router.deposit({ from: staker_1, value: amount_1.toString() }),
            //     'ERC20: insufficient allowance',
            // );
            // await ce_token.approve(ce_dao.address, amount_2.toString(), { from: staker_1 });
            //
            const tx = await ce_router.deposit({ from: staker_1, value: amount_1.toString() });
            deposited_amount = tx.logs['0'].args.amount;
        });
        xit('verify balances after deposit in BNB and tokens supplies', async () => {
            bnb_balance = await web3.eth.getBalance(staker_1);
            console.log(`BNB balance(staker_1): ${bnb_balance.toString()}`);
            // hBNB
            console.log(`hBNB balance(staker_1): ${(await hbnb.balanceOf(staker_1)).toString()}`);
            assert.equal(
                (await hbnb.balanceOf(staker_1)).toString(),
                deposited_amount.toString(),
                'balance of staker_1 in hBNB is wrong'
            );
            // aBNBc
            console.log(`aBNBc balance(staker_1): ${(await abnbc.balanceOf(staker_1)).toString()}`);
            assert.equal(
                (await abnbc.balanceOf(staker_1)).toString(),
                amount_2.mul(toBN(2)).toString(),
                'balance of staker_1 in aBNBc is wrong'
            );
            // cetoken
            console.log(`balance of ce_token: ${(await ce_token.balanceOf(staker_1)).toString()}`);
            assert.equal(
                (await ce_token.balanceOf(staker_1)).toString(), '0',
                'balance of staker_1 in ce_token is wrong'
            );
            // verify supplies
            // In the real case it is not true, but in test cases they should be equal
            assert.equal(
                (await ce_token.totalSupply()).toString(),
                (await hbnb.totalSupply()).toString(),
                'supplies of ce_token and hBNB should be equal'
            );
        });
        it('deposit with some profit from DEX', async () => {
            const resp = await dex.getAmountsOut(amount_1.toString(), [wbnb.address, abnbc.address]);
            const dexABNBc = resp[1];
            console.log(`returned amount from DEX(in aBNBc): ${dexABNBc.toString()}`);
            // get returned amount from BinancePool
            // poolABNBcAmount = amount - relayerFee - amount*(1-ratio);
            // update relayer fee to make some profit from DEX
            await pool.changeRelayerFee(toBN(1e19).sub(toBN(9e17)));

            const ratio = await abnbb.ratio();
            const relayerFee = await pool.getRelayerFee();
            const poolABNBc = amount_1.sub(relayerFee).sub(amount_1.mul(toBN(1e18).sub(ratio).div(toBN(1e18))));
            console.log(`returned amount from BinancePool(in aBNBc): ${poolABNBc.toString()}`);
            console.log(`dexABNBc > poolABNBc: ${dexABNBc.cmp(poolABNBc).toString()}`);
            profit = dexABNBc.sub(poolABNBc).toString();
            console.log(`profit: ${profit}`);

            const tx = await ce_router.deposit({ from: staker_1, value: amount_1.toString() });
            deposited_amount = deposited_amount.add(tx.logs['0'].args.amount);
            console.log(`deposited: ${tx.logs['0'].args.amount.toString()}`);
        });
        xit('verify balances after deposit in BNB and tokens supplies', async () => {
            const bnb_balance = await web3.eth.getBalance(staker_1);
            console.log(`BNB balance(staker_1): ${bnb_balance.toString()}`);
            // hBNB
            console.log(`hBNB balance(staker_1): ${(await hbnb.balanceOf(staker_1)).toString()}`);
            assert.equal(
                (await hbnb.balanceOf(staker_1)).toString(),
                deposited_amount.toString(),
                'balance of staker_1 in hBNB is wrong'
            );
            // aBNBc
            console.log(`aBNBc balance(staker_1): ${(await abnbc.balanceOf(staker_1)).toString()}`);
            assert.equal(
                (await abnbc.balanceOf(staker_1)).toString(),
                amount_2.mul(toBN(2)).toString(),
                'balance of staker_1 in aBNBc is wrong');

            console.log(`balance of ce_token: ${(await ce_token.balanceOf(staker_1)).toString()}`);
            assert.equal(
                (await ce_token.balanceOf(staker_1)).toString(), '0',
                'balance of staker_1 in ce_token is wrong'
            );
            // get available yield
            console.log(`available yield: ${(await ce_vault.getYieldFor(staker_1)).toString()}`);
            // get available yield
            console.log(`available yield: ${(await ce_router.getYieldFor(staker_1)).toString()}`)
            console.log(`principal: ${(await ce_router.getYieldFor(join_address)).toString()}`)
            console.log(`principal yield: ${(await ce_vault.getYieldFor(join_address)).toString()}`)
            //
            assert.equal(
                (await ce_router.getYieldFor(staker_1)).toString(), profit,
                'yield for staker_1 does not equal profit'
            );
            // verify supplies
            // In the real case it is not true, but in test cases they should be equal
            assert.equal(
                (await ce_token.totalSupply()).toString(),
                (await hbnb.totalSupply()).toString(),
                'supplies of ce_token and hBNB should be equal'
            );
        });
        it('deposit aBNBc: without approve and then with approve', async () => {
            await expectRevert(
                ce_router.depositABNBc(amount_1.toString(), { from: staker_1 }),
                'ERC20: insufficient allowance',
            );
            await abnbc.approve(ce_router.address, amount_2.toString(), { from: staker_1 });
            await ce_router.depositABNBc(amount_1.toString(), { from: staker_1 });
        });
        xit('verify balances after deposit in BNB and tokens supplies', async () => {
            bnb_balance = await web3.eth.getBalance(staker_1);
            console.log(`BNB balance(staker_1): ${bnb_balance.toString()}`);
            // hBNB
            console.log(`hBNB balance(staker_1): ${(await hbnb.balanceOf(staker_1)).toString()}`);
            assert.equal(
                (await hbnb.balanceOf(staker_1)).toString(),
                deposited_amount.add(amount_1).toString(),
                'balance of staker_1 in hBNB is wrong'
            );
            // aBNBc
            console.log(`aBNBc balance(staker_1): ${(await abnbc.balanceOf(staker_1)).toString()}`);
            assert.equal(
                (await abnbc.balanceOf(staker_1)).toString(),
                amount_2.mul(toBN(2)).sub(amount_1).toString(),
                'balance of staker_1 in aBNBc is wrong');
            // cetoken
            console.log(`balance of ce_token: ${(await ce_token.balanceOf(staker_1)).toString()}`);
            assert.equal(
                (await ce_token.balanceOf(staker_1)).toString(), '0',
                'balance of staker_1 in ce_token is wrong'
            );
            // verify supplies
            assert.equal(
                (await ce_token.totalSupply()).toString(),
                (await hbnb.totalSupply()).toString(),
                'supplies of ce_token and hBNB should be equal'
            );
        });
    });
    xdescribe('Claim', async () => {
        let claimed;
        before(async function () {
            return initWithDexes(accounts);
        });
        it('deposit with some profit from DEX', async () => {
            const resp = await dex.getAmountsOut(amount_1.toString(), [wbnb.address, abnbc.address]);
            const dexABNBc = resp[1];
            console.log(`returned amount from DEX(in aBNBc): ${dexABNBc.toString()}`);
            // get returned amount from BinancePool
            // poolABNBcAmount = amount - relayerFee - amount*(1-ratio);
            // update relayer fee to make some profit from DEX
            await pool.changeRelayerFee(toBN(1e19).sub(toBN(9e17)));

            const ratio = await abnbb.ratio();
            const relayerFee = await pool.getRelayerFee();
            const poolABNBc = amount_1.sub(relayerFee).sub(amount_1.mul(toBN(1e18).sub(ratio).div(toBN(1e18))));
            console.log(`returned amount from BinancePool(in aBNBc): ${poolABNBc.toString()}`);
            console.log(`dexABNBc > poolABNBc: ${dexABNBc.cmp(poolABNBc).toString()}`);
            profit = dexABNBc.sub(poolABNBc).toString();
            console.log(`profit: ${profit}`);

            const tx = await ce_router.deposit({ from: staker_1, value: amount_1.toString() });
            deposited_amount = tx.logs['0'].args.amount;
            console.log(`deposited: ${deposited_amount.toString()}`);
        });
        it('verify balances and tokens supplies after deposit in BNB', async () => {
            bnb_balance = await web3.eth.getBalance(staker_1);
            console.log(`BNB balance(staker_1): ${bnb_balance.toString()}`);
            // hBNB
            assert.equal(
                (await hbnb.balanceOf(staker_1)).toString(),
                deposited_amount.toString(),
                'balance of staker_1 in hBNB is wrong'
            );
            // aBNBc
            assert.equal(
                (await abnbc.balanceOf(staker_1)).toString(),
                amount_2.mul(toBN(2)).toString(),
                'balance of staker_1 in aBNBc is wrong'
            );
            // yield
            assert.equal(
                (await ce_router.getYieldFor(staker_1)).toString(), profit,
                'yield for staker_1 is wrong'
            );
            // ceToken
            assert.equal(
                (await ce_token.balanceOf(staker_1)).toString(), '0',
                'balance of staker_1 in ce_token is wrong'
            );
            // verify supplies
            assert.equal(
                (await ce_token.totalSupply()).toString(),
                (await hbnb.totalSupply()).toString(),
                'supplies of ceToken and hBNB should be equal'
            );
        });
        it('claim yields in aBNBc for user', async () => {
            // change ratio to increase yield
            await abnbb.repairRatio(ratio_2.toString());

            const tx = await ce_router.claimYield(staker_1, { from: staker_1 });
            assert.equal(tx.receipt.status, true, "tx is failed");
            claimed = tx.logs['0'].args.amount;
        });
        it('verify balances,tokens supplies, yield after claim in aBNBc ', async () => {
            bnb_balance = await web3.eth.getBalance(staker_1);
            console.log(`BNB balance(staker_1): ${bnb_balance.toString()}`);
            // hBNB
            assert.equal(
                (await hbnb.balanceOf(staker_1)).toString(),
                deposited_amount.toString(),
                'balance of staker_1 in hBNB is wrong'
            );
            // aBNBc
            assert.equal(
                (await abnbc.balanceOf(staker_1)).toString(),
                amount_2.mul(toBN(2)).add(claimed).toString(),
                'balance of staker_1 in aBNBc is wrong'
            );
            // ceToken
            assert.equal(
                (await ce_token.balanceOf(staker_1)).toString(), '0',
                'balance of staker_1 in ceToken is wrong'
            );
            // yield
            assert.equal(
                (await ce_router.getYieldFor(staker_1)).toString(), '0',
                'yield for staker_1 is wrong'
            );
            // verify supplies
            assert.equal(
                (await ce_token.totalSupply()).toString(),
                (await hbnb.totalSupply()).toString(),
                'supplies of ceToken and hBNB should be equal'
            );
        });
    });
    describe('Updating functionality', async () => {
        let test_address = '0xF92Ff9DBda8B780a9C7BC2d2b37db9D74D1BAcd6';
        before(async function () {
            return initWithDexes(accounts);
        });
        it('change vault', async () => {
            expectEvent(await ce_router.changeVault(test_address),
                'ChangeVault', {
                    vault: test_address
                });
            await expectRevert(
                ce_router.changeVault(test_address, { from: staker_2 }),
                'Ownable: caller is not the owner',
            );
        });
        it('change dex', async () => {
            expectEvent(await ce_router.changeDex(test_address),
                'ChangeDex', {
                    dex: test_address
                });
            await expectRevert(
                ce_router.changeDex(test_address, { from: staker_2 }),
                'Ownable: caller is not the owner',
            );
        });
        it('change pool', async () => {
            expectEvent(await ce_router.changePool(test_address),
                'ChangePool', {
                    pool: test_address
                });
            await expectRevert(
                ce_router.changePool(test_address, { from: staker_2 }),
                'Ownable: caller is not the owner',
            );
        });
    });
});