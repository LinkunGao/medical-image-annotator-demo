# Copper Import Switch

Files where `import * as Copper from "copper3d"` is commented out and `import * as Copper from "@/ts/index"` is active.

## Components

- `src/components/viewer/LeftPanelCore.vue`
- `src/components/viewer/RightPanelCore.vue`
- `src/components/viewer/utils.ts`
- `src/components/navigation/NavPanel.vue`
- `src/components/segmentation/SysOptsCtl.vue`
- `src/components/segmentation/LayerChannelSelector.vue`

## Views

- `src/views/LeftPanelController.vue`
- `src/views/RightPanelController.vue`

## Composables

- `src/composables/right-panel/useWebSocketSync.ts`
- `src/composables/right-panel/useRightPanelModels.ts`
- `src/composables/left-panel/useLayerChannel.ts`
- `src/composables/left-panel/useSliceNavigation.ts`
- `src/composables/left-panel/useDistanceCalculation.ts`
- `src/composables/left-panel/useMaskOperations.ts`
- `src/composables/left-panel/useCaseManagement.ts`
- `src/composables/left-panel/useDebugGui.ts`

## Models

- `src/models/ui.ts`
- `src/models/segmentation.ts`

## Plugins

- `src/plugins/worker.ts`
- `src/plugins/view-utils/utils-right.ts`
