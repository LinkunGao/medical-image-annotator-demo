<template>
  <div class="main-page-wrapper">
    <LayoutTwoPanels ref="layoutTwoPanelsRef">
      <template #left>
        <LeftPanel :panel-width="layoutTwoPanelsRef?.leftPanelWidth" :panel-percent="layoutTwoPanelsRef?.percent"/>
      </template>
      <template #right>
        <RightPanel :panel-width="layoutTwoPanelsRef?.rightPanelWidth" :panel-percent="100 - layoutTwoPanelsRef?.percent"/>
      </template>
    </LayoutTwoPanels>

    <!-- Backend health check modal -->
    <ConnectionModal :show="!backendReady" :attemptCount="attemptCount" />
  </div>
</template>

<script setup lang="ts">
import { ref, onBeforeMount, onUnmounted } from "vue";
import LayoutTwoPanels from "@/components/viewer/LayoutTwoPanels.vue";
import LeftPanel from "./LeftPanelController.vue";
import RightPanel from "./RightPanelController.vue";
import ConnectionModal from "@/components/common/ConnectionModal.vue";
import { useToolConfig, checkHealth } from "@/plugins/api/index";
// need to remove this after testing
import toolConfig from "@/assets/tool_config.json";
import { useAppConfig } from "@/plugins/hooks/config";
import { useSegmentationCasesStore } from "@/store/app";

const { setPluginReady } = useSegmentationCasesStore();
const layoutTwoPanelsRef = ref<InstanceType<typeof LayoutTwoPanels>>();
// need to remove this after testing
localStorage.setItem("app_config", JSON.stringify(toolConfig));

const { config } = useAppConfig();

const backendReady = ref(false);
const attemptCount = ref(0);
let pollTimer: ReturnType<typeof setInterval> | null = null;

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function runToolConfig() {
  if (!config) return;
  useToolConfig(config).then((res) => {
    if (res.status === "success") {
      setPluginReady();
    }
  }).catch((err) => {
    console.log(err);
  });
}

async function pollHealth() {
  attemptCount.value += 1;
  try {
    const res = await checkHealth();
    if (res.status === "ok") {
      stopPolling();
      backendReady.value = true;
      runToolConfig();
    }
  } catch {
    // backend not ready yet, keep polling
  }
}

onBeforeMount(() => {
  pollTimer = setInterval(pollHealth, 2000);
  pollHealth();
});

onUnmounted(() => {
  stopPolling();
});
</script>

<style scoped>
.main-page-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}
</style>
