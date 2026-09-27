<script setup lang="ts">
import PnwSidebarBlock from "phoenix-wing/layout/PnwSidebarBlock.vue";

defineProps<{ title: string }>();
</script>

<template>
  <PnwSidebarBlock class="pnh-main-block" :title="title" variant="card" :collapsible="false">
    <template v-if="$slots.suffix" #suffix><slot name="suffix" /></template>
    <template v-if="$slots.actions" #actions><slot name="actions" /></template>
    <slot />
  </PnwSidebarBlock>
</template>

<style scoped>
/* Flow content must not inherit the full-height sidebar sizing. */
.pnh-main-block { height: auto; min-width: 0; flex: 0 0 auto; margin: 0; }
</style>
