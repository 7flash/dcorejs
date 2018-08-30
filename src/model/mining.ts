/**
 * @module Model/Mining
 */
export class MinerUpdateData {
    newUrl?: string = null;
    newSigningKey?: string = null;
}

export enum MiningError {
    transaction_broadcast_failed = 'transaction_broadcast_failed',
    database_fetch_failed = 'database_fetch_failed',
    connection_failed = 'connection_failed',
    miner_does_not_exist = 'miner_does_not_exist',
    account_fetch_failed = 'account_fetch_failed',
    duplicate_settings = 'duplicate_settings',
    syntactic_error = 'syntactic_error',
    invalid_arguments = 'invalid_arguments',
}

export type MinerNameIdPair = [string, string];
