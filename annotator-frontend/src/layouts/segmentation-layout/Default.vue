<template>
  <v-app>
    <default-bar
      :title="'Medical Image Annotator'"
      :version="'v3.2.2'"
    > 
      <NavPanel />
      <template #theme>
        <v-btn
          color="secondary-font"
          class="px-5"
          density="compact"
          icon="mdi-theme-light-dark"
          @click="toggleTheme"
        ></v-btn>
      </template>
    </default-bar>

    <default-view />
    <ToastNotification />
  </v-app>
</template>

<script lang="ts" setup>
/**
 * Default Layout Component
 *
 * @description Root layout component for the Medical Image Annotator application.
 * Provides the main application shell including:
 * - Navigation drawer with NavPanel
 * - App bar with title, version, and theme toggle
 * - Main content area via DefaultView
 *
 * @emits Common:ToggleAppTheme - Emitted when user toggles between light/dark theme
 */
import DefaultBar from "../components/AppBar.vue";
import DefaultView from "./View.vue";
import NavPanel from "@/components/navigation/NavPanel.vue";
import ToastNotification from "@/components/common/ToastNotification.vue";
import { useTheme } from "vuetify";
import { ref } from "vue";
import emitter from "@/plugins/custom-emitter";;

/** Vuetify theme instance for controlling light/dark mode */
const theme = useTheme();



/**
 * Toggles the application theme between light and dark mode.
 * Updates the Vuetify global theme and emits an event for other components to react.
 *
 * @param value - Click event value (unused but required by v-btn)
 */
function toggleTheme(value: any) {
  // Toggle between light and dark theme based on current state
  theme.global.name.value = theme.global.current.value.dark
    ? "lightTheme"
    : "darkTheme";



  // Notify other components about theme change
  emitter.emit("Common:ToggleAppTheme", theme.global.name.value);
}
</script>

<style></style>
