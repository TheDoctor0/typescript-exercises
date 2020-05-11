declare module 'str-utils' {
    function ConvertString(value: string): string;

    export const strReverse: typeof ConvertString;
    export const strToLower: typeof ConvertString;
    export const strToUpper: typeof ConvertString;
    export const strRandomize: typeof ConvertString;
    export const strInvertCase: typeof ConvertString;
}
