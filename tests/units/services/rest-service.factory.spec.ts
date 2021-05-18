import { InjectRepository } from "@nestjs/typeorm";
import {
  Resolved,
  RestService,
  RestServiceFactory,
  REST_SERVICE_OPTIONS_METADATA_KEY,
} from "src";
import { CreateParentEntityDto, UpdateParentEntityDto } from "tests/dtos";
import { ParentEntity } from "tests/entities";
import { buildKeyChecker, m } from "tests/utils";
import { Repository } from "typeorm";

jest.mock("@nestjs/typeorm", () => ({
  ...jest.requireActual("@nestjs/typeorm"),
  InjectRepository: jest.fn().mockReturnValue(jest.fn()),
}));

describe(RestServiceFactory.name, () => {
  const d = buildKeyChecker<RestServiceFactory>();

  let factory: RestServiceFactory<
    ParentEntity,
    CreateParentEntityDto,
    UpdateParentEntityDto,
    "id"
  >;

  beforeEach(() => {
    factory = new RestServiceFactory({
      entityClass: ParentEntity,
      repoConnection: "test",
      dtoClasses: {
        create: CreateParentEntityDto,
        update: UpdateParentEntityDto,
      },
      lookupField: "id",
    });
  });

  describe(d(".product"), () => {
    const d = buildKeyChecker<RestService>();

    let repository: Repository<ParentEntity>;
    let service: RestService<
      ParentEntity,
      CreateParentEntityDto,
      UpdateParentEntityDto,
      "id"
    >;
    let entity: ParentEntity;

    beforeEach(() => {
      repository = new Repository();
      service = new factory.product();
      // @ts-expect-error - manual injection
      service.repository = repository;
      entity = {
        id: 1,
        name: "parent",
        child1: { id: 1, name: "child1", parent: entity },
        child2: { id: 2, name: "child2", parent: entity },
      };
    });

    describe(d(".transform()"), () => {
      let ret: Resolved<ReturnType<typeof service.transform>>;

      beforeEach(async () => {
        ret = await service.transform({ entity });
      });

      it("should return the transformed entity", async () => {
        const { id, child1, child2 } = entity;
        const transformed = { id, child1, child2 };
        expect(ret).toBeInstanceOf(ParentEntity);
        expect(ret).toEqual(transformed);
      });
    });

    describe.each`
      lookup       | expected
      ${undefined} | ${{}}
      ${0}         | ${{ id: 0 }}
    `(d(".getQueryConditions({ lookup: $lookup })"), ({ lookup, expected }) => {
      let ret: Resolved<ReturnType<RestService["getQueryConditions"]>>;

      beforeEach(async () => {
        ret = await service.getQueryConditions({ lookup });
      });

      it(`should return ${expected}`, async () => {
        expect(ret).toEqual(expected);
      });
    });

    describe.each`
      expand   | all                | expected
      ${["1"]} | ${["1", "2", "3"]} | ${[["1"], ["2", "3"]]}
    `(
      d(".parseFieldExpansions({ expand: $expand }) all:$all"),
      ({ expand, all, expected }) => {
        let ret: Resolved<ReturnType<RestService["parseFieldExpansions"]>>;

        beforeEach(async () => {
          // @ts-expect-error - mock data
          repository.metadata = {
            relations: all.map((v: string) => ({ propertyPath: v })),
          } as any;
          ret = await service.parseFieldExpansions({ expand });
        });

        it(`should return relations: [${expected[0]}] and relaiton ids: [${expected[1]}]`, () => {
          expect(ret.relations).toEqual(expected[0]);
          expect(ret.loadRelationIds).toEqual({ relations: expected[1] });
        });
      }
    );

    describe.each`
      order             | expected
      ${["field:asc"]}  | ${{ field: "ASC" }}
      ${["field:desc"]} | ${{ field: "DESC" }}
    `(d(".parseOrders({ order: $order })"), ({ order, expected }) => {
      let ret: Resolved<ReturnType<RestService["parseOrders"]>>;

      beforeEach(async () => {
        ret = await service.parseOrders({ order });
      });

      it(`should return ${expected}`, () => {
        expect(ret).toEqual(expected);
      });
    });
  });

  it("should define the options as metadata on the product", () => {
    const metadata = Reflect.getMetadata(
      REST_SERVICE_OPTIONS_METADATA_KEY,
      factory.product
    );
    expect(metadata).toBeDefined();
    expect(metadata).toBeInstanceOf(Object);
  });

  it("should apply dependency injection of the repository", () => {
    expect(InjectRepository).toHaveBeenCalledWith(ParentEntity, "test");
    const decorator = m(InjectRepository).mock.results[0].value;
    expect(decorator).toHaveBeenCalledWith(
      factory.product.prototype,
      "repository"
    );
  });
});
