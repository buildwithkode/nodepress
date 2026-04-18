import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { WebhooksService } from '../../webhooks/webhooks.service';
import { WebhookModel, WebhookDeliveryModel } from '../models/webhook.model';
import { DeleteResult } from '../models/entry.model';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GqlJwtAuthGuard } from '../guards/gql-jwt-auth.guard';

@Resolver(() => WebhookModel)
export class WebhooksResolver {
  constructor(private readonly webhooksService: WebhooksService) {}

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Query(() => [WebhookModel], { name: 'webhooks', description: 'List all webhooks (admin only)' })
  findAll() {
    return this.webhooksService.findAll().then((r) => r.data);
  }

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Query(() => WebhookModel, { name: 'webhook', nullable: true, description: 'Get a webhook by ID (admin only)' })
  async findOne(@Args('id', { type: () => Int }) id: number) {
    try {
      return await this.webhooksService.findOne(id);
    } catch {
      return null;
    }
  }

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Query(() => [WebhookDeliveryModel], { name: 'webhookDeliveries', description: 'Delivery log for a webhook (admin only)' })
  deliveries(
    @Args('webhookId', { type: () => Int }) webhookId: number,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 }) limit: number,
  ) {
    return this.webhooksService.findDeliveries(webhookId, 1, limit).then((r) => r.data);
  }

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Mutation(() => DeleteResult, { name: 'deleteWebhook', description: 'Delete a webhook (admin only)' })
  deleteWebhook(@Args('id', { type: () => Int }) id: number) {
    return this.webhooksService.remove(id);
  }
}
