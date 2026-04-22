<template>
    <v-list-group value="RightPanelCtl">
      <template v-slot:activator="{ props }">
        <v-list-item
          v-bind="props"
          color="primary"
          prepend-icon="mdi-video-3d"
          title="Right Panel Controller"
        ></v-list-item>
      </template>
  
      <RightPanelCtl />
    </v-list-group>
  </template>
  
  <script setup lang="ts">
/**
 * Right Panel Navigation Component
 *
 * @description Collapsible navigation group for right panel (3D view) controls.
 * Contains RightPanelCtl for managing 3D model visibility and other settings.
 */
import RightPanelCtl from "@/components/segmentation/RightPanelCtl.vue";

</script>
  
  <style scoped></style>
  