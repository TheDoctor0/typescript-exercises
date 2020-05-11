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

function matchOp(operator: FieldOperator, value: Scalar) {
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
type IndexedRecord<T extends object> = T & {$index: {[word: string]: true};};

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
        ([key, value]) => matchOp(value as FieldOperator, record[key as keyof T] as any)
    );
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
            .filter(line => line.startsWith('E'))
            .map(line => JSON.parse(line.slice(1)))
            .map(obj => {
                obj.$index = {};

                for (const func of fullTextSearchFieldNames) {
                    const text = obj[func];

                    for (const word of text.split(' ')) {
                        obj.$index[word.toLowerCase()] = true;
                    }
                }

                return obj;
            });
    }

    async find(query: Query<T>): Promise<T[]> {
        return this.records.filter(record => matches(query, record));
    }
}