/**
 * @module Utils
 */
import {dcorejs_lib} from './helpers';
import {CryptoUtils} from './crypt';
import {ChainApi} from './api/chain';
import {dictionary} from './resources/dictionary';
import * as BigInteger from 'big-integer';
import {sha512} from 'js-sha512';
import {DCoreAssetObject} from './model/asset';
import {Validate} from './modules/validator';
import {Type} from './model/types';
import {BrainKeyInfo, ElGamalKeys, KeyPrivate, KeyPublic, UtilsError} from './model/utils';

export class Utils {

    /**
     * Format DCT price amount from blockchain format to real and readable formatted string.
     *
     * Example: Amount price from blockchain is 1, formatted price 0.00000001 DCT
     *
     * @param {number} dctAmount    Amount of DCT asset.
     * @return {string}             Formatted amount in string format.
     */
    @Validate(Type.number)
    public static formatToReadiblePrice(dctAmount: number): string {
        return (dctAmount / ChainApi.DCTPower).toFixed(8);
    }

    /**
     * Formats amount to DCT precision.
     * Value is devided by asset's precision factor
     * Note: Most of amount values are already formatted for this precision format.
     *
     * @param {number} amount   Amount to be formatted.
     * @returns {number}        DCore formatted amount.
     */
    @Validate(Type.number)
    public static formatAmountForDCTAsset(amount: number): number {
        return amount / ChainApi.DCTPower;
    }

    /**
     * Formats amount to format with decimal numbers.
     * Note: Most of amount values are already formatted for this precision format.
     *
     * @param {number} amount               Amount of asset in DCore network format.
     * @param {DCoreAssetObject} asset      Asset object to format amount to.
     * @returns {number}                    Formatted number in format with decimal numbers.
     */
    @Validate(Type.number, DCoreAssetObject)
    public static formatAmountForAsset(amount: number, asset: DCoreAssetObject): number {
        return amount / Math.pow(10, asset.precision);
    }

    /**
     * Format amount value for DCore, to format without decimal numbers.
     *
     * @param {number} amount           Amount with decimal numbers to format.
     * @param {DCoreAssetObject} asset  Asset object for formatting.
     * @returns {number}                Formatted number.
     */
    @Validate(Type.number, DCoreAssetObject)
    public static formatAmountToAsset(amount: number, asset: DCoreAssetObject): number {
        const transformedAmount = amount * Math.pow(10, asset.precision);
        return Number(transformedAmount.toFixed(0));
    }

    /**
     * RIPEMD 160 hash
     *
     * @param {Buffer} fromBuffer       Buffer to calculate hash from.
     * @returns {string}                RIPEMD160 hash.
     */
    @Validate(Type.string)
    public static ripemdHash(fromBuffer: string): string {
        return CryptoUtils.ripemdHash(fromBuffer);
    }

    /**
     * Generate private and public key from given brain key.
     *
     * @param {string} fromBrainKey                                     Brain key to generate keys from.
     * @return {any[]} [privateKey: KeyPrivate, publicKey: KeyPublic]   Keys.
     */
    @Validate(Type.string)
    public static generateKeys(fromBrainKey: string): [KeyPrivate, KeyPublic] {
        const normalizedBk = Utils.normalize(fromBrainKey);
        const pkey: KeyPrivate = KeyPrivate.fromBrainKey(normalizedBk);
        const pubKey: KeyPublic = KeyPublic.fromPrivateKey(pkey);
        return [pkey, pubKey];
    }

    /**
     * Calculate public key from given private key.
     *
     * @param {string} privateKey      Private key to get public key for.
     * @return {KeyPublic}              KeyPublic object.
     */
    @Validate(Type.string)
    public static getPublicKey(privateKey: string): KeyPublic {
        const pkey = KeyPrivate.fromWif(privateKey);
        return pkey.getPublicKey();
    }

    /**
     * Create KeyPrivate object from WIF format of private key.
     *
     * @param {string} pkWif    Private key in WIF(hex) (Wallet Import Format) format.
     * @return {KeyPrivate}     KeyPrivate object.
     */
    @Validate(Type.string)
    public static privateKeyFromWif(pkWif: string): KeyPrivate {
        try {
            return KeyPrivate.fromWif(pkWif);
        } catch (exception) {
            throw new Error(UtilsError.wrong_private_key);
        }
    }

    /**
     * Create KeyPublic object from string format of public key.
     *
     * @param {string} pubKeyString     Public key string.
     * @return {KeyPublic}              KeyPublic object.
     */
    @Validate(Type.string)
    public static publicKeyFromString(pubKeyString: string): KeyPublic {
        return KeyPublic.fromString(pubKeyString);
    }

    /**
     * Get random brain key.
     * https://docs.decent.ch/developer/group___wallet_a_p_i___account.html#ga4841362854805ef897b8415eb8866424
     *
     * @returns {string}    Brain key string.
     */
    public static suggestBrainKey(): string {
        return dcorejs_lib.key.suggest_brain_key(dictionary.en.join(','));
    }

    /**
     * Get brainkey info with brain key, private key and public key.
     * https://docs.decent.ch/developer/group___wallet_a_p_i___account.html#ga1cca4c087c272e07681b2c6d203b7d74
     *
     * @param {string} brainKey     Brain keys string.
     * @returns {BrainKeyInfo}      BrainKeyInfo object.
     */
    @Validate(Type.string)
    public static getBrainKeyInfo(brainKey: string): BrainKeyInfo {
        const normalizedBK = Utils.normalize(brainKey);
        const keys = Utils.generateKeys(normalizedBK);
        const result: BrainKeyInfo = {
            brain_priv_key: normalizedBK,
            pub_key: keys[1].stringKey,
            wif_priv_key: keys[0].stringKey
        };
        return result;
    }

    /**
     * Normalize brain key for further usage in Utils's methods
     *
     * @param {string} brainKey         Brain key generated from Utils.suggestBrainKey or from wallet CLI
     * @returns {string}                Normalized brain key
     */
    @Validate(Type.string)
    public static normalize(brainKey: string): string {
        if (typeof brainKey !== Type.string) {
            throw new Error('string required for brainKey');
        }
        brainKey = brainKey.trim();
        brainKey = brainKey.toUpperCase();
        return brainKey.split(/[\t\n\v\f\r ]+/).join(' ');
    }

    /**
     * Generate random
     * @returns {string}
     */
    public static generateNonce(): string {
        return dcorejs_lib.TransactionHelper.unique_nonce_uint64();
    }

    /**
     * Generates El Gamal public key from given El Gamal private key
     *
     * @param {string} elGamalPrivate   El Gamal private key string.
     * @returns {string}                ElGamal public key string.
     */
    @Validate(Type.string)
    public static elGamalPublic(elGamalPrivate: string): string {
        const elgPriv = BigInteger(elGamalPrivate);
        const modulus = BigInteger('11760620558671662461946567396662025495126946227619472274' +
            '601251081547302009186313201119191293557856181195016058359990840577430081932807832465057884143546419');
        const generator = BigInteger(3);
        return generator.modPow(elgPriv, modulus).toString();
    }

    /**
     * Generates El Gamal key for content exchange from given private key WIF string
     *
     * @param {string} privateKeyWif        WIF formatted private key of account for which generating El Gamal key
     * @returns {string}                    El Gamal private key string.
     */
    @Validate(Type.string)
    public static elGamalPrivate(privateKeyWif: string): string {
        try {
            const pKey = Utils.privateKeyFromWif(privateKeyWif);
            const hash = sha512(pKey.key.d.toBuffer());
            return BigInteger(hash, 16).toString();
        } catch (exception) {
            throw new Error(UtilsError.wrong_private_key);
        }
    }

    /**
     * Calculate El Gamal keys pair from WIF private key
     * @param {string} privateKeyWif    WIF formatted private key of account for which generating El Gamal keys
     * @returns {ElGamalKeys}           ElGamalKeys object.
     */
    @Validate(Type.string)
    public static generateElGamalKeys(privateKeyWif: string): ElGamalKeys {
        try {
            return ElGamalKeys.generate(privateKeyWif);
        } catch (exception) {
            throw new Error(UtilsError.wrong_private_key);
        }
    }

    /**
     * Generate random brain key and El Gamal keys from brain key.
     *
     * @returns {[BrainKeyInfo , ElGamalKeys]}
     */
    public static generateBrainKeyElGamalKey(): [BrainKeyInfo, ElGamalKeys] {
        const brainKey = Utils.suggestBrainKey();
        const bkInfo = Utils.getBrainKeyInfo(brainKey);
        const elGamalKeys = Utils.generateElGamalKeys(bkInfo.wif_priv_key);
        return [bkInfo, elGamalKeys];
    }

    /**
     * Calculate derived private key apart from primary(with sequence number 0).
     * NOTE: May be used as additional keys when creating account - owner, memo key
     *
     * @param {string} brainKey     Brain key string.
     * @param {number} sequence     Sequence number to derive private key from it. If selected 0, primary private key is generated.
     * @returns {KeyPrivate}        KeyPrivate object.
     */
    @Validate(Type.string, Type.number)
    public static derivePrivateKey(brainKey: string, sequence: number): KeyPrivate {
        return KeyPrivate.fromBrainKey(brainKey, sequence);
    }
}

