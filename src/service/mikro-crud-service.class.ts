import {
    AnyEntity,
    Collection, EntityProperty,
    EntityRepository,
    FilterQuery,
    NotFoundError,
    Ref,
    Reference,
    ValidationError,
    wrap,
} from "@mikro-orm/core";
import {EntityData} from "@mikro-orm/core/typings";
import {BadRequestException, Inject, NotFoundException} from "@nestjs/common";
import {FilterQueryParam, OrderQueryParam, RelationPath} from "..";
import {ENTITY_FILTERS, EntityFilters, QueryParser} from "../providers";
import NonFunctionPropertyNames = jest.NonFunctionPropertyNames;

export abstract class MikroCrudService<
    Entity extends AnyEntity = AnyEntity,
    CreateDto extends EntityData<Entity> = EntityData<Entity>,
    UpdateDto extends EntityData<Entity> = EntityData<Entity>
> {
    readonly repository!: EntityRepository<Entity>;
    readonly collectionFields!: NonFunctionPropertyNames<Entity>[];

    @Inject()
    protected readonly parser!: QueryParser<Entity>;

    @Inject(ENTITY_FILTERS)
    protected readonly filters!: EntityFilters;

    async list({
                   conditions = {},
                   limit,
                   offset,
                   order = [],
                   filter = [],
                   expand = [],
                   refresh,
                   user,
               }: {
        conditions?: FilterQuery<Entity>;
        limit?: number;
        offset?: number;
        order?: OrderQueryParam<Entity>[];
        filter?: FilterQueryParam<Entity>[];
        expand?: RelationPath<Entity>[];
        refresh?: boolean;
        user?: any;
    }) {
        const filterConditions = await this.parser.parseFilter({filter});
        const [results, total] = await this.repository.findAndCount(
            {$and: [conditions, filterConditions]} as FilterQuery<Entity>,
            {
                limit,
                offset,
                orderBy: await this.parser.parseOrder({order}),
                filters: this.filters(user),
                populate: [...this.collectionFields, ...expand] as any,
                refresh,
            }
        );
        return {total, results};
    }

    async create({data}: { data: CreateDto; user?: any }): Promise<Entity> {
        const entity = this.repository.create(data as any);
        this.repository.getEntityManager().persist(entity);
        return entity;
    }

    async retrieve({
                       conditions = {},
                       expand = [],
                       refresh,
                       user,
                   }: {
        conditions: FilterQuery<Entity>;
        expand?: RelationPath<Entity>[];
        refresh?: boolean;
        user?: any;
    }): Promise<Entity> {
        return await this.repository.findOneOrFail(conditions, {
            filters: this.filters(user),
            populate: [...this.collectionFields, ...expand] as any,
            failHandler: (entityName, where) => new NotFoundException(`${entityName} not found with ${JSON.stringify(where)}`),
            refresh,
        });
    }

    async replace({
                      entity,
                      data,
                  }: {
        entity: Entity;
        data: CreateDto;
        user?: any;
    }): Promise<Entity> {
        try {
            return wrap(entity).assign(data, {merge: true});
        } catch (e) {
            if (e instanceof ValidationError) {
                throw new BadRequestException(e.message)
            } else if (e instanceof NotFoundError) {
                throw new NotFoundException(e.message);
            } else {
                throw e;

            }
        }
    }

    async update({
                     entity,
                     data,
                 }: {
        entity: Entity;
        data: UpdateDto;
        user?: any;
    }): Promise<Entity> {
        try {
            return wrap(entity).assign(data, {merge: true});
        } catch (e) {
            console.log(typeof e)
            if (e instanceof ValidationError) {
                throw new BadRequestException(e.message)
            } else if (e instanceof NotFoundError) {
                throw new NotFoundException(e.message);
            } else {
                throw e;
            }
        }
    }

    async destroy({entity}: { entity: Entity; user?: any }): Promise<Entity> {
        this.repository.getEntityManager().remove(entity);
        return entity;
    }

    // noinspection JSUnusedGlobalSymbols
    async exists({
                     conditions,
                     user,
                 }: {
        conditions: FilterQuery<Entity>;
        user?: any;
    }): Promise<boolean> {
        try {
            await this.retrieve({conditions, user});
            return true;
        } catch (error) {
            if (error instanceof NotFoundError) return false;
            else throw error;
        }
    }

    async save(): Promise<void> {
        try {
            await this.repository.getEntityManager().flush();
        } catch (e) {
            if (e instanceof ValidationError) {
                throw new BadRequestException(e.message)
            } else if (e instanceof NotFoundError) {
                throw new NotFoundException(e.message);
            } else {
                throw e;

            }
        }
    }

    /**
     * Mark only the specified relations as populated to shape the JSON response.
     * @param args
     */
    async adjustPopulationStatus({
                                     entity: rootEntity,
                                     expand = [],
                                 }: {
        entity: Entity;
        expand?: RelationPath<Entity>[];
    }): Promise<Entity> {
        function digIn(entity: AnyEntity, relationNode?: RelationPath<Entity>) {
            const entityMeta = entity.__helper!.__meta;
            entityMeta.relations.forEach(({name}: EntityProperty<Entity>) => {
                const value = entity[name];
                const relationPath = (
                    relationNode ? `${relationNode}.${name}` : name
                ) as RelationPath<Entity>;
                const shouldPopulate = expand.some((path) =>
                    path.startsWith(relationPath)
                );

                // It is possible for a collection/reference/entity which need to be marked as populated to appear
                // multiple times in different places in part of which they need to be marked as unpopulated, so it
                // is neccesary to call `.populated(true)` to ensure they are not be marked as unpopulated in deeper
                // places unexpectedly.
                if (value instanceof Collection) {
                    const collection: Collection<AnyEntity> = value;
                    if (!shouldPopulate) {
                        collection.populated(false);
                    } else {
                        for (const entity of collection) digIn(entity, relationPath);
                        collection.populated(true);
                    }
                } else if (value instanceof Reference) {
                    const reference: Ref<AnyEntity> = value;
                    if (!shouldPopulate) {
                        reference.populated(false);
                    } else {
                        digIn(reference.getEntity(), relationPath);
                        reference.populated(true);
                    }
                } else {
                    const entity: AnyEntity<unknown> = value;
                    const wrappedEntity = wrap(entity);
                    if (!shouldPopulate) {
                        wrappedEntity.populated(false);
                    } else {
                        digIn(entity, relationPath);
                        wrappedEntity.populated(true);
                    }
                }
            });
            return entity;
        }

        return digIn(rootEntity) as typeof rootEntity;
    }
}
