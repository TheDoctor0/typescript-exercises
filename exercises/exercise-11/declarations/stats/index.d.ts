declare module 'stats' {
    function GetIndex<T>(input: T[], comparator: (a: T, b: T) => number): number;
    function GetElement<T>(input: T[], comparator: (a: T, b: T) => number): T | null;

    export const getMaxIndex: typeof GetIndex;
    export const getMinIndex: typeof GetIndex;
    export const getMedianIndex: typeof GetIndex;
    export const getMaxElement: typeof GetElement;
    export const getMinElement: typeof GetElement;
    export const getMedianElement: typeof GetElement;
    export const getAverageValue: typeof GetElement;
}
