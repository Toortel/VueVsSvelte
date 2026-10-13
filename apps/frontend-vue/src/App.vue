<!--
  App.vue – root component.
  In Svelte this is +layout.svelte which wraps all pages automatically.
-->
<template>
  <AppLayout>
    <RouterView />
  </AppLayout>
</template>

<script setup lang="ts">
import { RouterView } from "vue-router";
import AppLayout from "./components/AppLayout.vue";
</script>
