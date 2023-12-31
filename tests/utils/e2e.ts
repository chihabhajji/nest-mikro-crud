import {AnyEntity, EntityName, MikroORM} from "@mikro-orm/core";
import {MikroOrmModule} from "@mikro-orm/nestjs";
import {ModuleMetadata} from "@nestjs/common";
import {Test} from "@nestjs/testing";
import supertest from "supertest";
import {Book, Line, Page, Summary} from "tests/e2e/entities";
import {defineConfig} from "@mikro-orm/sqlite";

export async function prepareE2E(
  metadata: ModuleMetadata,
  entities: EntityName<AnyEntity>[] = [],
  debug?: boolean
) {
  entities.push(Book, Page, Summary, Line);

  const module = await Test.createTestingModule({
    ...metadata,
    imports: [
      MikroOrmModule.forRoot(defineConfig({
        dbName: ":memory:",
        allowGlobalContext: true,
        entities,
        debug,
      })),
      MikroOrmModule.forFeature(entities),
      ...(metadata.imports ?? []),
    ],
  }).compile();

  const schemaGenerator = module.get(MikroORM).getSchemaGenerator();
  await schemaGenerator.createSchema();

  const app = await module.createNestApplication().init();
  const requester = supertest(app.getHttpServer());
  return { module, app, requester };
}
