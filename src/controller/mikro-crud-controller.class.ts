// noinspection JSUnusedGlobalSymbols,DuplicatedCode

import {AnyEntity, EntityData} from "@mikro-orm/core";
import {QueryParams} from "../dto";
import {MikroCrudService} from "../service";
import {LookupableField} from "../types";
import {validate, validateOrReject} from "class-validator";
import {BadRequestException} from "@nestjs/common";

export abstract class MikroCrudController<
    Entity extends AnyEntity<Entity> = AnyEntity,
    CreateDto extends EntityData<Entity> = EntityData<Entity>,
    UpdateDto extends EntityData<Entity> = EntityData<Entity>,
    LookupField extends LookupableField<Entity> = LookupableField<Entity>,
    Service extends MikroCrudService<
        Entity,
        CreateDto,
        UpdateDto
    > = MikroCrudService<Entity, CreateDto, UpdateDto>
> {
    readonly service!: Service;
    readonly lookupField!: LookupField;

    async list(
        {limit, offset, order, filter, expand}: QueryParams<Entity>,
        user: any
    ): Promise<unknown> {
        const {total, results} = await this.service.list({
            limit,
            offset,
            order,
            filter,
            expand,
            user,
        });
        await Promise.all(
            results.map(
                async (entity) =>
                    await this.service.adjustPopulationStatus({entity, expand})
            )
        );
        await this.service.save();
        return {total, results};
    }

    async create(
        {expand}: QueryParams<Entity>,
        data: CreateDto,
        user: any
    ): Promise<unknown> {
        let entity = await this.service.create({data, user});
        await this.service.save();
        entity = await this.service.retrieve({
            conditions: this.getPrimaryKey(entity),
            expand,
            refresh: true,
            user,
        });
        await this.service.adjustPopulationStatus({entity, expand});
        await this.service.save();
        return entity;
    }

    async retrieve(
        lookup: Entity[LookupField],
        {expand}: QueryParams<Entity>,
        user: any
    ): Promise<unknown> {
        console.dir({lookup, field: this.lookupField})
        const entity = await this.service
            .retrieve({
                // @ts-ignore
                conditions: {
                    [this.lookupField]: lookup,
                },
                expand,
                user,
            });
        await this.service.adjustPopulationStatus({entity, expand});
        await this.service.save();
        return entity;
    }

    async replace(
        lookup: Entity[LookupField],
        {expand}: QueryParams<Entity>,
        data: CreateDto,
        user: any
    ): Promise<unknown> {
        let entity = await this.service
            .retrieve({
                // @ts-ignore
                conditions: {
                    [this.lookupField]: lookup
                },
                expand,
                user,
            });
        await this.service.replace({entity, data, user});
        await this.service.save();
        entity = await this.service.retrieve({
            conditions: this.getPrimaryKey(entity),
            expand,
            refresh: true,
            user,
        });
        await this.service.adjustPopulationStatus({entity, expand});
        await this.service.save();
        return entity;
    }

    async update(
        lookup: Entity[LookupField],
        {expand}: QueryParams<Entity>,
        data: UpdateDto,
        user: any
    ): Promise<Entity> {
        let entity = await this.service
            .retrieve({
                // @ts-ignore
                conditions: {
                    [this.lookupField]: lookup
                },
                expand,
                user,
            })
        const errors = await validate(data);
        if(errors.length > 0) {
            throw new BadRequestException({
                message: 'Validation failed',
                errors,
            })
        }
        await this.service.update({entity, data, user});
        await this.service.save();
        entity = await this.service.retrieve({
            conditions: this.getPrimaryKey(entity),
            expand,
            refresh: true,
            user,
        });
        await this.service.adjustPopulationStatus({entity, expand});
        await this.service.save();
        return entity;
    }

    async destroy(lookup: Entity[LookupField], user: any): Promise<unknown> {
        const entity = await this.service
            .retrieve({
                // @ts-ignore
                conditions: {
                    [this.lookupField]: lookup
                },
                user
            })

        await this.service.destroy({entity, user});
        await this.service.save();
        return;
    }

    private getPrimaryKey(entity: AnyEntity) {
        const pkField = entity.__helper!.__meta.primaryKeys[0];
        return {[pkField]: entity[pkField]};
    }
}
