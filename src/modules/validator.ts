import { ArrayValidationTuple, Type } from '../model/types';

export type ValidatorArgumentType = ({ new(): any } | string | ArrayValidationTuple);

export class Validator {
    static validateArguments(args: IArguments | Array<any>, types: ValidatorArgumentType[]): boolean {
        if (args.length !== types.length) {
            return false;
        }

        for (let i = 0; i < args.length; i += 1) {
            const arg = args[i];
            if (typeof types[i] === Type.function) {
                const constructor = types[i] as { new(): any };
                if (!Validator.validateObject(arg, constructor)) {
                    return false;
                }
            } else if (typeof types[i] === Type.object) {
                const validationTuple = types[i] as ArrayValidationTuple;
                if (!Validator.validateArray(arg, validationTuple[1])) {
                    return false;
                }
            } else {
                if (typeof arg !== types[i]) {
                    return false;
                }
            }
        }
        return true;
    }

    static getConstructorName(construct: { new(): any }): string {
        const funcNameRegex = /function (.{1,})\(/;
        const results = (funcNameRegex).exec(construct.toString());
        return (results && results.length > 1) ? results[1] : '';
    }

    static validateObject<T>(object: T | any, typeConstructor: { new(): T }): boolean {
        const t = new typeConstructor();
        let isValid = true;
        if (typeof object !== Type.object) {
            return false;
        }
        Object.keys(t).forEach(key => {
            if (t[key] !== null && typeof t[key] !== typeof object[key]) {
                isValid = false;
            }
        });
        return isValid;
    }

    static validateArray<T>(array: Array<T> | any, ofType: string | { new(): any }): boolean {
        if (!Array.isArray(array)) {
            return false;
        }
        if (array.length > 0) {
            for (let i = 0; i < array.length; i++) {
                const el = array[i];
                if (typeof ofType === Type.string) {
                    console.log(el);
                    if (!Validator.validateStringType(el, ofType as string)) {
                        return false;
                    }
                } else if (typeof ofType === Type.function) {
                    console.log(el);
                    if (!Validator.validateObject(el, ofType as {new (): any})) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    static validateStringType(val: any, type: string): boolean {
        return typeof val === type;
    }
}