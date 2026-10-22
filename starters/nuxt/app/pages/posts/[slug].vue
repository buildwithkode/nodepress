<script setup lang="ts">
import { formatDate } from '#shared/post';

const route = useRoute();
const slug = String(route.params.slug);
const { data: post, error } = await useFetch(`/api/posts/${encodeURIComponent(slug)}`);
if (error.value) {
  throw createError({ statusCode: error.value.statusCode ?? 500, statusMessage: error.value.statusMessage, fatal: true });
}

useSeoMeta({
  title: () => post.value?.seo?.title || post.value?.title,
  description: () => post.value?.seo?.description || post.value?.excerpt,
});
const date = computed(() => formatDate(post.value?.date));
</script>

<template>
  <article v-if="post" class="post">
    <h1 data-np-field="title">{{ post.title }}</h1>
    <p v-if="post.author || date" class="meta">
      <span v-if="post.author" data-np-field="author">{{ post.author }}</span>
      <template v-if="post.author && date"> · </template>
      <time v-if="date" :datetime="post.date">{{ date }}</time>
    </p>
    <img v-if="post.coverUrl" class="cover" :src="post.coverUrl" alt="" data-np-field="cover" />
    <p v-if="post.excerpt" class="excerpt" data-np-field="excerpt">{{ post.excerpt }}</p>
    <!-- bodyHtml was sanitized on the server (server/utils/sanitize.ts). -->
    <div class="body" data-np-field="body" v-html="post.bodyHtml" />
  </article>
  <p><NuxtLink to="/">← All posts</NuxtLink></p>
</template>
