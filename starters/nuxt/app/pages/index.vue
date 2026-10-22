<script setup lang="ts">
import { formatDate } from '#shared/post';

const route = useRoute();
const cursor = computed(() => (typeof route.query.cursor === 'string' ? route.query.cursor : ''));
// Cursor paging: each page links to the next with meta.nextCursor.
const { data } = await useFetch('/api/posts', { query: { cursor } });
</script>

<template>
  <div v-if="data?.error" class="notice">
    <h1>Couldn't load posts</h1>
    <p>Is NodePress running, with the content type set in <code>NODEPRESS_TYPE</code>?</p>
    <p class="muted">{{ data.error }}</p>
  </div>
  <template v-else>
    <h1>Latest posts</h1>
    <p v-if="!data?.posts.length" class="muted">No published posts yet.</p>
    <ul class="post-list">
      <li v-for="post in data?.posts" :key="post.slug">
        <NuxtLink :to="`/posts/${post.slug}`" class="card">
          <img v-if="post.coverUrl" :src="post.coverUrl" alt="" loading="lazy" />
          <div>
            <h2>{{ post.title }}</h2>
            <p class="meta">{{ [post.author, formatDate(post.date)].filter(Boolean).join(' · ') }}</p>
            <p v-if="post.excerpt">{{ post.excerpt }}</p>
          </div>
        </NuxtLink>
      </li>
    </ul>
    <nav class="pager">
      <NuxtLink v-if="cursor" to="/">← Newest</NuxtLink>
      <span v-else />
      <NuxtLink v-if="data?.nextCursor" :to="{ path: '/', query: { cursor: data.nextCursor } }">Older posts →</NuxtLink>
    </nav>
  </template>
</template>
