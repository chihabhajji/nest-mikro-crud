import { DynamicModule, Module } from "@nestjs/common";
import { MikroCrudModuleOptions } from "./mikro-crud-module-options.interface";
import { ENTITY_FILTERS, QueryParser } from "./providers";

@Module({
  providers: [
    QueryParser,
    { provide: ENTITY_FILTERS, useValue: (user: any) => ({ crud: { user } }) },
  ],
  exports: [QueryParser, ENTITY_FILTERS],
})
export class MikroCrudModule {
  // noinspection JSUnusedGlobalSymbols
  static configure({ filters }: MikroCrudModuleOptions): DynamicModule {
    return {
      module: this,
      providers: [
        QueryParser,
        {
          provide: ENTITY_FILTERS,
          useValue: filters,
        },
      ],
      exports: [QueryParser, ENTITY_FILTERS],
    };
  }
}
