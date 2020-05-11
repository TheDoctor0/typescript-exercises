import { readFileSync } from 'fs';

type Scalar = boolean | number | string;

export type FieldOperator = 
    | {$eq: Scalar} 
    | {$gt: Scalar} 
    | {$lt: Scalar} 
    | {$in: Scalar[]};

export type Query<T extends object> = 
    | {$and: Query<T>[]} 
    | {$or: Query<T>[]} 
    | {$text: string}
    | ({[field in QueryableKeys<T>] ?: FieldOperator});

function matchOperator(operator: FieldOperator, value: Scalar) {
    if ('$eq' in operator) {
        return value === operator['$eq'];
    } else if ('$gt' in operator) {
        return value > operator['$gt'];
    } else if ('$lt' in operator) {
        return value < operator['$lt'];
    } else if ('$in' in operator) {
        return operator['$in'].includes(value);
    }

    throw new Error(`Unrecognized op: ${operator}`);
}

type Unionize<T extends object> = {[k in keyof T]: {key: k, value: T[k]}}[keyof T];
type QueryableKeys<T extends object> = Extract<Unionize<T>, {value: Scalar}>['key'];
type IndexedRecord<T extends object> = T & {
    $index: {[word: string]: true};
    $deleted: boolean;
};

function matches<T extends object>(
    query: Query<T>,
    record: IndexedRecord<T>
): boolean {
    if ('$and' in query) {
        return query.$and!.every(subquery => matches(subquery, record));
    } else if ('$or' in query) {
        return query.$or!.some(subquery => matches(subquery, record));
    } else if ('$text' in query) {
        const words = query.$text!.toLowerCase().split(' ');

        return words.every(word => record.$index[word]);
    }

    return Object.entries(query).every(
        ([key, value]) => matchOperator(value as FieldOperator, record[key as keyof T] as any)
    );
}

export type Options<T> = {
    sort ?: {[k in keyof T] ?: -1 | 1};
    projection ?: {[k in keyof T] ?: 1}
};

function typedItems<T extends object>(obj: T): [keyof T, T[keyof T]][] {
    return Object.entries(obj) as any;
}

function project<T extends object, K extends keyof T>(obj: T, params: {[k in K]?: 1}): {[k in K]: T[k]} {
    let out: Partial<T> = {};

    for (const k in params) {
        out[k] = obj[k];
    }

    return out as any;
}

function tuple<T extends unknown[]>(...args: T): T {
    return args;
}

export class Database<T extends object> {
    protected filename: string;
    protected fullTextSearchFieldNames: (keyof T)[];
    protected records: IndexedRecord<T>[];

    constructor(filename: string, fullTextSearchFieldNames: (keyof T)[]) {
        this.filename = filename;
        this.fullTextSearchFieldNames = fullTextSearchFieldNames;

        const text = readFileSync(filename, 'utf8');
        const lines = text.split('\n');

        this.records = lines
            .filter(line => line)
            .map(line => ({...JSON.parse(line.slice(1)), $deleted: line[0] === 'D'}))
            .map(obj => {
                obj.$index = this.indexRecord(obj);

                return obj;
            });
    }

    indexRecord(record: T): {[word: string]: true} {
        const index: {[word: string]: true} = {};

        for (const func of this.fullTextSearchFieldNames) {
            const text = record[func] as unknown as string;

            for (const word of text.split(' ')) {
                index[word.toLowerCase()] = true;
            }
        }

        return index;
    }

    findWithIndex(query: Query<T>): [number, T][] {
        return this.records
            .map((record, index) => tuple(index, record))
            .filter(([index, record]) => !record.$deleted)
            .filter(([index, record]) => matches(query, record));
    }

    async find(query: Query<T>, options?: Options<T>): Promise<Partial<T>[]> {
        let result = this.findWithIndex(query).map(([index, record]) => record);

        if (options) {
            const {sort, projection} = options;

            for (const [key, value] of typedItems(sort || {})) {
                result.sort((r1, r2) => r1[key] > r2[key] ? value : r1[key] === r2[key] ? 0 : -value);
            }

            if (projection) {
                return result.map(record => project(record, projection));
            }
        }

        return result;
    }

    async delete(query: Query<T>) {
        let deleted = this.findWithIndex(query).map(([index, record]) => index);

        for (const index of deleted) {
            this.records[index].$deleted = true;
        }
    }

    async insert(record: T) {
        this.records.push({
            ...record,
            $deleted: false,
            $index: this.indexRecord(record),
        });
    }
}