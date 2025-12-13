/**
 * Type declarations for vcf module
 * Custom types to avoid conflicts with @types/vcf
 */

declare module 'vcf' {
  interface PropertyLike {
    valueOf(): string;
    value?: string;
    type?: string;
    params?: Record<string, any>;
    _data?: string;
    [key: string]: any;
  }

  class Property implements PropertyLike {
    valueOf(): string;
    value?: string;
    type?: string;
    params?: Record<string, any>;
    _data?: string;
    [key: string]: any;
  }

  class VCard {
    version: string;
    data: Record<string, any>;

    get(key: string): Property | Property[] | undefined;
    set(key: string, value: string | Property, params?: Record<string, any>): VCard;
    toString(version?: string): string;
    toJSON(): any;

    static parse(vcfString: string): VCard | VCard[];
    static fromJSON(json: any): VCard;
  }

  export = VCard;
}
