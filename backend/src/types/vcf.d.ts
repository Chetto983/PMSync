declare module 'vcf' {
  class vCard {
    constructor();
    toString(): string;
    get(key: string): any;
    set(key: string, value: any): void;
    [key: string]: any;
  }

  namespace vCard {
    function parse(vcard: string): vCard;
  }

  export = vCard;
}
