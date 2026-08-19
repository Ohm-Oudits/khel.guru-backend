import bip39 from "bip39";
import { HDNodeWallet } from "ethers";
import { Keypair } from "@solana/web3.js";
import { derivePath } from "ed25519-hd-key";

import Counter from "../models/counter.model.js";
import CryptoDepositAddress from "../models/cryptoDepositAddress.model.js";
import CryptoWalletProfile from "../models/cryptoWalletProfile.model.js";
import User from "../models/user.model.js";

const MAX_BIP32_INDEX = 2 ** 31 - 1;
const DERIVATION_COUNTER_ID = "cryptoDerivationIndex";

export const CRYPTO_CHAINS = ["eth", "sol"];

export const getActiveNetworks = () => {
  const networkEnv = (process.env.CRYPTO_NETWORK_ENV || "testnet").trim();

  if (networkEnv === "mainnet") {
    return { eth: "mainnet", sol: "mainnet" };
  }

  return { eth: "sepolia", sol: "devnet" };
};

// Watch-only: the account-level xpub can only produce public keys/addresses.
export const deriveEthAddress = (index, xpub = process.env.ETH_XPUB) => {
  if (!xpub) {
    throw new Error("ETH_XPUB is not configured");
  }

  const accountNode = HDNodeWallet.fromExtendedKey(xpub);
  return accountNode.derivePath(`0/${index}`).address;
};

// SLIP-0010 hardened derivation; the secret bytes stay function-local and are
// never persisted or logged. Sweeping is external tooling holding the mnemonic.
export const deriveSolAddress = (
  index,
  mnemonic = process.env.SOL_DERIVATION_MNEMONIC
) => {
  if (!mnemonic) {
    throw new Error("SOL_DERIVATION_MNEMONIC is not configured");
  }

  const seedHex = bip39.mnemonicToSeedSync(mnemonic).toString("hex");
  const { key } = derivePath(`m/44'/501'/${index}'/0'`, seedHex);
  return Keypair.fromSeed(key).publicKey.toBase58();
};

export const getOrCreateWalletProfile = async (userId) => {
  const existingProfile = await CryptoWalletProfile.findOne({ userId });
  if (existingProfile) {
    return existingProfile;
  }

  const user = await User.findById(userId).select("accountUid");
  if (!user) {
    throw new Error("User not found for crypto wallet profile");
  }

  if (!user.accountUid) {
    // Legacy users predate prompt 20; the backfill hook assigns on save.
    await user.save();
  }

  const counter = await Counter.findOneAndUpdate(
    { _id: DERIVATION_COUNTER_ID },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  if (counter.seq > MAX_BIP32_INDEX) {
    throw new Error("Crypto derivation index space exhausted");
  }

  try {
    return await CryptoWalletProfile.create({
      userId,
      accountUid: user.accountUid,
      derivationIndex: counter.seq,
    });
  } catch (error) {
    if (error?.code === 11000) {
      // Concurrent allocation for the same user: the winner's profile stands.
      const winner = await CryptoWalletProfile.findOne({ userId });
      if (winner) {
        return winner;
      }
    }
    throw error;
  }
};

const deriveAddressForChain = (chain, index) =>
  chain === "eth" ? deriveEthAddress(index) : deriveSolAddress(index);

export const serializeDepositAddress = (record) => ({
  id: record._id,
  chain: record.chain,
  network: record.network,
  address: record.address,
  status: record.status,
});

export const getOrCreateDepositAddresses = async (userId) => {
  const profile = await getOrCreateWalletProfile(userId);
  const activeNetworks = getActiveNetworks();

  const records = await Promise.all(
    CRYPTO_CHAINS.map((chain) => {
      const network = activeNetworks[chain];
      const address = deriveAddressForChain(chain, profile.derivationIndex);

      return CryptoDepositAddress.findOneAndUpdate(
        { userId, chain, network },
        {
          $setOnInsert: {
            userId,
            accountUid: profile.accountUid,
            chain,
            network,
            address,
            derivationIndex: profile.derivationIndex,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    })
  );

  return { profile, addresses: records };
};

// Re-evaluate a deposit's lifecycle. The deposit watcher (prompt 22) registers
// the credit routine here so admin rechecks can push confirmed rows through
// crediting without a circular import.
let creditRoutine = null;

export const registerCreditRoutine = (fn) => {
  creditRoutine = fn;
};

export const recheckDeposit = async (deposit) => {
  if (deposit.status === "confirmed" && creditRoutine) {
    await creditRoutine(deposit._id);
  }

  const reloaded = await deposit.constructor.findById(deposit._id);
  return reloaded || deposit;
};

export const assertCryptoBootSafety = () => {
  const networkEnv = (process.env.CRYPTO_NETWORK_ENV || "testnet").trim();

  if (networkEnv !== "mainnet") {
    return;
  }

  if (process.env.SOL_DERIVATION_MNEMONIC) {
    throw new Error(
      "Refusing mainnet boot: SOL_DERIVATION_MNEMONIC must move to a KMS-backed signer before real funds"
    );
  }

  if (process.env.CRYPTO_ALLOW_SIMULATED_DEPOSITS === "true") {
    throw new Error(
      "Refusing mainnet boot: CRYPTO_ALLOW_SIMULATED_DEPOSITS must be disabled"
    );
  }
};
