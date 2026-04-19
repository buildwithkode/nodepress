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

  // ─── Queries ─────────────────────────────────────────────────────────────────

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Query(() => [WebhookModel], { name: 'webhooks', description: 'List all webhooks. Admin only.' })
  findAll() {
    return this.webhooksService.findAll().then((r) => r.data);
  }

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Query(() => WebhookModel, { name: 'webhook', nullable: true, description: 'Get a webhook by ID. Admin only.' })
  async findOne(@Args('id', { type: () => Int }) id: number) {
    try {
      return await this.webhooksService.findOne(id);
    } catch {
      return null;
    }
  }

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Query(() => [WebhookDeliveryModel], { name: 'webhookDeliveries', description: 'Delivery log for a webhook. Admin only.' })
  deliveries(
    @Args('webhookId', { type: () => Int }) webhookId: number,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 50 }) limit: number,
  ) {
    return this.webhooksService.findDeliveries(webhookId, 1, limit).then((r) => r.data);
  }

  // ─── Mutations ────────────────────────────────────────────────────────────────

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Mutation(() => WebhookModel, { name: 'createWebhook', description: 'Create a new webhook. Admin only.' })
  createWebhook(
    @Args('name') name: string,
    @Args('url') url: string,
    @Args('events', { type: () => [String], description: 'Event names, e.g. ["entry.created"] or ["*"]' }) events: string[],
    @Args('secret', { nullable: true, description: 'HMAC signing secret' }) secret?: string,
    @Args('enabled', { nullable: true, defaultValue: true }) enabled?: boolean,
  ) {
    return this.webhooksService.create({ name, url, events, secret, enabled });
  }

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Mutation(() => WebhookModel, { name: 'toggleWebhook', description: 'Enable or disable a webhook. Admin only.' })
  toggleWebhook(
    @Args('id', { type: () => Int }) id: number,
    @Args('enabled') enabled: boolean,
  ) {
    return this.webhooksService.toggle(id, enabled);
  }

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Mutation(() => DeleteResult, { name: 'pingWebhook', description: 'Send a test ping to a webhook. Admin only.' })
  async pingWebhook(@Args('id', { type: () => Int }) id: number) {
    await this.webhooksService.ping(id);
    return { message: `Ping sent to webhook #${id}` };
  }

  @UseGuards(GqlJwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Mutation(() => DeleteResult, { name: 'deleteWebhook', description: 'Delete a webhook. Admin only.' })
  deleteWebhook(@Args('id', { type: () => Int }) id: number) {
    return this.webhooksService.remove(id);
  }
}
