import {
    Account,
    AccountError,
    AccountNameIdPair,
    Asset, HistoryRecord,
    MinerInfo,
    TransactionRecord,
    WalletExport,
    HistoryOptions, UpdateAccountParameters, Authority, Options
} from '../model/account';
import { DatabaseApi } from '../api/database';
import { ChainApi} from '../api/chain';
import { CryptoUtils } from '../crypt';
import { TransactionBuilder } from '../transactionBuilder';
import { KeyPrivate, KeyPublic, Utils } from '../utils';
import { HistoryApi, HistoryOperations } from '../api/history';
import { ApiConnector } from '../api/apiConnector';
import { DatabaseError, DatabaseOperations, MinerOrder, SearchAccountHistoryOrder } from '../api/model/database';
import { Memo, Operation, Operations } from '../model/transaction';
import { ApiModule } from './ApiModule';
import { DCoreAssetObject } from '../model/asset';
import {ChainMethods} from '../api/model/chain';

export enum AccountOrder {
    nameAsc = '+name',
    idAsc = '+id',
    nameDesc = '-name',
    idDesc = '-id',
    none = ''
}

/**
 * AccountModule is class that provides methods to obtain information from DCore node's Account module API.
 */
export class AccountModule extends ApiModule {
    constructor(dbApi: DatabaseApi, chainApi: ChainApi, historyApi: HistoryApi, apiConnector: ApiConnector) {
        super({
            dbApi,
            apiConnector,
            historyApi,
            chainApi
        });
    }

    /**
     * Gets account from DCore blockchain database for given account name.
     * https://docs.decent.ch/developer/classgraphene_1_1app_1_1database__api__impl.html#ac5c1fd29358dcde88ec644292de59304
     *
     * @param {string} name         Account name. Example: "u123456789abcdef123456789"
     * @return {Promise<Account>}   Account object.
     */
    public getAccountByName(name: string): Promise<Account> {
        const dbOperation = new DatabaseOperations.GetAccountByName(name);
        return new Promise((resolve, reject) => {
            this.dbApi.execute(dbOperation)
                .then((account: Account) => {
                    resolve(account as Account);
                })
                .catch(err => {
                    reject(this.handleError(AccountError.account_fetch_failed, err));
                });
        });
    }

    /**
     * Gets account from DCore blockchain database for given account id.
     * https://docs.decent.ch/developer/classgraphene_1_1app_1_1database__api__impl.html#aa20a30ec92c339c1b186c4ee7825f67b
     *
     * @param {string} id           Account id in format '1.2.X'. Example: "1.2.345"
     * @return {Promise<Account>}   Account object.
     */
    public getAccountById(id: string): Promise<Account> {
        const dbOperation = new DatabaseOperations.GetAccounts([id]);
        return new Promise((resolve, reject) => {
            this.dbApi.execute(dbOperation)
                .then((accounts: Account[]) => {
                    if (accounts.length === 0) {
                        reject(
                            this.handleError(AccountError.account_does_not_exist, `${id}`)
                        );
                    }
                    const [account] = accounts;
                    resolve(account as Account);
                })
                .catch(err => {
                    reject(this.handleError(AccountError.account_fetch_failed, err));
                });
        });
    }

    /**
     * Gets history of transfer transaction for given account name.
     * https://docs.decent.ch/developer/classgraphene_1_1app_1_1database__api__impl.html#a180dc12024aa0e60bcbdf781611680fc
     *
     * @deprecated This method will be removed in future DCore update. Use getAccountHistory or searchAccountHistory instead
     *
     * @param {string} accountId                Account id in format '1.2.X'. Example: "1.2.345"
     * @param {string} order                    Order of TransactionRecords in result. Default is .timeDesc.
     * @param {string[]} privateKeys            Array of private keys in case private/public pair has been changed in blockchain account,
     *                                          using for example cli_wallet, to be able of decrypt older memo messages from transactions.
     * @param {string} startObjectId            Id of TransactionRecord to start search from for paging purposes. Default 0.0.0
     * @param {number} resultLimit              Number of transaction history records in result. Use for paging. Default 100(max)
     * @return {Promise<TransactionRecord[]>}   List of TransactionRecord.List of TransactionRecord.
     */
    public getTransactionHistory(accountId: string,
        privateKeys: string[],
        order: SearchAccountHistoryOrder = SearchAccountHistoryOrder.timeDesc,
        startObjectId: string = '0.0.0',
        resultLimit: number = 100): Promise<TransactionRecord[]> {
        return new Promise((resolve, reject) => {
            this.searchAccountHistory(accountId, privateKeys, order, startObjectId, resultLimit)
                .then((transactions: any[]) => {
                    resolve(transactions);
                })
                .catch(err => {
                    reject(
                        this.handleError(AccountError.transaction_history_fetch_failed, err)
                    );
                });
        });
    }

    /**
     * Returns transfer operations for given account.
     * https://docs.decent.ch/developer/classgraphene_1_1app_1_1database__api__impl.html#a180dc12024aa0e60bcbdf781611680fc
     *
     * @param {string} accountId                Account id in format '1.2.X'. Example: "1.2.345"
     * @param {string[]} privateKeys            Array of private keys in case private/public pair has been changed in blockchain account,
     *                                          using for example cli_wallet, to be able of decrypt older memo messages from transactions.
     * @param {string} order                    Order of TransactionRecords in result. Default is .timeDesc.
     * @param {string} startObjectId            Id of TransactionRecord to start search from for paging purposes. Default 0.0.0
     * @param {number} resultLimit              Number of transaction history records in result. Use for paging. Default 100(max)
     * @param {boolean} convertAssets           Optional parameter to convert amounts and fees of TransactionRecords from blockchain asset
     *                                          amount format to right precision format of asset. Example: 100000000 => 1 DCT.
     *                                          Default: false.
     * @returns {Promise<TransactionRecord[]>}  List of TransactionRecord.
     */
    public searchAccountHistory(accountId: string,
                                privateKeys: string[],
                                order: SearchAccountHistoryOrder = SearchAccountHistoryOrder.timeDesc,
                                startObjectId: string = '0.0.0',
                                resultLimit: number = 100,
                                convertAssets: boolean = false): Promise<TransactionRecord[]> {
        return new Promise<TransactionRecord[]>((resolve, reject) => {
            const dbOperation = new DatabaseOperations.SearchAccountHistory(
                accountId,
                order,
                startObjectId,
                resultLimit
            );
            this.dbApi.execute(dbOperation)
                .then((transactions: any[]) => {
                    const listAssetsOp = new DatabaseOperations.ListAssets('', 100);
                    this.dbApi.execute(listAssetsOp)
                        .then((assets: DCoreAssetObject[]) => {
                            const namePromises: Promise<string>[] = [];
                            const res = transactions.map((tr: any) => {
                                const transaction = new TransactionRecord(tr, privateKeys);

                                namePromises.push(new Promise((resolve, reject) => {
                                    this.getAccountById(transaction.fromAccountId)
                                        .then(account => {
                                            transaction.fromAccountName = account.name;
                                            resolve();
                                        })
                                        .catch(err => reject(this.handleError(AccountError.account_fetch_failed, err)));
                                }));

                                namePromises.push(new Promise((resolve, reject) => {
                                    this.getAccountById(transaction.toAccountId)
                                        .then(account => {
                                            transaction.toAccountName = account.name;
                                            resolve();
                                        })
                                        .catch(err => reject(this.handleError(AccountError.account_fetch_failed, err)));
                                }));

                                if (convertAssets) {
                                    const asset = assets.find(a => a.id === transaction.transactionAsset);
                                    const feeAsset = assets.find(a => a.id === transaction.transactionFeeAsset);
                                    transaction.transactionAmount = Utils.formatAmountForAsset(transaction.transactionAmount, asset);
                                    transaction.transactionFee = Utils.formatAmountForAsset(transaction.transactionFee, feeAsset);
                                }
                                return transaction;
                            });
                            Promise.all(namePromises)
                                .then(() => {
                                    resolve(res);
                                })
                                .catch(err => reject(this.handleError(AccountError.account_fetch_failed, err)));
                        });
                })
                .catch(err => {
                    reject(
                        this.handleError(AccountError.transaction_history_fetch_failed, err)
                    );
                });
        });
    }

    /**
     * Transfers amount of asset between accounts.
     * https://docs.decent.ch/developer/group___wallet_a_p_i___account.html#gae61c0c78134741c534967260c8ff8a71
     *
     * @param {number} amount           Amount of asset to be send to receiver.
     * @param {string} assetId          Id of asset that amount will be send in. If empty, default 1.3.0 - DCT is selected
     * @param {string} fromAccount      Name or id of sender account
     * @param {string} toAccount        Name or id of receiver account
     * @param {string} memo             Message for recipient
     * @param {string} privateKey       Private key used to encrypt memo and sign transaction
     * @return {Promise<Operation>}     Value confirming successful transaction broadcasting.
     */
    public transfer(amount: number,
        assetId: string,
        fromAccount: string,
        toAccount: string,
        memo: string,
        privateKey: string): Promise<Operation> {
        const pKey = Utils.privateKeyFromWif(privateKey);

        return new Promise((resolve, reject) => {
            if (memo && !privateKey) {
                reject(AccountError.transfer_missing_pkey);
            }
            const methods = [].concat(
                new ChainMethods.GetAccount(fromAccount),
                new ChainMethods.GetAccount(toAccount),
                new ChainMethods.GetAsset(assetId || '1.3.0')
            );

            this.chainApi.fetch(...methods)
                .then(result => {
                    const [senderAccount, receiverAccount, asset] = result;
                    if (!senderAccount) {
                        reject(
                            this.handleError(
                                AccountError.transfer_sender_account_not_found,
                                `${fromAccount}`
                            )
                        );
                    }
                    if (!receiverAccount) {
                        reject(
                            this.handleError(
                                AccountError.transfer_receiver_account_not_found,
                                `${toAccount}`
                            )
                        );
                    }

                    const nonce: string = ChainApi.generateNonce();
                    const fromPublicKey = senderAccount.get('options').get('memo_key');
                    const toPublicKey = receiverAccount.get('options').get('memo_key');

                    const pubKey = Utils.publicKeyFromString(toPublicKey);

                    const memo_object: Memo = {
                        from: fromPublicKey,
                        to: toPublicKey,
                        nonce: nonce,
                        message: CryptoUtils.encryptWithChecksum(
                            memo,
                            pKey,
                            pubKey,
                            nonce
                        )
                    };

                    const assetObject = JSON.parse(JSON.stringify(asset));
                    const transaction = new TransactionBuilder();
                    const transferOperation = new Operations.TransferOperation(
                        senderAccount.get('id'),
                        receiverAccount.get('id'),
                        Asset.create(amount, assetObject),
                        memo_object
                    );
                    transaction.addOperation(transferOperation);
                    transaction.broadcast(privateKey)
                        .then(() => {
                            resolve(transaction.operations[0]);
                        })
                        .catch(err => {
                            reject(
                                this.handleError(AccountError.transaction_broadcast_failed, err)
                            );
                        });
                })
                .catch(err => reject(this.handleError(AccountError.account_fetch_failed, err)));
        });
    }

    /**
     * Current account balance of asset on given account
     * https://docs.decent.ch/developer/classgraphene_1_1app_1_1database__api__impl.html#a52515490f739d3523c9d842e2e2362ef
     *
     * @param {string} accountId        Account id in format '1.2.X'. Example: '1.2.345'
     * @param {string} assetId          Id of asset in which balance will be listed
     * @param {boolean} convertAsset    Optional parameter to convert balance amount from blockchain asset
                                        amount format to right precision format of asset. Example: 100000000 => 1 DCT.
     *                                  Default: false.
     * @return {Promise<number>}        Account's balance
     */
    public getBalance(accountId: string, assetId: string = '1.3.0', convertAsset: boolean = false): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!accountId) {
                reject('missing_parameter');
                return;
            }
            const getAssetOp = new DatabaseOperations.GetAssets([assetId || '1.3.0']);
            this.dbApi.execute(getAssetOp)
                .then((assets: DCoreAssetObject[]) => {
                    if (!assets || assets.length === 0) {
                        reject(this.handleError(DatabaseError.asset_fetch_failed));
                        return;
                    }
                    const asset = assets[0];
                    const dbOperation = new DatabaseOperations.GetAccountBalances(accountId, [asset.id]);
                    this.dbApi.execute(dbOperation)
                        .then(balances => {
                            if (!balances || !balances[0]) {
                                reject(this.handleError(AccountError.asset_does_not_exist));
                                return;
                            }
                            const [balance] = balances;
                            resolve(convertAsset ? Utils.formatAmountForAsset(balance.amount, asset) : balance.amount);
                        })
                        .catch(err => {
                            reject(this.handleError(AccountError.database_operation_failed, err));
                        });
                })
                .catch(err => this.handleError(DatabaseError.database_execution_failed, err));
        });
    }

    /**
     * Verifies if block in that transaction was processed to is irreversible.
     * NOTE: Unverified blocks still can be reversed.
     *
     * NOTICE:
     * Transaction object with id in form '1.7.X' can be fetched from AccountModule.getAccountHistory method.
     *
     * @param {string} accountId        Account id in format '1.2.X'. Example: '1.2.30'
     * @param {string} transactionId    Transaction id in format '1.7.X'.
     * @return {Promise<boolean>}       Returns 'true' if transaction is in irreversible block, 'false' otherwise.
     */
    public isTransactionConfirmed(accountId: string, transactionId: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            let start = transactionId;
            if (transactionId !== '1.7.0') {
                const trNumSplit = transactionId.split('.');
                trNumSplit[2] = `${Number(trNumSplit[2]) - 1}`;
                start = trNumSplit.join('.');
            } else {
                reject(this.handleError(AccountError.bad_parameter, ''));
            }

            const operation = new HistoryOperations.GetAccountHistory(
                accountId,
                start,
                transactionId
            );
            this.historyApi.execute(operation)
                .then(res => {
                    if (res.length === 0) {
                        reject(this.handleError(AccountError.transaction_history_fetch_failed, ''));
                    }
                    const dbOp = new DatabaseOperations.GetDynamicGlobalProperties();
                    this.dbApi.execute(dbOp)
                        .then(props => {
                            resolve(res[0].block_num <= props.last_irreversible_block_num);
                        })
                        .catch(err => reject(this.handleError(AccountError.database_operation_failed, err)));
                })
                .catch(err => reject(this.handleError(AccountError.history_fetch_failed, err)));
        });
    }

    /**
     * List of all transaction operations in history of user.
     * NOTE: Operations can be filtered using Chain.ChainOperationType
     * https://docs.decent.ch/developer/group___history_a_p_i.html#ga2bfce814ce4adde1c30e63662f3fa18c
     *
     * @param {string} accountId                Account id in format '1.2.X'. Example: '1.2.345'
     * @param historyOptions                    Optional HistoryOptions object to configure fromId and resultLimit for paging.
     *                                          fromId: Id of HistoryRecord from what to start list from. Default: '1.7.0'
     *                                          resultLimit: Number of HistoryRecords in result. Default: 100(Max)
     *                                          NOTE: List is in DESC order. Therefore fromId of operation suppose to be last in received
     *                                          list.
     * @return {Promise<HistoryRecord[]>}       List of HistoryRecord objects.
     */
    public getAccountHistory(accountId: string, historyOptions?: HistoryOptions): Promise<HistoryRecord[]> {
        return new Promise((resolve, reject) => {
            const operation = new HistoryOperations.GetAccountHistory(
                accountId,
                '1.7.0',
                historyOptions && historyOptions.fromId || '1.7.0',
                historyOptions && historyOptions.resultLimit || 100
            );
            this.historyApi.execute(operation)
                .then(res => {
                    // TODO: create models for different operations names, placed in dcore/src/chain/src/ChainTypes.js
                    resolve(res);
                })
                .catch(err => reject(this.handleError(AccountError.transaction_history_fetch_failed, err)));
        });
    }

    /**
     * Search accounts based on given search parameters.
     * https://docs.decent.ch/developer/classgraphene_1_1app_1_1database__api__impl.html#a57cbf9b3e799ea70b08885cc5df9b043
     *
     * @param {string} searchTerm   Term to search in account names. Default: ''
     * @param {string} order        AccountOrder to order results. Default: AccountOrder.none
     * @param {string} id           Account id to start list from. Default: '0.0.0'
     * @param {number} limit        Limit result list size. Default: 100(Max)
     * @returns {Promise<Account>}  List of filtered accounts.
     */
    public searchAccounts(searchTerm: string = '',
                          order: AccountOrder = AccountOrder.none,
                          id: string = '0.0.0',
                          limit: number = 100): Promise<Account> {
        return new Promise<Account>((resolve, reject) => {
            const operation = new DatabaseOperations.SearchAccounts(searchTerm, order, id, limit);
            this.dbApi.execute(operation)
                .then(res => resolve(res))
                .catch(err => reject(err));
        });
    }

    /**
     * Returns number of accounts created on network
     * https://docs.decent.ch/developer/classgraphene_1_1app_1_1database__api__impl.html#a533c834442d9e8fbaeae5eb24d4fe8c5
     *
     * @returns {Promise<number>}   Number of accounts.
     */
    public getAccountCount(): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            const operation = new DatabaseOperations.GetAccountCount();
            this.dbApi.execute(operation)
                .then(res => resolve(res))
                .catch(err => reject(err));
        });
    }

    /**
     * Creates new account in DCore blockchain network.
     * https://docs.decent.ch/developer/classgraphene_1_1wallet_1_1detail_1_1wallet__api__impl.html#aed56e5dfd4dc85b40d62dd25cb1fd029
     *
     * @param {string} name                 Name of newly created account.
     * @param {string} ownerKey             Public key to be used as owner key in WIF(hex)(Wallet Import Format) format.
     * @param {string} activeKey            Public key to be used as active key in WIF(hex)(Wallet Import Format) format.
     * @param {string} memoKey              Public key used to memo encryption in WIF(hex)(Wallet Import Format) format.
     * @param {string} registrar            Registrar account id who pay account creation transaction fee.
     * @param {string} regisrarPrivateKey   Registrar private key, in WIF(hex)(Wallet Import Format) format, for account register
     *                                      transaction to be signed with.
     * @returns {Promise<boolean>}          Value confirming successful transaction broadcasting.
     */
    public registerAccount(name: string,
        ownerKey: string,
        activeKey: string,
        memoKey: string,
        registrar: string,
        regisrarPrivateKey: string): Promise<boolean> {
        const ownerKeyAuths: [[string, number]] = [] as [[string, number]];
        ownerKeyAuths.push([ownerKey, 1]);
        const activeKeyAuths: [[string, number]] = [] as [[string, number]];
        activeKeyAuths.push([activeKey, 1]);
        const owner = {
            weight_threshold: 1,
            account_auths: [],
            key_auths: ownerKeyAuths
        };
        const active = {
            weight_threshold: 1,
            account_auths: [],
            key_auths: activeKeyAuths
        };
        return new Promise<boolean>((resolve, reject) => {
            this.apiConnector.connect()
                .then(() => {
                    const operation = new Operations.RegisterAccount({
                        name,
                        owner,
                        active,
                        registrar,
                        options: {
                            memo_key: memoKey,
                            voting_account: '1.2.3',
                            allow_subscription: false,
                            price_per_subscribe: Asset.createDCTAsset(0),
                            num_miner: 0,
                            votes: [],
                            extensions: [],
                            subscription_period: 0,
                        }
                    });

                    const transaction = new TransactionBuilder();
                    transaction.addOperation(operation);
                    transaction.broadcast(regisrarPrivateKey)
                        .then(() => resolve(true))
                        .catch(err => reject(err));
                })
                .catch(err => console.log(err));
        });
    }

    /**
     * Create account in DCore blockchain network with keys derived from provided brain key.
     * https://docs.decent.ch/developer/classgraphene_1_1wallet_1_1detail_1_1wallet__api__impl.html#a758d05a5f090adbc249258881775d222
     *
     * NOTE: This method create account with owner, active and memo key set to same value.
     *       Recommended to use Utils.derivePrivateKey to derive keys from brainkey and then register account
     *       with option to set these keys to different values.
     *
     * @param {string} brainkey             Brain key for keys derivation. Use brain key from Utils.suggestBrainKey.
     * @param {string} accountName          Name for new account. String with alphanumerical symbols and dash. Example: 'new-account2'
     * @param {string} registrar            Registrar account id, who pay for account registration in format '1.2.X'. Example: '1.2.345'
     * @param {string} registrarPrivateKey  Registrar private key in WIF(hex)(Wallet Import Format) format.
     * @returns {Promise<boolean>}          Value confirming successful transaction broadcasting.
     */
    public createAccountWithBrainkey(brainkey: string,
        accountName: string,
        registrar: string,
        registrarPrivateKey: string): Promise<boolean> {
        const normalizedBrainkey = Utils.normalize(brainkey);
        const keyPair: [KeyPrivate, KeyPublic] = Utils.generateKeys(normalizedBrainkey);
        return this.registerAccount(
            accountName,
            keyPair[1].stringKey,
            keyPair[1].stringKey,
            keyPair[1].stringKey,
            registrar,
            registrarPrivateKey);
    }

    /**
     * Exports wallet-cli compatible wallet file.
     * https://docs.decent.ch/developer/classgraphene_1_1wallet_1_1detail_1_1wallet__api__impl.html#a3cb922b2d88865c509a8e2c91b7416ab
     *
     * @param {string} accountId            Account id that about to be exported, in format '1.2.X'. Example: '1.2.345'
     * @param {string} password             Password for keys structure encryption.
     * @param privateKeys                   Private keys, in WIF(hex)(Wallet Import Format) format, to be exported
     * @param additionalElGamalPrivateKeys  Additional el gamal keys, in case that has been changed over time. Primary el gamal key is
     *                                      calculated from privateKeys.
     * @returns {Promise<WalletExport>}     WalletExport object that can be serialized and used as import for cli_wallet.
     */
    exportWallet(accountId: string,
        password: string,
        privateKeys: string[],
        additionalElGamalPrivateKeys: string[] = []): Promise<WalletExport> {
        return new Promise((resolve, reject) => {
            this.getAccountById(accountId)
                .then((acc) => {
                    if (!acc) {
                        reject(this.handleError(AccountError.account_does_not_exist, ''));
                        return;
                    }
                    const elGamalKeys = privateKeys.map(pk => {
                        const elGPriv = Utils.elGamalPrivate(pk);
                        const elGPub = Utils.elGamalPublic(elGPriv);
                        return {
                            private: { s: elGPriv },
                            public: { s: elGPub }
                        };
                    });
                    elGamalKeys.push(...additionalElGamalPrivateKeys.map(elGPriv => {
                        const elGPub = Utils.elGamalPublic(elGPriv);
                        return {
                            private: { s: elGPriv },
                            public: { s: elGPub }
                        };
                    }));
                    const walletExport: WalletExport = {
                        version: 1,
                        chain_id: this.chainApi.chainId,
                        my_accounts: [acc],
                        cipher_keys: '',
                        extra_keys: [],
                        pending_account_registrations: [],
                        pending_miner_registrations: [],
                        ws_server: this.apiConnector.apiAddresses[0],
                        ws_user: '',
                        ws_password: '',
                    };
                    const keys = {
                        ec_keys: privateKeys.map(pk => {
                            const pubKey = Utils.getPublicKey(Utils.privateKeyFromWif(pk));
                            return [pubKey.stringKey, pk];
                        }),
                        el_gamal_keys: elGamalKeys,
                        checksum: CryptoUtils.sha512(password)
                    };
                    walletExport.cipher_keys = CryptoUtils.encryptToHexString(JSON.stringify(keys), password);
                    resolve(walletExport);
                })
                .catch(err => reject(this.handleError(AccountError.database_operation_failed, err)));
        });
    }

    /**
     * Fetch list of an accounts.
     * https://docs.decent.ch/developer/classgraphene_1_1app_1_1database__api__impl.html#abf203f3002c7e2053c33eb6cb4e147c6
     *
     * @param {string} loweBound                Account id from which accounts are listed, in format '1.2.X'. Default: ''
     * @param {number} limit                    Number of returned accounts. Default: 100(Max)
     * @returns {Promise<AccountNameIdPair>}    List of filtered AccountNameIdPairs.
     */
    public listAccounts(loweBound: string = '', limit: number = 100): Promise<AccountNameIdPair[]> {
        return new Promise<AccountNameIdPair[]>((resolve, reject) => {
            const operation = new DatabaseOperations.LookupAccounts(loweBound, limit);
            this.dbApi.execute(operation)
                .then(res => resolve(res))
                .catch(err => reject(this.handleError(AccountError.database_operation_failed, err)));
        });
    }

    /**
     * Returns account's balances in all assets account have non-zero amount in.
     * https://docs.decent.ch/developer/classgraphene_1_1app_1_1database__api__impl.html#a52515490f739d3523c9d842e2e2362ef
     *
     * @param {string} id               Account id in format '1.2.X', Example: '1.2.345'.
     * @param {boolean} convertAssets   Optional parameter to convert balance amount from blockchain asset
     *                                  amount format to right precision format of asset. Example: 100000000 => 1 DCT. Default: false.
     * @returns {Promise<Asset[]>}      List of balances
     */
    public listAccountBalances(id: string, convertAssets: boolean = false): Promise<Asset[]> {
        return new Promise<Asset[]>((resolve, reject) => {
            const operation = new DatabaseOperations.GetAccountBalances(id, []);
            this.dbApi.execute(operation)
                .then((balances: Asset[]) => {
                    if (balances.length === 0) {
                        resolve(balances);
                        return;
                    }
                    const listAssetsOp = new DatabaseOperations.GetAssets(balances.map(asset => asset.asset_id));
                    this.dbApi.execute(listAssetsOp)
                        .then((assets: DCoreAssetObject[]) => {
                            if (!assets || assets.length === 0) {
                                reject(this.handleError(AccountError.database_operation_failed));
                                return;
                            }
                            if (!convertAssets) {
                                resolve(balances);
                                return;
                            }
                            const result = [].concat(...balances);
                            result.forEach(bal => {
                                const asset = assets.find(a => a.id === bal.asset_id);
                                bal.amount = Utils.formatAmountForAsset(bal.amount, asset);
                            });
                            resolve(result);
                        })
                        .catch(err => reject(this.handleError(AccountError.database_operation_failed, err)));
                })
                .catch(err => reject(this.handleError(AccountError.database_operation_failed, err)));
        });
    }

    /**
     * Search for miners with parameters.
     * https://docs.decent.ch/developer/classgraphene_1_1wallet_1_1detail_1_1wallet__api__impl.html#a6bf2da2d8f11165c8990d3a849c2dd92
     *
     * @param {string} accountName          Account name to search miners for.
     * @param {string} keyword              Search keyword.
     * @param {boolean} myVotes             Flag to search within account's voted miners.
     * @param {MinerOrder} sort             Sorting parameter of search results.
     * @param {string} fromMinerId          Miner id to start form. Use for paging.
     * @param {number} limit                Result count. Default and max is 1000
     * @returns {Promise<MinerInfo[]>}      List of filtered MinerInfo objects.
     */
    public searchMinerVoting(accountName: string,
        keyword: string,
        myVotes: boolean = true,
        sort: MinerOrder = MinerOrder.none,
        fromMinerId: string = '',
        limit: number = 1000): Promise<MinerInfo[]> {
        return new Promise<MinerInfo[]>((resolve, reject) => {
            const operation = new DatabaseOperations.SearchMinerVoting(
                accountName,
                keyword,
                myVotes,
                sort,
                fromMinerId,
                limit);
            this.dbApi.execute(operation)
                .then(res => resolve(res))
                .catch(err => {
                    reject(this.handleError(DatabaseError.database_execution_failed, err));
                });
        });
    }

    /**
     * Update account properties.
     * https://docs.decent.ch/developer/structgraphene_1_1wallet_1_1wallet__data.html#a7e45dcef220b45e13f0918b1036cbf41
     *
     * @param {string} accountId                Account id of account that is about to be updated. Example: '1.2.345'.
     * @param {UpdateAccountParameters} params  UpdateAccountParameters object with parameters to be changed.
     * @param {string} privateKey               Private key of account that is about to be changed, to sign transaction.
     *                                          In WIF(hex)(Wallet Import Format) format.
     * @returns {Promise<Boolean>}              Value confirming successful transaction broadcasting.
     */
    public updateAccount(accountId: string, params: UpdateAccountParameters, privateKey: string): Promise<Boolean> {
        return new Promise<Boolean>(((resolve, reject) => {

            this.getAccountById(accountId)
                .then((account: Account) => {
                    if (account === null) {
                        reject(this.handleError(AccountError.account_does_not_exist));
                        return;
                    }
                    const ownerAuthority: Authority = Object.assign({}, account.owner);
                    ownerAuthority.key_auths[0][0] = params.newOwnerKey || account.owner.key_auths[0][0];

                    const activeAuthority: Authority = Object.assign({}, account.active);
                    activeAuthority.key_auths[0][0] = params.newActiveKey || account.active.key_auths[0][0];

                    let priceSubscription = Object.assign({}, account.options.price_per_subscribe);
                    if (params.newSubscription !== undefined) {
                        priceSubscription = Asset.createDCTAsset(params.newSubscription.pricePerSubscribeAmount);
                    }

                    const newOptions: Options = {
                        memo_key: params.newMemoKey || account.options.memo_key,
                        voting_account: account.options.voting_account,
                        num_miner: params.newNumMiner || account.options.num_miner,
                        votes: params.newVotes || account.options.votes,
                        extensions: account.options.extensions,
                        allow_subscription: params.newSubscription
                            ? params.newSubscription.allowSubscription
                            : account.options.allow_subscription,
                        price_per_subscribe: priceSubscription,
                        subscription_period: params.newSubscription
                            ? params.newSubscription.subscriptionPeriod
                            : account.options.subscription_period
                    };
                    const accountUpdateOperation = new Operations.AccountUpdateOperation(
                        accountId,
                        ownerAuthority,
                        activeAuthority,
                        newOptions,
                        {}
                    );

                    const transaction = new TransactionBuilder();
                    transaction.addOperation(accountUpdateOperation);
                    transaction.broadcast(privateKey)
                        .then(() => {
                            resolve(true);
                        })
                        .catch((error: any) => {
                            reject(this.handleError(AccountError.transaction_broadcast_failed, error));
                        });

                    })
                .catch((error) => {
                    reject(this.handleError(AccountError.account_update_failed, error));
                });

        }));
    }
}
